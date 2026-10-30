import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Speech-to-text through ElevenLabs Scribe. Expects multipart form field "audio". */
export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ElevenLabs is not configured" }, { status: 503 });
  if (!(await getUserClient())) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "No audio received" }, { status: 400 });
  }
  if (audio.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Recording too long" }, { status: 413 });

  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, "speech.webm");
  upstreamForm.append("model_id", "scribe_v1");

  const upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: upstreamForm,
  });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("ElevenLabs STT failed", upstream.status, detail.slice(0, 300));
    return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  }
  const data = (await upstream.json()) as { text?: string };
  return NextResponse.json({ text: (data.text ?? "").trim() });
}
