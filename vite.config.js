import { defineConfig, loadEnv } from 'vite';

// These are static/generated assets or offline tools, not hot-reloaded source.
// Ignoring the directories themselves stops recursive watcher registration.
// Files in public/ remain available over HTTP and in normal production builds.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = command === 'build'
    ? (env.VITE_BASE_PATH || '/Lunar-sim/')
    : '/';

  return {
    base,
    optimizeDeps: { entries: ['index.html'] },
    server: {
      watch: {
        ignored: [
          '**/public', '**/public/**',
          '**/tools', '**/tools/**',
          '**/docs', '**/docs/**',
          '**/*.bak_*',
        ],
      },
    },
  };
});
