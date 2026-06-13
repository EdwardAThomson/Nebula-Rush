---
name: track-creation
description: End-to-end playbook for designing, validating, prototyping, and shipping a new Nebula Rush track (or altering an existing one). Use whenever adding a track, editing a track's curve/zones/hazards, or building a new cup. Encodes the hard-won gotchas from Mesa Run, Sand Hollow, and Sandstorm Pass.
---

# Track Creation Playbook

The pipeline has five phases with explicit USER SIGN-OFF GATES. Never skip a
gate — every shipped track went through visual vetoes that changed the design.

```
1 CONCEPT  → user agrees identity/features
2 CURVE    → numbers pass + silhouette sign-off
3 SANDBOX  → visual prototype, iterate to sign-off
4 PORT     → src via TrackConfig data; Mesa/Hollow regression
5 SHIP     → verification gauntlet → user drives it → branch/PR/merge
```

## Phase 1 — Concept

- Each track owns ONE signature feature (Hollow: underground tunnel + crossover;
  Pass: storm/wind + ridge). Don't reuse another track's signature.
- **Enclosure is difficulty the windsock can't see.** The difficulty gauge is
  hazard-dominant; walls/claustrophobia add felt difficulty on top. An "easy"
  track should feel OPEN, not just have few hazards.
- Difficulty should ramp within a cup, but "doesn't need to be perfect".

## Phase 2 — Curve design (in scripts/analyze-tracks.ts first)

Track coordinates are "track units" ×`SCALE*2` (= ×24 world). Closed
centripetal CatmullRom; with N control points, **point i sits at exactly
t = i/N** — use this to place zones/hazards/pads on landmarks.

Geometry rules (violations found the hard way):
- **Start tail**: close the loop BEHIND the grid (+z side) with a wide
  triangle (see Hollow pts 16–18 / Pass pts 22–24). The player grid is at
  `PLAYER_START_T = 0.94` — jitter at t 0.94–1.0 is felt at every race start.
- **Hairpins need 3 points each** (entry/apex/exit), radius ≥ ~90 track units,
  with long rungs between if stacked. One apex point = jitter spike.
- **Gradients** ≤ ~3–4%. Big relief is fine (Hollow dives −720, Pass climbs
  +600 world) if spread.
- **Crossovers**: vertical clearance ≥ 150u (aim 180+ after deck thickness 14),
  crossing angle ≥ 35°. The detector in analyze-tracks verifies.
- **Pinches**: half-width ≥ 36 (gives a ~66u drivable band — race-proven).
- **Jitter budget**: Max ΔNormal ≤ ~0.42 (Mesa precedent, flat-frame canyon);
  ≤ 0.25 is good; Bank=±60° spikes are analyzer artifacts on canyon tracks
  (they never bank — flat frames).
- **Distinct silhouette**: run `npx tsx scripts/track-shapes.ts` →
  /tmp/track_shapes.svg. The new skeleton must not read like any existing
  track. Get user sign-off on the sheet BEFORE building geometry.

## Phase 3 — Sandbox prototype (dev-only, vite serves only index.html in prod)

- Fork the closest existing sandbox (`sandbox/gorge.ts` = sunken canyon,
  `sandbox/pass.ts` = ridge/storm/wind) + matching .html. New physics features
  go in the sandbox loop or `sandbox/physics.ts` (the fork — keep it in PARITY
  with src PhysicsEngine: it already has brake, wallContact, push-off, yaw
  boost; clampLateral must set `state.wallContact`).
- Define the track as `TRACK_N` in src/game/TrackDefinitions.ts, exported but
  **NOT added to TRACKS** until the port phase.
- Iterate with the user screenshot-by-screenshot. Restate their complaint as a
  mechanism before patching it (see Gotchas).

## Phase 4 — Port to src

All track-specific behavior must be DATA in TrackConfig (widthProfile, tunnels,
canyon.zones, wind); CanyonTerrain's zoned builder + PhysicsEngine consume it.
Mesa Run (no canyon config) takes the legacy path and must stay bit-identical.

Port checklist: CanyonTerrain zone treatments → PhysicsEngine/Env features →
TRACKS array + CupDefinitions trackIds (cup stays `comingSoon` until full) →
regression lap on Mesa AND Hollow before the new track is judged.

## Phase 5 — Verification gauntlet (all must pass)

```
npm run build                                  # tsc strict + vite
npm run lint                                   # only YOUR files clean (legacy debt exists)
npx tsx scripts/analyze-tracks.ts              # jitter, difficulty, crossover
npx tsx scripts/canyon-collision-check.ts      # zero soft spots
npx tsx scripts/canyon-clamp-dynamics.ts       # no inversions/collapses/chasing limits
npx tsx scripts/track-shapes.ts                # silhouette sheet
npx tsx scripts/check-track-data.ts            # pad/hazard overlaps + road-fit (REAL src data)
```

NOTE: check-track-data.ts imports straight from src — proof that tsx CAN
import src modules (analyze-tracks' "can't import" comment is stale). The
inline copies below are refactorable someday; until then:

**THE FOUR-FILE SYNC**: the track's points (and width profile) live inline in
FOUR places that must match: `src/game/TrackDefinitions.ts`,
`scripts/analyze-tracks.ts`, `scripts/canyon-collision-check.ts`,
`scripts/canyon-clamp-dynamics.ts`. Any curve edit → update all four → rerun.
(analyze-tracks also needs HAZARDS/PADS/VISIBILITY/WIDTH_HALF/CUPS entries.)

## Terrain models (zoned canyon)

- The flat desert plain is the ONE honest height reference. Never raise
  terrain to meet a high road ("rising cliffs to fake a descent" reads as
  fake instantly). Roads go: at grade (berm), below grade (full = sunken
  canyon, rim fixed at surface+height), above grade only on a viaduct, or on
  a 'ridge' (ground falls away BOTH sides) with 'crag' for road-relative
  summit rock.
- **Grade = median road height over BERM sections only.** A whole-lap median
  puts the surface up the hillside on mountain tracks (the "underground start"
  bug). The src zoned builder still uses whole-lap median — fix when porting a
  mountain track.
- Desert plane gets holes ONLY where road runs below grade (auto-grown past
  the full zone until road returns above grade). No below-grade road = no holes.
- All scenery placement is SEEDED (per track id) — fixed once and for all.
  `Math.random()` in terrain = bug. Background objects < ~200 units tall are
  invisible from road eye height (~35 above plain) at the 2200–5000 band.
  Far plane is 6000; use haze fog ending at 6000 to hide pop-in.

## Force budgets (gameplay physics)

- **Any environmental lateral force (wind etc.) must stay BELOW the weakest
  ship's strafeSpeed (0.009/frame)** at max exposure × max gust. Strafe is the
  AI's ONLY steering: anything stronger makes the downwind wall an inescapable
  AI trap. Drama = drift integrated over seconds, not per-frame overpowering.
- Lateral authority reference: strafe 0.009–0.018/frame injection; yaw lateral
  ≈ sin(0.4)×accelFactor ≈ 0.2/frame (dominant) but yaw SLEW is slow
  (0.003 rad/frame) — full traversal takes seconds. Walls boost slew 3×.
- Walls are HARD: position clamp + zero into-wall velocity + push-off when
  steering away. No springs, no bounces, no assists that fight the player.

## Gotchas that actually happened (don't repeat)

1. Rising-cliffs-to-fake-descent (Hollow v1–v3): fixed by sunken-canyon model.
2. Moving/following ground plane: ALWAYS static ground; followers slice
   through relief viewed from afar ("cream sheet").
3. Wind stronger than strafe → AI permanently pinned to walls.
4. Whole-lap median grade → start area underground (Pass).
5. 1px LineSegments are invisible — weather visuals need real geometry
   (instanced meshes) with size/opacity/speed tied to the effect.
6. Hairpin/tail jitter: single-point turns and tight start-tail triangles.
7. Width/pinch data must thread through ALL consumers: road mesh, wall mesh,
   collision clamp, AI lanes (the clamp closure covers AI automatically).
8. Track layout similarity: users notice skeletons (Hollow v1 ≈ Mesa). Check
   the silhouette sheet early.
9. Light bars / glowing strips in tunnels read as artificial — sparse lamps.
10. New keys/features need the controls table in App.tsx updated.
11. Pads and hazards must not overlap — check the full SPANS, not centres:
    t-span = trackProgress ± length/2, lateral span = lateralPosition ± width/2.
    A pad "beside" a slick has happened twice (gorge v1, pass v1); keep a gap
    in t OR ≥ 4 units of lateral daylight.

## Workflow conventions

- Feature branch per track (`feat/<track-name>`), commit at user-approved
  checkpoints ("fallback points"), PR to master, merge via gh, delete branch.
- The user reviews every visual milestone in-browser; ask for screenshots
  with the debug overlay/HUD when a report is ambiguous.
- Names: user picks from candidates; keep ids stable (`track_N`) — display
  name changes touch TrackDefinitions, CupDefinitions.plannedTracks, and the
  three script labels.
