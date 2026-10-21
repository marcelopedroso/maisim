#!/usr/bin/env bash
# derruba só a instância isolada do scope (8775) e o Vite de teste (5011), pelos PIDs das portas
for p in 8775 5011; do pid=$(ss -ltnp | grep ":$p " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1); [ -n "$pid" ] && kill $pid; done
sleep 1; for p in 8775 5011; do ss -ltn | grep -q ":$p " && echo "$p ainda no ar"; done; echo "scope 8775 e Vite 5011 derrubados"
