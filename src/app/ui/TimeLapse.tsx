import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { TerrariumState } from '../../engine/index.js';
import type { Moment } from '../../playground/living.js';

const KIND: Record<Moment['kind'], string> = {
  recorded: 'as its keeper kept it',
  shared: 'the day it was shared',
  grown: 'growing on its own',
};

/**
 * Plays a jar's life a week at a time. The parent draws whichever moment is
 * showing (onShow), or the live jar again when the time-lapse is closed (null).
 */
export function TimeLapse({ moments, onShow, onClose }: { moments: Moment[]; onShow: (s: TerrariumState | null) => void; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = moments.length - 1;

  useEffect(() => {
    onShow(moments[i]?.state ?? null);
  }, [i, moments, onShow]);
  useEffect(() => () => onShow(null), [onShow]);
  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setI((x) => Math.min(last, x + 1)), 650);
    return () => clearTimeout(t);
  }, [playing, i, last]);

  const m = moments[i]!;
  return (
    <div className="timelapse" role="group" aria-label="Time-lapse">
      <button type="button" className="icon-button" onClick={() => (i >= last ? (setI(0), setPlaying(true)) : setPlaying((p) => !p))}
        aria-label={playing ? 'Pause' : i >= last ? 'Play again' : 'Play'}>
        {playing ? <Pause size={16} aria-hidden="true" /> : i >= last ? <RotateCcw size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
      <input type="range" min={0} max={last} value={i} aria-label="Moment in its life" aria-valuetext={`Day ${m.day}, ${KIND[m.kind]}`}
        onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} />
      <span className="timelapse-label" aria-live="polite">
        <strong>Day {m.day}</strong> <span className={`timelapse-kind kind-${m.kind}`}>{KIND[m.kind]}</span>
      </span>
      <button type="button" className="button quiet" onClick={onClose}>Back to today</button>
    </div>
  );
}
