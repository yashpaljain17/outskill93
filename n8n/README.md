# Vet booking via n8n

Say (or type) to the PawPal assistant: *"Book Bruno's rabies vaccination at the Indiranagar clinic
tomorrow morning."* PawPal saves an "Awaiting clinic" appointment and starts the n8n workflow, which:

1. checks your **Google Calendar** for busy times,
2. asks each partner clinic for **free doctor slots** (`GET /api/clinics/{id}/availability`),
3. overlaps the two (bookable hours 09:00–20:00 Mon–Sat IST, 30-min visit, 15-min travel buffer),
4. **slot fits your window** → reserves it at the clinic, adds a Google Calendar event, confirms in PawPal,
5. **no fit** → sends PawPal up to 3 alternatives. The assistant reads them out ("Which one should I book?").
   Answer by voice ("the second one" / "no") or tap one on **Today**. Your pick goes to the
   `pawpal-booking-choice` webhook, which reserves it, adds the calendar event and confirms.

```
PawPal ──▶ pawpal-booking ──▶ Google Calendar freeBusy ──▶ clinic availability ──▶ match
                                                              │
               confirmed ◀── calendar event ◀── reserve ◀─────┤ fits
               options   ◀────────────────────────────────────┘ no fit
PawPal (owner picks) ──▶ pawpal-booking-choice ──▶ reserve ──▶ calendar event ──▶ confirmed
```

## Setup

1. Run `supabase/migrations/0004_clinic_schedules.sql` in the Supabase SQL editor
   (doctor schedules for the partner clinics, slot reservations, the "options" state).
2. In n8n, **Credentials → New → Header Auth**:
   - Name the credential **`PawPal secret`**
   - **Name** field: `X-PawPal-Secret`
   - **Value** field: the `N8N_WEBHOOK_SECRET` value from `.env.local` / Vercel
3. Open your workflow → **⋯ → Import from File** → `n8n/pawpal-booking.workflow.json`.
4. Open each node with a ⚠️ credential warning and pick **PawPal secret** (webhooks and calls to PawPal)
   or your **Google Calendar** credential (`Check my calendar`, `Add to Google Calendar`).
5. **Activate** the workflow (toggle at the top right).
6. In Vercel → Settings → Environment Variables, add
   `N8N_BOOKING_WEBHOOK_URL = https://yashpalvain.app.n8n.cloud/webhook/pawpal-booking`
   and redeploy. The choice webhook is derived automatically (`…/pawpal-booking-choice`);
   override with `N8N_CHOICE_WEBHOOK_URL` if you rename it.

n8n Cloud can't reach `localhost`, so test against the deployed site.
The `webhook-test/…` URL only works while you click **Listen for test event** in n8n.

## Demo clinics (fictional doctors, from migration 0004)

| Clinic | Doctors and hours (IST) | Good for demoing |
|---|---|---|
| PawPal Partner Vet · Indiranagar | Dr. Kavya Menon Mon–Sat 09–13, Dr. Sameer Khan Tue–Sat 10–17 | Morning requests → **auto-booked** |
| PawPal Partner Vet · Koramangala | Dr. Meera Rao Mon–Sat 14–20, Dr. Arjun Pillai Mon–Fri 15–20 | Morning requests → **options** |
| PawPal Partner Vet · Jayanagar | Dr. Neha Kulkarni daily 08–12, Dr. Vikram Shetty Mon/Wed/Fri 16–21 | Either |

## Request → `pawpal-booking` (header `X-PawPal-Secret`)

```json
{
  "type": "booking_request",
  "booking_id": "uuid",
  "callback": { "url": "https://outskill93.vercel.app/api/booking/callback", "token": "uuid" },
  "reason": "Rabies vaccination",
  "notes": null,
  "timezone": "Asia/Kolkata",
  "window": { "from": "ISO", "to": "ISO", "time_of_day": "morning", "preferred_at": null },
  "duration_minutes": 30,
  "buffer_minutes": 15,
  "bookable_hours": { "start": "09:00", "end": "20:00", "days": [1, 2, 3, 4, 5, 6] },
  "calendar_id": "primary",
  "clinics": [
    {
      "id": "clinic/…", "clinic_id": "uuid", "name": "PawPal Partner Vet (Demo) · Indiranagar",
      "address": "…", "phone": "…", "online_booking": true, "booking_email": "…",
      "availability_url": "https://outskill93.vercel.app/api/clinics/{id}/availability",
      "reserve_url": "https://outskill93.vercel.app/api/clinics/{id}/reserve"
    }
  ],
  "pet": { "id": "uuid", "name": "Bruno", "species": "dog", "breed": "Golden Retriever", "age": "3 yrs" },
  "owner": { "name": "Aarav Sharma", "email": "…", "contact": "…" }
}
```

## Owner's choice → `pawpal-booking-choice`

```json
{ "type": "booking_choice", "booking_id": "uuid", "callback": { "url": "…", "token": "uuid" },
  "reason": "…", "timezone": "Asia/Kolkata", "calendar_id": "primary",
  "slot": { "clinic_id": "…", "clinic_name": "…", "doctor_id": "…", "doctor_name": "…",
            "starts_at": "ISO", "ends_at": "ISO", "reserve_url": "…" },
  "pet": { … }, "owner": { … } }
```

## PawPal endpoints the workflow calls (all need `X-PawPal-Secret`)

| Call | Body / query | Answer |
|---|---|---|
| `GET {availability_url}?from=ISO&to=ISO` | | `{ clinic_id, clinic_name, address, reserve_url, slots: [{ doctor_id, doctor_name, starts_at, ends_at }] }` |
| `POST {reserve_url}` | `{ token, doctor_id, starts_at }` | `200 {ok}` or `409` slot gone |
| `POST {callback.url}` confirmed | `{ token, status: "confirmed", starts_at, location, note }` | `200` |
| `POST {callback.url}` options | `{ token, status: "options", options: [slot, …] }` (max 5) | `200` |
| `POST {callback.url}` declined | `{ token, status: "declined", note }` | `200` |

## Editing the matching rules

The matching logic lives in `n8n/match-slots.js` (tests: `node n8n/match-slots.test.mjs`).
After changing it, run `node n8n/build-workflow.mjs` to regenerate the workflow JSON and re-import.
