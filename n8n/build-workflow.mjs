// Builds n8n/pawpal-booking.workflow.json from match-slots.js.
// Run: node n8n/build-workflow.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const library = readFileSync(join(here, "match-slots.js"), "utf8").replace(/\nif \(typeof module[^\n]*\n?$/, "\n");

// Credentials are matched by id on import; n8n asks you to pick one if the id isn't found.
const GOOGLE = { googleCalendarOAuth2Api: { id: "yOQWM5g6j363AGfT", name: "Google Calendar account" } };
const SECRET = { httpHeaderAuth: { id: "pawpalSecretHeader", name: "PawPal secret" } };

let n = 0;
const id = () => `7a1c0d2e-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({ parameters, id: id(), name, type, typeVersion, position, ...extra });

const webhook = (name, path, position) =>
  node(name, "n8n-nodes-base.webhook", 2, position, { httpMethod: "POST", path, authentication: "headerAuth", options: {} }, {
    webhookId: id(),
    credentials: SECRET,
  });

const code = (name, position, jsCode, mode = "runOnceForAllItems") =>
  node(name, "n8n-nodes-base.code", 2, position, { mode, jsCode });

const ifNode = (name, position, leftValue, operator, rightValue) =>
  node(name, "n8n-nodes-base.if", 2, position, {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [{ id: id(), leftValue, rightValue, operator }],
      combinator: "and",
    },
    options: {},
  });

/** POST JSON to PawPal with the shared secret header. */
const toPawPal = (name, position, url, body, options = {}) =>
  node(
    name,
    "n8n-nodes-base.httpRequest",
    4.2,
    position,
    {
      method: "POST",
      url,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify(${body}) }}`,
      options,
    },
    { credentials: SECRET }
  );

const REQ = `$('Booking request').first().json.body`;
const CONFIRM = `$('Booking to confirm').item.json`;

const nodes = [
  // ---- New booking request ------------------------------------------------
  webhook("Booking request", "pawpal-booking", [0, 0]),
  code(
    "Plan search",
    [220, 0],
    `${library}
const req = ${REQ};
const range = planSearch(req, new Date().toISOString());
const partner = (req.clinics || []).filter((c) => c.availability_url);
return [{ json: { ...range, partner_clinics: partner.length } }];`
  ),
  ifNode("Any partner clinic?", [440, 0], "={{ $json.partner_clinics }}", { type: "number", operation: "gt" }, 0),
  node(
    "Check my calendar",
    "n8n-nodes-base.httpRequest",
    4.2,
    [660, -100],
    {
      method: "POST",
      url: "https://www.googleapis.com/calendar/v3/freeBusy",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "googleCalendarOAuth2Api",
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify({ timeMin: $json.from, timeMax: $json.to, timeZone: ${REQ}.timezone, items: [{ id: ${REQ}.calendar_id }] }) }}`,
      options: {},
    },
    { credentials: GOOGLE }
  ),
  code(
    "Clinics to ask",
    [880, -100],
    `const req = ${REQ};
const plan = $('Plan search').first().json;
return (req.clinics || [])
  .filter((c) => c.availability_url)
  .map((c) => ({ json: { url: c.availability_url, clinic_id: c.clinic_id, from: plan.from, to: plan.to } }));`
  ),
  node(
    "Ask clinic for doctor slots",
    "n8n-nodes-base.httpRequest",
    4.2,
    [1100, -100],
    {
      url: "={{ $json.url }}",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: "from", value: "={{ $json.from }}" },
          { name: "to", value: "={{ $json.to }}" },
        ],
      },
      options: { response: { response: { neverError: true } } },
    },
    { credentials: SECRET }
  ),
  code(
    "Match slots",
    [1320, -100],
    `${library}
const req = ${REQ};
const calendar = $('Check my calendar').first().json;
const calendars = calendar.calendars || {};
const busy = (calendars[req.calendar_id] || Object.values(calendars)[0] || {}).busy || [];
const clinics = $input.all().map((i) => i.json).filter((j) => Array.isArray(j.slots));
const result = matchSlots(req, busy, clinics, new Date().toISOString());
return [{ json: { ...result, callback: req.callback, reason: req.reason, notes: req.notes, pet: req.pet, owner: req.owner, timezone: req.timezone, calendar_id: req.calendar_id, busy_count: busy.length, clinics_answered: clinics.length } }];`
  ),
  ifNode("Slot fits?", [1540, -100], "={{ $json.decision }}", { type: "string", operation: "equals" }, "book"),
  code(
    "Prepare booking",
    [1760, -200],
    `const m = $input.first().json;
return [{ json: { callback: m.callback, slot: m.slot, reason: m.reason, notes: m.notes, pet: m.pet, owner: m.owner, timezone: m.timezone, calendar_id: m.calendar_id } }];`
  ),
  ifNode("Any options?", [1760, 0], "={{ $json.decision }}", { type: "string", operation: "equals" }, "options"),
  toPawPal(
    "Offer options to owner",
    [1980, -40],
    "={{ $json.callback.url }}",
    `{ token: $json.callback.token, status: 'options', options: $json.options, note: 'Requested time not available' }`
  ),
  toPawPal(
    "No slots available",
    [1980, 120],
    "={{ $json.callback.url }}",
    `{ token: $json.callback.token, status: 'declined', note: 'No free slots in the next 7 days fit your calendar. Try a different week.' }`
  ),
  toPawPal(
    "Clinic not online",
    [660, 140],
    `={{ ${REQ}.callback.url }}`,
    `{ token: ${REQ}.callback.token, status: 'declined', note: (${REQ}.clinics?.[0]?.name || 'This clinic') + " doesn't take online bookings yet" + (${REQ}.clinics?.[0]?.phone ? '. Call ' + ${REQ}.clinics[0].phone : '') + '.' }`
  ),

  // ---- Owner picked one of the offered options ---------------------------
  webhook("Owner's choice", "pawpal-booking-choice", [1540, 340]),
  code(
    "Prepare choice",
    [1760, 340],
    `const b = $('Owner\\'s choice').first().json.body;
return [{ json: { callback: b.callback, slot: b.slot, reason: b.reason, notes: b.notes, pet: b.pet, owner: b.owner, timezone: b.timezone, calendar_id: b.calendar_id } }];`
  ),

  // ---- Shared: reserve, add to Google Calendar, confirm in PawPal --------
  node("Booking to confirm", "n8n-nodes-base.noOp", 1, [2000, -200], {}),
  toPawPal(
    "Reserve slot at clinic",
    [2220, -200],
    "={{ $json.slot.reserve_url }}",
    `{ token: $json.callback.token, doctor_id: $json.slot.doctor_id, starts_at: $json.slot.starts_at }`,
    { response: { response: { neverError: true, fullResponse: true } } }
  ),
  ifNode("Reserved?", [2440, -200], "={{ $json.statusCode }}", { type: "number", operation: "equals" }, 200),
  node(
    "Add to Google Calendar",
    "n8n-nodes-base.httpRequest",
    4.2,
    [2660, -300],
    {
      method: "POST",
      url: `={{ 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(${CONFIRM}.calendar_id || 'primary') + '/events' }}`,
      authentication: "predefinedCredentialType",
      nodeCredentialType: "googleCalendarOAuth2Api",
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ JSON.stringify({
  summary: '🐾 ' + (${CONFIRM}.pet?.name || 'Pet') + ': ' + ${CONFIRM}.reason,
  location: [${CONFIRM}.slot.clinic_name, ${CONFIRM}.slot.address].filter(Boolean).join(', '),
  description: 'With ' + ${CONFIRM}.slot.doctor_name + '. Booked by PawPal.' + (${CONFIRM}.notes ? '\\n\\nNotes: ' + ${CONFIRM}.notes : ''),
  start: { dateTime: ${CONFIRM}.slot.starts_at, timeZone: ${CONFIRM}.timezone },
  end: { dateTime: ${CONFIRM}.slot.ends_at, timeZone: ${CONFIRM}.timezone },
  reminders: { useDefault: true }
}) }}`,
      options: {},
    },
    { credentials: GOOGLE }
  ),
  toPawPal(
    "Confirm in PawPal",
    [2880, -300],
    `={{ ${CONFIRM}.callback.url }}`,
    `{ token: ${CONFIRM}.callback.token, status: 'confirmed', starts_at: ${CONFIRM}.slot.starts_at, location: [${CONFIRM}.slot.clinic_name, ${CONFIRM}.slot.address].filter(Boolean).join(', '), note: 'With ' + ${CONFIRM}.slot.doctor_name + '. Added to Google Calendar.' }`
  ),
  toPawPal(
    "Slot just taken",
    [2660, -100],
    `={{ ${CONFIRM}.callback.url }}`,
    `{ token: ${CONFIRM}.callback.token, status: 'declined', note: 'That slot was just taken by someone else. Ask PawPal to try again.' }`
  ),
];

const link = (to) => [{ node: to, type: "main", index: 0 }];
const connections = {
  "Booking request": { main: [link("Plan search")] },
  "Plan search": { main: [link("Any partner clinic?")] },
  "Any partner clinic?": { main: [link("Check my calendar"), link("Clinic not online")] },
  "Check my calendar": { main: [link("Clinics to ask")] },
  "Clinics to ask": { main: [link("Ask clinic for doctor slots")] },
  "Ask clinic for doctor slots": { main: [link("Match slots")] },
  "Match slots": { main: [link("Slot fits?")] },
  "Slot fits?": { main: [link("Prepare booking"), link("Any options?")] },
  "Any options?": { main: [link("Offer options to owner"), link("No slots available")] },
  "Prepare booking": { main: [link("Booking to confirm")] },
  "Owner's choice": { main: [link("Prepare choice")] },
  "Prepare choice": { main: [link("Booking to confirm")] },
  "Booking to confirm": { main: [link("Reserve slot at clinic")] },
  "Reserve slot at clinic": { main: [link("Reserved?")] },
  "Reserved?": { main: [link("Add to Google Calendar"), link("Slot just taken")] },
  "Add to Google Calendar": { main: [link("Confirm in PawPal")] },
};

const workflow = {
  name: "PawPal – vet booking",
  nodes,
  connections,
  settings: { executionOrder: "v1", timezone: "Asia/Kolkata" },
  pinData: {},
};

writeFileSync(join(here, "pawpal-booking.workflow.json"), JSON.stringify(workflow, null, 2) + "\n");
console.log(`Wrote n8n/pawpal-booking.workflow.json (${nodes.length} nodes)`);
