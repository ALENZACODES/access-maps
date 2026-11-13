import { useRef } from "react";
import type { MapFeature } from "@access-maps/journey";
import { mapCopy, statusLabel, type MapLocale } from "./i18n.js";

export function FeatureList({
  features,
  locale,
  selectedId,
  onSelect,
  listId,
}: {
  features: MapFeature[];
  locale: MapLocale;
  selectedId: string | null;
  onSelect: (id: string) => void;
  listId: string;
}) {
  const text = mapCopy(locale);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function move(next: number) {
    const count = features.length;
    const index = ((next % count) + count) % count;
    const feature = features[index];
    const button = buttons.current[index];
    if (!feature || !button) return;
    onSelect(feature.id);
    button.focus();
  }

  if (features.length === 0) {
    return <p>{text.empty}</p>;
  }

  return (
    <ul id={listId} className="feature-list" aria-label={text.listLabel}>
      {features.map((feature, index) => {
        const selected = feature.id === selectedId;
        return (
          <li key={feature.id}>
            <button
              type="button"
              ref={(node) => {
                buttons.current[index] = node;
              }}
              tabIndex={selected || (selectedId === null && index === 0) ? 0 : -1}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(feature.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  move(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  move(features.length - 1);
                }
              }}
            >
              <span className="feature-name">{feature.name}</span>
              <span className={`status status-${feature.statusCode}`}>{statusLabel(locale, feature.statusCode)}</span>
              <span className="feature-detail">
                {text.source}: {feature.source}. {text.tier}: {feature.tier ?? "UNKNOWN"}. {feature.status}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
