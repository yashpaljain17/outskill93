import { NextResponse, connection } from "next/server";

/** Tells the client which voice engine is available, without exposing keys. */
export async function GET() {
  await connection(); // evaluate env at request time, not build time
  return NextResponse.json({ elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY) });
}
