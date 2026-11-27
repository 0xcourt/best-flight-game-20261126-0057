// main.js — boot and wiring for Merapi Ridge Run.
// Builds the renderer, the world, the aircraft and the missions, exposes the
// window.MRR contract (telemetry every frame + setPose / setCamera /
// setMission / setTimeOfDay), mounts Builder B's HUD, then runs Builder B's
// staging for ?shot= URLs, then starts the loop. Order matters: MRR first,
// staging second, loop last, so staging never races the game.

import * as THREE from 'three';
import { mulberry32, clamp } from './rng.js';
import { createTerrain, RUNWAY } from './terrain.js';
import { createAircraft } from './aircraft.js';
import { createFlight, resetFlight, stepFlight, flightSnapshot } from './flight.js';
import { createMissionManager } from './missions.js';
import { createCameraRig } from './camera.js';
import { mountHud, updateHud } from './hud.js';
import { stageShotFromUrl } from './staging.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') || '7', 10);
const SEED = Number.isFinite(seedParam) ? seedParam : 7;
const MISSION_PARAM = params.get('mission') || 'ring';
const VIEW_PARAM = params.get('view') || 'chase';
const HAS_SHOT = params.has('shot');

const RUNWAY_START = { x: RUNWAY.x, y: RUNWAY.elevation + 2, z: RUNWAY.z + 190, headingDeg: 0, pitchDeg: 0, speed: 0, throttle: 0 };

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x9fd4e8, 900, 3400);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);
camera.position.set(0, 12, 580);

const hemi = new THREE.HemisphereLight(0xbfdfff, 0x3d5a3a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(600, 900, 300);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// --- World ------------------------------------------------------------------
const terrain = createTerrain(scene, SEED);
const aircraft = createAircraft(scene);
const flight = createFlight(terrain);
const missions = createMissionManager(scene, terrain, SEED);
const cameraRig = createCameraRig(camera);
cameraRig.setMode(VIEW_PARAM === 'cockpit' ? 'cockpit' : 'chase');

// --- Input ------------------------------------------------------------------
const keys = {};
const input = {
  throttleUp: false, throttleDown: false, pitchUp: false, pitchDown: false,
  rollLeft: false, rollRight: false, yawLeft: false, yawRight: false, brake: false,
};
const KEYMAP = {
  KeyW: 'throttleUp', KeyS: 'throttleDown',
  ArrowUp: 'pitchUp', ArrowDown: 'pitchDown',
  ArrowLeft: 'rollLeft', ArrowRight: 'rollRight',
  KeyA: 'yawLeft', KeyD: 'yawRight', KeyQ: 'yawLeft', KeyE: 'yawRight',
  Space: 'brake',
};
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  const name = KEYMAP[e.code];
  if (name) input[name] = true;
  if (e.code === 'KeyC') toggleCamera();
  if (e.code === 'KeyR') startFlight();
  if (e.code === 'KeyG') dropSupply();
  if (e.code === 'Digit1') setMission('ring');
  if (e.code === 'Digit2') setMission('supply');
  if (e.code === 'Digit3') setMission('survey');
  if (e.code === 'Enter') {
    if (window.MRR.state === 'menu' || window.MRR.state === 'crashed' || window.MRR.state === 'complete' || window.MRR.state === 'landed') startFlight();
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  const name = KEYMAP[e.code];
  if (name) input[name] = false;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Toast (small in-game event line; the HUD itself lives in hud.js) -------
const toastEl = document.getElementById('mrr-toast');
let toastTimer = 0;
function toast(msg, seconds = 3.2) {
  window.MRR.message = msg;
  window.MRR.messageAt = performance.now();
  if (toastEl) {
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    toastTimer = seconds;
  }
}

// --- window.MRR contract -----------------------------------------------------
const MRR = {
  alt: 0, speed: 0, heading: 0, throttle: 0, fuel: 1, damage: 0,
  mission: 'ring', objective: '', progress: '', score: 0,
  state: 'menu', time: 0,
  ringsTotal: 8, ringsHit: 0, dropsLeft: 3, waypointsLeft: 5,
  message: '', messageAt: 0, camera: 'chase',
};
window.MRR = MRR;

function setPose(pose) {
  resetFlight(flight, {
    x: pose.x ?? RUNWAY_START.x,
    y: pose.y ?? RUNWAY_START.y,
    z: pose.z ?? RUNWAY_START.z,
    headingDeg: pose.headingDeg ?? 0,
    pitchDeg: pose.pitchDeg ?? 0,
    speed: pose.speed ?? 0,
    throttle: pose.throttle ?? 0,
  });
  aircraft.setAttitude(
    new THREE.Vector3(flight.pos.x, flight.pos.y, flight.pos.z),
    flight.heading, flight.pitch, flight.roll
  );
  cameraRig.snapToChase(new THREE.Vector3(flight.pos.x, flight.pos.y, flight.pos.z), flight.heading);
  if (MRR.state === 'menu') MRR.state = 'flying';
  return MRR;
}

function setCamera(mode, opts = {}) {
  if (mode === 'chase' || mode === 'cockpit' || mode === 'orbit') {
    cameraRig.setMode(mode);
    MRR.camera = mode;
  }
  if (opts && typeof opts.fov === 'number') {
    camera.fov = clamp(opts.fov, 30, 100);
    camera.updateProjectionMatrix();
  }
  return MRR.camera;
}

function setMission(id) {
  missions.setMission(id);
  MRR.mission = missions.manager.id;
  MRR.objective = missions.manager.objective;
  MRR.ringsTotal = missions.manager.ringsTotal;
  MRR.ringsHit = missions.manager.ringsHit;
  MRR.dropsLeft = missions.manager.dropsLeft;
  MRR.waypointsLeft = missions.manager.waypointsLeft;
  MRR.progress = missions.manager.progress;
  toast(`${missions.MISSION_DEFS[MRR.mission].name} — ${missions.MISSION_DEFS[MRR.mission].tagline}`);
  return MRR.mission;
}

function setTimeOfDay(t) {
  const clamped = clamp(t, 0, 1);
  const elev = (Math.sin(clamped * Math.PI) * 62 + 4) * (Math.PI / 180);
  const azim = (0.15 + clamped * 0.7) * Math.PI * 2;
  sun.position.set(Math.cos(azim) * Math.cos(elev) * 1200, Math.sin(elev) * 1200, Math.sin(azim) * Math.cos(elev) * 1200);
  const dawn = new THREE.Color(0xffb37a);
  const noon = new THREE.Color(0x87ceeb);
  const dusk = new THREE.Color(0xff7e5f);
  const sky = clamped < 0.5 ? dawn.clone().lerp(noon, clamped * 2) : noon.clone().lerp(dusk, (clamped - 0.5) * 2);
  scene.background = sky;
  scene.fog.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.25);
  sun.intensity = 0.9 + Math.sin(clamped * Math.PI) * 0.9;
  hemi.intensity = 0.6 + Math.sin(clamped * Math.PI) * 0.45;
  return clamped;
}

function startFlight() {
  setPose(RUNWAY_START);
  MRR.state = 'flying';
  MRR.time = 0;
  MRR.score = 0;
  missions.setMission(MRR.mission);
  cameraRig.setMode(MRR.camera === 'orbit' ? 'chase' : MRR.camera);
  MRR.camera = cameraRig.rig.mode;
  toast(`${missions.MISSION_DEFS[MRR.mission].name} — tekan W untuk throttle, panah untuk terbang.`);
}

function toggleCamera() {
  const next = MRR.camera === 'chase' ? 'cockpit' : 'chase';
  setCamera(next);
}

function dropSupply() {
  if (MRR.state !== 'flying') return;
  const crate = missions.dropCrate(flight);
  if (crate) toast('Paket dijatuhkan — awasi parasutnya!');
  else if (MRR.mission === 'supply') toast('Tidak ada paket tersisa!');
}

MRR.setPose = setPose;
MRR.setCamera = setCamera;
MRR.setMission = setMission;
MRR.setTimeOfDay = setTimeOfDay;
MRR.start = startFlight;
MRR.restart = startFlight;

// --- HUD (Builder B) ---------------------------------------------------------
let hudHandles = undefined;
try {
  hudHandles = mountHud();
} catch (err) {
  console.warn('mountHud failed, continuing without HUD:', err);
}

// --- Boot state ---------------------------------------------------------------
resetFlight(flight, RUNWAY_START);
missions.setMission(MISSION_PARAM in missions.MISSION_DEFS ? MISSION_PARAM : 'ring');
MRR.mission = missions.manager.id;
MRR.objective = missions.manager.objective;
MRR.progress = missions.manager.progress;
MRR.ringsTotal = missions.manager.ringsTotal;
MRR.dropsLeft = missions.manager.dropsLeft;
MRR.waypointsLeft = missions.manager.waypointsLeft;
if (VIEW_PARAM === 'cockpit') setCamera('cockpit');
setTimeOfDay(0.32);

// --- Staging (Builder B): ?shot=N poses, only when the URL asks -------------
try {
  stageShotFromUrl();
} catch (err) {
  console.warn('stageShotFromUrl failed, continuing:', err);
}
if (HAS_SHOT && MRR.state === 'menu') MRR.state = 'flying';

// --- Main loop -----------------------------------------------------------------
const clock = new THREE.Clock();
let hudFailures = 0;

function refreshTelemetry() {
  const snap = flightSnapshot(flight);
  MRR.alt = snap.alt;
  MRR.speed = snap.speed;
  MRR.heading = snap.heading;
  MRR.throttle = snap.throttle;
  MRR.fuel = snap.fuel;
  MRR.damage = snap.damage;
  MRR.mission = missions.manager.id;
  MRR.objective = missions.manager.objective;
  MRR.progress = missions.manager.progress;
  MRR.score = missions.manager.score;
  MRR.ringsTotal = missions.manager.ringsTotal;
  MRR.ringsHit = missions.manager.ringsHit;
  MRR.dropsLeft = missions.manager.dropsLeft;
  MRR.waypointsLeft = missions.manager.waypointsLeft;
}

function handleFlightEvents(events) {
  for (const ev of events) {
    if (ev === 'takeoff') {
      if (MRR.state === 'landed') MRR.state = 'flying';
      toast('Lepas landas! Roda sudah di udara.');
    } else if (ev === 'landed') {
      const quality = clamp(1 - Math.abs(flight.verticalSpeed) / 4.5, 0, 1) * clamp(1 - flight.speed / 58, 0.3, 1);
      const bonus = missions.landingBonus(quality);
      MRR.state = 'landed';
      toast(`MENDARAT MULUS! Bonus pendaratan +${bonus}. Tekan Enter untuk terbang lagi.`, 4.5);
    } else if (ev === 'hard-landing') {
      toast('Pendaratan keras! Kerusakan +25%.', 4);
    } else if (ev === 'crashed-terrain') {
      flight.damage = 1;
      MRR.state = 'crashed';
      toast('TABRAKAN! Pesawat menghantam lereng. Tekan Enter untuk mencoba lagi.', 5);
    } else if (ev === 'crashed-water') {
      flight.damage = 1;
      MRR.state = 'crashed';
      toast('MENDARAT DARURAT DI LAUT! Tekan Enter untuk mencoba lagi.', 5);
    } else if (ev === 'crashed-damage') {
      MRR.state = 'crashed';
      toast('Kerusakan 100% — pesawat tidak bisa terbang. Tekan Enter.', 5);
    } else if (ev === 'fuel-empty') {
      toast('BAHAN BAKAR HABIS! Cari landasan, meluncur dengan hati-hati.', 5);
    }
  }
}

function handleMissionEvents(events) {
  for (const ev of events) {
    if (ev === 'ring') toast(`Ring ${missions.manager.ringsHit}/${missions.manager.ringsTotal} — +100!`);
    else if (ev === 'waypoint') toast(`Titik survey ${5 - missions.manager.waypointsLeft}/5 — +80!`);
    else if (ev === 'drop-hit') toast('Paket mendarat di zona! +150!');
    else if (ev === 'drop-miss') toast('Paket meleset dari zona…');
    else if (ev === 'complete') {
      MRR.state = 'complete';
      toast(`MISI SELESAI! Skor ${missions.manager.score}. Tekan Enter untuk misi baru.`, 6);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const flying = MRR.state === 'flying' || MRR.state === 'landed';

  if (flying) {
    MRR.time += dt;
    const flightEvents = stepFlight(flight, input, dt, terrain);
    handleFlightEvents(flightEvents);
    if (MRR.state === 'flying' || MRR.state === 'landed') {
      handleMissionEvents(missions.update(dt, flight));
    }
  }

  terrain.update(dt);
  aircraft.setAttitude(
    new THREE.Vector3(flight.pos.x, flight.pos.y, flight.pos.z),
    flight.heading, flight.pitch, flight.roll
  );
  aircraft.spinPropeller(MRR.state === 'menu' ? 0.12 : flight.throttle, dt);
  aircraft.setNeedles(
    clamp(flight.speed / 96, 0, 1),
    clamp(flight.pos.y / 500, 0, 1),
    flight.heading / 360,
    flight.fuel
  );

  if (MRR.state === 'menu') cameraRig.setMode('orbit');
  else if (MRR.camera === 'orbit') cameraRig.setMode('chase');
  cameraRig.update(
    dt,
    new THREE.Vector3(flight.pos.x, flight.pos.y, flight.pos.z),
    flight.heading, flight.pitch, flight.roll
  );

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0 && toastEl) toastEl.style.opacity = '0';
  }

  refreshTelemetry();
  if (hudFailures < 3) {
    try {
      updateHud(hudHandles, window.MRR);
    } catch (err) {
      hudFailures += 1;
      console.warn('updateHud failed (' + hudFailures + '/3):', err);
    }
  }
  renderer.render(scene, camera);
}

animate();
