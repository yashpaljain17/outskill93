"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLon, Place } from "@/lib/places";

const EMOJI = { veterinary: "🩺", dog_park: "🐕", park: "🌳" } as const;

/** OpenStreetMap map of nearby places. Leaflet touches `window`, so it is loaded on mount. */
export function PlacesMap({
  center,
  places,
  selectedId,
  onSelect,
}: {
  center: LatLon;
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((leaflet) => {
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      map.current = leaflet.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lon], 14);
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
        .addTo(map.current);
      layer.current = leaflet.layerGroup().addTo(map.current);
      draw();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(fit = true) {
    const leaflet = L.current;
    if (!leaflet || !map.current || !layer.current) return;
    layer.current.clearLayers();

    leaflet
      .marker([center.lat, center.lon], {
        icon: leaflet.divIcon({ className: "", html: '<div class="pin-me"></div>', iconSize: [18, 18] }),
        zIndexOffset: 1000,
      })
      .bindTooltip("You are here")
      .addTo(layer.current);

    for (const p of places) {
      const active = p.id === selectedId;
      leaflet
        .marker([p.lat, p.lon], {
          icon: leaflet.divIcon({
            className: "",
            html: `<div class="pin-place${active ? " is-active" : ""}"><span>${EMOJI[p.category]}</span></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 34],
          }),
          zIndexOffset: active ? 900 : 0,
        })
        .bindTooltip(p.name, { direction: "top", offset: [0, -30] })
        .on("click", () => onSelectRef.current(p.id))
        .addTo(layer.current);
    }

    const points: [number, number][] = [[center.lat, center.lon], ...places.slice(0, 15).map((p): [number, number] => [p.lat, p.lon])];
    if (!fit) return;
    if (points.length > 1) map.current.fitBounds(points, { padding: [36, 36], maxZoom: 15 });
    else map.current.setView([center.lat, center.lon], 14);
  }

  // Redraw markers and refit when results change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => draw(), [center.lat, center.lon, places]);

  // Highlight and pan to the selected place without refitting the view.
  useEffect(() => {
    draw(false);
    const sel = places.find((p) => p.id === selectedId);
    if (sel) map.current?.panTo([sel.lat, sel.lon], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={el} className="h-full min-h-[320px] w-full overflow-hidden rounded-2xl border bg-muted" />;
}
