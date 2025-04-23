import { useMemo } from 'react';

interface GPU {
    requestAdapter: () => Promise<any>;
}

declare global {
    interface Navigator {
        gpu?: GPU;
    }
}

export const checkWebGPUSupport = (): boolean => {
    return typeof navigator !== 'undefined' && navigator.gpu !== undefined;
};

export const useWebGPUSupport = (): boolean => {
    const isWebGPUSupported = useMemo(() => checkWebGPUSupport(), []);
    return isWebGPUSupported;
};
