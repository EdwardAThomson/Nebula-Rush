# Roadmap — Nebula Rush

_Status: active · updated 2026-10-09_

A high-speed 3D anti-gravity racing game in the browser (React 19, Vite,
TypeScript, Three.js) — procedural tracks, physics-driven handling, AI opponents.
Inspired by F-Zero / Wipeout. This file is the source plan; the README links here.

**Scope decision (2026-10-08):** Nebula Rush stays a pure racer. No weapons,
turrets or combat modes.

## Shipped

- [x] Custom physics (hover suspension, banking, drifting, air-braking, strafing, braking)
- [x] 4 ship classes with distinct handling profiles and per-ship energy capacity (Lancer, Rapier, Sledgehammer, Kestrel)
- [x] 8 pilots with stat modifiers and generated avatars
- [x] 10 procedurally-generated spline tracks across two full cups (Nebula, Sunscorch)
- [x] Day/night cycle + weather (clear / fog / rain)
- [x] Single-race mode (5 laps, countdown, traffic lights)
- [x] Campaign mode (cumulative points across races, Race All)
- [x] Lap timing + position tracking + post-race leaderboard
- [x] Ship selection with paint customization (primary/secondary, live preview)
- [x] Pilot / track / environment selection screens
- [x] Boost pads, 19 lane-switching AI opponents with curated rival names, real-time minimap
- [x] HUD (speed, lap, rank, timer, boost, energy, pilot portrait) + dynamic anti-motion-sickness camera
- [x] Jukebox (4 music tracks)
- [x] PBR ships with greebles, exhaust glow, cockpit canopies
- [x] Lofted ship hulls (tapered fuselages, lathe-turned nacelles, aerofoil wings and fins)
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
- [x] Player profile: one versioned localStorage save for progression (credits field, cup clears)
- [x] Energy system (player only): drain on hazard hits, wall scrapes and rival contact; destroyed at zero (DNF);
      green recharge strip (partial width, per-track placement supported)
- [x] Ship-to-ship contact (player vs. rival bumps; soft AI-vs-AI separation)
- [x] Menu refresh: live attract-mode home screen, shared neon menu style, cup cards with 3D trophies,
      ship-select carousel, real track stats

## Next (agreed order, updated 2026-10-09)

Mechanics before economy, economy before the content that showcases it.

1. [ ] Energy polish: finish the energy loop before building an economy on it.
       - AI ships take energy damage (they're exempt today because they can't dodge hazards)
       - In-world hit feedback: a wireframe shield bubble that flashes on hits, tints by remaining
         energy and flickers near zero
       - Author per-track recharge-pad placements
2. [ ] Garage / shop: start with credits earned from race placement (the profile field exists, but
       nothing pays out yet), then the shop. Parts map one-to-one onto the decoupled stat knobs
       (engine = top speed, thrusters = convergence, fins = handling, capacitor = energy). Tune
       prices with an economy sim script (like test-pilots), and compensate AI per cup tier so
       upgrades don't erode difficulty. Bought parts should be visible on the ship.
3. [ ] Skyline Cup: tight-corner city tracks that make handling and braking matter (scheduled after
       the garage so handling parts have a market). Track names are already planned in
       `CupDefinitions.ts`.
4. [ ] Time trial + ghost replay: flexible slot, zero balance risk.

Also still queued:

- [ ] More hazards + verticality: jump ramps (reintroduce jump/drift mechanics + tutorial steps;
      the physics keeps a small hop that the tutorial doesn't teach)

## Backlog

- [ ] Cryo and Inferno cups (names planned, no tracks yet)
- [ ] Free-look camera (mouse/key orbit around the chase camera, springs back on release)
- [ ] Backend & accounts (Hetzner shared Postgres, cross-device saves, online leaderboards)
- [ ] Server-authoritative anti-cheat + hide cheat keys / dev tools in production
- [ ] Per-track backgrounds (distinct skybox / backdrop per track; surface detail is done)
- [ ] Audio (engine pitch by speed, 3D opponent engines, impact SFX)
- [ ] Ship damage (visual + handling) and metallic finishes / decals
- [ ] Multiplayer (lobbies, real-time networked races)
- [ ] Gamepad support, replay/photo mode, mobile, achievements

## Notes carried over from the README plan

- **Backend is the unblocker** for online leaderboards, cross-device saves and multiplayer.
  Only authenticated runs on the production build should count; local-dev and unauthenticated
  play are never saved.
- **Anti-cheat:** client-reported lap times are trivially spoofable, so pick a verification
  strategy (deterministic replays validated server-side, server-side simulation, or input
  recording + re-sim) before ranked leaderboards go live.
- **Production hardening:** hide the cheat key (`L`) and dev tools (Track Analysis, Lighting
  Playground, Environment Test, Ship Demo) from production builds.
- **Content cost:** every new cup is 5 new tracks; see the `track-creation` skill.
- **Open question:** upgrades per-ship vs. global (decide before building the shop).
