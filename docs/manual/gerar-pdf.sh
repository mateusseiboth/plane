#!/usr/bin/env bash
# Gera o PDF do manual a partir do manual.md.
#
# Caminho escolhido: pandoc → HTML (com estilo.css) → Chrome headless → PDF.
# O LaTeX seria mais direto, mas engasga com as capturas em 1680px de largura e
# não dá o mesmo controle de quebra de página das tabelas e figuras.
#
# Uso: ./gerar-pdf.sh          (a partir de docs/manual/)
set -euo pipefail

cd "$(dirname "$0")"

MD=manual.md
HTML=.manual.html
PDF=manual-aviao.pdf
DATA=$(LC_TIME=pt_BR.UTF-8 date "+%d/%m/%Y")

command -v pandoc >/dev/null || { echo "pandoc não encontrado"; exit 1; }
CHROME=$(command -v google-chrome || command -v chromium || true)
[ -n "$CHROME" ] || { echo "google-chrome/chromium não encontrado"; exit 1; }

# 1. Markdown → HTML. O `\newpage` do Markdown não existe em HTML: viramos ele
#    numa <div class="quebra">, que o CSS transforma em page-break.
pandoc "$MD" \
  --from=markdown+raw_tex \
  --to=html5 \
  --standalone \
  --toc --toc-depth=2 \
  --metadata title="Avião — Manual do Usuário" \
  --css=estilo.css \
  --output="$HTML"

python3 - "$HTML" "$DATA" <<'PY'
import re, sys
from pathlib import Path

arquivo, data = Path(sys.argv[1]), sys.argv[2]
html = arquivo.read_text()

# \newpage sobrevive como texto solto ou dentro de <p>; nos dois casos vira quebra.
html = re.sub(r"<p>\s*\\newpage\s*</p>", '<div class="quebra"></div>', html)
html = html.replace("\\newpage", '<div class="quebra"></div>')

# Capa: substitui o cabeçalho padrão do pandoc.
marca = Path("../../apps/web/app/assets/logos/aviao-mark.svg")
svg = marca.read_text() if marca.exists() else ""
capa = f"""<div class="capa">
  <div class="marca">{svg}</div>
  <h1>Avião</h1>
  <p class="subtitulo">Manual do Usuário</p>
  <p class="rodape-capa">Sistema de chamados, atendimento e visitas técnicas<br/>
  Quality Sistemas &middot; {data}</p>
</div>"""
html = re.sub(r'<header id="title-block-header">.*?</header>', capa, html, flags=re.S)
if "class=\"capa\"" not in html:  # pandoc não gerou header: injeta após <body>
    html = html.replace("<body>", "<body>\n" + capa, 1)

arquivo.write_text(html)
print("HTML preparado:", arquivo)
PY

# 2. HTML → PDF.
"$CHROME" --headless --disable-gpu --no-sandbox \
  --no-pdf-header-footer \
  --print-to-pdf="$PDF" \
  "file://$PWD/$HTML" 2>/dev/null

rm -f "$HTML"
echo "PDF gerado: $(pwd)/$PDF ($(du -h "$PDF" | cut -f1))"
