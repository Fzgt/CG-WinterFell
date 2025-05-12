import { CollectibleConfig } from '../components/CollectibleField';

export const CANDY_CORN_CONFIG: CollectibleConfig = {
  modelPath: '/models/collectibles/candy_corn.glb',
  scale: 3,
  count: 100,
  scoreValue: 10,
  collisionRadius: 8,
  particleColor: 0xffff00,
  particleCount: 8,
  particleRadius: 0.2,
  particleSpeed: 0.5,
  rotationSpeed: 2.0,
  floatHeight: 0.5 
};

export const TREASURE_CHEST_CONFIG: CollectibleConfig = {
  modelPath: '/models/collectibles/treasure_chest.glb',
  scale: 0.008,
  count: 30,
  scoreValue: 50,
  collisionRadius: 8,
  particleColor: 0xffff00,
  particleCount: 8,
  particleRadius: 0.2,
  particleSpeed: 0.5,
  rotationSpeed: 0.7,
  floatHeight: 2
};

// All collectible configs in an array for preloading
export const ALL_COLLECTIBLES = [
  CANDY_CORN_CONFIG, TREASURE_CHEST_CONFIG
];