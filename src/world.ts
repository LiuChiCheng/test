import * as THREE from 'three';
import { FOG_COLOR, FOG_DENSITY, IS_MOBILE, SUN_COLOR, SUN_DIR } from './atmosphere';
import { mulberry32 } from './noise';
import { createScenery } from './scenery';
import { createSky } from './sky';
import { createIsland } from './terrain';
import { createVegetation } from './vegetation';
import { createWater } from './water';

export interface World {
  update(time: number, camera: THREE.Camera, focus: THREE.Vector3): void;
}

export function createWorld(scene: THREE.Scene): World {
  const rand = mulberry32(20261111);
  const timeUniform = { value: 0 };

  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
  scene.background = FOG_COLOR;

  // 光源：暖色斜陽＋偏藍的天空環境光
  scene.add(new THREE.HemisphereLight(0xb9d2ff, 0x9a8468, 2.3));
  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.0);
  sun.castShadow = true;
  const sm = IS_MOBILE ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -70;
  sc.right = 70;
  sc.top = 70;
  sc.bottom = -70;
  sc.near = 1;
  sc.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);

  const sky = createSky();
  const water = createWater();
  const scenery = createScenery(rand);
  scene.add(sky.mesh, water.mesh, scenery.group);
  scene.add(createIsland());
  scene.add(createVegetation(rand, timeUniform));

  return {
    update(time, camera, focus) {
      timeUniform.value = time;
      sky.update(time, camera);
      water.update(time);
      scenery.update(time, camera);
      // 陰影範圍跟著玩家移動
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(SUN_DIR, 200);
    },
  };
}
