import * as THREE from 'three';
import { SUN_DIR } from './atmosphere';
import { fbm, mulberry32 } from './noise';

export const ISLAND_RADIUS = 120;
export const PEAK_X = 30;
export const PEAK_Z = -20;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** 小島在 (x, z) 的地面高度；海平面為 0，島外海床逐漸變深 */
export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z) / ISLAND_RADIUS;
  const mask = smooth(0, 1, (1 - r) * 1.6);
  const n = fbm(x * 0.012 + 50, z * 0.012 + 50);
  const fine = fbm(x * 0.09 + 7, z * 0.09 + 7, 3) - 0.5;
  const dx = x - PEAK_X;
  const dz = z - PEAK_Z;
  const peak = Math.exp(-(dx * dx + dz * dz) / (2 * 35 * 35)) * 38;
  return mask * (4 + n * 14 + peak + fine * 1.6) - 2 - 7 * smooth(0.82, 1.3, r);
}

/** 地表的細緻顆粒貼圖（程式產生，不需外部素材） */
function createDetailTexture(): THREE.Texture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rand = mulberry32(7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 可無縫拼接的多層雜訊
      const a = fbm((x / size) * 8, (y / size) * 8, 4);
      const b = fbm((1 - x / size) * 8 + 8, (y / size) * 8, 4);
      const c = fbm((x / size) * 8, (1 - y / size) * 8 + 8, 4);
      const d = fbm((1 - x / size) * 8 + 8, (1 - y / size) * 8 + 8, 4);
      const u = x / size;
      const v = y / size;
      const n = a * u * v + b * (1 - u) * v + c * u * (1 - v) + d * (1 - u) * (1 - v);
      const val = 150 + n * 150 + (rand() - 0.5) * 40;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, Math.max(0, val));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(90, 90);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createIsland(): THREE.Mesh {
  const size = ISLAND_RADIUS * 2.7;
  const seg = 256;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;

  const colors = new Float32Array(pos.count * 3);
  const wetSand = new THREE.Color(0xb9a273);
  const sand = new THREE.Color(0xe9d8a6);
  const grassA = new THREE.Color(0x7fb04a);
  const grassB = new THREE.Color(0x3f7f3a);
  const dryGrass = new THREE.Color(0xa9a85a);
  const rock = new THREE.Color(0x857d74);
  const darkRock = new THREE.Color(0x5e5a58);
  const snow = new THREE.Color(0xf4f6fa);
  const c = new THREE.Color();
  const t = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const slope = 1 - nor.getY(i);
    const n1 = fbm(x * 0.05, z * 0.05, 3);
    const n2 = fbm(x * 0.21 + 3, z * 0.21 + 3, 3);

    // 沙灘 → 草地 → 岩石 → 雪，邊界用雜訊打散避免生硬的等高線
    c.copy(wetSand).lerp(sand, smooth(0, 0.9, h));
    t.copy(grassA).lerp(grassB, n1).lerp(dryGrass, smooth(0.55, 0.8, n2) * 0.6);
    c.lerp(t, smooth(1.0, 2.6, h + (n2 - 0.5) * 1.5));
    t.copy(rock).lerp(darkRock, n2);
    c.lerp(t, Math.max(smooth(19, 27, h + (n1 - 0.5) * 8), smooth(0.16, 0.3, slope) * smooth(2, 5, h)));
    c.lerp(snow, smooth(33, 38, h + (n2 - 0.5) * 5) * (1 - smooth(0.25, 0.45, slope)));

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: createDetailTexture(),
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** 給水面著色器用的高度圖：用來算水深、淺灘顏色與岸邊浪花 */
export const HEIGHTMAP_WORLD_SIZE = ISLAND_RADIUS * 2.7;
export const HEIGHTMAP_MIN = -9;
export const HEIGHTMAP_MAX = 3;

export function createHeightTexture(): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1) - 0.5) * HEIGHTMAP_WORLD_SIZE;
      const z = (j / (size - 1) - 0.5) * HEIGHTMAP_WORLD_SIZE;
      const h = heightAt(x, z);
      const v = Math.min(Math.max((h - HEIGHTMAP_MIN) / (HEIGHTMAP_MAX - HEIGHTMAP_MIN), 0), 1);
      const k = (j * size + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round(v * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 出生點：面向夕陽那一側的高處，一開場就能眺望整片海 */
export const START = (() => {
  const len = Math.hypot(SUN_DIR.x, SUN_DIR.z);
  const ux = SUN_DIR.x / len;
  const uz = SUN_DIR.z / len;
  let d = ISLAND_RADIUS;
  while (d > 0 && heightAt(ux * d, uz * d) < 9) d -= 1;
  return { x: ux * d, z: uz * d, ux, uz };
})();
