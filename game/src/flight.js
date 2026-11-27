// flight.js — the arcade flight model of Merapi Ridge Run.
// Keyboard: W/S throttle, Up/Down pitch, Left/Right bank, A/D rudder,
// Space airbrake, R reset. Stall, fuel burn, hard-landing damage, runway
// landing detection and arena bounds all live here.

import { clamp, lerp, degToRad, radToDeg, angleLerp } from './rng.js';
import { RUNWAY, WORLD_RADIUS } from './terrain.js';

export const STALL_SPEED = 30; // m/s, below this the wing stops flying
export const MAX_SPEED = 96; // m/s at full throttle, level flight
export const TAKEOFF_SPEED = 34;

export function createFlight(terrain) {
  const flight = {
    pos: { x: 0, y: 8, z: 560 },
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0, // m/s
    throttle: 0,
    fuel: 1,
    damage: 0,
    verticalSpeed: 0,
    onGround: true,
    fuelEmpty: false,
    outOfBounds: false,
  };
  return flight;
}

export function resetFlight(flight, pose) {
  flight.pos.x = pose.x;
  flight.pos.y = pose.y;
  flight.pos.z = pose.z;
  flight.heading = pose.headingDeg ?? 0;
  flight.pitch = pose.pitchDeg ?? 0;
  flight.roll = 0;
  flight.speed = pose.speed ?? 0;
  flight.throttle = pose.throttle ?? 0;
  flight.fuel = 1;
  flight.damage = 0;
  flight.verticalSpeed = 0;
  flight.onGround = flight.pos.y <= 9;
  flight.fuelEmpty = false;
  flight.outOfBounds = false;
}

// input: { throttleUp, throttleDown, pitchUp, pitchDown, rollLeft, rollRight,
//          yawLeft, yawRight, brake } — all booleans for this frame.
// Returns an array of event strings: 'takeoff' | 'landed' | 'crashed-terrain'
// | 'crashed-water' | 'crashed-damage' | 'fuel-empty' | 'hard-landing'.
export function stepFlight(flight, input, dt, terrain) {
  const events = [];
  const wasOnGround = flight.onGround;

  // --- Throttle ------------------------------------------------------------
  if (flight.fuel <= 0) {
    flight.throttle = Math.max(0, flight.throttle - dt * 0.8);
    if (!flight.fuelEmpty) {
      flight.fuelEmpty = true;
      events.push('fuel-empty');
    }
  } else {
    if (input.throttleUp) flight.throttle = clamp(flight.throttle + dt * 0.45, 0, 1);
    if (input.throttleDown) flight.throttle = clamp(flight.throttle - dt * 0.6, 0, 1);
  }

  // --- Attitude ------------------------------------------------------------
  const pitchRate = 34; // deg/s
  const rollRate = 65;
  if (input.pitchUp) flight.pitch = clamp(flight.pitch + pitchRate * dt, -12, 26);
  else if (input.pitchDown) flight.pitch = clamp(flight.pitch - pitchRate * dt, -18, 26);
  else flight.pitch = lerp(flight.pitch, flight.onGround ? 0 : 2, 1 - Math.exp(-dt * 0.9));

  let targetRoll = 0;
  if (input.rollLeft) targetRoll = -48;
  if (input.rollRight) targetRoll = 48;
  flight.roll = lerp(flight.roll, targetRoll, 1 - Math.exp(-dt * 3.2));

  // Bank turns the aircraft; rudder adds a little yaw and helps the turn.
  const turnRate = -flight.roll * 0.55; // deg/s, bank left -> heading decreases
  flight.heading = (flight.heading + turnRate * dt + 360) % 360;
  if (input.yawLeft) flight.heading = (flight.heading - 14 * dt + 360) % 360;
  if (input.yawRight) flight.heading = (flight.heading + 14 * dt) % 360;
  if (input.yawLeft) flight.roll = clamp(flight.roll - 22 * dt, -48, 48);
  if (input.yawRight) flight.roll = clamp(flight.roll + 22 * dt, -48, 48);

  // --- Speed ---------------------------------------------------------------
  const targetSpeed = flight.throttle * MAX_SPEED;
  let accel = (targetSpeed - flight.speed) * 0.55;
  if (input.brake) accel -= 26; // airbrake / flaps
  if (!flight.onGround && flight.pitch > 8) accel -= flight.pitch * 0.35; // climbing costs speed
  if (!flight.onGround && flight.pitch < -6) accel += -flight.pitch * 0.3; // diving gains speed
  flight.speed = clamp(flight.speed + accel * dt, 0, 130);

  // --- Vertical motion -----------------------------------------------------
  const stalled = flight.speed < STALL_SPEED;
  let vy = flight.speed * Math.sin(degToRad(flight.pitch));
  if (stalled && !flight.onGround) {
    vy -= (STALL_SPEED - flight.speed) * 0.85; // the wing gives up: sink
    flight.pitch = lerp(flight.pitch, -8, 1 - Math.exp(-dt * 1.2)); // nose drops
  }
  if (flight.onGround) {
    // Rolling on the strip: stay glued until rotation speed.
    if (flight.speed > TAKEOFF_SPEED && flight.pitch > 4) {
      flight.onGround = false;
      events.push('takeoff');
    } else {
      vy = 0;
    }
  }
  flight.verticalSpeed = vy;

  // --- Position ------------------------------------------------------------
  const hRad = degToRad(flight.heading);
  const forwardX = Math.sin(hRad);
  const forwardZ = -Math.cos(hRad);
  flight.pos.x += forwardX * flight.speed * dt;
  flight.pos.z += forwardZ * flight.speed * dt;
  flight.pos.y += vy * dt;

  // --- Fuel ----------------------------------------------------------------
  if (flight.throttle > 0.02 && flight.fuel > 0) {
    flight.fuel = Math.max(0, flight.fuel - (0.0011 + flight.throttle * 0.0032) * dt);
  }

  // --- Arena bounds --------------------------------------------------------
  const distCentre = Math.hypot(flight.pos.x, flight.pos.z);
  flight.outOfBounds = distCentre > WORLD_RADIUS - 150;
  if (distCentre > WORLD_RADIUS + 60) {
    // Gentle auto-turn back toward the island instead of a wall.
    const homeHeading = radToDeg(Math.atan2(-flight.pos.x, -flight.pos.z));
    flight.heading = angleLerp(flight.heading, (homeHeading + 360) % 360, 1 - Math.exp(-dt * 0.8));
  }

  // --- Ground / water contact ----------------------------------------------
  const ground = terrain.heightAt(flight.pos.x, flight.pos.z);
  const gearHeight = 1.6;
  if (flight.pos.y <= ground + gearHeight) {
    const overSea = ground < 0.5;
    const onRunway =
      Math.abs(flight.pos.x - RUNWAY.x) < RUNWAY.halfWidth + 3 &&
      Math.abs(flight.pos.z - RUNWAY.z) < RUNWAY.halfLength + 10;
    const softTouch = flight.verticalSpeed > -4.5 && flight.speed < 58 && Math.abs(flight.roll) < 18;
    if (overSea) {
      flight.pos.y = 0.6;
      events.push('crashed-water');
    } else if (onRunway && softTouch && !wasOnGround) {
      flight.pos.y = ground + gearHeight;
      flight.onGround = true;
      flight.speed = Math.max(0, flight.speed - 8);
      flight.pitch = 0;
      flight.roll = 0;
      if (flight.verticalSpeed < -3.2) {
        flight.damage = clamp(flight.damage + 0.25, 0, 1);
        events.push('hard-landing');
      }
      events.push('landed');
    } else if (wasOnGround && flight.speed < TAKEOFF_SPEED + 4 && onRunway) {
      // Still rolling out on the strip: stay glued.
      flight.pos.y = ground + gearHeight;
      flight.onGround = true;
    } else {
      flight.pos.y = ground + gearHeight;
      events.push('crashed-terrain');
    }
  }
  if (flight.pos.y < 0.6 && terrain.heightAt(flight.pos.x, flight.pos.z) < 0.5) {
    flight.pos.y = 0.6;
    if (!events.includes('crashed-water')) events.push('crashed-water');
  }
  if (flight.damage >= 1) events.push('crashed-damage');

  return events;
}

export function flightSnapshot(flight) {
  return {
    alt: Math.max(0, Math.round(flight.pos.y)),
    speed: Math.round(flight.speed * 3.6),
    heading: Math.round(flight.heading),
    throttle: Math.round(flight.throttle * 100) / 100,
    fuel: Math.round(flight.fuel * 100) / 100,
    damage: Math.round(flight.damage * 100) / 100,
  };
}
