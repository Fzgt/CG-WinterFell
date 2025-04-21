export const planeSize = 1000;
export const planeTextureSize = planeSize / 20;

export const cubeSize = 20;
export const cubeCount = 40;

// models that need to be preloaded declared here
export const MODEL_PATHS = [
    '/models/obstacles/halloween_pumpkin_2.glb',
    '/models/obstacles/halloween_pumpkin.glb',
    '/models/obstacles/emerald_bat.glb',
    '/models/obstacles/glow_bat.glb',
    '/models/obstacles/king_boo.glb',
    '/models/player/scene.gltf',
];

// textures that need to be preloaded declared here
export const TEXTURE_PATHS = [
    '/textures/maple.jpg',
    '/textures/floor.jpg',
];

export const wallRadius = 40
export const leftBound = (-planeSize / 2)
export const rightBound = (planeSize / 2)