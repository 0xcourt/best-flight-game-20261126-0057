// Merapi Ridge Run — the entry program (Node 22, standard library only).
//
// Its whole job is to hand the game in: copy this repository's game/ and
// screenshots/ into the grader's output directory and write dossier.json
// there with the vendored make.fun library, exactly as the kit's starter
// does. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output, so
// `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` writes the same
// bytes locally for checking. The run is deterministic: same input files,
// same output bytes, every time.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The directory this file lives in is the repository root.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// Caps mirror the gate so a local run refuses exactly what the scorer
// would refuse: at most 4 screenshots of 256 KiB, game/ within 993
// entries and 48 MiB, and the dossier text capped at 160 KiB.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
