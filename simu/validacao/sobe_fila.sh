#!/usr/bin/env bash
# instância isolada para os testes que mexem no scope ao vivo e na página inicial: scope de teste 8775 (só memória; lê as
# gravações, não apaga nada se ninguém pedir) + Vite do pew-app 5011 (scope → 8775, simu → 8768, sem Gecko) — nada do PEW
set -e
T=~/.cache/pew_fila_teste; mkdir -p $T
R="$(cd "$(dirname "$0")/../.." && pwd)"   # a raiz do projeto (validacao → simu → raiz)
for p in 8775 5011; do ss -ltn | grep -q ":$p " && { echo "porta $p ocupada"; exit 1; }; done
# o subshell inteiro escreve no log (senão ele segura a saída deste script, e um "| tail" fica esperando)
(cd "$R" && PEW_SIMU_RODADAS=~/.cache/pew_simu_teste/rodadas PEW_SCOPE_PASTAS="$R/simu/validacao" nohup python3 scope/servidor.py --porta 8775) > $T/scope.log 2>&1 &
(cd "$R/app" && PEW_SCOPE_URL=http://localhost:8775 PEW_SIMU_URL=http://localhost:8768 PEW_GECKO_URL=http://127.0.0.1:9 \
  nohup node ./node_modules/.bin/vite --port 5011 --strictPort) > $T/vite.log 2>&1 &
for _ in $(seq 1 20); do curl -s -o /dev/null http://localhost:5011/ && break; sleep 0.5; done
curl -s -o /dev/null -w "página inicial de teste (5011): %{http_code}\n" http://localhost:5011/
curl -s -o /dev/null -w "scope de teste (5011 → 8775): %{http_code}\n" http://localhost:5011/pew/scope/
