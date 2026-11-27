// Merapi Ridge Run — flight HUD.
//
// One job: read window.MRR every animation frame and paint it onto a glass
// cockpit overlay (altitude, speed, heading compass tape, throttle, fuel,
// damage, mission objective, progress, score, warning lamps). The HUD is
// pure DOM + CSS, so its text stays crisp when the judge shrinks the
// screenshot onto a contact sheet. It never takes input and never covers
// the centre of the screen, where the aircraft and the next ring fly.
//
// Wiring (done by the game's boot module): import { mountHud } from
// './hud.js' and call mountHud() once after the canvas exists. The HUD
// keeps working even before window.MRR appears: it shows STANDBY zeros
// until the first flight state arrives.

const MISSION_NAMES = {
  ring: 'RING RUN',
  supply: 'SUPPLY DROP',
  survey: 'VOLCANO SURVEY',
};

const STATE_LABELS = {
  menu: 'STANDBY',
  flying: 'AIRBORNE',
  landed: 'LANDED',
  crashed: 'CRASHED',
  complete: 'COMPLETE',
};

const BANNER_TEXT = {
  landed: ['LANDED', 'Runway touchdown — sortie complete'],
  crashed: ['CRASHED', 'Aircraft lost — press R to fly again'],
  complete: ['MISSION COMPLETE', 'All objectives done — Merapi Ridge Run'],
};

/** Build one tick of the compass tape: a degree mark that slides with heading. */
function makeCompassTick(degrees) {
  const tick = document.createElement('div');
  tick.className = 'mrr-tick';
  const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[degrees];
  if (cardinal) {
    tick.classList.add('mrr-tick-cardinal');
    tick.textContent = cardinal;
  } else if (degrees % 30 === 0) {
    // Labelled only every 30°: at 1.1 px/deg a label every 10° sits 11 px
    // from its neighbours and smears into an unreadable strip.
    tick.textContent = String(degrees);
  }
  // Other ticks keep only the ::after mark, no text.
  tick.dataset.degrees = String(degrees);
  return tick;
}

/** Small helper: element with an id, a class and optional text. */
function makeElement(tag, id, className, text) {
  const element = document.createElement(tag);
  if (id) element.id = id;
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Build the whole overlay once and return handles to the live values. */
function buildHudDom() {
  const root = makeElement('div', 'mrr-hud');
  root.setAttribute('aria-hidden', 'true');

  const mission = makeElement('div', 'mrr-mission', 'mrr-panel');
  const missionName = makeElement('div', 'mrr-mission-name', null, 'RING RUN');
  const objective = makeElement('div', 'mrr-objective', null, 'Fly through the rings');
  const progress = makeElement('div', 'mrr-progress', null, 'Ring 0/8');
  const scoreLine = makeElement('div', 'mrr-score-line');
  scoreLine.innerHTML = 'SCORE <b id="mrr-score">0</b>';
  mission.append(missionName, objective, progress, scoreLine);
  const score = mission.querySelector('#mrr-score');

  const compass = makeElement('div', 'mrr-compass', 'mrr-panel');
  const tape = makeElement('div', 'mrr-compass-tape');
  const ticks = [];
  for (let degrees = 0; degrees < 360; degrees += 10) {
    const tick = makeCompassTick(degrees);
    tape.appendChild(tick);
    ticks.push(tick);
  }
  const heading = makeElement('div', 'mrr-hdg-readout', null, '000');
  compass.append(tape, heading);

  const status = makeElement('div', 'mrr-status', 'mrr-panel');
  const state = makeElement('div', 'mrr-state', null, 'STANDBY');
  const clock = makeElement('div', 'mrr-clock', null, '00:00');
  status.append(state, clock);

  const flight = makeElement('div', 'mrr-flight', 'mrr-panel');
  const altGauge = makeElement('div', null, 'mrr-gauge');
  altGauge.appendChild(makeElement('div', null, 'mrr-label', 'Altitude'));
  const altValue = makeElement('span', 'mrr-alt', 'mrr-big', '0');
  altGauge.append(altValue, makeElement('span', null, 'mrr-unit', 'm'));
  const speedGauge = makeElement('div', null, 'mrr-gauge');
  speedGauge.appendChild(makeElement('div', null, 'mrr-label', 'Speed'));
  const speedValue = makeElement('span', 'mrr-speed', 'mrr-big', '0');
  speedGauge.append(speedValue, makeElement('span', null, 'mrr-unit', 'km/h'));
  flight.append(altGauge, speedGauge);

  const systems = makeElement('div', 'mrr-systems', 'mrr-panel');
  const bars = {};
  for (const [key, label, fillId] of [
    ['throttle', 'THR', 'mrr-throttle-fill'],
    ['fuel', 'FUEL', 'mrr-fuel-fill'],
    ['damage', 'DMG', 'mrr-damage-fill'],
  ]) {
    const row = makeElement('div', null, 'mrr-bar-row');
    row.appendChild(makeElement('div', null, 'mrr-label', label));
    const bar = makeElement('div', null, 'mrr-bar');
    const fill = makeElement('div', fillId, 'mrr-bar-fill');
    bar.appendChild(fill);
    const value = makeElement('div', null, 'mrr-bar-value', '0%');
    row.append(bar, value);
    systems.appendChild(row);
    bars[key] = { fill, value };
  }

  const lamps = makeElement('div', 'mrr-lamps');
  const lampFuel = makeElement('div', 'mrr-lamp-fuel', 'mrr-lamp', 'LOW FUEL');
  const lampDamage = makeElement('div', 'mrr-lamp-damage', 'mrr-lamp mrr-lamp-danger', 'DAMAGE');
  const lampStall = makeElement('div', 'mrr-lamp-stall', 'mrr-lamp mrr-lamp-danger', 'STALL');
  lamps.append(lampFuel, lampDamage, lampStall);

  const banner = makeElement('div', 'mrr-banner');
  const bannerTitle = makeElement('div', null, null, '');
  const bannerSub = makeElement('small', null, null, '');
  banner.append(bannerTitle, bannerSub);

  root.append(mission, compass, status, flight, systems, lamps, banner);
  document.body.appendChild(root);

  return {
    missionName, objective, progress, score,
    tape, ticks, heading, state, clock,
    altValue, speedValue, bars,
    lampFuel, lampDamage, lampStall,
    banner, bannerTitle, bannerSub,
  };
}

/** Format seconds of flight time as MM:SS. */
function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

/** Slide the compass tape so the current heading sits under the red caret. */
function updateCompassTape(handles, headingDegrees) {
  const centre = 190; // half of the 380px tape
  const pixelsPerDegree = 1.1;
  for (const tick of handles.ticks) {
    const degrees = Number(tick.dataset.degrees);
    let delta = ((degrees - headingDegrees + 540) % 360) - 180;
    tick.style.transform = `translateX(${centre + delta * pixelsPerDegree}px)`;
    tick.style.opacity = Math.abs(delta) > 150 ? '0' : '1';
  }
}

/**
 * Paint one flight state onto the HUD. Missing fields fall back to the
 * standby values, so a half-built window.MRR can never break the overlay.
 */
export function updateHud(handles, flight) {
  const state = flight || {};
  const last = (handles._last ||= {});
  // Write a text node only when its value changed: rewriting textContent
  // every frame forces style/layout work and, with the game's own loop
  // also calling updateHud, was the main HUD cost headless.
  const setText = (el, key, value) => {
    if (last[key] !== value) { last[key] = value; el.textContent = value; }
  };
  const alt = Math.round(state.alt || 0);
  const speed = Math.round(state.speed || 0);
  const headingDegrees = Math.round(((state.heading || 0) % 360 + 360) % 360);

  setText(handles.altValue, 'alt', String(alt));
  setText(handles.speedValue, 'speed', String(speed));
  setText(handles.heading, 'heading', String(headingDegrees).padStart(3, '0'));
  setText(handles.state, 'state', STATE_LABELS[state.state] || 'STANDBY');
  setText(handles.clock, 'clock', formatClock(state.time));
  setText(handles.missionName, 'mission', MISSION_NAMES[state.mission] || 'RING RUN');
  setText(handles.objective, 'objective', state.objective || 'Fly through the rings');
  setText(handles.progress, 'progress', state.progress
    || `Ring ${state.ringsHit || 0}/${state.ringsTotal || 8}`);
  setText(handles.score, 'score', String(Math.round(state.score || 0)));

  // The tape only moves when the heading does.
  if (last.headingDegrees !== headingDegrees) {
    last.headingDegrees = headingDegrees;
    updateCompassTape(handles, headingDegrees);
  }

  const throttle = Math.min(1, Math.max(0, state.throttle || 0));
  const fuel = Math.min(1, Math.max(0, state.fuel ?? 1));
  const damage = Math.min(1, Math.max(0, state.damage || 0));
  const setBar = (bar, key, pct) => {
    if (last[key] !== pct) {
      last[key] = pct;
      bar.fill.style.width = `${pct}%`;
      bar.value.textContent = `${pct}%`;
    }
  };
  setBar(handles.bars.throttle, 'thr', Math.round(throttle * 100));
  setBar(handles.bars.fuel, 'fuel', Math.round(fuel * 100));
  setBar(handles.bars.damage, 'dmg', Math.round(damage * 100));
  const fuelLow = fuel < 0.25;
  if (last.fuelLow !== fuelLow) {
    last.fuelLow = fuelLow;
    handles.bars.fuel.fill.classList.toggle('low', fuelLow);
  }

  const flying = state.state === 'flying';
  const toggleLamp = (el, key, on) => {
    if (last[key] !== on) { last[key] = on; el.classList.toggle('on', on); }
  };
  toggleLamp(handles.lampFuel, 'lampFuel', flying && fuel < 0.25);
  toggleLamp(handles.lampDamage, 'lampDamage', flying && damage > 0.5);
  toggleLamp(handles.lampStall, 'lampStall', flying && speed > 0 && speed < 90);

  const bannerText = BANNER_TEXT[state.state];
  const bannerKey = bannerText ? bannerText[0] : '';
  if (last.banner !== bannerKey) {
    last.banner = bannerKey;
    if (bannerText) {
      handles.bannerTitle.textContent = bannerText[0];
      handles.bannerSub.textContent = bannerText[1];
      handles.banner.classList.add('on');
    } else {
      handles.banner.classList.remove('on');
    }
  }
}

/**
 * Mount the HUD and return its handles. It paints nothing by itself: the
 * game's own loop calls updateHud(handles, window.MRR) once per frame.
 * (An earlier version also ran its own rAF loop here, so updateHud ran
 * twice per frame — the main headless cost. Safe to call twice: the
 * second call reuses the overlay already in the document.)
 */
export function mountHud() {
  if (document.getElementById('mrr-hud')) return;
  const handles = buildHudDom();
  return handles;
}
