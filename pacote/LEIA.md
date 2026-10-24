# MaiSim / pacote — o MaiSim para "só usar"

Três jeitos de ter o MaiSim, o mesmo código:
- **de programador:** `git clone` e `app/scripts/maisim.sh` (o README);
- **Linux:** um AppImage — baixa, marca como executável e abre (`pacote/linux/monta.sh`);
- **Windows:** um instalador `.exe` (`pacote/windows/monta.sh`).

Os pacotes levam dentro o Python (com o NumPy), o Java, o Gecko com os patches e o motor do editor já compilados, e o
Monaco local: funcionam sem internet e sem instalar nada além, no Linux, da tela virtual (`sudo apt install -y xvfb
x11-utils libxtst6`). Abrem pelo `app/lancador.py --produto --abrir`: os dados de quem usa ficam à vista (`~/MaiSim`;
no Windows, `Documentos\MaiSim`), o cache em `~/.cache/maisim` e a config pessoal (a porta: `MAISIM_PORTA=8100`) em
`~/.config/maisim/maisim.env` (no Windows, `%APPDATA%\MaiSim\maisim.env`).

## Linux (AppImage)

```bash
pacote/linux/monta.sh        # → pacote/dist/MaiSim-<versão>-x86_64.AppImage (+ .sha256)
```

- Os runtimes em versões fixas, conferidos pelo SHA-256 guardado em `pacote/linux/sha256.txt` (os oficiais: o
  `SHA256SUMS` do python-build-standalone e o checksum da API da Adoptium): Python 3.11 (python-build-standalone) e JRE
  Temurin 11; o NumPy pelo pip, na versão fixa do script. O cache dos downloads fica em `pacote/.cache` (fora do git).
- Precisa, para montar: git, curl, Java/javac 11 e Maven (o Gecko: `gecko/construir.sh`).
- Usar: `chmod +x MaiSim-*.AppImage && ./MaiSim-*.AppImage`; parar: o mesmo com `--parar` (ou Ctrl+C no terminal). Sem
  FUSE (o WSL, alguns containers): `./MaiSim-*.AppImage --appimage-extract-and-run`.
- O AppImage é só leitura: o MaiSim não escreve na pasta dele (o motor já vai compilado; os dados e o cache ficam fora).

## Windows (instalador)

```bash
pacote/windows/monta.sh      # → pacote/dist/MaiSim-Setup-<versão>.exe (+ .sha256)   (no WSL/Linux, com docker)
```

- Dentro: o Python embutível 3.11 (python.org) + NumPy (a wheel win_amd64), o JRE Temurin 11 para Windows (versões fixas,
  SHA-256 em `pacote/windows/sha256.txt`), o Gecko, o motor compilado, o Monaco local; o `._pth` do Python aponta para as
  pastas do MaiSim. O Inno Setup roda no container `amake/innosetup` (`pacote/windows/MaiSim.iss`).
- O assistente (pt/en, com as imagens da marca): onde instalar (`%LOCALAPPDATA%\Programs\MaiSim`, sem administrador),
  onde ficam os circuitos (`Documentos\MaiSim`), a porta (confere se está livre: o WSL repassa a porta de um MaiSim de lá),
  atalhos (abrir, desligar, a pasta dos circuitos), créditos. Grava a porta e a pasta em `%APPDATA%\MaiSim\maisim.env`.
- Atualizar: o instalador novo por cima (o programa é trocado inteiro; os dados ficam). Desinstalar pergunta se apaga os
  dados (padrão: não).
