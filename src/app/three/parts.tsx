import { useLayoutEffect, useRef } from 'react';
import type * as THREE from 'three';

export interface Item { m: THREE.Matrix4; c: THREE.Color }

/** Many copies of one mesh, each with its own transform and colour. */
export function InstancedParts({ geometry, material, items, cast = true }: {
  geometry: THREE.BufferGeometry; material: THREE.Material; items: Item[]; cast?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      mesh.setColorAt(i, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (items.length === 0) return null;
  return <instancedMesh key={items.length} ref={ref} args={[geometry, material, items.length]} castShadow={cast} receiveShadow />;
}
