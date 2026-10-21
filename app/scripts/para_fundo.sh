#!/usr/bin/env bash
# Derruba o MaiSim que o sobe_fundo.sh subiu: termina o maisim.sh, que derruba o que ele mesmo subiu (o Gecko só se não
# houver circuito sem salvar; senão ele avisa no registro e o Gecko fica no ar).
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
eval "$(python3 "$RAIZ/config/ler_config.py" --shell)"
P="$MAISIM_CACHE/fundo.pid"
if [ -f "$P" ] && kill -0 "$(cat "$P")" 2>/dev/null; then kill "$(cat "$P")"; echo "maisim: derrubando (veja $MAISIM_CACHE/logs/fundo.log)"; rm -f "$P"
else echo "maisim: nada subido pelo sobe_fundo.sh"; fi
