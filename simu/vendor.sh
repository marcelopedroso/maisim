#!/usr/bin/env bash
# O Monaco (o editor de código do painel Controle; MIT) aqui no MaiSim, para funcionar sem internet: baixa a versão fixa do
# registro do npm, confere o SHA-256 e deixa em simu/static/vendor/monaco só o que o MaiSim usa (o editor, a base e as
# linguagens Python e C: ~4 MB dos 14 MB). Fora do git; os pacotes (instalador do Windows, AppImage) sempre rodam isto, e o
# Atualizar da versão de programador também, se já houver o Monaco local. Sem ele, o painel usa o mesmo Monaco pelo CDN
# (precisa de internet). Rodar de novo é seguro: com a versão e as linguagens já lá, não faz nada.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
. "$AQUI/../config/fala.sh"
V=0.52.2
SHA=c280cdcf0b0c13d1a2bf01af958d4387ed06d7f6c918401d00c4adcae1bc72b6   # monaco-editor-0.52.2.tgz
DEST="$AQUI/static/vendor/monaco"
LINGS="python cpp"                                          # o realce do controle.py e do controle.c (o "c" do Monaco mora no cpp)
tem_tudo() { [ "$(cat "$DEST/.versao" 2>/dev/null)" = "$V" ] || return 1; for l in $LINGS; do [ -d "$DEST/vs/basic-languages/$l" ] || return 1; done; }
if tem_tudo; then
  fala "vendor: o Monaco $V já está em $DEST" "vendor: Monaco $V is already in $DEST"; exit 0
fi
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fala "vendor: baixando o Monaco $V…" "vendor: downloading Monaco $V…"
curl -fsSL -o "$T/m.tgz" "https://registry.npmjs.org/monaco-editor/-/monaco-editor-$V.tgz"
echo "$SHA  $T/m.tgz" | sha256sum -c --quiet - || { fala "vendor: o SHA-256 do Monaco não confere" "vendor: Monaco's SHA-256 does not match" >&2; exit 1; }
tar xzf "$T/m.tgz" -C "$T" package/min/vs package/LICENSE
rm -rf "$DEST"; mkdir -p "$DEST/vs/basic-languages"
cp -r "$T/package/min/vs/loader.js" "$T/package/min/vs/base" "$T/package/min/vs/editor" "$DEST/vs/"
for l in $LINGS; do cp -r "$T/package/min/vs/basic-languages/$l" "$DEST/vs/basic-languages/"; done
cp "$T/package/LICENSE" "$DEST/LICENSE"
echo "$V" > "$DEST/.versao"
fala "vendor: pronto → $DEST ($(du -sh "$DEST" | cut -f1))" "vendor: done → $DEST ($(du -sh "$DEST" | cut -f1))"
