import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { TerrariumSpec, TerrariumState } from '../../engine/index.js';
import { Jar } from './Jar.js';

const Terrarium3D = lazy(() => import('../three/Terrarium3D.js'));

let webgl: boolean | null = null;
export function hasWebGL() {
  if (webgl === null) {
    try {
      webgl = !!document.createElement('canvas').getContext('webgl2');
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface Jar3DProps {
  spec: TerrariumSpec;
  state: TerrariumState;
  lively?: boolean;
  autoRotate?: boolean;
  title?: string;
  /** Lets the plants be dragged into place (3D only). */
  onArrange?: (plantId: string, at: [number, number]) => void;
  view?: 'front' | 'iso';
  focus?: 'all' | 'layers' | 'plants' | 'crew' | 'light';
}

/**
 * The 3D terrarium, loaded on demand. Falls back to the drawn jar while three.js
 * loads, and for good when the browser has no WebGL 2.
 */
export function Jar3D({ spec, state, lively = true, autoRotate, title, onArrange, view, focus }: Jar3DProps) {
  const flat = (
    <div className="jar3d jar3d-flat">
      <Jar spec={spec} state={state} lively={lively} title={title} />
    </div>
  );
  if (!hasWebGL()) return flat;
  return (
    <Fallback fallback={flat}>
      <Suspense fallback={flat}>
        <Terrarium3D spec={spec} state={state} lively={lively} autoRotate={autoRotate} label={title} onArrange={onArrange} view={view} focus={focus} />
      </Suspense>
    </Fallback>
  );
}
