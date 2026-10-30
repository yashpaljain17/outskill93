import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserClient } from "@/lib/supabase/server";

const Body = z.object({ text: z.string().trim().min(1).max(2500) });

const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // ElevenLabs default "Sarah" (works on the free plan)

/** Text-to-speech through ElevenLabs. Returns audio/mpeg. */
export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ElevenLabs is not configured" }, { status: 503 });
  if (!(await getUserClient())) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: parsed.data.text,
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("ElevenLabs TTS failed", upstream.status, detail.slice(0, 300));
    return NextResponse.json({ error: "Voice synthesis failed" }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
