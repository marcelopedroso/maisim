#!/usr/bin/env bash
# Derruba o que o sobe.sh do MaiSim / gecko subiu (só esses processos, pelos .pid em $MAISIM_CACHE/gecko).
# Se o modelo aberto tem alterações não salvas (título "….ipes*"), não derruba: salve no Gecko ou use para.sh -f.
eval "$(python3 "$(cd "$(dirname "$0")/.." && pwd)/config/ler_config.py" --shell)"   # as portas e as pastas (config/)
C="$MAISIM_CACHE/gecko"
if [ "${1:-}" != "-f" ] && [ -f "$C/xvfb.pid" ] && kill -0 "$(cat "$C/xvfb.pid")" 2>/dev/null; then
  if DISPLAY="$MAISIM_TELA_X" xwininfo -root -tree 2>/dev/null | grep -q '\.ipes\*'; then
    echo "o modelo aberto no Gecko do MaiSim tem alterações não salvas (título com *): salve pelo navegador ou use para.sh -f"
    exit 1
  fi
fi
for n in motor gecko websockify x11vnc openbox xvfb; do
  f=$C/$n.pid
  [ -f "$f" ] || continue
  p=$(cat "$f"); kill "$p" 2>/dev/null && echo "parado: $n ($p)"; rm -f "$f"
done
