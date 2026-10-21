#!/usr/bin/env bash
# (re)sobe só o simulador da instância de teste (perfil config/teste.env) — o Gecko e o motor ficam. As IAs da instância
# de teste NUNCA usam os logins de verdade: pastas descartáveis dentro da pasta de teste (desce_teste.sh apaga) e as IAs
# de mentira (claude_falso.py, gemini_falso.py, agy_falso.py; login e logout do Claude vão para o CLI de verdade, nessa
# pasta). A página de teste (MAISIM_PORTA_PAGINA do perfil) é a origem aceita nos POST, além da porta do próprio servidor.
AQUI="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$AQUI/../.." && pwd)"
# só o perfil de teste (config/teste.env), nada do ambiente: um MAISIM_* exportado no terminal não vaza para cá
unset $(compgen -v MAISIM_); eval "$(python3 "$R/config/ler_config.py" --shell teste)"; T=$MAISIM_DADOS
pid=$(ss -ltnp | grep ":$MAISIM_PORTA_SIMU " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1); [ -n "$pid" ] && kill "$pid"
for _ in $(seq 1 20); do ss -ltn | grep -q ":$MAISIM_PORTA_SIMU " || break; sleep 0.3; done
mkdir -p "$MAISIM_CLAUDE_DIR" "$T/circuitos"
cp "$AQUI"/dados/exemplo_controle_*.* "$T/circuitos/"   # os exemplos como eram quando os testes foram escritos (congelados)
cd "$R" && (setsid nohup python3 simu/servidor.py > "$T/simu.log" 2>&1 < /dev/null &)
for _ in $(seq 1 30); do ss -ltn | grep -q ":$MAISIM_PORTA_SIMU " && break; sleep 0.5; done
