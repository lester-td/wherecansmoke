import { readFile } from 'node:fs/promises';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const geoJson: Plugin = {
  name: 'geojson',
  async load(id) {
    if (!id.endsWith('.geojson')) return null;
    return `export default ${await readFile(id, 'utf8')}`;
  },
};

function localWalkingApi(apiKey: string | undefined): Plugin {
  return {
    name: 'local-walking-api',
    configureServer(server) {
      server.middlewares.use('/api/walking-matrix', async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'private, no-store');
        if (!apiKey) {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: 'Walking routing is not configured' }));
          return;
        }

        try {
          const url = new URL(request.url ?? '', 'http://localhost');
          const parse = (value: string) => value.split(',').map(Number);
          const start = parse(url.searchParams.get('start') ?? '');
          const ends = (url.searchParams.get('ends') ?? '').split(';').filter(Boolean).map(parse);
          const values = [...start, ...ends.flat()];
          if (start.length !== 2 || ends.length < 1 || ends.length > 5 || ends.some((end) => end.length !== 2) || values.some((value) => !Number.isFinite(value))) {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: 'One start and up to five valid destinations are required' }));
            return;
          }

          const locations = [start, ...ends].map(([latitude, longitude]) => [longitude, latitude]);
          const upstream = await fetch('https://api.openrouteservice.org/v2/matrix/foot-walking', {
            method: 'POST',
            headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ locations, sources: [0], destinations: ends.map((_, index) => index + 1), metrics: ['distance', 'duration'], units: 'm' }),
          });
          const body = await upstream.json() as { distances?: Array<Array<number | null>>; durations?: Array<Array<number | null>> };
          const distancesMetres = body.distances?.[0];
          const durationsSeconds = body.durations?.[0];
          if (!upstream.ok || !distancesMetres || !durationsSeconds || distancesMetres.length !== ends.length || durationsSeconds.length !== ends.length) {
            response.statusCode = upstream.status === 429 ? 429 : 502;
            response.end(JSON.stringify({ error: upstream.status === 429 ? 'Walking estimate quota exceeded' : 'Walking estimates unavailable' }));
            return;
          }
          response.end(JSON.stringify({ provider: 'openrouteservice', distancesMetres, durationsSeconds }));
        } catch {
          response.statusCode = 502;
          response.end(JSON.stringify({ error: 'Walking estimates are temporarily unavailable' }));
        }
      });

      server.middlewares.use('/api/walking', async (request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'private, no-store');
        if (!apiKey) {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: 'Walking routing is not configured' }));
          return;
        }

        try {
          const url = new URL(request.url ?? '', 'http://localhost');
          const parse = (value: string | null) => value?.split(',').map(Number);
          const start = parse(url.searchParams.get('start'));
          const end = parse(url.searchParams.get('end'));
          if (!start || !end || start.length !== 2 || end.length !== 2 || [...start, ...end].some((value) => !Number.isFinite(value))) {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: 'Valid coordinates are required' }));
            return;
          }

          const upstream = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
            method: 'POST',
            headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates: [[start[1], start[0]], [end[1], end[0]]], instructions: true, language: 'en' }),
          });
          const body = await upstream.json() as { features?: Array<{ geometry?: { coordinates?: Array<[number, number]> }; properties?: { summary?: { distance?: number; duration?: number }; segments?: Array<{ steps?: unknown[] }> } }> };
          const route = body.features?.[0];
          const summary = route?.properties?.summary;
          if (!upstream.ok || !route?.geometry?.coordinates || !summary?.distance || !summary.duration) {
            response.statusCode = upstream.status === 429 ? 429 : 502;
            response.end(JSON.stringify({ error: upstream.status === 429 ? 'Walking route quota exceeded' : 'Walking route unavailable' }));
            return;
          }
          response.end(JSON.stringify({ provider: 'openrouteservice', distanceMetres: summary.distance, durationSeconds: summary.duration, coordinates: route.geometry.coordinates, steps: route.properties?.segments?.flatMap((segment) => segment.steps ?? []) ?? [] }));
        } catch {
          response.statusCode = 502;
          response.end(JSON.stringify({ error: 'Walking routing is temporarily unavailable' }));
        }
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/',
    plugins: [react(), geoJson, ...(command === 'serve' ? [localWalkingApi(env.OPENROUTESERVICE_API_KEY)] : [])],
    optimizeDeps: { exclude: ['maplibre-gl'] },
    test: { environment: 'node' },
  };
});
