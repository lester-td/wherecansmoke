import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cigarette, Crosshair, ExternalLink, LocateFixed, MapPin, MapPinned } from 'lucide-react';
import rawData from './data/dsa.geojson';
import { DsaCard } from './components/DsaCard';
import { Window } from './components/Window';
import { useGeolocation } from './hooks/useGeolocation';
import { useWalkingMatrix } from './hooks/useWalkingMatrix';
import { useWalkingRoute } from './hooks/useWalkingRoute';
import { distanceMetres, rankDsas } from './lib/geo';
import { validateDataset } from './lib/validate';
import type { Coordinates, DsaCollection } from './types/dsa';

const MapView = lazy(() => import('./components/MapView'));
const ORCHARD_CENTRE = { latitude: 1.3048, longitude: 103.8335 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function datasetDate(collection: DsaCollection) {
  const latest = collection.features.reduce((value, feature) => feature.properties.FMEL_UPD_D > value ? feature.properties.FMEL_UPD_D : value, '');
  if (!/^\d{14}$/.test(latest)) return 'Unknown';
  return `${latest.slice(6, 8)} ${MONTHS[Number(latest.slice(4, 6)) - 1]} ${latest.slice(0, 4)}`;
}

let dataError = '';
let data: DsaCollection = { type: 'FeatureCollection', features: [] };
try {
  validateDataset(rawData);
  data = rawData;
} catch (error) {
  dataError = error instanceof Error ? error.message : 'Unknown dataset error';
}
const DATASET_DATE = datasetDate(data);

export default function App() {
  const location = useGeolocation();
  const locateOnLoad = useRef(location.locate);
  const displayedPosition = location.livePosition ?? location.position;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showNeaNoSmoking, setShowNeaNoSmoking] = useState(true);
  const [showNparksNoSmoking, setShowNparksNoSmoking] = useState(true);
  const straightRanked = useMemo(() => location.position ? rankDsas(data, location.position) : [], [location.position]);
  const shortlist = useMemo(() => straightRanked.slice(0, 5), [straightRanked]);
  const walkingMatrix = useWalkingMatrix(location.position, shortlist);
  const ranked = useMemo(() => {
    if (!walkingMatrix.matrix) return shortlist;
    return shortlist.map((item, index) => ({
      ...item,
      walkingDistanceMetres: walkingMatrix.matrix?.distancesMetres[index] ?? undefined,
      walkingDurationSeconds: walkingMatrix.matrix?.durationsSeconds[index] ?? undefined,
    })).sort((a, b) => (a.walkingDistanceMetres ?? Number.POSITIVE_INFINITY) - (b.walkingDistanceMetres ?? Number.POSITIVE_INFINITY) || a.distanceMetres - b.distanceMetres);
  }, [shortlist, walkingMatrix.matrix]);
  const visible = ranked;
  const matrixPending = location.position !== null && (walkingMatrix.status === 'idle' || walkingMatrix.status === 'loading');
  const selected = matrixPending ? undefined : ranked.find((item) => item.feature.properties.OBJECTID === selectedId);
  const destination = useMemo<Coordinates | null>(() => {
    if (!selected) return null;
    const [longitude, latitude] = selected.feature.geometry.coordinates;
    return { latitude, longitude };
  }, [selected]);
  const walking = useWalkingRoute(location.position, destination);

  useEffect(() => {
    locateOnLoad.current();
  }, []);

  useEffect(() => {
    setSelectedId(null);
  }, [location.position?.latitude, location.position?.longitude]);

  const chooseManual = useCallback((point: Coordinates) => {
    setSelectedId(null);
    location.setManual(point);
  }, [location.setManual]);

  const outside = displayedPosition && distanceMetres(displayedPosition, ORCHARD_CENTRE) > 5000;
  const lowAccuracy = displayedPosition?.source === 'device' && (displayedPosition.accuracy ?? 0) > 75;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="wordmark"><Cigarette className="wordmark-icon" aria-hidden="true"/>WhereCanSmoke?</div>
      </header>

      <main>
        {dataError && <div className="alert danger"><strong>Dataset failure</strong><span>{dataError}</span></div>}

        <div className={`status-strip ${location.status}`} role="status" aria-live="polite">
          {location.status === 'idle' ? (
            <>
              <div className="tap-prompt"><strong>Tap to set location</strong></div>
              <span className="status-or">OR</span>
              <button className="location-button" onClick={location.locate}><LocateFixed/>Use GPS</button>
            </>
          ) : (
            <>
              {location.status === 'ready' ? (
                <>
                  <MapPin className="status-location-icon" aria-hidden="true"/>
                  <div><strong>{displayedPosition?.source === 'manual' ? 'Using selected point' : 'Using GPS location'}</strong></div>
                </>
              ) : location.status === 'locating' ? (
                <>
                  <Crosshair className="status-location-icon spin" aria-hidden="true"/>
                  <div><strong>Locating…</strong></div>
                </>
              ) : (
                <>
                  <span className="status-light"/>
                  <div><strong>{location.status.toUpperCase()}</strong><span>{location.message}</span></div>
                </>
              )}
              <button className="location-button" onClick={location.locate} disabled={location.status === 'locating'}>
                <LocateFixed/>{location.isTracking ? 'Update results' : 'Use GPS'}
              </button>
            </>
          )}
        </div>

        {lowAccuracy && <div className="alert warning"><strong>LOW GPS ACCURACY</strong><span>Dense buildings can cause GPS drift. Your reported accuracy is ±{Math.round(displayedPosition!.accuracy!)} m; compare nearby results and use on-site signs.</span></div>}
        {outside && <div className="alert warning"><strong>OUTSIDE EXPECTED AREA</strong><span>This dataset focuses on Orchard Road and your position is more than 5 km away. Results may not reflect the nearest DSA elsewhere in Singapore.</span></div>}

        <div className="dashboard">
          <div className="map-column">
            <Window title="AREA_MAP" className="map-window">
              <Suspense fallback={<div className="map-loading">Loading map module…</div>}>
                <MapView data={data} position={displayedPosition} searchOrigin={location.position} selectedId={selected?.feature.properties.OBJECTID ?? null} route={walking.route} showNeaNoSmoking={showNeaNoSmoking} showNparksNoSmoking={showNparksNoSmoking} onSelect={setSelectedId} onManualSelect={chooseManual}/>
              </Suspense>
            </Window>

            <Window title="LEGEND" meta="TAP AREAS TO TOGGLE" className="legend-window">
              <div className="legend-content">
                <span><i className="legend-marker dsa" aria-hidden="true"/>Smoking Area</span>
                <button className="legend-toggle" type="button" aria-pressed={showNeaNoSmoking} onClick={() => setShowNeaNoSmoking((visible) => !visible)}>
                  <i className="legend-area nea" aria-hidden="true"/>NEA No-Smoking Zone
                </button>
                <button className="legend-toggle" type="button" aria-pressed={showNparksNoSmoking} onClick={() => setShowNparksNoSmoking((visible) => !visible)}>
                  <i className="legend-area nparks" aria-hidden="true"/>NParks No-Smoking Area
                </button>
                <span><i className="legend-marker user" aria-hidden="true"/>You</span>
                <span><i className="legend-line" aria-hidden="true"/>Route</span>
              </div>
            </Window>
          </div>

          <Window title="NEAREST_DSA" className="results-window">
            {!location.position ? (
              <div className="empty-state"><MapPinned size={34}/><strong>No start point</strong><p>Use your location, or tap the map to choose a point manually.</p></div>
            ) : matrixPending ? (
              <div className="empty-state matrix-loading"><Crosshair className="spin" size={34}/><strong>Calculating walking distances</strong><p>Checking the five nearest smoking areas.</p></div>
            ) : (
              <div className="results-list">
                {(walkingMatrix.status === 'error' || walkingMatrix.status === 'unavailable') && <div className="matrix-fallback">Walking estimates unavailable. Results use straight-line distance.</div>}
                {visible.map((item) => {
                  const isSelected = item.feature.properties.OBJECTID === selected?.feature.properties.OBJECTID;
                  return <DsaCard key={item.feature.properties.OBJECTID} item={item} selected={isSelected} onSelect={() => setSelectedId(item.feature.properties.OBJECTID)} route={isSelected ? walking.route : null} routeStatus={isSelected ? walking.status : 'idle'} routeMessage={isSelected ? walking.message : 'Select to calculate walking directions.'}/>;
                })}
              </div>
            )}
          </Window>
        </div>

        <Window as="footer" title="PROJECT_INFO" className="footer-window">
          <div className="footer-content">
            <div className="footer-brand">WhereCanSmoke / v0.1</div>
            <p className="footer-disclaimer">WhereCanSmoke? is an independent, unofficial project. It is not affiliated with or endorsed by NEA, NParks, OneMap, SLA, openrouteservice, OpenStreetMap, or the Singapore Government.</p>
            <div className="footer-dataset-date">DSA Dataset Date: {DATASET_DATE}</div>
            <div className="footer-links">
              <div className="footer-link-row">
                <a href="https://data.gov.sg/datasets/d_d0fa8f07ef80ab23feaa3b870323bf27/view" target="_blank" rel="noreferrer">Designated Smoking Areas (NEA) <ExternalLink size={12}/></a>
                <span aria-hidden="true">/</span>
                <a href="https://data.gov.sg/datasets/d_491641889c8add4c7835721bd72aa84a/view" target="_blank" rel="noreferrer">No Smoking Zones (NEA) <ExternalLink size={12}/></a>
                <span aria-hidden="true">/</span>
                <a href="https://data.gov.sg/datasets/d_3c8343c1efaeb05d4d1dbcdd0f599077/view" target="_blank" rel="noreferrer">No-Smoking Locations (NParks) <ExternalLink size={12}/></a>
              </div>
              <div className="footer-link-row">
                <a href="https://www.nea.gov.sg/ORNSZ" target="_blank" rel="noreferrer">NEA ORNSZ <ExternalLink size={12}/></a>
                <span aria-hidden="true">/</span>
                <a href="https://www.onemap.gov.sg/" target="_blank" rel="noreferrer">SLA OneMap <ExternalLink size={12}/></a>
                <span aria-hidden="true">/</span>
                <a href="https://openrouteservice.org/" target="_blank" rel="noreferrer">openrouteservice <ExternalLink size={12}/></a>
              </div>
            </div>
          </div>
        </Window>
      </main>
    </div>
  );
}
