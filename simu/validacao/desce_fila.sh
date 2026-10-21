#!/usr/bin/env bash
# derruba só a instância isolada do scope ao vivo (as portas MAISIM_*_ISOLAD* do perfil config/teste.env), pelos PIDs
R="$(cd "$(dirname "$0")/../.." && pwd)"
# só o perfil de teste (config/teste.env), nada do ambiente: um MAISIM_* exportado no terminal não vaza para cá
unset $(compgen -v MAISIM_); eval "$(python3 "$R/config/ler_config.py" --shell teste)"
P="$MAISIM_PORTA_SCOPE_ISOLADO $MAISIM_PORTA_PAGINA_ISOLADA"
for p in $P; do pid=$(ss -ltnp | grep ":$p " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1); [ -n "$pid" ] && kill $pid; done
sleep 1; for p in $P; do ss -ltn | grep -q ":$p " && echo "$p ainda no ar"; done; echo "instância isolada derrubada ($P)"
