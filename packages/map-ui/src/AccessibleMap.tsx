import { useEffect, useId, useRef, useState } from "react";
import type { MapFeature } from "@access-maps/journey";
import { FeatureList } from "./FeatureList.js";
import { mapCopy, statusText, type MapLocale } from "./i18n.js";

type MapHandle = {
  zoomIn: (options?: { duration?: number }) => void;
  zoomOut: (options?: { duration?: number }) => void;
  panBy: (offset: [number, number], options?: { duration?: number }) => void;
  easeTo: (options: { center: [number, number]; duration?: number }) => void;
  getCanvas: () => HTMLCanvasElement;
  on: (event: string, handler: () => void) => void;
  remove: () => void;
};

function motionDuration(): number {
  if (typeof window === "undefined") return 0;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
}

function disarmCanvas(map: MapHandle): void {
  const canvas = map.getCanvas();
  canvas.tabIndex = -1;
}

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
  const mapRef = useRef<MapHandle | null>(null);
  const markersRef = useRef<Array<{ id: string; element: HTMLElement; remove: () => void }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(features[0]?.id ?? null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const selected = features.find((feature) => feature.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId(features[0]?.id ?? null);
  }, [features]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;
    let cancelled = false;

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
        }) as unknown as MapHandle;
        mapRef.current = next;
        disarmCanvas(next);
        next.on("load", () => disarmCanvas(next));
        container.dataset.mapReady = "true";
        markersRef.current = [];
        for (const feature of features) {
          const element = markerButton(feature, () => setSelectedId(feature.id));
          const marker = new maplibregl.Marker({ element }).setLngLat([feature.lon, feature.lat]).addTo(next as never);
          markersRef.current.push({ id: feature.id, element, remove: () => marker.remove() });
        }
        paintSelection(markersRef.current, selectedRef.current);
        const current = features.find((feature) => feature.id === selectedRef.current);
        if (current) next.easeTo({ center: [current.lon, current.lat], duration: 0 });
        const lines = features.filter((feature) => feature.geometry && feature.geometry.length > 1);
        if (lines.length > 0) {
          next.on("load", () => {
            const map = next as unknown as {
              addSource: (id: string, source: unknown) => void;
              addLayer: (layer: unknown) => void;
            };
            map.addSource("legs", {
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
            map.addLayer({
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
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [features, text.mapUnavailable]);

  useEffect(() => {
    paintSelection(markersRef.current, selectedId);
    const feature = features.find((item) => item.id === selectedId);
    if (!feature || !mapRef.current) return;
    try {
      mapRef.current.easeTo({ center: [feature.lon, feature.lat], duration: motionDuration() });
    } catch {
      setMapMessage(text.mapUnavailable);
    }
  }, [features, selectedId, text.mapUnavailable]);

  function zoom(direction: "in" | "out") {
    const duration = motionDuration();
    if (direction === "in") mapRef.current?.zoomIn({ duration });
    else mapRef.current?.zoomOut({ duration });
    setMapMessage(direction === "in" ? text.zoomedIn : text.zoomedOut);
  }

  function pan(x: number, y: number) {
    mapRef.current?.panBy([x, y], { duration: motionDuration() });
    setMapMessage(text.showOnMap);
  }

  function showSelected() {
    const feature = features.find((item) => item.id === selectedId);
    if (!feature || !mapRef.current) return;
    mapRef.current.easeTo({ center: [feature.lon, feature.lat], duration: motionDuration() });
    paintSelection(markersRef.current, feature.id);
    setMapMessage(`${text.showOnMap}: ${feature.name}`);
  }

  return (
    <section className="accessible-map" aria-labelledby={headingId}>
      <h2 id={headingId}>{text.mapHeading}</h2>
      <p id={`${headingId}-help`}>{text.instructions}</p>
      <a className="skip-link" href={`#${listId}`}>
        {text.skip}
      </a>
      <div className="map-toolbar" role="group" aria-label={text.mapControls}>
        <button type="button" onClick={() => zoom("in")}>{text.zoomIn}</button>
        <button type="button" onClick={() => zoom("out")}>{text.zoomOut}</button>
        <button type="button" onClick={() => pan(0, -80)}>{text.panUp}</button>
        <button type="button" onClick={() => pan(0, 80)}>{text.panDown}</button>
        <button type="button" onClick={() => pan(-80, 0)}>{text.panLeft}</button>
        <button type="button" onClick={() => pan(80, 0)}>{text.panRight}</button>
        <button type="button" onClick={showSelected}>{text.showOnMap}</button>
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
      <p className="selection-live" role="status">
        {selected
          ? `${text.selected}${text.colon} ${selected.name}. ${statusText(locale, selected.statusCode)}. ${selected.status}`
          : ""}
        {mapMessage ? ` ${mapMessage}` : ""}
      </p>
      <p className="map-attribution">{attribution}</p>
    </section>
  );
}

function paintSelection(
  markers: Array<{ id: string; element: HTMLElement }>,
  selectedId: string | null,
): void {
  for (const marker of markers) {
    marker.element.dataset.selected = marker.id === selectedId ? "true" : "false";
  }
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
