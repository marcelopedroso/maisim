#!/usr/bin/env bash
# npm run maisim — o MaiSim inteiro numa tacada: o scope, o simulador, o Gecko (tela virtual, Gecko, motor do editor) e a
# página (app/pagina.py; o Vite com MAISIM_PAGINA=vite). As portas e as pastas vêm de config/ (padrao.env; o .env da raiz muda o que for seu). O que já estiver no
# ar é reaproveitado e continua no ar. Ctrl+C derruba o que ESTE comando subiu. O Gecko só cai se não houver circuito sem
# salvar (o simulador compara o que está no Gecko com o arquivo aberto); se houver, ele fica no ar e o comando diz como derrubar.
# Variável: MAISIM_SEM_GECKO=1 (não sobe o Gecko).
# Opção: --abrir (npm run abrir): o lançador (app/lancador.py --abrir, o mesmo do Windows e do AppImage) em vez disto —
# abre a janela do MaiSim e, fechada a última (~20 s depois), desliga; o Gecko fica se houver circuito sem salvar, nunca
# para no meio de uma rodada, e o ícone de novo com o MaiSim no ar só abre a janela. Sem --abrir (o npm run maisim, o
# sobe_fundo.sh, um serviço do systemd): tudo fica no ar até o Ctrl+C, com a janela fechada ou não.
# Opção: -p PORTA (npm run maisim -- -p 8100): a página nessa porta e as outras logo em seguida (+1 o simulador, +2 o scope,
# +3 o Gecko, +4 o motor do editor, +5 a tela do Gecko, +6 o VNC; a tela virtual :PORTA/100); sem -p, as de config/ (7100…).
set -u
APP="$(cd "$(dirname "$0")/.." && pwd)"                   # app/ (a página)
SM="$(cd "$APP/.." && pwd)"                               # a raiz do projeto: scope/, simu/, gecko/
. "$SM/config/fala.sh"                                     # fala pt en: as mensagens no idioma do terminal
B=; ABRIR=; CACHE_DADO=${MAISIM_CACHE:-}                            # o cache escolhido por você (no ambiente) vale mais que o do -p
while [ $# -gt 0 ]; do
  case "$1" in
    -p|--porta)
      B=${2:-}
      if ! [[ "$B" =~ ^[0-9]+$ ]] || [ "$B" -lt 1024 ] || [ "$B" -gt 65000 ]; then
        fala "maisim: -p pede um número de porta entre 1024 e 65000 (ex.: -p 8100)" \
             "maisim: -p needs a port number between 1024 and 65000 (e.g. -p 8100)"; exit 2; fi
      export MAISIM_PORTA_PAGINA=$B MAISIM_PORTA_SIMU=$((B + 1)) MAISIM_PORTA_SCOPE=$((B + 2)) MAISIM_PORTA_GECKO=$((B + 3))
      export MAISIM_PORTA_MOTOR=$((B + 4)) MAISIM_PORTA_TELA=$((B + 5)) MAISIM_PORTA_VNC=$((B + 6)) MAISIM_TELA_X=":$((B / 100))"
      shift 2;;
    --abrir) ABRIR=1; shift;;
    -h|--help)
      fala "uso: npm run maisim [-- -p PORTA] [--abrir]   (sem -p: http://localhost:7100; com -p 8100: http://localhost:8100, e 8101–8106;
     --abrir: abre a janela, e fechar a janela desliga)" \
           "usage: npm run maisim [-- -p PORT] [--abrir]   (no -p: http://localhost:7100; with -p 8100: http://localhost:8100, and 8101–8106;
     --abrir: opens the window, and closing the window stops MaiSim)"; exit 0;;
    *) fala "maisim: opção desconhecida: $1 (use -p PORTA, --abrir, ou -h)" "maisim: unknown option: $1 (use -p PORT, --abrir, or -h)"; exit 2;;
  esac
done
eval "$(python3 "$SM/config/ler_config.py" --shell)"     # as portas e as pastas (config/padrao.env, o .env, o ambiente)
# com -p, um cache só desta porta (o estado do editor, as conversas, o Gecko e os PIDs dele): duas instâncias lado a lado não
# se atropelam; os seus dados (circuitos, rodadas) continuam os mesmos
if [ -n "$B" ] && [ -z "$CACHE_DADO" ]; then export MAISIM_CACHE="$MAISIM_CACHE/porta-$B"; mkdir -p "$MAISIM_CACHE"; fi
if [ -n "$ABRIR" ]; then                                   # o lançador, com as portas e o cache daqui (no ambiente)
  exec python3 "$APP/lancador.py" --abrir ${MAISIM_SEM_GECKO:+--sem-gecko}; fi
LOG="$MAISIM_CACHE/logs"; mkdir -p "$LOG"
PORTA=$MAISIM_PORTA_PAGINA; SP=$MAISIM_PORTA_SCOPE; MP=$MAISIM_PORTA_SIMU
GECKO="$MAISIM_PORTA_TELA $MAISIM_PORTA_GECKO $MAISIM_PORTA_MOTOR"
SOBE_GECKO="$SM/gecko/sobe.sh"; PARA_GECKO="$SM/gecko/para.sh"
G=$(fala "Gecko do MaiSim" "MaiSim's Gecko"); PAG=$(fala "página" "page")   # os nomes nas linhas de estado
NO_AR=$(fala "já estava no ar (fica)" "already running (stays)")
declare -A SUBI=()                                         # o que este comando subiu: nome → pid
no_ar() { ss -ltn 2>/dev/null | grep -q ":$1 "; }
pid_da_porta() { ss -ltnp 2>/dev/null | grep ":$1 " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }
espera() { for _ in $(seq 1 $((${2:-15} * 2))); do no_ar "$1" && return 0; sleep 0.5; done; return 1; }
linha() { printf "  %s%*s %-34s %s\n" "$1" $((14 - ${#1})) "" "$2" "$3"; }   # ${#1} conta letras (o printf contaria bytes)

# servidor Python numa sessão própria (setsid): o Ctrl+C do terminal não chega nele; quem derruba é a limpeza abaixo
sobe_py() {                                                # nome porta script [variáveis…]
  local nome=$1 porta=$2 script=$3; shift 3
  if no_ar "$porta"; then linha "$nome" "$(fala porta port) $porta" "$NO_AR"; return; fi
  (cd "$SM" && exec env "$@" setsid nohup python3 "$script" --porta "$porta" > "$LOG/$nome.log" 2>&1) &
  if espera "$porta" 15; then SUBI[$nome]=$(pid_da_porta "$porta"); linha "$nome" "$(fala porta port) $porta" "$(fala "subiu agora" "started now")"
  else linha "$nome" "$(fala porta port) $porta" "$(fala "NÃO subiu (veja $LOG/$nome.log)" "did NOT start (see $LOG/$nome.log)")"; fi
}

limpa() {
  trap - EXIT INT TERM
  echo; fala "maisim: derrubando o que este comando subiu…" "maisim: stopping what this command started…"
  [ -n "${VITE:-}" ] && { kill "$VITE" 2>/dev/null; wait "$VITE" 2>/dev/null; }
  [ -n "${VIGIA:-}" ] && { kill "$VIGIA" 2>/dev/null; wait "$VIGIA" 2>/dev/null; }
  if [ -n "${SUBI[gecko]:-}" ]; then                       # o Gecko: só sem nada por salvar (pergunta ao simu)
    local r; r=$(curl -s --max-time 30 "http://localhost:$MP/maisim/simu/editor/pendente" 2>/dev/null)
    case "$r" in
      *'"pendente":false'*) "$PARA_GECKO" -f > /dev/null && linha "$G" "" "$(fala "derrubado (nada por salvar)" "stopped (nothing to save)")";;
      *'"pendente":true'*)  linha "$G" "" "$(fala "FICOU NO AR: há circuito sem salvar" "LEFT RUNNING: there is an unsaved circuit")"
                            fala "    salve no /maisim/simu (disquete) e rode $PARA_GECKO -f — ou derrube assim mesmo com -f" \
                                 "    save it in /maisim/simu (floppy disk) and run $PARA_GECKO -f — or stop it anyway with -f";;
      *) if "$PARA_GECKO" > /dev/null; then linha "$G" "" "$(fala derrubado stopped)"
         else linha "$G" "" "$(fala "FICOU NO AR (título com *): $PARA_GECKO -f derruba" "LEFT RUNNING (title with *): $PARA_GECKO -f stops it")"; fi;;
    esac
  fi
  for nome in simu scope; do
    [ -n "${SUBI[$nome]:-}" ] && kill "${SUBI[$nome]}" 2>/dev/null && linha "$nome" "" "$(fala derrubado stopped)"
  done
  [ -n "${SUBI[pagina]:-}" ] && linha "$PAG" "" "$(fala derrubada stopped)"
  exit 0
}
trap limpa EXIT
trap 'exit 130' INT TERM

fala "maisim: subindo o MaiSim (logs em $LOG)" "maisim: starting MaiSim (logs in $LOG)"
sobe_py scope "$SP" scope/servidor.py
sobe_py simu "$MP" simu/servidor.py

# o Gecko do MaiSim: inteiro no ar → fica; nada no ar → sobe em paralelo (leva até ~1 min); pela metade → avisa
if [ -n "${MAISIM_SEM_GECKO:-}" ]; then
  linha "$G" "" "$(fala "pulado (MAISIM_SEM_GECKO)" "skipped (MAISIM_SEM_GECKO)")"
else
  n=0; for p in $GECKO; do no_ar "$p" && n=$((n + 1)); done
  if [ "$n" = 3 ]; then linha "$G" "$(fala portas ports) $GECKO" "$NO_AR"
  elif [ "$n" = 0 ]; then
    setsid "$SOBE_GECKO" > "$LOG/gecko.log" 2>&1 &
    SUBI[gecko]=$!
    linha "$G" "$(fala portas ports) $GECKO" "$(fala "subindo (até ~1 min; aviso quando ficar pronto)" "starting (up to ~1 min; I will say when it is ready)")"
    ( for _ in $(seq 1 120); do no_ar "$MAISIM_PORTA_MOTOR" && { echo; fala "maisim: Gecko do MaiSim pronto (o editor do /maisim/simu já funciona)" \
        "maisim: MaiSim's Gecko is ready (the /maisim/simu editor works now)"; exit 0; }; sleep 1; done
      echo; fala "maisim: o Gecko do MaiSim não ficou pronto em 2 min (veja $LOG/gecko.log)" \
                "maisim: MaiSim's Gecko was not ready within 2 min (see $LOG/gecko.log)" ) &
    VIGIA=$!
  else
    linha "$G" "$(fala portas ports) $GECKO" "$(fala "PELA METADE ($n de 3 no ar): rode $PARA_GECKO e de novo npm run maisim" \
                                         "HALF UP ($n of 3 running): run $PARA_GECKO and npm run maisim again")"
  fi
fi

if no_ar "$PORTA"; then
  linha "$PAG" "http://localhost:$PORTA" "$NO_AR"
  echo; fala "maisim: tudo no ar em http://localhost:$PORTA — Ctrl+C derruba o que este comando subiu" \
            "maisim: everything is running at http://localhost:$PORTA — Ctrl+C stops what this command started"
  sleep infinity & VITE=$!; wait "$VITE"
else
  # a página: o Python (app/pagina.py, sem Node; a dos pacotes também) ou, com MAISIM_PAGINA=vite, o Vite de antes
  if [ "${MAISIM_PAGINA:-}" = vite ]; then QUEM=Vite; else QUEM=Python; fi
  linha "$PAG" "http://localhost:$PORTA" "$(fala "subindo ($QUEM)" "starting ($QUEM)")"
  echo; fala "maisim: abra http://localhost:$PORTA — Ctrl+C derruba o que este comando subiu" \
            "maisim: open http://localhost:$PORTA — Ctrl+C stops what this command started"; echo
  if [ "$QUEM" = Vite ]; then (cd "$APP" && exec ./node_modules/.bin/vite --port "$PORTA" --strictPort) &
  else (exec python3 "$APP/pagina.py" --porta "$PORTA") & fi
  VITE=$!; SUBI[pagina]=$VITE
  wait "$VITE"
fi
