#!/usr/bin/env bash
# O instalador do MaiSim para Windows (MaiSim-Setup-<versão>.exe), montado no Linux/WSL: baixa os runtimes oficiais do
# Windows em versões fixas (conferidos pelo SHA-256 de pacote/windows/sha256.txt), monta a pasta do programa e compila o
# MaiSim.iss com o Inno Setup num container (amake/innosetup), como o instalador do tos-portable.
#   python/  o Python embutível 3.11 (python.org) + o NumPy (a wheel win_amd64), com o ._pth apontando para o MaiSim
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

fala "pacote: compilando o instalador (Inno Setup, docker)…" "package: compiling the installer (Inno Setup, docker)…"
docker run --rm -v "$R":/work -w /work/pacote/windows amake/innosetup:latest "/DVersao=$V" "/DFonte=..\\.build\\win\\MaiSim" "/DImagens=..\\.build\\win\\imagens" MaiSim.iss > "$B/iscc.log" 2>&1 \
  || { tail -20 "$B/iscc.log" >&2; exit 1; }
S="$OUT/MaiSim-Setup-$V.exe"
(cd "$OUT" && sha256sum "$(basename "$S")" > "$(basename "$S").sha256")
fala "pacote: pronto → $S ($(du -h "$S" | cut -f1))" "package: done → $S ($(du -h "$S" | cut -f1))"
