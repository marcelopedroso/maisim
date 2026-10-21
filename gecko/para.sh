#!/usr/bin/env bash
# Derruba o que o sobe.sh do PEW / gecko subiu (só esses processos, pelos .pid em ~/.cache/pew_gecko).
# Se o modelo aberto tem alterações não salvas (título "….ipes*"), não derruba: salve no Gecko ou use para.sh -f.
C=~/.cache/pew_gecko
if [ "${1:-}" != "-f" ] && [ -f "$C/xvfb.pid" ] && kill -0 "$(cat "$C/xvfb.pid")" 2>/dev/null; then
  if DISPLAY=:99 xwininfo -root -tree 2>/dev/null | grep -q '\.ipes\*'; then
    echo "o modelo aberto no Gecko do PEW tem alterações não salvas (título com *): salve pelo navegador ou use para.sh -f"
    exit 1
  fi
fi
for n in motor gecko websockify x11vnc openbox xvfb; do
  f=$C/$n.pid
  [ -f "$f" ] || continue
  p=$(cat "$f"); kill "$p" 2>/dev/null && echo "parado: $n ($p)"; rm -f "$f"
done
