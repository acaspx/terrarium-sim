import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { TerrariumSpec, TerrariumState } from '../../engine/index.js';
import { Jar } from './Jar.js';

const Terrarium3D = lazy(() => import('../three/Terrarium3D.js'));

let webgl: boolean | null = null;
export function hasWebGL() {
  if (webgl === null) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      webgl = !!gl;
      // Release the probe at once: browsers cap live WebGL contexts (Safari on iPhone at a handful),
      // and one held here would count against the 3D views.
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
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
  /** Lets the wood and stone be dragged, and the wood turned (3D only). */
  onPlace?: (what: 'wood' | 'stone', placed: { at: [number, number]; turn?: number }) => void;
  view?: 'front' | 'iso';
  focus?: 'all' | 'layers' | 'plants' | 'crew' | 'light';
}

/**
 * The 3D terrarium, loaded on demand. Falls back to the drawn jar while three.js
 * loads, and for good when the browser has no WebGL 2.
 */
export function Jar3D({ spec, state, lively = true, autoRotate, title, onArrange, onPlace, view, focus }: Jar3DProps) {
  const flat = (
    <div className="jar3d jar3d-flat">
      <Jar spec={spec} state={state} lively={lively} title={title} />
    </div>
  );
  if (!hasWebGL()) return flat;
  return (
    <Fallback fallback={flat}>
      <Suspense fallback={flat}>
        <Terrarium3D spec={spec} state={state} lively={lively} autoRotate={autoRotate} label={title} onArrange={onArrange} onPlace={onPlace} view={view} focus={focus} />
      </Suspense>
    </Fallback>
  );
}
