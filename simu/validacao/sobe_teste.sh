#!/usr/bin/env bash
# instância de teste do /pew/simu: Xvfb :98, Gecko 43060, motor 6121, servidor 8768 (nada no Gecko nem no scope do PEW)
set -e
T=~/.cache/pew_simu_teste; mkdir -p $T/home
R="$(cd "$(dirname "$0")/../.." && pwd)"   # a raiz do projeto (validacao → simu → raiz)
for p in 43060 6121 8768; do ss -ltn | grep -q ":$p " && { echo "porta $p ocupada"; exit 1; }; done
JAR=${PEW_GECKO_JAR:-$R/gecko/build/gecko-lote.jar}; [ -f "$JAR" ] || bash "$R/gecko/construir.sh"   # o Gecko: o original + o patch
cp "$R/exemplos/exemplo_controle_pwm.ipes" $T/modelo.ipes
nohup Xvfb :98 -screen 0 1400x900x24 -nolisten tcp > $T/xvfb.log 2>&1 &
sleep 1
(cd $T && DISPLAY=:98 nohup java -Duser.home=$T/home -Dpolyglot.js.nashorn-compat=true -jar "$JAR" $T/modelo.ipes -p 43060 > $T/gecko.log 2>&1 &)
for _ in $(seq 1 60); do grep -q "GeckoCIRCUITS is ready" $T/gecko.log 2>/dev/null && break; sleep 1; done
M="$R/simu/motor"                                  # o motor do editor: compila se o .java for mais novo
if [ ! -f "$M/bin/pew/PewMotor.class" ] || [ "$M/src/pew/PewMotor.java" -nt "$M/bin/pew/PewMotor.class" ]; then
  javac -nowarn -cp "$JAR" -d "$M/bin" "$M/src/pew/PewMotor.java"
fi
nohup java -cp "$JAR:$M/bin" pew.PewMotor --gecko-port 43060 --porta 6121 > $T/motor.log 2>&1 &
for _ in $(seq 1 15); do grep -q "ouvindo" $T/motor.log 2>/dev/null && break; sleep 1; done
"$R/simu/validacao/reinicia_servidor_teste.sh"   # o servidor do simu (8768), com o Claude de teste (pasta descartável, claude de mentira)
sleep 1.5; curl -s -o /dev/null -w "servidor de teste: %{http_code}\n" http://localhost:8768/pew/simu/
"$R/simu/validacao/sobe_pagina_teste.sh"   # a página de teste (5010) e o scope dela (8776)
