import { NextResponse } from "next/server";

// Turns a typed place ("Koramangala, Bangalore") into coordinates via OpenStreetMap Nominatim.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length > 200) return NextResponse.json({ error: "Enter a place to search" }, { status: 400 });

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "PawPal/0.1 (pet care companion)", "Accept-Language": "en" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (!hit) return NextResponse.json({ error: `Couldn't find "${q}"` }, { status: 404 });
    return NextResponse.json({ lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name });
  } catch {
    return NextResponse.json({ error: "Location search is unavailable right now." }, { status: 502 });
  }
}
