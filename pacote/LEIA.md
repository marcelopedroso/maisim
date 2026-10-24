# MaiSim / pacote — o MaiSim para "só usar"


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
