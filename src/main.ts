import * as THREE from 'three';
import './style.css';
import { Input } from './input';
import { heightAt, ISLAND_RADIUS } from './terrain';
import { createWorld } from './world';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 12000);
const world = createWorld(scene);

const input = new Input(
  canvas,
  document.getElementById('stick') as HTMLElement,
  document.getElementById('knob') as HTMLElement,
  document.getElementById('jump') as HTMLElement,
);

// ---- 玩家 ----
const player = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8554d, flatShading: true });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 4, 10), bodyMat);
body.position.y = 0.9;
const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.38, 12, 10),
  new THREE.MeshStandardMaterial({ color: 0xffe0c2, flatShading: true }),
);
head.position.y = 2.0;
player.add(body, head);
scene.add(player);

// 從南岸往島內找第一塊夠高的陸地當出生點
let startZ = ISLAND_RADIUS;
while (startZ > 0 && heightAt(0, startZ) < 1.5) startZ -= 1;
player.position.set(0, heightAt(0, startZ), startZ);

const WALK = 9;
const RUN = 16;
const GRAVITY = 30;
const JUMP = 11;
const MIN_GROUND = -0.6; // 可以踩進淺灘，不能走進深海
const CAM_DIST = 9;
const LOOK_SPEED = 0.005;

let velY = 0;
let yaw = 0;
let pitch = 0.22;
let moved = false;
const target = new THREE.Vector3();

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
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
  pitch = Math.min(Math.max(pitch + look.dy * LOOK_SPEED, -0.35), 1.2);

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
  target.set(p.x, p.y + 1.7, p.z);
  const cp = Math.cos(pitch);
  camera.position.set(
    target.x + sinY * cp * CAM_DIST,
    target.y + Math.sin(pitch) * CAM_DIST,
    target.z + cosY * cp * CAM_DIST,
  );
  const camGround = Math.max(heightAt(camera.position.x, camera.position.z), 0) + 0.6;
  if (camera.position.y < camGround) camera.position.y = camGround;
  camera.lookAt(target);

  world.update(time, camera);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(frame);
