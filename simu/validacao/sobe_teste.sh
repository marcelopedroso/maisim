#!/usr/bin/env bash
# a instância de teste do MaiSim (perfil config/teste.env): tela virtual, Gecko, motor, simulador, página e scope dela —
# nada nos logins nem nos dados de verdade, nada nas portas do MaiSim de uso
set -e
R="$(cd "$(dirname "$0")/../.." && pwd)"   # a raiz do projeto (validacao → simu → raiz)
# só o perfil de teste (config/teste.env), nada do ambiente: um MAISIM_* exportado no terminal não vaza para cá
unset $(compgen -v MAISIM_); eval "$(python3 "$R/config/ler_config.py" --shell teste)"; T=$MAISIM_DADOS; mkdir -p "$T/home"
for p in $MAISIM_PORTA_GECKO $MAISIM_PORTA_MOTOR $MAISIM_PORTA_SIMU; do ss -ltn | grep -q ":$p " && { echo "porta $p ocupada"; exit 1; }; done
nohup Xvfb "$MAISIM_TELA_X" -screen 0 1400x900x24 -nolisten tcp > "$T/xvfb.log" 2>&1 &
sleep 1
"$R/simu/validacao/reinicia_gecko_teste.sh"      # o Gecko (com o modelo da partida) e o motor do editor
"$R/simu/validacao/reinicia_servidor_teste.sh"   # o simulador, com as IAs de teste (pastas descartáveis, IAs de mentira)
sleep 1.5; curl -s -o /dev/null -w "simulador de teste ($MAISIM_PORTA_SIMU): %{http_code}\n" "http://localhost:$MAISIM_PORTA_SIMU/maisim/simu/"
"$R/simu/validacao/sobe_pagina_teste.sh"   # a página de teste e o scope dela
