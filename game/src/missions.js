// missions.js — the three sorties of Merapi Ridge Run.
// Ring Run: fly 8 glowing rings in order. Supply Drop: drop crates on 3
// village zones (press G, low and slow). Volcano Survey: tag 5 waypoints
// around Merapi's crater. Each mission tracks its own progress and score.

import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { VOLCANO_POS } from './terrain.js';

export const MISSION_DEFS = {
  ring: {
    id: 'ring',
    name: 'Ring Run',
    tagline: 'Terbang melewati 8 ring di atas pantai dan lereng Merapi.',
    objective: 'Lewati ring demi ring — jangan sampai stall di tikungan.',
  },
  supply: {
    id: 'supply',
    name: 'Supply Drop',
    tagline: 'Antar 3 paket suplai ke desa-desa di kaki gunung.',
    objective: 'Terbang rendah di atas zona hijau, tekan G untuk menjatuhkan paket.',
  },
  survey: {
    id: 'survey',
    name: 'Volcano Survey',
    tagline: 'Foto kawah Merapi dari 5 titik pengamatan di udara.',
    objective: 'Lewati 5 waypoint di sekeliling kawah — awas asap dan lereng.',
  },
};

function makeLabelSprite(text, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(8, 20, 32, 0.78)';
  ctx.beginPath();
  ctx.roundRect(6, 8, 244, 56, 12);
  ctx.fill();
  ctx.strokeStyle = '#ffd27f';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 38);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(34 * scale, 9.5 * scale, 1);
  return sprite;
}

function ringPositions(seed) {
  const rng = mulberry32(seed + 913);
  // A loop out of the airstrip, along the coast, up the volcano slope.
  const base = [
    { x: 0, y: 70, z: 60 },
    { x: 260, y: 85, z: -160 },
    { x: 620, y: 110, z: -420 },
    { x: 480, y: 170, z: -820 },
    { x: -60, y: 260, z: -980 },
    { x: -620, y: 330, z: -880 },
    { x: -880, y: 380, z: -480 },
    { x: -560, y: 200, z: -40 },
  ];
  return base.map((p) => ({
    x: p.x + (rng() - 0.5) * 24,
    y: p.y + (rng() - 0.5) * 16,
    z: p.z + (rng() - 0.5) * 24,
  }));
}

function supplyZones() {
  return [
    { x: 620, z: 620, name: 'DESA PARANG' },
    { x: -420, z: 780, name: 'DESA KALIURANG' },
    { x: -1050, z: 240, name: 'POS MERAPI' },
  ];
}

function surveyWaypoints() {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.35;
    const r = 300 + (i % 2) * 90;
    out.push({
      x: VOLCANO_POS.x + Math.sin(a) * r,
      y: 420 + (i % 3) * 55,
      z: VOLCANO_POS.z + Math.cos(a) * r,
    });
  }
  return out;
}

export function createMissionManager(scene, terrain, seed) {
  const manager = {
    id: 'ring',
    score: 0,
    progress: '',
    objective: MISSION_DEFS.ring.objective,
    ringsTotal: 8,
    ringsHit: 0,
    dropsLeft: 3,
    waypointsLeft: 5,
    complete: false,
  };

  const ringGroup = new THREE.Group();
  ringGroup.name = 'mission-rings';
  const zoneGroup = new THREE.Group();
  zoneGroup.name = 'mission-zones';
  const wpGroup = new THREE.Group();
  wpGroup.name = 'mission-waypoints';
  const crateGroup = new THREE.Group();
  crateGroup.name = 'mission-crates';
  scene.add(ringGroup, zoneGroup, wpGroup, crateGroup);

  let rings = [];
  let zones = [];
  let waypoints = [];
  let crates = [];
  let nextRing = 0;
  let nextWaypoint = 0;
  let time = 0;

  function clearGroup(g) {
    while (g.children.length) {
      const child = g.children.pop();
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
  }

  function buildRings() {
    clearGroup(ringGroup);
    rings = ringPositions(seed).map((p, i) => {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(14, 1.3, 8, 28),
        new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.95 })
      );
      torus.position.set(p.x, p.y, p.z);
      // Face the ring along the route to the next ring.
      const next = ringPositions(seed)[(i + 1) % 8];
      torus.lookAt(next.x, next.y, next.z);
      ringGroup.add(torus);
      const label = makeLabelSprite(`RING ${i + 1}`, 0.8);
      label.position.set(p.x, p.y + 20, p.z);
      ringGroup.add(label);
      return { ...p, mesh: torus, label, hit: false };
    });
    nextRing = 0;
    manager.ringsTotal = rings.length;
    manager.ringsHit = 0;
  }

  function buildZones() {
    clearGroup(zoneGroup);
    zones = supplyZones().map((z) => {
      const groundY = Math.max(2, terrain.heightAt(z.x, z.z));
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(42, 28),
        new THREE.MeshBasicMaterial({ color: 0x39d353, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(z.x, groundY + 1.5, z.z);
      zoneGroup.add(disc);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(42, 1.4, 6, 40),
        new THREE.MeshBasicMaterial({ color: 0x39d353 })
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(z.x, groundY + 1.6, z.z);
      zoneGroup.add(rim);
      const label = makeLabelSprite(z.name, 1.1);
      label.position.set(z.x, groundY + 42, z.z);
      zoneGroup.add(label);
      return { ...z, groundY, mesh: disc, label, hit: false };
    });
    manager.dropsLeft = zones.length;
  }

  function buildWaypoints() {
    clearGroup(wpGroup);
    waypoints = surveyWaypoints().map((p, i) => {
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(9, 0),
        new THREE.MeshBasicMaterial({ color: 0x4dc3ff, transparent: true, opacity: 0.9 })
      );
      marker.position.set(p.x, p.y, p.z);
      wpGroup.add(marker);
      const label = makeLabelSprite(`SURVEY ${i + 1}`, 0.8);
      label.position.set(p.x, p.y + 18, p.z);
      wpGroup.add(label);
      return { ...p, mesh: marker, label, hit: false };
    });
    nextWaypoint = 0;
    manager.waypointsLeft = waypoints.length;
  }

  function refreshProgress() {
    if (manager.id === 'ring') {
      manager.progress = `Ring ${manager.ringsHit}/${manager.ringsTotal}`;
    } else if (manager.id === 'supply') {
      const done = zones.filter((z) => z.hit).length;
      manager.progress = `Paket ${done}/3 · Sisa drop ${manager.dropsLeft}`;
    } else {
      const done = waypoints.filter((w) => w.hit).length;
      manager.progress = `Waypoint ${done}/5`;
    }
  }

  function setMission(id) {
    if (!MISSION_DEFS[id]) id = 'ring';
    manager.id = id;
    manager.score = 0;
    manager.complete = false;
    manager.objective = MISSION_DEFS[id].objective;
    crates = [];
    clearGroup(crateGroup);
    buildRings();
    buildZones();
    buildWaypoints();
    // Only the active mission's markers are visible.
    ringGroup.visible = id === 'ring';
    zoneGroup.visible = id === 'supply';
    wpGroup.visible = id === 'survey';
    refreshProgress();
    return manager;
  }

  function dropCrate(flight) {
    if (manager.id !== 'supply' || manager.dropsLeft <= 0 || manager.complete) return null;
    manager.dropsLeft -= 1;
    const crate = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 3.4, 3.4),
      new THREE.MeshStandardMaterial({ color: 0xd8a13c, roughness: 0.9, flatShading: true })
    );
    crate.add(box);
    const chute = new THREE.Mesh(
      new THREE.ConeGeometry(4.4, 3.2, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.9 })
    );
    chute.position.y = 5;
    crate.add(chute);
    crate.position.set(flight.pos.x, flight.pos.y - 3, flight.pos.z);
    crate.userData.vy = 0;
    crate.userData.vx = Math.sin((flight.heading * Math.PI) / 180) * flight.speed * 0.35;
    crate.userData.vz = -Math.cos((flight.heading * Math.PI) / 180) * flight.speed * 0.35;
    crateGroup.add(crate);
    crates.push(crate);
    refreshProgress();
    return crate;
  }

  // Returns event strings: 'ring' | 'drop-hit' | 'drop-miss' | 'waypoint' | 'complete'.
  function update(dt, flight) {
    time += dt;
    const events = [];
    const px = flight.pos.x;
    const py = flight.pos.y;
    const pz = flight.pos.z;

    if (manager.id === 'ring' && !manager.complete) {
      const ring = rings[nextRing];
      if (ring) {
        const d = Math.hypot(px - ring.x, py - ring.y, pz - ring.z);
        ring.mesh.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
        ring.mesh.material.color.setHex(0xffd54f);
        if (d < 15) {
          ring.hit = true;
          ring.mesh.material.color.setHex(0x39d353);
          ring.mesh.scale.setScalar(0.85);
          manager.ringsHit += 1;
          manager.score += 100;
          nextRing += 1;
          events.push('ring');
          if (nextRing >= rings.length) {
            manager.complete = true;
            manager.score += 200;
            events.push('complete');
          }
          refreshProgress();
        }
      }
    }

    if (manager.id === 'survey' && !manager.complete) {
      const wp = waypoints[nextWaypoint];
      if (wp) {
        const d = Math.hypot(px - wp.x, py - wp.y, pz - wp.z);
        wp.mesh.rotation.y += dt * 1.5;
        wp.mesh.scale.setScalar(1 + Math.sin(time * 3) * 0.15);
        if (d < 26) {
          wp.hit = true;
          wp.mesh.material.color.setHex(0x39d353);
          manager.waypointsLeft -= 1;
          manager.score += 80;
          nextWaypoint += 1;
          events.push('waypoint');
          if (nextWaypoint >= waypoints.length) {
            manager.complete = true;
            manager.score += 200;
            events.push('complete');
          }
          refreshProgress();
        }
      }
    }

    // Falling crates: parachute descent, then check the nearest zone.
    for (let i = crates.length - 1; i >= 0; i--) {
      const crate = crates[i];
      crate.userData.vy = Math.max(crate.userData.vy - 9 * dt, -9);
      crate.position.y += crate.userData.vy * dt;
      crate.position.x += crate.userData.vx * dt;
      crate.position.z += crate.userData.vz * dt;
      crate.rotation.y += dt * 0.8;
      const groundY = terrain.heightAt(crate.position.x, crate.position.z);
      if (crate.position.y <= groundY + 1.8) {
        crate.position.y = groundY + 1.8;
        crate.children[1].visible = false; // chute collapses
        let best = null;
        let bestD = Infinity;
        for (const z of zones) {
          const d = Math.hypot(crate.position.x - z.x, crate.position.z - z.z);
          if (d < bestD) {
            bestD = d;
            best = z;
          }
        }
        if (best && bestD < 42 && !best.hit) {
          best.hit = true;
          best.mesh.material.color.setHex(0x2ea8ff);
          manager.score += 150;
          events.push('drop-hit');
          if (zones.every((z) => z.hit)) {
            manager.complete = true;
            manager.score += 200;
            events.push('complete');
          }
        } else {
          events.push('drop-miss');
        }
        crates.splice(i, 1);
        refreshProgress();
      }
    }
    return events;
  }

  function landingBonus(quality) {
    // quality 0..1: gentle + centred on the strip scores more.
    const bonus = Math.round(120 + quality * 180);
    manager.score += bonus;
    return bonus;
  }

  setMission('ring');
  return { manager, setMission, update, dropCrate, landingBonus, MISSION_DEFS };
}
