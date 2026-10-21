# PEW / gecko — o GeckoCIRCUITS dentro do navegador
O GeckoCIRCUITS roda aqui na máquina numa tela virtual (Xvfb) e aparece numa aba do navegador pelo noVNC: é a janela
de verdade, com menus, diálogos e edição do circuito. Crédito: GeckoCIRCUITS, simulador de código aberto
(github.com/geckocircuits/GeckoCIRCUITS); aqui com o fork MDPGeckoCIRCUITS (ponte TCP, leitura em lote).

**Tudo de uma vez (recomendado):** no pew-app, `npm run pew` sobe scope, simu, este Gecko e a página, e o Ctrl+C
derruba o que ele subiu (o Gecko só se não houver circuito sem salvar; ver power-eletronics/pew-app/scripts/pew.sh).
**Subir:** `sm-autonomo/simu/pew_gecko/sobe.sh [modelo.ipes] [porta-gecko] [tela]` (padrão: uma cópia do modelo 03 em
`~/.cache/pew_gecko/`, porta 43050, tela :99). **Parar:** `para.sh` (só os processos que o sobe.sh subiu).
**Abrir:** pelo PEW, **http://localhost:5000/pew/gecko/** (cartão "GeckoCIRCUITS no navegador" ou o menu lateral; o
pew-app encaminha /pew/gecko, websocket incluído), ou direto em http://localhost:6080/ (sem o menu). A página é o
index.html desta pasta: barra com o estado da conexão, tela cheia, a tela do Gecko pelo núcleo do noVNC (reconecta
sozinha) e o menu lateral do PEW (/pew-nav.js do pew-app). O sobe.sh monta a pasta servida em ~/.cache/pew_gecko/web
(essa página + atalho novnc/ para o noVNC do sistema).

Pacotes: `sudo apt install -y xvfb x11vnc novnc websockify openbox`. Portas: 5999 (VNC) e 6080 (noVNC), só em
localhost; 43050 (RMI do Gecko) e 6110 (ponte da co-simulação, para STEP/GET…), que o Gecko e a gecko-bridge abrem em
todas as interfaces; 6120 (motor do editor do /pew/simu, `pew_simu/motor`), só em 127.0.0.1. O sobe.sh sobe a
ponte e o motor (compila o motor se o .java for mais novo); o para.sh derruba tudo.

## Cuidados
- **Modelo:** o padrão é uma cópia, então salvar pela tela não mexe no modelo do repositório. Passar um modelo do
  repositório como argumento faz o Gecko trabalhar nele.
- **Pasta pessoal própria:** o Gecko guarda `~/.GeckoCIRCUITS/autoBackup.ipes` e as preferências, comuns a todas as
  instâncias; um autoBackup mais novo que o modelo trava o Gecko num diálogo ("carregar o backup?"). Por isso o sobe.sh
  dá ao Java a pasta pessoal `~/.cache/pew_gecko/home` (`-Duser.home`): este Gecko não vê nem mexe no autoBackup dos
  outros e sobe sem diálogo. Se algum diálogo aparecer, responder pelo navegador; o sobe.sh avisa quando o Gecko não
  fica pronto em 60 s.
- **Alterações não salvas:** o para.sh não derruba o Gecko se o título mostra o modelo com * (alteração não salva);
  salvar pelo navegador ou usar `para.sh -f`. O autoBackup que uma sessão deixa (inclusive com edições não salvas) é
  guardado pelo próximo sobe.sh em `~/.cache/pew_gecko/backups/autoBackup_<data>.ipes`, e o Gecko sobe sem o diálogo.
- **Outro Gecko aberto:** esta instância usa outra porta (43050) e não tem ponte; não é co-simulação e não interfere
  na rodada de outro chat.
- **WSL:** `/tmp/.X11-unix` é do WSLg e só de leitura, então o Xvfb fica no socket abstrato (DISPLAY=:99 funciona);
  o x11vnc desiste se vê `WAYLAND_DISPLAY`, então o sobe.sh roda ele sem essa variável.
- **Gerenciador de janelas:** com o openbox instalado (`sudo apt install -y openbox`), o sobe.sh o liga na tela
  virtual: as janelas ganham borda, se movem e vêm para a frente, e a janela principal do Gecko abre maximizada (regra
  pelo título "… - GeckoCIRCUITS" numa cópia da configuração padrão, em ~/.cache/pew_gecko/openbox_rc.xml). Sem ele,
  as janelas ficam paradas, sem borda, com faixa preta em volta.
- Primeiro teste (17/10): o clique no navegador fechou o diálogo do autoBackup, o Gecko ficou pronto e o menu
  Simulation abriu, pela página do PEW (Vite) e direto.
