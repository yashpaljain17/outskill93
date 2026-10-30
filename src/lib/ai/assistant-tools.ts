import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
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
}

export async function runAssistantTool(
  name: string,
  rawInput: unknown,
  ctx: { supabase: SupabaseClient; petIds: Set<string>; petContext: string }
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
