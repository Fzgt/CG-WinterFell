import { useGLTF, useTexture } from '@react-three/drei';
import { MODEL_PATHS, TEXTURE_PATHS } from '../constants';

// Static preloading - happens during module import
for (const model of MODEL_PATHS) {
  useGLTF.preload(model);
}

for (const texture of TEXTURE_PATHS) {
  useTexture.preload(texture);
}

// trigger loading Mnager
export const ResourcePreloader = () => {
  console.log(' ############ Resource Preloader ##############');

  const models = MODEL_PATHS.map(path => useGLTF(path));
  const textures = useTexture(TEXTURE_PATHS);

  console.log(models, textures);

  return null;
};
