import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // No @tanstack/devtools-vite: the app renders no devtools panel, and its dev-time event bus
  // (localhost:4206) accepted unauthenticated messages that install npm packages
  // (security audit 2026-11-10)
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tanstackStart(), viteReact()],
})

export default config
