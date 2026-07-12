interface Request {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}

interface Response {
  status: (code: number) => Response;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

type OrsResponse = {
  features?: Array<{
    geometry?: { type: 'LineString'; coordinates: Array<[number, number]> };
    properties?: {
      summary?: { distance?: number; duration?: number };
      segments?: Array<{
        steps?: Array<{
          distance: number;
          duration: number;
          instruction: string;
          name: string;
          type: number;
          way_points: [number, number];
        }>;
      }>;
    };
  }>;
};

function coordinate(value: unknown) {
  if (typeof value !== 'string') return null;
  const pair = value.split(',').map(Number);
  if (pair.length !== 2 || pair.some((item) => !Number.isFinite(item))) return null;
  const [latitude, longitude] = pair;
  if (latitude < 1.1 || latitude > 1.6 || longitude < 103.5 || longitude > 104.1) return null;
  return { latitude, longitude };
}

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const start = coordinate(req.query.start);
  const end = coordinate(req.query.end);
  if (!start || !end) {
    res.status(400).json({ error: 'Valid Singapore coordinates are required' });
    return;
  }

  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Walking routing is not configured' });
    return;
  }

  try {
    const upstream = await fetch(
      'https://api.openrouteservice.org/v2/directions/foot-walking/geojson',
      {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/geo+json, application/json',
        },
        body: JSON.stringify({
          coordinates: [
            [start.longitude, start.latitude],
            [end.longitude, end.latitude],
          ],
          instructions: true,
          language: 'en',
        }),
      },
    );

    const body = (await upstream.json()) as OrsResponse;
    if (!upstream.ok) {
      res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? 'Walking route quota exceeded' : 'Walking route unavailable',
      });
      return;
    }

    const route = body.features?.[0];
    const summary = route?.properties?.summary;
    if (!route?.geometry?.coordinates || !summary?.distance || !summary.duration) {
      res.status(502).json({ error: 'Walking provider returned an incomplete route' });
      return;
    }

    res.status(200).json({
      provider: 'openrouteservice',
      distanceMetres: summary.distance,
      durationSeconds: summary.duration,
      coordinates: route.geometry.coordinates,
      steps: route.properties?.segments?.flatMap((segment) => segment.steps ?? []) ?? [],
    });
  } catch {
    res.status(502).json({ error: 'Walking routing is temporarily unavailable' });
  }
}
