# MaiSim / gecko — o GeckoCIRCUITS dentro do navegador
O GeckoCIRCUITS roda aqui na máquina numa tela virtual (Xvfb) e aparece numa aba do navegador pelo noVNC: é a janela
de verdade, com menus, diálogos e edição do circuito. Crédito: GeckoCIRCUITS, simulador de código aberto
(github.com/geckocircuits/GeckoCIRCUITS, GPLv3), montado por `construir.sh`: o original num commit fixo mais os patches
de `patches/`: `0001` a leitura e a escrita em lote pela interface remota; `0002` os nomes das peças escondidas (as duas
fontes "U" de dentro da relutância não linear, NLRel, ficavam com os nomes U.1 e U.2 para sempre — nem apagar nem um
circuito novo os soltava, e criar uma fonte U.1 dava "nome em uso"; achado da vistoria dos componentes, 24/10). `0003`: o
Gecko sem quem olhe a tela — com `-Dmaisim.oculto=true` a janela principal não aparece (o MaiSim é a tela; o Windows usa,
sem tela virtual) e, com `-Dmaisim.dialogos=ARQUIVO`, uma vigia dentro do próprio Gecko acha cada diálogo (erro, aviso),
anota "título TAB texto" no arquivo e aperta o botão padrão: um pedido nunca fica esperando um OK que ninguém vê, no Linux
e no Windows, sem X11 (o simu lê o arquivo e avisa a página). `0005`: `simulateStepsAveraged`, os passos com a média de
saídas escolhidas lidas depois de cada um (o STEPA do motor: as perdas do FLOW, cuja de chaveamento dura um passo só, vão
ao scope como a média do intervalo entre amostras). `0006`: o nome da grandeza no bloco Grandeza da máquina (VIEWMOT)
estável — o Gecko punha o nome da máquina na frente de novo a cada abertura ("M-DC.1M-DC.1.n [rpm]"…) e trocava o campo
depois de cada simulação (o circuito parecia sem salvar); agora fica sempre "M-DC.1.n [rpm]". `0007`: os blocos de controle
quebrados (v0.3.1) — o POW (x^y) com as duas entradas de verdade (o calculador nascia com uma: ligar a 2ª não valia e o
passo dava ArrayIndexOutOfBounds); a TF com o termo de 2ª derivada dividido por dt² (era por dt: um numerador com 2 graus a
mais que o denominador dava a 2ª derivada vezes dt², quase nada); no `PolynomTools` do diálogo da TF (polos e zeros →
polinômios), a parte imaginária somada com a imaginária (somava a real: raízes complexas depois de uma real davam os
coeficientes errados) e o corte dos zeros do fim pelo módulo e sem passar do índice 0 (com ganho negativo, ia até −1 e
caía), e o resto da divisão de polinômios nunca mais longo que o denominador (o arredondamento deixava um coeficiente
"quase zero" e a TF lia o vetor de estado no índice −1); o DELAY conta os passos com tolerância (T = 70 µs com Δt = 10
µs dava 6,999… → 6 passos; agora 7); e a TF nova nasce 1/(1 + 1e-3 s) em modo polinômio (era 1/1, e o
diálogo, no modo polos e zeros, a refazia com o polo 2 e o zero 1 de enfeite: (s − 1)/(s − 2), instável). Os circuitos
salvos antes não mudam: o arquivo guarda os polinômios e o modo. O MaiSim escreve a TF pelo arquivo (`editor/mede` tipo H),
como os medidores. `0008`: `simulateStepsSampled`, muitas amostras numa chamada — para cada uma, os passos dela, a leitura das
saídas pedidas no fim e a média das de perda (FLOW) a cada passo, os mesmos números do `simulateSteps` + `getOutputs` (e do
`simulateStepsAveraged`) amostra a amostra (o STEPS do motor: a rodada sem controle em Python vai em blocos, sem duas idas e
voltas até o Gecko por amostra; ~0,3 ms cada, contra ~1 µs de cálculo por passo no buck). Um passo que falha encerra o bloco
depois do registro daquela amostra, como o `simulateSteps` engole o erro e segue.

**Tudo de uma vez (recomendado):** em `app/`, `npm run maisim` sobe o scope, o simulador, este Gecko e a página, e o
Ctrl+C derruba o que ele subiu (o Gecko só se não houver circuito sem salvar; ver `app/scripts/maisim.sh`).
**Subir só o Gecko:** `gecko/sobe.sh [modelo.ipes]` (padrão: uma cópia do exemplo do buck em `$MAISIM_CACHE/gecko/`).
**Parar:** `para.sh` (só os processos que o sobe.sh subiu). Portas e tela virtual: `config/padrao.env` (o `.env` da
raiz muda o que for seu).
**Abrir:** pelo MaiSim, **http://localhost:7100/maisim/gecko/** (cartão "GeckoCIRCUITS no navegador" ou o menu lateral;
a página encaminha /maisim/gecko, websocket incluído), ou direto em http://localhost:7105/ (sem o menu). A página é o
index.html desta pasta: barra com o estado da conexão, tela cheia, a tela do Gecko pelo núcleo do noVNC (reconecta
sozinha) e o menu lateral do MaiSim (/maisim-nav.js do maisim-app). O sobe.sh monta a pasta servida em ~/.cache/maisim/gecko/web
(essa página + atalho novnc/ para o noVNC do sistema).

Pacotes: `sudo apt install -y xvfb x11vnc novnc websockify openbox`. Portas (config/padrao.env): MAISIM_PORTA_VNC
(7106) e MAISIM_PORTA_TELA (7105, noVNC), só em localhost; MAISIM_PORTA_GECKO (7103, a interface remota do Gecko, que ele
abre em todas as interfaces); MAISIM_PORTA_MOTOR (7104, o motor do editor, `simu/motor`), só em 127.0.0.1. O sobe.sh sobe o
motor (compila o motor se o .java for mais novo); o para.sh derruba tudo.

## Cuidados
- **Modelo:** o padrão é uma cópia, então salvar pela tela não mexe no modelo do repositório. Passar um modelo do
  repositório como argumento faz o Gecko trabalhar nele.
- **Pasta pessoal própria:** o Gecko guarda `~/.GeckoCIRCUITS/autoBackup.ipes` e as preferências, comuns a todas as
  instâncias; um autoBackup mais novo que o modelo trava o Gecko num diálogo ("carregar o backup?"). Por isso o sobe.sh
  dá ao Java a pasta pessoal `~/.cache/maisim/gecko/home` (`-Duser.home`): este Gecko não vê nem mexe no autoBackup dos
  outros e sobe sem diálogo. Se algum diálogo aparecer, responder pelo navegador; o sobe.sh avisa quando o Gecko não
  fica pronto em 60 s.
- **Alterações não salvas:** o para.sh não derruba o Gecko se o título mostra o modelo com * (alteração não salva);
  salvar pelo navegador ou usar `para.sh -f`. O autoBackup que uma sessão deixa (inclusive com edições não salvas) é
  guardado pelo próximo sobe.sh em `~/.cache/maisim/gecko/backups/autoBackup_<data>.ipes`, e o Gecko sobe sem o diálogo.
- **Outro Gecko aberto:** esta instância usa outra porta (43050) e não tem ponte; não é co-simulação e não interfere
  na rodada de outro chat.
- **WSL:** `/tmp/.X11-unix` é do WSLg e só de leitura, então o Xvfb fica no socket abstrato (DISPLAY=:99 funciona);
  o x11vnc desiste se vê `WAYLAND_DISPLAY`, então o sobe.sh roda ele sem essa variável.
- **Gerenciador de janelas:** com o openbox instalado (`sudo apt install -y openbox`), o sobe.sh o liga na tela
  virtual: as janelas ganham borda, se movem e vêm para a frente, e a janela principal do Gecko abre maximizada (regra
  pelo título "… - GeckoCIRCUITS" numa cópia da configuração padrão, em ~/.cache/maisim/gecko/openbox_rc.xml). Sem ele,
  as janelas ficam paradas, sem borda, com faixa preta em volta.
- Primeiro teste (17/10): o clique no navegador fechou o diálogo do autoBackup, o Gecko ficou pronto e o menu
  Simulation abriu, pela página do MaiSim (Vite) e direto.
