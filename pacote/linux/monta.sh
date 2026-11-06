#!/usr/bin/env bash
# O MaiSim para Linux num arquivo só (AppImage), em x86_64 ou aarch64 (ARM: Raspberry Pi, notebooks ARM, o Ubuntu do
# Termux no Android): baixa, marca como executável e abre, sem instalar nada além da tela virtual
# (Xvfb, do sistema). Leva dentro: um Python portátil (python-build-standalone) com o NumPy e o matplotlib, um Java (JRE Temurin 11), o
# Gecko com os patches (gecko/construir.sh), o motor do editor compilado, o Monaco local (simu/vendor.sh) e o código do
# MaiSim desta versão (git archive). O AppRun chama app/lancador.py --produto --abrir (os dados em ~/MaiSim).
#
# Precisa: git, curl, java/javac 11 e mvn (para o Gecko e o motor); o appimagetool vem daqui (1.9.1, conferido).
# Os runtimes em versões fixas, conferidos pelo SHA-256 (o cache fica em pacote/.cache, fora do git).
# O ARM sai também numa pasta (MaiSim-<versão>-aarch64.tar.gz, com maisim-app/: o proot do Termux não tem FUSE). Monta na
# arquitetura da máquina (o Python portátil roda aqui para instalar o NumPy e o matplotlib dela): o CI usa um runner ARM.
# uso: pacote/linux/monta.sh   →   pacote/dist/MaiSim-<versão>-<x86_64|aarch64>.AppImage (+ .sha256; no ARM, + .tar.gz)
set -euo pipefail
R="$(cd "$(dirname "$0")/../.." && pwd)"
. "$R/config/fala.sh"
V=$(tr -d ' \n' < "$R/VERSION")
C="$R/pacote/.cache"; OUT="$R/pacote/dist"; A="$R/pacote/.build/MaiSim.AppDir"
mkdir -p "$C" "$OUT"; rm -rf "$A"; mkdir -p "$A"

ARCH=$(uname -m); [ "$ARCH" = arm64 ] && ARCH=aarch64
case "$ARCH" in
  x86_64) JRE_ARQ=x64;;
  aarch64) JRE_ARQ=aarch64;;
  *) fala "pacote: arquitetura não suportada: $ARCH (x86_64 ou aarch64)" "package: unsupported architecture: $ARCH (x86_64 or aarch64)" >&2; exit 1;;
esac
PY_URL=https://github.com/astral-sh/python-build-standalone/releases/download/20261021/cpython-3.11.17+20261021-$ARCH-unknown-linux-gnu-install_only.tar.gz
JRE_URL=https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.32.1%2B1/OpenJDK11U-jre_${JRE_ARQ}_linux_hotspot_11.0.32.1_1.tar.gz
NUMPY=2.2.6
# o matplotlib (as figuras para artigo, o módulo Figuras) e as dependências dele, nas versões do CI e do instalador do Windows
MPL="matplotlib==3.10.8 contourpy==1.3.2 cycler==0.12.1 fonttools==4.62.0 kiwisolver==1.5.0 packaging==21.3 pillow==12.1.1 pyparsing==3.3.2 python-dateutil==2.9.0.post0 six==1.16.0"
baixa() {   # baixa uma vez (fica no cache) e confere o SHA-256 guardado em pacote/linux/sha256.txt
  local url=$1 arq=$C/$(basename "${1//%2B/+}")
  [ -f "$arq" ] || curl -fsSL -o "$arq" "$url"
  local esperado; esperado=$(grep " $(basename "$arq")\$" "$R/pacote/linux/sha256.txt" | cut -d' ' -f1 || true)
  if [ -z "$esperado" ]; then fala "pacote: sem SHA-256 guardado para $(basename "$arq")" "package: no stored SHA-256 for $(basename "$arq")" >&2; exit 1; fi
  echo "$esperado  $arq" | sha256sum -c --quiet - || { fala "pacote: o SHA-256 de $(basename "$arq") não confere" "package: $(basename "$arq") SHA-256 does not match" >&2; exit 1; }
  echo "$arq"
}

fala "pacote: MaiSim $V para Linux $ARCH (AppImage)" "package: MaiSim $V for Linux $ARCH (AppImage)"
tar xzf "$(baixa "$PY_URL")" -C "$A"                                  # → $A/python
"$A/python/bin/python3" -m pip install --quiet --no-cache-dir --disable-pip-version-check "numpy==$NUMPY" $MPL
"$A/python/bin/python3" -c "import io, matplotlib; matplotlib.use('Agg'); from matplotlib.figure import Figure; Figure().savefig(io.BytesIO(), format='pdf')" \
  || { fala "pacote: o matplotlib do AppImage não gera figura" "package: the AppImage's matplotlib does not make a figure" >&2; exit 1; }
mkdir -p "$A/jre"; tar xzf "$(baixa "$JRE_URL")" -C "$A/jre" --strip-components=1
mkdir -p "$A/maisim"; (cd "$R" && git archive HEAD) | tar x -C "$A/maisim"   # o código desta versão (sem o que não está no git)
bash "$R/gecko/construir.sh" > /dev/null
mkdir -p "$A/maisim/gecko/build"; cp "$R/gecko/build/gecko-lote.jar" "$A/maisim/gecko/build/"
M="$A/maisim/simu/motor"; mkdir -p "$M/bin"
javac -nowarn -encoding UTF-8 -cp "$R/gecko/build/gecko-lote.jar" -d "$M/bin" "$M/src/maisim/MaiSimMotor.java"
bash "$A/maisim/simu/vendor.sh" > /dev/null
bash "$R/pacote/tcc.sh" "$A/maisim/tcc" > /dev/null   # o TinyCC: o controle em C sem compilador no sistema
find "$A" -name "__pycache__" -prune -exec rm -rf {} +; rm -rf "$A/python/lib/python3.11/test" "$A/jre/legal" "$A/maisim/simu/validacao" "$A/maisim/.github"

cat > "$A/AppRun" <<'RUN'
#!/bin/bash
# o MaiSim de dentro do pacote (o AppImage, ou a pasta maisim-app do .tar.gz): o Java e o Python daqui, o perfil "só usar"
# (os dados em ~/MaiSim, fora da pasta do programa: o Atualizar troca a pasta inteira)
D="$(dirname "$(readlink -f "$0")")"
. "$D/maisim/config/fala.sh"
export MAISIM_JAVA="$D/jre/bin/java" MAISIM_GECKO_JAR="$D/maisim/gecko/build/gecko-lote.jar" PYTHONDONTWRITEBYTECODE=1
if [ -z "${APPIMAGE:-}" ]; then                          # a pasta extraída (o .tar.gz do ARM): o Atualizar troca a pasta
  export MAISIM_PACOTE=pasta
  rm -rf "$(dirname "$D")/.$(basename "$D").antigo"     # a pasta de antes da última atualização (já não roda)
fi
# no Android (o Ubuntu do Termux): sem navegador para abrir (o do celular abre localhost:7100) e sem vigiar a janela (trocar
# de app não é fechar o MaiSim); MAISIM_NAVEGADOR=nenhum, em qualquer lugar, faz o mesmo
case "$(uname -r)" in *[Aa]ndroid*) export MAISIM_NAVEGADOR="${MAISIM_NAVEGADOR:-nenhum}";; esac
ABRIR=--abrir; [ "${MAISIM_NAVEGADOR:-}" = nenhum ] && ABRIR=
# o que o MaiSim precisa do sistema (a tela virtual do Gecko e as bibliotecas de janela do Java), no Debian/Ubuntu: como root
# (o Ubuntu do Termux), instala o que faltar, uma vez; senão, diz o comando
PRECISA="xvfb libxtst6 libxrender1 libxi6 libxext6 fontconfig fonts-dejavu-core"
case " $* " in *" --parar "*) PRECISA=;; esac
if [ -n "$PRECISA" ] && command -v dpkg > /dev/null; then
  FALTA=$(for p in $PRECISA; do dpkg -s "$p" > /dev/null 2>&1 || printf '%s ' "$p"; done)
  if [ -n "$FALTA" ]; then
    if [ "$(id -u)" = 0 ] && command -v apt-get > /dev/null; then
      fala "maisim: instalando o que falta no sistema (uma vez): $FALTA" "maisim: installing what the system is missing (once): $FALTA"
      export DEBIAN_FRONTEND=noninteractive    # (o apt em inglês: num Ubuntu mínimo o pt_BR não existe e o perl reclama)
      { LC_ALL=C LANG=C apt-get update -qq && LC_ALL=C LANG=C apt-get install -y -qq --no-install-recommends $FALTA; } > /tmp/maisim-apt.log 2>&1 \
        || { fala "maisim: não deu para instalar: $FALTA(veja /tmp/maisim-apt.log)" "maisim: could not install: $FALTA(see /tmp/maisim-apt.log)" >&2; exit 1; }
    else
      fala "maisim: falta no sistema: $FALTA— instale com: sudo apt install -y $FALTA" \
           "maisim: the system is missing: $FALTA— install it with: sudo apt install -y $FALTA" >&2
      exit 1
    fi
  fi
fi
exec "$D/python/bin/python3" "$D/maisim/app/lancador.py" --produto $ABRIR "$@"
RUN
chmod +x "$A/AppRun"
cp "$R/app/public/marca/maisim-app-512.png" "$A/maisim.png"
cat > "$A/maisim.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=MaiSim
Comment=Circuit and digital control simulation, with AI built in
Comment[pt]=Simulação de circuitos e controle digital, com IA embarcada
Exec=AppRun
Icon=maisim
Categories=Science;Engineering;Education;
Terminal=false
DESK

T=$(baixa "https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-$ARCH.AppImage")   # versão fixa, conferida
chmod +x "$T"
SAIDA="$OUT/MaiSim-$V-$ARCH.AppImage"
ARCH=$ARCH "$T" --appimage-extract-and-run --no-appstream "$A" "$SAIDA" > /dev/null 2>&1
(cd "$OUT" && sha256sum "$(basename "$SAIDA")" > "$(basename "$SAIDA").sha256")
if [ "$ARCH" = aarch64 ]; then                         # a pasta, para onde não há FUSE (o proot do Termux): MaiSim/AppRun
  PASTA="$OUT/MaiSim-$V-$ARCH.tar.gz"
  tar czf "$PASTA" -C "$(dirname "$A")" --transform "s|^MaiSim.AppDir|maisim-app|" MaiSim.AppDir   # (não MaiSim: os dados ficam em ~/MaiSim)
  (cd "$OUT" && sha256sum "$(basename "$PASTA")" > "$(basename "$PASTA").sha256")
  fala "pacote: e a pasta → $PASTA ($(du -h "$PASTA" | cut -f1))" "package: and the folder → $PASTA ($(du -h "$PASTA" | cut -f1))"
fi
fala "pacote: pronto → $SAIDA ($(du -h "$SAIDA" | cut -f1))" "package: done → $SAIDA ($(du -h "$SAIDA" | cut -f1))"
