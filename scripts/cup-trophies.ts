// Renders each cup trophy (src/game/CupTrophies.ts) to a still JPEG for
// public/assets/cups/cup_<id>.jpg. See render-cup-trophies.html for how to run
// it. Vite serves this page, so it can import straight from src/.
import * as THREE from 'three';
import {
    TROPHIES, getTrophy, CARD_VIEW, ART_WIDTH, ART_HEIGHT,
    configureTrophyRenderer, buildTrophyScene, createTrophyComposer, type TrophySpec, type View,
} from '../src/game/CupTrophies';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(ART_WIDTH, ART_HEIGHT);
configureTrophyRenderer(renderer);

function renderTrophy(spec: TrophySpec, view: View = CARD_VIEW): string {
    const ts = buildTrophyScene(spec, renderer, view);
    const composer = createTrophyComposer(renderer, ts, ART_WIDTH, ART_HEIGHT);
    composer.render();
    const url = renderer.domElement.toDataURL('image/jpeg', 0.9);
    composer.dispose();
    ts.dispose();
    return url;
}

const grid = document.getElementById('grid')!;
const results: { id: string; url: string }[] = [];

function download(id: string, url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `cup_${id}.jpg`;
    a.click();
}

for (const spec of TROPHIES) {
    const url = renderTrophy(spec);
    results.push({ id: spec.id, url });
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = url;
    img.title = `cup_${spec.id}.jpg`;
    img.onclick = () => download(spec.id, url);
    const cap = document.createElement('figcaption');
    cap.textContent = `cup_${spec.id}.jpg`;
    fig.append(img, cap);
    grid.append(fig);
}

document.getElementById('download-all')!.onclick = () => results.forEach((r) => download(r.id, r.url));

// Exposed for headless capture (e.g. a Playwright script reading the data URLs)
// and for close-up checks of a single trophy from any angle.
const w = window as unknown as { cupTrophies: typeof results; renderCupView: (id: string, view: View) => string };
w.cupTrophies = results;
w.renderCupView = (id, view) => renderTrophy(getTrophy(id)!, view);
