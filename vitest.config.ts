
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./server/__tests__/env.setup.js', './src/test/setup.ts'],
        css: true,
        // Playwright's e2e specs live under tests/ - keep them (and all node_modules, at any depth) out of vitest's run
        exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
} as any);
