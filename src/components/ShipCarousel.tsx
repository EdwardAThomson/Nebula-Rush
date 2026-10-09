import { useCallback, useEffect, useState } from 'react';
import type { ShipType } from '../game/ShipFactory';
import { audioManager } from '../game/AudioManager';
import ShipPreview from './ShipPreview';

export interface CarouselShip {
    type: ShipType;
    title: string;
    color: number;
    info: string;
    locked: boolean;
    unlockHint: string;
    stats: { label: string; value: number; barClass: string }[]; // value 0–100
}

interface ShipCarouselProps {
    ships: CarouselShip[];
    initialType: ShipType;
    recommendedType?: ShipType;
    pilotName?: string;
    paused?: boolean; // ignore keys while a modal (paint) sits on top
    onSelect: (type: ShipType, color: number) => void;
    onPaint: (type: ShipType, color: number) => void;
}

// Ship select as a carousel: one ship on a turntable in the middle, ←/→ (or
// the arrow buttons / dots) to cycle, stats underneath. Locked ships can be
// browsed but not selected.
export default function ShipCarousel({ ships, initialType, recommendedType, pilotName, paused, onSelect, onPaint }: ShipCarouselProps) {
    const [index, setIndex] = useState(() => Math.max(0, ships.findIndex(s => s.type === initialType)));
    const ship = ships[index];

    const step = useCallback((dir: number) => {
        audioManager.playHover();
        setIndex(i => (i + dir + ships.length) % ships.length);
    }, [ships.length]);

    const choose = useCallback(() => {
        if (ship.locked) return;
        audioManager.playClick();
        onSelect(ship.type, ship.color);
    }, [ship, onSelect]);

    useEffect(() => {
        if (paused) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') step(-1);
            else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') step(1);
            else if (e.key === 'Enter') choose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [step, choose, paused]);

    return (
        <div className="flex flex-col items-center w-full max-w-4xl flex-1 min-h-0">
            {/* Stage: arrows either side of the turntable */}
            <div className="flex items-center gap-4 w-full">
                <button type="button" aria-label="Previous ship" onClick={() => step(-1)} className="carousel-arrow">‹</button>

                <div className="carousel-stage flex-1">
                    <div className="carousel-turntable" />
                    <div className="absolute inset-0" style={ship.locked ? { filter: 'grayscale(1) brightness(0.45)' } : undefined}>
                        <ShipPreview key={ship.type} color={ship.color} type={ship.type} />
                    </div>
                    {ship.locked && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <div className="text-5xl">🔒</div>
                            <div className="mt-3 px-3 py-1 rounded bg-black/80 text-sm font-bold text-amber-300">{ship.unlockHint}</div>
                        </div>
                    )}
                    {!ship.locked && ship.type === recommendedType && pilotName && (
                        <div className="carousel-pick">★ {pilotName.toUpperCase()}'S PICK</div>
                    )}
                    <div className="carousel-count">{String(index + 1).padStart(2, '0')} / {String(ships.length).padStart(2, '0')}</div>
                </div>

                <button type="button" aria-label="Next ship" onClick={() => step(1)} className="carousel-arrow">›</button>
            </div>

            {/* Dots: one per ship, locked ones dimmed */}
            <div className="flex gap-2 mt-4">
                {ships.map((s, i) => (
                    <button
                        key={s.type}
                        type="button"
                        aria-label={s.title}
                        onClick={() => { audioManager.playHover(); setIndex(i); }}
                        className={`carousel-dot ${i === index ? 'is-active' : ''} ${s.locked ? 'is-locked' : ''}`}
                    />
                ))}
            </div>

            {/* Name + stats */}
            <h3 className={`neon-card-title text-3xl mt-4 ${ship.locked ? 'text-gray-500' : 'text-white'}`}>{ship.title}</h3>
            <p className="screen-subtitle mt-1 normal-case tracking-[0.12em]">{ship.locked ? 'Locked' : ship.info}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3 mt-5 w-full max-w-2xl" style={ship.locked ? { opacity: 0.45 } : undefined}>
                {ship.stats.map(s => {
                    const lit = Math.round(s.value / 10);
                    return (
                        <div key={s.label} className="flex items-center gap-3">
                            <span className="stat-label w-20">{s.label}</span>
                            <div className="seg-bar">
                                {Array.from({ length: 10 }, (_, i) => <span key={i} className={i < lit ? `on ${s.barClass}` : ''} />)}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex gap-4 mt-6">
                <button
                    type="button"
                    disabled={ship.locked}
                    onClick={() => { audioManager.playClick(); onPaint(ship.type, ship.color); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="menu-btn menu-btn-back disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    🎨 PAINT
                </button>
                <button
                    type="button"
                    disabled={ship.locked}
                    onClick={choose}
                    onMouseEnter={() => audioManager.playHover()}
                    className="menu-btn menu-btn-primary min-w-[16rem] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {ship.locked ? 'LOCKED' : 'SELECT'}
                </button>
            </div>
        </div>
    );
}
