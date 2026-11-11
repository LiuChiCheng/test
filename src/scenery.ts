import * as THREE from 'three';
import { FOG_COLOR, SUN_DIR } from './atmosphere';
import { fbm } from './noise';

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

const farMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

/**
 * 遠方的島嶼／山峰。sharp 越大越尖，越小越像台地。
 */
function createFarIsland(radius: number, height: number, seed: number, sharp: number): THREE.Mesh {
  const aSeg = 80;
  const rSeg = 30;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const green = new THREE.Color(0x7a9a58);
  const rock = new THREE.Color(0x9a9496);
  const dark = new THREE.Color(0x76717a);
  const snow = new THREE.Color(0xffffff);
  const sand = new THREE.Color(0xd9c79a);
  const c = new THREE.Color();
  const snowy = height > 500;

  for (let i = 0; i <= aSeg; i++) {
    const a = (i / aSeg) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let j = 0; j <= rSeg; j++) {
      const t = j / rSeg;
      // 海岸線用雜訊扭曲，避免看起來是正圓
      const coast = 0.75 + fbm(ca * 1.5 + seed, sa * 1.5 + seed, 3) * 0.5;
      const r = t * radius * coast;
      const x = ca * r;
      const z = sa * r;
      const n = fbm((x / radius) * 3.2 + seed, (z / radius) * 3.2 + seed, 5);
      const ridge = 1 - Math.abs(2 * n - 1);
      const profile = Math.pow(smooth(1, 0, t), sharp);
      let h = height * profile * (0.3 + 0.7 * ridge * ridge + 0.25 * n);
      h -= smooth(0.9, 1, t) * 12;
      positions.push(x, h, z);

      const rel = h / height;
      c.copy(sand).lerp(green, smooth(4, 14, h));
      c.lerp(rock, smooth(0.22, 0.42, rel + (n - 0.5) * 0.2)).lerp(dark, ridge * 0.35);
      if (snowy) c.lerp(snow, smooth(0.5, 0.68, rel + (n - 0.5) * 0.15));
      colors.push(c.r, c.g, c.b);
    }
  }
  const row = rSeg + 1;
  for (let i = 0; i < aSeg; i++) {
    for (let j = 0; j < rSeg; j++) {
      const p = i * row + j;
      indices.push(p, p + row, p + 1, p + 1, p + row, p + row + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, farMaterial);
}

/** 地平線盡頭的巨大山脈（一段弧形） */
function createColossalRange(
  centerAngle: number,
  span: number,
  r0: number,
  r1: number,
  H: number,
  seed: number,
  tint: number,
): THREE.Mesh {
  const aSeg = 260;
  const rSeg = 16;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  // 遠到幾乎融進天空：山腳是霧色，越往上越偏藍紫，山頂帶一點雪光
  const hazeC = FOG_COLOR.clone();
  const rockC = new THREE.Color().setRGB(0.5, 0.43, 0.6).lerp(hazeC, tint);
  const snowC = new THREE.Color().setRGB(1.0, 0.82, 0.74).lerp(hazeC, tint * 0.6);
  const c = new THREE.Color();

  for (let i = 0; i <= aSeg; i++) {
    const u = i / aSeg;
    const a = centerAngle + (u - 0.5) * span;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ends = Math.sin(u * Math.PI) ** 0.6;
    for (let j = 0; j <= rSeg; j++) {
      const r = r0 + (j / rSeg) * (r1 - r0);
      const env = Math.sin((j / rSeg) * Math.PI);
      const n = fbm((ca * r) / 1400 + seed, (sa * r) / 1400 + seed, 6);
      const ridge = 1 - Math.abs(2 * n - 1);
      const big = fbm(u * 7 + seed, seed, 3);
      const h = env * ends * H * (0.12 + 0.88 * ridge * ridge) * (0.4 + big * 1.1);
      positions.push(ca * r, h - 20, sa * r);
      c.copy(hazeC).lerp(rockC, smooth(0.0, 0.3, h / H));
      c.lerp(snowC, smooth(0.34, 0.5, h / H + (n - 0.5) * 0.1) * (0.55 + 0.45 * ridge));
      colors.push(c.r, c.g, c.b);
    }
  }
  const row = rSeg + 1;
  for (let i = 0; i < aSeg; i++) {
    for (let j = 0; j < rSeg; j++) {
      const p = i * row + j;
      indices.push(p, p + row, p + 1, p + 1, p + row, p + row + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** 懸在天邊的環狀巨行星 */
function createPlanet(): THREE.Group {
  const g = new THREE.Group();
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshLambertMaterial({
      color: 0xf3e3d0,
      emissive: 0x6f86bb,
      emissiveIntensity: 0.55,
      fog: false,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  planet.renderOrder = -8;
  planet.frustumCulled = false;
  g.add(planet);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffe2c2,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.3,
    fog: false,
    depthWrite: false,
  });
  // 環分成前後兩半：後半先畫、前半後畫，行星才會正確擋住後面的環
  for (const half of [0, 1]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.35, 96, 1, half * Math.PI, Math.PI), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = half === 0 ? -9 : -7;
    ring.frustumCulled = false;
    g.add(ring);
  }
  return g;
}

/** 飛鳥：幫遼闊的場景加上尺度感與生氣 */
function createBirds(rand: () => number): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2a35, side: THREE.DoubleSide });
  const birds: { mesh: THREE.Mesh; wing: THREE.BufferAttribute; r: number; y: number; sp: number; ph: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const geo = new THREE.BufferGeometry();
    const wing = new THREE.Float32BufferAttribute([0, 0, 0.5, -1.4, 0, -0.2, 0, 0, -0.4, 0, 0, 0.5, 1.4, 0, -0.2, 0, 0, -0.4], 3);
    geo.setAttribute('position', wing);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(1.2 + rand());
    group.add(mesh);
    birds.push({ mesh, wing, r: 90 + rand() * 60, y: 55 + rand() * 30, sp: 0.1 + rand() * 0.05, ph: rand() * 0.9 });
  }
  return {
    group,
    update(t) {
      for (const b of birds) {
        const a = t * b.sp + b.ph;
        b.mesh.position.set(Math.cos(a) * b.r - 40, b.y + Math.sin(t * 0.5 + b.ph * 9) * 3, Math.sin(a) * b.r - 60);
        b.mesh.rotation.y = -a;
        const flap = Math.sin(t * 7 + b.ph * 20) * 0.6;
        b.wing.setY(1, flap);
        b.wing.setY(4, flap);
        b.wing.needsUpdate = true;
      }
    },
  };
}

export interface Scenery {
  group: THREE.Group;
  update(time: number, camera: THREE.Camera): void;
}

export function createScenery(rand: () => number): Scenery {
  const group = new THREE.Group();
  const sunAngle = Math.atan2(SUN_DIR.z, SUN_DIR.x);

  // 近海的海蝕柱：高聳的岩柱提供前景的尺度對比
  const stacks = [
    [-0.72, 560, 70, 60, 1.2],
    [-0.6, 980, 70, 250, 0.6],
    [0.55, 700, 90, 80, 1.3],
    [0.8, 1250, 95, 330, 0.6],
    [1.6, 760, 110, 120, 1.0],
    [2.8, 640, 80, 90, 1.2],
    [-1.9, 820, 85, 240, 0.65],
  ];
  stacks.forEach(([da, d, r, h, sharp], i) => {
    const m = createFarIsland(r, h, 40 + i * 7.3, sharp);
    m.position.set(Math.cos(sunAngle + da) * d, 0, Math.sin(sunAngle + da) * d);
    group.add(m);
  });

  // 由近到遠的群島：越遠越大，層層疊向地平線
  const N = 26;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rand() * 0.25;
    const d = 1700 + Math.pow(rand(), 1.3) * 8500;
    const radius = d * (0.05 + rand() * 0.08);
    const height = radius * (0.35 + rand() * 0.6);
    const m = createFarIsland(radius, height, 100 + i * 3.7, 0.7 + rand() * 1.1);
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    m.rotation.y = rand() * 6;
    m.scale.set(1 + rand() * 1.4, 1, 1); // 拉長成山脊狀，避免每座都像圓錐
    group.add(m);
  }

  // 天邊的巨大山脈
  group.add(createColossalRange(sunAngle + 1.2, 2.0, 20000, 27000, 6500, 5.5, 0.62));
  group.add(createColossalRange(sunAngle + 1.05, 1.5, 13000, 18000, 3400, 9.5, 0.3));
  group.add(createColossalRange(sunAngle - 2.3, 1.4, 16000, 22000, 4200, 21.5, 0.5));

  const planet = createPlanet();
  const planetDir = new THREE.Vector3(Math.cos(sunAngle + 0.5), 0.24, Math.sin(sunAngle + 0.5)).normalize();
  planet.scale.setScalar(5200);
  // 讓環的前半朝向觀看者，並稍微傾斜
  planet.rotation.set(0.02, -Math.atan2(planetDir.z, planetDir.x) + Math.PI / 2, 0.22, 'YXZ');
  group.add(planet);

  const birds = createBirds(rand);
  group.add(birds.group);

  return {
    group,
    update(time, camera) {
      planet.position.copy(camera.position).addScaledVector(planetDir, 30000);
      birds.update(time);
    },
  };
}
