# MaiSim para Android: o que vem de terceiros dentro do APK

- **proot** (`lib/arm64-v8a/libproot.so` e `libproot_loader.so`): o PRoot do Termux, GPL-2.0.
  Código-fonte: https://github.com/termux/proot. Os binários são os do Local Desktop
  (https://github.com/localdesktop/localdesktop, commit `99f46b3bfd0cb2ede8a6da7108f40292e4110a8c`, `assets/libs/arm64-v8a/`),
  compilados pelo build-proot-android (MIT, https://github.com/green-green-avk/build-proot-android; a versão do Local
  Desktop fica em `patches/build-proot-android` no mesmo commit), com o **talloc** estático (LGPL-3.0, https://talloc.samba.org).
- **Apache Commons Compress** (Apache-2.0), para extrair o Ubuntu e o MaiSim.

Na primeira abertura, o app baixa o **Ubuntu Base 24.04** (Canonical; os pacotes, cada um com a sua licença, em
`/usr/share/doc/*/copyright` dentro do Ubuntu do app) e o **MaiSim** (GPL-3.0, este repositório).
