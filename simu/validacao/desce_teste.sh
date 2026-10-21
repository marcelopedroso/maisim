#!/usr/bin/env bash
# derruba só a instância de teste (pelos PIDs das portas do perfil config/teste.env e do Xvfb dela) e apaga a pasta dela
R="$(cd "$(dirname "$0")/../.." && pwd)"
# só o perfil de teste (config/teste.env), nada do ambiente: um MAISIM_* exportado no terminal não vaza para cá
unset $(compgen -v MAISIM_); eval "$(python3 "$R/config/ler_config.py" --shell teste)"
P="$MAISIM_PORTA_PAGINA $MAISIM_PORTA_SCOPE $MAISIM_PORTA_SIMU $MAISIM_PORTA_MOTOR $MAISIM_PORTA_GECKO"
for p in $P; do pid=$(ss -ltnp | grep ":$p " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1); [ -n "$pid" ] && kill $pid; done
sleep 2; pkill -f "^Xvfb $MAISIM_TELA_X " || true; sleep 0.5
for p in $P; do ss -ltn | grep -q ":$p " && echo "$p ainda no ar"; done; case "$MAISIM_DADOS" in */.cache/maisim_teste) rm -rf "$MAISIM_DADOS";; *) echo "não apago $MAISIM_DADOS (não é a pasta de teste)";; esac
echo "instância de teste derrubada"
