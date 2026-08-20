# Roadmap — Nebula Rush

_Status: active · updated 2026-08-19_

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
- [x] Onboarding: How-to-Play modal + interactive guided tutorial (first-visit pulse, Help link, results-screen hint)
- [x] Track hazards: obstacle blocks (speed loss + knock) and slip/slow patches (affect player + AI)
- [x] Progression: cups (5 tracks each, unlock chain), pilot / ship / track unlocks earned by clearing cups
- [x] Streamlined race journey (env screen opt-in via Settings, signature-ship preselect, New Campaign / Single Race)
- [x] Boost overhaul (audible SFX, speed kick, orange flames, aura + lightning, camera FOV pull-back)
- [x] Early race exit (Esc, Esc) and decoupled pilot physics (velocity owns top speed; accel owns convergence)

## Next (agreed order, 2026-08-19)

Mechanics before economy, economy before the content that showcases it.

1. [ ] Player profile foundation: one versioned localStorage save for progression
       (credits, cup clears, future parts). Settings and audio prefs stay separate.
2. [ ] Energy system (F-Zero style): drain on hazard hits and wall contact, retire
       at zero, recharge strip per track. Decide AI damage parity up front.
       Boost-for-energy spending deferred until the base loop proves out.
3. [ ] Garage / shop: credits from race placement; parts map one-to-one onto the
       decoupled stat knobs (engine = top speed, thrusters = convergence,
       fins = handling, capacitor = energy). Tune prices with an economy sim
       script (like test-pilots), and compensate AI per cup tier so upgrades
       don't erode difficulty.
4. [ ] Skyline Cup: tight-corner city tracks that make handling and braking
       matter (scheduled after the garage so handling parts have a market).
5. [ ] Time trial + ghost replay: flexible slot, zero balance risk.

Also still queued:

- [ ] More hazards + verticality: jump ramps (reintroduce jump/drift mechanics + tutorial steps)

## Backlog

- [ ] Backend & accounts (Hetzner shared Postgres, cross-device saves, online leaderboards)
- [ ] Server-authoritative anti-cheat + hide cheat keys / dev tools in production
- [ ] Per-track backgrounds (distinct skybox / backdrop per track; surface detail is done)
- [ ] Audio (engine pitch by speed, 3D opponent engines, impact SFX)
- [ ] Ship damage (visual + handling) and metallic finishes / decals
- [ ] Multiplayer (lobbies, real-time networked races)
- [ ] Time-trial mode with ghosts, gamepad support, replay/photo mode, mobile, achievements
