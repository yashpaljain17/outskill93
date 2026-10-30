// Run: node n8n/match-slots.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { matchSlots, planSearch } = createRequire(import.meta.url)("./match-slots.js");

// Friday 30 Oct 2026, 08:00 IST (31 Oct is a Saturday, 1 Nov a Sunday)
const NOW = "2026-10-30T02:30:00.000Z";
const ist = (day, hhmm) => new Date(`2026-${day}T${hhmm}:00+05:30`).toISOString();
const slot = (day, hhmm, doctor = "d1") => ({
  doctor_id: doctor,
  doctor_name: doctor === "d1" ? "Dr. A" : "Dr. B",
  starts_at: ist(day, hhmm),
  ends_at: new Date(Date.parse(ist(day, hhmm)) + 1800000).toISOString(),
});
const clinic = (id, slots) => ({ clinic_id: id, clinic_name: `Clinic ${id}`, address: null, reserve_url: `https://x/${id}`, slots });
const request = (window) => ({ timezone: "Asia/Kolkata", duration_minutes: 30, buffer_minutes: 15, window });

// 1. Morning tomorrow, clinic has a morning slot, calendar free -> book it.
{
  const req = request({ from: ist("10-31", "00:00"), to: ist("10-31", "23:59"), time_of_day: "morning" });
  const r = matchSlots(req, [], [clinic("a", [slot("10-31", "09:30"), slot("10-31", "15:00")])], NOW);
  assert.equal(r.decision, "book");
  assert.equal(r.slot.starts_at, ist("10-31", "09:30"));
}

// 2. Calendar busy 09:00-10:30 (buffer makes 10:30 slot too tight) -> next fitting morning slot 11:00.
{
  const req = request({ from: ist("10-31", "00:00"), to: ist("10-31", "23:59"), time_of_day: "morning" });
  const busy = [{ start: ist("10-31", "09:00"), end: ist("10-31", "10:30") }];
  const r = matchSlots(req, busy, [clinic("a", [slot("10-31", "09:30"), slot("10-31", "10:30"), slot("10-31", "11:00")])], NOW);
  assert.equal(r.decision, "book");
  assert.equal(r.slot.starts_at, ist("10-31", "11:00"));
}

// 3. Clinic only works afternoons, owner asked for mornings -> 3 options on different days.
{
  const req = request({ from: ist("10-31", "00:00"), to: ist("11-02", "23:59"), time_of_day: "morning" });
  const slots = [slot("10-31", "14:00"), slot("10-31", "14:30"), slot("11-02", "15:00"), slot("11-03", "14:00")];
  const r = matchSlots(req, [], [clinic("k", slots)], NOW);
  assert.equal(r.decision, "options");
  assert.equal(r.options.length, 3);
  assert.deepEqual(r.options.map((o) => o.starts_at), [ist("10-31", "14:00"), ist("11-02", "15:00"), ist("11-03", "14:00")]);
  assert.ok(!("_order" in r.options[0]) && r.options[0].reserve_url === "https://x/k");
}

// 4. Sunday is outside bookable days, and the earlier clinic in the list wins ties.
{
  const req = request({ from: ist("11-01", "00:00"), to: ist("11-02", "23:59"), time_of_day: "any" });
  const r = matchSlots(req, [], [clinic("first", [slot("11-01", "10:00"), slot("11-02", "10:00")]), clinic("second", [slot("11-02", "10:00", "d2")])], NOW);
  assert.equal(r.decision, "book");
  assert.equal(r.slot.starts_at, ist("11-02", "10:00"));
  assert.equal(r.slot.clinic_id, "first");
}

// 5. Preferred time: within an hour books the closest; otherwise options sorted around it.
{
  const preferred = ist("10-31", "10:00");
  const req = request({ from: ist("10-30", "22:00"), to: ist("10-31", "22:00"), time_of_day: "any", preferred_at: preferred });
  const near = matchSlots(req, [], [clinic("a", [slot("10-31", "09:30"), slot("10-31", "10:30")])], NOW);
  assert.equal(near.decision, "book");
  const far = matchSlots(req, [], [clinic("a", [slot("10-31", "15:00"), slot("10-31", "17:00")])], NOW);
  assert.equal(far.decision, "options");
  assert.equal(far.options[0].starts_at, ist("10-31", "15:00"));
}

// 6. Nothing free at all -> none. Slots less than an hour away are skipped.
{
  const req = request({ from: NOW, to: ist("11-06", "23:59"), time_of_day: "any" });
  assert.equal(matchSlots(req, [], [clinic("a", [slot("10-30", "08:30")])], NOW).decision, "none");
  assert.equal(matchSlots(req, [], [], NOW).decision, "none");
}

// 7. Search range always covers at least a week from the window start.
{
  const plan = planSearch({ window: { from: ist("10-31", "00:00"), to: ist("10-31", "23:59") } }, NOW);
  assert.equal(plan.from, ist("10-31", "00:00"));
  assert.equal(Date.parse(plan.to) - Date.parse(plan.from), 7 * 86400000);
}

console.log("match-slots: all 7 scenarios pass");
