#!/usr/bin/env bash
# Derruba o que o sobe.sh do MaiSim / gecko subiu (só esses processos, pelos .pid em $MAISIM_CACHE/gecko).
# Se o modelo aberto tem alterações não salvas (título "….ipes*"), não derruba: salve no Gecko ou use para.sh -f.
R="$(cd "$(dirname "$0")/.." && pwd)"                    # a raiz do projeto (de qualquer pasta)
eval "$(python3 "$R/config/ler_config.py" --shell)"     # as portas e as pastas (config/)
. "$R/config/fala.sh"                                     # fala pt en: as mensagens no idioma do terminal
C="$MAISIM_CACHE/gecko"
if [ "${1:-}" != "-f" ] && [ -f "$C/xvfb.pid" ] && kill -0 "$(cat "$C/xvfb.pid")" 2>/dev/null; then
  if DISPLAY="$MAISIM_TELA_X" xwininfo -root -tree 2>/dev/null | grep -q '\.ipes\*'; then
    fala "o modelo aberto no Gecko do MaiSim tem alterações não salvas (título com *): salve pelo navegador ou use para.sh -f" \
         "the model open in MaiSim's Gecko has unsaved changes (title with *): save it in the browser or use para.sh -f"
    exit 1
  fi
fi
for n in motor gecko websockify x11vnc openbox xvfb; do
  f=$C/$n.pid
  [ -f "$f" ] || continue
  p=$(cat "$f"); kill "$p" 2>/dev/null && fala "parado: $n ($p)" "stopped: $n ($p)"; rm -f "$f"
done
