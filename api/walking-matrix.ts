interface Request {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}

interface Response {
  status: (code: number) => Response;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

type Coordinate = { latitude: number; longitude: number };
type OrsMatrixResponse = {
  distances?: Array<Array<number | null>>;
  durations?: Array<Array<number | null>>;
};

function coordinate(value: unknown): Coordinate | null {
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
  const rawEnds = typeof req.query.ends === 'string' ? req.query.ends.split(';') : [];
  const ends = rawEnds.map(coordinate);
  if (!start || ends.length < 1 || ends.length > 5 || ends.some((end) => !end)) {
    res.status(400).json({ error: 'One start and up to five valid Singapore destinations are required' });
    return;
  }

  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'Walking routing is not configured' });
    return;
  }

  const destinations = ends as Coordinate[];
  try {
    const upstream = await fetch('https://api.openrouteservice.org/v2/matrix/foot-walking', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        locations: [start, ...destinations].map(({ longitude, latitude }) => [longitude, latitude]),
        sources: [0],
        destinations: destinations.map((_, index) => index + 1),
        metrics: ['distance', 'duration'],
        units: 'm',
      }),
    });

    const body = (await upstream.json()) as OrsMatrixResponse;
    if (!upstream.ok) {
      res.status(upstream.status === 429 ? 429 : 502).json({
        error: upstream.status === 429 ? 'Walking estimate quota exceeded' : 'Walking estimates unavailable',
      });
      return;
    }

    const distancesMetres = body.distances?.[0];
    const durationsSeconds = body.durations?.[0];
    if (!distancesMetres || !durationsSeconds || distancesMetres.length !== destinations.length || durationsSeconds.length !== destinations.length) {
      res.status(502).json({ error: 'Walking provider returned incomplete estimates' });
      return;
    }

    res.status(200).json({ provider: 'openrouteservice', distancesMetres, durationsSeconds });
  } catch {
    res.status(502).json({ error: 'Walking estimates are temporarily unavailable' });
  }
}
