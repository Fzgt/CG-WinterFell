export const planeSize = 1000;
export const planeTextureSize = planeSize / 20;
export const leftBound = -planeSize / 2;
export const rightBound = planeSize / 2;
export const grassCount = 30;

// models that need to be preloaded declared here
export const MODEL_PATHS = [
    '/models/obstacles/halloween_pumpkin_2.glb',
    '/models/player/scene.gltf',
    '/models/terrain/grass.glb',
    '/models/collectibles/candy_corn.glb',
    '/models/collectibles/treasure_chest.glb',
    '/models/collectibles/halloween_ghost.glb',
    '/models/collectibles/mini_candy.glb',
    '/models/collectibles/bottle.glb',
];

// textures that need to be preloaded declared here
export const TEXTURE_PATHS = [
    '/textures/maple.jpg',
    '/textures/rock_floor/rock_albedo.png',
    '/textures/rock_floor/rock_normal.png',
    '/textures/rock_floor/rock_roughness.png',
    '/textures/rock_floor/rock_ao.png',
    '/textures/rock_floor/rock_height.png',
];
