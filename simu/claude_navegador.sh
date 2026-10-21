#!/bin/sh
# "Navegador" do login do Claude do MaiSim: o `claude auth login` chama $BROWSER com a URL de login que volta sozinha
# (retorno em localhost). Em vez de abrir uma janela (no WSL, seria o Chromium do Linux), guardamos a URL para a tela
# do MaiSim mostrar como link. A URL não é segredo (o verificador PKCE fica no processo do claude).
[ -n "$MAISIM_CLAUDE_URL_ARQ" ] && printf '%s\n' "$1" > "$MAISIM_CLAUDE_URL_ARQ"
exit 0
