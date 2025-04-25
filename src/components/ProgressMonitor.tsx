import { useProgress } from '@react-three/drei';
import { useEffect } from 'react';

interface ProgressMonitorProps {
    onProgress: (loaded: boolean) => void;
}

const ProgressMonitor = ({ onProgress }: ProgressMonitorProps) => {
    console.log('progress-monitor triggered');
    const { progress } = useProgress();

    useEffect(() => {
        if (progress >= 100) {
            onProgress(true);
        }
    }, [progress, onProgress]);

    return null;
};

export default ProgressMonitor;
