import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import react from "@vitejs/plugin-react";

// Vite only exposes env vars starting with one of these prefixes to browser code (via
// import.meta.env) - anything else in .env stays server-side only, so secrets can't leak into
// the client bundle by accident. IMJS_ covers Bentley's own auth vars (from the original
// scaffolded template); VITE_ covers everything added since (VITE_SENSOR_MODE, vendor URLs,
// etc.) - both are needed, since setting envPrefix to a single string REPLACES Vite's default
// "VITE_" prefix rather than adding to it. Missing "VITE_" here silently means every
// VITE_-prefixed .env value evaluates to `undefined` in the running app, no matter what it's
// actually set to - this bug existed from the start of the sensor-mode feature until it was
// finally tracked down while debugging why VITE_SENSOR_MODE=REAL had no effect.
const ENV_PREFIX = ["IMJS_", "VITE_"];

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    build: {
      chunkSizeWarningLimit: 8000, // Increase chunk size warning limit to avoid warnings for large chunks
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            // copy assets from `@itwin` dependencies
            src: "./node_modules/**/@itwin/*/lib/public/*",
            dest: ".",
          },
        ],
      }),
    ],
    server: {
      port: 3000,
      strictPort: true,
      open: true
    },
    resolve: {
      alias: [
        {
          // Resolve SASS tilde imports.
          find: /^~(.*)$/,
          replacement: "$1",
        },
      ],
    },
    envPrefix: ENV_PREFIX
  };
});