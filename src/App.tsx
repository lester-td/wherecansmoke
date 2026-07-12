import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Crosshair, ExternalLink, Info, LocateFixed, MapPinned, ShieldCheck } from 'lucide-react';
import rawData from './data/dsa.geojson';
import { DsaCard } from './components/DsaCard';
import { Window } from './components/Window';
import { useGeolocation } from './hooks/useGeolocation';
import { useWalkingRoute } from './hooks/useWalkingRoute';
import { distanceMetres, rankDsas } from './lib/geo';
import { validateDataset } from './lib/validate';
import type { Coordinates, DsaCollection } from './types/dsa';

const MapView = lazy(() => import('./components/MapView'));
const ORCHARD_CENTRE = { latitude: 1.3048, longitude: 103.8335 };

let dataError = '';
let data: DsaCollection = { type: 'FeatureCollection', features: [] };
try {
  validateDataset(rawData);
  data = rawData;
} catch (error) {
  dataError = error instanceof Error ? error.message : 'Unknown dataset error';
}

export default function App() {
  const location = useGeolocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const ranked = useMemo(() => location.position ? rankDsas(data, location.position) : [], [location.position]);
  const visible = ranked.slice(0, 5);
  const selected = ranked.find((item) => item.feature.properties.OBJECTID === selectedId) ?? ranked[0];
  const destination = useMemo<Coordinates | null>(() => {
    if (!selected) return null;
    const [longitude, latitude] = selected.feature.geometry.coordinates;
    return { latitude, longitude };
  }, [selected]);
  const walking = useWalkingRoute(location.position, destination);

  useEffect(() => {
    if (ranked.length && selectedId === null) setSelectedId(ranked[0].feature.properties.OBJECTID);
  }, [ranked, selectedId]);

  const chooseManual = useCallback((point: Coordinates) => {
    location.setManual(point);
    const first = rankDsas(data, point)[0];
    if (first) setSelectedId(first.feature.properties.OBJECTID);
  }, [location.setManual]);

  const outside = location.position && distanceMetres(location.position, ORCHARD_CENTRE) > 5000;
  const lowAccuracy = location.position?.source === 'device' && (location.position.accuracy ?? 0) > 75;

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/code" className="back-link">← /code</a>
        <div className="wordmark"><span className="signal-dot"/>WhereCanSmoke?</div>
        <button className="icon-button" onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })} aria-label="About this project"><Info size={18}/></button>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">SINGAPORE / DSA LOCATOR / UNOFFICIAL</p>
          <h1>Find a place.<br/><span>Check the signs.</span></h1>
          <p>Find the nearest designated smoking area in Singapore using your current location.</p>
          <button className="mechanical primary" onClick={location.locate} disabled={location.status === 'locating'}>
            {location.status === 'locating' ? <><Crosshair className="spin"/>Locating…</> : <><LocateFixed/>Use my location</>}
          </button>
          <p className="privacy"><ShieldCheck size={14}/> Coordinates are held only in this tab and sent to the routing proxy only when calculating a walking route.</p>
        </section>

        {dataError && <div className="alert danger"><strong>Dataset failure</strong><span>{dataError}</span></div>}

        <div className={`status-strip ${location.status}`} role="status" aria-live="polite">
          <span className="status-light"/>
          <div><strong>{location.status === 'idle' ? 'READY FOR LOCATION' : location.status.toUpperCase()}</strong><span>{location.message}</span></div>
          {location.position && <code>{location.position.latitude.toFixed(5)}, {location.position.longitude.toFixed(5)}{location.position.accuracy ? ` · ±${Math.round(location.position.accuracy)} m` : ''}</code>}
        </div>

        {lowAccuracy && <div className="alert warning"><strong>LOW GPS ACCURACY</strong><span>Dense Orchard buildings can cause drift. Your reported accuracy is ±{Math.round(location.position!.accuracy!)} m; compare nearby results and use on-site signs.</span></div>}
        {outside && <div className="alert warning"><strong>OUTSIDE EXPECTED AREA</strong><span>This dataset focuses on Orchard Road and your position is more than 5 km away. Results may not reflect the nearest DSA elsewhere in Singapore.</span></div>}

        <div className="dashboard">
          <Window title="AREA_MAP" meta={walking.status === 'ready' ? 'WALKING ROUTE' : `${data.features.length} POINTS`} className="map-window">
            <Suspense fallback={<div className="map-loading">Loading map module…</div>}>
              <MapView data={data} position={location.position} selectedId={selected?.feature.properties.OBJECTID ?? null} route={walking.route} onSelect={setSelectedId} onManualSelect={chooseManual}/>
            </Suspense>
          </Window>

          <Window title="NEAREST_DSA" meta={walking.status === 'ready' ? 'ORS WALK ROUTE' : location.position ? 'AIR-LINE SHORTLIST' : 'AWAITING FIX'} className="results-window">
            {!location.position ? (
              <div className="empty-state"><MapPinned size={34}/><strong>No start point</strong><p>Use your location, or tap the map to choose a point manually.</p></div>
            ) : (
              <div className="results-list">
                {visible.map((item, index) => {
                  const isSelected = item.feature.properties.OBJECTID === selected?.feature.properties.OBJECTID;
                  return <DsaCard key={item.feature.properties.OBJECTID} item={item} index={index} selected={isSelected} onSelect={() => setSelectedId(item.feature.properties.OBJECTID)} route={isSelected ? walking.route : null} routeStatus={isSelected ? walking.status : 'idle'} routeMessage={isSelected ? walking.message : 'Select to calculate walking directions.'}/>;
                })}
              </div>
            )}
          </Window>
        </div>

        <Window title="FIELD_NOTES" meta="READ BEFORE USE" className="notes">
          <div className="notes-grid">
            <div><strong>01 / DISTANCE</strong><p>Results are shortlisted by air-line distance. The selected result shows an ORS pedestrian route when available.</p></div>
            <div><strong>02 / VERIFY</strong><p>DSAs can be behind buildings, in service yards or on upper levels. Read the description, view the photo and verify signs on site.</p></div>
            <div><strong>03 / COVERAGE</strong><p>Walking routes use OpenStreetMap data and may not know indoor, upper-level or restricted-access paths.</p></div>
          </div>
        </Window>

        <section className="about" id="about">
          <p className="eyebrow">DATA & RESPONSIBILITY</p>
          <h2>Useful reference.<br/>Not an official direction.</h2>
          <p>WhereCanSmoke? is an independent, unofficial project. It is not affiliated with or endorsed by NEA, OneMap, SLA, openrouteservice, OpenStreetMap, or the Singapore Government.</p>
          <div className="source-row"><span><b>Source snapshot</b>NEA Designated Smoking Areas via data.gov.sg</span><span><b>Dataset coverage</b>November 2025</span><span><b>Published</b>19 March 2026</span></div>
          <div className="link-row"><a href="https://data.gov.sg/datasets/d_d0fa8f07ef80ab23feaa3b870323bf27/view" target="_blank" rel="noreferrer">DSA dataset <ExternalLink size={13}/></a><a href="https://www.nea.gov.sg/ORNSZ" target="_blank" rel="noreferrer">NEA ORNSZ <ExternalLink size={13}/></a><a href="https://www.onemap.gov.sg/" target="_blank" rel="noreferrer">OneMap <ExternalLink size={13}/></a><a href="https://openrouteservice.org/" target="_blank" rel="noreferrer">openrouteservice <ExternalLink size={13}/></a></div>
        </section>
      </main>

      <footer><span>WhereCanSmoke? / v0.1</span><span>DATA: NEA · MAP: ONEMAP/SLA · ROUTES: ORS/OSM</span></footer>
    </div>
  );
}
