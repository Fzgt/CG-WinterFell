import { Perf } from 'r3f-perf';
import { useThree } from '@react-three/fiber';

const Debug = () => {
    const { width } = useThree(s => s.size);
    return <Perf minimal={width < 712} matrixUpdate deepAnalyze overClock />;
};

export default Debug;
