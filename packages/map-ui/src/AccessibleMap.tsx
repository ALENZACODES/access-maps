import { useEffect, useId, useRef, useState } from "react";
import type { MapFeature } from "@access-maps/journey";
import { FeatureList } from "./FeatureList.js";
import { mapCopy, type MapLocale } from "./i18n.js";

export function AccessibleMap({
  features,
  locale,
  attribution,
}: {
  features: MapFeature[];
  locale: MapLocale;
  attribution: string;
}) {
  const text = mapCopy(locale);
  const headingId = useId();
  const listId = useId();
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ zoomIn: () => void; zoomOut: () => void; remove: () => void } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(features[0]?.id ?? null);
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const selected = features.find((feature) => feature.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId(features[0]?.id ?? null);
  }, [features]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;
    let cancelled = false;
    const markers: Array<{ remove: () => void }> = [];

    void import("maplibre-gl").then((module) => {
      if (cancelled || !canvasRef.current) return;
      const maplibregl = module.default;
      try {
        const next = new maplibregl.Map({
          container: canvasRef.current,
          attributionControl: false,
          style: {
            version: 8,
            sources: {},
            layers: [{ id: "background", type: "background", paint: { "background-color": "#f4f1ea" } }],
          },
          center: [features[0]?.lon ?? -79.38, features[0]?.lat ?? 43.65],
          zoom: 12,
          fadeDuration: 0,
        });
        mapRef.current = next;
        container.dataset.mapReady = "true";
        for (const feature of features) {
          const marker = new maplibregl.Marker({ element: markerButton(feature, () => setSelectedId(feature.id)) })
            .setLngLat([feature.lon, feature.lat])
            .addTo(next);
          markers.push(marker);
        }
        const lines = features.filter((feature) => feature.geometry && feature.geometry.length > 1);
        if (lines.length > 0) {
          next.on("load", () => {
            next.addSource("legs", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: lines.map((feature) => ({
                  type: "Feature",
                  properties: { id: feature.id },
                  geometry: { type: "LineString", coordinates: feature.geometry ?? [] },
                })),
              },
            });
            next.addLayer({
              id: "legs",
              type: "line",
              source: "legs",
              paint: { "line-color": "#1f4b3a", "line-width": 3 },
            });
          });
        }
      } catch {
        if (!cancelled) setMapMessage(text.mapUnavailable);
      }
    }).catch(() => {
      if (!cancelled) setMapMessage(text.mapUnavailable);
    });

    return () => {
      cancelled = true;
      for (const marker of markers) marker.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [features, text.mapUnavailable]);

  function zoom(direction: "in" | "out") {
    if (direction === "in") mapRef.current?.zoomIn();
    else mapRef.current?.zoomOut();
  }

  return (
    <section className="accessible-map" aria-labelledby={headingId}>
      <h2 id={headingId}>{text.mapHeading}</h2>
      <p id={`${headingId}-help`}>{text.instructions}</p>
      <a className="skip-link" href={`#${listId}`}>
        {text.skip}
      </a>
      <div className="map-toolbar">
        <button type="button" onClick={() => zoom("in")}>{text.zoomIn}</button>
        <button type="button" onClick={() => zoom("out")}>{text.zoomOut}</button>
      </div>
      <div className="map-layout">
        <div
          ref={canvasRef}
          className="map-canvas"
          aria-hidden="true"
          data-features={features.length}
        />
        <FeatureList
          features={features}
          locale={locale}
          selectedId={selectedId}
          onSelect={setSelectedId}
          listId={listId}
        />
      </div>
      {mapMessage ? <p role="status">{mapMessage}</p> : null}
      <p className="selection-live" role="status" aria-live="polite">
        {selected ? `${text.selected}: ${selected.name}. ${selected.status}` : ""}
      </p>
      <p className="map-attribution">{attribution}</p>
    </section>
  );
}

function markerButton(feature: MapFeature, onSelect: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "map-marker";
  button.textContent = feature.name;
  button.tabIndex = -1;
  button.addEventListener("click", onSelect);
  return button;
}
