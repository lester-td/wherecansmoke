# WhereCanSmoke?

Unofficial locator for Designated Smoking Areas (DSAs) in Singapore. Current data coverage is focused on Orchard Road.

WhereCanSmoke? is not affiliated with or endorsed by NEA, OneMap, SLA, openrouteservice, OpenStreetMap, or the Singapore Government. Verify the NEA description, reference photo, and on-site signs.

## Features

- GPS or manual map location
- Live GPS marker and movement heading
- Explicit **Update results** action; live movement does not refresh results
- Five nearby DSAs ranked by walking distance when routing is available
- Straight-line fallback when routing is unavailable
- OneMap map, walking route, directions, GPS accuracy, and NEA photos
- No analytics, location storage, cookies, or browser storage

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Local URL: `http://localhost:5173/`

Checks:

```bash
npm test
npm run typecheck
npm run data:validate
npm run build
```

## Stack and routing

- React, TypeScript, and Vite
- Leaflet with OneMap tiles
- Vercel functions for openrouteservice requests
- Checked-in GeoJSON dataset

The app shortlists five DSAs by straight-line distance, then requests walking estimates from `api/walking-matrix.ts`. `api/walking.ts` requests the full route for the selected DSA. Both endpoints accept only Singapore coordinates and return `Cache-Control: private, no-store`.

Set the routing key in the server environment. Do not use a `VITE_` prefix.

```bash
OPENROUTESERVICE_API_KEY=your-key
```

Without a key, the app uses straight-line distance.

## Data and attribution

Dataset: [NEA Designated Smoking Areas](https://data.gov.sg/datasets/d_d0fa8f07ef80ab23feaa3b870323bf27/view)

- File: `src/data/dsa.geojson`
- Agency: National Environment Agency
- Coverage: November 2025
- Published: 19 March 2026
- Snapshot retrieved: 13 July 2026
- Licence: [Singapore Open Data Licence](https://data.gov.sg/open-data-licence)

Map data and tiles: [OneMap](https://www.onemap.gov.sg/) / Singapore Land Authority. Walking routes: [openrouteservice](https://openrouteservice.org/) using OpenStreetMap data.

Update and validate the dataset:

```bash
npm run data:update
npm run data:validate
```

Review the generated diff and update the snapshot dates before committing.

## Deployment

Vercel settings:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Production base path: `/code/wherecansmoke/`

`vercel.json` handles the SPA fallback and base-path API rewrites.

## Privacy

Location remains in React memory for the current tab. Live GPS fixes only move the map marker. Routing requests use the fixed search origin created by the first GPS fix, a manual point, or **Update results**.

When routing is enabled, the search origin and five candidate endpoints are sent through the no-store proxy to openrouteservice. The selected endpoint is sent again for the full route. The app does not log or persist these coordinates.

## Limitations

- Dataset coverage is Orchard-focused.
- GPS accuracy and heading can drift near dense buildings.
- Routes may omit indoor, upper-level, or restricted paths.
- NEA reference photo URLs may change or fail.
- OneMap tile requests expose standard request metadata but do not include user coordinates.
