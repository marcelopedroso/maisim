#!/usr/bin/env bash
# (re)sobe só o servidor do simu da instância de teste (8768), com o ambiente dela — o Gecko (43060) e o motor (6121)
# ficam. O Claude do PEW da instância de teste NUNCA usa o login de verdade: pasta descartável dentro da pasta de teste
# (desce_teste.sh apaga) e o claude de mentira (claude_falso.py; login e logout vão para o CLI de verdade, nessa pasta).
# O Gemini e o Antigravity também: os de mentira (gemini_falso.py, agy_falso.py), em pastas descartáveis — nunca o
# ~/.gemini-pew nem o ~/.agy-pew.
# PEW_PORTA=5010: a página de teste (Vite 5010 → 8768) é a origem aceita nos POST, além da porta do próprio servidor.
T=~/.cache/pew_simu_teste; AQUI="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$AQUI/../.." && pwd)"
pid=$(ss -ltnp | grep ":8768 " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1); [ -n "$pid" ] && kill "$pid"
for _ in $(seq 1 20); do ss -ltn | grep -q ":8768 " || break; sleep 0.3; done
mkdir -p "$T/claude-pew" "$T/pew"
cp "$AQUI"/dados/exemplo_controle_*.* "$T/pew/"   # os exemplos originais, congelados (os do repositório são do Marcelo e mudam)
cd "$R" && (PEW_PORTA=5010 PEW_CLAUDE_DIR="$T/claude-pew" PEW_CLAUDE_BIN="$AQUI/claude_falso.py" PEW_SIMU_CACHE=$T \
  PEW_GEMINI_DIR="$T/gemini-pew" PEW_GEMINI_BIN="$AQUI/gemini_falso.py" PEW_AGY_DIR="$T/agy-pew" PEW_AGY_BIN="$AQUI/agy_falso.py" \
  PEW_MOTOR_PORTA=6121 PEW_GECKO_TELA=:98 PEW_SIMU_RODADAS=$T/rodadas PEW_SCOPE_URL=http://127.0.0.1:9 PEW_SIMU_BIBLIOTECA=$T/subcircuitos \
  PEW_SIMU_SALVOS=$T/pew PEW_CONTEXTOS=$T/contextos PEW_IA_TESTE=1 setsid nohup python3 simu/servidor.py --porta 8768 > $T/simu.log 2>&1 &)
for _ in $(seq 1 30); do ss -ltn | grep -q ":8768 " && break; sleep 0.5; done
