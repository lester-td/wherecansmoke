import { Clock3, MapPin, Navigation, Route } from 'lucide-react';
import { formatDistance } from '../lib/geo';
import type { RankedDsa } from '../types/dsa';
import type { RouteStatus, WalkingRoute } from '../types/route';

function duration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function DsaCard({
  item,
  index,
  selected,
  onSelect,
  route,
  routeStatus,
  routeMessage,
}: {
  item: RankedDsa;
  index: number;
  selected: boolean;
  onSelect: () => void;
  route: WalkingRoute | null;
  routeStatus: RouteStatus;
  routeMessage: string;
}) {
  const properties = item.feature.properties;

  return (
    <article className={`result-card ${selected ? 'selected' : ''}`}>
      <button className="result-main" onClick={onSelect} aria-pressed={selected}>
        <span className="rank">{String(index + 1).padStart(2, '0')}</span>
        <span className="result-copy">
          <strong>{properties.BUILDING_N}</strong>
          <span>{properties.DESCRIPTION}</span>
        </span>
        <span className="distance">
          <b>{route && selected ? `${formatDistance(route.distanceMetres)} walk` : formatDistance(item.distanceMetres)}</b>
          <small>
            {route && selected ? <Clock3 size={12} /> : <Navigation size={12} />}
            {route && selected ? duration(route.durationSeconds) : `${item.direction} · ${Math.round(item.bearingDegrees)}° air-line`}
          </small>
        </span>
      </button>

      {selected && (
        <div className="result-detail">
          <img
            src={properties.PHOTOURL}
            alt={`NEA reference photograph for ${properties.BUILDING_N}: ${properties.DESCRIPTION}`}
            loading="lazy"
            onError={(event) => { event.currentTarget.hidden = true; }}
          />

          <div className={`route-state ${routeStatus}`} role="status" aria-live="polite">
            <Route size={15} />
            <span>{routeMessage}</span>
          </div>

          {route && (
            <ol className="route-steps" aria-label="Walking directions">
              {route.steps.filter((step) => step.instruction).map((step, stepIndex) => (
                <li key={`${step.way_points[0]}-${stepIndex}`}>
                  <span>{String(stepIndex + 1).padStart(2, '0')}</span>
                  <p>{step.instruction}</p>
                  <small>{formatDistance(step.distance)}</small>
                </li>
              ))}
            </ol>
          )}

          <p><MapPin size={14} /> Air-line distance: {formatDistance(item.distanceMetres)}. Route data uses OpenStreetMap and may not reflect indoor, upper-level, or restricted access.</p>
          <p>Coordinates are a reference, not a legal guarantee. Follow the NEA description, photograph and on-site signs.</p>
        </div>
      )}
    </article>
  );
}
