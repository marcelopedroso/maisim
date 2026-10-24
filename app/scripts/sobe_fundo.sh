#!/usr/bin/env bash
# Sobe o MaiSim em segundo plano (o maisim.sh inteiro, solto de qualquer terminal) se a página ainda não responde, e
# espera ela responder. É o que um atalho na área de trabalho chama antes de abrir a janela. O que ele sobe fica no ar
# até alguém derrubar: app/scripts/para_fundo.sh (o maisim.sh derruba o que subiu; o Gecko só sem circuito por salvar).
# Registro: $MAISIM_CACHE/logs/fundo.log
set -u
APP="$(cd "$(dirname "$0")/.." && pwd)"; RAIZ="$(cd "$APP/.." && pwd)"
eval "$(python3 "$RAIZ/config/ler_config.py" --shell)"
. "$RAIZ/config/fala.sh"                                   # fala pt en: as mensagens no idioma do terminal
URL="http://localhost:$MAISIM_PORTA_PAGINA/"
no_ar() { curl -s -o /dev/null --max-time 2 "$URL"; }
if no_ar; then fala "maisim: já no ar em $URL" "maisim: already running at $URL"; exit 0; fi
command -v node > /dev/null || { [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"; }   # o node do nvm (fora de um terminal interativo)
command -v node > /dev/null || { fala "maisim: falta o node (instale com o nvm)" "maisim: node is missing (install it with nvm)"; exit 1; }
mkdir -p "$MAISIM_CACHE/logs"
setsid nohup bash "$APP/scripts/maisim.sh" > "$MAISIM_CACHE/logs/fundo.log" 2>&1 < /dev/null &
echo $! > "$MAISIM_CACHE/fundo.pid"
for _ in $(seq 1 90); do no_ar && { fala "maisim: no ar em $URL (o Gecko termina de subir sozinho, ~1 min)" \
  "maisim: running at $URL (Gecko finishes starting on its own, ~1 min)"; exit 0; }; sleep 0.5; done
fala "maisim: a página não respondeu em 45 s (veja $MAISIM_CACHE/logs/fundo.log)" \
     "maisim: the page did not answer within 45 s (see $MAISIM_CACHE/logs/fundo.log)"; exit 1
