import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createShip, type ShipType } from '../game/ShipFactory';

interface ShipPreviewProps {
    color: number;
    type: ShipType;
    accentColor?: number; // Secondary livery color (wings/trim)
    interactive?: boolean; // NEW: Enable manual rotation
}

export default function ShipPreview({ color, type, accentColor, interactive = false }: ShipPreviewProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const frameIdRef = useRef<number>(0);

    // Interaction Refs
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    // Persist rotation across re-mounts (e.g. when the user picks a new paint color
    // the effect re-runs and rebuilds the scene; without this the ship would snap
    // back to its starting angle every swatch click).
    const rotationRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const container = mountRef.current;
        if (!container) return;

        // 1. Scene Setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Camera
        const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
        camera.position.set(5, 4, 8); // Offset view
        camera.lookAt(0, 0, 0);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // IBL for PBR materials. Without this, MeshStandardMaterial has nothing
        // to reflect, so metals render dark and low-roughness glass loses its
        // glassy look.
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        pmremGenerator.dispose();

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 10, 5);
        scene.add(dirLight);

        // Ship Mesh
        const { mesh } = createShip(color, type, accentColor);
        scene.add(mesh);

        // Center the ship visually
        mesh.position.set(0, -0.5, 0);

        // Initial Rotation for nice angle (or restore previous if user has dragged)
        if (interactive) {
            if (rotationRef.current) {
                mesh.rotation.x = rotationRef.current.x;
                mesh.rotation.y = rotationRef.current.y;
            } else {
                mesh.rotation.y = -Math.PI / 4;
            }
        }

        // --- INTERACTION HANDLERS ---
        const handleMouseDown = (e: MouseEvent) => {
            if (!interactive) return;
            e.preventDefault(); // Prevent text selection/dragging behavior
            isDraggingRef.current = true;
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
            container.style.cursor = 'grabbing';
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!interactive || !isDraggingRef.current) return;

            const deltaX = e.clientX - lastMouseRef.current.x;
            const deltaY = e.clientY - lastMouseRef.current.y;

            lastMouseRef.current = { x: e.clientX, y: e.clientY };

            // Rotate mesh
            // Drag X -> Rotate Y axis
            // Drag Y -> Rotate X axis
            mesh.rotation.y += deltaX * 0.01;
            mesh.rotation.x += deltaY * 0.01;
            rotationRef.current = { x: mesh.rotation.x, y: mesh.rotation.y };
        };

        const handleMouseUp = () => {
            if (!interactive) return;
            isDraggingRef.current = false;
            container.style.cursor = 'grab';
        };

        if (interactive) {
            container.addEventListener('mousedown', handleMouseDown);
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            container.style.cursor = 'grab';
        }

        // Animation Loop
        const animate = () => {
            if (!renderer) return;

            if (!interactive) {
                // Auto-spin for non-interactive (small previews)
                mesh.rotation.y += 0.01;
                // Wobble
                mesh.rotation.z = Math.sin(Date.now() * 0.002) * 0.05;
            } else {
                // Slight floating wobble for interactive too, adds life
                // But don't mess with rotation X/Y too much
                // mesh.position.y = -0.5 + Math.sin(Date.now() * 0.001) * 0.1;
            }

            renderer.render(scene, camera);
            frameIdRef.current = requestAnimationFrame(animate);
        };
        animate();

        // Handle Resize
        const handleResize = () => {
            if (!container || !renderer) return;
            const width = container.clientWidth;
            const height = container.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            cancelAnimationFrame(frameIdRef.current);
            window.removeEventListener('resize', handleResize);

            if (interactive) {
                container.removeEventListener('mousedown', handleMouseDown);
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            }

            if (renderer.domElement) {
                container.removeChild(renderer.domElement);
            }
            scene.environment?.dispose();
            renderer.dispose();
        };
    }, [color, accentColor, interactive, type]); // Rebuild when colors or type change

    return (
        <div ref={mountRef} className="w-full h-full" />
    );
}
