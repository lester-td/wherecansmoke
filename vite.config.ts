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
    base: command === 'serve' ? '/' : '/code/wherecansmoke/',
    plugins: [react(), geoJson, ...(command === 'serve' ? [localWalkingApi(env.OPENROUTESERVICE_API_KEY)] : [])],
    test: { environment: 'node' },
  };
});
