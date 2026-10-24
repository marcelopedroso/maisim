#!/usr/bin/env bash
# (re)sobe só o Gecko e o motor da instância de teste (perfil config/teste.env), com o modelo da partida ($T/modelo.ipes,
# uma cópia do exemplo congelado) — o simulador e a tela virtual ficam. Derruba pelos PIDs das portas do perfil (nunca as do
# MaiSim de uso). O sobe_teste.sh usa este script; o gecko_novo_api.py também (um Gecko novo com o servidor no ar).
AQUI="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$AQUI/../.." && pwd)"
# só o perfil de teste (config/teste.env), nada do ambiente: um MAISIM_* exportado no terminal não vaza para cá
unset $(compgen -v MAISIM_); eval "$(python3 "$R/config/ler_config.py" --shell teste)"; T=$MAISIM_DADOS; mkdir -p "$T/home"
for p in $MAISIM_PORTA_MOTOR $MAISIM_PORTA_GECKO; do
  pid=$(ss -ltnp | grep ":$p " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1); [ -n "$pid" ] && kill "$pid"
done
for p in $MAISIM_PORTA_MOTOR $MAISIM_PORTA_GECKO; do
  for _ in $(seq 1 30); do ss -ltn | grep -q ":$p " || break; sleep 0.3; done
  ss -ltn | grep -q ":$p " && { echo "porta $p ocupada"; exit 1; }
done
JAR=${MAISIM_GECKO_JAR:-$R/gecko/build/gecko-lote.jar}; [ -f "$JAR" ] || bash "$R/gecko/construir.sh"   # o Gecko: o original + o patch
cp "$R/exemplos/exemplo_controle_pwm.ipes" "$T/modelo.ipes"
# exec: o Gecko no lugar do subshell (um subshell esperando por ele segurava a saída de quem chamou, e o "| tail" não acabava)
(cd "$T" && DISPLAY=$MAISIM_TELA_X exec nohup java -Duser.home="$T/home" -Dpolyglot.js.nashorn-compat=true -jar "$JAR" "$T/modelo.ipes" -p "$MAISIM_PORTA_GECKO" > "$T/gecko.log" 2>&1 < /dev/null) &
for _ in $(seq 1 60); do grep -q "GeckoCIRCUITS is ready" "$T/gecko.log" 2>/dev/null && break; sleep 1; done
M="$R/simu/motor"                                  # o motor do editor: compila se o .java for mais novo
if [ ! -f "$M/bin/maisim/MaiSimMotor.class" ] || [ "$M/src/maisim/MaiSimMotor.java" -nt "$M/bin/maisim/MaiSimMotor.class" ]; then
  javac -nowarn -cp "$JAR" -d "$M/bin" "$M/src/maisim/MaiSimMotor.java"
fi
nohup java -cp "$JAR:$M/bin" maisim.MaiSimMotor --gecko-port "$MAISIM_PORTA_GECKO" --porta "$MAISIM_PORTA_MOTOR" > "$T/motor.log" 2>&1 &
for _ in $(seq 1 15); do grep -q "ouvindo" "$T/motor.log" 2>/dev/null && break; sleep 1; done
grep -q "ouvindo" "$T/motor.log" || echo "o motor de teste não subiu (veja $T/motor.log)"
