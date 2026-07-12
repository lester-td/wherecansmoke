import type { Coordinates, DsaCollection, RankedDsa } from '../types/dsa';
const EARTH_RADIUS_METRES = 6_371_000;
const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (radiansValue: number) => radiansValue * 180 / Math.PI;
export function distanceMetres(a: Coordinates, b: Coordinates): number { const dLat=radians(b.latitude-a.latitude); const dLon=radians(b.longitude-a.longitude); const lat1=radians(a.latitude); const lat2=radians(b.latitude); const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; return 2*EARTH_RADIUS_METRES*Math.asin(Math.sqrt(h)); }
export function bearingDegrees(a: Coordinates, b: Coordinates): number { const lat1=radians(a.latitude); const lat2=radians(b.latitude); const dLon=radians(b.longitude-a.longitude); const y=Math.sin(dLon)*Math.cos(lat2); const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon); return (degrees(Math.atan2(y,x))+360)%360; }
const DIRECTIONS=['N','NE','E','SE','S','SW','W','NW'];
export function cardinalDirection(bearing: number): string { return DIRECTIONS[Math.round(bearing/45)%8]; }
export function rankDsas(collection: DsaCollection, origin: Coordinates): RankedDsa[] { return collection.features.map(feature=>{ const [longitude,latitude]=feature.geometry.coordinates; const target={latitude,longitude}; const bearing=bearingDegrees(origin,target); return {feature,distanceMetres:distanceMetres(origin,target),bearingDegrees:bearing,direction:cardinalDirection(bearing)}; }).sort((a,b)=>a.distanceMetres-b.distanceMetres); }
export function formatDistance(metres:number):string { return metres<1000?`${Math.round(metres)} m`:`${(metres/1000).toFixed(1)} km`; }
