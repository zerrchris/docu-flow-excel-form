import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Reduce aggressive reloading in development
    hmr: {
      overlay: true,
    },
    // Add stability for batch processing work
    watch: {
      // Ignore certain file changes to reduce unnecessary reloads
      ignored: ['**/node_modules/**', '**/public/lovable-uploads/**']
    }
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
