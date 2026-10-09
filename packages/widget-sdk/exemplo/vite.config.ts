import { defineConfig, type Plugin } from "vite";
import { readDadosDeTeste } from "./dev/dados-de-teste";

/**
 * Em `npm run dev`, responde as rotas do gateway (/api/v1/widget-sdk/...) com os
 * dados de `dev/dados-de-teste.ts`: dá para desenvolver sem a plataforma.
 */
const gatewayDeTeste = (): Plugin => ({
  name: "gateway-de-teste",
  configureServer(server) {
    server.middlewares.use("/api/v1/widget-sdk", (req, res) => {
      const rota = new URL(req.url ?? "/", "http://dev").pathname;
      const dados = readDadosDeTeste(rota);
      res.statusCode = dados === undefined ? 404 : 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(dados ?? { detail: `Sem dado de teste para ${rota}.` }));
    });
  },
});

export default defineConfig({
  plugins: [gatewayDeTeste()],
  esbuild: { jsx: "automatic" },
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
      fileName: () => "widget.js",
    },
    rollupOptions: {
      // A plataforma entrega React e o SDK já inicializado: o widget não os empacota.
      external: ["react", "react-dom", "react/jsx-runtime", "@mateusseiboth/widgets-aviao"],
    },
  },
});
