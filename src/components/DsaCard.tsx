import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, MapPin, Navigation, Route, X } from 'lucide-react';
import { formatDistance } from '../lib/geo';
import type { RankedDsa } from '../types/dsa';
import type { RouteStatus, WalkingRoute } from '../types/route';

function duration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function DsaCard({
  item,
  selected,
  onSelect,
  route,
  routeStatus,
  routeMessage,
}: {
  item: RankedDsa;
  selected: boolean;
  onSelect: () => void;
  route: WalkingRoute | null;
  routeStatus: RouteStatus;
  routeMessage: string;
}) {
  const properties = item.feature.properties;
  const walkingDistance = route && selected ? route.distanceMetres : item.walkingDistanceMetres;
  const walkingDuration = route && selected ? route.durationSeconds : item.walkingDurationSeconds;
  const [photoOpen, setPhotoOpen] = useState(false);
  const photoTitleId = useId();
  const photoButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!photoOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPhotoOpen(false);
      if (event.key === 'Tab') {
        event.preventDefault();
        closeButton.current?.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      photoButton.current?.focus();
    };
  }, [photoOpen]);

  return (
    <article className={`result-card ${selected ? 'selected' : ''}`}>
      <button className="result-main" onClick={onSelect} aria-pressed={selected}>
        <span className="result-copy">
          <strong>{properties.BUILDING_N}</strong>
          <span>{properties.DESCRIPTION}</span>
        </span>
        <span className="distance">
          <b>{walkingDistance !== undefined ? formatDistance(walkingDistance) : formatDistance(item.distanceMetres)}</b>
          <small>
            {walkingDuration !== undefined ? <Clock3 size={12} /> : <Navigation size={12} />}
            {walkingDuration !== undefined ? duration(walkingDuration) : `${item.direction} · ${Math.round(item.bearingDegrees)}°`}
          </small>
        </span>
      </button>

      {selected && (
        <div className="result-detail">
          <button ref={photoButton} type="button" className="photo-button" onClick={() => setPhotoOpen(true)} aria-label={`View larger NEA photograph for ${properties.BUILDING_N}`}>
            <img
              src={properties.PHOTOURL}
              alt={`NEA reference photograph for ${properties.BUILDING_N}: ${properties.DESCRIPTION}`}
              loading="lazy"
              onError={(event) => { event.currentTarget.parentElement!.hidden = true; }}
            />
          </button>

          {routeStatus !== 'ready' && <div className={`route-state ${routeStatus}`} role="status" aria-live="polite">
              <Route size={15} />
              <span>{routeMessage}</span>
            </div>}

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

          <p><MapPin size={14} /> Routes may not include indoor, upper-level, or restricted paths. Verify the NEA description, photo, and on-site signs.</p>
        </div>
      )}

      {photoOpen && createPortal(
        <div className="photo-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhotoOpen(false); }}>
          <section className="window photo-modal" role="dialog" aria-modal="true" aria-labelledby={photoTitleId}>
            <header className="titlebar">
              <span id={photoTitleId}>NEA_PHOTO</span>
              <button ref={closeButton} type="button" className="photo-close" onClick={() => setPhotoOpen(false)} aria-label="Close photograph"><X size={17}/></button>
            </header>
            <div className="photo-modal-body">
              <img src={properties.PHOTOURL} alt={`NEA reference photograph for ${properties.BUILDING_N}: ${properties.DESCRIPTION}`}/>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </article>
  );
}
