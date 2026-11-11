import * as THREE from 'three';
import { GLSL_COMMON, SUN_DIR } from './atmosphere';

export interface Sky {
  mesh: THREE.Mesh;
  update(time: number, camera: THREE.Camera): void;
}

/** 天空球：漸層、太陽、會緩慢流動的雲層 */
export function createSky(): Sky {
  const uniforms = {
    uSunDir: { value: SUN_DIR },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uTime;
      varying vec3 vDir;
      ${GLSL_COMMON}
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyBase(d, uSunDir);
        float s = max(dot(d, uSunDir), 0.0);

        if (d.y > 0.0) {
          // 高空卷雲與積雲
          vec2 p = d.xz / (d.y + 0.14) * 1.25 + uTime * vec2(0.004, 0.002);
          float n = fbm(p * 1.2);
          float n2 = fbm(p * 3.3 + 5.0);
          float c = smoothstep(0.6, 0.84, n * 0.74 + n2 * 0.36);
          c *= smoothstep(0.0, 0.12, d.y);
          float lit = smoothstep(0.25, 0.85, n2);
          vec3 cc = mix(vec3(0.34, 0.31, 0.48), vec3(1.0, 0.78, 0.6), lit);
          cc += SUNC * pow(s, 3.0) * 0.7;
          col = mix(col, cc, c * 0.8);

          // 遠方地平線上的薄雲帶
          vec2 q = vec2(atan(d.z, d.x) * 3.0, d.y * 40.0);
          float band = fbm(q + vec2(uTime * 0.003, 0.0));
          float bm = smoothstep(0.5, 0.75, band) * smoothstep(0.16, 0.03, d.y) * smoothstep(0.0, 0.02, d.y);
          col = mix(col, vec3(1.0, 0.86, 0.74) + SUNC * pow(s, 4.0) * 0.5, bm * 0.3);
        }

        // 太陽本體
        col += vec3(6.0, 4.6, 3.0) * smoothstep(0.99955, 0.9998, s);
        // 地平線融入霧色
        col = mix(HORIZON + SUNC * pow(s, 6.0) * 0.35, col, smoothstep(-0.01, 0.07, d.y));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(time, camera) {
      uniforms.uTime.value = time;
      mesh.position.copy(camera.position);
    },
  };
}
