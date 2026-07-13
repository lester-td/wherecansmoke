import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../types/dsa';

export type LocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

export function useGeolocation() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [livePosition, setLivePosition] = useState<Coordinates | null>(null);
  const [message, setMessage] = useState('Location permission has not been requested.');
  const watchId = useRef<number | null>(null);
  const hasFirstFix = useRef(false);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
    watchId.current = null;
    hasFirstFix.current = false;
  }, []);

  useEffect(() => stopWatching, [stopWatching]);

  const locate = useCallback(() => {
    if (watchId.current !== null && livePosition?.source === 'device') {
      setPosition({ ...livePosition });
      setStatus('ready');
      setMessage('Results updated from your current GPS location.');
      return;
    }

    if (!navigator.geolocation) {
      setStatus('unavailable');
      setMessage('Geolocation is not supported by this browser.');
      return;
    }

    stopWatching();
    setStatus('locating');
    setMessage('Waiting for a GPS fix…');
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const next: Coordinates = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          heading: typeof coords.heading === 'number' && Number.isFinite(coords.heading) ? coords.heading : undefined,
          speed: typeof coords.speed === 'number' && Number.isFinite(coords.speed) ? coords.speed : undefined,
          source: 'device',
        };
        setLivePosition(next);
        if (!hasFirstFix.current) {
          hasFirstFix.current = true;
          setPosition(next);
          setStatus('ready');
          setMessage('Live GPS tracking is active.');
        }
      },
      (error) => {
        if (hasFirstFix.current) return;
        stopWatching();
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied');
          setMessage('Location permission was denied. Choose a point on the map instead.');
        } else {
          setStatus('unavailable');
          setMessage(error.code === error.TIMEOUT ? 'Location request timed out. Try again or choose a point on the map.' : 'Your location is currently unavailable. Choose a point on the map.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }, [livePosition, stopWatching]);

  const setManual = useCallback((coordinates: Coordinates) => {
    stopWatching();
    const manual = { ...coordinates, accuracy: undefined, source: 'manual' as const };
    setPosition(manual);
    setLivePosition(manual);
    setStatus('ready');
    setMessage('Using the point you selected on the map.');
  }, [stopWatching]);

  return {
    status,
    position,
    livePosition,
    isTracking: watchId.current !== null && livePosition?.source === 'device',
    message,
    locate,
    setManual,
  };
}
