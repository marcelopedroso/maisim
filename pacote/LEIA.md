# MaiSim / pacote — o MaiSim para "só usar"

Três jeitos de ter o MaiSim, o mesmo código:
- **de programador:** `git clone` e `app/scripts/maisim.sh` (o README);
- **Linux:** um AppImage — baixa, marca como executável e abre (`pacote/linux/monta.sh`);
- **Windows:** um instalador `.exe` (`pacote/windows/monta.sh`).

Os pacotes levam dentro o Python (com o NumPy), o Java, o Gecko com os patches e o motor do editor já compilados, o
TinyCC (o controle em C, sem compilador no sistema: `pacote/tcc.sh`; no Windows, o oficial) e o Monaco local: funcionam sem internet e sem instalar nada além, no Linux, da tela virtual (`sudo apt install -y xvfb
x11-utils libxtst6`). Abrem pelo `app/lancador.py --produto --abrir`: os dados de quem usa ficam à vista (`~/MaiSim`;
no Windows, `Documentos\MaiSim`), o cache em `~/.cache/maisim` e a config pessoal (a porta: `MAISIM_PORTA=8100`) em
`~/.config/maisim/maisim.env` (no Windows, `%APPDATA%\MaiSim\maisim.env`).

## Linux (AppImage)

```bash
pacote/linux/monta.sh        # → pacote/dist/MaiSim-<versão>-<x86_64|aarch64>.AppImage (+ .sha256; no ARM, + a pasta .tar.gz)
pacote/linux/fumaca.sh       # o teste de fumaça do pacote montado: sobe, roda o buck, gera um PDF no Figuras, para
```

- O AppRun confere o que o MaiSim precisa do sistema (`xvfb libxtst6 libxrender1 libxi6 libxext6 fontconfig
  fonts-dejavu-core`, no Debian/Ubuntu): como root (o Ubuntu do Termux), instala o que faltar; senão, diz o comando. No
  Android (o kernel diz "android"), não abre navegador nem vigia a janela (trocar de app não é fechar o MaiSim).
- Android: `pacote/android/instala.sh` (no Termux, por `curl … | bash`) instala o Ubuntu (proot-distro), a pasta em
  `~/maisim-app` e o comando `maisim`; a pasta se atualiza pelo botão Atualizar (troca a pasta inteira; os dados ficam em
  `~/MaiSim`).
- A arquitetura é a da máquina que monta (o Python portátil roda lá para instalar o NumPy e o matplotlib dela): x86_64
  ou aarch64 (o CI monta o ARM num runner `ubuntu-24.04-arm`). O ARM sai também em pasta (`MaiSim-<v>-aarch64.tar.gz`,
  com `MaiSim/AppRun`), para onde não há FUSE (o proot do Termux no Android); a pasta avisa das versões novas, mas não se
  troca sozinha.

- Os runtimes em versões fixas, conferidos pelo SHA-256 guardado em `pacote/linux/sha256.txt` (os oficiais: o
  `SHA256SUMS` do python-build-standalone e o checksum da API da Adoptium): Python 3.11 (python-build-standalone) e JRE
  Temurin 11; o NumPy pelo pip, na versão fixa do script; o TinyCC (mob 0.9.28rc, num commit fixo; o 0.9.27 lançado não gera biblioteca compartilhada no aarch64) compilado da fonte (`pacote/tcc.sh`, o hash do commit confere a fonte). O cache dos downloads fica em `pacote/.cache` (fora do git).
- Precisa, para montar: git, curl, Java/javac 11 e Maven (o Gecko: `gecko/construir.sh`).
- Usar: `chmod +x MaiSim-*.AppImage && ./MaiSim-*.AppImage`; parar: o mesmo com `--parar` (ou Ctrl+C no terminal). Sem
  FUSE (o WSL, alguns containers): `./MaiSim-*.AppImage --appimage-extract-and-run`.
- O AppImage é só leitura: o MaiSim não escreve na pasta dele (o motor já vai compilado; os dados e o cache ficam fora).

## Windows (instalador)

```bash
pacote/windows/monta.sh      # → pacote/dist/MaiSim-Setup-<versão>.exe (+ .sha256)   (no WSL/Linux, com docker)
```

- Dentro: o Python embutível 3.11 (python.org) + NumPy (a wheel win_amd64), o JRE Temurin 11 para Windows (versões fixas,
  SHA-256 em `pacote/windows/sha256.txt`), o TinyCC 0.9.27 oficial para win64, o Gecko, o motor compilado, o Monaco local; o `._pth` do Python aponta para as
  pastas do MaiSim. O Inno Setup roda no container `amake/innosetup` (`pacote/windows/MaiSim.iss`).
- O assistente (pt/en, com as imagens da marca): onde instalar (`%LOCALAPPDATA%\Programs\MaiSim`, sem administrador),
  onde ficam os circuitos (`Documentos\MaiSim`), a porta (confere se está livre: o WSL repassa a porta de um MaiSim de lá),
  atalhos (abrir, desligar, a pasta dos circuitos), créditos. Grava a porta e a pasta em `%APPDATA%\MaiSim\maisim.env`.
- Atualizar: o instalador novo por cima (o programa é trocado inteiro; os dados ficam). Desinstalar pergunta se apaga os
  dados (padrão: não).
