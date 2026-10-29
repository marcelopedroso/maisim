#!/usr/bin/env bash
# O atalho "MaiSim (dev)" na área de trabalho do Windows, para a versão de programador no WSL (Marcelo, 28/10: "um atalho
# no desktop do Windows que abre sem abrir o navegador"): dois cliques ligam o MaiSim no WSL (app/scripts/maisim.sh
# --abrir, o lançador: fechar a janela desliga), sem janela de console, e abrem a janela do MaiSim — o app instalado no
# Chrome/Edge, se MAISIM_APP_ID estiver no .env (o ícone grande na barra de tarefas), senão a janela --app. Com o MaiSim
# no ar, só a janela. Põe em %LOCALAPPDATA%\MaiSim-dev\ o ícone (o favicon.ico, 16–256 px) e o abrir.vbs (o wsl.exe
# escondido), e o atalho na área de trabalho. Rodar de novo refaz (o caminho do clone ou a distro mudou).
# uso: app/scripts/atalho_windows.sh [--mostrar | --remover]   (--mostrar: só diz o que faria)
set -u
APP="$(cd "$(dirname "$0")/.." && pwd)"; RAIZ="$(cd "$APP/.." && pwd)"
. "$RAIZ/config/fala.sh"                                   # fala pt en: as mensagens no idioma do terminal
MODO=${1:-}
case "$MODO" in ""|--mostrar|--remover) ;; *) fala "uso: $0 [--mostrar | --remover]" "usage: $0 [--mostrar | --remover]"; exit 2;; esac
PS=/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
NO_WSL=; grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null && [ -x "$PS" ] && NO_WSL=1
if [ -z "$NO_WSL" ] && [ "$MODO" != --mostrar ]; then
  fala "maisim: o atalho é para o Windows, com o MaiSim no WSL (aqui não é o WSL)" \
       "maisim: the shortcut is for Windows, with MaiSim in WSL (this is not WSL)"; exit 1; fi
# a distro (o nome que o wsl.exe -d entende): a do ambiente, ou a do caminho de rede da raiz (\\wsl.localhost\Ubuntu-22.04\)
DISTRO=${WSL_DISTRO_NAME:-}
if [ -z "$DISTRO" ] && command -v wslpath > /dev/null; then d=$(wslpath -w / 2>/dev/null); d=${d%\\}; DISTRO=${d##*\\}; fi
DISTRO=${DISTRO:-"<distro>"}
if [ -n "$NO_WSL" ]; then
  mapfile -t W < <("$PS" -NoProfile -Command '$env:LOCALAPPDATA; [Environment]::GetFolderPath("Desktop")' 2>/dev/null | tr -d '\r')
  LOCAL=${W[0]:-}; MESA=${W[1]:-}
fi
LOCAL=${LOCAL:-"%LOCALAPPDATA%"}; MESA=${MESA:-"%USERPROFILE%\\Desktop"}
PASTA_W="$LOCAL\\MaiSim-dev"; LNK_W="$MESA\\MaiSim (dev).lnk"
CMD="wsl.exe -d $DISTRO --cd \"$RAIZ\" -- bash -lc \"exec app/scripts/maisim.sh --abrir\""
if [ "$MODO" = --mostrar ]; then
  echo "atalho: $LNK_W"
  echo "alvo: %WINDIR%\\System32\\wscript.exe \"$PASTA_W\\abrir.vbs\""
  echo "ícone: $PASTA_W\\maisim.ico"
  echo "abrir.vbs roda, escondido: $CMD"
  [ -n "$(cd "$RAIZ" && python3 config/ler_config.py --shell 2>/dev/null | grep -E "^export MAISIM_APP_ID='?[a-p]{32}")" ] \
    && echo "janela: o app instalado (MAISIM_APP_ID)" || echo "janela: a do --app (sem MAISIM_APP_ID no .env)"
  exit 0
fi
PASTA=$(wslpath -u "$PASTA_W"); LNK=$(wslpath -u "$LNK_W")
if [ "$MODO" = --remover ]; then
  rm -f "$LNK"; rm -rf "$PASTA"
  fala "maisim: atalho removido ($LNK_W)" "maisim: shortcut removed ($LNK_W)"; exit 0
fi
mkdir -p "$PASTA" || exit 1
cp "$RAIZ/app/public/favicon.ico" "$PASTA/maisim.ico" || exit 1
vb=${CMD//\"/\"\"}                                          # no VBScript, a aspa dentro do texto vai dobrada
printf "' MaiSim (dev): liga o MaiSim no WSL (o lancador, sem janela de console) e abre a janela\r\nCreateObject(\"WScript.Shell\").Run \"%s\", 0, False\r\n" "$vb" > "$PASTA/abrir.vbs"
ps=${PASTA_W//\'/\'\'}; lk=${LNK_W//\'/\'\'}               # no PowerShell, entre aspas simples, a aspa simples vai dobrada
printf '\xef\xbb\xbf$s = (New-Object -ComObject WScript.Shell).CreateShortcut('"'%s'"')\r\n$s.TargetPath = "$env:WINDIR\\System32\\wscript.exe"\r\n$s.Arguments = '"'"'"%s\\abrir.vbs"'"'"'\r\n$s.WorkingDirectory = '"'%s'"'\r\n$s.IconLocation = '"'%s\\maisim.ico,0'"'\r\n$s.Description = '"'MaiSim (versão dev no WSL)'"'\r\n$s.Save()\r\n' \
  "$lk" "$ps" "$ps" "$ps" > "$PASTA/atalho.ps1"
"$PS" -NoProfile -ExecutionPolicy Bypass -File "$PASTA_W\\atalho.ps1" 2>&1 | tr -d '\r' | grep -v '^$'
if [ ! -f "$LNK" ]; then fala "maisim: o atalho não foi criado (veja $PASTA_W\\atalho.ps1)" "maisim: the shortcut was not created (see $PASTA_W\\atalho.ps1)"; exit 1; fi
fala "maisim: atalho pronto na área de trabalho: $LNK_W" "maisim: shortcut ready on the desktop: $LNK_W"
if ! (cd "$RAIZ" && python3 config/ler_config.py --shell 2>/dev/null | grep -qE "^export MAISIM_APP_ID='?[a-p]{32}"); then
  fala "maisim: para a janela com o ícone grande, instale o MaiSim como app no Chrome (⋮ → Transmitir, salvar e compartilhar →
  Instalar página como app) e ponha o id dele (chrome://web-app-internals) no .env: MAISIM_APP_ID=…" \
       "maisim: for the window with the large icon, install MaiSim as an app in Chrome (⋮ → Cast, save, and share → Install page
  as app) and put its id (chrome://web-app-internals) in .env: MAISIM_APP_ID=…"
fi
