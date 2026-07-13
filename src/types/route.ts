export interface WalkingStep {
  distance: number;
  duration: number;
  instruction: string;
  name: string;
  type: number;
  way_points: [number, number];
}

export interface WalkingRoute {
  provider: 'openrouteservice';
  distanceMetres: number;
  durationSeconds: number;
  coordinates: Array<[number, number]>;
  steps: WalkingStep[];
}

export interface WalkingMatrix {
  provider: 'openrouteservice';
  distancesMetres: Array<number | null>;
  durationsSeconds: Array<number | null>;
}

export type RouteStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
