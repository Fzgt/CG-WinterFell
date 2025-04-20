export const planeSize = 1000;
export const planeTextureSize = planeSize / 20;

export const shipSpeed = 5;

export const cubeSize = 20;
export const cubeCount = 40;

// models that need to be preloaded declared here
export const MODEL_PATHS = [
    '/models/monsters/halloween_pumpkin_2.glb',
    '/models/monsters/halloween_pumpkin.glb',
    '/models/monsters/emerald_bat.glb',
    '/models/monsters/glow_bat.glb',
    '/models/monsters/king_boo.glb',
    '/models/jo_on_bike__rigged__animated/scene.gltf',
    '/models/skybox/skybox.glb'
];

// textures that need to be preloaded declared here
export const TEXTURE_PATHS = [
    '/textures/tile.jpg',
];

export const wallRadius = 40
export const leftBound = (-planeSize / 2) * 0.6
export const rightBound = (planeSize / 2) * 0.6