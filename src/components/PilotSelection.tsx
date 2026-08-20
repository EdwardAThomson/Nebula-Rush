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
            <h2 className="text-4xl font-bold text-white mb-8 animate-pulse text-center">CHOOSE YOUR PILOT</h2>

            <div className="flex flex-wrap justify-center gap-6 w-full max-w-7xl overflow-y-auto flex-1 min-h-0 p-4 scrollbar-hide">
                {pilots.map((pilot) => {
                    const locked = !unlockedIds.includes(pilot.id);
                    return (
                    <div
                        key={pilot.id}
                        onClick={() => { if (locked) return; audioManager.playClick(); onSelect(pilot); }}
                        onMouseEnter={() => { if (!locked) audioManager.playHover(); }}
                        className={locked
                            ? 'relative bg-gray-900 bg-opacity-80 rounded-xl w-64 border-2 flex flex-col border-gray-800 opacity-60 cursor-default'
                            : `relative bg-gray-900 bg-opacity-80 rounded-xl cursor-pointer transition-all transform hover:scale-105
                               w-64 border-2 flex flex-col border-gray-700 hover:border-gray-500 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]`}
                    >
                        {/* Image */}
                        <div className="h-64 w-full overflow-hidden rounded-t-xl">
                            <img
                                src={pilot.imagePath}
                                alt={pilot.name}
                                className={locked
                                    ? 'w-full h-full object-cover grayscale brightness-50'
                                    : 'w-full h-full object-cover transition-transform duration-500 hover:scale-110'}
                            />
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
                        <div className="p-4 flex-1 flex flex-col">
                            <h3 className={`text-xl font-bold mb-4 ${locked ? 'text-gray-500' : 'text-white group-hover:text-cyan-400'}`}>
                                {pilot.name}
                            </h3>

                            {/* Stats */}
                            <div className="space-y-2 mt-auto">
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
                    className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-lg border border-gray-600 transition-all"
                >
                    {backLabel}
                </button>
                {onMainMenu && (
                    <button
                        onClick={() => { audioManager.playClick(); onMainMenu(); }}
                        onMouseEnter={() => audioManager.playHover()}
                        className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-lg border border-gray-600 transition-all"
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
        <div className="flex items-center text-xs">
            <span className="w-8 font-bold text-gray-500">{label}</span>
            <div className="flex-1 flex space-x-1">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className={`h-2 flex-1 rounded-sm ${i < filledCount ? color : 'bg-gray-800'}`}
                    />
                ))}
            </div>
        </div>
    );
}
