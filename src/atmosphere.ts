import * as THREE from 'three';

/** 太陽方向（低角度的黃金時刻） */
export const SUN_DIR = new THREE.Vector3(-0.6, 0.3, -0.75).normalize();
export const SUN_COLOR = new THREE.Color().setRGB(1.0, 0.78, 0.55);
/** 地平線的霧色：遠方物體會逐漸融入這個顏色，形成空氣透視 */
export const FOG_COLOR = new THREE.Color().setRGB(0.92, 0.6, 0.36);
export const FOG_DENSITY = 0.00015;

export const IS_MOBILE =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** 天空與水面共用的 GLSL：雜訊與天空顏色 */
export const GLSL_COMMON = /* glsl */ `
  const vec3 HORIZON = vec3(0.92, 0.6, 0.36);
  const vec3 ROSE = vec3(0.72, 0.5, 0.6);
  const vec3 MIDSKY = vec3(0.24, 0.42, 0.76);
  const vec3 ZENITH = vec3(0.045, 0.13, 0.42);
  const vec3 SUNC = vec3(1.0, 0.62, 0.32);

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p = p * 2.02 + 17.3;
      a *= 0.5;
    }
    return s;
  }
  // 不含雲的天空漸層＋太陽光暈
  vec3 skyBase(vec3 d, vec3 sunDir) {
    float y = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(HORIZON, ROSE, smoothstep(0.0, 0.11, y));
    c = mix(c, MIDSKY, smoothstep(0.06, 0.36, y));
    c = mix(c, ZENITH, smoothstep(0.3, 0.95, y));
    float s = max(dot(d, sunDir), 0.0);
    c += SUNC * (pow(s, 5.0) * 0.22 + pow(s, 40.0) * 0.4 + pow(s, 400.0) * 0.8);
    return c;
  }
`;
