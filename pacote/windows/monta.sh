#!/usr/bin/env bash
# O instalador do MaiSim para Windows (MaiSim-Setup-<versão>.exe), montado no Linux/WSL: baixa os runtimes oficiais do
# Windows em versões fixas (conferidos pelo SHA-256 de pacote/windows/sha256.txt), monta a pasta do programa e compila o
# MaiSim.iss com o Inno Setup num container (amake/innosetup), como o instalador do tos-portable.
#   python/  o Python embutível 3.11 (python.org) + o NumPy e o matplotlib (as wheels win_amd64; o matplotlib: o módulo
#            Figuras), com o ._pth apontando para o MaiSim
#   jre/     o Java (JRE Temurin 11 para Windows)
#   maisim/  o código desta versão (git archive), o Gecko com os patches, o motor compilado, o Monaco local
# Precisa: git, curl, unzip, Java/javac 11 e Maven (o Gecko e o motor), Python 3 com Pillow (as imagens) e docker.
# uso: pacote/windows/monta.sh   →   pacote/dist/MaiSim-Setup-<versão>.exe (+ .sha256)
set -euo pipefail
R="$(cd "$(dirname "$0")/../.." && pwd)"
. "$R/config/fala.sh"
V=$(tr -d ' \n' < "$R/VERSION")
C="$R/pacote/.cache"; OUT="$R/pacote/dist"; B="$R/pacote/.build/win"; P="$B/MaiSim"
mkdir -p "$C" "$OUT"; rm -rf "$B"; mkdir -p "$P"

PY_URL=https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip
NP_URL=https://files.pythonhosted.org/packages/31/0a/f354fb7176b81747d870f7991dc763e157a934c717b67b58456bc63da3df/numpy-2.2.6-cp311-cp311-win_amd64.whl
JRE_URL=https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.32.1%2B1/OpenJDK11U-jre_x64_windows_hotspot_11.0.32.1_1.zip
# o matplotlib (as figuras para artigo, o módulo Figuras) e as dependências dele, em versões fixas (as do CI)
MPL_URLS=(
  https://files.pythonhosted.org/packages/6f/d3/a4bbc01c237ab710a1f22b4da72f4ff6d77eb4c7735ea9811a94ae239067/matplotlib-3.10.8-cp311-cp311-win_amd64.whl
  https://files.pythonhosted.org/packages/5e/fe/4029038b4e1c4485cef18e480b0e2cd2d755448bb071eb9977caac80b77b/contourpy-1.3.2-cp311-cp311-win_amd64.whl
  https://files.pythonhosted.org/packages/e7/05/c19819d5e3d95294a6f5947fb9b9629efb316b96de511b418c53d245aae6/cycler-0.12.1-py3-none-any.whl
  https://files.pythonhosted.org/packages/77/ce/f5a4c42c117f8113ce04048053c128d17426751a508f26398110c993a074/fonttools-4.62.0-cp311-cp311-win_amd64.whl
  https://files.pythonhosted.org/packages/be/6c/28f17390b62b8f2f520e2915095b3c94d88681ecf0041e75389d9667f202/kiwisolver-1.5.0-cp311-cp311-win_amd64.whl
  https://files.pythonhosted.org/packages/05/8e/8de486cbd03baba4deef4142bd643a3e7bbe954a784dc1bb17142572d127/packaging-21.3-py3-none-any.whl
  https://files.pythonhosted.org/packages/31/03/bef822e4f2d8f9d7448c133d0a18185d3cce3e70472774fffefe8b0ed562/pillow-12.1.1-cp311-cp311-win_amd64.whl
  https://files.pythonhosted.org/packages/10/bd/c038d7cc38edc1aa5bf91ab8068b63d4308c66c4c8bb3cbba7dfbc049f9c/pyparsing-3.3.2-py3-none-any.whl
  https://files.pythonhosted.org/packages/ec/57/56b9bcc3c9c6a792fcbaf139543cee77261f3651ca9da0c93f5c1221264b/python_dateutil-2.9.0.post0-py2.py3-none-any.whl
  https://files.pythonhosted.org/packages/d9/5a/e7c31adbe875f2abbb91bd84cf2dc52d792b5a01506781dbcf25c91daf11/six-1.16.0-py2.py3-none-any.whl
)
baixa() {   # baixa uma vez (fica no cache) e confere o SHA-256 guardado
  local url=$1 arq=$C/$(basename "${1//%2B/+}")
  [ -f "$arq" ] || curl -fsSL -o "$arq" "$url"
  local esperado; esperado=$(grep " $(basename "$arq")\$" "$R/pacote/windows/sha256.txt" | cut -d' ' -f1 || true)
  [ -n "$esperado" ] || { fala "pacote: sem SHA-256 guardado para $(basename "$arq")" "package: no stored SHA-256 for $(basename "$arq")" >&2; exit 1; }
  echo "$esperado  $arq" | sha256sum -c --quiet - || { fala "pacote: o SHA-256 de $(basename "$arq") não confere" "package: $(basename "$arq") SHA-256 does not match" >&2; exit 1; }
  echo "$arq"
}

fala "pacote: MaiSim $V para Windows (instalador)" "package: MaiSim $V for Windows (installer)"
mkdir -p "$P/python/Lib/site-packages"
unzip -q "$(baixa "$PY_URL")" -d "$P/python"
unzip -q "$(baixa "$NP_URL")" -d "$P/python/Lib/site-packages"
for u in "${MPL_URLS[@]}"; do unzip -qo "$(baixa "$u")" -d "$P/python/Lib/site-packages"; done
ls "$P"/python/Lib/site-packages/matplotlib/ft2font*.pyd > /dev/null 2>&1 \
  || { fala "pacote: o matplotlib não ficou no Python do instalador" "package: matplotlib did not land in the installer's Python" >&2; exit 1; }
# o Python embutível só enxerga o que o ._pth diz: o stdlib, o NumPy e as pastas do MaiSim (os servidores importam os vizinhos)
printf '%s\r\n' python311.zip . 'Lib\site-packages' '..\maisim\simu' '..\maisim\scope' '..\maisim\config' '..\maisim\app' 'import site' > "$P/python/python311._pth"
T=$(mktemp -d); unzip -q "$(baixa "$JRE_URL")" -d "$T"; mv "$T"/*/ "$P/jre"; rm -rf "$T"
mkdir -p "$P/maisim"; (cd "$R" && git archive HEAD) | tar x -C "$P/maisim"
bash "$R/gecko/construir.sh" > /dev/null
mkdir -p "$P/maisim/gecko/build"; cp "$R/gecko/build/gecko-lote.jar" "$P/maisim/gecko/build/"
M="$P/maisim/simu/motor"; mkdir -p "$M/bin"
javac -nowarn -encoding UTF-8 -cp "$R/gecko/build/gecko-lote.jar" -d "$M/bin" "$M/src/maisim/MaiSimMotor.java"
bash "$P/maisim/simu/vendor.sh" > /dev/null
rm -rf "$P/maisim/simu/validacao" "$P/maisim/.github" "$P/maisim/pacote" "$P/jre/legal"
find "$P" -name "__pycache__" -prune -exec rm -rf {} +
python3 "$R/pacote/windows/imagens.py" "$B/imagens" > /dev/null

# o Inno Setup roda no container com outro usuário (no CI, o runner é outro uid): as pastas que ele grava, liberadas
chmod -R a+rwX "$OUT" "$B"   # só as pastas geradas (a saída e a montagem); os arquivos do repositório ficam como estão
fala "pacote: compilando o instalador (Inno Setup, docker)…" "package: compiling the installer (Inno Setup, docker)…"
docker run --rm -v "$R":/work -w /work/pacote/windows amake/innosetup:latest "/DVersao=$V" "/DFonte=..\\.build\\win\\MaiSim" "/DImagens=..\\.build\\win\\imagens" MaiSim.iss > "$B/iscc.log" 2>&1 \
  || { tail -20 "$B/iscc.log" >&2; exit 1; }
S="$OUT/MaiSim-Setup-$V.exe"
(cd "$OUT" && sha256sum "$(basename "$S")" > "$(basename "$S").sha256")
fala "pacote: pronto → $S ($(du -h "$S" | cut -f1))" "package: done → $S ($(du -h "$S" | cut -f1))"
