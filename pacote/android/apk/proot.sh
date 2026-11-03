#!/usr/bin/env bash
# o proot e o loader dele para o APK (arm64), como lib*.so em app/src/main/jniLibs/arm64-v8a: os binários prontos do Local
# Desktop (github.com/localdesktop/localdesktop, GPL-3.0; o proot é o do Termux, GPL-2.0, compilado pelo build-proot-android,
# MIT), num commit fixo e conferidos pelo SHA-256. Ver NOTICE.md. (Um dia: compilar o termux/proot aqui, com o NDK.)
set -euo pipefail
cd "$(dirname "$0")"
COMMIT=99f46b3bfd0cb2ede8a6da7108f40292e4110a8c
D=app/src/main/jniLibs/arm64-v8a
mkdir -p "$D"
while read -r soma nome; do
  if [ -f "$D/$nome" ] && echo "$soma  $D/$nome" | sha256sum -c --quiet - 2> /dev/null; then continue; fi
  curl -fsSL -o "$D/$nome" "https://raw.githubusercontent.com/localdesktop/localdesktop/$COMMIT/assets/libs/arm64-v8a/$nome"
  echo "$soma  $D/$nome" | sha256sum -c --quiet -
done <<'SOMAS'
1edb12dc4f1b9b834570591869d064dab9b264b5b6f3133da384bcce4a2e1351 libproot.so
cf4f87772e1baf5950e35af9a729a1402898a81492e0aa011bcde3007455ddc8 libproot_loader.so
SOMAS
echo "proot: $D (conferido)"
