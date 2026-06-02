# Roadmap — Nebula Rush

_Status: active · updated 2026-06-02_

A high-speed 3D anti-gravity racing game in the browser (React 19, Vite,
TypeScript, Three.js) — procedural tracks, physics-driven handling, AI opponents.
Inspired by F-Zero / Wipeout. The README Roadmap section is the source plan.

## Shipped

- [x] Custom physics (hover suspension, banking, drifting, air-braking, strafing)
- [x] 5 ship classes with distinct handling profiles
- [x] 8 pilots with stat modifiers and generated avatars
- [x] 5 procedurally-generated spline tracks (loops, banked turns, verticality)
- [x] Day/night cycle + weather (clear / fog / rain)
- [x] Single-race mode (5 laps, countdown, traffic lights)
- [x] Campaign mode (cumulative points across races)
- [x] Lap timing + position tracking + post-race leaderboard
- [x] Ship selection with paint customization (primary/secondary, live preview)
- [x] Pilot / track / environment selection screens
- [x] Boost pads, 19 lane-switching AI opponents, real-time minimap
- [x] HUD (speed, lap, rank, timer, boost) + dynamic anti-motion-sickness camera
- [x] Jukebox (4 music tracks)
- [x] PBR ships with greebles, exhaust glow, cockpit canopies
- [x] Smooth ship hulls (capsule bodies, bullet noses, curved/rounded wings)
- [x] Per-track surface styling (neon edge rails, centre line, wall accents, boost-pad arrows, checkered start/finish)
- [x] Boost feedback (afterburner flare + pickup punch) and dynamic flame/exhaust
- [x] In-race screenshots → results gallery (lightbox, single-zip download)
- [x] Live deploy (Cloudflare Pages + custom domain) with social/OG preview
- [x] Dev tools (track analysis, ship/pilot balance tests, lighting playground, env test)

## Next

- [ ] Harder AI (boost opponent acceleration / top speed / handling)
- [ ] Progression — cups (5 tracks each, unlock chain), pilot unlocks, track unlocks
- [ ] Onboarding / tutorial (controls + race-flow guide)
- [ ] Track obstacles / hazards beyond curve geometry

## Backlog

- [ ] Backend & accounts (Hetzner shared Postgres, cross-device saves, online leaderboards)
- [ ] Server-authoritative anti-cheat + hide cheat keys / dev tools in production
- [ ] Economy (credits, engine/part upgrade screen)
- [ ] Per-track backgrounds (distinct skybox / backdrop per track; surface detail is done)
- [ ] Audio (engine pitch by speed, 3D opponent engines, impact SFX)
- [ ] Ship damage (visual + handling) and metallic finishes / decals
- [ ] Multiplayer (lobbies, real-time networked races)
- [ ] Time-trial mode with ghosts, gamepad support, replay/photo mode, mobile, achievements
