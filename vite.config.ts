import fs from "node:fs";
import path from "node:path";
import sirv from "sirv";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const DECKS_DIR = path.resolve(__dirname, "decks");

function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.txt$/i, "");
  return base
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function generateDecksManifest(): void {
  if (!fs.existsSync(DECKS_DIR)) {
    fs.mkdirSync(DECKS_DIR, { recursive: true });
  }

  const files = fs
    .readdirSync(DECKS_DIR)
    .filter((name) => name.endsWith(".txt"))
    .sort((a, b) => a.localeCompare(b));

  const decks = files.map((filename) => {
    const id = filename.replace(/\.txt$/i, "");
    return {
      id,
      name: titleFromFilename(filename),
      filename,
    };
  });

  fs.writeFileSync(
    path.join(DECKS_DIR, "index.json"),
    JSON.stringify({ decks, updatedAt: new Date().toISOString() }, null, 2),
  );
}

function serveDecks(server: ViteDevServer): void {
  server.middlewares.use(
    "/decks",
    sirv(DECKS_DIR, { dev: true, etag: true, single: false }),
  );
}

function copyDecksToDist(): void {
  const outDir = path.resolve(__dirname, "dist/decks");
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of fs.readdirSync(DECKS_DIR)) {
    const src = path.join(DECKS_DIR, name);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(outDir, name));
    }
  }
}

function decksManifestPlugin(): Plugin {
  let watcher: fs.FSWatcher | undefined;

  return {
    name: "decks-manifest",
    configureServer(server) {
      generateDecksManifest();
      serveDecks(server);
      watcher = fs.watch(DECKS_DIR, { persistent: true }, () => {
        generateDecksManifest();
      });
    },
    buildStart() {
      generateDecksManifest();
    },
    closeBundle() {
      watcher?.close();
      copyDecksToDist();
    },
  };
}

export default defineConfig({
  plugins: [
    decksManifestPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Flippit!",
        short_name: "Flippit",
        description: "Guess the word on your forehead — tilt down for correct, up to pass.",
        theme_color: "#F5F1E8",
        background_color: "#F5F1E8",
        display: "standalone",
        orientation: "landscape",
        start_url: "/",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,json,txt}"],
        runtimeCaching: [
          {
            urlPattern: /\/decks\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "decks-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
});
