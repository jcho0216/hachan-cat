import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'hachan-cat',
  brand: {
    displayName: '하찮냥',
    primaryColor: '#FF6B6B',
    icon: 'https://hachan-cat.vercel.app/hachan-cat-icon.png?v=3',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite --host --configLoader runner',
      build: 'tsc -b && vite build --configLoader runner',
    },
  },
  permissions: [],
  outdir: 'dist',
  webViewProps: {
    type: 'game',
  },
});
