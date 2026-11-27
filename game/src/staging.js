// Merapi Ridge Run — screenshot staging.
//
// One job: when the page is opened with ?shot=N, put the real game into a
// fixed, deterministic pose before the loop settles, so a headless browser
// can capture the exact frame the entry's screenshots show. Nothing here
// draws or fakes anything: it only drives the game's own public API
// (setMission / setPose / setCamera / setTimeOfDay) and then waits for the
// scene to settle. When the frame is ready it raises window.__shotReady,
// which the capture script waits for.
//
// Shot list (see shots.json for the matching URLs):
//   1 cover    — chase view, runway + first ring ahead, morning light
//   2 cockpit  — cockpit view, lit panel, ring ahead
//   3 rings    — Ring Run action, fast, close to a ring
//   4 volcano  — Volcano Survey, high over the crater, runway in view
//
// ?mission= and ?view= on the URL override the shot's defaults; ?seed=
// is read by the game itself, so the same seed always stages the same
// frame. Without ?shot= this module does nothing and normal play is
// untouched.

const SETTLE_MS = 2200;
const POLL_MS = 100;
const POLL_TIMEOUT_MS = 15000;

// Poses are tuned against the real screenshots: x/z put the aircraft on
// the runway line, y is altitude in metres, heading 0 flies the runway
// heading, speed in km/h. If a capture shows the aircraft off the line,
// these numbers — and only these numbers — are what moves.
const SHOT_STAGING = {
  1: {
    mission: 'ring', view: 'chase', timeOfDay: 0.3,
    pose: { x: 0, y: 380, z: 900, headingDeg: 0, pitchDeg: -3, speed: 230, throttle: 0.75 },
  },
  2: {
    mission: 'ring', view: 'cockpit', timeOfDay: 0.3,
    pose: { x: 0, y: 380, z: 320, headingDeg: 0, pitchDeg: -2, speed: 230, throttle: 0.75 },
  },
  3: {
    mission: 'ring', view: 'chase', timeOfDay: 0.35,
    pose: { x: 0, y: 400, z: 80, headingDeg: 0, pitchDeg: 0, speed: 290, throttle: 0.95 },
  },
  4: {
    mission: 'survey', view: 'chase', timeOfDay: 0.55,
    pose: { x: 0, y: 950, z: 1500, headingDeg: 0, pitchDeg: -8, speed: 200, throttle: 0.6 },
  },
};

/** Promise that resolves with window.MRR once the game has booted. */
function waitForFlightState() {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (window.MRR && typeof window.MRR.setPose === 'function') {
        resolve(window.MRR);
        return;
      }
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        resolve(null);
        return;
      }
      window.setTimeout(check, POLL_MS);
    };
    check();
  });
}

/** Drive the game into the staged pose for shot `number`, then flag ready. */
export async function stageShot(number) {
  const staging = SHOT_STAGING[number] || SHOT_STAGING[1];
  const params = new URLSearchParams(window.location.search);
  const flight = await waitForFlightState();
  if (!flight) {
    window.__shotReady = false;
    return false;
  }
  const mission = params.get('mission') || staging.mission;
  const view = params.get('view') || staging.view;
  const timeOfDay = Number(params.get('tod') ?? staging.timeOfDay);
  flight.setMission(mission);
  flight.setTimeOfDay(timeOfDay);
  flight.setPose(staging.pose);
  flight.setCamera(view);
  // A second pose pass after the mission reset lands, so the mission's
  // own spawn cannot drag the aircraft off the staged line.
  window.setTimeout(() => flight.setPose(staging.pose), 250);
  await new Promise((resolve) => window.setTimeout(resolve, SETTLE_MS));
  flight.setCamera(view);
  window.__shotReady = true;
  document.documentElement.setAttribute('data-shot-ready', '1');
  return true;
}

/**
 * Read ?shot= from the URL and stage it. Returns false (and stages
 * nothing) for normal play, so importing this module is always safe.
 */
export function stageShotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const shot = Number(params.get('shot'));
  if (!shot || !SHOT_STAGING[shot]) return Promise.resolve(false);
  return stageShot(shot);
}

// Staging is a side effect of loading the module: the game only has to
// import it once and ?shot= URLs stage themselves.
stageShotFromUrl();
