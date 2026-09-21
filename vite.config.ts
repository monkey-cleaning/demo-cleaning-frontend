import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'production' && !env.VITE_API_URL?.trim()) {
    throw new Error(
      'VITE_API_URL is required for production builds. Set it in the environment before running vite build.',
    )
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://localhost:4000',
      },
    },
  }
})
