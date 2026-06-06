# Cups & Championship Arc

Five themed cups, 5 tracks each (25 total). Cups convey difficulty by **theme +
order** (we removed the per-track difficulty dots). Campaign = pick a cup, race
its 5 tracks in order, points accumulate, a champion is crowned at the end.

Build order:
1. **Framework first** — cup data model, cup-selection screen, Game runs a cup's
   track list. Ship with the existing 5 tracks regrouped as the **Nebula Cup**.
2. **Performance-gated unlocks** — clear a cup (finish top 3 overall) to unlock
   the next. Persisted in `localStorage`. Cup 1 is always open.
3. **Author cups 2–3** next (Boonta Canyon, Neon City). Cups 4–5 are sketched
   here and shown as "Coming soon" until authored.

Each cup `theme` biases the environment (time of day / weather) and surface
palette family, and is the hook for any new env features it needs.

---

## 1. Nebula Cup  *(intro — Deep Space)*
Accent: cyan/purple. Env: day or night/clear. Hero feature: the neon grid floor.
**Grounding (decided):** the abstract grid alone reads as a featureless void, so
dress the deep-space setting — a real nebula skybox (replace the flat background
colour), an always-on starfield (today stars are night-only), and a couple of
distant celestial bodies (planet/moon, maybe a far station or asteroid field).
Reframe the grid as the raceway's energy scaffold suspended in the nebula. This
also becomes the template for how each cup dresses its environment.
Built from the **existing 5 tracks**:
1. The Awakening
2. Asteroid Slalom
3. Nebula Complex
4. Hyperion Raceway
5. Stellar Vortex

## 2. Sunscorch Cup  *(Desert Canyons — podracer-inspired)*
Accent: amber. Env: morning/evening; **dust-storm weather** (reskin the rain
particle system as sand). New assets: canyon wall meshes.
(Names kept original — "Boonta" is Star Wars IP and was dropped.)
1. **Dune Sprint** — wide desert flats, gentle intro to the biome
2. **Mesa Run** — weave between towering rock spires
3. **Beggar's Gorge** — tight canyon, narrow walls (the crevasse run)
4. **Sandstorm Pass** — low-visibility dust storm
5. **Solstice Classic** — long mixed finale, big jumps over chasms

## 3. Skyline Cup  *(Megalopolis — Wipeout / Blade Runner)*
Accent: magenta/cyan. Env: **night + rain** (both already supported). New assets:
skyscraper + billboard backdrop meshes. Leans on flyovers (pillar crossover-skip).
1. **Downtown Dash** — neon straights through the core
2. **Tower Spiral** — climbing helix between towers
3. **Rainfront** — night + rain, reflective streets
4. **Maglev Crossover** — multi-level flyovers
5. **Grid Central** — fast technical finale

## 4. Cryo Cup  *(Glacier — Ice)*  — sketch only
Accent: white-blue. Env: evening/night; **aurora sky**. Signature mechanic:
**slick hazards everywhere**.
1. **Frostbite Flats** — gentle but slick opener
2. **Glacier Caverns** — enclosed ice tunnels
3. **Aurora Ridge** — high mountain ridge under the aurora
4. **Black Ice** — slick-saturated, the signature test
5. **Subzero Spiral** — descending icy corkscrew finale

## 5. Inferno Cup  *(Volcanic — finale, hardest)*  — sketch only
Accent: red/orange. Env: evening/night; **ash storm + lava glow + heat haze**.
Hazard-dense, the most extreme elevation.
1. **Ashfall** — ash-storm opener
2. **Magma Veins** — narrow lava channels
3. **Caldera Rim** — big elevation around a crater
4. **Pyroclasm** — hazard-dense, heat shimmer
5. **Firestorm Finale** — the death-defying championship closer

---

## Unlock rule
- A cup is **cleared** when the player finishes its final race ranked in the
  **top 3** of the cumulative cup standings.
- Clearing cup N unlocks cup N+1. Nebula Cup starts unlocked.
- Persist cleared cup ids in `localStorage` (`nebula-rush-cups-cleared`).
- A cup with no authored tracks shows "Coming soon" and isn't selectable,
  regardless of unlock state.
