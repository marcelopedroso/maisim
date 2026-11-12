#!/usr/bin/env bash
# O TinyCC embutido nos pacotes do Linux (o controle em C sem compilador no sistema): a fonte do tcc num commit fixo do ramo
# de desenvolvimento (mob, 0.9.28rc; o hash do commit confere a fonte) e compila na arquitetura da máquina (x86_64 ou
# aarch64). Não o 0.9.27 lançado: no aarch64 ele não gera biblioteca compartilhada ("tcc: error: DLLs unimplemented!", o
# controle em C não rodava no ARM nem no Android; o mob gera, e no x86 dá as mesmas atuações bit a bit). Sem o bcheck (a
# verificação de memória: o MaiSim não usa) e estático (sem depender do glibc de quem usa). Deixa em <destino> o layout que o
# simu/sinais_c.py reconhece: tcc, libtcc1.a, include/ (os cabeçalhos do próprio tcc) e COPYING (LGPL v2.1). Os cabeçalhos
# da libc são os mínimos do MaiSim (simu/controle_c/libc). No Windows, o pacote leva o tcc oficial (pacote/windows/monta.sh).
# uso: pacote/tcc.sh <destino>   (os pacotes: <MaiSim>/maisim/tcc; o CI: pacote/.build/tcc)
set -euo pipefail
R="$(cd "$(dirname "$0")/.." && pwd)"
. "$R/config/fala.sh"
COMMIT=aade7bafb59641660bc9a0e21ad0a9a4a1ed346e   # tinycc mob, 09/11/2026 (tcc version 0.9.28rc)
DEST=${1:?"uso: pacote/tcc.sh <destino>"}
C="$R/pacote/.cache"; mkdir -p "$C"
F="$C/tinycc-$COMMIT"
if [ ! -d "$F/.git" ]; then
  rm -rf "$F"; git clone -q https://repo.or.cz/tinycc.git "$F" || git clone -q https://github.com/TinyCC/tinycc.git "$F"
fi
git -C "$F" checkout -q "$COMMIT" && [ "$(git -C "$F" rev-parse HEAD)" = "$COMMIT" ] \
  || { fala "tcc: o commit $COMMIT da fonte não confere" "tcc: the source commit $COMMIT does not match" >&2; exit 1; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
git -C "$F" archive "$COMMIT" | tar x -C "$T"
# estático: o AppImage roda em sistemas com um glibc mais antigo que o da máquina que monta (o tcc só compila para arquivo:
# não precisa do dlopen); a biblioteca do controle que ele gera acha a libc e a libm do sistema ao carregar
if ! (cd "$T" && ./configure --prefix="$T/inst" --extra-ldflags=-static --config-bcheck=no > "$T/build.log" 2>&1 && make -j"$(nproc)" >> "$T/build.log" 2>&1 \
      && make install >> "$T/build.log" 2>&1); then
  fala "tcc: não compilou" "tcc: the build failed" >&2; tail -20 "$T/build.log" >&2; exit 1
fi
rm -rf "$DEST"; mkdir -p "$DEST"
cp "$T/inst/bin/tcc" "$T/inst/lib/tcc/libtcc1.a" "$T/COPYING" "$DEST/"
cp -r "$T/inst/lib/tcc/include" "$DEST/"
fala "tcc: pronto → $DEST ($("$DEST/tcc" -v 2>&1 | head -1))" "tcc: done → $DEST ($("$DEST/tcc" -v 2>&1 | head -1))"
