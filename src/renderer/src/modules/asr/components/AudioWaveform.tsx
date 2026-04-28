/**
 * Audio Waveform Component.
 * Displays a visual representation of audio level during recording.
 */

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

interface AudioWaveformProps {
  /** Audio level from 0 to 1 */
  level: number;
  active?: boolean;
  tone?: 'default' | 'busy' | 'error';
}

/**
 * Displays an animated waveform based on audio level.
 * Shows compact bars that keep a subtle idle motion and react to audio input.
 */
export function AudioWaveform({ level, active = false, tone = 'default' }: AudioWaveformProps): ReactNode {
  const [bars, setBars] = useState<number[]>([0.28, 0.42, 0.58, 0.74, 0.58, 0.42, 0.28]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setBars((currentBars) => currentBars.map((currentHeight, index) => {
        const centerIndex = (currentBars.length - 1) / 2;
        const distance = Math.abs(index - centerIndex);
        const responsiveness = 1 - (distance * 0.14);
        const baseline = active ? 0.34 : 0.2;
        const energy = active ? Math.max(level, 0.12) : 0.08;
        const randomFactor = 0.65 + Math.random() * 0.5;
        const targetHeight = Math.min(1, baseline + (energy * responsiveness * randomFactor));
        return currentHeight + (targetHeight - currentHeight) * 0.45;
      }));
    }, active ? 72 : 140);

    return () => window.clearInterval(intervalId);
  }, [active, level]);

  return (
    <div className={`audio-waveform audio-waveform--${tone}${active ? ' is-active' : ''}`} aria-hidden="true">
      {bars.map((height, index) => (
        <div
          key={index}
          className="audio-waveform__bar"
          style={{
            height: `${Math.max(4, height * 18)}px`,
            opacity: 0.48 + (height * 0.5),
            animationDelay: `${index * 70}ms`,
          }}
        />
      ))}
    </div>
  );
}
