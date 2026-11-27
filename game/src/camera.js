// camera.js — the camera rig of Merapi Ridge Run.
// Chase: a smoothed follow camera that never fights the pilot (position
// lerps, look-ahead point leads the aircraft). Cockpit: the pilot's seat,
// panel and propeller in frame. Orbit: a slow menu orbit around the parked
// aircraft. All three read the same aircraft pose.

import * as THREE from 'three';
import { degToRad, angleLerp } from './rng.js';

export function createCameraRig(camera) {
  const rig = {
    mode: 'chase',
    orbitAngle: 0,
  };
  const chasePos = new THREE.Vector3(0, 12, 580);
  const lookPoint = new THREE.Vector3(0, 8, 540);
  const tmpTarget = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  function setMode(mode) {
    if (mode === 'chase' || mode === 'cockpit' || mode === 'orbit') rig.mode = mode;
    return rig.mode;
  }

  function update(dt, aircraftPos, headingDeg, pitchDeg, rollDeg) {
    const hRad = degToRad(headingDeg);
    const forward = new THREE.Vector3(Math.sin(hRad), 0, -Math.cos(hRad));

    if (rig.mode === 'cockpit') {
      // Pilot's seat: just behind the panel, eyes above the nose.
      const eye = tmpTarget
        .copy(aircraftPos)
        .addScaledVector(forward, 0.4)
        .add(new THREE.Vector3(0, 1.15, 0));
      camera.position.copy(eye);
      tmpLook
        .copy(aircraftPos)
        .addScaledVector(forward, 60)
        .add(new THREE.Vector3(0, 1.15 + Math.tan(degToRad(pitchDeg)) * 40, 0));
      camera.up.set(Math.sin(degToRad(-rollDeg)) * 0.25, 1, 0);
      camera.lookAt(tmpLook);
      camera.up.set(0, 1, 0);
      return;
    }

    if (rig.mode === 'orbit') {
      rig.orbitAngle += dt * 0.12;
      const r = 26;
      camera.position.set(
        aircraftPos.x + Math.sin(rig.orbitAngle) * r,
        aircraftPos.y + 7 + Math.sin(rig.orbitAngle * 0.7) * 2,
        aircraftPos.z + Math.cos(rig.orbitAngle) * r
      );
      camera.lookAt(aircraftPos.x, aircraftPos.y + 1, aircraftPos.z);
      return;
    }

    // Chase: sit behind and above, ease toward the slot, look ahead.
    const slot = tmpTarget
      .copy(aircraftPos)
      .addScaledVector(forward, -15)
      .add(new THREE.Vector3(0, 4.5, 0));
    const k = 1 - Math.exp(-dt * 4.5);
    chasePos.lerp(slot, k);
    camera.position.copy(chasePos);
    const ahead = tmpLook
      .copy(aircraftPos)
      .addScaledVector(forward, 22)
      .add(new THREE.Vector3(0, 1.5 + Math.tan(degToRad(pitchDeg)) * 12, 0));
    lookPoint.lerp(ahead, 1 - Math.exp(-dt * 6));
    camera.lookAt(lookPoint);
  }

  function snapToChase(aircraftPos, headingDeg) {
    const hRad = degToRad(headingDeg);
    chasePos
      .copy(aircraftPos)
      .add(new THREE.Vector3(-Math.sin(hRad) * 15, 4.5, Math.cos(hRad) * 15));
    lookPoint.copy(aircraftPos);
  }

  return { rig, setMode, update, snapToChase };
}
