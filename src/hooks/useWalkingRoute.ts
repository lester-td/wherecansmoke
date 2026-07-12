import { useEffect, useState } from 'react';
import type { Coordinates } from '../types/dsa';
import type { RouteStatus, WalkingRoute } from '../types/route';

export function useWalkingRoute(origin: Coordinates | null, destination: Coordinates | null) {
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  const [status, setStatus] = useState<RouteStatus>('idle');
  const [message, setMessage] = useState('Select a DSA to calculate a walking route.');

  useEffect(() => {
    if (!origin || !destination) {
      setRoute(null);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({
      start: `${origin.latitude},${origin.longitude}`,
      end: `${destination.latitude},${destination.longitude}`,
    });

    setRoute(null);
    setStatus('loading');
    setMessage('Calculating a pedestrian route…');

    fetch(`${import.meta.env.BASE_URL}api/walking?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as WalkingRoute & { error?: string };
        if (!response.ok) throw new Error(body.error ?? 'Walking route unavailable');
        return body;
      })
      .then((body) => {
        setRoute(body);
        setStatus('ready');
        setMessage('Walking route calculated with openrouteservice.');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRoute(null);
        const text = error instanceof Error ? error.message : 'Walking route unavailable';
        setStatus(text.includes('not configured') ? 'unavailable' : 'error');
        setMessage(text);
      });

    return () => controller.abort();
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude]);

  return { route, status, message };
}
