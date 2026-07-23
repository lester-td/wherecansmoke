export interface NoSmokingProperties {
  OBJECTID: number;
  NAME?: string;
  L_CODE?: string;
  NSZ_AREA?: number;
  INC_CRC: string;
  FMEL_UPD_D: string;
  'SHAPE.AREA': number;
  'SHAPE.LEN': number;
}

type Position = [number, number];
type PolygonCoordinates = Position[][];

export interface NoSmokingFeature {
  type: 'Feature';
  geometry:
    | { type: 'Polygon'; coordinates: PolygonCoordinates }
    | { type: 'MultiPolygon'; coordinates: PolygonCoordinates[] };
  properties: NoSmokingProperties;
}

export interface NoSmokingCollection {
  type: 'FeatureCollection';
  name?: string;
  features: NoSmokingFeature[];
}
