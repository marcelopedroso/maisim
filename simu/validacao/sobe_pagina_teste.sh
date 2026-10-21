#!/usr/bin/env bash
T=~/.cache/pew_simu_teste; mkdir -p $T
R="$(cd "$(dirname "$0")/../.." && pwd)"   # a raiz do projeto (validacao → simu → raiz)
# a página de teste: Vite do pew-app na 5010, com o simu na 8768 e um scope só dela na 8776 (só memória; lê as gravações):
# a instância de teste não depende do PEW do Marcelo estar no ar (com ele fechado, os testes do scope caíam). Os testes do
# scope ao vivo usam a instância isolada (../sobe_fila.sh). Depois de um `wsl --shutdown` tudo cai e sobe aqui
if ! ss -ltn | grep -q ":8776 "; then
  (cd "$R" && PEW_SIMU_RODADAS=$T/rodadas PEW_SCOPE_PASTAS="$R/simu/validacao" setsid nohup python3 scope/servidor.py --porta 8776 > ~/.cache/pew_simu_teste/scope8776.log 2>&1 < /dev/null &)
  for _ in $(seq 1 20); do ss -ltn | grep -q ":8776 " && break; sleep 0.5; done
fi
if ! ss -ltn | grep -q ":5010 "; then
  (cd "$R/app" && PEW_SIMU_URL=http://localhost:8768 PEW_SCOPE_URL=http://localhost:8776 PEW_GECKO_URL=http://127.0.0.1:9 \
    setsid nohup node ./node_modules/.bin/vite --port 5010 --strictPort > ~/.cache/pew_simu_teste/vite5010.log 2>&1 < /dev/null &)
  for _ in $(seq 1 30); do curl -s -o /dev/null http://localhost:5010/ && break; sleep 0.5; done
fi
curl -s -o /dev/null -w "página de teste (5010 → 8768): %{http_code}\n" http://localhost:5010/pew/simu/
curl -s -o /dev/null -w "scope de teste (5010 → 8776): %{http_code}\n" http://localhost:5010/pew/scope/
