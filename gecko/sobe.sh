#!/usr/bin/env bash
# PEW / gecko: o GeckoCIRCUITS numa tela virtual (Xvfb), visto e usado no navegador pelo noVNC.
# uso (de qualquer pasta): gecko/sobe.sh [modelo.ipes] [porta-gecko] [tela]   para: para.sh
#   o Gecko é o montado por gecko/construir.sh (o original + a leitura em lote; PEW_GECKO_JAR troca o jar)
#   padrão: uma CÓPIA de um exemplo em ~/.cache/pew_gecko/ (salvar pela tela não mexe no exemplo do repositório), 43050, :99
#   abrir: http://localhost:5000/pew/gecko/ (pelo PEW, com o menu lateral; o pew-app encaminha /pew/gecko) ou
#          http://localhost:6080/ (direto, sem o menu); o noVNC completo continua em …/novnc/vnc.html
# Pacotes: xvfb x11vnc novnc websockify. Tudo só em localhost (x11vnc -localhost, websockify em 127.0.0.1).
# WSL: /tmp/.X11-unix é do WSLg e só de leitura, então o Xvfb fica no socket abstrato (DISPLAY=:99 funciona assim);
# o x11vnc desiste se vê WAYLAND_DISPLAY, então roda sem ele. Com o openbox instalado, ele gerencia as janelas (bordas,
# mover, trazer para a frente) e maximiza a janela principal do Gecko (título "… - GeckoCIRCUITS"); sem ele, as janelas
# ficam paradas e sem borda.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"          # a pasta deste script (o resto do script muda de pasta)
C=~/.cache/pew_gecko
mkdir -p "$C"
if [ $# -ge 1 ]; then MODELO=$(realpath "$1"); else
  MODELO=$C/exemplo_copia.ipes
  [ -f "$MODELO" ] || cp "$AQUI/../exemplos/exemplo_controle_pwm.ipes" "$MODELO"
fi
PG=${2:-43050}
TELA=${3:-:99}
PM=6120                                   # motor do editor (simu/motor), só em 127.0.0.1
N=${TELA#:}
VNC=$((5900 + N)); WEB=6080
JAR=${PEW_GECKO_JAR:-$AQUI/build/gecko-lote.jar}
[ -f "$JAR" ] || bash "$AQUI/construir.sh"           # a 1ª vez: monta o Gecko (o original + o patch)
for p in $VNC $WEB $PG $PM; do
  if ss -ltn | grep -q ":$p "; then echo "porta $p ocupada (já está no ar? para.sh derruba)"; exit 1; fi
done
nohup Xvfb "$TELA" -screen 0 1600x1000x24 -nolisten tcp > "$C/xvfb.log" 2>&1 & echo $! > "$C/xvfb.pid"
sleep 1
if command -v openbox > /dev/null; then     # a configuração padrão + maximizar a janela principal do Gecko
  sed 's#</applications>#  <application title="*GeckoCIRCUITS" type="normal"><maximized>yes</maximized></application>\n</applications>#' \
    /etc/xdg/openbox/rc.xml > "$C/openbox_rc.xml"
  DISPLAY=$TELA nohup openbox --config-file "$C/openbox_rc.xml" > "$C/openbox.log" 2>&1 & echo $! > "$C/openbox.pid"
fi
env -u WAYLAND_DISPLAY -u XDG_SESSION_TYPE x11vnc -display "$TELA" -rfbport $VNC -localhost -nopw -forever -shared -quiet \
  -o "$C/x11vnc.log" > /dev/null 2>&1 & echo $! > "$C/x11vnc.pid"
# pasta servida: a página do PEW (index.html daqui: menu lateral, estado, tela) e o noVNC do sistema em novnc/
mkdir -p "$C/web"; cp "$AQUI/index.html" "$C/web/index.html"; ln -sfn /usr/share/novnc "$C/web/novnc"
nohup websockify --web "$C/web" 127.0.0.1:$WEB 127.0.0.1:$VNC > "$C/websockify.log" 2>&1 & echo $! > "$C/websockify.pid"
cd "$C"
# pasta pessoal própria para o Java: o ~/.GeckoCIRCUITS (autoBackup.ipes, preferências) é comum a todas as instâncias,
# e um autoBackup mais novo que o modelo trava o Gecko num diálogo; assim este Gecko não vê nem mexe no dos outros
mkdir -p "$C/home"
AB="$C/home/.GeckoCIRCUITS/autoBackup.ipes"       # autoBackup de uma sessão anterior: guardado com data, sem o diálogo
if [ -f "$AB" ]; then mkdir -p "$C/backups"; mv "$AB" "$C/backups/autoBackup_$(date +%Y%m%d-%H%M%S).ipes"
  echo "autoBackup anterior guardado em $C/backups/ (abrir pelo File > Open do Gecko, se precisar)"; fi
DISPLAY=$TELA nohup java -Duser.home="$C/home" -Dpolyglot.js.nashorn-compat=true -jar "$JAR" "$MODELO" -p "$PG" > "$C/gecko.log" 2>&1 &
echo $! > "$C/gecko.pid"
echo "tela $TELA, VNC $VNC, noVNC $WEB; Gecko $(basename "$JAR") na porta $PG com $MODELO"
for _ in $(seq 1 60); do grep -q "GeckoCIRCUITS is ready" "$C/gecko.log" 2>/dev/null && break; sleep 1; done
if grep -q "GeckoCIRCUITS is ready" "$C/gecko.log"; then echo "Gecko pronto (avisos de carga: $(grep -c WARNING "$C/gecko.log" || true))"
  M="$(cd "$AQUI/../simu/motor" && pwd)"         # motor do editor: compila se o .java for mais novo
  if [ ! -f "$M/bin/pew/PewMotor.class" ] || [ "$M/src/pew/PewMotor.java" -nt "$M/bin/pew/PewMotor.class" ]; then
    javac -nowarn -cp "$JAR" -d "$M/bin" "$M/src/pew/PewMotor.java" 2> "$C/motor_javac.log" || echo "o motor não compilou (veja $C/motor_javac.log)"
  fi
  nohup java -cp "$JAR:$M/bin" pew.PewMotor --gecko-port "$PG" --porta "$PM" > "$C/motor.log" 2>&1 & echo $! > "$C/motor.pid"
  for _ in $(seq 1 15); do grep -q "ouvindo" "$C/motor.log" 2>/dev/null && break; sleep 1; done
  grep -q "ouvindo" "$C/motor.log" && echo "motor do editor em 127.0.0.1:$PM" || echo "o motor não subiu (veja $C/motor.log)"
else
  echo "Gecko ainda não disse que está pronto: pode haver um diálogo na tela (ex.: carregar o autoBackup); abra o /pew/gecko"; fi
