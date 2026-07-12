import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const geoJson = { name: 'geojson', async load(id: string) { if (!id.endsWith('.geojson')) return null; return `export default ${await readFile(id, 'utf8')}`; } };
export default defineConfig(({ command }) => ({ base: command === 'serve' ? '/' : '/code/wherecansmoke/', plugins: [react(), geoJson], test: { environment: 'node' } }));
