import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
  base: process.env.GITHUB_PAGES ? '/nostr-following-list-util/' : '/',
});
