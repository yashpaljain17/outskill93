import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserClient } from "@/lib/supabase/server";
import { buildPetContext } from "@/lib/ai/pet-context";
import { ASSISTANT_TOOLS, runAssistantTool } from "@/lib/ai/assistant-tools";
import { FALLBACK_BETA, MODEL, SAFETY_RULES, aiErrorMessage, getAnthropic } from "@/lib/ai/claude";

export const maxDuration = 120;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20000) }))
    .min(1)
    .max(40),
  petId: z.string().uuid().nullable().optional(),
  voice: z.boolean().optional(),
  timezone: z.string().max(64).optional(),
});

const MAX_TOOL_ROUNDS = 5;

/**
 * Streams newline-delimited JSON events:
 *   {"type":"text","text":"..."} | {"type":"action","label":"...","href":"..."}
 *   {"type":"status","text":"..."} | {"type":"booking","id":"..."} | {"type":"error","message":"..."} | {"type":"done"}
 */
export async function POST(req: Request) {
  const session = await getUserClient();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { messages: history, petId, voice, timezone } = parsed.data;
  if (history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
  }

  let client: Anthropic;
  try {
    client = getAnthropic();
  } catch (err) {
    const { message, status } = aiErrorMessage(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { supabase, user } = session;
  const origin = new URL(req.url).origin;
  const { text: petContext, pets } = await buildPetContext(supabase, petId);
  const petIds = new Set(pets.map((p) => p.id));

  const now = new Date();
  const tz = timezone || "UTC";
  const localNow = now.toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "short" });

  const system = `You are PawPal, a friendly pet care assistant inside a pet care app. You help owners with day-to-day care questions and keep their pet records up to date.

${SAFETY_RULES}
- You can add routines, appointments and vaccinations, and turn care instructions into checklists, using your tools.
- To book a vet visit, use request_vet_booking: it negotiates with partner clinics using the owner's Google Calendar. Use add_appointment only to record a visit whose time is already confirmed. If the owner gives no dates, use the next 7 days; if no time of day, use "any". Ask which pet only if it's unclear.
- When a booking under "Bookings in progress" has options and the owner picks one ("yes", "the first one", "Wednesday works"), call respond_to_booking_options with that option number (0 if they say no to all). If they just say "yes" and there is only one option, that's option 1. Only do that when the owner asks for it or clearly agrees. If a needed detail (which pet, the time) is missing and you can't infer it, ask a short question first.
- If the owner has one pet, assume questions are about that pet.
- After using a tool, confirm briefly what you saved.
${
  voice
    ? "- This reply will be spoken aloud. Answer in 1-4 short conversational sentences of plain text: no markdown, lists, emoji or URLs."
    : "- Format with short paragraphs and simple markdown bullet lists when useful. Keep answers focused."
}

Current local time for the owner: ${localNow} (timezone ${tz}). When booking, output starts_at with this timezone's offset.

The owner's pets and records:
${petContext}`;

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const response = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            betas: [FALLBACK_BETA],
            fallbacks: "default",
            output_config: { effort: voice ? "low" : "medium" },
            system,
            tools: ASSISTANT_TOOLS,
            messages,
          });

          response.on("text", (delta) => send({ type: "text", text: delta }));
          const message = await response.finalMessage();

          if (message.stop_reason === "refusal") {
            send({ type: "error", message: "I can't help with that one. For anything urgent, please contact your vet." });
            break;
          }
          if (message.stop_reason === "max_tokens") {
            send({ type: "text", text: "\n\n_(Reply cut short.)_" });
            break;
          }
          if (message.stop_reason !== "tool_use") break;

          // Keep the assistant turn intact (thinking + tool_use blocks) for the next round.
          messages.push({ role: "assistant", content: message.content });

          const toolUses = message.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
          );
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const use of toolUses) {
            send({ type: "status", text: statusLabel(use.name) });
            const outcome = await runAssistantTool(use.name, use.input, { supabase, user, origin, petIds, petContext });
            if (outcome.action) send({ type: "action", ...outcome.action });
            if (outcome.booking) send({ type: "booking", id: outcome.booking });
            results.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: outcome.content,
              is_error: outcome.isError,
            });
          }
          messages.push({ role: "user", content: results });
          if (round === MAX_TOOL_ROUNDS) send({ type: "text", text: "\n\nI've done what I can for now." });
        }
        send({ type: "done" });
      } catch (err) {
        console.error("chat failed", err);
        send({ type: "error", message: aiErrorMessage(err).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function statusLabel(tool: string) {
  switch (tool) {
    case "add_routine":
      return "Adding routine…";
    case "add_appointment":
      return "Booking appointment…";
    case "add_vaccination":
      return "Saving vaccination…";
    case "create_checklist":
      return "Building checklist…";
    case "request_vet_booking":
      return "Contacting clinics…";
    case "respond_to_booking_options":
      return "Booking your choice…";
    default:
      return "Working…";
  }
}
