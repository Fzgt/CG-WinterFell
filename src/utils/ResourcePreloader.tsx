import { useGLTF, useTexture } from '@react-three/drei';
import { MODEL_PATHS, TEXTURE_PATHS } from '../config/constants';

// Static preloading - happens during module import
for (const texture of TEXTURE_PATHS) {
    useTexture.preload(texture);
}

for (const model of MODEL_PATHS) {
    useGLTF.preload(model);
}

export const ResourcePreloader = () => {
    console.log(' ############ Resource Preloader ##############');

    // To trigger loading Manager
    // @ts-ignore
    const models = MODEL_PATHS.map(path => useGLTF(path));
    // @ts-ignore
    const textures = useTexture(TEXTURE_PATHS);

    return null;
};
