#!/usr/bin/env bash
# O TinyCC embutido nos pacotes do Linux (o controle em C sem compilador no sistema): baixa a fonte fixa do tcc 0.9.27
# (savannah), confere o SHA-256 e compila na arquitetura da máquina (x86_64 ou aarch64): sem o bcheck (a verificação de
# memória: não compila com o glibc de hoje e o MaiSim não usa) e estático (sem depender do glibc de quem usa). Deixa em
# <destino> o layout que o simu/sinais_c.py reconhece: tcc, libtcc1.a, include/ (os cabeçalhos do próprio tcc) e COPYING
# (LGPL v2.1). Os cabeçalhos da libc são os mínimos do MaiSim (simu/controle_c/libc). No Windows, o pacote leva o tcc
# oficial (pacote/windows/monta.sh).
# uso: pacote/tcc.sh <destino>   (os pacotes: <MaiSim>/maisim/tcc; o CI: pacote/.build/tcc)
set -euo pipefail
R="$(cd "$(dirname "$0")/.." && pwd)"
. "$R/config/fala.sh"
V=0.9.27
SHA=de23af78fca90ce32dff2dd45b3432b2334740bb9bb7b05bf60fdbfc396ceb9c   # tcc-0.9.27.tar.bz2
DEST=${1:?"uso: pacote/tcc.sh <destino>"}
C="$R/pacote/.cache"; mkdir -p "$C"
ARQ="$C/tcc-$V.tar.bz2"
[ -f "$ARQ" ] || curl -fsSL -o "$ARQ" "https://download.savannah.gnu.org/releases/tinycc/tcc-$V.tar.bz2"
echo "$SHA  $ARQ" | sha256sum -c --quiet - || { fala "tcc: o SHA-256 da fonte não confere" "tcc: the source SHA-256 does not match" >&2; exit 1; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
tar xjf "$ARQ" -C "$T" --strip-components=1
# estático: o AppImage roda em sistemas com um glibc mais antigo que o da máquina que monta (o tcc só compila para arquivo:
# não precisa do dlopen); a biblioteca do controle que ele gera acha a libc e a libm do sistema ao carregar
if ! (cd "$T" && ./configure --prefix="$T/inst" --extra-ldflags=-static > "$T/build.log" 2>&1 && make -j"$(nproc)" BCHECK_O= >> "$T/build.log" 2>&1 \
      && make install BCHECK_O= >> "$T/build.log" 2>&1); then
  fala "tcc: não compilou" "tcc: the build failed" >&2; tail -20 "$T/build.log" >&2; exit 1
fi
rm -rf "$DEST"; mkdir -p "$DEST"
cp "$T/inst/bin/tcc" "$T/inst/lib/tcc/libtcc1.a" "$T/COPYING" "$DEST/"
cp -r "$T/inst/lib/tcc/include" "$DEST/"
fala "tcc: pronto → $DEST ($("$DEST/tcc" -v 2>&1 | head -1))" "tcc: done → $DEST ($("$DEST/tcc" -v 2>&1 | head -1))"
