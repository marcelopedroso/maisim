#!/usr/bin/env bash
# O MaiSim para Linux num arquivo só (AppImage): baixa, marca como executável e abre, sem instalar nada além da tela virtual
# (Xvfb, do sistema). Leva dentro: um Python portátil (python-build-standalone) com o NumPy, um Java (JRE Temurin 11), o
# Gecko com os patches (gecko/construir.sh), o motor do editor compilado, o Monaco local (simu/vendor.sh) e o código do
# MaiSim desta versão (git archive). O AppRun chama app/lancador.py --produto --abrir (os dados em ~/MaiSim).
#
# Precisa: git, curl, java/javac 11 e mvn (para o Gecko e o motor); o appimagetool vem daqui (1.9.1, conferido).
# Os runtimes em versões fixas, conferidos pelo SHA-256 (o cache fica em pacote/.cache, fora do git).
# uso: pacote/linux/monta.sh   →   pacote/dist/MaiSim-<versão>-x86_64.AppImage (+ .sha256)
set -euo pipefail
R="$(cd "$(dirname "$0")/../.." && pwd)"
. "$R/config/fala.sh"
V=$(tr -d ' \n' < "$R/VERSION")
C="$R/pacote/.cache"; OUT="$R/pacote/dist"; A="$R/pacote/.build/MaiSim.AppDir"
mkdir -p "$C" "$OUT"; rm -rf "$A"; mkdir -p "$A"

PY_URL=https://github.com/astral-sh/python-build-standalone/releases/download/20261021/cpython-3.11.17+20261021-x86_64-unknown-linux-gnu-install_only.tar.gz
JRE_URL=https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.32.1%2B1/OpenJDK11U-jre_x64_linux_hotspot_11.0.32.1_1.tar.gz
NUMPY=2.2.6
baixa() {   # baixa uma vez (fica no cache) e confere o SHA-256 guardado em pacote/linux/sha256.txt
  local url=$1 arq=$C/$(basename "${1//%2B/+}")
  [ -f "$arq" ] || curl -fsSL -o "$arq" "$url"
  local esperado; esperado=$(grep " $(basename "$arq")\$" "$R/pacote/linux/sha256.txt" | cut -d' ' -f1 || true)
  if [ -z "$esperado" ]; then fala "pacote: sem SHA-256 guardado para $(basename "$arq")" "package: no stored SHA-256 for $(basename "$arq")" >&2; exit 1; fi
  echo "$esperado  $arq" | sha256sum -c --quiet - || { fala "pacote: o SHA-256 de $(basename "$arq") não confere" "package: $(basename "$arq") SHA-256 does not match" >&2; exit 1; }
  echo "$arq"
}

fala "pacote: MaiSim $V para Linux (AppImage)" "package: MaiSim $V for Linux (AppImage)"
tar xzf "$(baixa "$PY_URL")" -C "$A"                                  # → $A/python
"$A/python/bin/python3" -m pip install --quiet --no-cache-dir --disable-pip-version-check "numpy==$NUMPY"
mkdir -p "$A/jre"; tar xzf "$(baixa "$JRE_URL")" -C "$A/jre" --strip-components=1
mkdir -p "$A/maisim"; (cd "$R" && git archive HEAD) | tar x -C "$A/maisim"   # o código desta versão (sem o que não está no git)
bash "$R/gecko/construir.sh" > /dev/null
mkdir -p "$A/maisim/gecko/build"; cp "$R/gecko/build/gecko-lote.jar" "$A/maisim/gecko/build/"
M="$A/maisim/simu/motor"; mkdir -p "$M/bin"
javac -nowarn -encoding UTF-8 -cp "$R/gecko/build/gecko-lote.jar" -d "$M/bin" "$M/src/maisim/MaiSimMotor.java"
bash "$A/maisim/simu/vendor.sh" > /dev/null
find "$A" -name "__pycache__" -prune -exec rm -rf {} +; rm -rf "$A/python/lib/python3.11/test" "$A/jre/legal" "$A/maisim/simu/validacao" "$A/maisim/.github"

cat > "$A/AppRun" <<'RUN'
#!/bin/bash
# o MaiSim de dentro do AppImage: o Java e o Python daqui, o perfil "só usar" (os dados em ~/MaiSim)
D="$(dirname "$(readlink -f "$0")")"
export MAISIM_JAVA="$D/jre/bin/java" MAISIM_GECKO_JAR="$D/maisim/gecko/build/gecko-lote.jar" PYTHONDONTWRITEBYTECODE=1
exec "$D/python/bin/python3" "$D/maisim/app/lancador.py" --produto --abrir "$@"
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

T=$(baixa https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage)   # versão fixa, conferida
chmod +x "$T"
SAIDA="$OUT/MaiSim-$V-x86_64.AppImage"
ARCH=x86_64 "$T" --appimage-extract-and-run --no-appstream "$A" "$SAIDA" > /dev/null 2>&1
(cd "$OUT" && sha256sum "$(basename "$SAIDA")" > "$(basename "$SAIDA").sha256")
fala "pacote: pronto → $SAIDA ($(du -h "$SAIDA" | cut -f1))" "package: done → $SAIDA ($(du -h "$SAIDA" | cut -f1))"
