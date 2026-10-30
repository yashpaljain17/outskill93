import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserClient } from "@/lib/supabase/server";
import { buildPetContext } from "@/lib/ai/pet-context";
import { generateChecklist } from "@/lib/ai/checklist";
import { aiErrorMessage } from "@/lib/ai/claude";

export const maxDuration = 120;

const Body = z.object({
  instructions: z.string().trim().min(10, "Add a bit more detail to the instructions").max(20000),
  petId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getUserClient();
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  try {
    const { text } = await buildPetContext(session.supabase, parsed.data.petId);
    const draft = await generateChecklist(parsed.data.instructions, text);
    return NextResponse.json({ draft });
  } catch (err) {
    const { message, status } = aiErrorMessage(err);
    console.error("checklist generation failed", err);
    return NextResponse.json({ error: err instanceof Error && status === 500 ? err.message : message }, { status });
  }
}
