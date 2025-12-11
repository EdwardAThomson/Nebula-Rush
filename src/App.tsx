import { useState } from 'react';
import Game from './components/Game';
import type { ShipConfig } from './game/Ship';
import { SHIP_STATS } from './game/ShipFactory';
import ShipPreview from './components/ShipPreview';

function App() {
  const [screen, setScreen] = useState<'start' | 'selection' | 'game'>('start');
  const [showHelp, setShowHelp] = useState(false);
  const [selectedShipConfig, setSelectedShipConfig] = useState<ShipConfig>({
    color: 0xcc0000,
    accelFactor: 0.5,
    turnSpeed: 0.001,
    friction: 0.99,
    strafeSpeed: 0.01,
    type: 'fighter'
  });

  const handleStartGame = (config: ShipConfig) => {
    setSelectedShipConfig(config);
    setScreen('game');
  };

  return (
    <div className="w-full h-screen bg-black text-white font-mono overflow-hidden relative">

      {/* BACKGROUND (Simple for now) */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-slate-900 z-0"></div>

      {/* START SCREEN */}
      {screen === 'start' && (
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-600 mb-12 animate-pulse">
            NEBULA RUSH
          </h1>

          <div className="flex flex-col space-y-4 w-64">
            <button
              onClick={() => setScreen('selection')}
              className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              NEW GAME
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              HELP
            </button>
          </div>

          <div className="mt-12 text-gray-500 text-sm">
            Created by Edward Thomson
          </div>
        </div>
      )}

      {/* SHIP SELECTION SCREEN */}
      {screen === 'selection' && (
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-8">
          <h2 className="text-4xl font-bold text-white mb-8">SELECT YOUR SHIP</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
            {/* SHIP 1: SPEEDSTER */}
            <div
              onClick={() => handleStartGame({ color: 0x00ccff, ...SHIP_STATS.speedster, type: 'speedster' })}
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
              onClick={() => handleStartGame({ color: 0xcc0000, ...SHIP_STATS.fighter, type: 'fighter' })}
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
              onClick={() => handleStartGame({ color: 0xcccc00, ...SHIP_STATS.tank, type: 'tank' })}
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
          </div>

          <button
            onClick={() => setScreen('start')}
            className="mt-8 text-gray-500 hover:text-white underline"
          >
            Back to Menu
          </button>
        </div>
      )}

      {/* GAME SCREEN */}
      {screen === 'game' && selectedShipConfig && (
        <Game shipConfig={selectedShipConfig} />
      )}

      {/* HELP MODAL */}
      {showHelp && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
          <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full border border-gray-600">
            <h2 className="text-3xl font-bold text-white mb-6">HOW TO PLAY</h2>

            <div className="space-y-4 text-gray-300">
              <div>
                <strong className="text-cyan-400 block">CONTROLS</strong>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><span className="text-white">W / Up</span> : Accelerate</li>
                  <li><span className="text-white">A / D</span> : Lean Left / Right (Strafe))</li>
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
      )}

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
