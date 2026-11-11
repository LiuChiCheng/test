import * as THREE from 'three';
import { IS_MOBILE } from './atmosphere';
import { fbm } from './noise';
import { heightAt, ISLAND_RADIUS, PEAK_X, PEAK_Z, START } from './terrain';

const m4 = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const pos = new THREE.Vector3();
const eul = new THREE.Euler();
const col = new THREE.Color();

function slopeAt(x: number, z: number): number {
  const e = 0.8;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** 樹林的疏密分布：>0.5 的地方長樹 */
function forest(x: number, z: number): number {
  return fbm(x * 0.03 + 9, z * 0.03 + 9, 3);
}

interface Spot {
  x: number;
  z: number;
  h: number;
  k: number;
  rot: number;
}

function scatter(
  rand: () => number,
  max: number,
  accept: (x: number, z: number, h: number) => boolean,
  clearing = 0,
): Spot[] {
  const out: Spot[] = [];
  for (let tries = 0; tries < max * 30 && out.length < max; tries++) {
    const x = (rand() * 2 - 1) * ISLAND_RADIUS;
    const z = (rand() * 2 - 1) * ISLAND_RADIUS;
    const h = heightAt(x, z);
    if (!accept(x, z, h)) continue;
    if (clearing > 0 && Math.hypot(x - START.x, z - START.z) < clearing) continue;
    out.push({ x, z, h, k: 0.7 + rand() * 0.7, rot: rand() * Math.PI * 2 });
  }
  return out;
}

function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  count: number,
  shadow = true,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** 針葉樹：樹幹＋三層樹冠 */
function createPines(rand: () => number): THREE.Group {
  const spots = scatter(rand, 230, (x, z, h) => h > 2.5 && h < 22 && forest(x, z) > 0.5 && slopeAt(x, z) < 0.7, 22);
  const trunks = instanced(
    new THREE.CylinderGeometry(0.16, 0.3, 3, 7),
    new THREE.MeshStandardMaterial({ color: 0x5b3d27, roughness: 1 }),
    spots.length,
  );
  const cone = new THREE.ConeGeometry(1, 1, 12, 2);
  const layers = instanced(
    cone,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    spots.length * 5,
  );
  const spec = [
    { y: 2.0, r: 2.0, h: 2.4 },
    { y: 3.1, r: 1.7, h: 2.3 },
    { y: 4.2, r: 1.35, h: 2.2 },
    { y: 5.3, r: 1.0, h: 2.1 },
    { y: 6.4, r: 0.6, h: 2.0 },
  ];
  spots.forEach((s, i) => {
    scl.set(s.k, s.k, s.k);
    quat.setFromEuler(eul.set((rand() - 0.5) * 0.08, s.rot, (rand() - 0.5) * 0.08));
    m4.compose(pos.set(s.x, s.h + 1.3 * s.k, s.z), quat, scl);
    trunks.setMatrixAt(i, m4);
    const tint = rand();
    spec.forEach((l, j) => {
      scl.set(l.r * s.k, l.h * s.k, l.r * s.k);
      m4.compose(pos.set(s.x, s.h + l.y * s.k, s.z), quat, scl);
      layers.setMatrixAt(i * 5 + j, m4);
      // 越上層越亮，並帶一點個體差異
      col.setHSL(0.29 + tint * 0.05, 0.45, 0.19 + j * 0.028 + tint * 0.05);
      layers.setColorAt(i * 5 + j, col);
    });
  });
  const g = new THREE.Group();
  g.add(trunks, layers);
  return g;
}

/** 闊葉樹：樹幹＋幾團圓形樹冠 */
function createBroadleaf(rand: () => number): THREE.Group {
  const spots = scatter(rand, 90, (x, z, h) => {
    const f = forest(x, z);
    return h > 2 && h < 14 && f > 0.42 && f < 0.56 && slopeAt(x, z) < 0.5;
  }, 22);
  const trunks = instanced(
    new THREE.CylinderGeometry(0.2, 0.34, 3, 7),
    new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 1 }),
    spots.length,
  );
  const blobs = instanced(
    new THREE.IcosahedronGeometry(1, 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    spots.length * 4,
  );
  spots.forEach((s, i) => {
    quat.identity();
    scl.set(s.k, s.k, s.k);
    m4.compose(pos.set(s.x, s.h + 1.3 * s.k, s.z), quat, scl);
    trunks.setMatrixAt(i, m4);
    const tint = rand();
    for (let j = 0; j < 4; j++) {
      const a = s.rot + (j / 3) * Math.PI * 2;
      const off = j === 3 ? 0 : 1.0;
      const r = (j === 3 ? 1.7 : 1.25 + rand() * 0.4) * s.k;
      scl.set(r, r * 0.85, r);
      m4.compose(
        pos.set(s.x + Math.cos(a) * off * s.k, s.h + (j === 3 ? 4.3 : 3.3 + rand() * 0.5) * s.k, s.z + Math.sin(a) * off * s.k),
        quat,
        scl,
      );
      blobs.setMatrixAt(i * 4 + j, m4);
      col.setHSL(0.24 + tint * 0.08, 0.5, 0.24 + rand() * 0.06);
      blobs.setColorAt(i * 4 + j, col);
    }
  });
  const g = new THREE.Group();
  g.add(trunks, blobs);
  return g;
}

/** 岩石：把二十面體用雜訊擠壓成不規則形狀 */
function createRocks(rand: () => number): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.72 + fbm(x * 1.7 + y * 1.3 + 4, z * 1.7 - y * 1.1 + 4, 3) * 0.6;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  const spots = scatter(rand, 150, (x, z, h) => h > -0.3 && (h < 1.6 || h > 16 || rand() < 0.08));
  const rocks = instanced(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), spots.length);
  spots.forEach((s, i) => {
    const big = rand() < 0.15 ? 2.4 : 1;
    const r = (0.3 + rand() * 0.8) * big;
    scl.set(r * (0.8 + rand() * 0.6), r * (0.5 + rand() * 0.5), r * (0.8 + rand() * 0.6));
    quat.setFromEuler(eul.set(rand() * 0.6, s.rot, rand() * 0.6));
    m4.compose(pos.set(s.x, s.h + r * 0.15, s.z), quat, scl);
    rocks.setMatrixAt(i, m4);
    const g = 0.36 + rand() * 0.2;
    col.setRGB(g * 1.04, g, g * 0.94);
    rocks.setColorAt(i, col);
  });
  return rocks;
}

/** 草叢：大量會隨風擺動的草葉 */
function createGrass(rand: () => number, timeUniform: { value: number }): THREE.InstancedMesh {
  // 一叢 5 片草葉，每片是一個細長三角形
  const blades = 5;
  const vp: number[] = [];
  const vc: number[] = [];
  const vn: number[] = [];
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rand();
    const ox = Math.cos(a) * 0.12 * rand();
    const oz = Math.sin(a) * 0.12 * rand();
    const w = 0.035;
    const hgt = 0.26 + rand() * 0.22;
    const lean = 0.08 + rand() * 0.12;
    const px = Math.cos(a + 1.57) * w;
    const pz = Math.sin(a + 1.57) * w;
    const tx = ox + Math.cos(a) * lean;
    const tz = oz + Math.sin(a) * lean;
    // 正反兩面各一片，法線都朝上，兩面受光一致
    vp.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, hgt, tz);
    vp.push(ox + px, 0, oz + pz, ox - px, 0, oz - pz, tx, hgt, tz);
    for (let k = 0; k < 2; k++) {
      vc.push(0.5, 0.6, 0.35, 0.5, 0.6, 0.35, 1.0, 1.0, 0.75);
      vn.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(vn, 3));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float gw = sin(uTime * 1.7 + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27)
                   + 0.5 * sin(uTime * 3.1 + instanceMatrix[3].x * 0.9);
          transformed.x += gw * 0.16 * position.y;
          transformed.z += gw * 0.09 * position.y;
        #endif`,
      );
  };

  const spots = scatter(rand, IS_MOBILE ? 22000 : 42000, (x, z, h) => h > 1.7 && h < 21 && slopeAt(x, z) < 0.55);
  const grass = instanced(geo, mat, spots.length, false);
  spots.forEach((s, i) => {
    const k = s.k * (0.6 + fbm(s.x * 0.08, s.z * 0.08, 2) * 0.8);
    scl.set(k, k * (0.8 + rand() * 0.6), k);
    quat.setFromEuler(eul.set(0, s.rot, 0));
    m4.compose(pos.set(s.x, s.h - 0.02, s.z), quat, scl);
    grass.setMatrixAt(i, m4);
    const n = fbm(s.x * 0.05, s.z * 0.05, 3);
    col.setHSL(0.2 + n * 0.12, 0.5, 0.3 + rand() * 0.12);
    grass.setColorAt(i, col);
  });
  return grass;
}

/** 花：點綴在草地上的小色塊 */
function createFlowers(rand: () => number): THREE.InstancedMesh {
  const spots = scatter(rand, 2400, (x, z, h) => h > 2 && h < 16 && forest(x, z) < 0.47 && fbm(x * 0.06 + 30, z * 0.06, 2) > 0.5);
  const flowers = instanced(
    new THREE.IcosahedronGeometry(0.05, 0),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    spots.length,
    false,
  );
  const palette = [0xfff3b0, 0xffffff, 0xff9eb5, 0xc9a7ff, 0xffd166];
  spots.forEach((s, i) => {
    quat.identity();
    scl.set(1, 0.6, 1);
    m4.compose(pos.set(s.x, s.h + 0.3 + rand() * 0.12, s.z), quat, scl);
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, col.set(palette[Math.floor(rand() * palette.length)]));
  });
  return flowers;
}

/** 山頂的古老石柱陣 */
function createPillars(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc4bcae, roughness: 0.9 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const x = PEAK_X + Math.cos(a) * 9;
    const z = PEAK_Z + Math.sin(a) * 9;
    const hgt = 6 + (i % 3) * 1.6;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, hgt, 10), mat);
    pillar.position.set(x, heightAt(x, z) + hgt / 2 - 0.6, z);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2), mat);
    cap.position.set(x, heightAt(x, z) + hgt - 0.4, z);
    cap.rotation.y = -a;
    for (const o of [pillar, cap]) {
      o.castShadow = true;
      o.receiveShadow = true;
      g.add(o);
    }
  }
  return g;
}

export function createVegetation(rand: () => number, timeUniform: { value: number }): THREE.Group {
  const g = new THREE.Group();
  g.add(
    createPines(rand),
    createBroadleaf(rand),
    createRocks(rand),
    createGrass(rand, timeUniform),
    createFlowers(rand),
    createPillars(),
  );
  return g;
}
