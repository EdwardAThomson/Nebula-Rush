import { useState, useEffect } from 'react';
import { audioManager } from '../game/AudioManager';

interface SettingsMenuProps {
    onClose: () => void;
}

export default function SettingsMenu({ onClose }: SettingsMenuProps) {
    const [sfxVolume, setSfxVolume] = useState(audioManager.getSfxVolume() * 100);
    const [musicVolume, setMusicVolume] = useState(audioManager.getMusicVolume() * 100);
    const [sfxEnabled, setSfxEnabled] = useState(audioManager.isSfxEnabled());
    const [musicEnabled, setMusicEnabled] = useState(audioManager.isMusicEnabled());

    useEffect(() => {
        audioManager.setSfxVolume(sfxVolume / 100);
    }, [sfxVolume]);

    useEffect(() => {
        audioManager.setMusicVolume(musicVolume / 100);
    }, [musicVolume]);

    const handleSfxToggle = () => {
        const newState = audioManager.toggleSfx();
        setSfxEnabled(newState);
    };

    const handleMusicToggle = () => {
        const newState = audioManager.toggleMusic();
        setMusicEnabled(newState);
    };

    const handleTestSfx = () => {
        audioManager.playClick();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
            <div className="bg-gray-900 border-2 border-cyan-500 rounded-xl p-8 w-full max-w-md shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                <h2 className="text-3xl font-bold text-cyan-400 mb-8 text-center">SETTINGS</h2>

                {/* SFX Section */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-white font-bold">Sound Effects</label>
                        <button
                            onClick={handleSfxToggle}
                            onMouseEnter={() => audioManager.playHover()}
                            className={`px-4 py-1 rounded font-bold text-sm transition-all ${
                                sfxEnabled 
                                    ? 'bg-cyan-600 text-white' 
                                    : 'bg-gray-700 text-gray-400'
                            }`}
                        >
                            {sfxEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div className="flex items-center space-x-4">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={sfxVolume}
                            onChange={(e) => setSfxVolume(Number(e.target.value))}
                            disabled={!sfxEnabled}
                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                        />
                        <span className="text-gray-400 w-12 text-right">{Math.round(sfxVolume)}%</span>
                    </div>
                    <button
                        onClick={handleTestSfx}
                        onMouseEnter={() => audioManager.playHover()}
                        disabled={!sfxEnabled}
                        className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 disabled:text-gray-600 disabled:cursor-not-allowed"
                    >
                        ▶ Test Sound
                    </button>
                </div>

                {/* Music Section */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-white font-bold">Music</label>
                        <button
                            onClick={handleMusicToggle}
                            onMouseEnter={() => audioManager.playHover()}
                            className={`px-4 py-1 rounded font-bold text-sm transition-all ${
                                musicEnabled 
                                    ? 'bg-purple-600 text-white' 
                                    : 'bg-gray-700 text-gray-400'
                            }`}
                        >
                            {musicEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div className="flex items-center space-x-4">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={musicVolume}
                            onChange={(e) => setMusicVolume(Number(e.target.value))}
                            disabled={!musicEnabled}
                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50"
                        />
                        <span className="text-gray-400 w-12 text-right">{Math.round(musicVolume)}%</span>
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={() => { audioManager.playClick(); onClose(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded shadow-lg transition-all"
                >
                    CLOSE
                </button>
            </div>
        </div>
    );
}
