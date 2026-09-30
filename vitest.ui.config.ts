import path from 'node:path'

import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * UI-layer tests (components and routes) on jsdom with Testing Library.
 *
 * Server functions are not executed: test/ui/setup.ts replaces `createServerFn` so every
 * server function becomes a `vi.fn()` that each test stubs with fictional fixtures.
 * Kept apart from vitest.config.ts so the 100% gate on src/lib stays as it is.
 */
export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    alias: {
      'cloudflare:workers': path.resolve(
        import.meta.dirname,
        'test/ui/stubs/cloudflare-workers.ts',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.ui.test.tsx'],
    setupFiles: ['./test/ui/setup.ts'],
    css: false,
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/components/**/*.{ts,tsx}', 'src/routes/**/*.tsx'],
      exclude: [
        '**/*.test.*',
        // Server routes (request handlers), covered by test:server where they have logic
        'src/routes/api.*',
        // What jsdom cannot run; the pages around them are tested with stand-ins
        // (test/ui/mapStub.tsx, test/ui/site3dStub.tsx):
        // Google Maps JavaScript API
        'src/components/map/PlacesMap.tsx',
        // three.js / WebGL
        'src/components/site/SiteView3D.tsx',
        // The <html> document shell; the tests use test/ui/root.tsx with the same layout
        'src/routes/__root.tsx',
      ],
      reporter: ['text', 'html'],
      // About 2 points under what the suite reached over 3 stable runs (2026-09-30:
      // lines 95.0, statements 92.8, functions 90.4, branches 84.0), so a real drop fails CI
      thresholds: {
        lines: 93,
        statements: 90,
        functions: 88,
        branches: 82,
      },
    },
  },
})
