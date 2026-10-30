"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Clock, Globe, Loader2, LocateFixed, MapPin, Navigation, Phone, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, NativeSelect } from "@/components/app/fields";
import { BookingDialog } from "@/components/app/booking-dialog";
import { directionsUrl, formatDistance, type LatLon, type Place, type PlaceKind } from "@/lib/places";
import { cn } from "@/lib/utils";

const PlacesMap = dynamic(() => import("@/components/app/places-map").then((m) => m.PlacesMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-[320px] w-full rounded-2xl" />,
});

const TABS: { kind: PlaceKind; label: string; emoji: string }[] = [
  { kind: "vet", label: "Vet clinics", emoji: "🩺" },
  { kind: "park", label: "Dog parks", emoji: "🐕" },
];

const RADII = [2, 5, 10, 20];

export default function NearbyPage() {
  const [kind, setKind] = useState<PlaceKind>("vet");
  const [radiusKm, setRadiusKm] = useState(5);
  const [center, setCenter] = useState<(LatLon & { label: string }) | null>(null);
  const [result, setResult] = useState<{ url: string; kind: PlaceKind; places: Place[] } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bookClinic, setBookClinic] = useState<Place | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  function locate() {
    if (!navigator.geolocation) return toast.error("Your browser can't share location — search for a place instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "your location" });
      },
      () => {
        setLocating(false);
        toast.error("Location permission was blocked — search for an area instead.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  // Skip the button if the user already allowed location for this site.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => p.state === "granted" && locate())
      .catch(() => {});
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setGeocoding(true);
    const res = await fetch(`/api/places/geocode?q=${encodeURIComponent(query)}`);
    const json = await res.json();
    setGeocoding(false);
    if (!res.ok) return toast.error(json.error);
    setSelectedId(null);
    setCenter({ lat: json.lat, lon: json.lon, label: json.label.split(",").slice(0, 2).join(",") });
  }

  const url = center && `/api/places?kind=${kind}&lat=${center.lat}&lon=${center.lon}&radius=${radiusKm * 1000}`;
  // Results for an older search of the same kind stay visible (dimmed) until the new one lands.
  const places = result?.kind === kind ? result.places : null;
  const loading = geocoding || (!!url && result?.url !== url);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const forKind = new URL(url, location.href).searchParams.get("kind") as PlaceKind;
    fetch(url)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!cancelled) setResult({ url, kind: forKind, places: json.places });
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.message || "Couldn't load places");
        setResult({ url, kind: forKind, places: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  function select(id: string) {
    setSelectedId(id);
    listRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const tab = TABS.find((t) => t.kind === kind)!;
  const onlyParks = !loading && kind === "park" && places?.length && !places.some((p) => p.category === "dog_park");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Nearby</h1>
        <p className="text-muted-foreground">Find vet clinics and dog parks around you, get directions or request a booking.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => {
                setKind(t.kind);
                setSelectedId(null);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                kind === t.kind && "bg-background text-foreground shadow-sm"
              )}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={locate} disabled={locating}>
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} Use my location
        </Button>
        <form onSubmit={search} className="order-last flex w-full gap-2 sm:order-none sm:w-auto sm:min-w-0 sm:max-w-sm sm:flex-1">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Or search an area, e.g. Indiranagar" aria-label="Search an area" />
          <Button type="submit" variant="secondary" size="icon" aria-label="Search">
            <Search />
          </Button>
        </form>
        <NativeSelect
          aria-label="Search radius"
          className="w-auto"
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
        >
          {RADII.map((r) => (
            <option key={r} value={r}>
              Within {r} km
            </option>
          ))}
        </NativeSelect>
      </div>

      {!center ? (
        <EmptyState
          emoji="📍"
          title="Where should we look?"
          body="Share your location or search for an area to see nearby vet clinics and dog parks on the map."
        >
          <Button onClick={locate} disabled={locating}>
            {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} Use my location
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="h-[45dvh] lg:sticky lg:top-20 lg:h-[calc(100dvh-12rem)]">
            <PlacesMap center={center} places={places ?? []} selectedId={selectedId} onSelect={select} />
          </div>

          <div ref={listRef} className={cn("space-y-3 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto lg:pr-1", loading && places?.length && "[&>[data-id]]:opacity-50")}>
            <p className="text-sm text-muted-foreground">
              {loading ? "Searching" : `${places?.length ?? 0} ${kind === "vet" ? "vet clinics" : "parks"}`} near{" "}
              <span className="font-medium text-foreground">{center.label}</span>
            </p>
            {onlyParks ? (
              <p className="rounded-xl bg-secondary px-3 py-2 text-xs">
                No dedicated dog parks mapped here — showing nearby parks instead. Check local leash rules before you go.
              </p>
            ) : null}

            {loading && !places?.length
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
              : !places?.length && !loading
                ? (
                  <EmptyState emoji={tab.emoji} title={`No ${tab.label.toLowerCase()} found`} body="Try a bigger radius or another area." />
                )
                : places?.map((p) => (
                    <PlaceCard
                      key={p.id}
                      place={p}
                      active={p.id === selectedId}
                      onSelect={() => setSelectedId(p.id)}
                      onBook={() => setBookClinic(p)}
                    />
                  ))}
            <p className="pt-1 text-[11px] text-muted-foreground">Map data © OpenStreetMap contributors.</p>
          </div>
        </div>
      )}

      <BookingDialog clinic={bookClinic} onOpenChange={(o) => !o && setBookClinic(null)} />
    </div>
  );
}

function PlaceCard({
  place: p,
  active,
  onSelect,
  onBook,
}: {
  place: Place;
  active: boolean;
  onSelect: () => void;
  onBook: () => void;
}) {
  return (
    <div
      data-id={p.id}
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50",
        active && "border-primary ring-2 ring-primary/20"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-lg">
          {p.category === "veterinary" ? "🩺" : p.category === "dog_park" ? "🐕" : "🌳"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{p.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{formatDistance(p.distanceKm)}</span>
            {p.category === "dog_park" && <span className="rounded-full bg-primary/10 px-1.5 text-primary">Dog park</span>}
            {p.onlineBooking && <span className="rounded-full bg-emerald-500/15 px-1.5 text-emerald-700 dark:text-emerald-300">Books online</span>}
            {p.emergency && <span className="rounded-full bg-destructive/10 px-1.5 text-destructive">24/7 emergency</span>}
          </p>
          {p.address && (
            <p className="mt-1 flex gap-1 text-xs text-muted-foreground">
              <MapPin className="mt-px size-3 shrink-0" /> {p.address}
            </p>
          )}
          {p.services.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{p.services.join(" · ")}</p>
          )}
          {p.openingHours && (
            <p className="mt-0.5 flex gap-1 text-xs text-muted-foreground">
              <Clock className="mt-px size-3 shrink-0" /> {p.openingHours}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {p.kind === "vet" && (
          <Button size="sm" onClick={onBook}>
            <CalendarPlus /> Request booking
          </Button>
        )}
        <a href={directionsUrl(p)} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
          <Navigation /> Directions
        </a>
        {p.phone && (
          <a href={`tel:${p.phone.split(/[;,]/)[0].replace(/\s/g, "")}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            <Phone /> Call
          </a>
        )}
        {p.website && (
          <a href={p.website} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
            <Globe /> Website
          </a>
        )}
      </div>
    </div>
  );
}
