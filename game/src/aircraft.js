// aircraft.js — the code-built turboprop island hopper of Merapi Ridge Run.
// Fuselage, wings, tail, spinning propeller, fixed gear and a lit cockpit
// instrument panel. The aircraft faces -Z in its local space; heading 0
// (north) is world -Z, so the group is rotated -heading about Y.
// In cockpit view the exterior shell hides (setCockpitMode) so the pilot
// sees the panel, the propeller and the sky — not the inside of the hull.

import * as THREE from 'three';
import { degToRad } from './rng.js';

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.25,
    flatShading: true,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

export function createAircraft(scene) {
  const group = new THREE.Group();
  group.name = 'aircraft';
  group.rotation.order = 'YXZ';

  // Everything that hides in cockpit view lives in this subgroup.
  const exterior = new THREE.Group();
  exterior.name = 'aircraft-exterior';
  group.add(exterior);

  const white = std(0xf2efe6);
  const red = std(0xc23b2e);
  const dark = std(0x22262b, { roughness: 0.4, metalness: 0.5 });
  const glass = std(0x1a2f45, { roughness: 0.15, metalness: 0.7 });
  const tyre = std(0x141414, { roughness: 0.95, metalness: 0 });

  // Fuselage: main tube along Z, nose cone, tail cone.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.8, 6.4, 10), white);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0, 0.2);
  exterior.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.6, 10), white);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -3.8);
  exterior.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 10), white);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.set(0, 0.15, 4.4);
  exterior.add(tailCone);
  // Red cheatline stripe along both flanks.
  for (const sx of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 5.6), red);
    stripe.position.set(sx * 0.93, -0.1, 0.1);
    exterior.add(stripe);
  }
  // Belly keel.
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 5.0), red);
  keel.position.set(0, -0.95, 0.3);
  exterior.add(keel);

  // Cockpit windows: two angled panes + side windows.
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.18), glass);
  windshield.position.set(0, 0.55, -2.35);
  windshield.rotation.x = -0.5;
  exterior.add(windshield);
  for (const sx of [-1, 1]) {
    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 1.1), glass);
    sideWin.position.set(sx * 0.92, 0.5, -1.7);
    exterior.add(sideWin);
  }

  // Main wing (high wing, slight dihedral) + wingtip nav lights.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.22, 1.9), white);
  wing.position.set(0, 0.75, -0.3);
  wing.rotation.z = 0.03;
  exterior.add(wing);
  const wingRed = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.06, 0.5), red);
  wingRed.position.set(0, 0.88, 0.55);
  exterior.add(wingRed);
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), std(0xff2211, { emissive: 0xff2211, emissiveIntensity: 2 }));
  navL.position.set(-5.75, 0.78, -0.3);
  exterior.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), std(0x22ff66, { emissive: 0x22ff66, emissiveIntensity: 2 }));
  navR.position.set(5.75, 0.78, -0.3);
  exterior.add(navR);
  // Wing struts.
  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5), white);
    strut.position.set(sx * 2.6, -0.15, -0.3);
    strut.rotation.z = sx * 0.6;
    exterior.add(strut);
  }

  // Tail: horizontal stabiliser + red vertical fin.
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.15), white);
  hStab.position.set(0, 0.35, 5.0);
  exterior.add(hStab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 1.5), red);
  fin.position.set(0, 1.15, 5.0);
  fin.rotation.x = -0.25;
  exterior.add(fin);

  // Fixed tricycle gear: nose wheel + two mains.
  function wheel(x, y, z) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 5), dark);
    strut.position.set(x, y + 0.45, z);
    exterior.add(strut);
    const tyreMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), tyre);
    tyreMesh.rotation.z = Math.PI / 2;
    tyreMesh.position.set(x, y, z);
    exterior.add(tyreMesh);
  }
  wheel(0, -1.35, -2.2);
  wheel(-0.95, -1.35, 0.6);
  wheel(0.95, -1.35, 0.6);

  // Propeller: spinner + two blades, spins about Z. Stays visible in cockpit.
  const propeller = new THREE.Group();
  propeller.position.set(0, 0, -4.7);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 8), red);
  spinner.rotation.x = -Math.PI / 2;
  propeller.add(spinner);
  const bladeMat = std(0x1c1c1c, { roughness: 0.4, metalness: 0.3 });
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.6, 0.1), bladeMat);
    blade.rotation.z = (i * Math.PI) / 2;
    blade.rotation.y = 0.35;
    propeller.add(blade);
  }
  // NOTE: no translucent propeller disc — at cockpit distance its faint
  // grey circle read as a giant dome filling the sky. The spinning blades
  // alone carry the propeller.
  group.add(propeller);

  // Cockpit instrument panel: a dark glareshield with glowing dials, visible
  // from the cockpit camera and through the windshield. Stays visible in
  // cockpit view; in chase view it reads through the glass.
  const panel = new THREE.Group();
  panel.name = 'instrument-panel';
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 0.2), std(0x1d2126, { roughness: 0.7, metalness: 0.2 }));
  panel.add(dash);
  const dialDefs = [
    { x: -0.42, y: 0.09, c: 0x7fd4ff }, // airspeed
    { x: 0, y: 0.09, c: 0x9dff7f }, // attitude
    { x: 0.42, y: 0.09, c: 0xffd27f }, // altimeter
    { x: -0.21, y: -0.19, c: 0xff9d7f }, // heading
    { x: 0.21, y: -0.19, c: 0xd27fff }, // fuel
  ];
  const needles = [];
  for (const d of dialDefs) {
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x0b0e11, emissive: d.c, emissiveIntensity: 0.85, roughness: 0.4 })
    );
    face.position.set(d.x, d.y, 0.12);
    panel.add(face);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    needle.position.set(d.x, d.y, 0.135);
    needle.geometry.translate(0, 0.05, 0);
    panel.add(needle);
    needles.push(needle);
  }
  // A small glowing GPS strip across the panel.
  const gps = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.12, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x0a2a12, emissive: 0x39ff88, emissiveIntensity: 0.9 })
  );
  gps.position.set(0, -0.015, 0.12);
  panel.add(gps);
  panel.position.set(0, 0.42, -2.05);
  panel.rotation.x = -0.12;
  group.add(panel);

  scene.add(group);

  function setAttitude(pos, headingDeg, pitchDeg, rollDeg) {
    group.position.copy(pos);
    group.rotation.y = -degToRad(headingDeg);
    group.rotation.x = degToRad(pitchDeg);
    group.rotation.z = -degToRad(rollDeg);
  }

  let propAngle = 0;
  function spinPropeller(throttle, dt) {
    propAngle += dt * (4 + throttle * 55);
    propeller.rotation.z = propAngle;
  }

  function setNeedles(speedNorm, altNorm, headingNorm, fuel) {
    // Needle 0 airspeed, 1 attitude, 2 altimeter, 3 heading, 4 fuel.
    if (needles[0]) needles[0].rotation.z = -speedNorm * 4.2 + 1.2;
    if (needles[1]) needles[1].rotation.z = Math.sin(headingNorm * Math.PI * 2) * 0.4;
    if (needles[2]) needles[2].rotation.z = -altNorm * 4.2 + 1.2;
    if (needles[3]) needles[3].rotation.z = -headingNorm * Math.PI * 2;
    if (needles[4]) needles[4].rotation.z = 1.2 - fuel * 2.4;
  }

  function setCockpitMode(on) {
    exterior.visible = !on;
  }

  return { group, propeller, setAttitude, spinPropeller, setNeedles, setCockpitMode };
}
