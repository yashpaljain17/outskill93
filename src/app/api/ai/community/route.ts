import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { FALLBACK_BETA, MODEL, SAFETY_RULES, aiErrorMessage, getAnthropic } from "@/lib/ai/claude";
import { guardAiQuota } from "@/lib/ai/rate-limit";

export const maxDuration = 60;

const Body = z.object({ questionId: z.string().uuid() });

/** Generates the "AI suggestion" shown on a community question and stores it on the question. */
export async function POST(req: Request) {
  const session = await getUserClient();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { supabase, user } = session;
  const { data: q } = await supabase
    .from("questions")
    .select("id, author_id, title, body, species, ai_answer")
    .eq("id", parsed.data.questionId)
    .single();
  if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  if (q.author_id !== user.id) return NextResponse.json({ error: "Only the author can request this" }, { status: 403 });
  if (q.ai_answer) return NextResponse.json({ answer: q.ai_answer });

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 503 }
    );
  }

  const limited = await guardAiQuota(supabase, user, "community");
  if (limited) return limited;

  try {
    const client = getAnthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: `You write a first, helpful reply to a question posted in a pet owners' community forum, shown as an "AI suggestion" while people reply.
${SAFETY_RULES}
- 80-180 words, plain markdown, practical steps. End with one line on when to see a vet if relevant.`,
      messages: [
        {
          role: "user",
          content: `Species: ${q.species ?? "unspecified"}\nTitle: ${q.title}\n\n${q.body}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "No AI suggestion for this question." }, { status: 422 });
    }
    const answer = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (answer) await admin.from("questions").update({ ai_answer: answer }).eq("id", q.id).is("ai_answer", null);
    return NextResponse.json({ answer });
  } catch (err) {
    const { message, status } = aiErrorMessage(err);
    return NextResponse.json({ error: message }, { status });
  }
}
