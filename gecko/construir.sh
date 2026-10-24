#!/usr/bin/env bash
# Monta o GeckoCIRCUITS que o simulador usa: o original (https://github.com/geckocircuits/GeckoCIRCUITS, GPLv3) num
# commit fixo, mais os patches desta pasta (patches/*.patch: a leitura e a escrita em lote pela interface remota —
# getOutputs, setParameterMany — e o jar executável com as dependências). Resultado: gecko/build/gecko-lote.jar.
#
# Requisitos: git, Java 11 (JDK) e Maven. Rodar de novo é seguro: se o jar já existe e os patches não mudaram, não faz nada
# (--forca recompila).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
. "$AQUI/../config/fala.sh"                               # fala pt en: as mensagens no idioma do terminal
UPSTREAM="https://github.com/geckocircuits/GeckoCIRCUITS.git"
COMMIT="bb07d4160432836f55be0a99f21926795aa1efb9"          # main do GeckoCIRCUITS em 2026-02-23 (merge do PR #50)
B="$AQUI/build"; FONTE="$B/GeckoCIRCUITS"; JAR="$B/gecko-lote.jar"; MARCA="$B/.patches"
mkdir -p "$B"
assinatura="$COMMIT $(cat "$AQUI"/patches/*.patch | sha256sum | cut -d' ' -f1)"
if [ "${1:-}" != "--forca" ] && [ -f "$JAR" ] && [ "$(cat "$MARCA" 2>/dev/null)" = "$assinatura" ]; then
  fala "gecko: $JAR já está montado (commit e patches iguais); --forca para recompilar" \
       "gecko: $JAR is already built (same commit and patches); --forca to rebuild"; exit 0
fi
for c in git java javac mvn; do command -v "$c" >/dev/null || { fala "gecko: falta o comando $c" "gecko: the command $c is missing" >&2; exit 1; }; done
if [ ! -d "$FONTE/.git" ]; then
  fala "gecko: baixando o GeckoCIRCUITS original…" "gecko: downloading upstream GeckoCIRCUITS…"
  git clone --quiet "$UPSTREAM" "$FONTE"
fi
cd "$FONTE"
git cat-file -e "$COMMIT^{commit}" 2>/dev/null || git fetch --quiet origin
git checkout --quiet --force "$COMMIT"
git clean --quiet -fdx
for p in "$AQUI"/patches/*.patch; do
  fala "gecko: aplicando $(basename "$p")" "gecko: applying $(basename "$p")"
  git apply --whitespace=nowarn "$p"
done
fala "gecko: compilando (mvn package; a 1ª vez baixa as dependências)…" "gecko: building (mvn package; the first time downloads the dependencies)…"
mvn -q -DskipTests package
cp target/gecko-1.0-jar-with-dependencies.jar "$JAR"
echo "$assinatura" > "$MARCA"
fala "gecko: pronto → $JAR ($(du -h "$JAR" | cut -f1))" "gecko: done → $JAR ($(du -h "$JAR" | cut -f1))"
