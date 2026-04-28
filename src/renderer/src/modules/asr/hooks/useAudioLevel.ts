import { useEffect, useState } from 'react';

export function useAudioLevel(): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const unsubscribe = window.api.asr.onLevel((nextLevel) => {
      setLevel(nextLevel);
    });

    return unsubscribe;
  }, []);

  return level;
}
