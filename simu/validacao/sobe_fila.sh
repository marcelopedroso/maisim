#!/usr/bin/env bash
# instância isolada para os testes que mexem no scope ao vivo e na página inicial (perfil config/teste.env): um scope só
# dela (MAISIM_PORTA_SCOPE_ISOLADO; só memória, lê as gravações, não apaga nada se ninguém pedir) e uma página
# (MAISIM_PORTA_PAGINA_ISOLADA → esse scope, o simulador de teste, sem Gecko) — nada do MaiSim de uso
set -e
R="$(cd "$(dirname "$0")/../.." && pwd)"   # a raiz do projeto (validacao → simu → raiz)
# só o perfil de teste (config/teste.env), nada do ambiente: um MAISIM_* exportado no terminal não vaza para cá
unset $(compgen -v MAISIM_); eval "$(python3 "$R/config/ler_config.py" --shell teste)"; T=~/.cache/maisim_fila_teste; mkdir -p $T
SC=$MAISIM_PORTA_SCOPE_ISOLADO; PG=$MAISIM_PORTA_PAGINA_ISOLADA
for p in $SC $PG; do ss -ltn | grep -q ":$p " && { echo "porta $p ocupada"; exit 1; }; done
# o subshell inteiro escreve no log (senão ele segura a saída deste script, e um "| tail" fica esperando)
(cd "$R" && MAISIM_PORTA_SCOPE=$SC nohup python3 scope/servidor.py) > $T/scope.log 2>&1 &
(cd "$R/app" && MAISIM_PORTA_PAGINA=$PG MAISIM_PORTA_SCOPE=$SC nohup node ./node_modules/.bin/vite --strictPort) > $T/vite.log 2>&1 &
for _ in $(seq 1 20); do curl -s -o /dev/null http://localhost:$PG/ && break; sleep 0.5; done
curl -s -o /dev/null -w "página inicial isolada ($PG): %{http_code}\n" http://localhost:$PG/
curl -s -o /dev/null -w "scope isolado ($PG → $SC): %{http_code}\n" http://localhost:$PG/maisim/scope/
