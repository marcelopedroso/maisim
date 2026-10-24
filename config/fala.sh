# As mensagens dos scripts no idioma do terminal (português se LC_ALL, LC_MESSAGES ou LANG começa com "pt"; senão inglês,
# que é também o caso de quem roda sem idioma nenhum, como o systemd). Não é um script: os outros o leem com
#   . "<raiz>/config/fala.sh"      (pelo caminho do próprio script, nunca pela pasta atual)
# e escrevem  fala "texto em português" "text in English"  (uma linha; >&2 para o erro). Os marcadores que outros
# programas procuram na saída ou nos registros (ex.: o "ouvindo" do motor, o "GeckoCIRCUITS is ready") não passam por aqui.
case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in pt*) FALA_PT=1;; *) FALA_PT=;; esac
fala() { if [ -n "$FALA_PT" ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }
