import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      onwarn(warning, warn) {
        // 忽略特定的eval警告
        if (warning.code === 'EVAL' && warning.loc?.file?.includes('lottie.js')) {
          return;
        }
        warn(warning);
      }
    }
  },
  base: './'
})