import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appEnv = env.VITE_APP_ENV ?? '';

  return {
    plugins: [react()],
    server: {
      open: true,
    },
    define: {
      IS_IFT:     appEnv === 'ift',
      IS_PROD:    appEnv === 'prod',
      IS_PREPROD: appEnv === 'preprod',
      IS_HOTFIX:  appEnv === 'hotfix',
    },
  };
});
