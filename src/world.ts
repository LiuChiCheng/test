import * as THREE from 'three';
import { fbm, mulberry32 } from './noise';
import { createIsland, heightAt, ISLAND_RADIUS, PEAK_X, PEAK_Z } from './terrain';

const HORIZON = 0xffc48a;
const ZENITH = 0x274b8f;
export const SUN_DIR = new THREE.Vector3(-0.6, 0.22, -0.75).normalize();

/** 漸層天空球＋太陽光暈 */
function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizon: { value: new THREE.Color(HORIZON) },
      zenith: { value: new THREE.Color(ZENITH) },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 horizon;
      uniform vec3 zenith;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float t = pow(max(d.y, 0.0), 0.45);
        vec3 col = mix(horizon, zenith, t);
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.6, 0.3) * pow(s, 6.0) * 0.45;
        col += vec3(1.0, 0.95, 0.85) * pow(s, 900.0) * 2.0;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

/** 環繞四周的遠方山脈 */
function createMountainRing(r0: number, r1: number, H: number, seed: number): THREE.Mesh {
  const aSeg = 240;
  const rSeg = 14;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const rockC = new THREE.Color(0x4a4f6a);
  const snowC = new THREE.Color(0xffffff);
  const c = new THREE.Color();

  for (let i = 0; i <= aSeg; i++) {
    const a = (i / aSeg) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let j = 0; j <= rSeg; j++) {
      const r = r0 + (j / rSeg) * (r1 - r0);
      const env = Math.sin((j / rSeg) * Math.PI);
      const n = fbm((ca * r) / 500 + seed, (sa * r) / 500 + seed, 5);
      const ridge = 1 - Math.abs(2 * n - 1);
      const big = fbm(ca * 2.5 + seed, sa * 2.5 + seed, 2);
      const h = env * H * (0.15 + 0.85 * ridge * ridge) * (0.45 + big);
      positions.push(ca * r, h - 5, sa * r);
      const t = Math.min(Math.max((h / H - 0.38) * 5, 0), 1);
      c.copy(rockC).lerp(snowC, t);
      colors.push(c.r, c.g, c.b);
    }
  }
  const row = rSeg + 1;
  for (let i = 0; i < aSeg; i++) {
    for (let j = 0; j < rSeg; j++) {
      const p = i * row + j;
      indices.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function createTrees(rand: () => number): THREE.Group {
  const max = 320;
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2, 6);
  const leafGeo = new THREE.ConeGeometry(1.6, 4.5, 7);
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true }),
    max,
  );
  const leaves = new THREE.InstancedMesh(
    leafGeo,
    new THREE.MeshStandardMaterial({ color: 0x2f6b3a, flatShading: true }),
    max,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let count = 0;
  for (let tries = 0; tries < 4000 && count < max; tries++) {
    const x = (rand() * 2 - 1) * ISLAND_RADIUS;
    const z = (rand() * 2 - 1) * ISLAND_RADIUS;
    const h = heightAt(x, z);
    if (h < 2 || h > 19) continue;
    if (fbm(x * 0.03 + 9, z * 0.03 + 9, 3) < 0.48) continue; // 成片的樹林
    const k = 0.7 + rand() * 0.8;
    s.set(k, k, k);
    m.compose(p.set(x, h + 1 * k, z), q, s);
    trunks.setMatrixAt(count, m);
    m.compose(p.set(x, h + 4 * k, z), q, s);
    leaves.setMatrixAt(count, m);
    count++;
  }
  trunks.count = count;
  leaves.count = count;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  const g = new THREE.Group();
  g.add(trunks, leaves);
  return g;
}

/** 山頂的古老石柱陣 */
function createPillars(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, flatShading: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = PEAK_X + Math.cos(a) * 9;
    const z = PEAK_Z + Math.sin(a) * 9;
    const hgt = 6 + (i % 3) * 1.5;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, hgt, 1.6), mat);
    pillar.position.set(x, heightAt(x, z) + hgt / 2 - 0.5, z);
    pillar.rotation.y = -a;
    g.add(pillar);
  }
  return g;
}

function createFloatingIslands(rand: () => number): THREE.Group[] {
  const list: THREE.Group[] = [];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6475, flatShading: true });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5d9b4a, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const R = 30 + rand() * 45;
    const g = new THREE.Group();
    const bottom = new THREE.Mesh(new THREE.ConeGeometry(R, R * 1.8, 7), rockMat);
    bottom.rotation.x = Math.PI;
    bottom.position.y = -R * 0.9;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R, R * 0.25, 7), grassMat);
    top.position.y = R * 0.12;
    g.add(bottom, top);
    const a = rand() * Math.PI * 2;
    const d = 380 + rand() * 420;
    g.position.set(Math.cos(a) * d, 140 + rand() * 160, Math.sin(a) * d);
    g.rotation.y = rand() * 6;
    g.userData.baseY = g.position.y;
    g.userData.phase = rand() * 6;
    list.push(g);
  }
  return list;
}

function createClouds(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
    roughness: 1,
    transparent: true,
    opacity: 0.9,
  });
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const d = 500 + rand() * 1500;
    const y = 320 + rand() * 260;
    const puffs = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < puffs; k++) {
      const puff = new THREE.Mesh(geo, mat);
      const sz = 50 + rand() * 60;
      puff.scale.set(sz * 1.8, sz * 0.5, sz);
      puff.position.set(
        Math.cos(a) * d + (rand() - 0.5) * 160,
        y + (rand() - 0.5) * 20,
        Math.sin(a) * d + (rand() - 0.5) * 160,
      );
      g.add(puff);
    }
  }
  return g;
}

export interface World {
  update(time: number, camera: THREE.Camera): void;
}

export function createWorld(scene: THREE.Scene): World {
  const rand = mulberry32(20261111);

  scene.fog = new THREE.Fog(HORIZON, 200, 4200);
  scene.background = new THREE.Color(HORIZON);

  // 光源：低角度的暖色夕陽＋天空環境光
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x6b5a48, 1.0));
  const sun = new THREE.DirectionalLight(0xffd2a0, 2.2);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sun);

  const sky = createSky();
  scene.add(sky);

  // 巨大的遠方星體
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(620, 48, 24),
    new THREE.MeshStandardMaterial({
      color: 0xfff1dc,
      emissive: 0x8fa3c8,
      emissiveIntensity: 0.55,
      roughness: 1,
      fog: false,
      transparent: true,
      opacity: 0.92,
    }),
  );
  const moonDir = new THREE.Vector3(0.45, 0.42, -0.8).normalize();
  moon.frustumCulled = false;
  scene.add(moon);

  // 海
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(4600, 64),
    new THREE.MeshStandardMaterial({
      color: 0x1f7a99,
      roughness: 0.25,
      metalness: 0.35,
      transparent: true,
      opacity: 0.88,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);

  scene.add(createIsland());
  scene.add(createTrees(rand));
  scene.add(createPillars());

  scene.add(createMountainRing(1500, 2300, 650, 3.1));
  scene.add(createMountainRing(2500, 3700, 1350, 17.7));

  const floating = createFloatingIslands(rand);
  floating.forEach((f) => scene.add(f));

  const clouds = createClouds(rand);
  scene.add(clouds);

  return {
    update(time, camera) {
      sky.position.copy(camera.position);
      moon.position.copy(camera.position).addScaledVector(moonDir, 4200);
      sea.position.y = Math.sin(time * 0.6) * 0.08;
      clouds.rotation.y = time * 0.004;
      for (const f of floating) {
        f.position.y = f.userData.baseY + Math.sin(time * 0.3 + f.userData.phase) * 6;
      }
    },
  };
}
