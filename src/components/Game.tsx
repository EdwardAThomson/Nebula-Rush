import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createTrackCurve, createTrackMesh, getTrackFrame, createBoostPadMeshes, createHazardMeshes, createStartLineMesh, createTrafficLightMesh } from '../game/TrackFactory';
import { createStoredZip } from '../utils/zip';
import { InputManager } from '../game/InputManager';
import { Ship, type ShipConfig } from '../game/Ship';
import { OpponentManager, type OpponentConfig } from '../game/OpponentManager';
import { EnvironmentManager, type EnvironmentConfig } from '../game/EnvironmentManager';
import { WorldReference } from '../game/WorldReference';
import { Leaderboard, type RaceResult } from './Leaderboard';
import { TRACKS, type TrackConfig } from '../game/TrackDefinitions';
import TutorialOverlay from './TutorialOverlay';
import type { Pilot } from '../game/PilotDefinitions';
import { DebugLightingPanel } from './DebugLightingPanel';
import { audioManager } from '../game/AudioManager';
import { PLAYER_START_T } from '../game/PhysicsEngine';

interface GameProps {
  shipConfig: ShipConfig;
  initialTrackIndex?: number;
  isCampaign?: boolean;
  forcedEnvironment?: EnvironmentConfig;
  pilot?: Pilot | null;
  opponentCount?: number;

  onExit?: () => void;
  onTutorial?: () => void;     // jump to the tutorial (offered on a rough result)
  debugLighting?: boolean;
  onReady?: () => void;

  tutorial?: boolean;          // guided tutorial mode (no opponents, prompt overlay)
  trackOverride?: TrackConfig; // use this track instead of TRACKS[index] (tutorial)
}

const POINTS_TABLE = [100, 93, 87, 82, 78, 75, 72, 69, 66, 63, 60, 58, 56, 54, 52, 50, 48, 46, 44, 42];

type RaceState = 'intro' | 'racing' | 'finished' | 'results';

export default function Game({ shipConfig, initialTrackIndex = 0, isCampaign = true, forcedEnvironment, pilot, opponentCount = 19, onExit, onTutorial, debugLighting = false, onReady, tutorial = false, trackOverride }: GameProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  const [currentTrackIndex, setCurrentTrackIndex] = useState(initialTrackIndex);
  const currentTrack = trackOverride ?? TRACKS[currentTrackIndex];

  // Campaign State
  // Initialize roster once using a ref or state that doesn't reset on track change
  // Actually, we want it to persist across the entire session.
  const [roster] = useState<OpponentConfig[]>(() => OpponentManager.generateRoster(opponentCount));
  const [campaignScores, setCampaignScores] = useState<Record<string, number>>({});

  // Speed handled via ref
  // const [speed, setSpeed] = useState(0); 
  // Actually, let's keep 'lap' as state since it's low freq (once per minute maybe).
  const [lap, setLap] = useState(0); // Lap 0 = Before Start Line
  const [finalRank, setFinalRank] = useState<number | null>(null);
  const [currentMusicTrackName, setCurrentMusicTrackName] = useState<string | null>(null);

  // High-Freq HUD Refs
  const speedRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const rankRef = useRef<HTMLDivElement>(null);
  const debugTrackProgressRef = useRef<HTMLDivElement>(null);
  const debugPositionRef = useRef<HTMLDivElement>(null);

  const [hudVisible, setHudVisible] = useState(true);

  const [raceState, setRaceState] = useState<RaceState>('intro');
  const [countdown, setCountdown] = useState(7);
  // Removed debugInfo state
  const [environment, setEnvironment] = useState<EnvironmentConfig | null>(null);

  // Results State
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);

  const minimapRef = useRef<HTMLDivElement>(null);

  const raceStartedRef = useRef(false);
  const raceFinishedRef = useRef(false); // Player finished
  const allFinishedRef = useRef(false); // All ships finished

  const countdownRef = useRef(7);
  const countdownStartTime = useRef(0); // Will be set on mount
  const trafficLightRef = useRef<THREE.Group | null>(null);

  // Lap Timer State
  // const [currentLapTime, setCurrentLapTime] = useState(0); -> Moved to Ref
  const [lastLapTime, setLastLapTime] = useState(0); // Player's last lap
  const lapStartGameTime = useRef(0);  // Game time when lap started (ms)
  const gameTimeRef = useRef(0);       // Accumulated game time (ms) - pauses when tab inactive

  // Format time helper (MM:SS.ms)
  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10); // 2 digits
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // Store the player ship instance
  const playerShip = useRef<Ship | null>(null);
  const opponentManager = useRef<OpponentManager | null>(null);
  const environmentManagerRef = useRef<EnvironmentManager | null>(null);
  const worldReferenceRef = useRef<WorldReference | null>(null);

  const screenshotRequested = useRef<boolean>(false);

  // Captured race photos: buffered in memory during the race, downloaded from
  // the results-screen gallery. photosRef is the source of truth (mutated from
  // the render loop); `photos` mirrors it for rendering.
  type Photo = { url: string; blob: Blob; time: number };
  const MAX_PHOTOS = 20;
  const photosRef = useRef<Photo[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoToast, setPhotoToast] = useState(false);
  const photoToastTimer = useRef<number | null>(null);

  // Brief red vignette when the player clips a hazard block.
  const [hazardFlash, setHazardFlash] = useState(false);
  const hazardFlashTimer = useRef<number | null>(null);

  const handleScreenshot = () => {
    screenshotRequested.current = true;
  };

  const downloadPhoto = (p: { url: string; time: number }) => {
    const link = document.createElement('a');
    link.href = p.url;
    link.download = `nebula_rush_${Math.round(p.time * 1000)}.png`;
    link.click();
  };

  // Bundle every shot into one .zip → a single download, so the browser never
  // shows the "allow multiple downloads" prompt or silently drops files.
  const downloadAllPhotos = async () => {
    const items = photosRef.current;
    if (items.length === 0) return;
    const entries = await Promise.all(
      items.map(async (p, i) => ({
        name: `nebula_rush_photo_${String(i + 1).padStart(2, '0')}.png`,
        data: new Uint8Array(await p.blob.arrayBuffer()),
      }))
    );
    const url = URL.createObjectURL(createStoredZip(entries));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nebula_rush_photos.zip';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); // revoke after the download starts
  };

  const restartRace = () => {
    // Ideally reload page or reset state
    window.location.reload();
  };

  // Revoke captured-photo object URLs (and the toast timer) on unmount.
  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
      if (photoToastTimer.current) clearTimeout(photoToastTimer.current);
      if (hazardFlashTimer.current) clearTimeout(hazardFlashTimer.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        handleScreenshot();
      }
      // CHEAT: Force Finish
      if (e.key === 'f' || e.key === 'F') {
        if (playerShip.current) {
          playerShip.current.lap = 6;
          playerShip.current.finished = true;
          playerShip.current.finishTime = gameTimeRef.current;
        }
      }
      // CHEAT: Force Finish All Opponents
      if (e.key === 'g' || e.key === 'G') {
        if (opponentManager.current) {
          opponentManager.current.opponents.forEach(o => {
            o.lap = 6;
            o.finished = true;
            o.finishTime = gameTimeRef.current + Math.random() * 10000;
          });
        }
      }
      // Toggle HUD
      if (e.key === 'h' || e.key === 'H') {
        setHudVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);


    // Subscribe to Music Changes
    setCurrentMusicTrackName(audioManager.getCurrentTrackName()); // Set initial
    audioManager.setTrackChangeListener((name) => {
      setCurrentMusicTrackName(name);
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      audioManager.setTrackChangeListener(() => { }); // Clear listener
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    // Reset timer on mount
    gameTimeRef.current = 0;
    lapStartGameTime.current = 0;

    // Scene setup
    if (mountRef.current) {
      while (mountRef.current.firstChild) {
        mountRef.current.removeChild(mountRef.current.firstChild);
      }
    }
    if (minimapRef.current) {
      while (minimapRef.current.firstChild) {
        minimapRef.current.removeChild(minimapRef.current.firstChild);
      }
    }

    let animationId: number;
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      6000 // Massive far clipping plane
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      preserveDrawingBuffer: true // Required for screenshots
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mountRef.current.appendChild(renderer.domElement);

    // PBR image-based lighting. RoomEnvironment is a procedural studio scene;
    // PMREM filters it into a mipmapped cubemap usable by MeshStandardMaterial.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Creates Player Ship with Pilot Modifiers
    let finalShipConfig = { ...shipConfig };

    if (pilot) {
      finalShipConfig.name = pilot.name;
      finalShipConfig.id = pilot.id;

      // Apply Stats
      // Acceleration: +/- 10% per point
      if (pilot.stats.acceleration !== 0) {
        // Base accelFactor is around 0.5 - 0.9.
        // Let's being conservative: 5% per point.
        const modifier = 1 + (pilot.stats.acceleration * 0.05);
        finalShipConfig.accelFactor *= modifier;
      }

      // Handling: +/- 10% per point to turnSpeed
      if (pilot.stats.handling !== 0) {
        const modifier = 1 + (pilot.stats.handling * 0.1);
        finalShipConfig.turnSpeed *= modifier;
        // Also affect strafe speed slightly?
        finalShipConfig.strafeSpeed *= modifier;
      }

      // Velocity: Modifies Friction (Top Speed)
      // Base friction is 0.99.
      // +2 Velocity = 0.992 (Less drag)
      // -2 Velocity = 0.988 (More drag)
      if (pilot.stats.velocity !== 0) {
        // Friction is 0-1, closer to 1 is less drag.
        // We add/subtract a tiny amount.
        finalShipConfig.friction += (pilot.stats.velocity * 0.0002);
      }
    }

    // Initialize Player Ship
    playerShip.current = new Ship(scene, true, finalShipConfig);

    // Track Setup
    const trackCurve = createTrackCurve(currentTrack.points);
    const trackLength = trackCurve.getLength();
    const trackMesh = createTrackMesh(trackCurve, currentTrack.surface);
    scene.add(trackMesh);

    // Environment Setup (Must be after trackCurve creation to place glowglobes)
    const envManager = new EnvironmentManager(scene);
    environmentManagerRef.current = envManager;
    const envConfig = forcedEnvironment || EnvironmentManager.generateRandomConfig();
    envManager.setup(envConfig, trackCurve, currentTrack.id);
    setEnvironment(envConfig);

    // Background depth cues (grid floor + pillars + ship blob shadow) so the
    // track's rises/dips read. Opt-in per track (see TrackConfig.depthCues).
    if (currentTrack.depthCues) {
      const worldRef = new WorldReference(scene);
      worldRef.setup(trackCurve, currentTrack.surface?.accent ?? 0x3388ff);
      worldReferenceRef.current = worldRef;
    } else {
      worldReferenceRef.current = null;
    }

    // Create Boost Pads
    const boostPads = createBoostPadMeshes(trackCurve, currentTrack.pads);
    boostPads.forEach(mesh => scene.add(mesh));

    // Create Hazards (blocks / slick patches)
    const hazardMeshes = createHazardMeshes(trackCurve, currentTrack.hazards ?? []);
    hazardMeshes.forEach(obj => scene.add(obj));

    // Create Traffic Light
    const trafficLight = createTrafficLightMesh();
    trafficLightRef.current = trafficLight;

    const startFrame = getTrackFrame(trackCurve, PLAYER_START_T);
    // Align to track. Use a fixed world-units offset (not a track-progress offset)
    // so the light sits the same distance ahead of the ship regardless of track scale.
    trafficLight.position.copy(startFrame.position);
    trafficLight.position.add(startFrame.normal.clone().multiplyScalar(100)); // up
    trafficLight.position.add(startFrame.tangent.clone().multiplyScalar(400)); // forward

    trafficLight.lookAt(startFrame.position.clone().add(startFrame.normal.clone().multiplyScalar(100)));
    scene.add(trafficLight);

    // Initial State Timing
    // START DELAY: Add 1.5s buffer before countdown starts to allow loading screen to fade
    const START_DELAY = 1500;
    countdownStartTime.current = Date.now() + START_DELAY;

    raceStartedRef.current = false;
    countdownRef.current = 7;
    setCountdown(7);

    // Create Start Line
    const startLine = createStartLineMesh(trackCurve);
    scene.add(startLine);

    // Create minimap
    const minimapCanvas = document.createElement('canvas');
    minimapCanvas.width = 200;
    minimapCanvas.height = 200;
    const minimapCtx = minimapCanvas.getContext('2d');

    // Draw track on minimap
    const drawMinimap = () => {
      if (!minimapCtx) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, scale: 1 };

      minimapCtx.fillStyle = '#000033';
      minimapCtx.fillRect(0, 0, 200, 200);

      // Find track bounds
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const point = trackCurve.getPoint(i / 100);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
      }

      const scaleX = 180 / (maxX - minX);
      const scaleZ = 180 / (maxZ - minZ);
      const scale = Math.min(scaleX, scaleZ);

      // Draw track path
      minimapCtx.strokeStyle = '#2244aa';
      minimapCtx.lineWidth = 3;
      minimapCtx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const point = trackCurve.getPoint(i / 200);
        const x = 100 + (point.x - (minX + maxX) / 2) * scale;
        const z = 100 + (point.z - (minZ + maxZ) / 2) * scale;
        if (i === 0) minimapCtx.moveTo(x, z);
        else minimapCtx.lineTo(x, z);
      }
      minimapCtx.stroke();

      // Draw start line
      const startPoint = trackCurve.getPoint(0);
      const startX = 100 + (startPoint.x - (minX + maxX) / 2) * scale;
      const startZ = 100 + (startPoint.z - (minZ + maxZ) / 2) * scale;
      minimapCtx.fillStyle = '#ffff00';
      minimapCtx.fillRect(startX - 3, startZ - 3, 6, 6);

      return { minX, maxX, minZ, maxZ, scale };
    };

    const minimapBounds = drawMinimap();
    if (minimapRef.current) {
      minimapRef.current.appendChild(minimapCanvas);
    }

    const updateMinimapShip = () => {
      if (!minimapCtx || !playerShip.current) return;

      const progress = playerShip.current.state.trackProgress;
      const point = trackCurve.getPoint(progress);
      const x = 100 + (point.x - (minimapBounds.minX + minimapBounds.maxX) / 2) * minimapBounds.scale;
      const z = 100 + (point.z - (minimapBounds.minZ + minimapBounds.maxZ) / 2) * minimapBounds.scale;

      // Redraw minimap
      drawMinimap();

      // Draw ship position
      minimapCtx.fillStyle = '#ff00ff';
      minimapCtx.beginPath();
      minimapCtx.arc(x, z, 4, 0, Math.PI * 2);
      minimapCtx.fill();
    };



    // Input handling
    const inputManager = new InputManager();

    // Opponent Manager
    // Always create a new manager because 'scene' is new on every mount/effect run.
    opponentManager.current = new OpponentManager(scene, trackCurve, roster);



    // Animation loop
    let lastTime = performance.now();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (!playerShip.current) return;

      const now = performance.now();
      const deltaMs = now - lastTime;
      lastTime = now;

      // Calculate dt (delta time) as actual time elapsed, normalized to 60 FPS baseline
      // At 60 FPS: deltaMs ≈ 16.67ms → dt = 1.0
      // At 144 FPS: deltaMs ≈ 6.94ms → dt = 1.0 (capped to prevent running faster)
      // This ensures physics runs at consistent speed regardless of frame rate
      const dt = Math.min(deltaMs / 16.67, 1.0); // Cap at 1.0 to prevent speed-up on high refresh rates

      const currentState = playerShip.current.state;

      // Accumulate game time (only when race is running)
      if (raceStartedRef.current) {
        gameTimeRef.current += deltaMs;
      }

      // --- RACE START LOGIC ---
      if (!raceStartedRef.current) {
        playerShip.current.state.velocity.set(0, 0);
        playerShip.current.state.throttle = 0;

        // Update Countdown Timer
        const timeRemaining = Math.max(0, 7000 - (Date.now() - countdownStartTime.current));
        const seconds = Math.ceil(timeRemaining / 1000);

        if (seconds !== countdownRef.current) {
          countdownRef.current = seconds;
          setCountdown(seconds);

          // Play countdown sound for each second (5, 4, 3, 2, 1)
          if (seconds > 0 && seconds <= 5) {
            audioManager.playCountdown();
          } else if (seconds === 0) {
            audioManager.playRaceStart();
          }

          // Traffic Light Visuals
          if (trafficLightRef.current) {
            // Reset all to grey
            trafficLightRef.current.children.forEach((child) => {
              if (child instanceof THREE.Mesh && child.name.startsWith('light_')) {
                // 0=Box, 1=Light5(Top), 2=Light4, 3=Light3, 4=Light2, 5=Light1(Bottom)
                if (child.material instanceof THREE.MeshBasicMaterial) {
                  child.material.color.setHex(0x222222);
                }
              }
            });

            // Light Logic:
            // 5 Seconds: Top Red On (Light 5)
            // 4 Seconds: Top 2 Red On (Light 5, 4)
            // ...
            // 1 Second: All 5 Red On
            // 0 Seconds: All GREEN

            // The children order depends on addition order. 
            // Box is 0. Light5 is 1. Light4 is 2... Light1 is 5.

            if (seconds > 0) {
              const lightsToTurnOn = 6 - seconds; // 5s->1, 4s->2, 3s->3, 2s->4, 1s->5
              for (let i = 1; i <= lightsToTurnOn; i++) {
                const child = trafficLightRef.current.children[i] as THREE.Mesh;
                if (child && child.material instanceof THREE.MeshBasicMaterial) {
                  child.material.color.setHex(0xff0000); // RED
                }
              }
            } else {
              // GO! Green!
              trafficLightRef.current.children.forEach((child) => {
                if (child instanceof THREE.Mesh && child.name.startsWith('light_') && child.material instanceof THREE.MeshBasicMaterial) {
                  child.material.color.setHex(0x00ff00); // GREEN
                }
              });
            }
          }
        }

        if (timeRemaining <= 0) {
          raceStartedRef.current = true;
          setRaceState('racing');
          gameTimeRef.current = 0;  // Reset game time when race starts
          lapStartGameTime.current = 0;

          // Start random race music ONLY if not already playing
          if (!audioManager.isPlaying()) {
            audioManager.playRandomRaceMusic();
          }
          audioManager.playEngineRumble();

          // Fly Away Animation
          const light = trafficLightRef.current;
          if (light) {
            const flyAway = () => {
              if (!mountRef.current) return;
              light.position.y += 0.5;
              light.position.z -= 1.0;
              if (light.position.y < 100) {
                requestAnimationFrame(flyAway);
              } else {
                light.visible = false;
              }
            };
            flyAway();
          }
        }
      }

      // --- PLAYER UPDATE ---
      // If player finished, they can still move? Or auto-pilot?
      // For now, let them drive but ignoring laps.
      playerShip.current.update(dt, inputManager, trackLength, currentTrack.pads, (msg: any) => {
        if (msg === "HAZARD") {
          setHazardFlash(true);
          if (hazardFlashTimer.current) clearTimeout(hazardFlashTimer.current);
          hazardFlashTimer.current = window.setTimeout(() => setHazardFlash(false), 250);
          return;
        }
        if (msg === "INCREMENT") {
          setLap(l => l + 1);
          // Record Lap Time
          if (raceStartedRef.current && !raceFinishedRef.current) {
            setLastLapTime(gameTimeRef.current - lapStartGameTime.current);
            lapStartGameTime.current = gameTimeRef.current;
          }
        } else if (typeof msg === 'number') {
          setLap(msg);
        }

        // Check for Player Finish
        if (!raceFinishedRef.current && playerShip.current?.finished) {
          raceFinishedRef.current = true;
          setRaceState('finished');
          audioManager.playRaceFinish();
          audioManager.stopEngineRumble();
        }

      }, raceStartedRef.current, gameTimeRef.current, currentTrack.hazards ?? []);

      if (!raceFinishedRef.current && raceStartedRef.current) {
        const currentLapTime = gameTimeRef.current - lapStartGameTime.current;
        if (timeRef.current) {
          timeRef.current.textContent = `TIME: ${formatTime(currentLapTime)}`;
        }
      }

      // --- OPPONENT UPDATE ---
      if (opponentManager.current) {
        if (raceStartedRef.current) {
          opponentManager.current.update(dt, trackLength, currentTrack.pads, raceStartedRef.current, gameTimeRef.current, currentTrack.hazards ?? []);
        }
      }

      // --- RANKING & FINISH LOGIC ---
      if (playerShip.current && opponentManager.current) {
        const allShips = [playerShip.current, ...opponentManager.current.opponents];

        // Sorting Logic:
        // 1. Finished ships first (sorted by finishTime ASC)
        // 2. Unfinished ships second(sorted by totalProgress DESC)

        allShips.sort((a, b) => {
          if (a.finished && b.finished) {
            return a.finishTime - b.finishTime;
          }
          if (a.finished) return -1; // a comes first
          if (b.finished) return 1;  // b comes first

          return b.getTotalProgress() - a.getTotalProgress();
        });

        // Update Rank Display
        const playerRank = allShips.findIndex(s => s === playerShip.current) + 1;
        if (rankRef.current) {
          rankRef.current.textContent = `RANK: ${playerRank} / ${opponentManager.current.opponents.length + 1}`;
        }

        if (playerShip.current.finished && finalRank === null) {
          setFinalRank(playerRank);
        }
        // setRank(playerRank);

        // Check if EVERYONE is finished
        // Optimization: allShips[totalShips-1].finished is enough check if sorted correctly?
        // Safe check:
        const allDone = allShips.every(s => s.finished);

        if (allDone && !allFinishedRef.current) {
          allFinishedRef.current = true;
          setRaceState('results');

          // GENERATE RESULTS
          const results: RaceResult[] = allShips.map((ship, index) => {
            const rank = index + 1;
            const points = POINTS_TABLE[rank - 1] || 0;

            // Calculate Time from RaceStart
            // finishTime is now game time in ms (not wall-clock timestamp)
            const totalTime = ship.finishTime;

            // Current Campaign Total (before this race)
            const currentTotal = campaignScores[ship.id] || 0;
            const newTotal = currentTotal + points;

            return {
              id: ship.id,
              rank: rank,
              name: ship.name,
              isPlayer: ship.isPlayer,
              timeStr: formatTime(totalTime),
              points: points,
              totalPoints: newTotal
            };
          });

          // Update Campaign Scores Logic
          const updatedScores: Record<string, number> = { ...campaignScores };

          results.forEach((r, i) => {
            const ship = allShips[i]; // Determined by sort order, same as map above
            updatedScores[ship.id] = (updatedScores[ship.id] || 0) + r.points;
          });

          setCampaignScores(updatedScores);
          setRaceResults(results);
        }
      }

      // --- MESH UPDATE ---
      const { position: trackPos, tangent, normal, binormal: trackBinormal } = getTrackFrame(trackCurve, currentState.trackProgress);

      playerShip.current.updateMesh(trackCurve);

      // --- Camera Update ---
      const cameraFollowRatio = 0.0;
      const effectiveVerticalPos = currentState.verticalPosition * cameraFollowRatio;
      const visualLateralPos = currentState.cameraLateral;

      // Camera follows only part of the yaw, so the ship's nose (rotated by the
      // full yaw in updateMesh) visibly swings toward your steer instead of the
      // camera turning with it. Keeps the world mostly stable.
      const CAMERA_YAW_FOLLOW = 0.5;
      const cameraForward = tangent.clone().applyAxisAngle(normal, currentState.yaw * CAMERA_YAW_FOLLOW).normalize();
      const cameraDist = 12;
      const cameraHeightBase = 5;

      const targetCameraPos = trackPos.clone()
        .add(trackBinormal.clone().multiplyScalar(visualLateralPos))
        .add(normal.clone().multiplyScalar(effectiveVerticalPos + cameraHeightBase))
        .add(cameraForward.clone().multiplyScalar(-cameraDist));

      if (!isNaN(targetCameraPos.x) && !isNaN(targetCameraPos.y) && !isNaN(targetCameraPos.z)) {
        // Lock camera rigidly to ship at high speeds to prevent "Ghosting" / Temporal Aliasing.
        // If the ship moves 100 pixels/frame across the screen, it appears as double vision.
        // By locking the camera, the ship is static on screen, and the world moves.
        camera.position.copy(targetCameraPos);

        // Old Smooth Follow (caused ghosting at >600km/h)
        // camera.position.lerp(targetCameraPos, 0.8);

        const lookAtTarget = playerShip.current.mesh.position.clone().add(cameraForward.clone().multiplyScalar(20));
        camera.lookAt(lookAtTarget);
        camera.up.copy(normal);
      } else {
        camera.position.copy(trackPos.clone().add(normal.multiplyScalar(5)));
      }

      // setSpeed(Math.round(currentState.velocity.y * 10));
      if (speedRef.current) {
        speedRef.current.textContent = `${Math.round(currentState.velocity.y * 10)} km/h`;
      }

      if (debugTrackProgressRef.current) {
        const progress = (lap === 0 && currentState.trackProgress > 50)
          ? (currentState.trackProgress - 100)
          : currentState.trackProgress;
        debugTrackProgressRef.current.textContent = `Track Progress: ${progress.toFixed(1)}%`;
      }

      if (debugPositionRef.current) {
        debugPositionRef.current.textContent = `Position: (${currentState.lateralPosition.toFixed(1)}, ${currentState.verticalPosition.toFixed(1)})`;
      }

      envManager.update(dt, playerShip.current.mesh.position);
      worldReferenceRef.current?.update(playerShip.current.mesh.position);

      updateMinimapShip();
      renderer.render(scene, camera);

      if (screenshotRequested.current) {
        screenshotRequested.current = false;
        // Capture the just-rendered frame into memory. toBlob snapshots the
        // canvas now but encodes asynchronously, so there's no main-thread PNG
        // hitch mid-race; downloads happen later from the results gallery.
        renderer.domElement.toBlob((blob) => {
          if (!blob) return;
          const entry: Photo = { url: URL.createObjectURL(blob), blob, time: gameTimeRef.current };
          const next = [...photosRef.current, entry];
          if (next.length > MAX_PHOTOS) {
            URL.revokeObjectURL(next[0].url); // drop & free the oldest
            next.shift();
          }
          photosRef.current = next;
          setPhotos(next);
          setPhotoToast(true);
          if (photoToastTimer.current) clearTimeout(photoToastTimer.current);
          photoToastTimer.current = window.setTimeout(() => setPhotoToast(false), 1200);
        }, 'image/png');
      }
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      inputManager.cleanup();
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      scene.environment?.dispose();
      renderer.dispose();

      if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }

      // Stop engine sound on unmount
      audioManager.stopEngineRumble();
    };
  }, [currentTrackIndex]);

  // Notify parent that we are ready to be shown
  useEffect(() => {
    if (onReady) {
      // Small timeout to ensure first frame might have rendered or at least logic is set
      setTimeout(() => onReady(), 100);
    }
  }, [onReady, currentTrackIndex]);

  const handleNextRace = () => {
    if (currentTrackIndex < TRACKS.length - 1) {
      // Reset State
      if (speedRef.current) speedRef.current.textContent = "0 km/h";
      setLap(0);
      setFinalRank(null);
      if (rankRef.current) rankRef.current.textContent = "RANK: 1 / 20";
      // setRank(1);
      setHudVisible(true);
      setRaceState('intro');
      setCountdown(7);
      setRaceResults([]);
      raceStartedRef.current = false;
      raceFinishedRef.current = false;
      allFinishedRef.current = false;

      setLastLapTime(0); // Reset Last Lap Display
      setCurrentTrackIndex(prev => prev + 1);
    }
  };

  return (
    <div className="w-full h-screen bg-black relative overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      {tutorial && (
        <TutorialOverlay shipRef={playerShip} raceStartedRef={raceStartedRef} onDone={() => onExit?.()} />
      )}

      {/* Hazard hit flash — red vignette when a block clips the player. */}
      {hazardFlash && (
        <div
          className="absolute inset-0 z-30 pointer-events-none"
          style={{ boxShadow: 'inset 0 0 140px 50px rgba(255,0,0,0.55)' }}
        />
      )}

      {/* LIGHTING DEBUG OVERLAY */}
      {debugLighting && (
        <DebugLightingPanel envManagerRef={environmentManagerRef} />
      )}

      {/* UI Overlay Container for Screenshots */}
      <div className="absolute inset-0 pointer-events-none">

        {/* HUD - Hide on Results or Toggle */}
        {/* HUD Removed (Consolidated) */}

        {/* Waiting Overlay */}
        {raceState === 'finished' && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-40">
            <div className="text-white px-8 py-4 rounded-lg border animate-pulse" style={{ backgroundColor: 'rgba(0,0,0,0.8)', borderColor: '#eab308' }}>
              <div className="text-3xl font-bold text-center" style={{ color: '#eab308' }}>FINISHED!</div>
              <div className="text-xl text-center mt-2">Waiting for opponents...</div>
              <div className="text-4xl font-bold text-center mt-2" style={{ color: '#22d3ee' }}>Rank: {finalRank}</div>
            </div>
          </div>
        )}

        {/* Leaderboard Overlay */}
        {raceState === 'results' && (
          <div className="pointer-events-auto">
            <Leaderboard
              results={raceResults}
              onRestart={restartRace}
              onNextRace={
                isCampaign && currentTrackIndex < TRACKS.length - 1
                  ? handleNextRace
                  : undefined
              }
              onExit={onExit}
              isCampaign={isCampaign}
              photos={photos}
              onDownloadPhoto={downloadPhoto}
              onDownloadAll={downloadAllPhotos}
              onTutorial={onTutorial}
              showTutorialHint={finalRank !== null && opponentCount >= 3 && finalRank >= opponentCount + 1 - 2}
            />
          </div>
        )}

        {/* Capture confirmation toast (works regardless of HUD visibility) */}
        {photoToast && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-cyan-200 font-bold pointer-events-none" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            📷 Photo saved ({photos.length})
          </div>
        )}

        {/* Countdown Overlay (Only shows if > 0 and not started) */}
        {!raceFinishedRef.current && hudVisible && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Top Right: Music Track */}
            {currentMusicTrackName && (
              <div className="absolute top-8 right-8 text-right animate-pulse p-3 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <div className="text-lg font-bold text-purple-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  🎵 {currentMusicTrackName}
                </div>
              </div>
            )}

            {/* Bottom Left: Rank */}
            <div ref={rankRef} className="absolute bottom-8 left-8 text-6xl font-black italic text-white drop-shadow-[0_4px_8px_rgba(0,0,0,1)]">
              RANK: 1 / {opponentCount + 1}
            </div>
            {/* Bottom Centre: primary readouts (speed + lap + time) near the line of sight */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <div ref={speedRef} className="text-6xl font-black italic text-cyan-400 drop-shadow-[0_4px_8px_rgba(0,0,0,1)]">
                0 km/h
              </div>
              <div className="flex items-baseline gap-6 mt-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                <span className="text-2xl font-bold text-white">LAP: {Math.max(1, Math.min(lap, 5))} / 5</span>
                <span ref={timeRef} className="text-2xl font-bold text-yellow-400">TIME: 00:00.00</span>
              </div>
              {lastLapTime > 0 && (
                <span className="text-lg font-bold text-green-400 mt-0.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                  LAST: {formatTime(lastLapTime)}
                </span>
              )}
            </div>
            {/* Bottom Right: Minimap */}
            <div className="absolute bottom-8 right-8 p-2 rounded z-10" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
              <div className="text-white text-xs mb-1">MINIMAP</div>
              <div ref={minimapRef} className="border-2" style={{ borderColor: '#22d3ee' }}></div>
            </div>

            {/* Debug Info (Top Right) - HIDDEN */}
            {/* <div className="absolute top-8 right-8 text-white font-mono text-xs p-2 rounded z-10" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <div ref={debugTrackProgressRef}>Track Progress: 0.0%</div>
              <div ref={debugPositionRef}>Position: (0.0, 0.0)</div>
            </div> */}

            {/* Track Info (Top Center) */}
            <div className="absolute top-8 left-1/2 transform -translate-x-1/2 text-white text-lg font-bold italic drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] p-3 rounded-lg text-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              TRACK: {currentTrack.name}
              {environment && (
                <div className="text-xs text-cyan-200 mt-1 font-normal opacity-80">
                  {environment.timeOfDay.toUpperCase()} | {environment.weather.toUpperCase()}
                </div>
              )}
            </div>
          </div>
        )}

        {!raceStartedRef.current && countdown > 0 && countdown <= 5 && (
          <div className="absolute inset-0 flex items-center justify-center z-40">
            <div className="text-9xl font-bold animate-pulse drop-shadow-lg" style={{ color: '#ef4444' }}>
              {countdown}
            </div>
          </div>
        )}
        {!raceStartedRef.current && countdown === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-40">
            <div className="text-9xl font-bold animate-pulse drop-shadow-lg" style={{ color: '#22c55e' }}>
              GO!
            </div>
          </div>
        )}

        {/* Debug Info & Minimap - Consolidated into Main HUD */}
      </div>
    </div>
  );
};
