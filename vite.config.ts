import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ollamaUrl = env.VITE_OLLAMA_URL || 'http://localhost:11434';
  const mcpUrl = env.VITE_MCP_URL || 'https://bidarshan-dev2.dcservices.in/mcp';
  const springbootUrl = env.VITE_SPRINGBOOT_URL || 'http://localhost:8080';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/ollama': {
          target: ollamaUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama/, ''),
        },
        '/mcp': {
          target: mcpUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/mcp/, ''),
        },
        '/springboot': {
          target: springbootUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/springboot/, ''),
        },
      },
    },
  };
});
