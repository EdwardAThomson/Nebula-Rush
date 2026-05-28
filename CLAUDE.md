# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server (HMR; configured with `usePolling` so it works in containers).
- `npm run build` — Type-check (`tsc -b`, project references in `tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`) then `vite build`. Build will fail on TS errors; `tsconfig.app.json` enables `strict`, `noUnusedLocals`, and `noUnusedParameters`.
- `npm run lint` — ESLint (flat config, `eslint.config.js`) with `typescript-eslint`, `react-hooks`, and `react-refresh` rules. `dist/` is globally ignored.
- `npm run preview` — Serve the production build locally.
- `npx tsx scripts/analyze-tracks.ts` — Standalone simulation that walks each track curve and prints frame-by-frame diagnostics (gradient/curvature/banking jitter). Track definitions are re-declared inline because the script can't import from `src/`.
- `npx tsx scripts/test-ships.ts` / `test-pilots.ts` — Standalone stat-balance sanity checks for ship and pilot tuning.

There is no test runner configured.

## Architecture

This is a single-page React + Vite app that mounts one Three.js canvas inside a React component. There is **no game-engine framework** — the game loop, physics, and rendering are bespoke.

### Top-level flow

`src/main.tsx` → `src/App.tsx` is a screen-state machine (`start` → `pilot_selection` → `track_selection` → `env_selection` → `selection` (ship) → `game`, plus debug screens `analysis`, `env_test`, `lighting_debug`, `night_test`, `ship_demo`). `App.tsx` owns the selected pilot/ship/track/environment and passes them as props into `<Game />`. The `navigateTo` helper inserts a loading overlay around heavy transitions; `Game` calls `onReady()` once its scene is initialized to dismiss it.

### Game runtime (`src/components/Game.tsx`)

`Game.tsx` is the orchestrator. Its inner `useEffect` constructs the Three.js scene, registers the rAF loop, and tears everything down on unmount. Key invariants:

- **State lives in refs, not React state**, for anything that updates per frame (player physics state, race timers, ranks, HUD speed/time). HUD elements update via direct DOM writes through refs (`speedRef`, `timeRef`, `rankRef`, `debugTrackProgressRef`, etc.) — do **not** convert these to `useState` or you will re-render every frame.
- The race is a state machine: `'intro' | 'racing' | 'finished' | 'results'`. The intro runs a 7-second countdown synced to `countdownStartTime` (wall-clock based, not frame-based) and drives a `THREE.Group` traffic light.
- `raceStartedRef` / `raceFinishedRef` / `allFinishedRef` gate input and termination. `PhysicsEngine.updatePhysics` accepts `raceStarted` so input is ignored before lights go green.
- Player ship + 19 AI opponents share the same track curve. AI roster is generated **once per session** via `useState(() => OpponentManager.generateRoster(...))` so opponents persist across campaign tracks; `campaignScores` accumulates points keyed by opponent id.

### Game subsystems (`src/game/`)

Subsystems are plain modules — not classes wired through dependency injection. `Game.tsx` instantiates and calls into them directly.

- **`PhysicsEngine.ts`** — `GameState` interface + pure `updatePhysics(state, input, trackLength, pads, dt, onLapComplete, raceStarted)`. State is **detached from Three.js objects**: the engine mutates scalar/Vector2 fields on `GameState`, then `Game.tsx` translates that into mesh transforms each frame. This separation is intentional and keeps physics stable across frame-rate variation. `velocity.x` is lateral, `velocity.y` is longitudinal. Player starts at `PLAYER_START_T = 0.94` so crossing the line forward triggers lap 1.
- **`TrackFactory.ts` + `TrackDefinitions.ts`** — `createTrackCurve` builds a closed `CatmullRomCurve3` (centripetal) from a `Vector3[]` defined per track in `TrackDefinitions.ts`. `getTrackFrame(curve, t)` computes a smoothed Frenet-like frame: it samples 7 tangent pairs around `t` with a Gaussian weight kernel and applies a smoothstep deadzone to the banking angle. **This averaging is the fix for visible jitter at curve segment joints** — if you change the sampling window/weights, re-run `scripts/analyze-tracks.ts` to confirm gradient/curvature stay smooth. Track meshes, boost-pad meshes, start-line mesh, and traffic-light group are all built here.
- **`OpponentManager.ts`** — Generates the AI roster (names, pilot stats, ship type) and runs simple lane-switching steering each frame. Opponents share the same `getTrackFrame` math as the player.
- **`EnvironmentManager.ts`** — Owns lights, skybox, fog, and weather particle systems (rain/snow). `EnvironmentConfig` (`timeOfDay`, `weather`) is selected on the env screen or forced via `forcedEnvironment` prop.
- **`Ship.ts` / `ShipFactory.ts`** — `Ship` wraps a `THREE.Group` and exposes `applyState(state)`. `ShipFactory.SHIP_STATS` is the source of truth for ship balance (`accelFactor`, `friction`, `turnSpeed`, `slideFactor`, `strafeSpeed`). The ship-selection UI in `App.tsx` derives 0–100 display bars by normalizing across all entries of `SHIP_STATS` — adding a new ship type means it automatically participates in that normalization.
- **`PilotDefinitions.ts`** — Pilot list with per-pilot multipliers for acceleration/handling/velocity. Pilot modifiers are applied to the chosen `ShipConfig` before being handed to the physics engine.
- **`InputManager.ts`** — Thin wrapper that exposes an `InputSource` interface (`isKeyPressed`). Anything that drives physics (player input, AI) implements `InputSource`, so the same `updatePhysics` function runs for both.
- **`AudioManager.ts`** — Singleton `audioManager` (imported from `App.tsx` and elsewhere). Preloads SFX + music; UI buttons go through the `AudioButton` wrapper in `App.tsx` for click/hover sounds.

### Assets

Audio under `public/assets/audio/{music,sfx}/`, pilot portraits under `public/assets/pilots/`. Referenced by absolute `/assets/...` paths (Vite serves `public/` at the root).

## Conventions

- Per-frame data flows through **refs and plain object mutation**, not React state. Only low-frequency events (lap counter, race state, results) use `useState`.
- `tsconfig.app.json` is strict and disallows unused locals/parameters — prefix intentionally unused params with `_` or remove them.
- The track curve is closed; any code that does `(t + offset) % 1` is normalizing because of this. Don't introduce `t` consumers that assume `0..1` is open.
- The `// Cheat: Instant Win` (`F`) and `Cheat: Finish Opponents` (`G`) keys in the controls table are real debug shortcuts wired into `Game.tsx`.

## Development branch

Develop on a descriptive feature branch (e.g. `feat/enlarge-track-1`), open a PR, and merge into `master`. Do not commit directly to `master` or push to other branches without explicit permission.
