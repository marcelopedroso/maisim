#!/usr/bin/env bash
# MaiSim / gecko: o GeckoCIRCUITS numa tela virtual (Xvfb), visto e usado no navegador pelo noVNC.
# uso (de qualquer pasta): gecko/sobe.sh [modelo.ipes]   para: para.sh
# portas, tela virtual e pastas: config/padrao.env (o .env da raiz muda; MAISIM_PERFIL=teste usa config/teste.env)
#   o Gecko é o montado por gecko/construir.sh (o original + a leitura em lote; MAISIM_GECKO_JAR troca o jar)
#   padrão: uma CÓPIA de um exemplo em $MAISIM_CACHE/gecko/ (salvar pela tela não mexe no exemplo do repositório)
#   abrir: http://localhost:$MAISIM_PORTA_PAGINA/maisim/gecko/ (pelo MaiSim, com o menu lateral) ou
#          http://localhost:$MAISIM_PORTA_TELA/ (direto, sem o menu); o noVNC completo continua em …/novnc/vnc.html
# Pacotes: xvfb x11vnc novnc websockify. Tudo só em localhost (x11vnc -localhost, websockify em 127.0.0.1).
# WSL: /tmp/.X11-unix é do WSLg e só de leitura, então o Xvfb fica no socket abstrato (DISPLAY=:71 funciona assim);
# o x11vnc desiste se vê WAYLAND_DISPLAY, então roda sem ele. Com o openbox instalado, ele gerencia as janelas (bordas,
# mover, trazer para a frente) e maximiza a janela principal do Gecko (título "… - GeckoCIRCUITS"); sem ele, as janelas
# ficam paradas e sem borda.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"          # a pasta deste script (o resto do script muda de pasta)
eval "$(python3 "$AQUI/../config/ler_config.py" --shell)"   # as portas e as pastas (config/)
. "$AQUI/../config/fala.sh"                     # fala pt en: as mensagens no idioma do terminal
C="$MAISIM_CACHE/gecko"
mkdir -p "$C"
if [ $# -ge 1 ]; then MODELO=$(realpath "$1"); else
  MODELO=$C/exemplo_copia.ipes
  [ -f "$MODELO" ] || cp "$AQUI/../exemplos/exemplo_controle_pwm.ipes" "$MODELO"
fi
PG=$MAISIM_PORTA_GECKO; TELA=$MAISIM_TELA_X
PM=$MAISIM_PORTA_MOTOR                    # motor do editor (simu/motor), só em 127.0.0.1
VNC=$MAISIM_PORTA_VNC; WEB=$MAISIM_PORTA_TELA
JAR=${MAISIM_GECKO_JAR:-$AQUI/build/gecko-lote.jar}
[ -f "$JAR" ] || bash "$AQUI/construir.sh"           # a 1ª vez: monta o Gecko (o original + o patch)
for p in $VNC $WEB $PG $PM; do
  if ss -ltn | grep -q ":$p "; then fala "porta $p ocupada (já está no ar? para.sh derruba)" "port $p is busy (already running? para.sh stops it)"; exit 1; fi
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
# pasta servida: a página do MaiSim (index.html daqui: menu lateral, estado, tela) e o noVNC do sistema em novnc/
mkdir -p "$C/web"; cp "$AQUI/index.html" "$C/web/index.html"; ln -sfn /usr/share/novnc "$C/web/novnc"
nohup websockify --web "$C/web" 127.0.0.1:$WEB 127.0.0.1:$VNC > "$C/websockify.log" 2>&1 & echo $! > "$C/websockify.pid"
cd "$C"
# pasta pessoal própria para o Java: o ~/.GeckoCIRCUITS (autoBackup.ipes, preferências) é comum a todas as instâncias,
# e um autoBackup mais novo que o modelo trava o Gecko num diálogo; assim este Gecko não vê nem mexe no dos outros
mkdir -p "$C/home"
AB="$C/home/.GeckoCIRCUITS/autoBackup.ipes"       # autoBackup de uma sessão anterior: guardado com data, sem o diálogo
if [ -f "$AB" ]; then mkdir -p "$C/backups"; mv "$AB" "$C/backups/autoBackup_$(date +%Y%m%d-%H%M%S).ipes"
  fala "autoBackup anterior guardado em $C/backups/ (abrir pelo File > Open do Gecko, se precisar)" \
       "previous autoBackup kept in $C/backups/ (open it with Gecko's File > Open, if needed)"; fi
DISPLAY=$TELA nohup java -Duser.home="$C/home" -Dpolyglot.js.nashorn-compat=true -jar "$JAR" "$MODELO" -p "$PG" > "$C/gecko.log" 2>&1 &
echo $! > "$C/gecko.pid"
fala "tela $TELA, VNC $VNC, noVNC $WEB; Gecko $(basename "$JAR") na porta $PG com $MODELO" \
     "display $TELA, VNC $VNC, noVNC $WEB; Gecko $(basename "$JAR") on port $PG with $MODELO"
for _ in $(seq 1 60); do grep -q "GeckoCIRCUITS is ready" "$C/gecko.log" 2>/dev/null && break; sleep 1; done
if grep -q "GeckoCIRCUITS is ready" "$C/gecko.log"; then
  AV=$(grep -c WARNING "$C/gecko.log" || true)
  fala "Gecko pronto (avisos de carga: $AV)" "Gecko ready (load warnings: $AV)"
  M="$(cd "$AQUI/../simu/motor" && pwd)"         # motor do editor: compila se o .java for mais novo
  if [ ! -f "$M/bin/maisim/MaiSimMotor.class" ] || [ "$M/src/maisim/MaiSimMotor.java" -nt "$M/bin/maisim/MaiSimMotor.class" ]; then
    javac -nowarn -encoding UTF-8 -cp "$JAR" -d "$M/bin" "$M/src/maisim/MaiSimMotor.java" 2> "$C/motor_javac.log" || \
      fala "o motor não compilou (veja $C/motor_javac.log)" "the engine did not compile (see $C/motor_javac.log)"
  fi
  nohup java -cp "$JAR:$M/bin" maisim.MaiSimMotor --gecko-port "$PG" --porta "$PM" > "$C/motor.log" 2>&1 & echo $! > "$C/motor.pid"
  for _ in $(seq 1 15); do grep -q "ouvindo" "$C/motor.log" 2>/dev/null && break; sleep 1; done
  if grep -q "ouvindo" "$C/motor.log"; then fala "motor do editor em 127.0.0.1:$PM" "editor engine at 127.0.0.1:$PM"   # "ouvindo": o que o motor escreve ao subir
  else fala "o motor não subiu (veja $C/motor.log)" "the engine did not start (see $C/motor.log)"; fi
else
  fala "Gecko ainda não disse que está pronto: pode haver um diálogo na tela (ex.: carregar o autoBackup); abra o /maisim/gecko" \
       "Gecko has not said it is ready yet: there may be a dialog on its screen (e.g. loading the autoBackup); open /maisim/gecko"; fi
