/**
 * Track DATA sanity checks — imports the real definitions from src (no inline
 * copies to drift), so it validates exactly what ships.
 *
 *   1. Pad/hazard overlap: a boost pad must never overlap a hazard in BOTH
 *      t-span and lateral span (happened twice: gorge v1, pass v1).
 *   2. Pad/pad overlap: same test between pads.
 *   3. Width sanity: every pad/hazard must fit inside the local road width
 *      (centre ± width/2 within ±widthAt(t)).
 *
 * Run: npx tsx scripts/check-track-data.ts   (exits 1 on any finding)
 */
import { TRACKS, TRACK_8, widthAt } from '../src/game/TrackDefinitions';

const all = [...TRACKS, TRACK_8].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
let findings = 0;

type Span = { t0: number; t1: number; l0: number; l1: number; label: string };
const spans = (tr: (typeof all)[number]): Span[] => [
    ...tr.pads.map((p, i) => ({
        t0: p.trackProgress - p.length / 2, t1: p.trackProgress + p.length / 2,
        l0: p.lateralPosition - p.width / 2, l1: p.lateralPosition + p.width / 2,
        label: `pad#${i}@${p.trackProgress}`,
    })),
];
const hazSpans = (tr: (typeof all)[number]): Span[] =>
    (tr.hazards ?? []).map((h, i) => ({
        t0: h.trackProgress - (h.length ?? 0) / 2, t1: h.trackProgress + (h.length ?? 0) / 2,
        l0: h.lateralPosition - h.width / 2, l1: h.lateralPosition + h.width / 2,
        label: `${h.type}#${i}@${h.trackProgress}`,
    }));
const overlap = (a: Span, b: Span): boolean => a.t0 < b.t1 && b.t0 < a.t1 && a.l0 < b.l1 && b.l0 < a.l1;

for (const tr of all) {
    const pads = spans(tr), hazards = hazSpans(tr);
    for (const p of pads) for (const h of hazards) if (overlap(p, h)) {
        findings++; console.log(`!! ${tr.name}: ${p.label} overlaps ${h.label}`);
    }
    for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) if (overlap(pads[i], pads[j])) {
        findings++; console.log(`!! ${tr.name}: ${pads[i].label} overlaps ${pads[j].label}`);
    }
    for (const s of [...pads, ...hazards]) {
        const tMid = (s.t0 + s.t1) / 2;
        const half = widthAt(tr.widthProfile, ((tMid % 1) + 1) % 1);
        if (s.l0 < -half || s.l1 > half) {
            findings++; console.log(`!! ${tr.name}: ${s.label} pokes outside the road (lat [${s.l0}, ${s.l1}] vs ±${half.toFixed(0)})`);
        }
    }
}

console.log(findings === 0 ? `✓ ${all.length} tracks: no overlaps, everything inside the road` : `${findings} finding(s)`);
if (findings > 0) process.exit(1);
