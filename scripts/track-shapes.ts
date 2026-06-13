/**
 * Track silhouette sheet — renders every track's centreline top-down into one
 * SVG so layout distinctness can be judged at a glance (a new track must not
 * share a skeleton with an existing one). Start line marked with a dot;
 * elevation tinted (blue = below grade, red = above).
 *
 * Run: npx tsx scripts/track-shapes.ts   → writes /tmp/track_shapes.svg
 */
import * as THREE from 'three';
import { writeFileSync } from 'fs';
// Reuse the inline track definitions from the analysis script.
import { TRACKS } from './analyze-tracks';

const CELL = 320, PAD = 24, COLS = 4;
const rows = Math.ceil(TRACKS.length / COLS);
const W = COLS * CELL, H = rows * (CELL + 28);

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#101418;font-family:monospace">`;

TRACKS.forEach((track, ti) => {
    const curve = new THREE.CatmullRomCurve3(track.points, true, 'centripetal');
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 400; i++) pts.push(curve.getPoint(i / 400));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const span = Math.max(maxX - minX, maxZ - minZ) || 1;
    const scale = (CELL - 2 * PAD) / span;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const ox = (ti % COLS) * CELL + CELL / 2;
    const oy = Math.floor(ti / COLS) * (CELL + 28) + CELL / 2 + 20;
    const X = (p: THREE.Vector3) => (ox + (p.x - cx) * scale).toFixed(1);
    const Z = (p: THREE.Vector3) => (oy + (p.z - cz) * scale).toFixed(1);

    // Elevation-tinted polyline segments (blue below grade, red above).
    const ySpan = Math.max(1, Math.max(Math.abs(minY), Math.abs(maxY)));
    for (let i = 0; i < pts.length - 1; i++) {
        const y = (pts[i].y + pts[i + 1].y) / 2;
        const f = Math.max(-1, Math.min(1, y / ySpan));
        const r = f > 0 ? Math.round(120 + 135 * f) : 120;
        const b = f < 0 ? Math.round(120 - 135 * f) : 120;
        svg += `<line x1="${X(pts[i])}" y1="${Z(pts[i])}" x2="${X(pts[i + 1])}" y2="${Z(pts[i + 1])}" stroke="rgb(${r},${Math.round(120 - 40 * Math.abs(f))},${b})" stroke-width="3"/>`;
    }
    // Start marker + label.
    svg += `<circle cx="${X(pts[0])}" cy="${Z(pts[0])}" r="5" fill="#fff"/>`;
    svg += `<text x="${ox}" y="${oy - CELL / 2 - 4}" fill="#cfd8dc" font-size="14" text-anchor="middle">${track.name} (${track.id})</text>`;
});
svg += '</svg>';

writeFileSync('/tmp/track_shapes.svg', svg);
console.log(`wrote /tmp/track_shapes.svg (${TRACKS.length} tracks)`);
