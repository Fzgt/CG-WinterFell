import { useProgress } from '@react-three/drei';
import { useEffect } from 'react';

interface ProgressMonitorProps {
    onProgress: (loaded: boolean) => void;
}

const ProgressMonitor = ({ onProgress }: ProgressMonitorProps) => {
    const { progress, total } = useProgress();

    // With nothing queued, progress sits at 0 forever rather than reporting
    // completion, so an empty manifest counts as loaded.
    useEffect(() => {
        if (total === 0 || progress >= 100) {
            onProgress(true);
        }
    }, [progress, total, onProgress]);

    return null;
};

export default ProgressMonitor;
