#!/usr/bin/env bash
# npm run maisim — o MaiSim inteiro numa tacada: o scope, o simulador, o Gecko (tela virtual, Gecko, motor do editor) e a
# página (Vite). As portas e as pastas vêm de config/ (padrao.env; o .env da raiz muda o que for seu). O que já estiver no
# ar é reaproveitado e continua no ar. Ctrl+C derruba o que ESTE comando subiu. O Gecko só cai se não houver circuito sem
# salvar (o simulador compara o que está no Gecko com o arquivo aberto); se houver, ele fica no ar e o comando diz como derrubar.
# Variável: MAISIM_SEM_GECKO=1 (não sobe o Gecko).
# Opção: -p PORTA (npm run maisim -- -p 8100): a página nessa porta e as outras logo em seguida (+1 o simulador, +2 o scope,
# +3 o Gecko, +4 o motor do editor, +5 a tela do Gecko, +6 o VNC; a tela virtual :PORTA/100); sem -p, as de config/ (7100…).
set -u
while [ $# -gt 0 ]; do
  case "$1" in
    -p|--porta)
      B=${2:-}
      if ! [[ "$B" =~ ^[0-9]+$ ]] || [ "$B" -lt 1024 ] || [ "$B" -gt 65000 ]; then
        echo "maisim: -p pede um número de porta entre 1024 e 65000 (ex.: -p 8100)"; exit 2; fi
      export MAISIM_PORTA_PAGINA=$B MAISIM_PORTA_SIMU=$((B + 1)) MAISIM_PORTA_SCOPE=$((B + 2)) MAISIM_PORTA_GECKO=$((B + 3))
      export MAISIM_PORTA_MOTOR=$((B + 4)) MAISIM_PORTA_TELA=$((B + 5)) MAISIM_PORTA_VNC=$((B + 6)) MAISIM_TELA_X=":$((B / 100))"
      shift 2;;
    -h|--help)
      echo "uso: npm run maisim [-- -p PORTA]   (sem -p: http://localhost:7100; com -p 8100: http://localhost:8100, e 8101–8106)"; exit 0;;
    *) echo "maisim: opção desconhecida: $1 (use -p PORTA, ou -h)"; exit 2;;
  esac
done
APP="$(cd "$(dirname "$0")/.." && pwd)"                   # app/ (a página)
SM="$(cd "$APP/.." && pwd)"                               # a raiz do projeto: scope/, simu/, gecko/
eval "$(python3 "$SM/config/ler_config.py" --shell)"     # as portas e as pastas (config/padrao.env, o .env, o ambiente)
LOG="$MAISIM_CACHE/logs"; mkdir -p "$LOG"
PORTA=$MAISIM_PORTA_PAGINA; SP=$MAISIM_PORTA_SCOPE; MP=$MAISIM_PORTA_SIMU
GECKO="$MAISIM_PORTA_TELA $MAISIM_PORTA_GECKO $MAISIM_PORTA_MOTOR"
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
  echo; echo "maisim: derrubando o que este comando subiu…"
  [ -n "${VITE:-}" ] && { kill "$VITE" 2>/dev/null; wait "$VITE" 2>/dev/null; }
  [ -n "${VIGIA:-}" ] && { kill "$VIGIA" 2>/dev/null; wait "$VIGIA" 2>/dev/null; }
  if [ -n "${SUBI[gecko]:-}" ]; then                       # o Gecko: só sem nada por salvar (pergunta ao simu)
    local r; r=$(curl -s --max-time 30 "http://localhost:$MP/maisim/simu/editor/pendente" 2>/dev/null)
    case "$r" in
      *'"pendente":false'*) "$PARA_GECKO" -f > /dev/null && linha "Gecko do MaiSim" "" "derrubado (nada por salvar)";;
      *'"pendente":true'*)  linha "Gecko do MaiSim" "" "FICOU NO AR: há circuito sem salvar"
                            echo "    salve no /maisim/simu (disquete) e rode $PARA_GECKO -f — ou derrube assim mesmo com -f";;
      *) if "$PARA_GECKO" > /dev/null; then linha "Gecko do MaiSim" "" "derrubado"
         else linha "Gecko do MaiSim" "" "FICOU NO AR (título com *): $PARA_GECKO -f derruba"; fi;;
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

echo "maisim: subindo o MaiSim (logs em $LOG)"
sobe_py scope "$SP" scope/servidor.py
sobe_py simu "$MP" simu/servidor.py

# o Gecko do MaiSim: inteiro no ar → fica; nada no ar → sobe em paralelo (leva até ~1 min); pela metade → avisa
if [ -n "${MAISIM_SEM_GECKO:-}" ]; then
  linha "Gecko do MaiSim" "" "pulado (MAISIM_SEM_GECKO)"
else
  n=0; for p in $GECKO; do no_ar "$p" && n=$((n + 1)); done
  if [ "$n" = 3 ]; then linha "Gecko do MaiSim" "portas $GECKO" "já estava no ar (fica)"
  elif [ "$n" = 0 ]; then
    setsid "$SOBE_GECKO" > "$LOG/gecko.log" 2>&1 &
    SUBI[gecko]=$!
    linha "Gecko do MaiSim" "portas $GECKO" "subindo (até ~1 min; aviso quando ficar pronto)"
    ( for _ in $(seq 1 120); do no_ar "$MAISIM_PORTA_MOTOR" && { echo; echo "maisim: Gecko do MaiSim pronto (o editor do /maisim/simu já funciona)"; exit 0; }; sleep 1; done
      echo; echo "maisim: o Gecko do MaiSim não ficou pronto em 2 min (veja $LOG/gecko.log)" ) &
    VIGIA=$!
  else
    linha "Gecko do MaiSim" "portas $GECKO" "PELA METADE ($n de 3 no ar): rode $PARA_GECKO e de novo npm run maisim"
  fi
fi

if no_ar "$PORTA"; then
  linha "página" "http://localhost:$PORTA" "já estava no ar (fica)"
  echo; echo "maisim: tudo no ar em http://localhost:$PORTA — Ctrl+C derruba o que este comando subiu"
  sleep infinity & VITE=$!; wait "$VITE"
else
  linha "página" "http://localhost:$PORTA" "subindo (Vite)"
  echo; echo "maisim: abra http://localhost:$PORTA — Ctrl+C derruba o que este comando subiu"; echo
  (cd "$APP" && exec ./node_modules/.bin/vite --port "$PORTA" --strictPort) &
  VITE=$!; SUBI[pagina]=$VITE
  wait "$VITE"
fi
