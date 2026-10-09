import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

dotenv.config({ path: path.resolve(__dirname, ".env") });

// Expose only vars starting with VITE_
const viteEnv = Object.keys(process.env)
  .filter((k) => k.startsWith("VITE_"))
  .reduce<Record<string, string>>((a, k) => {
    a[k] = process.env[k] ?? "";
    return a;
  }, {});

/**
 * O SDK de widgets não está no npm: a instância serve o tarball e o projeto de
 * exemplo em /sdk/. O build do SDK gera os arquivos em dist/publico/ (veja
 * packages/widget-sdk/scripts/empacotar.ts); aqui eles vão para public/sdk/, que
 * o Vite copia para build/client/sdk/ e serve em desenvolvimento.
 */
const copySdkDosWidgets = (): Plugin => {
  let isBuild = false;
  return {
    name: "copy-sdk-dos-widgets",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    buildStart() {
      const origem = path.resolve(__dirname, "node_modules/@mateusseiboth/widgets-aviao/dist/publico");
      const destino = path.resolve(__dirname, "public/sdk");
      if (!existsSync(path.join(origem, "widgets-aviao.tgz"))) {
        const aviso = "SDK de widgets sem empacotar: rode o build de @mateusseiboth/widgets-aviao antes do web.";
        // No build a página de desenvolvedores apontaria para arquivos que não existem.
        if (isBuild) this.error(aviso);
        this.warn(aviso);
        return;
      }
      mkdirSync(destino, { recursive: true });
      cpSync(origem, destino, { recursive: true });
    },
  };
};

export default defineConfig(() => ({
  define: {
    "process.env": JSON.stringify(viteEnv),
  },
  build: {
    assetsInlineLimit: 0,
  },
  plugins: [
    copySdkDosWidgets(),
    reactRouter(),
    tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] }),
  ],
  resolve: {
    alias: {
      // Next.js compatibility shims used within web
      "next/link": path.resolve(__dirname, "app/compat/next/link.tsx"),
      "next/navigation": path.resolve(__dirname, "app/compat/next/navigation.ts"),
      "next/script": path.resolve(__dirname, "app/compat/next/script.tsx"),
    },
    dedupe: ["react", "react-dom", "@headlessui/react"],
  },
  server: {
    host: "127.0.0.1",
  },
  // No SSR-specific overrides needed; alias resolves to ESM build
}));
