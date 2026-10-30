import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { distanceKm, type Place, type PlaceKind } from "@/lib/places";

// Free OpenStreetMap data: the Overpass API, with Nominatim as a quick fallback.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const USER_AGENT = "PawPal/0.1 (pet care companion)";

const Query = z.object({
  kind: z.enum(["vet", "park"]),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(500).max(25000).default(5000),
});

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function buildQuery(kind: PlaceKind, lat: number, lon: number, radius: number) {
  const around = `(around:${radius},${lat},${lon})`;
  const body =
    kind === "vet"
      ? `nwr["amenity"="veterinary"]${around};`
      : // Dedicated dog parks first; named general parks are a fallback where dog parks are rare.
        `nwr["leisure"="dog_park"]${around}; way["leisure"="park"]["name"]${around};`;
  return `[out:json][timeout:20];(${body});out center tags 120;`;
}

// Overpass can take 20s+ when busy, so mirrors race and the first answer wins.
async function overpass(query: string): Promise<OsmElement[]> {
  const controllers = OVERPASS.map(() => new AbortController());
  try {
    return await Promise.any(
      OVERPASS.map(async (url, i) => {
        const res = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.any([controllers[i].signal, AbortSignal.timeout(40000)]),
        });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        const json = (await res.json()) as { elements?: OsmElement[] };
        return json.elements ?? [];
      })
    );
  } finally {
    controllers.forEach((c) => c.abort());
  }
}

// Nominatim answers in about a second but knows fewer details; used when Overpass is slow.
const NOMINATIM_TERMS: Record<PlaceKind, string[]> = { vet: ["veterinary", "vet clinic", "pet clinic"], park: ["dog park", "park"] };
const NOMINATIM_TYPES = new Set(["amenity/veterinary", "leisure/dog_park", "leisure/park"]);

interface NominatimHit {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  name: string;
  extratags?: Record<string, string> | null;
  address?: Record<string, string>;
}

async function nominatim(kind: PlaceKind, lat: number, lon: number, radius: number): Promise<OsmElement[]> {
  const dLat = radius / 111_320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const viewbox = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].join(",");
  const elements: OsmElement[] = [];
  // Sequential on purpose: Nominatim's usage policy allows about one request per second.
  for (const q of NOMINATIM_TERMS[kind]) {
    const params = new URLSearchParams({ q, format: "jsonv2", viewbox, bounded: "1", limit: "40", extratags: "1", addressdetails: "1" });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) continue;
    for (const h of (await res.json()) as NominatimHit[]) {
      if (!NOMINATIM_TYPES.has(`${h.category}/${h.type}`)) continue;
      const a = h.address ?? {};
      elements.push({
        type: h.osm_type,
        id: h.osm_id,
        lat: Number(h.lat),
        lon: Number(h.lon),
        tags: {
          ...h.extratags,
          [h.category]: h.type,
          ...(h.name && { name: h.name }),
          ...(a.road && { "addr:street": a.road }),
          ...(a.house_number && { "addr:housenumber": a.house_number }),
          ...((a.suburb ?? a.neighbourhood) && { "addr:suburb": a.suburb ?? a.neighbourhood }),
          ...((a.city ?? a.town) && { "addr:city": a.city ?? a.town }),
        },
      });
    }
  }
  return elements;
}

// Small in-memory cache so switching tabs or revisiting an area is instant.
const cache = new Map<string, { until: number; elements: OsmElement[] }>();
const OVERPASS_CACHE_MS = 30 * 60 * 1000;
const FALLBACK_CACHE_MS = 5 * 60 * 1000;
const FALLBACK_AFTER_MS = 8000;

function remember(key: string, elements: OsmElement[], ms: number) {
  if (cache.size > 200) cache.clear();
  cache.set(key, { until: Date.now() + ms, elements });
}

async function findElements(kind: PlaceKind, lat: number, lon: number, radius: number) {
  const key = `${kind}|${lat}|${lon}|${radius}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.elements;

  // Overpass keeps running after a fallback answer so the next search gets its richer data.
  const fromOverpass = overpass(buildQuery(kind, lat, lon, radius)).then((els) => {
    remember(key, els, OVERPASS_CACHE_MS);
    return els;
  });
  fromOverpass.catch(() => {});
  const fromNominatim = new Promise((r) => setTimeout(r, FALLBACK_AFTER_MS))
    .then(() => nominatim(kind, lat, lon, radius))
    .then((els) => {
      if (!els.length) throw new Error("no fallback results");
      if (!cache.has(key)) remember(key, els, FALLBACK_CACHE_MS);
      return els;
    });
  return Promise.any([fromOverpass, fromNominatim]);
}

function address(t: Record<string, string>) {
  if (t["addr:full"]) return t["addr:full"];
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const parts = [street, t["addr:suburb"], t["addr:city"]].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function toPlace(el: OsmElement, kind: PlaceKind, origin: { lat: number; lon: number }): Place | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const t = el.tags ?? {};
  const category = kind === "vet" ? "veterinary" : t.leisure === "dog_park" ? "dog_park" : "park";
  // Unnamed neighbourhood greens aren't useful destinations.
  if (category === "park" && (!t.name || /^park$/i.test(t.name.trim()))) return null;
  return {
    id: `${el.type}/${el.id}`,
    kind,
    category,
    name: t.name ?? (category === "veterinary" ? "Veterinary clinic" : category === "dog_park" ? "Dog park" : "Park"),
    lat,
    lon,
    distanceKm: distanceKm(origin, { lat, lon }),
    address: address(t),
    phone: t.phone ?? t["contact:phone"] ?? null,
    email: t.email ?? t["contact:email"] ?? null,
    website: t.website ?? t["contact:website"] ?? null,
    openingHours: t.opening_hours ?? null,
    emergency: t.emergency === "yes" || /24\/7/.test(t.opening_hours ?? ""),
    clinicId: null,
    onlineBooking: false,
    services: [],
  };
}

interface ClinicRow {
  id: string;
  osm_id: string | null;
  name: string;
  address: string | null;
  lat: number;
  lon: number;
  phone: string | null;
  email: string | null;
  website: string | null;
  opening_hours: string | null;
  services: string[];
  emergency: boolean;
  online_booking: boolean;
}

/** Clinics from PawPal's own directory (supabase/migrations/0003_master_data.sql) inside the search box. */
async function directoryClinics(lat: number, lon: number, radius: number): Promise<ClinicRow[]> {
  const dLat = radius / 111_320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("clinics")
    .select("id, osm_id, name, address, lat, lon, phone, email, website, opening_hours, services, emergency, online_booking")
    .gte("lat", lat - dLat)
    .lte("lat", lat + dLat)
    .gte("lon", lon - dLon)
    .lte("lon", lon + dLon)
    .limit(100);
  // The directory is optional: before the migration runs, map data alone is used.
  return error ? [] : (data as ClinicRow[]);
}

function mergeDirectory(places: Place[], clinics: ClinicRow[], origin: { lat: number; lon: number }, radius: number) {
  const byId = new Map(places.map((p) => [p.id, p]));
  for (const c of clinics) {
    const existing = c.osm_id ? byId.get(c.osm_id) : undefined;
    if (existing) {
      existing.clinicId = c.id;
      existing.onlineBooking = c.online_booking;
      existing.services = c.services;
      existing.phone ??= c.phone;
      existing.email ??= c.email;
      existing.website ??= c.website;
      existing.openingHours ??= c.opening_hours;
      existing.emergency ||= c.emergency;
      continue;
    }
    const distance = distanceKm(origin, c);
    if (distance * 1000 > radius) continue;
    places.push({
      id: c.osm_id ?? `clinic/${c.id}`,
      kind: "vet",
      category: "veterinary",
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      distanceKm: distance,
      address: c.address,
      phone: c.phone,
      email: c.email,
      website: c.website,
      openingHours: c.opening_hours,
      emergency: c.emergency || /24\/7/.test(c.opening_hours ?? ""),
      clinicId: c.id,
      onlineBooking: c.online_booking,
      services: c.services,
    });
  }
  return places;
}

export const maxDuration = 60;

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  const { kind, lat, lon, radius } = parsed.data;

  try {
    // Rounded to ~100 m so nearby searches share cache entries.
    const [elements, clinics] = await Promise.all([
      findElements(kind, +lat.toFixed(3), +lon.toFixed(3), radius),
      kind === "vet" ? directoryClinics(lat, lon, radius) : Promise.resolve([]),
    ]);
    const seen = new Set<string>();
    const mapped = elements
      .map((el) => toPlace(el, kind, { lat, lon }))
      .filter((p): p is Place => {
        if (!p || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    const places = mergeDirectory(mapped, clinics, { lat, lon }, radius)
      // Partner clinics and dedicated dog parks rank first, then everything by distance.
      .sort(
        (a, b) =>
          Number(b.onlineBooking) - Number(a.onlineBooking) ||
          Number(b.category === "dog_park") - Number(a.category === "dog_park") ||
          a.distanceKm - b.distanceKm
      )
      .slice(0, 40);
    return NextResponse.json({ places }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "Map data service is busy — try again in a moment." }, { status: 502 });
  }
}
