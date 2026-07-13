# WhereCanSmoke?

An unofficial, mobile-first web app for finding nearby Designated Smoking Areas (DSAs) in Singapore, initially focused on the Orchard Road No Smoking Zone.

> Find the nearest designated smoking area in Singapore using your current location.

WhereCanSmoke? is an independent project. It is not affiliated with or endorsed by the National Environment Agency (NEA), OneMap, the Singapore Land Authority (SLA), or the Singapore Government. Coordinates are a useful reference, not a legal guarantee. Always verify the NEA description, photograph, and on-site signs.

## Features

- Browser location is requested only after pressing **Use GPS**.
- After the first fix, live GPS updates move the user marker without refreshing results; **Update results** explicitly searches again from the latest fix.
- Low GPS accuracy and out-of-area fixes trigger warnings.
- The five straight-line candidates are reordered using walking estimates when routing is available.
- The interactive OneMap shows DSA markers, selection, the live user position, movement heading when available, GPS accuracy, and the selected route.
- Tapping the map provides a manual fallback when location is unavailable or denied.
- NEA location descriptions and reference photos are prominent because access may be behind a building, near a service yard, or on another level.
- No user location is stored, persisted, or logged. There is no application client-side storage.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173/`. Secure-context browser rules allow geolocation on localhost. Useful checks:

```bash
npm test
npm run typecheck
npm run data:validate
npm run build
```

## Architecture

React and TypeScript run on Vite. Concerns are separated into UI components (`src/components`), browser location state (`src/hooks`), geospatial and validation utilities (`src/lib`), domain types (`src/types`), and the versioned dataset (`src/data`). Leaflet is dynamically imported so mapping code is split from the initial bundle. OneMap tiles do not need an API token.

Results are first shortlisted using straight-line distance. `api/walking-matrix.ts` then makes one no-store openrouteservice matrix request for walking estimates to the five candidates, which are reordered by walking distance. Selecting a DSA uses `api/walking.ts` to request its full pedestrian route, including geometry and steps. Both functions accept only Singapore coordinates. The UI degrades deliberately to straight-line ranking rather than inventing route data when routing is unavailable.

## Official data and attribution

The checked-in snapshot at `src/data/dsa.geojson` is the NEA **Designated Smoking Areas (GEOJSON)** dataset distributed by data.gov.sg:

- Dataset: https://data.gov.sg/datasets/d_d0fa8f07ef80ab23feaa3b870323bf27/view
- Agency: National Environment Agency
- Coverage/effective period displayed by data.gov.sg: November 2025
- Dataset publication/update: 19 March 2026, 10:06 SGT
- Repository snapshot retrieved: 13 July 2026
- Licence: Singapore Open Data Licence (free for personal or commercial reuse with attribution)

The map is © OneMap / Singapore Land Authority. See the [Singapore Open Data Licence](https://data.gov.sg/open-data-licence) and [OneMap API documentation](https://www.onemap.gov.sg/apidocs/).

The app never silently fetches the dataset at page load. The checked-in snapshot keeps it reliable and reviewable.

## Updating the dataset

Run:

```bash
npm run data:update
```

The script asks the official data.gov.sg download API for the latest GeoJSON, writes a temporary candidate, and validates it before atomically replacing the snapshot. Validation requires a non-empty FeatureCollection of unique Point features, Singapore coordinate bounds, and the NEA fields `OBJECTID`, `BUILDING_N`, `DESCRIPTION`, `PHOTOURL`, and `FMEL_UPD_D`. Review the diff and update the dates above and in the app before committing. A failed validation leaves the existing snapshot intact.

## Walking routing environment variable

Walking routing uses openrouteservice. Its key must never use a `VITE_` prefix or appear in browser code. Set it only in Vercel project settings or a local serverless environment:

```bash
OPENROUTESERVICE_API_KEY=your-key
```

Responses and location inputs use `Cache-Control: private, no-store`. Do not add request logging that includes query strings. The OneMap basemap does not require this key; openrouteservice is used only for walking routes. Local Vite development exposes the same narrowly scoped endpoint; production uses the Vercel function.

## Vercel and base-path deployment

This repository is its own Vercel project. Production assets use Vite base `/code/wherecansmoke/`; local Vite development uses `/` for convenience. The app has no client router, so no router basename is required. `vercel.json` provides the SPA fallback and maps base-path API requests to serverless functions.

Expected build settings:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Public route via Vercel Microfrontends: `https://lester.page/code/wherecansmoke`

The application runs top-level at that path and links normally back to `/code`; it is not designed for an iframe. Keep this repository, dependency tree, environment, deployment, and Vercel project independent from the portfolio repository.

## Privacy

Location is held only in React memory for the current tab. The app has no analytics, location logging, cookies, IndexedDB, localStorage, or sessionStorage. Live GPS fixes only move the map marker; they are not used for new routing requests until **Update results** is pressed. If walking routing is configured, that fixed search origin and five shortlisted endpoints are transiently sent through this project's no-store proxy to openrouteservice to calculate walking estimates; the selected endpoint is also sent to calculate its full route. Without routing configuration, the experience remains entirely straight-line and coordinates are not sent by the app.

## Limitations

- Coverage is the published Orchard-focused DSA dataset, not every permitted smoking location or smoking restriction in Singapore.
- GPS can drift significantly among dense Orchard buildings.
- Straight-line distance does not account for entrances, indoor routes, levels, road crossings, or access restrictions.
- Reference photo URLs are controlled by NEA and may change or fail.
- A map tile request necessarily reveals standard request metadata to OneMap, but the app does not add the user's position to tile URLs.
