import React from 'react';

export interface RaceResult {
    rank: number;
    name: string;
    isPlayer: boolean;
    timeStr: string;
    points: number;
}

interface LeaderboardProps {
    results: RaceResult[];
    onRestart: () => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ results, onRestart }) => {
    return (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black bg-opacity-90">
            <div className="w-full max-w-2xl bg-gray-900 border-2 border-cyan-500 rounded-lg p-8 shadow-[0_0_50px_rgba(0,255,255,0.3)]">
                <h1 className="text-4xl font-bold text-center text-cyan-400 mb-8 tracking-widest uppercase">Race Results</h1>

                <div className="space-y-2 mb-8 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 text-gray-400 text-sm uppercase tracking-wider border-b border-gray-700 pb-2">
                        <div className="col-span-2 text-center">Rank</div>
                        <div className="col-span-6">Pilot</div>
                        <div className="col-span-2 text-right">Time</div>
                        <div className="col-span-2 text-right">Points</div>
                    </div>

                    {/* Rows */}
                    {results.map((result) => (
                        <div
                            key={result.rank}
                            className={`grid grid-cols-12 gap-4 items-center p-3 rounded ${result.isPlayer
                                ? 'bg-cyan-900 bg-opacity-40 border border-cyan-500/50'
                                : 'bg-gray-800 bg-opacity-40 hover:bg-gray-700'
                                }`}
                        >
                            <div className="col-span-2 text-center text-2xl font-bold text-white">
                                {result.rank}
                                <span className="text-xs ml-1 align-top text-gray-400">
                                    {result.rank === 1 ? 'st' : result.rank === 2 ? 'nd' : result.rank === 3 ? 'rd' : 'th'}
                                </span>
                            </div>
                            <div className="col-span-6 flex items-center">
                                <div className={`w-3 h-3 rounded-full mr-3 ${result.isPlayer ? 'bg-cyan-400 shadow-[0_0_10px_cyan]' : 'bg-red-500'}`} />
                                <span className={`font-mono text-lg ${result.isPlayer ? 'text-cyan-300 font-bold' : 'text-gray-300'}`}>
                                    {result.name}
                                </span>
                            </div>
                            <div className="col-span-2 text-right font-mono text-yellow-300">
                                {result.timeStr}
                            </div>
                            <div className="col-span-2 text-right font-bold text-white text-xl">
                                {result.points}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-center">
                    <button
                        onClick={onRestart}
                        className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded uppercase tracking-widest transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(0,255,255,0.4)]"
                    >
                        Next Race
                    </button>
                </div>
            </div>
        </div>
    );
};
