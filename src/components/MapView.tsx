import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoJsonObject } from 'geojson';
import noSmokingZonesUrl from '../data/no-smoking-zones.geojson?url';
import nparksNoSmokingUrl from '../data/nparks-no-smoking.geojson?url';
import type { Coordinates, DsaCollection } from '../types/dsa';
import type { NoSmokingCollection } from '../types/noSmoking';
import type { WalkingRoute } from '../types/route';

const ORCHARD: L.LatLngExpression = [1.3039, 103.8338];
const ONEMAP_GREY_TILES = 'https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png';
const ATTRIBUTION = '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> © contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';

async function loadNoSmokingCollection(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Boundary data request failed: ${response.status}`);
  return response.json() as Promise<NoSmokingCollection>;
}

export default function MapView({
  data,
  position,
  searchOrigin,
  selectedId,
  route,
  showNeaNoSmoking,
  showNparksNoSmoking,
  onSelect,
  onManualSelect,
}: {
  data: DsaCollection;
  position: Coordinates | null;
  searchOrigin: Coordinates | null;
  selectedId: number | null;
  route: WalkingRoute | null;
  showNeaNoSmoking: boolean;
  showNparksNoSmoking: boolean;
  onSelect: (id: number) => void;
  onManualSelect: (value: Coordinates) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dsaLayerRef = useRef<L.LayerGroup | null>(null);
  const neaLayerRef = useRef<L.GeoJSON | null>(null);
  const nparksLayerRef = useRef<L.GeoJSON | null>(null);
  const positionLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [boundaryData, setBoundaryData] = useState<{
    nea: NoSmokingCollection | null;
    nparks: NoSmokingCollection | null;
    failed: boolean;
  }>({ nea: null, nparks: null, failed: false });

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      loadNoSmokingCollection(noSmokingZonesUrl),
      loadNoSmokingCollection(nparksNoSmokingUrl),
    ]).then(([nea, nparks]) => {
      if (!active) return;
      setBoundaryData({
        nea: nea.status === 'fulfilled' ? nea.value : null,
        nparks: nparks.status === 'fulfilled' ? nparks.value : null,
        failed: nea.status === 'rejected' || nparks.status === 'rejected',
      });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!node.current || mapRef.current) return;
    const map = L.map(node.current, {
      center: ORCHARD,
      zoom: 16,
      minZoom: 11,
      maxZoom: 20,
      zoomControl: true,
      attributionControl: false,
    });

    const panes = [
      ['no-smoking-pane', 410],
      ['accuracy-pane', 420],
      ['route-pane', 430],
      ['dsa-pane', 440],
    ] as const;
    panes.forEach(([name, zIndex]) => {
      const pane = map.createPane(name);
      pane.style.zIndex = String(zIndex);
      if (name !== 'dsa-pane') pane.style.pointerEvents = 'none';
    });

    const tiles = L.tileLayer(ONEMAP_GREY_TILES, {
      minZoom: 11,
      maxZoom: 20,
      attribution: ATTRIBUTION,
    });
    tiles.on('tileload', () => setMapError(null));
    tiles.on('tileerror', () => setMapError('The OneMap basemap could not be loaded.'));
    tiles.addTo(map);
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);

    const handleClick = (event: L.LeafletMouseEvent) => {
      onManualSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng, source: 'manual' });
    };
    map.on('click', handleClick);
    mapRef.current = map;
    setMapReady(true);

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resizeObserver.observe(node.current);
    window.setTimeout(() => map.invalidateSize({ animate: false }), 0);

    return () => {
      resizeObserver.disconnect();
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      dsaLayerRef.current = null;
      neaLayerRef.current = null;
      nparksLayerRef.current = null;
      positionLayerRef.current = null;
      routeLayerRef.current = null;
      setMapReady(false);
    };
  }, [onManualSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    dsaLayerRef.current?.remove();

    const layer = L.layerGroup();
    data.features.forEach((feature) => {
      const [longitude, latitude] = feature.geometry.coordinates;
      const selected = feature.properties.OBJECTID === selectedId;
      const marker = L.circleMarker([latitude, longitude], {
        pane: 'dsa-pane',
        radius: selected ? 10 : 7,
        color: selected ? '#0b0c0c' : '#d6ff3f',
        weight: selected ? 3 : 2,
        fillColor: selected ? '#d6ff3f' : '#141616',
        fillOpacity: 1,
        bubblingMouseEvents: false,
      });
      marker.bindTooltip(feature.properties.BUILDING_N, { direction: 'top', offset: [0, -8] });
      marker.on('click', () => onSelect(feature.properties.OBJECTID));
      marker.addTo(layer);
    });
    layer.addTo(map);
    dsaLayerRef.current = layer;
    return () => {
      layer.remove();
      if (dsaLayerRef.current === layer) dsaLayerRef.current = null;
    };
  }, [data, mapReady, onSelect, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    neaLayerRef.current?.remove();
    neaLayerRef.current = null;
    if (!boundaryData.nea) return;

    const layer = L.geoJSON(boundaryData.nea as unknown as GeoJsonObject, {
      pane: 'no-smoking-pane',
      interactive: false,
      style: { color: '#ff625e', weight: 2, opacity: 0.95, dashArray: '7 5', fillColor: '#ff625e', fillOpacity: 0.14 },
    });
    neaLayerRef.current = layer;
    if (showNeaNoSmoking) layer.addTo(map);
    return () => {
      layer.remove();
      if (neaLayerRef.current === layer) neaLayerRef.current = null;
    };
  }, [boundaryData.nea, mapReady, showNeaNoSmoking]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    nparksLayerRef.current?.remove();
    nparksLayerRef.current = null;
    if (!boundaryData.nparks) return;

    const layer = L.geoJSON(boundaryData.nparks as unknown as GeoJsonObject, {
      pane: 'no-smoking-pane',
      interactive: false,
      style: { color: '#ffb84d', weight: 1.5, opacity: 0.9, fillColor: '#ffb84d', fillOpacity: 0.16 },
    });
    nparksLayerRef.current = layer;
    if (showNparksNoSmoking) layer.addTo(map);
    return () => {
      layer.remove();
      if (nparksLayerRef.current === layer) nparksLayerRef.current = null;
    };
  }, [boundaryData.nparks, mapReady, showNparksNoSmoking]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    positionLayerRef.current?.remove();
    positionLayerRef.current = null;
    if (!position) return;

    const point: L.LatLngExpression = [position.latitude, position.longitude];
    const layer = L.layerGroup();
    if (position.accuracy && position.accuracy > 0) {
      L.circle(point, {
        pane: 'accuracy-pane',
        radius: position.accuracy,
        color: '#69c9ff',
        weight: 1,
        fillColor: '#69c9ff',
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(layer);
    }

    const hasHeading = position.source === 'device' && position.heading !== undefined && (position.speed === undefined || position.speed >= 0.4);
    if (hasHeading) {
      const heading = ((position.heading ?? 0) % 360 + 360) % 360;
      L.marker(point, {
        interactive: false,
        icon: L.divIcon({
          className: 'gps-heading-marker',
          html: `<span class="gps-heading-arrow" style="transform:rotate(${heading}deg)" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2 20 21 12 17 4 21Z"/></svg></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(layer);
    } else {
      L.marker(point, {
        interactive: false,
        icon: L.divIcon({ className: 'map-user-marker', iconSize: [14, 14], iconAnchor: [7, 7] }),
      }).addTo(layer);
    }
    layer.addTo(map);
    positionLayerRef.current = layer;
    return () => {
      layer.remove();
      if (positionLayerRef.current === layer) positionLayerRef.current = null;
    };
  }, [mapReady, position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    routeLayerRef.current?.remove();
    routeLayerRef.current = null;

    if (route && route.coordinates.length > 1) {
      const points = route.coordinates.map(([longitude, latitude]) => L.latLng(latitude, longitude));
      const layer = L.polyline(points, { pane: 'route-pane', color: '#d6ff3f', weight: 5, opacity: 0.9, lineJoin: 'bevel', interactive: false }).addTo(map);
      routeLayerRef.current = layer;
      map.fitBounds(layer.getBounds(), { padding: [36, 36], maxZoom: 18, animate: false });
    } else if (searchOrigin) {
      map.setView([searchOrigin.latitude, searchOrigin.longitude], 17, { animate: false });
    }
  }, [mapReady, route, searchOrigin?.latitude, searchOrigin?.longitude]);

  const alerts = [mapError, boundaryData.failed ? 'Some no-smoking boundaries could not be loaded.' : null]
    .filter((message): message is string => Boolean(message));

  return <div className="map-wrap">
    <div ref={node} className="map" role="application" aria-label="Map of designated smoking areas, no-smoking areas, and the selected walking route. Click or tap to choose a starting location."/>
    {alerts.length > 0 && <div className="map-data-alert" role="status">{alerts.map((message) => <div key={message}>{message}</div>)}</div>}
  </div>;
}
