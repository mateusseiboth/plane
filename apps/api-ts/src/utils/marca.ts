// A marca da Quality nas páginas PÚBLICAS (portal do cliente, trabalhe
// conosco). Elas são HTML servido pela própria API, sem bundle do web, então o
// arquivo sai daqui e não do `apps/web/public`.
//
// Serve como arquivo, e não embutida em base64: 32 KB em toda carga de página
// é desperdício, e o navegador guarda a imagem por um ano. Quando a arte mudar,
// troque o arquivo E o nome da rota (ex.: `marca-2.png`), senão quem já visitou
// continua vendo a antiga até o cache vencer.

const ARQUIVO = new URL("../assets/marca-quality.png", import.meta.url);

/** Logo da Quality em PNG, com cache longo (o conteúdo nunca muda no ar). */
export const respostaDaMarca = (): Response =>
  new Response(Bun.file(ARQUIVO), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
