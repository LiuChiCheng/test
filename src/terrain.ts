import * as THREE from 'three';
import { fbm } from './noise';

export const ISLAND_RADIUS = 120;
export const PEAK_X = 30;
export const PEAK_Z = -20;

/** 小島在 (x, z) 的地面高度；海平面為 0 */
export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z) / ISLAND_RADIUS;
  const m = Math.min(Math.max((1 - r) * 1.6, 0), 1);
  const mask = m * m * (3 - 2 * m);
  const n = fbm(x * 0.012 + 50, z * 0.012 + 50);
  const dx = x - PEAK_X;
  const dz = z - PEAK_Z;
  const peak = Math.exp(-(dx * dx + dz * dz) / (2 * 35 * 35)) * 38;
  return mask * (4 + n * 14 + peak) - 2;
}

export function createIsland(): THREE.Mesh {
  const size = ISLAND_RADIUS * 2 + 40;
  const geo = new THREE.PlaneGeometry(size, size, 160, 160);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xe2cf9a);
  const grassA = new THREE.Color(0x6aa84f);
  const grassB = new THREE.Color(0x3f7a3a);
  const rock = new THREE.Color(0x7b756c);
  const snow = new THREE.Color(0xf2f4f7);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    if (h < 1) c.copy(sand);
    else if (h < 20) c.copy(grassA).lerp(grassB, fbm(x * 0.05, z * 0.05, 3));
    else if (h < 34) c.copy(rock);
    else c.copy(snow);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
  });
  return new THREE.Mesh(geo, mat);
}
