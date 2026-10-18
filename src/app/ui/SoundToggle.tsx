import { Volume2, VolumeX } from 'lucide-react';
import { setSoundOn, useSoundOn } from '../sound.js';

/** Turns the jars' quiet sounds on and off; off until the visitor chooses. */
export function SoundToggle() {
  const on = useSoundOn();
  return (
    <button type="button" className="icon-button tool-button" aria-pressed={on} onClick={() => setSoundOn(!on)}
      aria-label={on ? 'Sound on' : 'Sound off'} title={on ? 'Turn sound off' : 'Turn sound on: drips, the hush of humid air, taps on glass and soil'}>
      {on ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
    </button>
  );
}
