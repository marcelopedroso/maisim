#!/usr/bin/env bash
# npm run pew — o PEW inteiro numa tacada: scope (8765), simu (8767), o Gecko do PEW (tela virtual, VNC 6080, Gecko 43050,
# motor do editor 6120) e a página (Vite, 5000). O que já estiver no ar é reaproveitado e continua no ar.
# Ctrl+C derruba o que ESTE comando subiu. O Gecko só cai se não houver circuito sem salvar (o simu compara o que está no
# Gecko com o arquivo aberto); se houver, ele fica no ar e o comando diz como derrubar.
# Variáveis: PEW_SEM_GECKO=1 (não sobe o Gecko); PEW_PORTA, SCOPE_PORTA, SIMU_PORTA (outras portas, para teste).
set -u
APP="$(cd "$(dirname "$0")/.." && pwd)"                   # app/ (a página)
SM="$(cd "$APP/.." && pwd)"                               # a raiz do projeto: scope/, simu/, gecko/
LOG=~/.cache/pew; mkdir -p "$LOG"
PORTA=${PEW_PORTA:-5000}; SP=${SCOPE_PORTA:-8765}; MP=${SIMU_PORTA:-8767}
GECKO="6080 43050 6120"
SOBE_GECKO="$SM/gecko/sobe.sh"; PARA_GECKO="$SM/gecko/para.sh"
declare -A SUBI=()                                         # o que este comando subiu: nome → pid
no_ar() { ss -ltn 2>/dev/null | grep -q ":$1 "; }
pid_da_porta() { ss -ltnp 2>/dev/null | grep ":$1 " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }
espera() { for _ in $(seq 1 $((${2:-15} * 2))); do no_ar "$1" && return 0; sleep 0.5; done; return 1; }
linha() { printf "  %s%*s %-34s %s\n" "$1" $((14 - ${#1})) "" "$2" "$3"; }   # ${#1} conta letras (o printf contaria bytes)

# servidor Python numa sessão própria (setsid): o Ctrl+C do terminal não chega nele; quem derruba é a limpeza abaixo
sobe_py() {                                                # nome porta script [variáveis…]
  local nome=$1 porta=$2 script=$3; shift 3
  if no_ar "$porta"; then linha "$nome" "porta $porta" "já estava no ar (fica)"; return; fi
  (cd "$SM" && exec env "$@" setsid nohup python3 "$script" --porta "$porta" > "$LOG/$nome.log" 2>&1) &
  if espera "$porta" 15; then SUBI[$nome]=$(pid_da_porta "$porta"); linha "$nome" "porta $porta" "subiu agora"
  else linha "$nome" "porta $porta" "NÃO subiu (veja $LOG/$nome.log)"; fi
}

limpa() {
  trap - EXIT INT TERM
  echo; echo "pew: derrubando o que este comando subiu…"
  [ -n "${VITE:-}" ] && { kill "$VITE" 2>/dev/null; wait "$VITE" 2>/dev/null; }
  [ -n "${VIGIA:-}" ] && { kill "$VIGIA" 2>/dev/null; wait "$VIGIA" 2>/dev/null; }
  if [ -n "${SUBI[gecko]:-}" ]; then                       # o Gecko: só sem nada por salvar (pergunta ao simu)
    local r; r=$(curl -s --max-time 30 "http://localhost:$MP/pew/simu/editor/pendente" 2>/dev/null)
    case "$r" in
      *'"pendente":false'*) "$PARA_GECKO" -f > /dev/null && linha "Gecko do PEW" "" "derrubado (nada por salvar)";;
      *'"pendente":true'*)  linha "Gecko do PEW" "" "FICOU NO AR: há circuito sem salvar"
                            echo "    salve no /pew/simu (disquete) e rode $PARA_GECKO -f — ou derrube assim mesmo com -f";;
      *) if "$PARA_GECKO" > /dev/null; then linha "Gecko do PEW" "" "derrubado"
         else linha "Gecko do PEW" "" "FICOU NO AR (título com *): $PARA_GECKO -f derruba"; fi;;
    esac
  fi
  for nome in simu scope; do
    [ -n "${SUBI[$nome]:-}" ] && kill "${SUBI[$nome]}" 2>/dev/null && linha "$nome" "" "derrubado"
  done
  [ -n "${SUBI[pagina]:-}" ] && linha "página" "" "derrubada"
  exit 0
}
trap limpa EXIT
trap 'exit 130' INT TERM

echo "pew: subindo o Power Electronics Workspace (logs em $LOG)"
sobe_py scope "$SP" scope/servidor.py
sobe_py simu "$MP" simu/servidor.py PEW_SCOPE_URL="http://localhost:$SP"

# o Gecko do PEW: inteiro no ar → fica; nada no ar → sobe em paralelo (leva até ~1 min); pela metade → avisa
if [ -n "${PEW_SEM_GECKO:-}" ]; then
  linha "Gecko do PEW" "" "pulado (PEW_SEM_GECKO)"
else
  n=0; for p in $GECKO; do no_ar "$p" && n=$((n + 1)); done
  if [ "$n" = 3 ]; then linha "Gecko do PEW" "portas $GECKO" "já estava no ar (fica)"
  elif [ "$n" = 0 ]; then
    setsid "$SOBE_GECKO" > "$LOG/gecko.log" 2>&1 &
    SUBI[gecko]=$!
    linha "Gecko do PEW" "portas $GECKO" "subindo (até ~1 min; aviso quando ficar pronto)"
    ( for _ in $(seq 1 120); do no_ar 6120 && { echo; echo "pew: Gecko do PEW pronto (o editor do /pew/simu já funciona)"; exit 0; }; sleep 1; done
      echo; echo "pew: o Gecko do PEW não ficou pronto em 2 min (veja $LOG/gecko.log)" ) &
    VIGIA=$!
  else
    linha "Gecko do PEW" "portas $GECKO" "PELA METADE ($n de 3 no ar): rode $PARA_GECKO e de novo npm run pew"
  fi
fi

if no_ar "$PORTA"; then
  linha "página" "http://localhost:$PORTA" "já estava no ar (fica)"
  echo; echo "pew: tudo no ar em http://localhost:$PORTA — Ctrl+C derruba o que este comando subiu"
  sleep infinity & VITE=$!; wait "$VITE"
else
  linha "página" "http://localhost:$PORTA" "subindo (Vite)"
  echo; echo "pew: abra http://localhost:$PORTA — Ctrl+C derruba o que este comando subiu"; echo
  (cd "$APP" && PEW_SCOPE_URL="http://localhost:$SP" PEW_SIMU_URL="http://localhost:$MP" \
    exec ./node_modules/.bin/vite --port "$PORTA" --strictPort) &
  VITE=$!; SUBI[pagina]=$VITE
  wait "$VITE"
fi
