export interface DsaProperties { OBJECTID: number; DESCRIPTION: string; BUILDING_N: string; PHOTOURL: string; Y: number; X: number; INC_CRC: string; FMEL_UPD_D: string; }
export interface DsaFeature { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: DsaProperties; }
export interface DsaCollection { type: 'FeatureCollection'; name?: string; features: DsaFeature[]; }
export interface Coordinates { latitude: number; longitude: number; accuracy?: number; heading?: number; speed?: number; source?: 'device' | 'manual'; }
export interface RankedDsa { feature: DsaFeature; distanceMetres: number; bearingDegrees: number; direction: string; walkingDistanceMetres?: number; walkingDurationSeconds?: number; }
