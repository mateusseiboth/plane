# Meu widget

Projeto mínimo de um widget da página inicial. O SDK vem junto em
`vendor/widgets-aviao.tgz` (baixado da própria instância).

```bash
npm install
npm run dev        # http://localhost:5173 com dados de teste (dev/dados-de-teste.ts)
npm run empacotar  # compila e gera widget.zip
```

1. Edite `src/index.tsx` (o componente) e `manifest.json` (nome, versão, permissões).
2. Em `npm run dev`, o seletor no topo mostra o widget em cada tamanho de cartão.
3. `npm run empacotar` gera `widget.zip`.
4. Na página inicial, abra **Gerenciar widgets > Enviar meu widget** e escolha o zip.
   O widget aparece só para você.
5. Para todos verem, peça a quem administra a instância para **Tornar global** em
   Configurações > Widgets > De usuários.

A cada novo envio, aumente `version` no `manifest.json`: o mesmo nome e versão não
entram duas vezes.

Para atualizar o SDK, baixe de novo em `https://<sua instância>/sdk/widgets-aviao.tgz`,
troque o arquivo em `vendor/` e rode `npm install`.
