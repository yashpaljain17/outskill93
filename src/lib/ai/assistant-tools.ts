import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { TIME_OF_DAY, chooseBookingOption, createBookingRequest } from "@/lib/booking";
import { generateChecklist } from "./checklist";
import { saveChecklistDraft } from "./save-checklist";

const routineKinds = ["feeding", "walk", "medication", "grooming", "play", "training", "other"] as const;
const apptKinds = ["vet", "grooming", "training", "other"] as const;

const AddRoutine = z.object({
  pet_id: z.string(),
  kind: z.enum(routineKinds),
  title: z.string().min(1),
  times: z.array(z.string().regex(/^\d{2}:\d{2}$/)),
  days: z.array(z.number().int().min(0).max(6)),
  amount: z.string(),
  notes: z.string(),
});

const AddAppointment = z.object({
  pet_id: z.string(),
  kind: z.enum(apptKinds),
  title: z.string().min(1),
  starts_at: z.string().describe("ISO 8601 date-time with timezone offset"),
  location: z.string(),
  notes: z.string(),
});

const AddVaccination = z.object({
  pet_id: z.string(),
  vaccine: z.string().min(1),
  given_on: z.string(),
  next_due: z.string(),
  clinic: z.string(),
});

const RequestVetBooking = z.object({
  pet_id: z.string(),
  reason: z.string().min(2).max(120),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_of_day: z.enum(TIME_OF_DAY),
  preferred_at: z.string(),
  clinic_name: z.string(),
  notes: z.string(),
});

const RespondToBookingOptions = z.object({
  appointment_id: z.string(),
  option_number: z.number().int().min(0).max(5),
});

const CreateChecklist = z.object({
  pet_id: z.string(),
  instructions: z.string().min(10),
});

export const ASSISTANT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "add_routine",
    description:
      "Create a recurring care routine (feeding, walk, medication, grooming, play, training) for one of the owner's pets. Only call this when the owner asks to add or schedule something.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        pet_id: { type: "string", description: "id of the pet from the context" },
        kind: { type: "string", enum: [...routineKinds] },
        title: { type: "string", description: "e.g. 'Morning walk' or 'Breakfast'" },
        times: { type: "array", items: { type: "string" }, description: "24h 'HH:MM' times" },
        days: {
          type: "array",
          items: { type: "integer" },
          description: "Days of week 0=Sun..6=Sat; all seven for daily",
        },
        amount: { type: "string", description: "Portion, dose or duration; empty string if none" },
        notes: { type: "string", description: "Empty string if none" },
      },
      required: ["pet_id", "kind", "title", "times", "days", "amount", "notes"],
      additionalProperties: false,
    },
  },
  {
    name: "add_appointment",
    description: "Book a vet, grooming or training appointment into the owner's calendar.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        pet_id: { type: "string" },
        kind: { type: "string", enum: [...apptKinds] },
        title: { type: "string" },
        starts_at: { type: "string", description: "ISO 8601 date-time including timezone offset" },
        location: { type: "string", description: "Empty string if unknown" },
        notes: { type: "string", description: "Empty string if none" },
      },
      required: ["pet_id", "kind", "title", "starts_at", "location", "notes"],
      additionalProperties: false,
    },
  },
  {
    name: "add_vaccination",
    description: "Record a vaccination the pet received and/or when the next dose is due.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        pet_id: { type: "string" },
        vaccine: { type: "string" },
        given_on: { type: "string", description: "YYYY-MM-DD or empty string" },
        next_due: { type: "string", description: "YYYY-MM-DD or empty string" },
        clinic: { type: "string", description: "Empty string if unknown" },
      },
      required: ["pet_id", "vaccine", "given_on", "next_due", "clinic"],
      additionalProperties: false,
    },
  },
  {
    name: "request_vet_booking",
    description:
      "Ask PawPal's booking service to book a vet visit (vaccination, check-up, dental, illness…) at a partner clinic. It checks the owner's Google Calendar and the clinics' doctor schedules, books a matching slot automatically, or comes back with alternative options. Use this whenever the owner wants to book or schedule a vet visit without an already-confirmed time. The result arrives a minute later; tell the owner you'll let them know.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        pet_id: { type: "string" },
        reason: { type: "string", description: "Short visit reason, e.g. 'Rabies vaccination' or 'Annual check-up'" },
        from_date: { type: "string", description: "First acceptable day, YYYY-MM-DD in the owner's timezone" },
        to_date: { type: "string", description: "Last acceptable day, YYYY-MM-DD. Default: 7 days after from_date" },
        time_of_day: { type: "string", enum: [...TIME_OF_DAY], description: "morning 8-12, afternoon 12-17, evening 17-21" },
        preferred_at: {
          type: "string",
          description: "Exact preferred start as ISO 8601 with offset if the owner named one, else empty string",
        },
        clinic_name: { type: "string", description: "Clinic or area the owner named (e.g. 'Indiranagar'), else empty string" },
        notes: { type: "string", description: "Symptoms or details for the vet; empty string if none" },
      },
      required: ["pet_id", "reason", "from_date", "to_date", "time_of_day", "preferred_at", "clinic_name", "notes"],
      additionalProperties: false,
    },
  },
  {
    name: "respond_to_booking_options",
    description:
      "Answer a booking that is waiting for the owner's choice (listed under 'Bookings in progress' with numbered options). Pass the option number the owner picked, or 0 if they decline all options.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "string", description: "Booking id from the context" },
        option_number: { type: "integer", description: "1-based option the owner chose; 0 to decline" },
      },
      required: ["appointment_id", "option_number"],
      additionalProperties: false,
    },
  },
  {
    name: "create_checklist",
    description:
      "Turn care instructions the owner shared (vet discharge notes, a feeding plan, training advice) into a saved, editable checklist. Pass the instructions verbatim.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        pet_id: { type: "string" },
        instructions: { type: "string", description: "The full care instructions text" },
      },
      required: ["pet_id", "instructions"],
      additionalProperties: false,
    },
  },
];

export interface ToolOutcome {
  content: string;
  isError: boolean;
  /** Shown to the user as an action chip in the chat. */
  action?: { label: string; href: string };
  /** A booking the chat should keep watching for the workflow's answer. */
  booking?: string;
}

export async function runAssistantTool(
  name: string,
  rawInput: unknown,
  ctx: { supabase: SupabaseClient; user: User; origin: string; petIds: Set<string>; petContext: string }
): Promise<ToolOutcome> {
  const { supabase, petIds } = ctx;
  const badPet = (id: string) =>
    !petIds.has(id) ? { content: `Unknown pet_id ${id}. Use an id from the context.`, isError: true } : null;

  try {
    switch (name) {
      case "add_routine": {
        const parsed = AddRoutine.safeParse(rawInput);
        if (!parsed.success) return invalid(parsed.error);
        const input = parsed.data;
        const bad = badPet(input.pet_id);
        if (bad) return bad;
        const { error } = await supabase.from("routines").insert({
          pet_id: input.pet_id,
          kind: input.kind,
          title: input.title,
          times: input.times,
          days: input.days.length ? input.days : [0, 1, 2, 3, 4, 5, 6],
          amount: input.amount || null,
          notes: input.notes || null,
        });
        if (error) return { content: error.message, isError: true };
        return {
          content: "Routine saved.",
          isError: false,
          action: { label: `Added routine: ${input.title}`, href: `/pets/${input.pet_id}?tab=routines` },
        };
      }
      case "add_appointment": {
        const parsed = AddAppointment.safeParse(rawInput);
        if (!parsed.success) return invalid(parsed.error);
        const input = parsed.data;
        const bad = badPet(input.pet_id);
        if (bad) return bad;
        const when = new Date(input.starts_at);
        if (Number.isNaN(when.getTime())) return { content: "starts_at is not a valid date-time", isError: true };
        const { error } = await supabase.from("appointments").insert({
          pet_id: input.pet_id,
          kind: input.kind,
          title: input.title,
          starts_at: when.toISOString(),
          location: input.location || null,
          notes: input.notes || null,
        });
        if (error) return { content: error.message, isError: true };
        return {
          content: "Appointment saved.",
          isError: false,
          action: { label: `Booked: ${input.title}`, href: `/pets/${input.pet_id}?tab=appointments` },
        };
      }
      case "add_vaccination": {
        const parsed = AddVaccination.safeParse(rawInput);
        if (!parsed.success) return invalid(parsed.error);
        const input = parsed.data;
        const bad = badPet(input.pet_id);
        if (bad) return bad;
        const { error } = await supabase.from("vaccinations").insert({
          pet_id: input.pet_id,
          vaccine: input.vaccine,
          given_on: input.given_on || null,
          next_due: input.next_due || null,
          clinic: input.clinic || null,
        });
        if (error) return { content: error.message, isError: true };
        return {
          content: "Vaccination saved.",
          isError: false,
          action: { label: `Recorded: ${input.vaccine}`, href: `/pets/${input.pet_id}?tab=health` },
        };
      }
      case "request_vet_booking": {
        const parsed = RequestVetBooking.safeParse(rawInput);
        if (!parsed.success) return invalid(parsed.error);
        const input = parsed.data;
        const bad = badPet(input.pet_id);
        if (bad) return bad;
        // Partner clinics keep India hours, so day bounds are taken in IST.
        const from = new Date(`${input.from_date}T00:00:00+05:30`);
        const to = new Date(`${input.to_date}T23:59:59+05:30`);
        const preferredAt = input.preferred_at ? new Date(input.preferred_at) : null;
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
          return { content: "from_date/to_date are not a valid range", isError: true };
        }
        if (preferredAt && Number.isNaN(preferredAt.getTime())) return { content: "preferred_at is not a valid date-time", isError: true };
        const result = await createBookingRequest(ctx.supabase, ctx.user, ctx.origin, {
          petId: input.pet_id,
          reason: input.reason,
          notes: input.notes || null,
          contact: ctx.user.email ?? "via PawPal",
          clinicName: input.clinic_name || null,
          window: { from: from < new Date() ? new Date() : from, to, timeOfDay: input.time_of_day, preferredAt },
        });
        if ("error" in result) return { content: result.error, isError: true };
        return {
          content: result.sent
            ? `Booking request ${result.id} sent to the booking service, which is checking the owner's calendar with: ${result.clinics.join(", ")}. The answer arrives in about a minute and will appear in this chat automatically.`
            : `Saved booking request ${result.id}, but the booking service isn't connected, so no clinic was contacted. Tell the owner it is saved as "Awaiting clinic".`,
          isError: false,
          action: { label: `Booking requested: ${input.reason}`, href: `/pets/${input.pet_id}?tab=appointments` },
          booking: result.sent ? result.id : undefined,
        };
      }
      case "respond_to_booking_options": {
        const parsed = RespondToBookingOptions.safeParse(rawInput);
        if (!parsed.success) return invalid(parsed.error);
        const { appointment_id, option_number } = parsed.data;
        const result = await chooseBookingOption(
          ctx.supabase,
          ctx.user,
          ctx.origin,
          appointment_id,
          option_number === 0 ? null : option_number - 1
        );
        if ("error" in result) return { content: result.error, isError: true };
        if (!result.option) return { content: "Declined all options; the request is cancelled.", isError: false };
        return {
          content: `Sent the choice: ${result.option.doctor_name} at ${result.option.clinic_name}, ${result.option.starts_at}. The booking service is reserving it and adding it to Google Calendar; confirmation appears in this chat shortly.`,
          isError: false,
          booking: appointment_id,
        };
      }
      case "create_checklist": {
        const parsed = CreateChecklist.safeParse(rawInput);
        if (!parsed.success) return invalid(parsed.error);
        const input = parsed.data;
        const bad = badPet(input.pet_id);
        if (bad) return bad;
        const draft = await generateChecklist(input.instructions, ctx.petContext);
        const id = await saveChecklistDraft(supabase, draft, input.pet_id, input.instructions);
        return {
          content: `Checklist "${draft.title}" saved with ${draft.items.length} steps. Safety notes: ${
            draft.safety_notes.join(" | ") || "none"
          }`,
          isError: false,
          action: { label: `Checklist: ${draft.title}`, href: `/checklists/${id}` },
        };
      }
      default:
        return { content: `Unknown tool ${name}`, isError: true };
    }
  } catch (err) {
    return { content: err instanceof Error ? err.message : "Tool failed", isError: true };
  }
}

function invalid(error: z.ZodError): ToolOutcome {
  return {
    content: `INVALID_INPUT: ${error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    isError: true,
  };
}
