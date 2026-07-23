import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, GeoJSON as GeoJson, LineString, Point, Polygon } from 'geojson';
import noSmokingZonesUrl from '../data/no-smoking-zones.geojson?url';
import nparksNoSmokingUrl from '../data/nparks-no-smoking.geojson?url';
import type { Coordinates, DsaCollection } from '../types/dsa';
import type { NoSmokingCollection } from '../types/noSmoking';
import type { WalkingRoute } from '../types/route';

const ORCHARD: [number, number] = [103.8338, 1.3039];
const ONEMAP_GREY_STYLE = 'https://www.onemap.gov.sg/maps/json/raster/mbstyle/Grey.json';
const DSA_SOURCE = 'designated-smoking-areas';
const DSA_LAYER = 'designated-smoking-areas-points';
const NEA_SOURCE = 'nea-no-smoking-zone';
const NEA_FILL = 'nea-no-smoking-zone-fill';
const NEA_LINE = 'nea-no-smoking-zone-line';
const NPARKS_SOURCE = 'nparks-no-smoking-areas';
const NPARKS_FILL = 'nparks-no-smoking-areas-fill';
const NPARKS_LINE = 'nparks-no-smoking-areas-line';
const ACCURACY_SOURCE = 'gps-accuracy';
const ACCURACY_FILL = 'gps-accuracy-fill';
const ACCURACY_LINE = 'gps-accuracy-line';
const ROUTE_SOURCE = 'walking-route';
const ROUTE_LAYER = 'walking-route-line';

async function loadNoSmokingCollection(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Boundary data request failed: ${response.status}`);
  return response.json() as Promise<NoSmokingCollection>;
}

function setGeoJson(map: maplibregl.Map, id: string, data: GeoJson) {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(id, { type: 'geojson', data });
}

function routeGeoJson(route: WalkingRoute | null): FeatureCollection<LineString> {
  return route ? {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: route.coordinates },
    }],
  } : { type: 'FeatureCollection', features: [] };
}

function accuracyGeoJson(position: Coordinates | null): FeatureCollection<Polygon> {
  if (!position?.accuracy || position.accuracy <= 0) return { type: 'FeatureCollection', features: [] };
  const latitudeRadius = position.accuracy / 111_320;
  const longitudeRadius = latitudeRadius / Math.max(Math.cos(position.latitude * Math.PI / 180), 0.01);
  const ring: Array<[number, number]> = [];
  for (let index = 0; index <= 64; index += 1) {
    const angle = index / 64 * Math.PI * 2;
    ring.push([
      position.longitude + Math.cos(angle) * longitudeRadius,
      position.latitude + Math.sin(angle) * latitudeRadius,
    ]);
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }],
  };
}

function overlayAnchor(map: maplibregl.Map) {
  return [ACCURACY_FILL, ROUTE_LAYER, DSA_LAYER].find((id) => map.getLayer(id));
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
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [boundaryData, setBoundaryData] = useState<{ nea: NoSmokingCollection | null; nparks: NoSmokingCollection | null; failed: boolean }>({ nea: null, nparks: null, failed: false });
  const dsaGeoJson = useMemo<FeatureCollection<Point>>(() => ({
    type: 'FeatureCollection',
    features: data.features.map((feature) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: feature.properties,
    })),
  }), [data]);

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
    let map: maplibregl.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const initialize = () => {
      if (!node.current || mapRef.current) return;
      map = new maplibregl.Map({
        container: node.current,
        style: ONEMAP_GREY_STYLE,
        center: ORCHARD,
        zoom: 16,
        minZoom: 11,
        maxZoom: 20,
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
      map.addControl(new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" width="16" height="16"/> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> © contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>',
      }), 'bottom-right');

      const handleLoad = () => {
        setMapError(null);
        setMapReady(true);
      };
      const handleError = () => setMapError('The OneMap basemap could not be loaded.');
      const handleClick = (event: maplibregl.MapMouseEvent) => {
        if (!map) return;
        if (map.getLayer(DSA_LAYER) && map.queryRenderedFeatures(event.point, { layers: [DSA_LAYER] }).length) return;
        onManualSelect({ latitude: event.lngLat.lat, longitude: event.lngLat.lng, source: 'manual' });
      };
      resizeObserver = new ResizeObserver(() => map?.resize());
      resizeObserver.observe(node.current);
      // OneMap's raster style can be ready for custom layers before every
      // initial tile finishes loading, so do not gate overlays on `load` alone.
      map.once('style.load', handleLoad);
      map.once('load', handleLoad);
      map.on('error', handleError);
      map.on('click', handleClick);
      mapRef.current = map;
    };
    const initializationTimer = window.setTimeout(initialize, 0);

    return () => {
      window.clearTimeout(initializationTimer);
      resizeObserver?.disconnect();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      setMapReady(false);
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [onManualSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const visibility = (visible: boolean) => visible ? 'visible' as const : 'none' as const;

    if (boundaryData.nea) {
      setGeoJson(map, NEA_SOURCE, boundaryData.nea as unknown as FeatureCollection);
      if (!map.getLayer(NEA_FILL)) map.addLayer({ id: NEA_FILL, type: 'fill', source: NEA_SOURCE, paint: { 'fill-color': '#ff625e', 'fill-opacity': 0.14 } }, overlayAnchor(map));
      if (!map.getLayer(NEA_LINE)) map.addLayer({ id: NEA_LINE, type: 'line', source: NEA_SOURCE, paint: { 'line-color': '#ff625e', 'line-width': 2, 'line-opacity': 0.95, 'line-dasharray': [3.5, 2.5] } }, overlayAnchor(map));
      map.setLayoutProperty(NEA_FILL, 'visibility', visibility(showNeaNoSmoking));
      map.setLayoutProperty(NEA_LINE, 'visibility', visibility(showNeaNoSmoking));
    }

    if (boundaryData.nparks) {
      setGeoJson(map, NPARKS_SOURCE, boundaryData.nparks as unknown as FeatureCollection);
      if (!map.getLayer(NPARKS_FILL)) map.addLayer({ id: NPARKS_FILL, type: 'fill', source: NPARKS_SOURCE, paint: { 'fill-color': '#ffb84d', 'fill-opacity': 0.16 } }, overlayAnchor(map));
      if (!map.getLayer(NPARKS_LINE)) map.addLayer({ id: NPARKS_LINE, type: 'line', source: NPARKS_SOURCE, paint: { 'line-color': '#ffb84d', 'line-width': 1.5, 'line-opacity': 0.9 } }, overlayAnchor(map));
      map.setLayoutProperty(NPARKS_FILL, 'visibility', visibility(showNparksNoSmoking));
      map.setLayoutProperty(NPARKS_LINE, 'visibility', visibility(showNparksNoSmoking));
    }
  }, [boundaryData.nea, boundaryData.nparks, mapReady, showNeaNoSmoking, showNparksNoSmoking]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    setGeoJson(map, ACCURACY_SOURCE, accuracyGeoJson(position));
    if (!map.getLayer(ACCURACY_FILL)) map.addLayer({ id: ACCURACY_FILL, type: 'fill', source: ACCURACY_SOURCE, paint: { 'fill-color': '#69c9ff', 'fill-opacity': 0.12 } });
    if (!map.getLayer(ACCURACY_LINE)) map.addLayer({ id: ACCURACY_LINE, type: 'line', source: ACCURACY_SOURCE, paint: { 'line-color': '#69c9ff', 'line-width': 1 } });
  }, [mapReady, position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    setGeoJson(map, ROUTE_SOURCE, routeGeoJson(route));
    if (!map.getLayer(ROUTE_LAYER)) map.addLayer({
      id: ROUTE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'bevel', 'line-cap': 'round' },
      paint: { 'line-color': '#d6ff3f', 'line-width': 5, 'line-opacity': 0.9 },
    }, map.getLayer(DSA_LAYER) ? DSA_LAYER : undefined);
  }, [mapReady, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    setGeoJson(map, DSA_SOURCE, dsaGeoJson);
    if (!map.getLayer(DSA_LAYER)) map.addLayer({
      id: DSA_LAYER,
      type: 'circle',
      source: DSA_SOURCE,
      paint: {
        'circle-radius': 7,
        'circle-color': '#141616',
        'circle-stroke-color': '#d6ff3f',
        'circle-stroke-width': 2,
      },
    });

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'map-tooltip' });
    const handleEnter = (event: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      popup.setLngLat(feature.geometry.coordinates as [number, number]).setText(String(feature.properties?.BUILDING_N ?? 'Designated smoking area')).addTo(map);
    };
    const handleLeave = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };
    const handleDsaClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = Number(event.features?.[0]?.properties?.OBJECTID);
      if (Number.isFinite(id)) onSelect(id);
    };
    map.on('mouseenter', DSA_LAYER, handleEnter);
    map.on('mouseleave', DSA_LAYER, handleLeave);
    map.on('click', DSA_LAYER, handleDsaClick);
    return () => {
      popup.remove();
      if (!map.getLayer(DSA_LAYER)) return;
      map.off('mouseenter', DSA_LAYER, handleEnter);
      map.off('mouseleave', DSA_LAYER, handleLeave);
      map.off('click', DSA_LAYER, handleDsaClick);
    };
  }, [dsaGeoJson, mapReady, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.getLayer(DSA_LAYER)) return;
    const selected = selectedId ?? -1;
    map.setPaintProperty(DSA_LAYER, 'circle-radius', ['case', ['==', ['get', 'OBJECTID'], selected], 10, 7]);
    map.setPaintProperty(DSA_LAYER, 'circle-color', ['case', ['==', ['get', 'OBJECTID'], selected], '#d6ff3f', '#141616']);
    map.setPaintProperty(DSA_LAYER, 'circle-stroke-color', ['case', ['==', ['get', 'OBJECTID'], selected], '#0b0c0c', '#d6ff3f']);
    map.setPaintProperty(DSA_LAYER, 'circle-stroke-width', ['case', ['==', ['get', 'OBJECTID'], selected], 3, 2]);
  }, [mapReady, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (!position) return;

    const hasHeading = position.source === 'device' && position.heading !== undefined && (position.speed === undefined || position.speed >= 0.4);
    const element = document.createElement('div');
    element.style.pointerEvents = 'none';
    element.setAttribute('aria-label', hasHeading ? 'Your direction' : position.source === 'manual' ? 'Selected start' : 'Your position');
    if (hasHeading) {
      const heading = ((position.heading ?? 0) % 360 + 360) % 360;
      element.className = 'gps-heading-marker';
      element.innerHTML = `<span class="gps-heading-arrow" style="transform:rotate(${heading}deg)" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2 20 21 12 17 4 21Z"/></svg></span>`;
    } else {
      element.className = 'map-user-marker';
    }
    userMarkerRef.current = new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat([position.longitude, position.latitude])
      .addTo(map);
  }, [mapReady, position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (route && route.coordinates.length > 1) {
      const bounds = new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0]);
      route.coordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate));
      map.fitBounds(bounds, { padding: 36, maxZoom: 18, duration: 0 });
    } else if (searchOrigin) {
      map.jumpTo({ center: [searchOrigin.longitude, searchOrigin.latitude], zoom: 17 });
    }
  }, [mapReady, route, searchOrigin?.latitude, searchOrigin?.longitude]);

  const alerts = [mapError, boundaryData.failed ? 'Some no-smoking boundaries could not be loaded.' : null].filter((message): message is string => Boolean(message));

  return <div className="map-wrap">
    <div ref={node} className="map" role="application" aria-label="Map of designated smoking areas, no-smoking areas, and the selected walking route. Click or tap to choose a starting location."/>
    {alerts.length > 0 && <div className="map-data-alert" role="status">{alerts.map((message) => <div key={message}>{message}</div>)}</div>}
  </div>;
}
