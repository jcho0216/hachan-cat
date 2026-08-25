import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const productionHost = env.VITE_VERCEL_PROJECT_PRODUCTION_URL
    || env.VERCEL_PROJECT_PRODUCTION_URL
    || env.VITE_VERCEL_URL
    || env.VERCEL_URL;
  const siteUrl = (env.VITE_PUBLIC_SITE_URL || (productionHost ? `https://${productionHost}` : 'https://hachan-cat.vercel.app')).replace(/\/$/, '');

  return {
    plugins: [
      react(),
      {
        name: 'inject-public-site-url',
        transformIndexHtml: (html) => html.split('__PUBLIC_SITE_URL__').join(siteUrl),
      },
    ],
    base: './',
  };
});
