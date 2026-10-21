#!/usr/bin/env bash
# derruba só a instância de teste (pelos PIDs das portas dela e do Xvfb :98)
for p in 5010 8776 8768 6121 43060; do pid=$(ss -ltnp | grep ":$p " | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1); [ -n "$pid" ] && kill $pid; done
sleep 2; pkill -f "^Xvfb :98 " || true; sleep 0.5
for p in 8768 6121 43060; do ss -ltn | grep -q ":$p " && echo "$p ainda no ar"; done; rm -rf ~/.cache/pew_simu_teste; echo "instância de teste derrubada"
