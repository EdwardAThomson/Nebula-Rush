import { useState } from 'react';
import Game from './components/Game';
import type { ShipConfig } from './game/Ship';
import { SHIP_STATS } from './game/ShipFactory';
import ShipPreview from './components/ShipPreview';
import TrackPreview from './components/TrackPreview';
import TrackAnalysis from './components/TrackAnalysis';
import EnvironmentTest from './components/EnvironmentTest';
import EnvironmentSelection from './components/EnvironmentSelection';
import LightingPlayground from './components/LightingPlayground';
import PilotSelection from './components/PilotSelection';
import ShipDemo from './components/ShipDemo';
import type { Pilot } from './game/PilotDefinitions';
import type { EnvironmentConfig } from './game/EnvironmentManager';
import { TRACKS } from './game/TrackDefinitions';

function App() {
  const [screen, setScreen] = useState<'start' | 'pilot_selection' | 'selection' | 'track_selection' | 'game' | 'analysis' | 'env_test' | 'lighting_debug' | 'env_selection' | 'night_test' | 'ship_demo'>('start');
  const [gameMode, setGameMode] = useState<'campaign' | 'single_race'>('campaign');
  const [isLoading, setIsLoading] = useState(false); // NEW: Loading state
  const [showHelp, setShowHelp] = useState(false);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [selectedEnvConfig, setSelectedEnvConfig] = useState<EnvironmentConfig | null>(null);
  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [selectedShipConfig, setSelectedShipConfig] = useState<ShipConfig>({
    color: 0xcc0000,
    accelFactor: 0.5,
    turnSpeed: 0.001,
    friction: 0.99,
    strafeSpeed: 0.01,
    slideFactor: 0.95,
    type: 'fighter'
  });

  // Helper to show loading screen before heavy computations
  const navigateTo = (newScreen: typeof screen, callback?: () => void, manualDismiss = false) => {
    setIsLoading(true);
    // Allow UI to render the loading screen
    setTimeout(() => {
      if (callback) callback();
      setScreen(newScreen);

      if (!manualDismiss) {
        setTimeout(() => setIsLoading(false), 100);
      }
    }, 50);
  };

  const handleNewGame = () => {
    navigateTo('pilot_selection', () => {
      setGameMode('campaign');
      setSelectedTrackIndex(0);
      setSelectedEnvConfig(null);
    });
  };

  /*
  const handleNightTest = () => {
    navigateTo('night_test', () => {
      setGameMode('single_race');
      setSelectedTrackIndex(0);
      setSelectedEnvConfig({ timeOfDay: 'night', weather: 'clear' });
    });
  };
*/

  const handlePilotSelect = (pilot: Pilot) => {
    setSelectedPilot(pilot);
    setScreen('selection');
  };

  const handleBackFromPilotSelect = () => {
    if (gameMode === 'single_race') {
      setScreen('env_selection');
    } else {
      setScreen('start');
    }
  };

  const handleTrackSelectMode = () => {
    setGameMode('single_race');
    setScreen('track_selection');
  };

  const handleShipSelect = (config: ShipConfig) => {
    setSelectedShipConfig(config);
    navigateTo('game', undefined, true);
  };

  const handleTrackSelect = (index: number) => {
    setSelectedTrackIndex(index);
    setScreen('env_selection');
  };

  const handleEnvSelect = (config: EnvironmentConfig) => {
    setSelectedEnvConfig(config);
    setScreen('pilot_selection');
  };

  const handleBackFromEnvSelect = () => {
    setScreen('track_selection');
  };

  const handleBackFromShipSelect = () => {
    setScreen('pilot_selection');
  };

  const handleGameExit = () => {
    setScreen('start');
  };

  return (
    <div className="w-full h-screen bg-black text-white font-mono overflow-hidden relative">

      {/* BACKGROUND (Simple for now) */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-slate-900 z-0"></div>

      {/* LOADING OVERLAY */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-90">
          <h2 className="text-4xl font-bold text-cyan-400 animate-pulse">LOADING...</h2>
          <div className="mt-4 w-64 h-2 bg-gray-800 rounded overflow-hidden">
            <div className="h-full bg-cyan-500 animate-ping" style={{ width: '100%', transformOrigin: 'left' }}></div>
          </div>
        </div>
      )}

      {/* START SCREEN */}
      {screen === 'start' && (
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-600 mb-12 animate-pulse">
            NEBULA RUSH
          </h1>

          <div className="flex flex-col space-y-4 w-64">
            <button
              onClick={handleNewGame}
              className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              NEW GAME
            </button>
            <button
              onClick={handleTrackSelectMode}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              SELECT TRACK
            </button>
            {/*
            <button
              onClick={() => setScreen('ship_demo')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              SHIP DEMO
            </button>
            */}
            {/* 
            <button
              onClick={handleNightTest}
              className="px-6 py-3 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all border border-blue-600"
            >
              NIGHT TEST (QUICK)
            </button>
            <button
              onClick={() => setScreen('env_test')}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-yellow-400 font-bold rounded shadow-lg transform hover:scale-105 transition-all border border-yellow-800"
            >
              WEATHER TEST
            </button>
            <button
              onClick={() => setScreen('lighting_debug')}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-purple-400 font-bold rounded shadow-lg transform hover:scale-105 transition-all border border-purple-800"
            >
              LIGHTING DEBUG
            </button>
            */}
            <button
              onClick={() => setShowHelp(true)}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              HELP

            </button>
          </div>

          <div className="absolute bottom-8 text-gray-500 text-sm">
            Created by Edward Thomson
          </div>

        </div>
      )}

      {/* ... (Previous Logic) ... */}

      {/* NIGHT TEST SCREEN - Special Case of Game */}
      {screen === 'night_test' && (
        <Game
          shipConfig={selectedShipConfig}
          initialTrackIndex={0} // The Awakening
          isCampaign={false}
          forcedEnvironment={{ timeOfDay: 'night', weather: 'clear' }}
          pilot={null}
          opponentCount={0}
          onExit={handleGameExit}
          debugLighting={true}
          onReady={() => setIsLoading(false)}
        />
      )}

      {/* PILOT SELECTION SCREEN */}
      {
        screen === 'pilot_selection' && (
          <PilotSelection
            onSelect={handlePilotSelect}
            onBack={handleBackFromPilotSelect}
          />
        )
      }

      {/* SHIP SELECTION SCREEN */}
      {
        screen === 'selection' && (
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-8">
            <h2 className="text-4xl font-bold text-white mb-8">SELECT YOUR SHIP</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl overflow-y-auto max-h-[70vh] p-4 scrollbar-hide">
              {/* SHIP 1: SPEEDSTER */}
              <div
                onClick={() => handleShipSelect({ color: 0x00ccff, ...SHIP_STATS.speedster, type: 'speedster' })}
                className="bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-cyan-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 group"
              >
                <div className="h-48 bg-cyan-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0x00ccff} type="speedster" />
                </div>
                <h3 className="text-2xl font-bold text-cyan-400 mb-2">SPEEDSTER</h3>
                <p className="text-gray-400 text-sm mb-4">High top speed, but slower acceleration. Built for long straights.</p>

                <div className="space-y-2">
                  <StatBar label="Speed" value={95} color="bg-cyan-500" />
                  <StatBar label="Accel" value={60} color="bg-yellow-500" />
                  <StatBar label="Handling" value={70} color="bg-green-500" />
                </div>
              </div>

              {/* SHIP 2: FIGHTER (Balanced) */}
              <div
                onClick={() => handleShipSelect({ color: 0xcc0000, ...SHIP_STATS.fighter, type: 'fighter' })}
                className="bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-red-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 group"
              >
                <div className="h-48 bg-red-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0xcc0000} type="fighter" />
                </div>
                <h3 className="text-2xl font-bold text-red-500 mb-2">FIGHTER</h3>
                <p className="text-gray-400 text-sm mb-4">Perfectly balanced stats. Good for beginners and pros alike.</p>

                <div className="space-y-2">
                  <StatBar label="Speed" value={80} color="bg-cyan-500" />
                  <StatBar label="Accel" value={80} color="bg-yellow-500" />
                  <StatBar label="Handling" value={80} color="bg-green-500" />
                </div>
              </div>

              {/* SHIP 3: TANK (Heavy) */}
              <div
                onClick={() => handleShipSelect({ color: 0xcccc00, ...SHIP_STATS.tank, type: 'tank' })}
                className="bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-yellow-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 group"
              >
                <div className="h-48 bg-yellow-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0xcccc00} type="tank" />
                </div>
                <h3 className="text-2xl font-bold text-yellow-500 mb-2">TANK</h3>
                <p className="text-gray-400 text-sm mb-4">Incredible acceleration and grip, but lower top speed.</p>

                <div className="space-y-2">
                  <StatBar label="Speed" value={60} color="bg-cyan-500" />
                  <StatBar label="Accel" value={95} color="bg-yellow-500" />
                  <StatBar label="Handling" value={90} color="bg-green-500" />
                </div>
              </div>

              {/* SHIP 4: INTERCEPTOR (Bi-Plane) */}
              <div
                onClick={() => handleShipSelect({ color: 0x00ff00, ...SHIP_STATS.interceptor, type: 'interceptor' })}
                className="bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-green-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 group"
              >
                <div className="h-48 bg-green-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0x00ff00} type="interceptor" />
                </div>
                <h3 className="text-2xl font-bold text-green-500 mb-2">INTERCEPTOR</h3>
                <p className="text-gray-400 text-sm mb-4">Bi-plane design. Best-in-class acceleration and turning.</p>

                <div className="space-y-2">
                  <StatBar label="Speed" value={70} color="bg-cyan-500" />
                  <StatBar label="Accel" value={98} color="bg-yellow-500" />
                  <StatBar label="Handling" value={95} color="bg-green-500" />
                </div>
              </div>

              {/* SHIP 5: CORSAIR (Drifter) */}
              <div
                onClick={() => handleShipSelect({ color: 0x5500aa, ...SHIP_STATS.corsair, type: 'corsair' })}
                className="bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-purple-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 group"
              >
                <div className="h-48 bg-purple-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0x5500aa} type="corsair" />
                </div>
                <h3 className="text-2xl font-bold text-purple-500 mb-2">CORSAIR</h3>
                <p className="text-gray-400 text-sm mb-4">Aggressive styling. High speed and extreme drift capabilities.</p>

                <div className="space-y-2">
                  <StatBar label="Speed" value={90} color="bg-cyan-500" />
                  <StatBar label="Accel" value={75} color="bg-yellow-500" />
                  <StatBar label="Drift" value={95} color="bg-pink-500" />
                </div>
              </div>
            </div>

            <button
              onClick={handleBackFromShipSelect}
              className="mt-8 text-gray-500 hover:text-white underline"
            >
              {gameMode === 'single_race' ? 'Back to Track Selection' : 'Back to Pilot Selection'}
            </button>
          </div>
        )
      }

      {/* TRACK SELECTION SCREEN */}
      {
        screen === 'track_selection' && (
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-8">
            <h2 className="text-4xl font-bold text-white mb-8">SELECT TRACK</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl overflow-y-auto max-h-[70vh] p-4 scrollbar-hide">
              {TRACKS.map((track, index) => (
                <div
                  key={track.id}
                  onClick={() => handleTrackSelect(index)}
                  className="bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-purple-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 group"
                >
                  <div className="h-48 bg-black bg-opacity-50 rounded mb-4 flex items-center justify-center overflow-hidden border border-gray-700">
                    <TrackPreview points={track.points} />
                  </div>
                  <h3 className="text-2xl font-bold text-purple-400 mb-2">{track.name}</h3>
                  <p className="text-gray-400 text-sm mb-4 h-12">{track.description}</p>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500 uppercase">Difficulty:</span>
                    <div className="flex space-x-1">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full ${i < track.difficulty ? 'bg-purple-500' : 'bg-gray-700'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setScreen('start')}
              className="mt-8 text-gray-500 hover:text-white underline"
            >
              Back to Menu
            </button>
          </div>
        )
      }

      {/* ANALYSIS SCREEN */}
      {
        screen === 'analysis' && (
          <div className="relative z-10 h-full w-full">
            <TrackAnalysis onBack={() => setScreen('start')} />
          </div>
        )
      }

      {/* ENVIRONMENT SELECTION SCREEN */}
      {
        screen === 'env_selection' && (
          <EnvironmentSelection
            onSelect={handleEnvSelect}
            onBack={handleBackFromEnvSelect}
          />
        )
      }

      {/* ENVIRONMENT TEST SCREEN */}
      {
        screen === 'env_test' && (
          <EnvironmentTest onBack={() => setScreen('start')} />
        )
      }

      {/* LIGHTING DEBUG SCREEN */}
      {
        screen === 'lighting_debug' && (
          <LightingPlayground onBack={() => setScreen('start')} />
        )
      }

      {/* GAME SCREEN */}
      {
        screen === 'game' && selectedShipConfig && (
          <Game
            // Apply Pilot Modifiers to Ship Config
            shipConfig={selectedShipConfig}
            initialTrackIndex={selectedTrackIndex}
            isCampaign={gameMode === 'campaign'}
            forcedEnvironment={selectedEnvConfig || undefined}
            pilot={selectedPilot}
            onExit={handleGameExit}
            onReady={() => setIsLoading(false)}
          />
        )
      }

      {/* SHIP DEMO SCREEN */}
      {
        screen === 'ship_demo' && (
          <ShipDemo onBack={() => setScreen('start')} />
        )
      }

      {/* HELP MODAL */}
      {
        showHelp && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
            <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full border border-gray-600">
              <h2 className="text-3xl font-bold text-white mb-6">HOW TO PLAY</h2>

              <div className="space-y-4 text-gray-300">
                <div>
                  <strong className="text-cyan-400 block">CONTROLS</strong>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li><span className="text-white">W / Up</span> : Accelerate</li>
                    <li><span className="text-white">A / D</span> : Lean Left / Right (Strafe)</li>
                    <li><span className="text-white">Q / E</span> or <span className="text-white">Left/Right</span> : Steer</li>
                    <li><span className="text-white">A / D</span> : Side Strafe</li>
                    <li><span className="text-white">SPACE</span> : Jump</li>
                    <li><span className="text-white">P</span> : Screenshot</li>
                  </ul>
                </div>

                <div>
                  <strong className="text-purple-400 block">TIPS</strong>
                  <p className="text-sm">
                    Watch out for the traffic light start!
                    Use boost pads (pink) for extra speed.
                    Avoid walls to maintain momentum.
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-700 text-xs text-gray-500">
                  <p>Created by Edward Thomson</p>
                  <p>Website: <a href="https://edthomson.com" className="text-blue-400 hover:underline">edthomson.com</a></p>
                </div>
              </div>

              <button
                onClick={() => setShowHelp(false)}
                className="mt-8 w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded"
              >
                CLOSE
              </button>
            </div>
          </div>
        )
      }

    </div>
  )
}

function StatBar({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="flex items-center text-xs">
      <span className="w-16 text-gray-400">{label}</span>
      <div className="flex-1 h-2 bg-gray-900 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }}></div>
      </div>
    </div>
  );
}

export default App
