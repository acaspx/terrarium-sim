import { Pause, Play, FastForward, ChevronsRight } from 'lucide-react';
import { useStore, type Speed } from '../store.js';

const OPTIONS: { id: Speed; label: string; icon: typeof Play; hint: string }[] = [
  { id: 'paused', label: 'Paused', icon: Pause, hint: 'Time stands still.' },
  { id: 'live', label: 'Real time', icon: Play, hint: 'One hour here is one hour for your jars. They keep growing while you are away.' },
  { id: 'day', label: 'Day per second', icon: FastForward, hint: 'Watch a month go by in half a minute.' },
  { id: 'week', label: 'Week per second', icon: ChevronsRight, hint: 'Watch a season go by.' },
];

export function TimeControl() {
  const store = useStore();
  return (
    <div className="time-control" role="radiogroup" aria-label="Simulation speed">
      {OPTIONS.map((o) => (
        <button
          key={o.id} type="button" role="radio" aria-checked={store.speed === o.id}
          className={store.speed === o.id ? 'on' : undefined} title={o.hint}
          onClick={() => store.setSpeed(o.id)}
        >
          <o.icon size={15} aria-hidden="true" />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
