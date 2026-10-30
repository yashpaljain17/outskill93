# 🐾 PawPal — Pet Care Companion

PawPal keeps your pets' care organised and uses AI to turn care instructions into checklists you can follow.

- **Pet profiles**: photo, breed, age, weight, allergies and notes
- **Routines**: feeding, walks, medication and grooming on a daily **Today** list you tick off
- **Health records**: vaccinations with due and overdue alerts
- **Appointments**: vet, grooming and training visits
- **AI checklists**: paste a vet's discharge notes and get an editable, step-by-step checklist (powered by Claude structured outputs). Repeating steps can become routines automatically.
- **AI assistant**: a chat that knows your pets' records and can add routines, appointments, vaccinations and checklists for you
- **Voice agent**: a hands-free voice conversation, using ElevenLabs speech-to-text and text-to-speech, with the browser's built-in speech as a fallback
- **Nearby**: vet clinics and dog parks on a map around you, with directions, call and website links (free OpenStreetMap data, no API key)
- **Vet booking via n8n**: request a visit at a nearby clinic; an [n8n workflow](n8n/README.md) contacts the clinic and confirms back into the app
- **Community**: Q&A with upvotes, accepted answers, live updates and an instant AI suggestion on every question
- **Guest mode**, so judges can try the app without signing up

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres, Auth, Row Level Security, Storage, Realtime) · Anthropic Claude (`claude-opus-5-5`) · ElevenLabs · Leaflet + OpenStreetMap · n8n

---

## 1. Create the Supabase project (free tier)

1. Go to <https://supabase.com/dashboard> and create a project.
2. Open **SQL Editor → New query**, paste the whole of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and click **Run**. Then do the same with [`0002_bookings.sql`](supabase/migrations/0002_bookings.sql) (vet booking requests) and [`0003_master_data.sql`](supabase/migrations/0003_master_data.sql) (a Bengaluru vet clinic directory, five demo users with pets, routines, vaccinations, appointments and community Q&A), and finally [`0005_lock_ai_answer.sql`](supabase/migrations/0005_lock_ai_answer.sql) (stops users from writing the community AI suggestion themselves). The demo logins are listed at the top of `0003_master_data.sql`. This creates all tables, row-level security policies, the `pet-photos` storage bucket and realtime settings.
3. **Authentication → Sign In / Providers**:
   - Turn on **Allow anonymous sign-ins** (powers "Continue as guest").
   - For a smooth demo, turn off **Confirm email** under the Email provider. If you leave it on, users must click the link in their email first.
4. **Authentication → URL Configuration**: set **Site URL** to `http://localhost:3000` now, and to your deployed URL later. Add both to **Redirect URLs**.
5. **Project Settings → API**: copy the **Project URL**, the **anon / publishable key** and the **service_role** key. The service_role key goes in `SUPABASE_SERVICE_ROLE_KEY` and stays on the server; never expose it to the browser.

## 2. Get the API keys

- **Claude:** <https://console.anthropic.com> → API Keys
- **ElevenLabs (optional, free tier):** <https://elevenlabs.io> → Profile → API Keys. It needs *Text to Speech* and *Speech to Text* access. Without it, voice falls back to the browser's built-in speech (Chrome, Edge or Safari).

## 3. Run locally

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev
```

Open <http://localhost:3000>. Sign up (or continue as a guest), then click **Load a sample pet** to fill the app with demo data.

## 4. Deploy for public viewing (Vercel)

1. Push this folder to a GitHub repository.
2. On <https://vercel.com/new>, import the repository (the framework is detected as Next.js).
3. Add the same environment variables as in `.env.local`, including `SUPABASE_SERVICE_ROLE_KEY`.
4. Deploy, then add the Vercel URL to Supabase → Authentication → URL Configuration (Site URL and Redirect URLs).

---

## How the AI works

| Feature | Where | How |
|---|---|---|
| Instructions → checklist | `src/lib/ai/checklist.ts`, `/api/ai/checklist` | Claude structured output against a Zod schema (steps, frequency, times, duration, safety notes). The user reviews and edits the draft before anything is saved. |
| Assistant chat | `/api/ai/chat`, `src/lib/ai/assistant-tools.ts` | Streams the reply. The pet records go in the system prompt. Tools (`add_routine`, `add_appointment`, `add_vaccination`, `create_checklist`) run with the signed-in user's Supabase session, so row-level security still applies. |
| Community suggestion | `/api/ai/community` | A short first answer, stored on the question with the server-only service-role key |
| Voice | `src/hooks/use-voice.ts`, `/api/voice/*` | Silence detection on the mic, then ElevenLabs Scribe (speech-to-text), then the assistant, then ElevenLabs Flash (text-to-speech), then it listens again |

Safety: the prompts forbid inventing medication doses and tell the assistant to flag emergencies first. Warning signs are shown as a separate "confirm with your vet" panel. Requests use Claude's server-side refusal fallback.

## Project layout

```
src/
  app/
    page.tsx                 landing
    login/                   email/password + guest
    (app)/dashboard          Today view
    (app)/pets/[id]          profile · routines · vaccinations · appointments · checklists
    (app)/checklists         list · new (AI builder) · [id] editor
    (app)/community          Q&A feed · [id] thread
    (app)/assistant          chat + voice mode
    api/ai/*  api/voice/*    server routes (keys never reach the browser)
  lib/ai/                    Claude client, prompts, tools
supabase/migrations/         schema + RLS
```
