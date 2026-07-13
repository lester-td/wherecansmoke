import { useEffect, useMemo, useState } from 'react';
import type { Coordinates, RankedDsa } from '../types/dsa';
import type { RouteStatus, WalkingMatrix } from '../types/route';

export function useWalkingMatrix(origin: Coordinates | null, candidates: RankedDsa[]) {
  const [matrix, setMatrix] = useState<WalkingMatrix | null>(null);
  const [status, setStatus] = useState<RouteStatus>('idle');
  const candidateKey = useMemo(
    () => candidates.map((candidate) => {
      const [longitude, latitude] = candidate.feature.geometry.coordinates;
      return `${latitude},${longitude}`;
    }).join(';'),
    [candidates],
  );

  useEffect(() => {
    if (!origin || !candidateKey) {
      setMatrix(null);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({
      start: `${origin.latitude},${origin.longitude}`,
      ends: candidateKey,
    });

    setMatrix(null);
    setStatus('loading');

    fetch(`${import.meta.env.BASE_URL}api/walking-matrix?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as WalkingMatrix & { error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Walking estimates unavailable');
        return body;
      })
      .then((body) => {
        setMatrix(body);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMatrix(null);
        const text = error instanceof Error ? error.message : 'Walking estimates unavailable';
        setStatus(text.includes('not configured') ? 'unavailable' : 'error');
      });

    return () => controller.abort();
  }, [origin?.latitude, origin?.longitude, candidateKey]);

  return { matrix, status };
}
