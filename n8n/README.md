# Vet booking via n8n

PawPal's **Nearby → Vet clinics → Request booking** saves an appointment with status
`requested` ("Awaiting clinic") and POSTs it to your n8n workflow. n8n contacts the clinic
however you like (email, WhatsApp, a phone-call agent, a booking API…) and calls PawPal back
to confirm or decline. The appointment then flips to `scheduled` or `cancelled`.

```
PawPal ──POST──▶ n8n webhook ──▶ contact clinic ──▶ POST /api/booking/callback ──▶ PawPal
```

## Setup

1. Run `supabase/migrations/0002_bookings.sql` in the Supabase SQL editor.
2. In n8n, **Import from file** → `n8n/pawpal-booking.workflow.json`.
3. Replace both `REPLACE_WITH_N8N_WEBHOOK_SECRET` values with the same secret as
   `N8N_WEBHOOK_SECRET` in `.env.local`.
4. Replace **Contact clinic (replace me)** with your real steps.
5. Activate the workflow, copy the webhook's **Production URL** into `N8N_BOOKING_WEBHOOK_URL`,
   and restart the app.

Without `N8N_BOOKING_WEBHOOK_URL`, requests are still saved as "Awaiting clinic" but not sent.

> n8n Cloud can't reach `http://localhost:3000`, so the callback only works once PawPal is
> deployed (or when n8n runs on the same machine, or through a tunnel like ngrok).

`online_booking`, `booking_email` and `booking_whatsapp` come from the `clinics` directory
(`supabase/migrations/0003_master_data.sql`), so route partner clinics to their booking inbox and
fall back to `phone` for everything else.

## Request PawPal sends (header `X-PawPal-Secret`)

```json
{
  "booking_id": "uuid",
  "callback": { "url": "https://your-app/api/booking/callback", "token": "uuid" },
  "requested_at": "2026-10-31T04:30:00.000Z",
  "reason": "Check-up",
  "notes": "Limping on front left paw",
  "clinic": {
    "id": "node/123", "name": "Pet Zone Pet Clinic", "lat": 12.93, "lon": 77.62,
    "address": "437 8th Main, Bengaluru", "phone": "08041217299", "email": null, "website": null,
    "clinic_id": "uuid or null",
    "online_booking": true,
    "booking_email": "bookings+koramangala@example.com",
    "booking_whatsapp": null
  },
  "pet": { "name": "Bruno", "species": "dog", "breed": "Golden Retriever", "sex": "male", "age": "3 yrs", "weight_kg": 29 },
  "owner": { "name": "Yash", "contact": "you@mail.com" }
}
```

## Callback n8n sends (header `X-PawPal-Secret`)

`POST {callback.url}`

```json
{ "token": "<callback.token>", "status": "confirmed", "starts_at": "2026-10-31T05:00:00Z", "note": "See Dr. Rao at 10:30" }
```

- `status`: `confirmed` or `declined` (required)
- `starts_at`: the slot the clinic actually gave (optional; keeps the requested time otherwise)
- `note`: added to the appointment notes (optional)

Responses: `200 {ok:true}`, `401` wrong secret, `404` unknown or already-resolved token.
