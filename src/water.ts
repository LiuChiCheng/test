import * as THREE from 'three';
import { FOG_DENSITY, GLSL_COMMON, SUN_DIR } from './atmosphere';
import { createHeightTexture, HEIGHTMAP_MAX, HEIGHTMAP_MIN, HEIGHTMAP_WORLD_SIZE } from './terrain';

export interface Water {
  mesh: THREE.Mesh;
  update(time: number): void;
}

/**
 * 海面：多層流動波紋、菲涅耳天空反射、太陽波光、
 * 依水深變化的淺灘顏色與岸邊浪花。
 */
export function createWater(): Water {
  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: SUN_DIR },
    uHeightMap: { value: createHeightTexture() },
    uMapSize: { value: HEIGHTMAP_WORLD_SIZE },
    uHMin: { value: HEIGHTMAP_MIN },
    uHRange: { value: HEIGHTMAP_MAX - HEIGHTMAP_MIN },
    uFogDensity: { value: FOG_DENSITY },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform sampler2D uHeightMap;
      uniform float uMapSize;
      uniform float uHMin;
      uniform float uHRange;
      uniform float uFogDensity;
      varying vec3 vWorld;
      ${GLSL_COMMON}

      // 波高：大浪、中浪與細碎漣漪疊加，各自往不同方向流動
      float waveH(vec2 p, float detail) {
        float t = uTime;
        float h = 0.0;
        h += vnoise(p * 0.035 + t * vec2(0.10, 0.06)) * 1.6;
        h += vnoise(p * 0.11 + t * vec2(-0.16, 0.21)) * 0.7;
        h += vnoise(p * 0.33 + t * vec2(0.34, -0.27)) * 0.28 * detail;
        h += vnoise(p * 0.95 + t * vec2(-0.55, -0.42)) * 0.12 * detail;
        h += vnoise(p * 2.6 + t * vec2(0.9, 0.7)) * 0.045 * detail * detail;
        return h;
      }

      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        vec2 p = vWorld.xz;

        // 水深
        vec2 uv = p / uMapSize + 0.5;
        float depth = 9.0;
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
          depth = -(texture2D(uHeightMap, uv).r * uHRange + uHMin);
        }

        // 法線：遠處淡化細節以免閃爍
        float detail = 1.0 - smoothstep(40.0, 900.0, dist) * 0.85;
        float e = 0.35 + dist * 0.01;
        float h0 = waveH(p, detail);
        float hx = waveH(p + vec2(e, 0.0), detail);
        float hz = waveH(p + vec2(0.0, e), detail);
        float calm = mix(0.35, 1.0, smoothstep(0.0, 4.0, depth)); // 淺灘較平靜
        float strength = 1.15 * calm * mix(1.0, 0.5, smoothstep(300.0, 6000.0, dist));
        vec3 N = normalize(vec3(-(hx - h0) / e * strength, 1.0, -(hz - h0) / e * strength));

        // 水體顏色：淺灘青綠 → 深海藍
        vec3 shallow = vec3(0.08, 0.5, 0.48);
        vec3 mid = vec3(0.02, 0.24, 0.36);
        vec3 deep = vec3(0.008, 0.07, 0.17);
        vec3 body = mix(shallow, mid, smoothstep(0.3, 3.2, depth));
        body = mix(body, deep, smoothstep(2.5, 8.5, depth));
        // 浪峰透光
        body += vec3(0.02, 0.12, 0.1) * smoothstep(1.6, 2.6, h0) * detail;

        // 反射天空
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 refl = skyBase(R, uSunDir);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 col = mix(body, refl, fres);

        // 太陽波光
        float sp = max(dot(R, uSunDir), 0.0);
        col += vec3(1.0, 0.8, 0.55) * (pow(sp, 420.0) * 9.0 + pow(sp, 60.0) * 0.5);

        // 岸邊浪花：隨時間往岸上推的泡沫帶
        float fn = fbm(p * 0.9 + uTime * 0.15);
        float wash = 0.28 + 0.22 * sin(uTime * 0.9 + vnoise(p * 0.05) * 6.28);
        float foam = smoothstep(0.34, 0.0, abs(depth - wash)) * smoothstep(0.3, 0.6, fn + 0.25);
        foam += smoothstep(0.22, 0.0, depth) * 0.6;
        foam += smoothstep(1.4, 0.2, depth) * smoothstep(0.62, 0.8, fbm(p * 0.5 - uTime * 0.2)) * 0.5;
        foam = clamp(foam, 0.0, 1.0);
        col = mix(col, vec3(1.0, 0.98, 0.95), foam * 0.85);

        // 岸邊半透明，看得到水下的沙
        float alpha = clamp(smoothstep(-0.05, 1.3, depth) * 0.93 + fres * 0.4 + foam, 0.0, 1.0);

        // 空氣透視
        float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        float s = max(dot(-V, uSunDir), 0.0);
        col = mix(col, HORIZON + SUNC * pow(s, 6.0) * 0.35, f);

        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const geo = new THREE.CircleGeometry(40000, 96);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return {
    mesh,
    update(time) {
      uniforms.uTime.value = time;
    },
  };
}
