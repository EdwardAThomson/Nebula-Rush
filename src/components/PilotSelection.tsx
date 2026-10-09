import { PILOTS, type Pilot } from '../game/PilotDefinitions';
import { audioManager } from '../game/AudioManager';
import { getUnlockedPilotIds, getUnlockHint } from '../game/unlocks';

interface PilotSelectionProps {
    onSelect: (pilot: Pilot) => void;
    onBack: () => void;
    backLabel?: string;
    onMainMenu?: () => void;
}

export default function PilotSelection({ onSelect, onBack, backLabel = 'BACK', onMainMenu }: PilotSelectionProps) {
    const unlockedIds = getUnlockedPilotIds();
    // Unlocked pilots first (left side), locked trailing — stable sort keeps
    // each group in its roster order.
    const pilots = [...PILOTS].sort((a, b) =>
        Number(unlockedIds.includes(b.id)) - Number(unlockedIds.includes(a.id)));

    return (
        <div className="relative z-10 flex flex-col items-center h-full p-8">
            <div className="mb-8"><h2 className="screen-title">CHOOSE YOUR PILOT</h2><div className="screen-rule" /></div>

            <div className="flex flex-wrap justify-center content-start gap-6 w-full max-w-7xl overflow-y-auto flex-1 min-h-0 p-4 scrollbar-hide">
                {pilots.map((pilot) => {
                    const locked = !unlockedIds.includes(pilot.id);
                    return (
                    <div
                        key={pilot.id}
                        onClick={() => { if (locked) return; audioManager.playClick(); onSelect(pilot); }}
                        onMouseEnter={() => { if (!locked) audioManager.playHover(); }}
                        className={locked
                            ? 'neon-card neon-card-locked relative w-64 flex flex-col'
                            : 'neon-card neon-card-live group relative w-64 flex flex-col'}
                    >
                        {/* Portrait, with the name on a fade along its bottom edge */}
                        <div className="pilot-portrait">
                            <img
                                src={pilot.imagePath}
                                alt={pilot.name}
                                className={locked
                                    ? 'w-full h-full object-cover grayscale brightness-50'
                                    : 'w-full h-full object-cover'}
                            />
                            <h3 className={`pilot-name neon-card-title text-lg ${locked ? 'text-gray-500' : 'text-white group-hover:text-cyan-300'}`}>
                                {pilot.name}
                            </h3>
                        </div>

                        {/* Locked overlay: how to earn this pilot */}
                        {locked && (
                            <div className="absolute inset-x-0 top-24 flex flex-col items-center z-20 pointer-events-none">
                                <div className="text-4xl">🔒</div>
                                <div className="mt-2 px-3 py-1 rounded bg-black/80 text-xs font-bold text-amber-300">
                                    {getUnlockHint('pilot', pilot.id)}
                                </div>
                            </div>
                        )}

                        {/* Info badge — bio shown as a tooltip on hover */}
                        {!locked && (
                        <div className="group/tip absolute top-2 right-2 z-20" onClick={(e) => e.stopPropagation()}>
                            <div className="w-6 h-6 flex items-center justify-center rounded-full bg-black/70 border border-gray-400 text-gray-200 text-xs font-bold cursor-help select-none">
                                i
                            </div>
                            <div className="pointer-events-none absolute right-0 top-7 w-56 p-3 rounded-lg bg-gray-950 bg-opacity-95 border border-cyan-700 text-gray-300 text-xs italic leading-snug shadow-xl z-30 opacity-0 invisible transition-opacity duration-150 group-hover/tip:opacity-100 group-hover/tip:visible">
                                {pilot.bio}
                            </div>
                        </div>
                        )}

                        {/* Info */}
                        <div className="px-5 pt-4 pb-5 flex-1 flex flex-col">
                            {/* Stats */}
                            <div className="space-y-2.5 mt-auto">
                                <StatRow label="VEL" value={pilot.stats.velocity} color="bg-cyan-500" />
                                <StatRow label="ACC" value={pilot.stats.acceleration} color="bg-yellow-500" />
                                <StatRow label="HND" value={pilot.stats.handling} color="bg-purple-500" />
                            </div>
                        </div>


                    </div>
                    );
                })}
            </div>



            <div className="flex space-x-6 mt-8">
                <button
                    onClick={() => { audioManager.playClick(); onBack(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="menu-btn menu-btn-back"
                >
                    {backLabel}
                </button>
                {onMainMenu && (
                    <button
                        onClick={() => { audioManager.playClick(); onMainMenu(); }}
                        onMouseEnter={() => audioManager.playHover()}
                        className="menu-btn menu-btn-back"
                    >
                        MAIN MENU
                    </button>
                )}
            </div>
        </div >
    );
}


function StatRow({ label, value, color }: { label: string, value: number, color: string }) {
    // Map -2..+2 to 1..5 for visual width (20% to 100%)
    // -2 -> 20%, -1 -> 40%, 0 -> 60%, 1 -> 80%, 2 -> 100%
    // actually, let's just show relative bars. 
    // Normalized: (value + 3) / 6 * 100 ? No.
    // Let's do a simple 5-pip system. 3 pips is average (0).
    // -2: [ ][ ][ ][ ][ ] (1 filled)
    // -1: [x][ ][ ][ ][ ] (2 filled)
    //  0: [x][x][ ][ ][ ] (3 filled)
    // +1: [x][x][x][ ][ ] (4 filled)
    // +2: [x][x][x][x][ ] (5 filled)
    const filledCount = value + 3;

    return (
        <div className="flex items-center gap-3">
            <span className="stat-label w-8">{label}</span>
            <div className="seg-bar">
                {[...Array(5)].map((_, i) => (
                    <span key={i} className={i < filledCount ? `on ${color}` : ''} />
                ))}
            </div>
        </div>
    );
}
