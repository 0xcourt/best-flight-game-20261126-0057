// terrain.js — the volcanic Indonesian archipelago of Merapi Ridge Run.
// One big island with a smoking volcano (Merapi), a smaller cone, two outer
// islets, a coastline, a sea, and a flattened coastal airstrip with a runway.
// heightAt(x, z) is the single source of truth for terrain height: the mesh,
// the flight collisions and the mission placements all read it.

import * as THREE from 'three';
import { makeNoise2D, mulberry32, clamp, lerp, smoothstep } from './rng.js';

export const WORLD_RADIUS = 1900;
export const SEA_LEVEL = 0;
export const VOLCANO_POS = { x: -850, z: -750 };
export const RUNWAY = { x: 0, z: 350, halfWidth: 14, halfLength: 210, elevation: 6 };

function islandMask(x, z) {
  // Mainland + two outer islets, each a smooth radial falloff.
  const d1 = Math.hypot(x + 350, z + 250) / 1500;
  const d2 = Math.hypot(x - 1050, z - 780) / 720;
  const d3 = Math.hypot(x + 1250, z - 950) / 520;
  const m1 = 1 - smoothstep(0.55, 1.0, d1);
  const m2 = 1 - smoothstep(0.5, 1.0, d2);
  const m3 = 1 - smoothstep(0.5, 1.0, d3);
  return Math.max(m1, m2, m3);
}

export function makeHeightAt(seed) {
  const { fbm } = makeNoise2D(seed);
  function rawHeight(x, z) {
    const mask = islandMask(x, z);
    let h = -16 + mask * (110 + fbm(x * 0.0016 + 7.3, z * 0.0016 - 2.1) * 62);
    // Merapi: one big cone with a crater dip at the summit.
    const rv = Math.hypot(x - VOLCANO_POS.x, z - VOLCANO_POS.z);
    h += 430 * Math.pow(Math.max(0, 1 - rv / 640), 1.35);
    if (rv < 120) h -= (1 - rv / 120) * 95;
    // Second, smaller cone to the east.
    const r2 = Math.hypot(x - 950, z + 950);
    h += 185 * Math.pow(Math.max(0, 1 - r2 / 400), 1.25);
    // Rolling hills on the mainland.
    h += mask * fbm(x * 0.006 + 40, z * 0.006 - 17) * 26;
    return h;
  }
  // The airstrip is bulldozed flat at the local terrain height, so the
  // runway sits in the landscape instead of cutting a canyon through it.
  const stripElevation = Math.round(rawHeight(RUNWAY.x, RUNWAY.z));
  RUNWAY.elevation = stripElevation;
  function heightAt(x, z) {
    let h = rawHeight(x, z);
    const dx = Math.max(Math.abs(x - RUNWAY.x) - RUNWAY.halfWidth, 0);
    const dz = Math.max(Math.abs(z - RUNWAY.z) - RUNWAY.halfLength, 0);
    const d = Math.hypot(dx, dz);
    if (d < 90) {
      const t = 1 - smoothstep(0, 90, d);
      h = lerp(h, stripElevation, t);
    }
    return h;
  }
  return heightAt;
}

function paintTerrainColor(h, slope, distVolcano, out) {
  // One flat-shaded low-poly palette: sand, jungle green, rock, ash.
  const sand = [0.85, 0.76, 0.52];
  const grass = [0.32, 0.52, 0.26];
  const jungle = [0.16, 0.38, 0.18];
  const rock = [0.42, 0.36, 0.32];
  const ash = [0.23, 0.22, 0.22];
  let c;
  if (h < 3.5) c = sand;
  else if (h < 60) c = grass;
  else if (h < 170) c = jungle;
  else c = rock;
  // Ash ring around the crater, rock on steep slopes.
  if (distVolcano < 260) {
    const t = 1 - smoothstep(120, 260, distVolcano);
    c = [lerp(c[0], ash[0], t), lerp(c[1], ash[1], t), lerp(c[2], ash[2], t)];
  }
  if (slope > 0.55 && h > 40) {
    const t = smoothstep(0.55, 0.9, slope);
    c = [lerp(c[0], rock[0], t), lerp(c[1], rock[1], t), lerp(c[2], rock[2], t)];
  }
  // Slight variation so the facets read.
  const v = 0.92 + ((h * 13.7) % 1) * 0.16;
  out[0] = clamp(c[0] * v, 0, 1);
  out[1] = clamp(c[1] * v, 0, 1);
  out[2] = clamp(c[2] * v, 0, 1);
}

function buildGroundMesh(heightAt) {
  const size = 3800;
  const seg = 80;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const slope = Math.abs(heightAt(x + 6, z) - h) / 6 + Math.abs(heightAt(x, z + 6) - h) / 6;
    const dv = Math.hypot(x - VOLCANO_POS.x, z - VOLCANO_POS.z);
    paintTerrainColor(h, slope, dv, tmp);
    colors[i * 3] = tmp[0];
    colors[i * 3 + 1] = tmp[1];
    colors[i * 3 + 2] = tmp[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

function buildSea() {
  const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({
    color: 0x1e6f9e,
  });
  const sea = new THREE.Mesh(geo, mat);
  sea.position.y = SEA_LEVEL + 0.2;
  sea.name = 'sea';
  return sea;
}

function buildRunwayStrip() {
  const group = new THREE.Group();
  group.name = 'runway';
  const y = RUNWAY.elevation + 0.35;
  const asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.halfWidth * 2, 0.6, RUNWAY.halfLength * 2),
    new THREE.MeshLambertMaterial({ color: 0x33383e })
  );
  asphalt.position.set(RUNWAY.x, y, RUNWAY.z);
  group.add(asphalt);
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2e8 });
  // Centreline dashes.
  for (let i = -9; i <= 9; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 14), white);
    dash.position.set(RUNWAY.x, y + 0.35, RUNWAY.z + i * 22);
    group.add(dash);
  }
  // Edge lines and threshold bars.
  for (const sx of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.15, RUNWAY.halfLength * 2 - 8), white);
    edge.position.set(RUNWAY.x + sx * (RUNWAY.halfWidth - 1.5), y + 0.35, RUNWAY.z);
    group.add(edge);
  }
  for (const sz of [-1, 1]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 9), white);
      bar.position.set(RUNWAY.x + k * 4.4, y + 0.35, RUNWAY.z + sz * (RUNWAY.halfLength - 16));
      group.add(bar);
    }
  }
  // Windsock beside the strip.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 })
  );
  pole.position.set(RUNWAY.x + 24, y + 4.5, RUNWAY.z + 60);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.2, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7a1a })
  );
  sock.rotation.z = Math.PI / 2.3;
  sock.position.set(RUNWAY.x + 26.2, y + 8.4, RUNWAY.z + 60);
  group.add(sock);
  // Two hangars and a control tower.
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0x8a94a0 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  for (const hz of [RUNWAY.z - 120, RUNWAY.z - 60]) {
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 15), hangarMat);
    hangar.position.set(RUNWAY.x - 34, y + 4, hz);
    group.add(hangar);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 20, 3, 1), roofMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.scale.set(1, 1, 0.55);
    roof.position.set(RUNWAY.x - 34, y + 8.4, hz);
    group.add(roof);
  }
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.8, 20, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8e4d8 })
  );
  tower.position.set(RUNWAY.x + 30, y + 10, RUNWAY.z - 150);
  group.add(tower);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(9, 4.5, 9),
    new THREE.MeshLambertMaterial({
      color: 0x223344,
      emissive: 0x88bbdd,
      emissiveIntensity: 0.35,
    })
  );
  cab.position.set(RUNWAY.x + 30, y + 22, RUNWAY.z - 150);
  group.add(cab);
  return group;
}

function buildClouds(rng) {
  const group = new THREE.Group();
  group.name = 'clouds';
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const r = 10 + rng() * 12;
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), mat);
      s.position.set((rng() - 0.5) * 55, (rng() - 0.5) * 6, (rng() - 0.5) * 26);
      s.scale.y = 0.45;
      cloud.add(s);
    }
    // High band (480–600 m): clear of the 100–400 m cruise and ring band,
    // so a screenshot never flies through a cloud.
    cloud.position.set((rng() - 0.5) * 3600, 480 + rng() * 120, (rng() - 0.5) * 3600);
    cloud.userData.speed = 2 + rng() * 3;
    group.add(cloud);
    clouds.push(cloud);
  }
  return { group, clouds };
}

function buildSmoke() {
  const group = new THREE.Group();
  group.name = 'volcano-smoke';
  const puffs = [];
  const mat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.4 });
  for (let i = 0; i < 9; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + i * 1.0, 7, 5), mat.clone());
    puff.userData.phase = i / 9;
    group.add(puff);
    puffs.push(puff);
  }
  return { group, puffs };
}

export function createTerrain(scene, seed) {
  const heightAt = makeHeightAt(seed);
  const rng = mulberry32(seed + 77);

  scene.add(buildGroundMesh(heightAt));
  scene.add(buildSea());
  scene.add(buildRunwayStrip());
  const clouds = buildClouds(rng);
  scene.add(clouds.group);
  const smoke = buildSmoke();
  scene.add(smoke.group);

  // Crater glow: a hot ember disc deep in the crater.
  const crater = new THREE.Mesh(
    new THREE.CircleGeometry(46, 20),
    new THREE.MeshBasicMaterial({ color: 0xff5a1a })
  );
  crater.rotation.x = -Math.PI / 2;
  crater.position.set(VOLCANO_POS.x, heightAt(VOLCANO_POS.x, VOLCANO_POS.z) + 2, VOLCANO_POS.z);
  scene.add(crater);

  const clock = { t: 0 };
  function update(dt) {
    clock.t += dt;
    for (const cloud of clouds.clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 1900) cloud.position.x = -1900;
    }
    const baseY = heightAt(VOLCANO_POS.x, VOLCANO_POS.z) + 8;
    for (const puff of smoke.puffs) {
      const ph = (puff.userData.phase + clock.t * 0.03) % 1;
      puff.position.set(
        VOLCANO_POS.x + Math.sin(ph * 9) * 12 + ph * 26,
        baseY + ph * 130,
        VOLCANO_POS.z + Math.cos(ph * 7) * 10 - ph * 18
      );
      const s = 0.6 + ph * 1.2;
      puff.scale.set(s, s * 0.8, s);
      puff.material.opacity = 0.4 * (1 - ph);
    }
    crater.material.color.setHSL(0.05, 0.95, 0.45 + Math.sin(clock.t * 2.2) * 0.08);
  }

  return { heightAt, update, runway: RUNWAY, volcanoPos: VOLCANO_POS };
}
