import { DoubleSide, ShaderMaterial, Vector3 } from 'three'

// Colours are display values: the dither pass maps them straight to the palette,
// so there is no colour management or tone mapping anywhere in the scene.

const LIGHT = new Vector3(-0.2, 0.72, 0.66).normalize()

/** Tubes that grow from the base: anything past `uGrow` collapses onto its centreline. */
export function barkMaterial() {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uGrow: { value: 0 },
      uTime: { value: 0 },
      uSway: { value: 1 },
      uLight: { value: LIGHT },
    },
    vertexShader: /* glsl */ `
      uniform float uGrow;
      uniform float uTime;
      uniform float uSway;
      attribute vec3 aCenter;
      attribute float aReveal;
      attribute vec3 aColor;
      attribute vec2 aSway;
      varying vec3 vNormal;
      varying vec3 vColor;

      void main() {
        // Thin to a point over the last 22 px behind the growing tip.
        float grown = sqrt(clamp((uGrow - aReveal) / 22.0, 0.0, 1.0));
        vec3 p = aCenter + (position - aCenter) * grown;
        p.xy += uSway * aSway.x * vec2(sin(uTime * 1.6 + aSway.y), cos(uTime * 1.2 + aSway.y * 1.7));
        vNormal = normal;
        vColor = aColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight;
      varying vec3 vNormal;
      varying vec3 vColor;

      void main() {
        float light = max(dot(normalize(vNormal), uLight), 0.0);
        gl_FragColor = vec4(vColor * (0.3 + 0.85 * light), 1.0);
      }
    `,
  })
}

/** Leaves pop in once growth passes them and drift a little in the wind. */
export function foliageMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uGrow: { value: 0 },
      uTime: { value: 0 },
      uSway: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uGrow;
      uniform float uTime;
      uniform float uSway;
      attribute vec3 iOffset;
      attribute vec2 iSize;
      attribute float iAngle;
      attribute vec3 iColor;
      attribute float iReveal;
      attribute float iPhase;
      varying vec2 vUv;
      varying vec3 vColor;

      void main() {
        float grown = smoothstep(iReveal, iReveal + 8.0, uGrow);
        vec2 local = position.xy * iSize * grown;
        float c = cos(iAngle);
        float s = sin(iAngle);
        vec3 p = iOffset + vec3(c * local.x - s * local.y, s * local.x + c * local.y, 0.0);
        p.xy += uSway * 0.4 * vec2(sin(uTime * 1.7 + iPhase), cos(uTime * 1.3 + iPhase * 1.3));
        vUv = uv;
        vColor = iColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;

      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        if (dot(q, q) > 1.0) discard;
        // Lit from above, so each leaf darkens toward its underside.
        gl_FragColor = vec4(vColor * (0.86 + 0.24 * vUv.y), 1.0);
      }
    `,
  })
}
