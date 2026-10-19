import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let scene, camera, renderer, controls, composer, bloomPass;
let animatedObjects = [];
let interactableObjects = [];
let clock = new THREE.Clock();
let sunLight, ambientLight, fillLight;

// Interactive Inspection State
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let pointerDownPos = new THREE.Vector2();
let isCameraLerping = false;
let cameraTargetPos = new THREE.Vector3();
let controlsTargetPos = new THREE.Vector3();
const defaultCameraPos = new THREE.Vector3(16, 10, 24);
const defaultControlsTarget = new THREE.Vector3(0, 3, 0);

// Simulation State
let windSpeedFactor = 1.0;
let timeOfDayFactor = 0.3; // 0.0 = Midnight, 0.25 = Dawn, 0.5 = Noon, 0.75 = Sunset
let isTimeCycleActive = true;
let timeCycleSpeed = 0.02; // Cycle speed per second
let isAnimationPaused = false;
let selectedObject = null;
let windowLights = [];

// Color Palette Configuration
const COLORS = {
    fogNight: 0x080608,
    fogSunset: 0x1c120c,
    fogDay: 0x3d4b54,
    skyNight: 0x080608,
    skySunset: 0x1c120c,
    skyDay: 0x485863,
    rustRed: 0x9e3a2b,
    weatheredWood: 0x4a3b32,
    woodDark: 0x2e231d,
    creamWall: 0xe8dcc4,
    stoneBase: 0x3d3935,
    stonePath: 0x5a524a,
    warmGlow: 0xffa043,
    chimneySmoke: 0x8a7f77,
    foliageGreen: 0x3a4f29,
    foliageAutumn: 0xa85d2a,
    foliageLush: 0x2d4220,
    patchGrass: 0x2c3b20,
    patchMud: 0x302319,
    metalBronze: 0x8c6239
};

function init() {
    const container = document.getElementById('canvas-container');

    // Scene Creation
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.skySunset);
    
    // Warm Atmospheric Exponential Fog
    scene.fog = new THREE.FogExp2(COLORS.fogSunset, 0.022);

    // Camera Setup
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.copy(defaultCameraPos);

    // Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.02;
    controls.minDistance = 4;
    controls.maxDistance = 60;
    controls.target.copy(defaultControlsTarget);

    // Post-Processing (EffectComposer & UnrealBloomPass)
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.85,  // Bloom Strength
        0.4,   // Radius
        0.82   // Threshold
    );
    composer.addPass(bloomPass);

    setupLighting();
    buildTerrain();
    buildWindmill();
    buildFarmhouse();
    buildDecorations();
    setupUIAndInteraction();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function setupLighting() {
    // Soft ambient light
    ambientLight = new THREE.AmbientLight(0x4a3525, 1.2);
    scene.add(ambientLight);

    // Key Directional Light (Warm Sunset Sun)
    sunLight = new THREE.DirectionalLight(0xffcd94, 3.2);
    sunLight.position.set(20, 25, 15);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 70;
    sunLight.shadow.camera.left = -25;
    sunLight.shadow.camera.right = 25;
    sunLight.shadow.camera.top = 25;
    sunLight.shadow.camera.bottom = -25;
    sunLight.shadow.bias = -0.0003;
    scene.add(sunLight);

    // Soft Fill Light from opposite direction
    fillLight = new THREE.DirectionalLight(0x52687d, 0.8);
    fillLight.position.set(-20, 15, -15);
    scene.add(fillLight);
}

function buildTerrain() {
    // Main Ground Mesh
    const groundGeo = new THREE.PlaneGeometry(100, 100, 48, 48);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x241a13,
        roughness: 0.95,
        metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Patch Terrain Overlay (Multi-colored grass and mud patches)
    const patchCount = 28;
    const patchColors = [COLORS.patchGrass, COLORS.patchMud, 0x3d2b1f, 0x223019];
    
    for (let i = 0; i < patchCount; i++) {
        const sizeX = 4 + Math.random() * 8;
        const sizeZ = 4 + Math.random() * 8;
        const patchGeo = new THREE.PlaneGeometry(sizeX, sizeZ);
        const patchMat = new THREE.MeshStandardMaterial({
            color: patchColors[Math.floor(Math.random() * patchColors.length)],
            roughness: 0.9,
            metalness: 0.05
        });
        const patch = new THREE.Mesh(patchGeo, patchMat);
        patch.rotation.x = -Math.PI / 2;
        patch.rotation.z = Math.random() * Math.PI;
        
        const angle = Math.random() * Math.PI * 2;
        const dist = 3 + Math.random() * 22;
        patch.position.set(Math.cos(angle) * dist, 0.01 + i * 0.001, Math.sin(angle) * dist);
        patch.receiveShadow = true;
        scene.add(patch);
    }

    // Winding Stone Pathway
    const pathPoints = [
        new THREE.Vector3(-8, 0.03, 2),
        new THREE.Vector3(-4, 0.03, 3.5),
        new THREE.Vector3(0, 0.03, 3.8),
        new THREE.Vector3(4, 0.03, 3.6),
        new THREE.Vector3(7, 0.03, 3.5),
        new THREE.Vector3(10, 0.03, 5)
    ];

    const stoneMat = new THREE.MeshStandardMaterial({ color: COLORS.stonePath, roughness: 0.85, metalness: 0.1 });
    for (let i = 0; i < pathPoints.length - 1; i++) {
        const start = pathPoints[i];
        const end = pathPoints[i + 1];
        const steps = 8;
        
        for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const stoneX = THREE.MathUtils.lerp(start.x, end.x, t) + (Math.random() - 0.5) * 0.4;
            const stoneZ = THREE.MathUtils.lerp(start.z, end.z, t) + (Math.random() - 0.5) * 0.4;
            
            const stoneRadius = 0.35 + Math.random() * 0.3;
            const stoneGeo = new THREE.CylinderGeometry(stoneRadius, stoneRadius * 1.1, 0.08, 7);
            const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat);
            stoneMesh.position.set(stoneX, 0.04, stoneZ);
            stoneMesh.rotation.y = Math.random() * Math.PI;
            stoneMesh.scale.set(1 + Math.random() * 0.2, 1, 0.8 + Math.random() * 0.4);
            stoneMesh.receiveShadow = true;
            stoneMesh.castShadow = true;
            scene.add(stoneMesh);
        }
    }
}

function buildWindmill() {
    const windmillGroup = new THREE.Group();
    windmillGroup.position.set(-8, 0, -2);

    // Materials
    const creamMat = new THREE.MeshStandardMaterial({ color: COLORS.creamWall, roughness: 0.7 });
    const woodMat = new THREE.MeshStandardMaterial({ color: COLORS.weatheredWood, roughness: 0.8 });
    const rustMat = new THREE.MeshStandardMaterial({ color: COLORS.rustRed, roughness: 0.6 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: COLORS.woodDark, roughness: 0.9 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: COLORS.stoneBase, roughness: 0.85 });

    // Base Stone Foundation
    const baseGeo = new THREE.CylinderGeometry(3.6, 4.0, 1.5, 16);
    const baseMesh = new THREE.Mesh(baseGeo, stoneMat);
    baseMesh.position.y = 0.75;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    windmillGroup.add(baseMesh);

    // Main Tapered Cylindrical Tower Wall
    const towerGeo = new THREE.CylinderGeometry(2.6, 3.4, 9, 16);
    const towerMesh = new THREE.Mesh(towerGeo, creamMat);
    towerMesh.position.y = 6;
    towerMesh.castShadow = true;
    towerMesh.receiveShadow = true;
    windmillGroup.add(towerMesh);

    // Wood Beam Trim Rings
    const ringGeo = new THREE.TorusGeometry(3.05, 0.12, 8, 24);
    const ringMesh = new THREE.Mesh(ringGeo, woodMat);
    ringMesh.position.y = 4.2;
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.castShadow = true;
    windmillGroup.add(ringMesh);

    // Conical Rust-Red Roof
    const roofGeo = new THREE.ConeGeometry(3.1, 3.5, 16);
    const roofMesh = new THREE.Mesh(roofGeo, rustMat);
    roofMesh.position.y = 12.25;
    roofMesh.castShadow = true;
    windmillGroup.add(roofMesh);

    // Windmill Door
    const doorGeo = new THREE.BoxGeometry(1.0, 2.0, 0.15);
    const doorMesh = new THREE.Mesh(doorGeo, darkWoodMat);
    doorMesh.position.set(0, 1.75, 3.82);
    doorMesh.castShadow = true;
    windmillGroup.add(doorMesh);

    // Upper Window
    const windowGeo = new THREE.BoxGeometry(0.6, 0.9, 0.1);
    const windowMat = new THREE.MeshStandardMaterial({ 
        color: COLORS.warmGlow, 
        roughness: 0.3, 
        emissive: COLORS.warmGlow, 
        emissiveIntensity: 1.2 
    });
    const winMesh = new THREE.Mesh(windowGeo, windowMat);
    winMesh.position.set(0, 7.5, 2.85);
    windmillGroup.add(winMesh);

    const winFrameGeo = new THREE.BoxGeometry(0.72, 1.02, 0.08);
    const winFrameMesh = new THREE.Mesh(winFrameGeo, darkWoodMat);
    winFrameMesh.position.set(0, 7.5, 2.82);
    windmillGroup.add(winFrameMesh);

    // Rotating Rotor Assembly
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(0, 11.2, 3.2);

    const shaftGeo = new THREE.CylinderGeometry(0.2, 0.2, 2.8, 12);
    const shaftMesh = new THREE.Mesh(shaftGeo, darkWoodMat);
    shaftMesh.rotation.x = Math.PI / 2;
    shaftMesh.position.set(0, 0, -1.0);
    rotorGroup.add(shaftMesh);

    const hubGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.8, 12);
    const hubMesh = new THREE.Mesh(hubGeo, darkWoodMat);
    hubMesh.rotation.x = Math.PI / 2;
    hubMesh.castShadow = true;
    rotorGroup.add(hubMesh);

    // 4 Rotor Blades
    const bladeCount = 4;
    const bladeLength = 6.2;
    const bladeWidth = 0.85;

    for (let i = 0; i < bladeCount; i++) {
        const bladeHolder = new THREE.Group();
        bladeHolder.rotation.z = (i * Math.PI) / 2;

        const armGeo = new THREE.BoxGeometry(0.12, bladeLength, 0.12);
        const armMesh = new THREE.Mesh(armGeo, darkWoodMat);
        armMesh.position.y = bladeLength / 2;
        armMesh.castShadow = true;
        bladeHolder.add(armMesh);

        const panelGeo = new THREE.BoxGeometry(bladeWidth, bladeLength * 0.7, 0.04);
        const panelMesh = new THREE.Mesh(panelGeo, creamMat);
        panelMesh.position.set(bladeWidth / 2 - 0.06, bladeLength * 0.55, 0.15);
        panelMesh.castShadow = true;
        bladeHolder.add(panelMesh);

        rotorGroup.add(bladeHolder);
    }

    windmillGroup.add(rotorGroup);
    scene.add(windmillGroup);

    // Set Metadata & Register for Raycasting Inspection
    windmillGroup.userData = {
        type: 'windmill',
        title: 'Rustic Windmill',
        icon: '⚙️',
        tag: 'Mechanical Tower',
        desc: 'A traditional timber and cream plaster flour mill with 4 automated canvas sails and stone foundation.',
        camOffset: new THREE.Vector3(-8, 9, 11),
        targetPos: new THREE.Vector3(-8, 7, -2)
    };
    
    // Traverse meshes so raycaster matches parent metadata
    windmillGroup.traverse(child => {
        if (child.isMesh) child.userData.owner = windmillGroup;
    });
    interactableObjects.push(windmillGroup);

    // Store Rotor for Animation
    animatedObjects.push({ obj: rotorGroup, type: 'rotateRotor', speed: 0.8 });
}

function buildFarmhouse() {
    const houseGroup = new THREE.Group();
    houseGroup.position.set(7, 0, 1);

    // Materials
    const creamMat = new THREE.MeshStandardMaterial({ color: COLORS.creamWall, roughness: 0.75 });
    const rustMat = new THREE.MeshStandardMaterial({ color: COLORS.rustRed, roughness: 0.65 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: COLORS.woodDark, roughness: 0.85 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: COLORS.stoneBase, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({ 
        color: COLORS.warmGlow, 
        emissive: COLORS.warmGlow, 
        emissiveIntensity: 1.5, 
        roughness: 0.2 
    });

    // Main House Body
    const bodyGeo = new THREE.BoxGeometry(7, 4.5, 5);
    const bodyMesh = new THREE.Mesh(bodyGeo, creamMat);
    bodyMesh.position.y = 2.25;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    houseGroup.add(bodyMesh);

    // Front and Rear Wall Triangular Gables
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-3.5, 0);
    gableShape.lineTo(0, 2.5);
    gableShape.lineTo(3.5, 0);
    gableShape.closePath();

    const gableGeo = new THREE.ShapeGeometry(gableShape);
    
    const frontGable = new THREE.Mesh(gableGeo, creamMat);
    frontGable.position.set(0, 4.5, 2.5);
    houseGroup.add(frontGable);

    const backGable = new THREE.Mesh(gableGeo, creamMat);
    backGable.position.set(0, 4.5, -2.5);
    backGable.rotation.y = Math.PI;
    houseGroup.add(backGable);

    // Roof Panels
    const roofPitch = Math.atan2(2.5, 3.5);
    const roofLength = Math.sqrt(3.5 * 3.5 + 2.5 * 2.5) + 0.5;
    const roofWidth = 5.8;

    const roofTileGeo = new THREE.BoxGeometry(roofLength, 0.2, roofWidth);

    const roofRight = new THREE.Mesh(roofTileGeo, rustMat);
    roofRight.position.set(1.75, 5.75, 0);
    roofRight.rotation.z = -roofPitch;
    roofRight.castShadow = true;
    roofRight.receiveShadow = true;
    houseGroup.add(roofRight);

    const roofLeft = new THREE.Mesh(roofTileGeo, rustMat);
    roofLeft.position.set(-1.75, 5.75, 0);
    roofLeft.rotation.z = roofPitch;
    roofLeft.castShadow = true;
    roofLeft.receiveShadow = true;
    houseGroup.add(roofLeft);

    // Wooden Roof Ridge Cap Beam
    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, roofWidth), darkWoodMat);
    ridgeCap.position.set(0, 7.05, 0);
    ridgeCap.castShadow = true;
    houseGroup.add(ridgeCap);

    // Weather Vane Assembly
    const weatherVaneGroup = new THREE.Group();
    weatherVaneGroup.position.set(-1.5, 7.2, 0);

    const vaneMetalMat = new THREE.MeshStandardMaterial({ color: COLORS.metalBronze, roughness: 0.4, metalness: 0.8 });
    
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 8), vaneMetalMat);
    spindle.position.y = 0.6;
    spindle.castShadow = true;
    weatherVaneGroup.add(spindle);

    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.03), vaneMetalMat);
    cross1.position.y = 0.8;
    weatherVaneGroup.add(cross1);

    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.8), vaneMetalMat);
    cross2.position.y = 0.8;
    weatherVaneGroup.add(cross2);

    const spinnerGroup = new THREE.Group();
    spinnerGroup.position.y = 1.15;

    const arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.04), vaneMetalMat);
    spinnerGroup.add(arrowShaft);

    const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), vaneMetalMat);
    arrowHead.rotation.z = -Math.PI / 2;
    arrowHead.position.x = 0.45;
    spinnerGroup.add(arrowHead);

    const arrowFin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.02), vaneMetalMat);
    arrowFin.position.x = -0.4;
    spinnerGroup.add(arrowFin);

    weatherVaneGroup.add(spinnerGroup);
    houseGroup.add(weatherVaneGroup);

    animatedObjects.push({ obj: spinnerGroup, type: 'weatherVane', speed: 1.2 });

    // Timber Framing Beam Accents
    const beamGeoVertical = new THREE.BoxGeometry(0.2, 4.52, 0.2);
    for (let xOffset of [-3.45, 3.45]) {
        for (let zOffset of [-2.45, 2.45]) {
            const beam = new THREE.Mesh(beamGeoVertical, darkWoodMat);
            beam.position.set(xOffset, 2.25, zOffset);
            beam.castShadow = true;
            houseGroup.add(beam);
        }
    }

    // Wooden Front Door
    const doorGeo = new THREE.BoxGeometry(1.2, 2.4, 0.12);
    const doorMesh = new THREE.Mesh(doorGeo, darkWoodMat);
    doorMesh.position.set(0, 1.2, 2.56);
    doorMesh.castShadow = true;
    houseGroup.add(doorMesh);

    const frameGeo = new THREE.BoxGeometry(1.36, 2.48, 0.08);
    const frameMesh = new THREE.Mesh(frameGeo, darkWoodMat);
    frameMesh.position.set(0, 1.24, 2.52);
    houseGroup.add(frameMesh);

    // Windows with Warm Interior Glow
    const winPositions = [
        { x: -2.2, y: 2.2, z: 2.53 },
        { x: 2.2, y: 2.2, z: 2.53 },
        { x: 0, y: 5.4, z: 2.53 }
    ];

    winPositions.forEach(pos => {
        const winGeo = new THREE.BoxGeometry(1.0, 1.2, 0.08);
        const winMat = glassMat.clone();
        const winMesh = new THREE.Mesh(winGeo, winMat);
        winMesh.position.set(pos.x, pos.y, pos.z);
        houseGroup.add(winMesh);

        const frameVert = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.1), darkWoodMat);
        frameVert.position.set(pos.x, pos.y, pos.z + 0.02);
        const frameHoriz = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.1), darkWoodMat);
        frameHoriz.position.set(pos.x, pos.y, pos.z + 0.02);
        houseGroup.add(frameVert);
        houseGroup.add(frameHoriz);

        // PointLight coming from glowing windows
        const windowLight = new THREE.PointLight(COLORS.warmGlow, 2.2, 7, 2);
        windowLight.position.set(pos.x, pos.y, pos.z + 0.5);
        houseGroup.add(windowLight);

        // Store light reference for automatic night illumination controls
        windowLights.push({ light: windowLight, mat: winMat });
    });

    // Stone Chimney & Smoke
    const chimneyGeo = new THREE.BoxGeometry(1.0, 5.0, 1.0);
    const chimneyMesh = new THREE.Mesh(chimneyGeo, stoneMat);
    chimneyMesh.position.set(2.2, 5.2, -1.2);
    chimneyMesh.castShadow = true;
    chimneyMesh.receiveShadow = true;
    houseGroup.add(chimneyMesh);

    const capGeo = new THREE.BoxGeometry(1.2, 0.25, 1.2);
    const capMesh = new THREE.Mesh(capGeo, stoneMat);
    capMesh.position.set(2.2, 7.75, -1.2);
    capMesh.castShadow = true;
    houseGroup.add(capMesh);

    // Chimney Smoke Particles
    const smokeCount = 18;
    const smokeGroup = new THREE.Group();
    smokeGroup.position.set(2.2, 8.0, -1.2);

    const smokeGeo = new THREE.DodecahedronGeometry(0.35, 1);
    const smokeMat = new THREE.MeshStandardMaterial({
        color: COLORS.chimneySmoke,
        transparent: true,
        opacity: 0.35,
        roughness: 1.0
    });

    let smokeParticles = [];
    for (let i = 0; i < smokeCount; i++) {
        const particle = new THREE.Mesh(smokeGeo, smokeMat);
        particle.position.set(
            (Math.random() - 0.5) * 0.3,
            i * 0.45,
            (Math.random() - 0.5) * 0.3
        );
        const scale = 0.5 + i * 0.15;
        particle.scale.set(scale, scale, scale);
        smokeGroup.add(particle);
        smokeParticles.push({
            mesh: particle,
            baseY: i * 0.45,
            speed: 0.3 + Math.random() * 0.2,
            offset: Math.random() * Math.PI * 2
        });
    }

    houseGroup.add(smokeGroup);
    scene.add(houseGroup);

    // Set Metadata & Register for Raycasting Inspection
    houseGroup.userData = {
        type: 'farmhouse',
        title: 'Cozy Timber Farmhouse',
        icon: '🏡',
        tag: 'Living Quarters',
        desc: 'A warm two-story farmhouse constructed with clay rust tiles, timber framing, and warm interior lighting.',
        camOffset: new THREE.Vector3(7, 5, 11),
        targetPos: new THREE.Vector3(7, 3.5, 1)
    };

    houseGroup.traverse(child => {
        if (child.isMesh) child.userData.owner = houseGroup;
    });
    interactableObjects.push(houseGroup);

    animatedObjects.push({ obj: smokeParticles, type: 'chimneySmoke' });
}

function buildDecorations() {
    // Pine and Autumn Low-Poly Trees (Decorations - no click inspection needed)
    const treePositions = [
        { x: -15, z: -8, scale: 1.2, color: COLORS.foliageGreen },
        { x: -14, z: 6, scale: 1.0, color: COLORS.foliageAutumn },
        { x: 14, z: -10, scale: 1.4, color: COLORS.foliageGreen },
        { x: 12, z: 12, scale: 0.9, color: COLORS.foliageLush },
        { x: -3, z: -14, scale: 1.3, color: COLORS.foliageAutumn },
        { x: 3, z: -12, scale: 1.1, color: COLORS.foliageGreen },
        { x: -12, z: 12, scale: 1.15, color: COLORS.foliageLush }
    ];

    const trunkMat = new THREE.MeshStandardMaterial({ color: COLORS.weatheredWood, roughness: 0.9 });

    treePositions.forEach((pos) => {
        const treeGroup = new THREE.Group();
        treeGroup.position.set(pos.x, 0, pos.z);
        treeGroup.scale.set(pos.scale, pos.scale, pos.scale);

        const foliageMat = new THREE.MeshStandardMaterial({ color: pos.color, roughness: 0.8 });

        const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3.5, 8);
        const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
        trunkMesh.position.y = 1.75;
        trunkMesh.castShadow = true;
        treeGroup.add(trunkMesh);

        for (let i = 0; i < 3; i++) {
            const coneGeo = new THREE.ConeGeometry(2.2 - i * 0.4, 3.0, 8);
            const coneMesh = new THREE.Mesh(coneGeo, foliageMat);
            coneMesh.position.y = 3.5 + i * 1.8;
            coneMesh.castShadow = true;
            treeGroup.add(coneMesh);
        }

        scene.add(treeGroup);
    });

    // Bushes
    const bushPositions = [
        { x: 4, z: 2.2, r: 0.8, color: COLORS.foliageGreen },
        { x: 10, z: 2.5, r: 0.65, color: COLORS.foliageLush },
        { x: 3.5, z: -0.5, r: 0.75, color: COLORS.foliageAutumn },
        { x: -6, z: -5, r: 0.9, color: COLORS.foliageGreen },
        { x: -10, z: 1, r: 0.7, color: COLORS.foliageLush }
    ];

    bushPositions.forEach(b => {
        const bushGeo = new THREE.DodecahedronGeometry(b.r, 1);
        const bushMat = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.85 });
        const bushMesh = new THREE.Mesh(bushGeo, bushMat);
        bushMesh.position.set(b.x, b.r * 0.7, b.z);
        bushMesh.castShadow = true;
        scene.add(bushMesh);
    });

    // Winding Wooden Fence
    const fenceMat = new THREE.MeshStandardMaterial({ color: COLORS.weatheredWood, roughness: 0.85 });
    const fenceGroup = new THREE.Group();

    const fencePosts = [
        { x: -6, z: 4.8 }, { x: -4, z: 4.9 }, { x: -2, z: 5.1 },
        { x: 0, z: 5.2 }, { x: 2, z: 5.0 }, { x: 4, z: 4.8 }, { x: 6, z: 4.8 }
    ];

    for (let i = 0; i < fencePosts.length; i++) {
        const pos = fencePosts[i];
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), fenceMat);
        post.position.set(pos.x, 0.6, pos.z);
        post.castShadow = true;
        fenceGroup.add(post);

        if (i < fencePosts.length - 1) {
            const nextPos = fencePosts[i + 1];
            const dist = Math.hypot(nextPos.x - pos.x, nextPos.z - pos.z);
            const angle = Math.atan2(nextPos.z - pos.z, nextPos.x - pos.x);

            for (let h of [0.4, 0.85]) {
                const rail = new THREE.Mesh(new THREE.BoxGeometry(dist, 0.08, 0.08), fenceMat);
                rail.position.set((pos.x + nextPos.x) / 2, h, (pos.z + nextPos.z) / 2);
                rail.rotation.y = -angle;
                rail.castShadow = true;
                fenceGroup.add(rail);
            }
        }
    }
    scene.add(fenceGroup);

    // Floating Dust Particles
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particleData = [];

    for (let i = 0; i < particleCount; i++) {
        const x = (Math.random() - 0.5) * 45;
        const y = Math.random() * 16 + 0.5;
        const z = (Math.random() - 0.5) * 45;

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        particleData.push({
            x, y, z,
            speedY: 0.15 + Math.random() * 0.25,
            driftX: (Math.random() - 0.5) * 0.2,
            driftZ: (Math.random() - 0.5) * 0.2,
            phase: Math.random() * Math.PI * 2
        });
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
        color: 0xffb86c,
        size: 0.2,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });

    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    animatedObjects.push({ 
        obj: particleSystem, 
        type: 'floatingDust',
        data: particleData
    });
}

function setupUIAndInteraction() {
    const btnPause = document.getElementById('btn-pause');
    const btnPauseIcon = document.getElementById('btn-pause-icon');
    const btnPauseText = document.getElementById('btn-pause-text');
    const btnToggleTime = document.getElementById('btn-toggle-time');
    const btnTimeIcon = document.getElementById('btn-time-icon');
    const btnTimeText = document.getElementById('btn-time-text');
    const sliderWind = document.getElementById('slider-wind');
    const valWind = document.getElementById('val-wind');
    const sliderTimeSpeed = document.getElementById('slider-time-speed');
    const valTimeSpeed = document.getElementById('val-time-speed');
    const sliderBloom = document.getElementById('slider-bloom');
    const valBloom = document.getElementById('val-bloom');
    const btnResetView = document.getElementById('btn-reset-view');

    const panelLeft = document.getElementById('panel-left');
    const panelRight = document.getElementById('panel-right');
    const btnToggleUIMain = document.getElementById('btn-toggle-ui-main');
    const btnHideUICorner = document.getElementById('btn-hide-ui-corner');
    const toggleUIIcon = document.getElementById('toggle-ui-icon');
    const toggleUIText = document.getElementById('toggle-ui-text');

    let isUIVisible = true;

    function toggleUI(visible) {
        isUIVisible = visible !== undefined ? visible : !isUIVisible;
        if (isUIVisible) {
            panelLeft.classList.remove('ui-collapsed-left');
            panelRight.classList.remove('ui-collapsed-right');
            toggleUIIcon.innerText = '👁️';
            toggleUIText.innerText = 'Hide UI';
        } else {
            panelLeft.classList.add('ui-collapsed-left');
            panelRight.classList.add('ui-collapsed-right');
            toggleUIIcon.innerText = '⚙️';
            toggleUIText.innerText = 'Show Controls';
        }
    }

    btnToggleUIMain.addEventListener('click', () => toggleUI());
    btnHideUICorner.addEventListener('click', () => toggleUI(false));

    btnPause.addEventListener('click', () => {
        isAnimationPaused = !isAnimationPaused;
        if (isAnimationPaused) {
            btnPauseIcon.innerText = '▶';
            btnPauseText.innerText = 'Play';
            btnPause.classList.add('bg-amber-600/60');
        } else {
            btnPauseIcon.innerText = '⏸';
            btnPauseText.innerText = 'Pause';
            btnPause.classList.remove('bg-amber-600/60');
        }
    });

    btnToggleTime.addEventListener('click', () => {
        isTimeCycleActive = !isTimeCycleActive;
        if (isTimeCycleActive) {
            btnTimeIcon.innerText = '⏸';
            btnTimeText.innerText = 'Pause Time';
            btnToggleTime.classList.remove('bg-amber-600/60');
        } else {
            btnTimeIcon.innerText = '▶';
            btnTimeText.innerText = 'Play Time';
            btnToggleTime.classList.add('bg-amber-600/60');
        }
    });

    sliderTimeSpeed.addEventListener('input', (e) => {
        const speedVal = parseFloat(e.target.value) / 10;
        timeCycleSpeed = speedVal * 0.02;
        valTimeSpeed.innerText = `${speedVal.toFixed(1)}x`;
    });

    sliderWind.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 10;
        windSpeedFactor = val;
        valWind.innerText = `${val.toFixed(1)}x`;
    });

    sliderBloom.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 10;
        bloomPass.strength = val;
        valBloom.innerText = val.toFixed(2);
    });

    btnResetView.addEventListener('click', () => resetCameraView());
    document.getElementById('info-card-close').addEventListener('click', (e) => {
        e.stopPropagation();
        resetCameraView();
    });

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', (e) => pointerDownPos.set(e.clientX, e.clientY));

    domEl.addEventListener('pointerup', (e) => {
        const distMoved = pointerDownPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY));
        if (distMoved > 5) return;

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        const meshList = [];
        interactableObjects.forEach(grp => {
            grp.traverse(child => { if (child.isMesh) meshList.push(child); });
        });

        const intersects = raycaster.intersectObjects(meshList, false);

        if (intersects.length > 0) {
            const hitMesh = intersects[0].object;
            const ownerGroup = hitMesh.userData.owner;
            if (ownerGroup && ownerGroup.userData) {
                focusObject(ownerGroup);
            }
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

function focusObject(objGroup) {
    const data = objGroup.userData;
    if (!data) return;

    selectedObject = objGroup;
    cameraTargetPos.copy(data.camOffset);
    controlsTargetPos.copy(data.targetPos);
    isCameraLerping = true;

    const infoCard = document.getElementById('info-card');
    document.getElementById('info-card-title').innerText = data.title || 'Selected Object';
    document.getElementById('info-card-desc').innerText = data.desc || '';
    document.getElementById('info-card-icon').innerText = data.icon || '🔍';
    document.getElementById('info-card-tag').innerText = data.tag || 'Inspection';
    
    const p = data.targetPos;
    document.getElementById('info-card-meta').innerText = `Target Pos: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
    document.getElementById('mode-status-text').innerText = `Focus: ${data.title}`;

    if (infoCard) {
        infoCard.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
        infoCard.classList.add('opacity-100', 'translate-y-0');
    }
}

function resetCameraView() {
    selectedObject = null;
    cameraTargetPos.copy(defaultCameraPos);
    controlsTargetPos.copy(defaultControlsTarget);
    isCameraLerping = true;

    const infoCard = document.getElementById('info-card');
    document.getElementById('mode-status-text').innerText = "Click Object to Focus";

    if (infoCard) {
        infoCard.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
        infoCard.classList.remove('opacity-100', 'translate-y-0');
    }
}

function updateTimeOfDay() {
    const skyStatusText = document.getElementById('sky-status-text');

    // Continuous Sun Trajectory
    const angle = timeOfDayFactor * Math.PI * 2;
    sunLight.position.x = Math.cos(angle) * 35;
    sunLight.position.y = Math.sin(angle) * 35;
    sunLight.position.z = Math.sin(angle * 0.5) * 15;

    // Compute daylight factor using smooth sine curve (-1.0 to 1.0)
    const dayFactor = Math.sin(angle); // >0 = Day, <0 = Night

    const cNight = new THREE.Color(COLORS.skyNight);
    const cSunset = new THREE.Color(COLORS.skySunset);
    const cDay = new THREE.Color(COLORS.skyDay);

    let timeLabel = "Midday";
    const targetSky = new THREE.Color();
    const targetSun = new THREE.Color();
    let sunIntensity = 0;

    if (dayFactor < -0.1) {
        // Night Phase
        timeLabel = "Starry Night";
        targetSky.copy(cNight);
        targetSun.setHex(0x334466);
        sunIntensity = 0.3;
    } else if (dayFactor >= -0.1 && dayFactor < 0.3) {
        // Twilight / Golden Horizon Transition
        const t = (dayFactor + 0.1) / 0.4;
        timeLabel = angle < Math.PI ? "Golden Dawn" : "Golden Sunset";
        targetSky.copy(cNight).lerp(cSunset, t);
        targetSun.setHex(0xffa043);
        sunIntensity = THREE.MathUtils.lerp(0.3, 3.0, t);
    } else {
        // Daytime Phase
        const t = Math.min((dayFactor - 0.3) / 0.7, 1.0);
        timeLabel = "Bright Day";
        targetSky.copy(cSunset).lerp(cDay, t);
        targetSun.copy(new THREE.Color(0xffa043)).lerp(new THREE.Color(0xffffff), t);
        sunIntensity = THREE.MathUtils.lerp(3.0, 3.5, t);
    }

    // Smooth Interpolation to avoid sudden light jumps
    scene.fog.color.lerp(targetSky, 0.1);
    scene.background.lerp(targetSky, 0.1);
    sunLight.color.lerp(targetSun, 0.1);
    sunLight.intensity = THREE.MathUtils.lerp(sunLight.intensity, sunIntensity, 0.1);

    if (skyStatusText) skyStatusText.innerText = timeLabel;

    // Smooth window glowing intensity transition during night
    const nightWeight = Math.max(0, -dayFactor);
    windowLights.forEach(item => {
        item.light.intensity = THREE.MathUtils.lerp(1.2, 3.8, nightWeight);
        item.mat.emissiveIntensity = THREE.MathUtils.lerp(0.8, 2.2, nightWeight);
    });
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (!isAnimationPaused) {
        if (isTimeCycleActive) {
            timeOfDayFactor = (timeOfDayFactor + timeCycleSpeed * delta) % 1.0;
            updateTimeOfDay();
        }

        animatedObjects.forEach(item => {
            if (item.type === 'rotateRotor') {
                item.obj.rotation.z += item.speed * windSpeedFactor * delta;
            } else if (item.type === 'weatherVane') {
                item.obj.rotation.y += Math.sin(clock.getElapsedTime() * item.speed) * 0.01 * windSpeedFactor;
            } else if (item.type === 'chimneySmoke') {
                item.obj.forEach(p => {
                    p.mesh.position.y += p.speed * delta;
                    p.mesh.position.x += Math.sin(clock.getElapsedTime() * 2 + p.offset) * 0.02 * windSpeedFactor;
                    if (p.mesh.position.y > 4.0) {
                        p.mesh.position.y = 0;
                    }
                });
            } else if (item.type === 'floatingDust') {
                const positions = item.obj.geometry.attributes.position.array;
                item.data.forEach((p, i) => {
                    p.y += p.speedY * delta;
                    p.x += Math.sin(clock.getElapsedTime() + p.phase) * p.driftX * delta;
                    p.z += Math.cos(clock.getElapsedTime() + p.phase) * p.driftZ * delta;

                    if (p.y > 16.5) p.y = 0.5;

                    positions[i * 3] = p.x;
                    positions[i * 3 + 1] = p.y;
                    positions[i * 3 + 2] = p.z;
                });
                item.obj.geometry.attributes.position.needsUpdate = true;
            }
        });
    }

    if (isCameraLerping) {
        camera.position.lerp(cameraTargetPos, 0.05);
        controls.target.lerp(controlsTargetPos, 0.05);
        if (camera.position.distanceTo(cameraTargetPos) < 0.05 && controls.target.distanceTo(controlsTargetPos) < 0.05) {
            isCameraLerping = false;
        }
    }

    controls.update();
    composer.render();
}

window.onload = function () {
    init();
    updateTimeOfDay();
};
