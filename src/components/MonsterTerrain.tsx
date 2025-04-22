import { useGLTF } from '@react-three/drei';
import MonsterTerrainGenerator from './TerrainGenerator';

const MonsterTerrain = () => {
    const { scene: pumpkin_1 } = useGLTF('/models/obstacles/halloween_pumpkin_2.glb') as any;
    const { scene: pumpkin_2 } = useGLTF('/models/obstacles/halloween_pumpkin.glb') as any;

    return (
        <>
            <MonsterTerrainGenerator
                terrainType="tunnel"
                monsterCount={300}
                monsterModel={pumpkin_2}
                Yposition={9}
                tunnelLength={50}
                monsterScale={9}
                monsterRotation={[0, -Math.PI / 2, 0]}
            />
            <MonsterTerrainGenerator
                terrainType="tunnel"
                monsterCount={300}
                monsterModel={pumpkin_2}
                Yposition={9}
                tunnelLength={50}
                monsterScale={9}
                xPosition={450}
            />
            <MonsterTerrainGenerator
                terrainType="diamond"
                monsterModel={pumpkin_1}
                Yposition={0.5}
                tunnelLength={1}
                diamondSize={20}
                monsterScale={0.1}
            />
            <MonsterTerrainGenerator
                terrainType="wall"
                monsterModel={pumpkin_1}
                Yposition={0.5}
                tunnelLength={10}
                diamondSize={20}
                monsterScale={0.1}
            />
            {/* <MonsterTerrainGenerator
                terrainType="random"
                monsterModel={pumpkin_1}
                Yposition={0.5}
                tunnelLength={10}
                diamondSize={20}
                monsterScale={0.1}
                monsterCount={60}
            /> */}
        </>
    );
};

export default MonsterTerrain; 