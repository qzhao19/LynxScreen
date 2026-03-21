import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "src"),
  publicDir: path.resolve(__dirname, "public"),
  plugins: [
    svelte(),
    electron([
      {
        entry: path.resolve(__dirname, "src/main/index.ts"),
        vite: {
          build: {
            outDir: path.resolve(__dirname, "dist-electron"),
            rollupOptions: {
              external: ["electron"]
            }
          }
        }
      },
      {
        entry: path.resolve(__dirname, "src/preload/index.ts"),
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, "dist-electron"),
            rollupOptions: {
              external: ["electron"],
              output: {
                entryFileNames: "preload.js"
              }
            }
          }
        }
      }
    ]),
    renderer()
  ],
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});