import * as THREE from 'three';

/**
 * Water on the inside of the glass, drawn from the simulation's condensation index:
 * a fine mist first, then beads that catch the light, then beads that merge and
 * run down in streaks, wiping clear trails behind them. Nothing condenses below
 * the soil line, and the film is thickest on the cool upper glass.
 */
/** How many wiped spots the glass remembers at once (two per tap: front and back walls). */
export const WIPES = 8;

/** detailed: a second, finer layer of beads and running drips. Off in light quality. */
export function condensationMaterial(detailed = true) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    defines: detailed ? { DETAILED: '' } : {},
    uniforms: {
      uCond: { value: 0 },
      uTime: { value: 0 },
      uGround: { value: 0.5 },
      uTop: { value: 2 },
      uNight: { value: 0 },
      uSquare: { value: 0 },
      uClock: { value: 0 },
      // Spots wiped clear by a finger: xyz on the glass, w when (negative: unused).
      uWipes: { value: Array.from({ length: WIPES }, () => new THREE.Vector4(0, 0, 0, -1)) },
      uLightDir: { value: new THREE.Vector3(-0.5, 0.8, 0.4).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vObj;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vObj = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uCond;
      uniform float uTime;
      uniform float uGround;
      uniform float uTop;
      uniform float uNight;
      uniform float uSquare;
      uniform float uClock;
      uniform vec4 uWipes[${WIPES}];
      uniform vec3 uLightDir;
      varying vec3 vObj;
      varying vec3 vNormalW;
      varying vec3 vViewDir;

      float h21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      // Beads on a jittered grid. x: how deep inside the bead (0 edge .. 1 centre), yz: offset from its centre.
      vec3 beads(vec2 uv, float scale, float density, float seed) {
        uv *= scale;
        vec2 id = floor(uv);
        vec2 f = fract(uv);
        vec3 best = vec3(0.0);
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j));
            vec2 cid = id + o + seed;
            if (h21(cid + 7.13) > density) continue;
            vec2 c = o + 0.2 + 0.6 * vec2(h21(cid), h21(cid + 1.7));
            float r = 0.16 + 0.34 * h21(cid + 3.1);
            vec2 d = f - c;
            d.y *= 0.85 + 0.25 * h21(cid + 5.5); // gravity pulls beads into teardrops
            float k = 1.0 - length(d) / r;
            if (k > best.x) best = vec3(k, d / r);
          }
        }
        return best;
      }

      void main() {
        float y = vObj.y;
        if (y < uGround) discard;
        vec2 uv = uSquare > 0.5 ? vec2(vObj.x + vObj.z, y) : vec2(atan(vObj.x, vObj.z) * 1.05, y);
        float c = clamp(uCond, 0.0, 1.6);
        float above = smoothstep(uGround, uGround + 0.3, y);
        float amount = c * above * (0.55 + 0.45 * smoothstep(uGround, uTop, y));

        // The mist: microdroplets too small to see one by one.
        float mist = vnoise(uv * 140.0) * 0.5 + vnoise(uv * 38.0) * 0.5;
        // Thresholds follow the words in the interface: clear < 0.08, light mist < 0.6, fogged < 1, streaming.
        float fog = smoothstep(0.35, 1.1, amount) * (0.22 + 0.28 * mist);

        // Runs: beads that merged and slid down, clearing a trail.
        float trail = 0.0;
        float head = 0.0;
        vec2 headN = vec2(0.0);
        #ifdef DETAILED
        if (c > 0.9) {
          float cols = 16.0;
          float col = floor(uv.x * cols);
          float rx = h21(vec2(col, 1.7));
          if (rx < (c - 0.9) * 1.2) {
            float cx = (col + 0.3 + 0.4 * h21(vec2(col, 9.1))) / cols;
            float wob = sin(y * 9.0 + rx * 20.0) * 0.012;
            float dx = (uv.x - cx - wob) * cols;
            float speed = 0.04 + 0.07 * h21(vec2(col, 4.0));
            float span = uTop - uGround + 0.8;
            float hy = uTop + 0.2 - mod(uTime * speed + rx * 13.0, span);
            float up = y - hy;
            float w = 0.16;
            trail = (1.0 - smoothstep(w * 0.5, w, abs(dx))) * step(0.0, up) * (1.0 - smoothstep(0.1, 0.9, up));
            vec2 hd = vec2(dx / (w * 1.4), up / 0.05);
            float hk = 1.0 - length(hd);
            head = clamp(hk, 0.0, 1.0);
            headN = hd;
          }
        }
        #endif

        vec3 b1 = beads(uv, 22.0, smoothstep(0.25, 1.0, amount) * 0.9, 0.0);
        #ifdef DETAILED
        vec3 b2 = beads(uv, 52.0, smoothstep(0.06, 0.6, amount) * 0.95, 17.0);
        #else
        vec3 b2 = vec3(0.0);
        #endif
        vec3 b = b1.x > b2.x * 0.9 ? b1 : b2;
        float bead = step(0.0001, b.x) * (1.0 - trail);
        vec2 bn = b.yz;
        if (head > b.x) { bead = step(0.0001, head); bn = headN; }
        fog *= 1.0 - 0.9 * trail;

        // A wiped spot is clear at once and fogs over again within about ten seconds.
        // Water pushed aside piles up in a ring at the edge of the wiped spot.
        float wipe = 0.0;
        float ridge = 0.0;
        for (int i = 0; i < ${WIPES}; i++) {
          vec4 w = uWipes[i];
          if (w.w < 0.0) continue;
          float age = uClock - w.w;
          float life = 1.0 - smoothstep(3.0, 11.0, age);
          float r = 0.17 + 0.06 * min(age * 4.0, 1.0);
          float d = length(vObj - w.xyz);
          wipe = max(wipe, (1.0 - smoothstep(r * 0.6, r, d)) * life);
          ridge = max(ridge, (1.0 - smoothstep(0.0, 0.035, abs(d - r))) * life);
        }
        fog = fog * (1.0 - wipe) + ridge * 0.22 * smoothstep(0.02, 0.3, c);
        bead *= 1.0 - 0.95 * wipe;

        // Light the bead as a tiny lens bulging off the glass.
        vec3 N = normalize(gl_FrontFacing ? vNormalW : -vNormalW);
        vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N) + 1e-4);
        vec3 B = normalize(cross(N, T));
        float r2 = clamp(dot(bn, bn), 0.0, 1.0);
        vec3 Nb = normalize(N * sqrt(1.0 - r2) + (T * bn.x + B * bn.y) * 0.95);
        vec3 V = normalize(vViewDir);
        vec3 L = normalize(uLightDir);
        float spec = pow(max(dot(reflect(-L, Nb), V), 0.0), 70.0) * bead;
        float glint = pow(max(dot(reflect(-vec3(0.3, 0.9, 0.3), Nb), V), 0.0), 24.0) * bead * 0.35;
        float rim = smoothstep(0.45, 1.0, sqrt(r2)) * bead;

        float alpha = fog + bead * (0.1 + 0.4 * rim) + spec * 1.2 + glint + trail * 0.05;
        vec3 col = vec3(0.9, 0.95, 0.94) * (1.0 - 0.45 * rim) + vec3(1.0) * (spec + glint);
        col *= mix(1.0, 0.32, uNight);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
      }
    `,
  });
}

/** A bright edge where the glass turns away from you, as on thick, polished glass. */
export function rimMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uStrength: { value: 0.32 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uStrength;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        gl_FragColor = vec4(vec3(0.92, 0.96, 1.0) * f * uStrength, 1.0);
      }
    `,
  });
}
