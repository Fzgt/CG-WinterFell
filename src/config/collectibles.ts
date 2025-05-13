import { CollectibleConfig } from '../components/CollectibleField';

export const CANDY_CORN_CONFIG: CollectibleConfig = {
  modelPath: '/models/collectibles/candy_corn.glb',
  scale: 3,
  count: 60,
  scoreValue: 10,
  collisionRadius: 8,
  particleColor: 0xffff00,
  particleCount: 5,
  particleRadius: 0.2,
  particleSpeed: 0.5,
  rotationSpeed: 2.0,
  floatHeight: 0.5,
  rotation:[0,0,0],
};

export const TREASURE_CHEST_CONFIG: CollectibleConfig = {
  modelPath: '/models/collectibles/treasure_chest.glb',
  scale: 0.008,
  count: 30,
  scoreValue: 50,
  collisionRadius: 8,
  particleColor: 0xffff00,
  particleCount: 5,
  particleRadius: 0.2,
  particleSpeed: 0.5,
  rotationSpeed: 0.7,
  floatHeight: 2,
  rotation:[0,0,0],
};

export const GHOST_CONFIG: CollectibleConfig = {
    modelPath: '/models/collectibles/halloween_ghost.glb',
    scale: 3,
    count: 40,
    scoreValue: 30,
    collisionRadius: 8,
    particleColor: 0xE75480,
    particleCount: 5,
    particleRadius: 0.2,
    particleSpeed: 0.5,
    rotationSpeed: 0,
    floatHeight: 1,
    rotation:[-Math.PI/2,0,-Math.PI/2],
  };

// All collectible configs in an array for preloading
export const ALL_COLLECTIBLES = [
  CANDY_CORN_CONFIG, TREASURE_CHEST_CONFIG, GHOST_CONFIG
];