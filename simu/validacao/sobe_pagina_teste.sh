#!/usr/bin/env bash
# a página de teste (Vite, perfil config/teste.env) com o simulador de teste, e um scope só dela (só memória; lê as
# gravações): a instância de teste não depende do MaiSim de uso estar no ar. Os testes do scope ao vivo usam a instância
# isolada (../sobe_fila.sh). Depois de um `wsl --shutdown` tudo cai e sobe aqui
R="$(cd "$(dirname "$0")/../.." && pwd)"   # a raiz do projeto (validacao → simu → raiz)
# só o perfil de teste (config/teste.env), nada do ambiente: um MAISIM_* exportado no terminal não vaza para cá
unset $(compgen -v MAISIM_); eval "$(python3 "$R/config/ler_config.py" --shell teste)"; T=$MAISIM_DADOS; mkdir -p "$T"
if ! ss -ltn | grep -q ":$MAISIM_PORTA_SCOPE "; then
  (cd "$R" && setsid nohup python3 scope/servidor.py > "$T/scope.log" 2>&1 < /dev/null &)
  for _ in $(seq 1 20); do ss -ltn | grep -q ":$MAISIM_PORTA_SCOPE " && break; sleep 0.5; done
fi
if ! ss -ltn | grep -q ":$MAISIM_PORTA_PAGINA "; then
  (cd "$R/app" && setsid nohup node ./node_modules/.bin/vite --strictPort > "$T/vite.log" 2>&1 < /dev/null &)
  for _ in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$MAISIM_PORTA_PAGINA/" && break; sleep 0.5; done
fi
curl -s -o /dev/null -w "página de teste ($MAISIM_PORTA_PAGINA → $MAISIM_PORTA_SIMU): %{http_code}\n" "http://localhost:$MAISIM_PORTA_PAGINA/maisim/simu/"
curl -s -o /dev/null -w "scope de teste ($MAISIM_PORTA_PAGINA → $MAISIM_PORTA_SCOPE): %{http_code}\n" "http://localhost:$MAISIM_PORTA_PAGINA/maisim/scope/"
