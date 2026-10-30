export type PlaceKind = "vet" | "park";

export interface Place {
  id: string;
  kind: PlaceKind;
  /** "dog_park" for dedicated off-leash areas, "park" for general parks shown as a fallback. */
  category: "veterinary" | "dog_park" | "park";
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  openingHours: string | null;
  emergency: boolean;
  /** Row in the PawPal clinics directory, when the place is listed there. */
  clinicId: string | null;
  /** Partner clinic that accepts PawPal booking requests. */
  onlineBooking: boolean;
  services: string[];
}

export interface LatLon {
  lat: number;
  lon: number;
}

export function distanceKm(a: LatLon, b: LatLon) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function directionsUrl(p: Pick<Place, "lat" | "lon" | "name">) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
}
