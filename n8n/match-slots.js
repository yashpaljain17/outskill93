// Slot matching for the PawPal booking workflow.
// These functions are embedded into the workflow's Code nodes by build-workflow.mjs,
// and tested locally with `node n8n/match-slots.test.mjs`. Keep them dependency-free.

const DAY_MS = 86400000;
const TIME_OF_DAY_RANGES = { morning: [480, 720], afternoon: [720, 1020], evening: [1020, 1260] };

/** Weekday (0 = Sunday) and minutes after midnight of an instant, in a time zone. */
function localParts(iso, tz) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return {
    dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
    minutes: Number(p.hour) * 60 + Number(p.minute),
    day: `${p.year}-${p.month}-${p.day}`,
  };
}

/** The range to search: the requested window, extended to a week so alternatives can be offered. */
function planSearch(req, nowIso) {
  const now = Date.parse(nowIso);
  const from = Math.max(now, Date.parse(req.window.from));
  const to = Math.max(Date.parse(req.window.to), from + 7 * DAY_MS);
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

/**
 * Overlaps the owner's busy calendar with the clinics' free doctor slots.
 * Returns { decision: "book", slot } when a slot fits the requested window,
 * { decision: "options", options } with up to 3 alternatives, or { decision: "none" }.
 */
function matchSlots(req, busy, clinics, nowIso) {
  const tz = req.timezone || "Asia/Kolkata";
  const duration = req.duration_minutes || 30;
  const buffer = req.buffer_minutes || 15;
  const hours = req.bookable_hours || { start: "09:00", end: "20:00", days: [1, 2, 3, 4, 5, 6] };
  const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const now = Date.parse(nowIso);
  const busyMs = (busy || []).map((b) => [Date.parse(b.start), Date.parse(b.end)]);

  const all = [];
  clinics.forEach((c, order) =>
    (c.slots || []).forEach((s) =>
      all.push({
        clinic_id: c.clinic_id,
        clinic_name: c.clinic_name,
        address: c.address ?? null,
        reserve_url: c.reserve_url,
        doctor_id: s.doctor_id,
        doctor_name: s.doctor_name,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        _order: order,
        _local: localParts(s.starts_at, tz),
      })
    )
  );

  // Slots inside the owner's bookable hours that don't clash with their calendar (with travel buffer).
  const free = all
    .filter((s) => {
      const start = Date.parse(s.starts_at);
      if (start < now + 3600000) return false;
      if (!hours.days.includes(s._local.dow)) return false;
      if (s._local.minutes < toMinutes(hours.start) || s._local.minutes + duration > toMinutes(hours.end)) return false;
      const from = start - buffer * 60000;
      const to = start + (duration + buffer) * 60000;
      return !busyMs.some(([bs, be]) => bs < to && be > from);
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a._order - b._order);

  const w = req.window || {};
  const windowFrom = Date.parse(w.from);
  const windowTo = Date.parse(w.to);
  const timeOfDay = w.time_of_day || "any";
  const range = TIME_OF_DAY_RANGES[timeOfDay];
  const inTimeOfDay = (s) => !range || (s._local.minutes >= range[0] && s._local.minutes < range[1]);
  const preferred = w.preferred_at ? Date.parse(w.preferred_at) : null;
  const distance = (s) => Math.abs(Date.parse(s.starts_at) - preferred);
  const clean = ({ _order, _local, ...slot }) => slot;

  let matches = free.filter((s) => {
    const t = Date.parse(s.starts_at);
    return t >= windowFrom && t <= windowTo && inTimeOfDay(s);
  });
  if (preferred) matches = matches.filter((s) => distance(s) <= 3600000).sort((a, b) => distance(a) - distance(b));
  if (matches.length) return { decision: "book", slot: clean(matches[0]), options: [] };

  // Alternatives: closest to the preferred time if there was one, otherwise the requested time of
  // day first, then earliest. One per day while possible, so the owner gets real choices.
  const ranked = [...free].sort((a, b) =>
    preferred
      ? distance(a) - distance(b)
      : Number(inTimeOfDay(b)) - Number(inTimeOfDay(a)) || Date.parse(a.starts_at) - Date.parse(b.starts_at)
  );
  const options = [];
  const days = new Set();
  for (const s of ranked) {
    if (options.length === 3) break;
    if (days.has(s._local.day)) continue;
    days.add(s._local.day);
    options.push(s);
  }
  for (const s of ranked) {
    if (options.length === 3) break;
    if (!options.includes(s)) options.push(s);
  }
  options.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return options.length ? { decision: "options", slot: null, options: options.map(clean) } : { decision: "none", slot: null, options: [] };
}

if (typeof module !== "undefined") module.exports = { localParts, planSearch, matchSlots };
