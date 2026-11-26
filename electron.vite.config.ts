import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
        resolve: { alias: { '@shared': resolve('src/shared'), '@domain': resolve('src/domain') } },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
        resolve: { alias: { '@shared': resolve('src/shared') } },
    },
    renderer: {
        root: resolve('src/renderer'),
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@': resolve('src/renderer'),
                '@shared': resolve('src/shared'),
                '@domain': resolve('src/domain'),
            },
        },
        build: { outDir: resolve('out/renderer'), emptyOutDir: true },
        server: { strictPort: true, port: 3000 },
    },
});
