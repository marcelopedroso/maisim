#!/usr/bin/env bash
# o vídeo do site maisim.org (repositório maisim-website, ao lado deste): grava o buck na instância de teste e monta o
# .webm e a capa em ../maisim-website/public/img (ou na pasta dada). O perfil de teste não publica as rodadas no scope (de
# propósito, para os testes); aqui o simu de teste sobe publicando no scope de teste só durante a gravação, e no fim
# volta ao normal (reinicia_servidor_teste.sh). Nada disso toca o MaiSim de uso.
set -eu
AQUI="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$AQUI/../../.." && pwd)"
SAIDA="${1:-$R/../maisim-website/public/img}"
volta() { "$R/simu/validacao/reinicia_servidor_teste.sh" > /dev/null 2>&1 || true; echo "simu de teste de volta ao normal"; }
trap volta EXIT
(
  unset $(compgen -v MAISIM_); eval "$(python3 "$R/config/ler_config.py" --shell teste)"; T=$MAISIM_DADOS
  pid=$(ss -ltnp | grep ":$MAISIM_PORTA_SIMU " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1); [ -n "$pid" ] && kill "$pid"
  for _ in $(seq 1 20); do ss -ltn | grep -q ":$MAISIM_PORTA_SIMU " || break; sleep 0.3; done
  export MAISIM_PUBLICA_SCOPE="http://127.0.0.1:$MAISIM_PORTA_SCOPE"
  cd "$R" && (setsid nohup python3 simu/servidor.py > "$T/simu.log" 2>&1 < /dev/null &)
  for _ in $(seq 1 30); do ss -ltn | grep -q ":$MAISIM_PORTA_SIMU " && break; sleep 0.5; done
)
NODE_PATH="${NODE_PATH:-$HOME/ns-test/node_modules}" node "$AQUI/grava.js"
python3 "$AQUI/monta.py" "$SAIDA"
