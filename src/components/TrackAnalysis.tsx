import { useState, useMemo } from 'react';
import { TRACKS } from '../game/TrackDefinitions';
import { createTrackCurve, getTrackAnalysis, type TrackAnalysisData } from '../game/TrackFactory';

export default function TrackAnalysis({ onBack }: { onBack: () => void }) {
    const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);

    const analysis: TrackAnalysisData | null = useMemo(() => {
        const track = TRACKS[selectedTrackIndex];
        if (!track) return null;
        const curve = createTrackCurve(track.points);
        return getTrackAnalysis(curve);
    }, [selectedTrackIndex]);

    return (
        <div className="flex flex-col h-full p-8 bg-gray-900 text-white overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-cyan-400">TRACK GRADIENT ANALYSIS</h2>
                <button onClick={onBack} className="text-gray-400 hover:text-white underline">Back to Menu</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 h-full">
                {/* Track List */}
                <div className="col-span-1 bg-gray-800 p-4 rounded overflow-y-auto">
                    <h3 className="text-xl font-bold mb-4 border-b border-gray-600 pb-2">Tracks</h3>
                    <div className="space-y-2">
                        {TRACKS.map((track, idx) => (
                            <div
                                key={track.id}
                                onClick={() => setSelectedTrackIndex(idx)}
                                className={`p-3 rounded cursor-pointer transition-all ${selectedTrackIndex === idx ? 'bg-cyan-700 text-white font-bold' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                    }`}
                            >
                                {track.name} <span className="text-xs ml-2 opacity-50">(Diff: {track.difficulty})</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Analysis Data */}
                <div className="col-span-3 bg-black border border-gray-700 p-8 rounded flex flex-col">
                    {analysis ? (
                        <>
                            <h3 className="text-2xl font-bold mb-6">{TRACKS[selectedTrackIndex].name} - Analysis</h3>

                            <div className="grid grid-cols-3 gap-6 mb-8">
                                <div className="p-4 bg-gray-800 rounded border-l-4 border-cyan-500">
                                    <div className="text-gray-400 text-sm">Max Curvature</div>
                                    <div className={`text-3xl font-bold ${analysis.maxCurvature > 2 ? 'text-red-500' : 'text-white'}`}>
                                        {analysis.maxCurvature.toFixed(2)}°
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">Per step sample</div>
                                </div>
                                <div className="p-4 bg-gray-800 rounded border-l-4 border-purple-500">
                                    <div className="text-gray-400 text-sm">Avg Curvature</div>
                                    <div className="text-3xl font-bold text-white">
                                        {analysis.avgCurvature.toFixed(2)}°
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-800 rounded border-l-4 border-yellow-500">
                                    <div className="text-gray-400 text-sm">Hotspots</div>
                                    <div className="text-3xl font-bold text-white">
                                        {analysis.hotspots.length}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">Sharp turns detected</div>
                                </div>
                            </div>

                            {/* Hotspots List */}
                            <div className="flex-1 bg-gray-900 p-4 rounded overflow-y-auto border border-gray-800">
                                <h4 className="text-lg font-bold mb-4 text-yellow-400">Gradient Anomalies (Sharp Turns)</h4>
                                {analysis.hotspots.length === 0 ? (
                                    <div className="text-green-500 italic">No sharp gradients detected. Track is smooth.</div>
                                ) : (
                                    <table className="w-full text-left bg-gray-800 rounded overflow-hidden">
                                        <thead className="bg-gray-700 text-gray-300">
                                            <tr>
                                                <th className="p-3">Location (t)</th>
                                                <th className="p-3">Severity (Angle)</th>
                                                <th className="p-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700">
                                            {analysis.hotspots.map((h, i) => (
                                                <tr key={i} className="hover:bg-gray-700 transition-colors">
                                                    <td className="p-3 font-mono text-cyan-300">{(h.t * 100).toFixed(1)}%</td>
                                                    <td className="p-3 font-mono text-orange-400">{h.curvature.toFixed(2)}°</td>
                                                    <td className="p-3">
                                                        {h.curvature > 5 ? (
                                                            <span className="text-red-500 font-bold">CRITICAL</span>
                                                        ) : (
                                                            <span className="text-yellow-500">WARNING</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            Select a track to analyze gradient...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
