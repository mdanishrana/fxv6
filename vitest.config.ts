
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
        // Several server test files share mutable state in the test database (most
        // notably temporarily overriding subscription_plans' BASIC row's limits to
        // test enforcement, then restoring it) rather than each using a fully
        // isolated fixture. That's safe when files run one at a time, but Vitest's
        // default parallel file execution let two files' setup/teardown race on the
        // same row - intermittent failures locally never reproduced this because
        // local runs always used `--no-file-parallelism`, while CI's plain
        // `npx vitest run` didn't. This makes CI match that safe, verified
        // behavior instead of the flag being something only a human had to remember.
        fileParallelism: false,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
} as any);
