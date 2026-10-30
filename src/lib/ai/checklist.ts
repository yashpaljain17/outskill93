import "server-only";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { FALLBACK_BETA, MODEL, SAFETY_RULES, getAnthropic } from "./claude";

export const ChecklistDraftSchema = z.object({
  title: z.string().describe("Short title for the checklist, e.g. 'Post-spay recovery (10 days)'"),
  summary: z.string().describe("One or two sentences summarising the plan"),
  items: z
    .array(
      z.object({
        title: z.string().describe("Actionable step, imperative, under 80 characters"),
        details: z.string().describe("Helpful specifics from the instructions; empty string if none"),
        category: z.enum(["feeding", "walk", "medication", "grooming", "play", "training", "monitoring", "vet", "other"]),
        frequency: z
          .enum(["once", "daily", "twice_daily", "three_times_daily", "weekly", "as_needed"])
          .describe("How often this step repeats"),
        times: z.array(z.string()).describe("Suggested 24h times like '08:00' for repeating steps; empty if not applicable"),
        duration_days: z.number().int().describe("How many days the step lasts; 0 if ongoing or one-off"),
      })
    )
    .describe("Ordered, concrete steps"),
  safety_notes: z
    .array(z.string())
    .describe("Warning signs that need a vet, and anything the owner must confirm with their vet (e.g. missing doses)"),
});

export type ChecklistDraft = z.infer<typeof ChecklistDraftSchema>;

/** An error whose message is safe to show to the user. */
export class ChecklistError extends Error {}

export async function generateChecklist(instructions: string, petContext: string) {
  const client = getAnthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: betaZodOutputFormat(ChecklistDraftSchema),
    },
    system: `You turn pet care instructions (from a vet, groomer, breeder, a pasted article, or the owner's own notes) into a clear, editable routine checklist.

Guidelines:
- Keep every fact from the instructions; do not add medical facts that are not in them.
- Split compound instructions into separate steps. Order steps the way the owner would do them.
- Use the pet's details (species, age, weight, allergies) only to phrase things sensibly, never to invent doses.
- For repeating steps, pick reasonable times of day unless the instructions specify them.
- Put warning signs ("call the vet if...") into safety_notes, not into items.

${SAFETY_RULES}

Owner's pets:
${petContext}`,
    messages: [{ role: "user", content: `Care instructions:\n\n${instructions}` }],
  });

  if (response.stop_reason === "refusal") {
    throw new ChecklistError("The AI declined to process these instructions.");
  }
  if (!response.parsed_output) {
    throw new ChecklistError("The AI response could not be parsed into a checklist.");
  }
  return response.parsed_output;
}
