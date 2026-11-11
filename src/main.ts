import * as THREE from 'three';
import './style.css';
import { IS_MOBILE } from './atmosphere';
import { Input } from './input';
import { heightAt, START } from './terrain';
import { createWorld } from './world';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.75 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 60000);
const world = createWorld(scene);

const input = new Input(
  canvas,
  document.getElementById('stick') as HTMLElement,
  document.getElementById('knob') as HTMLElement,
  document.getElementById('jump') as HTMLElement,
);

// ---- 玩家 ----
function createPlayer(): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), 0x3b4a6b, -0.2, 0.42, 0); // 腿
  add(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), 0x3b4a6b, 0.2, 0.42, 0);
  add(new THREE.CapsuleGeometry(0.42, 0.6, 6, 14), 0xd9534a, 0, 1.25, 0); // 身體
  add(new THREE.SphereGeometry(0.36, 20, 16), 0xffdfc4, 0, 2.08, 0); // 頭
  const hair = add(new THREE.SphereGeometry(0.4, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x4a2f22, 0, 2.12, -0.03);
  hair.rotation.x = -0.25;
  add(new THREE.TorusGeometry(0.3, 0.1, 8, 20), 0xf2c14e, 0, 1.75, 0).rotation.x = Math.PI / 2; // 圍巾
  add(new THREE.BoxGeometry(0.5, 0.6, 0.28), 0x8a5a3c, 0, 1.3, -0.45); // 背包
  return g;
}
const player = createPlayer();
scene.add(player);

const { ux, uz } = START;
player.position.set(START.x, heightAt(START.x, START.z), START.z);

const WALK = 9;
const RUN = 16;
const GRAVITY = 30;
const JUMP = 11;
const MIN_GROUND = -0.6; // 可以踩進淺灘，不能走進深海
const CAM_DIST = 8.5;
const LOOK_SPEED = 0.005;

let velY = 0;
let yaw = Math.atan2(-ux, -uz);
let pitch = 0.2;
let moved = false;
const target = new THREE.Vector3();

player.rotation.y = Math.atan2(ux, uz);

// 除錯用：網址加上 #x,z,yaw,pitch 可指定位置與視角
const dbg = location.hash.slice(1).split(',').map(Number);
if (dbg.length >= 4 && dbg.every((v) => Number.isFinite(v))) {
  player.position.set(dbg[0], heightAt(dbg[0], dbg[1]), dbg[1]);
  yaw = dbg[2];
  pitch = dbg[3];
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 直向手機畫面較窄，放寬視野才看得到遼闊的遠景
  camera.fov = w < h ? 80 : 66;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

const clock = new THREE.Clock();

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  input.update();

  // 視角
  const look = input.consumeLook();
  yaw -= look.dx * LOOK_SPEED;
  pitch = Math.min(Math.max(pitch + look.dy * LOOK_SPEED, -0.45), 1.2);

  // 移動（相對於鏡頭方向）
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const speed = input.sprint ? RUN : WALK;
  const vx = (cosY * input.moveX - sinY * input.moveY) * speed;
  const vz = (-sinY * input.moveX - cosY * input.moveY) * speed;
  const p = player.position;

  const nx = p.x + vx * dt;
  if (heightAt(nx, p.z) > MIN_GROUND) p.x = nx;
  const nz = p.z + vz * dt;
  if (heightAt(p.x, nz) > MIN_GROUND) p.z = nz;

  if (vx !== 0 || vz !== 0) {
    // 角色平滑轉向移動方向
    const want = Math.atan2(vx, vz);
    let diff = want - player.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.rotation.y += diff * Math.min(1, dt * 12);
    if (!moved) {
      moved = true;
      setTimeout(() => document.getElementById('hint')?.classList.add('hidden'), 3000);
    }
  }

  // 重力與跳躍
  const ground = heightAt(p.x, p.z);
  const onGround = p.y <= ground + 0.05;
  if (input.consumeJump() && onGround) velY = JUMP;
  velY -= GRAVITY * dt;
  p.y += velY * dt;
  if (p.y < ground) {
    p.y = ground;
    velY = 0;
  }

  // 第三人稱鏡頭
  target.set(p.x, p.y + 2.0, p.z);
  const cp = Math.cos(pitch);
  camera.position.set(
    target.x + sinY * cp * CAM_DIST,
    target.y + Math.sin(pitch) * CAM_DIST,
    target.z + cosY * cp * CAM_DIST,
  );
  const camGround = Math.max(heightAt(camera.position.x, camera.position.z), 0) + 1.4;
  if (camera.position.y < camGround) camera.position.y = camGround;
  camera.lookAt(target);

  world.update(time, camera, p);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(frame);
