# PEW / simu — monte e simule circuitos, com o Gecko como cérebro
Um front nosso para os modelos do GeckoCIRCUITS: lê o .ipes e desenha no navegador os componentes, as ligações e os
subcircuitos (SMs), sem a janela do Gecko. Os scopes do Gecko ficam de fora (o /pew/scope faz esse papel).
O Gecko é o cérebro (backend): a interface é nossa, e cada edição vira um pedido ao próprio Gecko, que aplica e grava o
.ipes. Feito: ver o circuito; catálogo da paleta; motor do editor. A seguir: a paleta e a edição na tela.

**Subir:** `python3 simu/pew_simu/servidor.py` (da raiz de sm-autonomo; porta 8767). **Abrir:** pelo PEW,
**http://localhost:5000/pew/simu/** (menu lateral ou cartão "Simu: monte e simule"; o pew-app encaminha
/pew/simu, `PEW_SIMU_URL` troca o destino), ou direto em http://localhost:8767/pew/simu/. Até 18/10 o módulo se chamava
/pew/control (pasta `pew_control`): o endereço antigo redireciona para o novo.

## Uso
- Escolher o modelo (os .ipes de `simu/gecko/*/`); arrastar move, roda dá zoom, **ajustar** (ou tecla 0) mostra a folha.
- Passar o mouse num elemento: nome, tipo, parâmetros (com a variável global, se houver), nós, o que um amperímetro ou
  voltímetro mede, o elemento que um gate comanda.
- Clicar num SM abre a folha de dentro (meia ponte, capacitor, lógica de gate); Esc ou "folha principal" volta.
- **controle** mostra/esconde blocos de controle e medição; **rótulos**, os rótulos de fios e terminais.

## Como o desenho é feito (ipes.py)
Regras do próprio Gecko (código em MDPGeckoCIRCUITS, pacote `ch.technokrat.gecko.geckocircuits.circuit`):
- orientação (`ComponentDirection`): 503 norte→sul, 501 sul→norte, 502 oeste→leste, 504 leste→oeste;
- elemento de dois pinos (`TerminalTwoPortComponent`): terminais no centro ± 2 na direção; o 1º é o "Anfang"
  (+ da fonte, anodo do diodo, coletor do IGBT);
- bloco de controle (`TerminalRelativePosition`): entrada i em (x − d, y + i), saída j em (x + d, y + j); d por tipo
  (AND, NOT e DELAY têm saída em x + 1), aqui a menor distância que encosta numa ponta de fio;
- subcircuito (`SubcircuitBlock`): retângulo de (x − ½, y − ½) com blockSizeX × blockSizeY; terminal da folha de dentro
  com lado (`EnumTerminalLocation`: cima, esquerda, direita, baixo) e posição proporcional;
- **variáveis globais** (`optimizerName[]` / `optimizerValue[]`): parâmetro ligado a uma variável ($La …) vale o da
  variável, que é o que o Gecko mostra e usa. No modelo 03, o valor guardado no elemento está velho (ex.: L.4 guarda
  10 mH, $La = 15 mH; R.1 guarda 133,3 Ω, $Rload = 150 Ω; U guarda 120 V, $Vp = 180 V); a dica mostra os dois.

**Conferência:** `python3 simu/pew_simu/ipes.py <modelo.ipes>` conta as pontas de fio que caem num terminal, noutro
fio ou num rótulo. Em 18/10: modelos 01, 02 e 03, todas (03: 874 de 874); modelo 00, uma solta em (99, 61) na folha
principal. O desenho do modelo 03 foi comparado com a tela do Gecko (mesmas posições, valores das variáveis globais).

## Catálogo da paleta (catalogo_gecko.py → static/catalogo.json)
As 11 abas do Gecko (Circuit, Motor & EMI, Subcircuit, Thermal, Reluctance, Control, Measure, Digital, Math,
Source/Sink, Special) e os 121 componentes, na ordem dele, tirados do código (SchematischeEingabeAuswahl2, CircuitTyp,
ControlTyp, SpecialTyp, I18nKeys): enum, código gravado no .ipes, nome curto aceito pelo createComponent e nome exibido.

## Motor do editor (motor/src/pew/PewMotor.java, porta 6120, só 127.0.0.1)
Cliente RMI da interface remota do Gecko (GeckoRemoteInterface), separado da gecko-bridge da co-simulação. Protocolo de
linhas, "OK …"/"ERR …": OPEN, SAVEAS, CREATE <tipo> <nome> <x> <y>, DELETE, MOVE, POS, ROTATE, ORIENT, RENAME, PARAMS,
GETP, SETP, GETG, SETG, INNODE/OUTNODE (rótulo de terminal), GETIN/GETOUT, LIST, SHEET. Sobe com o pew_gecko/sobe.sh.

Conferido em 18/10 no Gecko do PEW (cópia do modelo 03): criar um R e uma CONST, mudar o R, rotular a saída da CONST e
mudar $La; o Gecko salvou e o ipes.py leu de volta posição, valor, rótulo e $La (L.4 acompanhou); apagar os dois e
voltar $La: os 485 elementos voltam com os mesmos valores efetivos e os fios iguais. Ao salvar, o Gecko também troca os
valores velhos guardados nos elementos pelos das variáveis (23 → 0 no modelo 03).

**Limitação conhecida:** o createConnector da interface remota cria o fio sem tipo (ConnectorType.NONE) e não grava o
nome como rótulo (código comentado em SchematischeEingabe2.externalCreateAndPlaceNewConnector). Para desenhar fios pela
tela, completar isso no fork, compilando num jar separado do que a co-simulação usa.

## Editor na tela (18/10)
- **editar** abre o modelo escolhido no Gecko do PEW; a paleta (abas do Gecko, busca) põe componentes com um clique na
  folha; selecionar mostra o painel: nome, posição, girar/apagar, parâmetros lidos do Gecko (fonte: CC, senoidal ou
  controlada por sinal), variáveis globais, **ligações** (rótulo do nó de cada terminal: mesmo rótulo, mesmo nó, como no
  Gecko) e, nos medidores, **o que ele mede** (voltímetro: nó − nó; amperímetro: corrente de um componente).
  Arrastar move, R gira, Delete apaga. **novo**: folha em branco (o Gecko mantém a tabela de variáveis globais).
  **salvar como…**: o Gecko grava em simu/gecko/pew/.
- O acoplamento dos medidores não existe na interface remota: o Gecko salva o estado, o servidor escreve o acoplamento no
  bloco do medidor e o Gecko reabre o arquivo (quem valida é ele; se não aceitar, a tela diz).
- **rodar ▸** (passo, tempo final, nome): o Gecko do PEW simula; os sinais são as saídas dos medidores e blocos de
  controle (nome = rótulo da saída), publicados ao vivo no /pew/scope e gravados em `rodadas/<data>_<nome>/` com o
  circuito exato (.ipes) e o `scope_<nome>.npz` (aparece no Comparar como "PEW / simu · nome"). Até ~4000 amostras.
- **scope** (tela dividida): o /pew/scope na mesma janela, **ao lado** (dividida na vertical, o padrão) ou **embaixo**
  (os dois botões com o desenho da divisão); divisória arrastável, posição e tamanho guardados no navegador. Abre na
  última rodada (a do servidor, ou a gravada mais recente em `rodadas/`) e ao vivo enquanto simula, sempre com
  `?so=rodada`: o scope mostra só a seção e os sinais da rodada, e o índice também. Em edição, o desenho fica com 320 px
  ou mais (o scope ao lado não passa disso).
- Teste de ponta a ponta (18/10): folha nova, fonte senoidal 100 V 50 Hz e R 10 Ω ligados por rótulos (a, gnd),
  voltímetro a − gnd e amperímetro no R; 40 ms a 1 µs em ~5,5 s; no scope, pico de v_r 100,000 V e v_r/i_r = 10,000000 Ω
  em todas as 4001 amostras.

## Menus e simulação (18/10, manhã)
- **Arquivo ▾**: novo circuito, salvar como…, editar / só ver. **Simulação ▾** (como o menu do Gecko): parâmetros da
  simulação… (Δt, tempo final, nome, amostras; guardados no navegador), variáveis globais ($)… (todas, com quantos
  componentes usam cada uma), iniciar (Ctrl+Enter), pausar e continuar (Espaço), parar. Sem as teclas F do Gecko: F5,
  F1, F3 e F4 são do navegador (recarregar, ajuda, busca, endereço). A rodada corre em segundo plano no
  servidor (GET editor/rodada dá o progresso; POST editor/pausar|continuar|parar); enquanto roda, o circuito não aceita
  edição. "fim" só depois de gravado o .npz (a tela abre o scope nele).
- Avisos num modal da página (sem confirm/prompt do navegador); apagar em vermelho; paleta com símbolo de cada
  componente (os sem desenho próprio: caixa com a sigla); textos da tela sem "Gecko".
- Observação: o último instante que o Gecko informa é um passo antes do tempo final (100 000 passos de 1 µs terminam
  em 99,999 ms); as amostras usam o tempo do próprio Gecko.
- Teste (18/10): Arquivo › Novo, circuito fonte + R + medidores, parâmetros (tempo final 0,1 s), Ctrl+Enter, Espaço
  (progresso parado), Espaço até o fim (4001 amostras em 5,3 s), scope embaixo na rodada, variáveis globais, apagar com cancelar;
  nenhum aviso do navegador, sem erros de JavaScript.

## Nome novo, tela dividida ao lado e histórico (18/10, madrugada)
- /pew/control virou **/pew/simu** (pasta `pew_simu`, `static/simu.js`, ícone novo no menu lateral: resistor + ▶);
  /pew/control redireciona (GET; POST aceita os dois prefixos). O estado do editor foi para `~/.cache/pew_simu/`.
- **Histórico** embaixo do painel da direita (em edição): as últimas 20 mudanças e avisos (o que passa em verde ou
  vermelho no topo), com a hora; guardado na aba do navegador (sessionStorage).
- Teste (18/10, só leitura: sem abrir o editor nem rodar, para não mexer no Gecko em uso): /pew/control → /pew/simu;
  menu lateral com "Simu" ativo; scope ao lado na última rodada (índice: só a rodada; gráfico ocupando o cartão, também
  depois de arrastar a divisória e embaixo); histórico; scope cheio numa rodada do simu com o índice só da rodada; sem
  erros de JavaScript.

## Fios (18/10, madrugada)
Na tela, "conexão" (pedido de Marcelo: botão, dicas, painel e mensagens); no código e no arquivo do Gecko, fio/Verbindung.
- **W** liga e desliga o modo fio (como no Gecko; também o botão "fio" no alto da paleta). Clique num terminal (ou num
  ponto da grade) começa; cada clique põe um canto, e o trecho até o mouse vai em L (tracejado); clicar num terminal ou
  noutro fio termina (duplo clique e Enter também); Backspace tira o último canto; Esc desfaz o fio (outro Esc sai do
  modo). O ponto sob o mouse fica verde onde liga. Domínio do fio pelo que ele toca (potência = LK, controle, térmico); fio de
  potência não termina em terminal de controle (e vice-versa).
- Clicar num fio o seleciona (laranja): no painel da direita, o **rótulo do nó** (fios e terminais com o mesmo rótulo
  ficam no mesmo nó; o voltímetro mede por rótulo) e **apagar** (ou Delete, com confirmação).
- Como: a interface remota do Gecko cria fio sem tipo e sem rótulo (createConnector incompleto). Então, como nos
  medidores, o Gecko salva o estado, o servidor escreve o bloco `verbindungLK|CONTROL|THERM (k)` / `<Verbindung>` (label,
  x[], y[] com um ponto por passo da grade, enabledShorted, parentSheetIdentifier, connectorType = ordinal do
  ConnectorType: LK 0, CONTROL 1, THERMAL 4) e o Gecko reabre; o servidor confere que o fio voltou do Gecko.
  POST editor/fio: `{acao: novo, cantos, dom, rotulo}`, `{acao: apagar, cantos}`, `{acao: rotulo, cantos, rotulo}`.
  Por enquanto só na folha principal. Os terminais dos blocos de controle novos usam distância 2 (palpite do leitor):
  ligar fio em bloco de controle ainda precisa ser conferido.
- **Instância de teste** (sem mexer no Gecko do PEW nem no scope ao vivo): Xvfb :98 + Gecko na 43060 com
  `-Duser.home` próprio + `pew.PewMotor --gecko-port 43060 --porta 6121` + `PEW_SIMU_CACHE=… PEW_MOTOR_PORTA=6121
  PEW_GECKO_TELA=:98 PEW_SIMU_RODADAS=… PEW_SCOPE_URL=http://127.0.0.1:9 python3 simu/pew_simu/servidor.py --porta 8768`.
- Teste (18/10, na instância de teste): pela API, folha nova, U.1 e R.1 SEM rótulo nos terminais, dois fios em U (o de
  baixo com rótulo gnd, o de cima recebe o rótulo a depois), fio na diagonal recusado, fio solto criado e apagado
  (cantos ao contrário), fonte senoidal 100 V 50 Hz, R 10 Ω, voltímetro a − gnd, amperímetro em R.1: 20 ms a 1 µs,
  pico de v_r 100,0000 V e v_r/i_r = 10,000000 Ω em todas as amostras com |i| > 0,5 A (a corrente passa só pelos fios).
  Pela tela (playwright): W, prévia, dois fios por cliques terminando nos terminais, Backspace, Esc, Enter, W sai,
  selecionar, rótulo pelo painel, Delete com o modal; encaixe 4/4; sem erros de JS nem diálogos do navegador (13/13).

## Dentro dos SMs, desfazer, medidores e Abrir (18/10, madrugada)
- **Editar dentro de um SM** (duplo clique no bloco): mover, girar, apagar, renomear, parâmetros, rótulos, componentes
  novos e conexões. A interface remota do Gecko aceita nomes `SUBCIRCUIT.k#nome` em tudo (até createComponent cria
  dentro do SM); as conexões vão pelo arquivo com `parentSheetIdentifier` = uniqueObjectIdentifier do SM.
- **SMs iguais**: no Gecko cada SM é uma cópia independente (só as variáveis $ são comuns). Dentro de um SM, uma faixa
  diz se ele é igual a outros (mesmos elementos: nome, tipo, posição, orientação; mesmas conexões) e, marcado "mudar os
  N juntos" (padrão), o editor aplica a mesma mudança em todos (POST editor/cmds, um lote; conexões com `folhas`).
  Desmarcado, só aquele SM muda e deixa de ser igual (a faixa passa a dizer "único").
- A folha de um SM tem tamanho fixo (worksheetSizeX × Y do bloco; 60 × 20 no modelo 03): o Gecko encosta na borda o
  que passa dela (R criado em y = 30 foi parar em y = 19). A tela desenha a borda tracejada e recusa pôr, mover ou ligar
  fora dela.
- **Bornes**: todo terminal tem um ponto; cheio se ligado (conexão, rótulo ou outro terminal no mesmo ponto), vazado se
  livre. Corrigido o lado dos bornes do SM (EnumTerminalLocation UP=0, LEFT=1, RIGHT=2, BOTTOM=3 → "cedb").
- **Desfazer** (Ctrl+Z ou "↶ desfazer" no histórico): antes de cada mudança o Gecko salva o estado em
  `~/.cache/pew_simu/desfazer/`; desfazer = ele reabre o último. Até 20 passos; abrir outro modelo zera; um pedido que
  falha sem mexer no circuito não ocupa a pilha. A pilha fica na memória do servidor (reiniciá-lo a zera).
- **Sentido da corrente** (botão "corrente"): seta do terminal 1 para o 2 em cada componente de dois terminais, como
  no Gecko; é o sinal que o amperímetro mede (conferido: R.1 com a de cima, v/i = +10 Ω).
- **Medidores → /pew/scope** (regra do PEW; o Scope do Gecko saiu da paleta): ao lado de cada medidor, a etiqueta com o
  nome do sinal no scope (o rótulo da saída, ou o nome do bloco). Ao dizer o que ele mede, o nome vira automático
  (`i_R_1`, `v_a_gnd`) se estava vazio ou era o automático de antes; um nome seu não muda. No que é medido: "A" e o
  sinal no componente; "V+"/"V−" nos nós. "corrente de" e os nós do voltímetro são campos com busca (até 10 sugestões,
  filtradas ao digitar: igual > começa com > contém > letras na ordem). A dica do mouse não mostra mais a posição.
- **Abrir…** (Arquivo, ou clique no nome do modelo): lista com busca de todos os .ipes de simu/gecko/ (repositório e
  salvos pelo PEW em simu/gecko/pew/). "editar" (com lápis) fica antes do scope; a folha principal aparece como "Main".
- Testes (18/10, na instância de teste com o modelo 03): API — Rp movido nos 18 SMs (0,1 s), girado só no SM.1,
  R.90 criado nos 18, conexão nos 18 (0,3 s), 4 desfazer voltam ao original, 5º recusado, pedido com erro não ocupa a
  pilha; depois disso, 2 ms do MMC simulam (80 sinais). Tela — 22/22 (editar antes do scope, setas, etiquetas, marcas,
  dica, Abrir com busca, paleta sem Scope, busca do amperímetro, faixa, arrasto nos 18, só no SM.1, Ctrl+Z, borda e
  recusa fora da folha, R e conexão nos 18 pela paleta e pelo W, ↶ desfazer 2×) e 6/6 nos medidores (busca, nomes
  automáticos, marcas, histórico sem repetição); no PEW de verdade, só leitura, 12/12.

## Biblioteca de subcircuitos, Salvar, medidor dentro do SM (18/10, madrugada)
- **Biblioteca** (`simu/gecko/subcircuitos/<nome>.ipes`): o Gecko não exporta nem importa subcircuito (ele só existe
  dentro do .ipes). Num subcircuito selecionado, **salvar na biblioteca…** grava um .ipes só com o bloco (na folha
  principal, sem os rótulos de fora) e tudo o que está dentro dele (subcircuitos dentro de subcircuitos também), com as
  variáveis $; o próprio Gecko abre esse recorte e o regrava. Na paleta, a aba **Biblioteca** (e a busca) mostra os
  salvos: clicar e pôr, ou **arrastar** para a folha. Usar = copiar o bloco e o conteúdo para o circuito aberto com
  identificadores novos (uniqueObjectIdentifier e tudo o que os cita), nome SUBCIRCUIT.k livre e as variáveis $ que
  faltarem; o Gecko reabre e confere (dá para desfazer). Os arquivos da biblioteca aparecem no Abrir (para editar o
  subcircuito) num grupo próprio.
- **Salvar** (disquete na barra, Ctrl+S, Arquivo › Salvar): grava por cima do arquivo aberto quando ele é do PEW
  (simu/gecko/pew/ ou a biblioteca; o servidor diz isso em `dono`); modelo do repositório ou circuito novo → Salvar
  como. Pontinho laranja no disquete = mudança não salva.
- **Apagar** (lixeira no Abrir): só circuitos salvos pelo PEW e subcircuitos da biblioteca; o arquivo vai para a
  `.lixeira/` da pasta (dá para recuperar).
- **Medidor dentro do SM**: o acoplamento procura o componente medido na mesma folha (os nomes se repetem de um SM para
  outro) e vale para todos os SMs iguais, como as outras mudanças. A rodada leva para o scope também os medidores de
  dentro dos subcircuitos, com o SM na frente do nome (`SM_1_vCSm`).
- **medições** (botão): esconde ou mostra as etiquetas do scope e as marcas A / V±.
- Leitor de blocos do servidor: o Gecko às vezes cola um bloco no seguinte, sem linha em branco (3 no modelo 03); os
  padrões não consomem mais a quebra do fim (485 de 485 blocos, 456 conexões).
- Instância de teste: `PEW_SIMU_BIBLIOTECA` e `PEW_SIMU_SALVOS` trocam as pastas (para não sujar as de verdade).
- Testes (18/10, instância de teste, modelo 03): API — voltímetro VOLT.6 mudado nos 18 SMs e desfeito; SM.1 salvo na
  biblioteca (0,4 s; 20 elementos, 5 terminais); salvar de novo pede para sobrescrever; inserido no próprio MMC como
  SUBCIRCUIT.19 e **o MMC simula** (1 ms, 118 sinais, 38 de medidores dos SMs); circuito novo com 2 cópias e as 25
  variáveis $; salvar, salvar por cima, apagar (lixeira); modelo do repositório não se apaga. Tela — 15/15 (disquete e
  pontinho, medições, Ctrl+S → Salvar como / direto, salvar na biblioteca, aba Biblioteca e busca, arrastar para a
  folha, medidor dentro do SM com busca e nome SM_1_…, Abrir com o grupo da biblioteca e apagar); sem regressão nas
  baterias anteriores (22/22, 6/6, API 7/7).
- **Bolinhas de junção** (18/10): regra do Gecko (`PotentialArea.geometricOnSamePotential`): há ligação onde uma PONTA
  (de conexão ou terminal de componente) cai em qualquer ponto de outra conexão; cruzamento sem ponta não liga. A tela
  põe a bolinha onde 3 ou mais ramos se encontram e há uma ponta (conexão que passa pelo ponto conta 2 ramos; ponta ou
  terminal, 1), potência e controle à parte. Conferido em 7 casos montados (T, cruzamento, L, três pontas, terminal no
  meio, ponta num terminal, potência × controle) e no modelo 03 (10 na folha principal, 8 dentro do SM.1).
- **Terminais dos blocos de controle** (18/10): o leitor punha as entradas e saídas por palpite (distância 2, ou o que as
  pontas das conexões existentes sugeriam), e bloco novo, sem conexão, ficava com a saída no lugar errado na maioria dos
  tipos. Agora a geometria vem do próprio Gecko: `motor/src/pew/PewGeometria.java` constrói cada tipo
  (`TypeInfo.fabric()`, sem janela) e grava os `_posX`/`_posY` crus de cada XIN/YOUT em `geometria_gecko.json` (114 de
  118 tipos; Scope, Space Vector, U-Z*i e Subcircuit não se constroem sem janela e ficam no palpite / regra própria);
  o leitor aplica a conta de `TerminalRelativePosition.getPointFromDirection` (503: x+posX, y−posY; 504, 501, 502) e,
  para blocos com mais terminais que o padrão, o mesmo passo das últimas. Saídas: +1 em 42 tipos (ganho, PI, soma, AND,
  NOT, atraso…), +2 em 12 (medidores, constante, fonte de sinal…); entradas a −2, uma por linha.
  Regerar (com o jar do Gecko): `javac -cp $JAR -d /tmp/geo motor/src/pew/PewGeometria.java && java
  -Djava.awt.headless=true -cp $JAR:/tmp/geo pew.PewGeometria > geometria_gecko.json`.
  Conferência: a tabela encaixa todas as pontas que o Gecko gravou nos 4 modelos (1075/1076, 794/794, 874/874,
  874/874; a do modelo 00 já era solta). Na instância de teste: constante 3 → ganho ×2 → ganho ×5 ligados só por
  conexões nas posições da tabela simulam 3 → 6 → 30; ligando a saída a +2 (o palpite antigo), o segundo ganho fica em 0
  (não liga) e a tela acusa a ponta solta.

## npm run pew (18/10)
- No pew-app (WSL: `cd ~/doutorado/power-eletronics/pew-app && npm run pew`): sobe scope (8765), simu (8767), o Gecko do
  PEW (sobe.sh, em paralelo; avisa quando fica pronto) e a página (Vite, 5000); o que já estiver no ar é reaproveitado e
  fica. Ctrl+C derruba o que o comando subiu; o Gecko só cai se `GET editor/pendente` disser que não há nada por salvar
  (o simu compara o circuito no Gecko com o arquivo aberto — o "*" do título não serve, a interface remota nunca o
  limpa); senão ele fica no ar e o comando diz como derrubar (para.sh -f). Servidores em sessão própria (setsid): o
  Ctrl+C do terminal não os atinge de surpresa. Logs em ~/.cache/pew/. PEW_SEM_GECKO=1, PEW_PORTA, SCOPE_PORTA,
  SIMU_PORTA para outros usos/testes.
- Testes (18/10): do zero em portas de teste (5091/8795/8797, sem Gecko) — sobe, a página responde pelo proxy, Ctrl+C
  derruba só o que subiu; nas portas de verdade com tudo no ar — reaproveita tudo e não derruba nem troca nenhum
  processo (PIDs iguais nas 7 portas); `editor/pendente` na instância de teste: abrir → não, mexer → sim, salvar →
  não, folha nova → sim. O caminho "Gecko do zero" usa o sobe.sh/para.sh de sempre (não testado por este comando, para
  não derrubar o Gecko em uso).

## Controle — passo 1 (18/10): ligações, parâmetros, Ts, editor e laço síncrono
- **Painel "Controle"** na doca (aba ao lado do scope; botão `</>` na barra): à esquerda, "usar este controle ao
  simular", **Ts**, as **atuações** (blocos CONST que o código escreve, com caixinha; nome = rótulo da saída do CONST,
  ou o nome do bloco; dentro de um SM, com o SM na frente), as **medidas** disponíveis (os mesmos nomes do scope) e os
  **parâmetros** (nome, valor, unidade); clicar num nome insere no código. À direita, o **editor Monaco** (o do VS Code,
  do CDN jsdelivr, versão 0.52.2; sem internet, caixa de texto simples): Python com cores, autocompletar de m["…"],
  p["…"] e das atuações, erro de sintaxe marcado na linha, Ctrl+S salva o circuito, Ctrl+Enter simula. A configuração
  é guardada a cada mudança (POST editor/controle) e, ao salvar o circuito, vai junto: `<nome>.controle.json` ao lado
  do .ipes (ao abrir um modelo, vem a dele, ou o modelo vazio).
- **O código** (`controle_modelo.py` é o modelo): `iniciar(p, e)` uma vez e `passo(t, m, p, e)` a cada Ts, que devolve
  {atuação: valor}; `scope("nome", valor)` manda uma variável para o scope; `print()` vai para a saída do controle.
  Roda num processo à parte (`controle_worker.py`, `python3 -I`): erro ou laço infinito não derrubam o servidor (prazo
  de 5 s por amostra); erro durante a rodada abre o painel com a linha marcada e o rastro só do código do usuário.
- **O laço** (servidor.py, `laco_controle`): a cada Ts = n·Δt — medidas no instante t (GETM, em lote) → passo() →
  atuações nos CONST (SETM, em lote: `setParameterMany` do fork; o motor ganhou SETM e o GETM em lote) → STEP n. A
  atuação vale a partir do passo seguinte do Gecko (atraso de 1 Δt, como no gateway da co-simulação). Publica no scope
  as medidas, as saídas dos blocos de controle (inclusive os CONST: a atuação aplicada, lida de volta) e as variáveis do
  scope(); a rodada guarda controle.py, controle.json e controle.log ao lado do .ipes.
- **Fonte controlada por sinal** (tipo 400): o valor vem do sinal de controle com o rótulo escrito na fonte
  (`parameterString[0]`, como lê o SimulationsKern); a tela tem o campo "sinal de controle" (com busca) e escreve pelo
  arquivo, como os medidores (POST editor/fonte_sinal). No desenho, "← u_ctrl"; atuadores com a etiqueta "⚙ nome".
- **Validação** (instância de teste): RL (R = 1 Ω, L = 10 mH) com fonte controlada por u_ctrl, CONST.1 (saída u_ctrl)
  como atuação, amperímetro em L.1 (i_L); PI com cancelamento de polo (Kp = L·ωc, Ki = R·ωc, fc = 200 Hz), Ts = 100 µs,
  degrau de 0 para 5 A, 10 ms a Δt = 1 µs. Contra uma referência independente (RL exato a cada Δt, o mesmo PI, atuação
  valendo 1 Δt depois): corrente igual a 9,4·10⁻⁵ A (de 5 A), atuação lida de volta a 1,2·10⁻³ V; a hipótese de medida
  atrasada 1 Δt erra 27× mais (2,6·10⁻³ A), o que confirma o modelo de tempo. 63 % de 5 A em 0,800 ms (1/ωc = 0,796 ms).
  100 períodos em ~0,8 s. Tela (11/11): fonte pelo campo novo, Monaco, ligações, etiqueta do atuador, erro de sintaxe
  marcado, autocompletar, ▶ com o controle, print() na saída, erro durante a rodada com a linha marcada.

## Controle — passo 2 (18/10): atraso da atuação, acionamentos no tempo, trava, marcas no scope
- **Mudar parâmetro de componente no meio da rodada NÃO vale no Gecko** (medido: R de 1 → 0,5 Ω no meio, a corrente
  ficou em 10 A; a matriz é montada no INIT). Por isso a atuação e os acionamentos passam só por **blocos CONST** (que
  comandam chaves, fontes controladas por sinal, blocos de controle) e por **parâmetros do controle**. Um CONST escrito
  antes do passo s é sentido pelo circuito a partir do passo s+1 (os blocos de controle o veem já no passo s).
  *Correção (passo 2b): isso vale para a fonte controlada; a chave direto no GATE sente já no passo s, e bloco de controle no
  caminho (um ou vários, calculados numa passada) soma um passo — ver a seção do passo 2b.*
- **Atraso da atuação** (painel): "logo" (o circuito sente em t + Δt), "na amostra seguinte" (em t + Ts, como num DSP:
  a escrita vai antes do último passo do período, compensando o Δt do Gecko) e "latência" (τ, de Δt a Ts). Regra: com
  d = 1, n ou round(τ/Δt) passos, a atuação da amostra k é escrita antes do passo k·n + d − 1.
- **Acionamentos** (lista no painel; valem com ou sem o controle ligado): `CONST:<nome>` muda a partir do passo
  j = round(t/Δt) (o circuito sente em t); `p:<nome>` muda na 1ª amostra a partir de t (k = ⌈j/n⌉). Os que caem depois do
  fim (ou da última amostra, para p) não acontecem e geram aviso; dois do mesmo alvo no mesmo instante: vale o último,
  com aviso. Uma agenda única (`anda`) parte os STEP nos instantes de escrita, nos dois laços (com e sem controle).
- Os CONST que a rodada escreve **voltam ao valor de antes** no fim (antes ficavam com o último valor: a próxima rodada
  começava de outro estado e o circuito aparecia como alterado). Se o servidor cair no meio, `~/.cache/pew_simu/
  devolver.json` faz a próxima partida terminar a simulação e devolver os CONST.
- **Trava**: com a simulação rodando (ou preparando), o painel e o editor ficam só para leitura e o servidor recusa
  mudar o controle (409); a preparação da rodada é atômica (dois ▶ juntos: um roda, o outro é recusado). Número inválido
  num campo fica marcado e não é gravado; se o controle não grava, a simulação não começa.
- **Scope**: os acionamentos da rodada (meta.acionamentos, com o instante efetivo) aparecem como linha tracejada com o
  rótulo; no Comparar, os de B em cinza com "· B".
- **Exemplo pronto**: `simu/gecko/pew/exemplo_controle_pi.ipes` (+ `.controle.json`) — fonte controlada (u_ctrl) → R 1 Ω →
  L 10 mH → fonte de perturbação (v_dist), PI com anti-windup e atuação na amostra seguinte; acionamentos: i_ref 5 → 8 A
  em 12 ms e perturbação de 20 V em 22 ms. Rodada de referência em `rodadas/2026-10-18_042335_exemplo_controle_pi/`.
- Validação (instância de teste, referência independente com o mesmo atraso e os mesmos acionamentos): logo 9,4·10⁻⁵ A,
  amostra seguinte 1,1·10⁻⁴ A, latência 30 µs 9,8·10⁻⁵ A (com o atraso errado na referência: 0,63 e 0,18 A — o teste
  distingue os modos); p["i_ref"] chega na amostra de 5,1 ms (pedido em 5,03 ms); v_dist vale no passo 7012 (pedido em
  7,0123 ms); malha aberta só com acionamento de CONST: 1,8·10⁻⁴ A em 12 001 amostras; CONST devolvidos em todos.
- Revisão adversarial (workflow de 45 agentes: 3 lentes — tempo, robustez, tela — e 2 céticos por achado): 21 achados,
  14 confirmados, todos corrigidos e testados (preparação atômica, trava no servidor, processo do controle sem vazar,
  p no último período, estado no meio da rodada, servidor caindo no meio, avisos, configuração malformada, valor
  inválido, ▶ com configuração não gravada, acionamentos repetidos); arredondamento igual na tela e no servidor.

## Controle — passo 2b (18/10): PWM no controle.py, GATE, atraso do Gecko compensado, Ts × Δt, guia
- **GATE pela tela**: o bloco GATE ganhou "chave que ele comanda" (S, IGBT, MOSFET, tiristor), com o mesmo acoplamento
  do amperímetro (parameterString + coupledReferenceID), e a etiqueta "→ S.1" no desenho. Regra do Gecko
  (`SimulationsKern.checkForSwitchAction`): entrada > 0,5 liga.
- **Atraso próprio do Gecko** (medido, Δt = 1 µs). Um CONST escrito antes do passo s muda a saída na hora
  (`ConstantCalculator.setConst`). A ordem de um passo é: chave lê o GATE → resolve o circuito → fontes leem o sinal
  (valem no passo seguinte) → blocos calculam. Daí:

  | Caminho | Sente no passo |
  |---|---|
  | CONST → GATE | s |
  | CONST → GAIN → GATE | s + 1 |
  | CONST → fonte | s + 1 |
  | CONST → GAIN → fonte | s + 2 |
  | modelo 03, CONST_S1 → SM → AND → IGBT | s + 1 |

  O terminal de subcircuito não acrescenta passo: o `ReglerTERMINAL` não leva o sinal, e o rótulo de fora e o de dentro
  são a mesma rede.
- **Compensação**. `destinos_controle` monta as redes de controle de cada folha (rótulos, conexões e a regra de ligação
  do Gecko) e segue cada CONST até a chave ou a fonte, atravessando blocos e subcircuitos. A escrita de cada atuação vai
  antes do passo k·n + d − (atraso do Gecko). Uma escrita que cai no começo do trecho seguinte (chave com atraso
  "amostra") fica numa agenda por passo absoluto. Os acionamentos de CONST passam pela mesma compensação. Resultado: o
  circuito sente em t + d·Δt em qualquer destino. Quando não dá, o painel e a rodada avisam: mínimo do Gecko maior que o
  pedido, ou o mesmo CONST chegando a destinos com atrasos diferentes. O painel mostra aonde cada atuação chega
  (`CONST.1 → chave S.1`).
- **Validação da compensação** (instância de teste): os quatro caminhos e o subcircuito do modelo 03 sentem o
  acionamento no passo pedido.
- **Exemplo novo**: `simu/gecko/pew/exemplo_controle_pwm.ipes` (+ `.controle.json`). É um buck com Vdc = 100 V,
  chave S.1, diodo de roda livre, L = 1 mH e R = 2 Ω; o CONST.1 (atuação `g`) passa pelo GATE.1 e comanda a S.1. Δt = 1 µs
  e Ts = 2 µs. O código gera a portadora dente de serra a 5 kHz e o PWM, e roda um PI de corrente, uma vez por período,
  sobre a média de i_L. Acionamento: i_ref 10 → 15 A em 5 ms. Rodada de referência em
  `rodadas/2026-10-18_050553_exemplo_controle_pwm/`.
- **Resultado do exemplo**:
  * v_sw só assume 0 ou 100 V; período de 200,0 µs;
  * ⟨i_L⟩ = 10,008 e 15,026 A, com d = 0,200 e 0,300;
  * ondulação período a período de 3,24 a 3,31 A, contra (Vdc − v_o)·t_on/L = 3,20 a 3,36 A (t_on alterna 40/42 µs:
    a resolução do PWM é Ts·fsw = 1 %).
- **Validação do exemplo**: contra uma referência independente (o mesmo código, o buck por Euler implícito, a chave e o
  diodo com uF + rON), o erro é de 1,0e-5 A, que é a fuga 100 V / rOFF 10 MΩ. As 5 000 decisões de chaveamento são
  iguais. Nos modos "logo" e "amostra", o atraso certo dá 1e-5 A e os errados 0,26 A. A rodada na instância principal
  repete os números.
- **O Gecko integra por Euler implícito** (`solverType 0`). Com a referência em Euler, o PI do passo 2 bate em
  1,4e-13 A (antes, 9,4e-5 A com a exponencial exata). O teste do passo 2 agora exige 1e-9 A, e passa (latência
  1,6e-13 A; malha aberta 1,4e-12 A).
- **Ts × Δt**:
  * o painel mostra n, quantas vezes `passo()` roda e uma estimativa de tempo (1 a 3 ms por chamada, medido: 5 000
    chamadas em 5 a 13 s), além da decimação do scope;
  * avisa quando Ts não é múltiplo de Δt, e a rodada também avisa;
  * ao abrir um modelo, o ▶ adota o Δt e o tempo final gravados no `.ipes` (`ipes.py` → `simulacao`).
- **scope()** com um nome que aparece depois da 1ª amostra agora gera aviso (antes sumia calado).
- **Guia**: `GUIA_CONTROLE.md`, também pelo "?" do painel (`static/guia.html`, rota `/guia`). Cobre a linha do tempo,
  onde configurar, a API do código, o atraso, a lista de conferência, os exemplos, os arquivos e a API HTTP para
  automatizar.
- **Contexto para o Claude Code** (passo 3): `.claude/skills/pew-controle/SKILL.md`. Ela carrega quando o Claude Code
  é iniciado em `simu/pew_simu` ou abaixo; mais acima, só quando ele mexer num arquivo daqui.
- **Revisão adversarial** (workflow de 6 agentes: 3 lentes — tempo e traçado, robustez, tela e guia — e um verificador
  cético por lente): 23 achados, 22 confirmados (cerca de 15 distintos), 1 recusado. Todos corrigidos e testados:
  * **traçado**:
    * GATE sem chave e elemento desativado (`enabledShorted` ≠ 1, lido agora pelo `ipes.py`) não contam mais como
      destino; antes, um GATE solto puxava o atraso para 0;
    * o terminal de SM usa o rótulo de dentro (ligação só por rótulo no SM);
    * o terminal global de controle é atravessado entre folhas;
    * fonte controlada só conta se um bloco da mesma folha alimenta o rótulo (é assim que o Gecko a procura);
  * **avisos**:
    * o motivo certo: "mínimo do Gecko nesse caminho" ou "o mesmo CONST em destinos com atrasos diferentes" (função
      única `destinos_fora_do_passo`, a mesma conta no painel);
    * aviso para atuação que não chega a chave nem a fonte;
    * os acionamentos de CONST também avisam;
    * os avisos do `scope()` têm limite;
  * **robustez**: `ipes.le` devolve as globais e o Δt/tempo final em vez de guardá-los na função (pedidos simultâneos
    trocavam os de um modelo pelos de outro);
  * **tela**:
    * o Δt do arquivo só é adotado quando o modelo muda (antes, entrar na edição apagava o Δt escolhido);
    * a conta de "cada" ficou igual à do servidor;
    * os textos apontam para *Simulação › Parâmetros da simulação* (o ▶ não abre diálogo);
    * o tiristor dispara com > 0,5 e só bloqueia quando a corrente zera;
  * **guia**: o que é `meta.dt` (intervalo do scope; o Δt é `meta.dt_gecko`), o que o `editor/abrir` protege de fato,
    a ondulação vale no patamar de 10 A, e de onde vêm os números.
- **Ensaios guardados**: `validacao/` traz os scripts de todos os números acima (instância de teste: `sobe_teste.sh` e
  `desce_teste.sh`; `casos_tracado.py` roda offline), com o resultado registrado de cada um em `validacao/LEIA.md`.

## Claude do PEW — passo 3a (18/10): login pelo botão ✦
- **Pasta própria**. O PEW usa o CLI oficial do Claude Code (`claude`, sem modificação) com `CLAUDE_CONFIG_DIR =
  ~/.claude-pew` (`PEW_CLAUDE_DIR` troca). O login, as configurações e as sessões do Claude do PEW ficam nessa pasta, e o
  `~/.claude` do usuário não muda. O CLI grava a credencial em `~/.claude-pew/.credentials.json` (0600, texto puro); o
  servidor nunca a lê nem a guarda.
  * A pasta fica **fora do repositório**, por decisão da revisão: dentro dele, um `grep` de qualquer agente ou um zip
    da pasta da tese levaria o token.
  * O `.gitignore` daqui ainda barra `.claude-pew/`, como segunda barreira.
- **Botão ✦ no cabeçalho**. Um ponto mostra o estado: cinza deslogado, amarelo login em andamento, verde conectado,
  vermelho sem resposta do servidor. A janela tem entrar, sair (com confirmação), cancelar e tentar de novo.
- **Como funciona o "entrar"**:
  * o servidor roda `claude auth login --claudeai` em pipes, com `BROWSER = claude_navegador.sh`, que só guarda o link
    (sem ele, o CLI abriria o Chromium do Linux pelo WSLg);
  * a tela mostra o link principal, que volta sozinho para o retorno local do CLI em `127.0.0.1:<porta>/callback`;
  * a tela mostra também um link alternativo, que exibe um código `xxxx#yyyy`: colado no campo (Enter envia), o servidor
    o repassa à entrada do CLI;
  * a autenticação é sempre na página da Anthropic;
  * o estado vem de `claude auth status --json` (0,2 s), acompanhado a cada 1,5 s enquanto o login anda, mesmo com a
    janela fechada; a janela só é redesenhada quando algo muda;
  * o login pendente espera a autorização sem prazo, até ela chegar ou o cancelar (o de 10 min saiu a pedido do
    Marcelo); depois de logado, o próprio CLI renova o acesso;
  * se o servidor sair (SIGTERM ou Ctrl+C), o login em andamento morre junto.
- **Ambiente do `claude` filho por lista branca** (PATH, HOME, USER, LANG…, mais CLAUDE_CONFIG_DIR). O servidor iniciado de
  dentro de uma sessão do Claude Code herdava `ANTHROPIC_BASE_URL` e dezenas de `CLAUDE_CODE_*`; uma `ANTHROPIC_API_KEY`
  também passaria na frente do login.
- **Proteção das rotas `/claude/*`**:
  * Host local (barra DNS rebinding);
  * `Origin`, se vier, igual a uma origem do PEW **com a porta** (`localhost:5000` ou a porta do próprio servidor). Pelo
    Vite, outra página em `localhost:N` passaria pelo CORS dele, e daria para ler o e-mail, deslogar ou logar o PEW
    noutra conta;
  * `Sec-Fetch-Site`, se vier, `same-origin`;
  * nos POST, o cabeçalho `X-PEW: 1`.
- **Política da Anthropic** (docs, "legal and compliance"): terceiros não podem oferecer o login do claude.ai em produtos
  nem guardar ou intermediar credenciais; o usuário pode entrar no CLI oficial com a própria assinatura. O PEW é pessoal e
  local, quem faz o login é o CLI e o servidor não guarda nada. Se o PEW um dia for usado por outras pessoas, o caminho é
  a chave de API do Console.
- **Revisão adversarial** (6 agentes, 3 lentes: segurança e política, processo, tela): 17 achados, 16 confirmados e todos
  corrigidos:
  * a origem com porta (acima) e a pasta fora do repositório;
  * login órfão quando o servidor cai;
  * erro colado no prompt do CLI;
  * logout sem tratamento de erro;
  * janela redesenhada a cada 1,5 s (perdia foco, aviso e "conferindo");
  * Enter que não enviava;
  * Esc da confirmação fechando as duas janelas;
  * ponto amarelo depois do login;
  * falha de rede mostrada como "não instalado";
  * cantos do botão;
  * cabeçalho estreito (o nome do modelo encolhe primeiro).
- **Testado** (instância de teste, pasta descartável):
  * `validacao/claude_offline.py` 15/15 e `validacao/tela/claude_tela.js` 17/17;
  * os dois links (retorno em `http://localhost:<porta>/callback` e em `platform.claude.com/oauth/code/callback`);
  * nenhum navegador aberto;
  * o ambiente do filho só com a lista branca;
  * `kill` no servidor encerra o login;
  * as outras telas sem regressão (9 + 11 + 11 + 3).
  O login de verdade (conta do usuário) fica para o Marcelo.

## Cabeçalho e dicas (18/10, pedido de Marcelo)
- O menu **Simulação** saiu. Os comandos dele já tinham botões; agora o grupo do ▶ é **⚙** (parâmetros da simulação: Δt,
  tempo final, nome, amostras) · **$x** (variáveis globais, desabilitado durante a rodada) · ▶ ⏸ ⏹. O menu Arquivo fica.
- **Dicas no padrão do PEW** (`static/dica.js`), no lugar da caixinha nativa do navegador:
  * caixa escura, arredondada, com sombra, abaixo do botão (ou acima, sem espaço), sempre dentro da tela;
  * atalhos entre parênteses viram teclas, como "pausar [Espaço]";
  * vale para todo elemento com `title`, inclusive botão desabilitado;
  * o `title` sai só enquanto o mouse está em cima e volta ao sair, e se o código o troca nesse meio tempo, a dica
    acompanha;
  * o `id` é `dica-ui`, porque `#dica` já era o cartão do componente.
- Cabeçalho estreito: a mensagem e o nome do modelo (mínimo de 11em) encolhem antes de algum botão sair da tela.
- `validacao/tela/cabecalho_tela.js`: 12/12, e as outras telas sem regressão.

## Validador do controle e "mudanças não salvas" ao abrir (18/10)
- **Validador** (`confere_codigo`): a cada vez que o código é guardado, a análise da árvore do Python (ast) sublinha em
  amarelo, com a explicação ao passar o mouse:
  * `p["x"]` sem o parâmetro x no painel (aceita `Ts` e o `p["x"] = …` criado no próprio código);
  * `m["x"]` que não é medida do circuito;
  * a chave do `return {…}` que não é atuação marcada, ou que nem existe no circuito;
  * `passo()` sem 4 argumentos.
  Vale pelo nome que o código dá aos argumentos. É aviso: não impede guardar nem rodar. A linha de estado conta os
  avisos e mostra o primeiro.
- **▷ testar**: guarda o controle e roda `iniciar()` e 3 `passo()` no mesmo processo à parte da rodada, sem o Gecko, com
  as medidas zeradas e o Ts efetivo. Mostra as atuações e o que foi para o `scope()` e o `print()`, ou o erro com a linha
  (ex.: `KeyError: 'f_clk'` na linha 7). Uma atuação não marcada é apontada, porque a rodada pararia.
- Sem a edição aberta, o painel não acusa mais "não está no circuito": diz "abra a edição (lápis) para conferir".
- **Mudanças não salvas ao abrir** (`situacao_gecko`; pedido de Marcelo: botão de "atualizar" na janela):
  * o mesmo arquivo, com mudanças do próprio editor (sair e voltar à edição): ficam, sem perguntar, com o disquete
    marcado. Antes, voltar à edição as jogava fora sem aviso;
  * o mesmo arquivo, com mudanças que o editor não viu (janela do Gecko, ou servidor reiniciado): pergunta **manter as
    mudanças** ou **descartar**;
  * outro arquivo, com mudanças não salvas: pergunta **salvar <arquivo> e abrir** (só para arquivo da pasta do PEW; o
    modelo original nunca é regravado) ou **descartar e abrir**.
- O aviso falso "mudou fora do editor" a cada reinício do servidor acabou. Ele vinha do "*" do título do Gecko, que a
  interface remota deixa até depois de salvar; agora a comparação é com o arquivo no disco.
- **Testes**: `validacao/validador_offline.py` 8/8, `validacao/abrir_conflito_api.py` 16/16 e
  `validacao/tela/validador_tela.js` 8/8; as outras telas sem regressão. Pendência: em 1150 px o ✦ sai da tela
  (`claude_tela.js`), por causa da largura que ⚙ e $x somaram; vai junto com o cabeçalho de ícones.

## Cabeçalho só de ícones (18/10, proposta de Marcelo)
- **Sem menus.** Os grupos, da esquerda para a direita:
  * **Arquivo**: a pasta com o nome do modelo (abrir, com busca) · novo · salvar · salvar como (disquete com lápis) · editar;
  * **topo**: o ícone de camadas no lugar de "Main"; dentro de um SM, `[topo] › SM.1` e o ícone volta;
  * **Ver**: ajustar (redimensionar, tecla 0) · **olho** · controle · rótulos · medições · corrente. O olho mostra tudo se
    algo está escondido e esconde tudo se está tudo à mostra; com só uma parte à mostra, fica meio apagado;
  * **Simulação**: ⚙ $x ▶ ⏸ ⏹;
  * **Scope/Controle**;
  * **IA** (✦).
- **Quebra de linha.** Quando não cabe, o cabeçalho quebra em linhas, cada grupo inteiro (`flex-wrap`). A tela embaixo
  acompanha: `--cab` vem da altura real, por ResizeObserver. A mensagem e a contagem de elementos dividem o que sobra da
  linha e só descem quando não há espaço. Medido:
  | Janela | Cabeçalho |
  |---|---|
  | 1500 px | 1 linha, 48 px |
  | 1150, 1000 e 800 px | 2 linhas, 69 px, nenhum botão fora da tela |
- **Dicas**: toda dica com atalho mostra a tecla em chip (`[0]`, `[Ctrl+Enter]`, `[Espaço]`).
- **Teste**: `validacao/tela/cabecalho_tela.js` 17/17, e as outras telas sem regressão (validador 8, Claude 17, pwm 9,
  controle 11, passo2 11, revisão 7, guia 3).

## Cores: violeta do PEW e medições como no osciloscópio (18/10, pedido de Marcelo)
- **Destaque do simu**: o azul-marinho (`--acento` #1f4e79) virou o violeta do PEW (#6d28d9; botões principais
  #7c3aed), o mesmo do trilho (#8b5cf6, #c4b5fd). O azul do desenho fica, porque ali significa potência (controle é
  verde).
- **Dicas no trilho do PEW**: ficam por cima dele (z-index acima do 2147483000 do trilho) e ao lado do ícone, como as
  dele.
- **Medições**:
  * a marca de tensão é como uma ponta de prova: **V+ vermelho**, **V− preto**;
  * a marca de corrente é um **A azul de sensor Hall**;
  * a **borda** é a **cor do canal**, que também colore a etiqueta do sinal ao lado do medidor.
  O padrão vem do servidor (`cores_efetivas`): voltímetros na ordem dos canais de um osciloscópio (amarelo, ciano,
  magenta, verde, e repete), amperímetros no azul Hall (#0ea5e9).
- **Cor do canal**: nas propriedades do medidor, amostras, "outra cor" e "padrão" (rota `/editor/cor`). A escolha fica ao
  lado do circuito (`<nome>.cores.json`, como o controle), e a rodada leva todas no `meta.cores`
  (`{canal: cor}`), para o scope poder pintar o traço com a mesma cor.
- **Correção no salvar**: ao salvar sem cor escolhida, ou sem controle em uso, o `.cores.json` e o `.controle.json`
  antigos saem do disco. Antes ficavam, e voltavam ao reabrir.
- **Teste**: `validacao/tela/cores_tela.js` 8/8.

## Revisão do cabeçalho, do validador e do "não salvo" (18/10)
Revisão adversarial (6 agentes, 3 lentes: perda de trabalho, validador, cabeçalho): 18 achados, 17 confirmados, todos
corrigidos.
- **Perda de trabalho** (as 4 graves):
  * **A comparação "Gecko × arquivo" não via várias edições**: tensão inicial do capacitor, queda do diodo, limites da
    fonte, o que o medidor mede, componente desativado… ▶, disquete, $x ou o lápis reabriam o arquivo e as descartavam
    sem pergunta. Agora a comparação usa o elemento inteiro (`ipes._bruto`: todas as linhas do bloco, menos as que o
    Gecko muda sozinho, como `parameter[]`, as janelas de scope dele e os campos ligados a variável global). E compara
    com a **base**, o estado do Gecko logo depois de abrir, salvar ou começar um novo, e não com o texto do arquivo,
    porque o Gecko normaliza campos ao carregar. Exemplo: a fonte U criada pela interface remota tem `lowerLimit`
    4.9E-324, que vira −1.79E308 ao reabrir, e o arquivo recém-aberto parecia mudado.
  * **Enter na janela de conflito sempre descartava.** Agora Enter aciona o botão com o foco, e o foco começa na opção
    que guarda (manter ou salvar), nunca em descartar.
  * **"Novo" apagava sem perguntar.** Agora pergunta como o abrir: salvar e criar, salvar como… e criar, ou descartar e
    criar.
  * **O controle de trabalho era trocado sem aviso.** "Não salvo" agora inclui o circuito, o controle e as cores (contra
    os `.controle.json` e `.cores.json` do arquivo). O mesmo arquivo nunca é reaberto, só no descartar.
- **Regra de abrir com mudanças não salvas**:
  * **mesmo arquivo**: mantém o que está no Gecko. Só pergunta (manter ou descartar) se o circuito mudou sem o editor
    ver;
  * **outro arquivo, ou novo**: pergunta se o circuito, o controle ou as cores não estão salvos. As opções são salvar e
    abrir (arquivo da pasta do PEW), salvar como… e abrir (modelo original ou circuito novo), descartar e abrir, ou
    cancelar. Cancelar volta a lista ao modelo aberto e continua na edição.
  O que o editor viu e a base ficam em disco (`visto.txt`, `base.txt`): reiniciar o servidor não faz perguntar à toa. O
  `editor/pendente` (o do `npm run pew`) usa a mesma regra e diz o que falta salvar.
- **Validador**:
  * sublinhados atualizados quando o circuito muda;
  * `setdefault`, `update` e `"x" in p` contam como criados;
  * não desce em funções de dentro;
  * `passo` com argumentos padrão é aceito;
  * colunas em caracteres, não em bytes UTF-8;
  * avisos de cima para baixo;
  * no teste: NaN e infinito no `scope()` viram `null`, a saída mostrada é só a do teste atual, e "testar" fica
    travado durante a rodada;
  * linha de estado e dica num lugar só (`poeEstado`), com a dica limitada a 8 avisos.
- **Cabeçalho**:
  * o desenho reajusta a proporção quando o cabeçalho muda de altura;
  * os atalhos (W, R, 0, Esc, Delete) ficam mudos enquanto se digita no `controle.py`;
  * a dica não pega o `title` do iframe do scope.
- **Trilho do PEW**: se não montar (falha passageira ao carregar o `pew-nav.js`), a página tenta de novo uma vez.
- **Testes**: `validacao/nao_salvo_api.py` 15/15 (substitui o `abrir_conflito_api.py`), `assinatura_api.py` 8/8,
  `validador_offline.py` 11/11, `tela/validador_tela.js` 13/13, `tela/ajustes_tela.js` 6/6 (o do trilho usa uma página
  de teste na 5010 → 8768). Todas as outras telas passam.

## Pontas de prova no componente (18/10, pedido de Marcelo)
- **O problema**: num nó ligado a dois ou mais componentes, a marca V+/V− ia no primeiro ponto do nó (no circuito dele,
  no resistor). Matematicamente dá no mesmo, mas na bancada a ponteira vai no terminal que se escolhe, por exemplo o da
  fonte.
- **Como ficou**: nas propriedades do voltímetro, abaixo de cada nó, **"ponta (+) no"** e **"garra (−) no"** listam os
  componentes ligados àquele nó, mais "automático".
  * A lista vem do servidor (`nos_medidos`), pelas redes de potência com a mesma regra de ligação do Gecko
    (`redes_basicas`, agora comum ao traçado do controle).
  * A marca vai para o terminal do componente escolhido, do lado de fora: acima do terminal de cima, abaixo do de baixo,
    ao lado se o componente está deitado.
  * No circuito dele, os dois nós ("+" e "−") listam U.1 e R.1.
- **Onde fica guardado**: a escolha fica junto da cor do canal, num arquivo só ao lado do circuito,
  `<nome>.aparencia.json` (`{"cores": {…}, "pontas": {canal: {"+": comp, "-": comp}}}`). O `.cores.json` anterior
  continua sendo lido e sai ao salvar. "Não salvo" conta a aparência inteira, e as rotas `/editor/cor` e `/editor/ponta`
  têm trava (dois pedidos juntos não se atropelam).
- **Teste**: `validacao/tela/pontas_tela.js` 5/5, com uma cópia do circuito dele; todas as outras telas e a API passam.
- **Ajustes pedidos depois**:
  * o campo da ponta deixou de ser a lista nativa do navegador e passou a ser o campo com busca do simu (o mesmo dos
    parâmetros): ao focar, mostra 5 sugestões ("automático" e os componentes do nó); digitar filtra, para nós com muitos
    pontos. Um nome fora da lista é recusado e o campo volta ao valor guardado;
  * **rótulos junto do corpo**: com o deslocamento padrão do Gecko (2, 2), o nome e o valor de um componente deitado
    caíam ao lado do componente vizinho (no PWM, "L.1 / 1 mH" parecia ser do resistor). Agora (`txtDe` no `simu.js`) o
    componente deitado leva o nome centrado acima do corpo e o de pé leva o nome à direita, colado. Um deslocamento
    escolhido à mão no Gecko continua valendo (o modelo 03 não muda). A seta de corrente vai para o lado oposto ao nome,
    e a marca do amperímetro de um componente deitado se afasta para a esquerda, para não cobrir o valor.
  * Teste: `pontas_tela.js` 6/6 (inclui digitar no campo e escolher pela sugestão); a bateria inteira de tela e de API
    passa na instância de teste.

## Tema do PEW: sistema, claro, escuro (18/10, pedido de Marcelo)
- **O botão** fica no pé do trilho do PEW (`pew-app/public/pew-nav.js`, comum a todas as páginas). Ele alterna sistema
  (segue o Windows) → claro → escuro. A escolha fica no navegador (`localStorage "pew-tema"`, a mesma para todas as
  páginas na porta do PEW), é aplicada em `<html data-tema="claro|escuro">` e avisa as páginas com o evento `pew-tema`.
  Também acompanha uma troca do tema do sistema e outra aba do PEW.
- **No simu**:
  * a interface usa variáveis de tema no CSS (`--campo`, `--suave`, `--fraco`, `--ok`, `--erro`, `--aviso`,
    `--desenho`…), com a versão escura em `:root[data-tema="escuro"]` e `color-scheme`;
  * o desenho tem paleta por tema (`TEMA_COR` no `simu.js`) e é redesenhado na troca, junto com a paleta de componentes;
  * o editor de código troca para o tema escuro do Monaco;
  * o guia ("?") segue a mesma escolha;
  * um script curto no `<head>` aplica o tema antes de pintar, para não piscar claro ao abrir;
  * ficam iguais nos dois temas: V+ vermelho, V− preto com a borda do canal, a seleção laranja e o roxo dos SMs.
- **Teste**: `validacao/tela/tema_tela.js` 7/7 (página de teste 5010 → 8768: os três cliques, o desenho redesenhado, o
  Monaco escuro, o navegador escuro com "sistema"); as outras telas seguem passando no claro.
- **Falta**: a página inicial do PEW (React), o /pew/gecko e o scope (este é do outro chat).
- **Defeito achado depois (corrigido)**: no tema claro, 19 variáveis do `:root` apontavam para si mesmas
  (`--ok: var(--ok)`, `--suave: var(--suave)`…), estrago da substituição em lote das cores fixas por variáveis. Para o
  CSS, isso é valor inválido, e no claro essas cores sumiam: o verde de "guardado"/ok, o vermelho de erro, o amarelo de
  aviso, os fundos suaves e o lilás claro. O mesmo lote trocou o `#fff` de dentro de `#fff7e6` (`var(--cartao)7e6`, a
  faixa "simulação rodando"). Os valores do claro voltaram a ser as cores de antes do tema (commit 93dc826). O escuro
  não foi afetado. O `tema_tela.js` agora confere que toda variável do `:root` tem valor nos dois temas e que todo
  `var(--x)` usado está declarado; numa página à parte, foi confirmado que essa conferência pega uma variável em ciclo.
  Também confere as cores de ok, erro e da faixa no claro.
- **Revisão adversarial depois da correção** (só leitura; 5 achados confirmados e 2 refutados). Os do escuro já
  existiam desde o commit do tema:
  * a faixa do SM ("mudar os N juntos") tinha o roxo fixo `#5b3fd1`, com contraste 2,55:1 sobre o cartão escuro.
    Agora usa `--sm` (`#5b3fd1` no claro, `#b39dff` no escuro, o mesmo roxo do desenho);
  * os ícones da paleta da Biblioteca (roxo) e dos blocos de controle (verde) tinham cor fixa: no escuro ficavam
    apagados e, no item selecionado (fundo lilás), sumiam. Agora a cor vai em `--ic` e o desenho usa `currentColor`:
    seguem o tema e ficam brancos quando selecionados;
  * a etiqueta ⚙ do atuador no desenho continuava creme no escuro: as cores foram para o `TEMA_COR`
    (`atuFundo`…);
  * o ⏹ usava o vermelho fixo `#c0262d` (2,73:1 no escuro): agora usa `--erro`. Era um dos refutados, como fora do
    escopo, mas a correção é de uma linha.
  * Teste: `tema_tela.js` 11/11; confere esses quatro no escuro.

## Quebra de linha no editor do controle (18/10, pedido de Marcelo)
- Botão ao lado do "?" na barra do `controle.py`, ou **Alt+Z** com o cursor no editor (como no VS Code): as linhas
  longas continuam embaixo, recuadas, sem a barra de rolagem para o lado. É só a vista: o código não muda.
- A escolha fica no navegador (`localStorage "pew-simu-quebra"`) e volta ao recarregar. O botão continua valendo com a
  simulação rodando, porque não mexe no código.
- Sem o Monaco (CDN fora do ar), a caixa de texto simples segue a mesma escolha, pelo botão ou por Alt+Z (achado da
  revisão).
- **Teste**: `validacao/tela/quebra_tela.js` 12/12:
  * começa sem quebra (texto de 992 px numa área de 347 px); o clique liga (cabe em 347 px) e guarda;
  * continua ligada ao recarregar;
  * Alt+Z desliga e liga. A tecla é enviada com o texto "Ω", como o Option+Z do Mac, e não vai para o código. Para
    provar que a checagem funciona, um Ω digitado de fato aparece no código (e é desfeito);
  * funciona com a trava; a dica mostra a tecla;
  * com o Monaco bloqueado, a caixa de texto simples quebra ou não pelo botão e por Alt+Z.
  A bateria inteira (13 telas, 4 de API) passa na instância de teste.

## Pedir ao Claude — passo 3b (18/10, pedido de Marcelo)
- **Como usar**: na aba Controle, o botão **Claude** (o diodo com o brilho de IA) abre a conversa. Com a doca ao lado,
  ela fica embaixo do código; com a doca embaixo, vira uma coluna à direita. Também dá para abrir pelo ícone do Claude
  no cabeçalho, em "pedir ao Claude". Ctrl+Enter envia. Exemplos: "PI de corrente com anti-windup", "metade do tempo
  com Kp e depois 2·Kp", "dois controles", "implemente o controle do artigo anexado".
- **O que o Claude pode**: só o controle, ou seja, `controle.py`, os parâmetros e os acionamentos no tempo. Ele não
  cria componente nem toca no `.ipes`; se faltar algo no circuito, diz o que montar. Ele lê o contexto que o PEW gera a
  cada pedido (`CONTEXTO.md`) e o `GUIA_CONTROLE.md`. O contexto traz:
  * o circuito, com os componentes, os valores e os nós;
  * as medidas `m[...]`, com o que cada uma mede;
  * as atuações, com aonde chegam e o atraso do Gecko;
  * Ts, Δt e tfim;
  * os parâmetros, os acionamentos e o código atual, com o que o validador acusa.
- **Como roda** (`servidor.py`, seção "Claude do PEW: uso da conta e pedir ao Claude"): o `claude` oficial, com a
  pasta do PEW (`~/.claude-pew`):
  * opções: `--restricted` (sem terminal, sem internet, arquivos só na pasta da conversa); `--tools Read,Edit,Glob,Grep`;
    `--allowedTools Edit(./controle.py) Edit(./parametros.json) Edit(./acionamentos.json)`; `--permission-mode dontAsk`
    e `--permission-prompts none` (o que pediria permissão é negado); `--strict-mcp-config`; `--max-turns 30`; prazo de
    15 min; regras em `--append-system-prompt`;
  * ambiente por lista branca e processo em sessão própria ("parar" e a saída do servidor derrubam o grupo);
  * **conversa por circuito**: uma pasta `~/.cache/pew_simu/claude/conversas/<id>/` (o cwd, que a retomada exige
    igual), `--session-id` no 1º pedido e `--resume` nos seguintes. Se a sessão sumiu da pasta do Claude, recomeça com o
    mesmo id. O histórico (pedido, resposta, gasto, aplicada) fica em `claude/historico/<id>.json`. "nova" esquece a
    conversa.
- **Anexos**: PDF de artigo, imagem ou texto (txt, md, csv). Entram pelo botão de documento, arrastando para a
  conversa ou colando uma imagem. Até 25 MB cada e 12 por conversa; ficam em `anexos/` da conversa, e o Claude Code lê
  PDF e imagem direto. No pedido, os anexos novos vão marcados.
- **A proposta**: o PEW lê de volta os três arquivos e confere **sem executar**: formato, sintaxe, o validador de `m`,
  `p` e atuações, e as atuações que `passo()` devolve (as que existem são marcadas ao aplicar). Se o controle estava
  desligado, liga.
  * O cartão mostra +/− linhas, os parâmetros e os acionamentos que mudam e a conferência.
  * **ver diferença** abre o Monaco lado a lado.
  * **▷ testar** roda iniciar() e 3 passo() **só a pedido**: um anexo mal-intencionado poderia induzir código perigoso,
    e ele tem de ser visto antes.
  * **aplicar** põe o código no editor como uma edição (Ctrl+Z volta) e os parâmetros e acionamentos no painel, e
    guarda. **↶ voltar ao de antes** desfaz tudo. O controle guardado só muda ao aplicar.
- **Uso da conta**: `claude -p "/usage"` devolve o texto do `/usage` (sessão de 5 h e semana, com quando renova), com 0
  turnos e 0 tokens. **Não é documentado** (conferido no CLI 2.1.273); se o formato mudar, a tela diz que não leu. O
  resultado fica guardado 60 s. Aparece no topo da conversa e em barras no ícone do Claude. O % é o da **conta
  inteira**, somando Claude Code, claude.ai e PEW.
- **Prova com o Claude de verdade** (instância de teste, 1 pedido, "aumente o Kp em 20% e explique em uma frase"): 9,6 s
  e 4 passos; 26,6 mil tokens de entrada (a maior parte de cache) e 586 de saída. Ele leu o `CONTEXTO.md` e o
  `parametros.json` e editou só o `parametros.json`: Kp 1,885 → 2,262 (×1,20, confere). O código ficou intacto, a
  proposta foi validada e o controle guardado não mudou.
- **Testes** (o Claude de mentira `validacao/claude_falso.py`: `PEW_CLAUDE_BIN` aponta para ele, e o cenário vem de
  arquivos na pasta descartável `PEW_CLAUDE_DIR`; login e logout vão para o CLI de verdade):
  * `validacao/claude_pedido_api.py`, que confere:
    - o uso e as opções exatas com que o `claude` roda;
    - o contexto, a proposta sem executar e o teste a pedido;
    - a prova de que o código proposto não roda sozinho: uma marca que ele deixaria ao executar não aparece;
    - a retomada da conversa, inclusive com a sessão apagada;
    - erros (sintaxe, JSON inválido, erro da API, recusa fora da pasta), parar sem processo órfão, anexos (tipo, `../`,
      novo) e conversa nova;
    - a proteção das rotas: sem X-PEW, outra origem e Host de fora.
  * `validacao/tela/claude_chat_tela.js`, direto na 8768 (as rotas do Claude só aceitam a origem do PEW ou a do
    servidor), que confere:
    - a conversa e o uso no topo;
    - a proposta, a diferença, testar, aplicar e voltar;
    - a trava durante a simulação;
    - anexos pelo botão e arrastando;
    - as barras de uso no ícone do Claude, o escuro e o estado sem login.
- **Revisão adversarial** (só leitura, 4 lentes: segurança, servidor, tela e testes): 39 achados confirmados e 4
  refutados, todos corrigidos e testados. Os principais:
  * **todo POST confere a origem** (`pedido_local`: Host local, Origin do PEW, Sec-Fetch-Site). Era um defeito antigo,
    de antes deste passo: guardar e testar o controle e rodar aceitavam pedido de qualquer página, e uma página de fora
    gravaria um `controle.py` e o testaria (código rodando aqui). O X-PEW continua só nas rotas do Claude. A instância
    de teste sobe com `PEW_PORTA=5010` (a origem da página de teste);
  * **a retomada da conversa** olha se o CLI já gravou a sessão, e não se o 1º pedido terminou. Com um 1º pedido parado,
    o CLI de verdade recusava `--session-id` ("already in use") e a conversa travava. O Claude de mentira agora imita
    essa recusa, o `--verbose` obrigatório e o formato real dos erros (motivo em `errors`; erro da API em `result`);
  * **o pedido é reservado na hora**: dois pedidos juntos não sobem dois `claude`, e "parar" vale também enquanto o
    pedido prepara a pasta. O histórico e a sessão são gravados antes de a tela saber que terminou.
    `sessoes.json` tem trava e gravação atômica;
  * **a conversa segue o circuito**: "salvar como" leva a conversa para o nome novo, e uma folha nova começa outra
    conversa. A proposta é conferida contra o circuito do pedido;
  * **o contexto** diz em que SM está cada chave ou fonte comandada, lista os SMs com os nós dos terminais e descreve o
    atraso efetivo e quanto o PEW compensa. As regras pedem as atuações num `return {...}` literal;
  * **na tela**:
    - aplicar avisa se o código, os parâmetros ou os acionamentos mudaram na tela depois do pedido, não aplica duas
      vezes e não roda com o editor ainda carregando (gravaria um código vazio);
    - a conversa não pula de rolagem e o acompanhamento para ao fechar;
    - colar texto com imagem cola o texto, os erros de vários anexos ficam todos e o anexar é um botão (teclado);
    - a diferença leva o foco, "nova" fica desligado durante um pedido e um arquivo solto fora da conversa não abre
      no lugar do PEW;
    - o uso no ícone do Claude se renova;
  * parâmetro com valor não finito é recusado (`NaN` quebraria o JSON da tela).
- **Testes**: `claude_pedido_api.py` 49/49 (com: parar o 1º pedido e pedir de novo, salvar como, folha nova, POST de
  outra origem barrado, as opções exatas do `claude`, datas relativas a hoje, limpeza mesmo se cair);
  `claude_chat_tela.js` 25/25; a bateria inteira (13 telas, 4 de API) passa.
- **Onde fica a conversa** (pedido de Marcelo, testando): por padrão, ao lado do código, em 3 colunas (parâmetros |
  código | Claude). Um botão no topo da conversa a leva para baixo do código e de volta; a escolha fica no navegador
  (`pew-simu-claude-lugar`). Com o painel mais estreito que 820 px, ela desce sozinha para não espremer o código.
  Pergunta respondida sem mudança no controle não mostra mais o cartão "sem mudança". `claude_chat_tela.js` 29/29.
- **Diferença como no git** (pedido de Marcelo): o cartão da proposta mostra o trecho mudado do `controle.py`, com
  `@@ linha N @@` a cada bloco, `+` verde, `−` vermelho e 2 linhas de contexto (até 60 linhas; o resto, em "ver
  diferença"). A diferença é linha a linha, pela maior subsequência comum, com o que sai antes do que entra, como no git.
  Conferida em 7 casos conhecidos e em 300 pares aleatórios: o que sai mais o contexto refaz o antes, e o que entra mais
  o contexto refaz o depois. "ver diferença" abre **unificado** (como o `git diff`, com o número da linha antes e
  depois) ou **lado a lado**, e a escolha fica lembrada. Nada entra sem "aplicar". `claude_chat_tela.js` 32/32.
- **Memória do PEW** (pedido de Marcelo): um arquivo de notas, `~/.cache/pew_simu/claude/memoria.md`, que vale em todas
  as conversas e circuitos: preferências e lições (ex.: "anti-windup por clamping", "ganhos em V/A").
  * A cada pedido, o arquivo vai para a pasta da conversa, e as regras mandam o Claude ler e seguir. Quando você pede
    para lembrar algo, ou deixa clara uma preferência, ele **propõe** uma linha. `memoria.md` é o 4º arquivo que ele
    pode editar.
  * A proposta mostra o que muda na memória no mesmo formato do git. Só entra ao **aplicar**, e "voltar ao de antes" a
    devolve. Se a memória mudou depois do pedido, aplicar pergunta. Uma proposta só de memória não liga o controle.
  * O botão **memória**, no topo da conversa, abre o arquivo para ler e editar. "nova conversa" não apaga a memória.
  * Rotas: GET e POST `/claude/memoria` (até 20 mil caracteres).
  * Testes: `claude_pedido_api.py` 54/54 (a proposta só de memória, guardar só ao aplicar, a memória numa conversa nova,
    tamanho) e `claude_chat_tela.js` 36/36 (o botão, o cartão, aplicar, voltar).

## Subcircuito criado do zero (18/10, pergunta de Marcelo)
- **Como faz**:
  1. Na edição, aba **Subcircuit** → **Subcircuit** → clique na folha: o bloco Sub.1 aparece.
  2. **Duplo clique** entra nele (Main › Sub.1).
  3. Dentro, **Circuit Terminal** para cada borne de potência (Control Terminal para sinais): a posição do terminal na
     folha define o lado e a altura do borne no bloco (ele encosta na borda mais próxima; arraste até outra borda
     para mudar de lado — ver "Terminais de subcircuito" abaixo). Os componentes vão dentro, ligados por fio ou rótulo.
  4. De volta ao Main, os bornes do bloco ligam por fio ou rótulo.
  5. **salvar na biblioteca…** deixa o subcircuito pronto para outros circuitos.
- **Dois defeitos achados e corrigidos**:
  * a folha de um SM vazio não existia (o leitor só criava folhas com algo dentro), então não dava para entrar para
    pôr o 1º terminal. Agora todo SM tem folha (`ipes.py`);
  * o enquadramento usava só o que havia na folha: com uma peça só, o zoom ficava absurdo e o resto da folha saía da
    vista. Agora, num SM, enquadra a folha inteira (tamanho fixo), e nunca fica menor que 30 × 20 quadrados (`ajusta`).
- **Prova** (`validacao/tela/sub_novo_tela.js` 8/8, instância de teste): folha em branco; o bloco pela paleta; entrar
  vazio com duplo clique; dois terminais e um R de 10 Ω dentro; 2 bornes no bloco; fonte de 100 V fora e simulação:
  |i| = 10,000000 A; salvar na biblioteca.
- **Nome do subcircuito, não "SM"** (pedido de Marcelo: "subcircuito pode ser qualquer coisa, não só submódulo"):
  * a tela mostrava todo subcircuito como "SM.k" (no bloco, na trilha, na faixa "SMs iguais", nas mensagens). Os nomes
    de dentro também levavam "SM_k_": os canais dos medidores no scope e as atuações no controle;
  * agora vale o **nome do próprio subcircuito**. O padrão do Gecko, `SUBCIRCUIT.k`, aparece curto como **Sub.k** (na
    trilha, com o nome do Gecko ao lado), e os nomes de dentro são `Sub_k_…`. **Renomeado** pelo campo "nome" do
    painel (o Gecko aceita: o bloco, a folha e os nomes qualificados `filtro#…` seguem), vale o nome dado: `filtro`,
    `filtro_v_R`; no MMC, `SM1` daria `SM1_vCSm`. `prefixo_sub` (servidor) e `nomeSub`/`prefixoSub` (tela) fazem a
    mesma conta;
  * **muda nomes de dados**: rodadas novas de circuitos com subcircuitos de nome padrão trazem `Sub_k_…` no lugar de
    `SM_k_…`; as gravações antigas continuam com os nomes delas. Guia e skill atualizados;
  * teste: `sub_novo_tela.js` 10/10 (Sub.1 no bloco, `Sub_1_v_R`; renomeado: "filtro" e `filtro_v_R`).
- **Respostas fora de ordem no estado do Claude** (achado pela bateria, depois da busca do uso ao abrir a janela): o
  `claude auth status` leva de 3 a 5 s, e um pedido de estado antigo, ainda a caminho, chegava depois de um novo e
  sobrescrevia o estado ("desconectado" por cima de "conectado"). Agora `atualizaClaude` numera os pedidos e ignora
  resposta mais antiga que a última aplicada. O `claude_tela.js` passou a usar uma interceptação só, com o modo numa
  variável. Com o servidor recém-reiniciado, antes falhava 2 em 3; agora passa 4 de 4.

## Terminais de subcircuito: mover, lugar livre, tamanho do bloco (18/10, achado de Marcelo)
- **O problema** (montando um subcircuito do zero): o terminal não se movia dentro do SM, e o Control Terminal posto
  depois caiu no mesmo borne de um Circuit Terminal (os dois no mesmo ponto do bloco, os nomes um por cima do outro).
  * a tela travava de propósito todo terminal de SM ("fica onde está"): arrastar, renomear, apagar e girar;
  * pela interface remota, o Gecko cria o terminal onde se clica, no meio da folha, com o lado padrão (esquerda). O borne
    é proporcional à posição (⌊altura do bloco · y / altura da folha⌋), e dois terminais caem no mesmo borne com
    facilidade (8 × 5, folha 50 × 40: y de 16 a 23 dá a mesma altura). O aviso do Gecko para isso está desligado no
    código dele (`SubcircuitBlock.areTerminalPositionsOK` sempre `true`).
- **Regras do Gecko** (lidas no código: `TerminalToWrap.reCalculateLocation`, `SubcircuitBlock.recalculateTerminalPositions`):
  o terminal levado a um ponto encosta na borda mais próxima da folha (as diagonais da folha dividem os quatro lados),
  e a borda é o lado do borne: esquerda (x = 1), direita (x = largura − 1), em cima (y = 2), embaixo (y = altura − 1).
  Ao longo da borda, o borne acompanha, um por quadrado do lado do bloco.
- **Agora**:
  * **arrastar** o terminal funciona, com a prévia já encostada na borda (onde ele vai ficar); o campo de posição também;
    **renomear** (o borne leva o nome) e **apagar** (o borne some; os rótulos de fora dos outros ficam). Girar não;
  * o **servidor** encosta o terminal na borda ao criar (o Gecko só encosta ao mover) e escolhe um **borne livre**: se o
    ponto cai num borne ocupado, vai para o livre mais perto na mesma borda (a mensagem diz). Sem borne livre naquele
    lado, erro antes de mexer em nada ("aumente o bloco ou leve o terminal para outra borda");
  * dois cuidados com o `setPosition` remoto: ele ignora um passo com dx = dy (`moveComponent`) e o terminal recém-criado
    na borda de cima, de baixo ou da direita fica com o lado padrão até ser movido; nesses casos o servidor passa por um
    ponto vizinho da mesma borda e confere a posição (`POS`);
  * **tamanho do bloco** (largura × altura) no painel do subcircuito, com a contagem de bornes por lado. O Gecko só
    reposiciona os bornes de baixo e da direita ao mudar o tamanho; o servidor reabre o estado salvo (como ao abrir o
    arquivo), e todos são recalculados. Encolher a ponto de juntar bornes dá erro e não muda nada;
  * **arquivo antigo com bornes juntos**: o leitor marca (`junto`); a tela põe um anel vermelho tracejado no borne e no
    terminal, avisa na faixa do SM e no painel; arrastar um deles resolve;
  * **nomes no bloco**: o padrão `CIRCUIT_TERMINAL.k` / `CONTROL_TERMINAL.k` aparece curto, `Circuit.k` / `Control.k`
    (como na paleta); cada nome é cortado (com …) pela largura medida no navegador para não cobrir o do outro lado nem o
    nome do bloco, e o nome do bloco vai para a linha livre mais perto do meio quando a do meio tem borne.
- **Defeito antigo achado no caminho**: com a pilha do desfazer cheia (20), um pedido que falhava sem mexer em nada
  levava embora o passo mais antigo (a pilha era aparada antes de saber se a mudança valia). Agora só é aparada depois;
  e a contagem na resposta não passa de 20.
- **Prova** (instância de teste): `validacao/sub_terminais_api.py` 23/23 — os três pontos de Marcelo, (5, 9), (2, 16) e
  (5, 19), vão para (1, 9), (1, 16) e (1, 24), três bornes diferentes; criar já na borda direita, embaixo, em cima; lado
  cheio; passo (37, 37) que o Gecko ignoraria; levar ao borne de outro; renomear e apagar; tamanho; arquivo antigo com
  bornes juntos; e um bloco 8 × 6 ligado à fonte **por fios até os bornes desenhados**: |i| = 10,000000 A (100 V / 10 Ω),
  ou seja, o borne desenhado é o que o Gecko usa. `validacao/tela/sub_terminais_tela.js` 12/12 — pela tela, com o mouse:
  postos pela paleta, prévia do arrasto encostada na borda, painel (sem girar; R não gira), renomear, nomes no bloco sem
  sobreposição (medido), tamanho pelo painel, marca de bornes juntos.

## Tamanho do PEW e o ícone do simu (18/10, pedido de Marcelo)
- **+ e −** no pé do trilho, acima do tema: o tamanho do PEW, de 80 % a 140 % (80, 90, 100, 110, 125, 140), independente
  do zoom do navegador.
  * Fica no navegador (`localStorage "pew-escala"`), vale em todas as abas e páginas do PEW e é aplicado antes de
    pintar (o script do `<head>` do simu, do scope e da página inicial). É o `zoom` do CSS na página inteira.
  * O clique no desenho e no editor Monaco foi conferido com 90 % e 125 %: o componente cai no ponto clicado e o
    cursor, na linha clicada.
  * Fora: o /pew/gecko (a tela remota ficaria borrada), os seminários (sem trilho; têm o A−/A+ deles) e o scope
    embutido no simu (o simu já escala; escalar o iframe de novo dobraria).
- **Ícone do simu no trilho**: um circuito (resistor na malha) com o "simular", no lugar do zigue-zague com seta.
- Teste: `validacao/tela/escala_tela.js` 12/12.

## Marca do PEW e o ícone do Claude (18/10, pedido de Marcelo)
- **Marca do PEW: o diodo com o brilho de IA** (ideia dele; ele vetou o rosto e o clipe). Os arquivos ficam em
  `power-eletronics/pew-app/public/marca/` (ícone, fundo escuro, uma cor, ícone de aba, logotipo; ver o LEIA de lá). A
  marca vai no ícone da aba (`/favicon.svg?v=1`: o "?v=1" fura o cache de ícones do Chrome, que guardava o "sem
  ícone"), no topo do trilho (no lugar do texto "PEW") e no cabeçalho da página inicial (no lugar do ⚡).
- **Claude do PEW: um balão de conversa com o brilho dentro** (`#pew-claude`, no sprite do simu), no cabeçalho, no
  botão da aba Controle, no topo e ao lado das respostas da conversa; o brilho pulsa enquanto o Claude trabalha.
  **Nunca o logotipo da Anthropic**: as diretrizes dela pedem aprovação prévia e proíbem alterar ou dar a entender
  parceria (https://www.anthropic.com/legal/trademark-guidelines).
- **Base dos testes congelada** (`validacao/dados/exemplo_controle_pwm.*`, o exemplo original): os testes copiavam o
  `exemplo_controle_pwm` do repositório, que é do Marcelo e mudou (ele salvou um controle novo, feito com o Claude);
  agora copiam a cópia congelada (o `reinicia_servidor_teste.sh` também). A bateria inteira passa (16 telas, 5 de API).

## Vários controladores — passo 1 do controle distribuído (18/10, pedido de Marcelo)
- **O pedido**: "hoje é UM controle.py por circuito, mas no MMC o controle distribuído precisa de vários" — e pensado de
  forma geral (aquisição + controle, um por fase, um por célula, microrrede…); e "além de se comunicar, os .py têm de rodar
  paralelos e isolados".
- **Modelo** (`servidor.py`: `instancias_controle`, `Controladores`; `controle_worker.py`): além do `controle.py`, outros
  arquivos (`arquivos`); cada **controlador** tem um arquivo, as medidas que lê e as atuações que escreve, ou vale **em
  subcircuitos** (uma instância por subcircuito, com a visão dele sem o prefixo: o mesmo código para todos, `p["id"]` e
  `p["subcircuito"]`). Uma rede (`rede.latencia`) leva as mensagens (`envia(para, dados)`, `recebe()`).
  * **isolados**: cada instância num processo Python (sem memória comum: o que uma pendura no `math` a outra não vê);
  * **em paralelo**: a cada amostra o servidor manda as medidas a todos e depois recolhe (eles calculam juntos);
  * **mensagens nunca na mesma amostra** (calculam juntos): chegam na 1ª amostra depois do envio com t ≥ t + τ. A 1ª
    versão rodava em série num processo só, com entrega na mesma amostra pela ordem da lista; mudou com o pedido de
    Marcelo (paralelos e isolados) — é o modelo honesto de processadores separados;
  * **visão imposta**: `m` só com as medidas do controlador (ler outra: `KeyError` com arquivo e linha); devolver atuação
    de outro é erro; cada atuação tem um dono só (dois donos: a rodada não começa);
  * sem lista de controladores: o `controle.py` de sempre (vê tudo); o 1º "+ controlador" põe esse na lista com a mesma
    visão. Os circuitos de antes não mudam.
- **Tela**: abas de arquivo no editor (+ cria, duplo clique renomeia, × apaga — recusa se é o código de alguém); a coluna
  da esquerda em **variáveis | arquivos** (pedido de Marcelo: "divide entre as variáveis e os arquivos"): em arquivos, a
  árvore dos .py com os controladores de cada um embaixo (lê, escreve, em subcircuitos), + arquivo, + controlador, a
  latência da rede; as medidas mostradas e o autocompletar seguem o arquivo aberto; erro marcado no arquivo e na aba
  dele; a proposta do Claude vai sempre para o `controle.py` (mesmo com outra aba aberta). As explicações dos campos (Ts,
  atuação, rede, acionamentos, controladores) foram para a dica de um "i" ao lado (cabe mais); à vista só os alertas.
- **Claude do PEW**: vê a lista de controladores e os outros arquivos (só leitura); editar vários é o passo 3.
- **Revisão com Marcelo** ("não entendi a lógica arquivos e controladores"): agora **cada arquivo é um controlador**, com o
  nome do arquivo (`aquisicao.py` → `envia("aquisicao", …)`); o "+ arquivo" cria os dois, renomear e apagar levam o
  controlador junto; embaixo de cada arquivo, **lê** (com a opção **todas as medidas**), **escreve** (marcar num tira do
  outro: um dono só) e **em subcircuitos** (o mesmo arquivo, uma instância por subcircuito). Sumiram o "+ controlador",
  o campo de nome e o seletor de arquivo. Defeito achado no uso dele: com o servidor recém-reiniciado e a edição fechada,
  o servidor não conhece o circuito, e o "+ controlador" punha o controle.py na lista lendo **nada** (a lista de medidas
  vinha vazia); agora ele entra com "lê todas", que não depende de conhecer o circuito. E o `scope()` do controle.py
  fica com os nomes de sempre (só os outros levam o nome do controlador na frente): criar um arquivo não muda as colunas
  das rodadas.
- **Gravação**: `.controle.json` com `arquivos`, `controladores` e `rede`; a pasta da rodada guarda todos os .py; o meta
  da rodada diz os controladores e a rede.
- **Dica (tooltip) espremida** (achado de Marcelo, "falando em tooltip tá zuado"): a caixa da dica era medida no lugar da
  anterior; depois de uma dica perto da borda direita, a seguinte ficava com uma palavra por linha. Agora mede encostada
  à esquerda e depois posiciona (`dica.js`). Prova: `tela/dica_tela.js` (com o código antigo, 226 px colada na borda; com
  o novo, 320 px dentro da tela).
- **Prova** (instância de teste):
  * `validacao/controladores_api.py` 17/17 — aquisição + controle (o PI do exemplo, em dois processos) ≡ controlador único
    com a medida de 1 amostra atrás (latência 0) e de 3 amostras atrás (latência 2,5·Ts): **i_L idêntica bit a bit**
    (diferença 0,0 nas 301 amostras), e o controlador sem atraso dá outra curva (o teste distingue); isolamento; paralelo
    (2 controladores de 0,3 s: 0,92 s em 3 amostras, contra 1,8 s em série); visão local e dono único; envia para quem
    não existe; salvar e abrir de novo; a pasta da rodada; e no MMC (modelo 03) um `sm.py` em 18 subcircuitos: cada
    instância vê o `vCSm` do seu, amostra a amostra, e o `p["subcircuito"]` certo;
  * `validacao/tela/controladores_tela.js` 19/19 — pela tela: abas, árvore, + controlador, lê/escreve, rede na dica,
    medidas da aba, erro na aba certa, testar com os dois, renomear e apagar, a proposta do Claude no controle.py, rodada.
  * Medida à parte (unidade, 4 controladores de 0,3 s, 3 amostras): 0,90 s em 12 de 14 execuções; em 2 delas, 4,51 s —
    não se repetiu nas 12 seguintes nem num estresse de 75 amostras (4 × 0,05 s, nenhuma acima de 0,1 s); provável carga
    da máquina naquela hora. Fica registrado.
- **Próximos passos** (combinados, um de cada vez): Ts e fase por controlador; o Claude editando vários arquivos.

## Cadeado, coluna recolhível e a janela do código (18/10, pedidos de Marcelo)
- **Cadeado no lugar do lápis** ("talvez o edit ser o default fosse melhor… ao invés de um lapisinho, um cadeado"): o
  simu abre **editando** (cadeado aberto); clicar fecha (só ver) e a escolha fica no navegador (`pew-simu-travado`).
  Motivo de fundo: com a edição fechada o servidor não conhece o circuito (as medidas e atuações do controle ficam
  vazias) — foi o que deixou o controle "lendo nada". Os testes de tela antigos começam travados (uma linha no começo de
  cada um) e clicam para editar, como antes; `codigo_tela.js` confere o padrão aberto.
- **Um controlador só é sempre o de sempre** (servidor, `enxuga_controladores`): a lista com só o `controle.py` volta
  vazia (lê todas, escreve as marcadas). Uma página desatualizada que gravou a lista com ele lendo nada deixou o controle
  de Marcelo quebrado; agora esse estado não existe mais.
- **Recolher a coluna do controle** ("dar de recolher essa barra dentro do code pra caber mais pra digitar"): o botão no
  começo da barra do editor esconde variáveis | arquivos e o editor fica com a largura toda (lembrado no navegador). A
  coluna continua na grade com 0 px (com `display:none` ela saía da grade e o editor caía na célula de 0 px — achado pelo
  teste).
- **A janela do código** ("ter na vertical o code também… abrir em duas telas sem dividir; o play fica só no circuito"):
  item `</>` no trilho (`pew-nav.js`), que abre `/pew/simu/?vista=codigo` numa janela à parte (a mesma, se já aberta),
  para o outro monitor. É a página do simu em modo código (`VISTA_CODIGO`): só o painel do controle, em tela cheia,
  ligado ao circuito aberto no servidor (o seletor no alto troca o circuito das duas janelas); sem ▶ (Ctrl+Enter avisa
  que o ▶ fica no circuito). As janelas conversam pelo `BroadcastChannel("pew-simu")`: controle guardado (a outra
  recarrega, sem perder o que se digita nela), circuito mudado (a outra relê o estado; um CONST novo aparece nos
  atuadores), rodada começou (a do código acompanha e trava a edição até o fim), e a janela do código avisa que está
  aberta (a do circuito cobre o painel do controle com "o código está aberto na janela do código" e um "editar aqui
  também"; sem notícia por 8 s, o aviso some). Δt e tempo final passam de uma janela à outra pelo `storage`.
- **Só o código** ("quando abrir em outra janela, melhor nem ter a barra ou as opções"): na janela do código somem o
  trilho e o cabeçalho; o circuito ligado aparece no título da janela ("código · exemplo_controle_pwm.ipes") e os erros
  na linha de estado do editor.
- **Scope em janela própria** ("se abrir o scope em outra janela quando clicar na lateral não faz sentido?"): no trilho,
  scope e código abrem cada um numa janela à parte, sempre a mesma (se já aberta, vem para a frente); início, Gecko e
  simu navegam na própria aba; Ctrl+clique ou o botão do meio abrem como aba normal.
- **Prova**: `validacao/tela/codigo_tela.js` 16/16 (duas janelas no mesmo navegador): cadeado aberto ao abrir, fechar
  lembrado, recolher a coluna (editor de 326 para mais de 480 px), o item no trilho, a janela do código (só o
  controle, sem o ▶, ligada ao exemplo), o aviso na do circuito, código mudado numa aparece na outra, CONST novo aparece
  na do código, a rodada pelo ▶ do circuito trava e destrava a do código, fechar tira o aviso.
- **O PEW como app** ("nem precisava mostrar a barra de endereço"): uma página não esconde a barra de endereço de uma
  janela que ela abre (regra de segurança do navegador); instalado como app (PWA: `pew-app/public/manifest.webmanifest`,
  ícones em `marca/`), o PEW abre como programa e as janelas não têm barra de endereço. A página do Gecko é a cópia que o
  `pew_gecko/sobe.sh` faz em `~/.cache/pew_gecko/web/` ao subir — atualizada à mão (só as linhas do ícone e do manifesto
  mudaram), sem reiniciar o Gecko. Prova: `validacao/tela/app_tela.js` 4/4 — o próprio Chrome (Page.getInstallabilityErrors,
  pelo protocolo de depuração) diz que o PEW é instalável no início, no simu, no scope e no Gecko.

## Soltar o terminal do subcircuito num nó liga (18/10, achado de Marcelo)
- "Comecei a criar um subcircuito; o terminal não liga num nó, numa linha, em nada": o terminal tinha sido **arrastado
  até o nó** entre os IGBTs e voltou para a borda (regra do Gecko: terminal de subcircuito fica na borda) — ficou na
  altura do nó, y = 13, sem ligação. Pela conexão (W: clique no terminal, clique na linha) ligava (conferido na cópia do
  estado dele: 5 → 6 conexões).
- Agora **soltar o terminal num ponto de ligação** (terminal de componente, conexão, nó) liga: o terminal **fica onde
  está** (o lado do borne no bloco não muda) e o PEW desenha uma conexão dele até o ponto, em L — horizontal primeiro ou
  vertical primeiro, o que não passar por terminal ou ponta de conexão (passar ligaria junto). Os dois passam: não liga e
  diz onde. Domínios diferentes (controle num ponto de potência): não liga. Uma 1ª versão encostava o terminal na borda
  mais próxima do ponto (no caso dele, a de cima: o borne mudaria de lado) — trocada antes de publicar.
- Prova: `sub_terminais_tela.js` 15/15 (ligado pelo caminho livre; controle × potência; os dois caminhos bloqueados) e,
  na cópia do estado do Marcelo, o CIRCUIT_TERMINAL.1 solto no meio da linha entre os IGBTs: fica em (1, 13) e ganha a
  conexão até (20, 15) pelo caminho vertical (o horizontal passaria pelo terminal do IGBT em (20, 13)).

## "Failed to fetch" ao apagar uma conexão (18/10, achado de Marcelo)
- Nada registrado no servidor do simu nem no Vite (que repassa o 5000 ao simu) naqueles instantes, e a conexão continuava
  no estado: o pedido não chegou. Pela API direta, apagar a mesma conexão (numa cópia do estado dele) funciona. Causa
  provável: a ponte Windows ↔ WSL (o navegador no Windows, o PEW no WSL) derrubando conexões — ele já tinha notado a
  ponte instável; cinco falhas seguidas em 30 s, às 20h41, batem com isso.
- O `api()` do simu agora repete uma vez a leitura (GET) que cai no caminho; a mudança (POST) não é repetida sozinha (se só
  a resposta se perdeu, repetir faria duas vezes) e o erro diz o que houve, no lugar de "Failed to fetch". Resposta que
  não é JSON (um erro do Vite, por exemplo) também vira uma mensagem clara. Teste: `validacao/tela/rede_tela.js` 2/2.
- Se acontecer com frequência: reiniciar o WSL (`wsl --shutdown` no Windows) — derruba tudo; depois `npm run pew`.

## Contingência para a conexão que cai (18/10, pedido de Marcelo: "como ter uma contingência… um botão aqui")
- Hipótese para as quedas seguidas sem rastro no servidor: o navegador guarda a conexão aberta para reusar, e a ponte
  Windows ↔ WSL às vezes a deixa morta do lado do Windows. O Chrome repete sozinho o GET numa conexão nova; o POST não
  — por isso falhavam as mudanças (apagar, salvar) e a leitura seguinte funcionava. Três camadas:
  1. **Sem conexão guardada** (pew-app, `vite.config.js`): o Vite fecha a conexão depois de cada resposta do simu e do
     scope (`Connection: close`); a página do Vite (os arquivos estáticos) continua como estava.
  2. **A mudança também é repetida, sem fazer duas vezes**: todo POST do `api()` leva uma etiqueta única
     (`X-PEW-Pedido`); caindo no caminho, é repetido uma vez com a mesma etiqueta. O servidor guarda as últimas 300
     respostas por etiqueta: se a primeira chegou e só a resposta se perdeu, a repetição recebe a resposta guardada e a
     mudança não é feita de novo; se a primeira ainda estiver em andamento, a repetição espera por ela.
  3. **A faixa "sem conexão"** (só quando a repetição também falha): diz que é a ponte Windows ↔ WSL, com o botão
     **testar de novo**; testa sozinha a cada 5 s e some quando o servidor responde ("conexão com o servidor do simu de
     volta"). Se o botão não resolve, ela orienta: fechar e abrir o PEW; se continuar, `wsl --shutdown` e `npm run pew`.
- Prova: `validacao/tela/rede_tela.js` 6/6 — Connection: close pelo Vite; leitura que cai uma vez (repetida); mudança que
  cai antes de chegar (repetida com a mesma etiqueta, feita uma vez); mudança feita e resposta perdida (a repetição
  recebe a resposta guardada: o R.2 não é criado duas vezes); sem conexão nenhuma, o erro claro e a faixa; com a
  conexão de volta, "testar de novo" tira a faixa.

## Copiar, recortar e colar; as ponteiras seguem o sinal; a tag (18/10, pedidos de Marcelo)
- **Ctrl+C, Ctrl+X, Ctrl+V** ("o Gecko não tem… se não for complexo"): o Gecko não copia pela interface remota; como na
  biblioteca, o servidor guarda o bloco do componente (de um subcircuito, com o que tem dentro e as conexões de dentro)
  e colar o insere com nome e identificadores novos (`copia_elemento`, `cola_elemento`, rotas `editor/copiar` e
  `editor/colar`). Cola **onde está o mouse** (fora do desenho, ao lado do original); com os parâmetros, **sem os rótulos
  de nó** do original (ligaria por rótulo, sem fio à vista, aos nós dele); recortar e colar mantém o nome; Ctrl+Z desfaz
  (recortar = copiar + apagar); um GATE ou amperímetro colado noutra folha perde o acoplamento (a chave é da folha de
  origem); um terminal colado dentro do SM vai para a borda, num borne livre; Ctrl+C sem componente selecionado é do
  navegador (copia o texto marcado). A área de transferência fica no servidor (vale entre as janelas e os circuitos).
  O mouse sobre o desenho é medido pela área dele (a dica de um componente, por cima, não o tirava — achado pelo teste).
- **As ponteiras voltavam ao automático ao renomear o sinal**: a ponta, a garra e a cor ficam guardadas pelo nome do
  canal; renomeado (ou o nome automático acompanhando o que o medidor mede, ou o subcircuito renomeado: o prefixo muda),
  ficavam presas ao nome velho. Agora seguem o medidor, reconhecido pelo identificador (`migra_aparencia`). Prova:
  `validacao/ponta_migra_api.py` 3/3 (o caso dele: Sub_1_v_vc → Sub_1_sm_vc; e o subcircuito renomeado → braco_sm_vc).
- **A tag (scope e controle)** ("o voltímetro ir para uma porta de controle e lá fora no Main a gente colocar essa TAG
  que vai pro scope e controle"): item "Tag (scope e controle)" na aba Measure da paleta. É um ganho 1 do Gecko (r0 = 1)
  chamado TAG.k: repassa o sinal ligado na entrada (por conexão ou rótulo) e o nome da saída é o nome do sinal no scope
  e no `m[…]` do controle — o nome que se quiser, sem o prefixo de subcircuito (dentro de um, ganha o prefixo, como os
  medidores). Desenho: "tag" e a etiqueta do scope; painel: a entrada e o nome no scope (sem o r0). Prova:
  `validacao/tela/tag_tela.js` 7/7 — pela paleta, ligada ao i_L, nome "corrente": a coluna no scope é idêntica ao i_L
  numa rodada, e `m["corrente"]` é medida do controle.
- **Fora do scope e do controle** ("pode ter caso que não quer que um voltímetro vá para o scope… quero que a variável vá
  só no Main"): caixinha "no scope e no controle" no painel de todo componente cujo sinal vira coluna (os blocos de
  controle da folha principal; os medidores e as tags dos subcircuitos), marcada por padrão. Desmarcada, o sinal continua
  no circuito (sai pelo Control Terminal, alimenta blocos), mas não vira coluna no scope nem `m[…]`; a etiqueta do
  scope fica apagada e tracejada. Guardado na aparência do circuito (`fora`: os identificadores; vai junto ao salvar).
- **"Could not find component SUBCIRCUIT.1#SUBCIRCUIT.1"** ao renomear o subcircuito: entrar nele com duplo clique
  mudava a folha mas o painel continuava com o bloco selecionado; mudar o nome ali montava o endereço como se o bloco
  estivesse dentro dele mesmo. Agora entrar ou sair de uma folha tira a seleção, e o endereço (`qualificado`) é o da
  folha onde o componente está (procurado pelo identificador), não o da folha aberta.
- Prova: `tag_tela.js` 11/11 (a tag de dentro do SM fora: sai das medidas e a etiqueta apaga; de volta; entrar no SM
  tira a seleção; renomear o subcircuito pelo painel).

## Seleção de vários (Shift) (18/10, pedido de Marcelo)
- "Se eu quiser selecionar várias coisas para mexer ao mesmo tempo… um comando no teclado que eu segure": **Shift +
  arrastar** no vazio desenha o retângulo e seleciona os componentes (pela posição) e as conexões (todos os pontos
  dentro); **Shift + clique** põe ou tira um componente ou uma conexão. Sem Shift, o arrastar continua movendo a tela.
- Com a seleção: **arrastar** um deles move o grupo (as conexões selecionadas andam junto: o que liga dentro do grupo
  continua ligado; um terminal de SM fica na borda); **Delete** apaga (uma pergunta só); **Ctrl+C / Ctrl+X / Ctrl+V**
  copiam, recortam e colam o grupo, com as conexões entre eles, o canto de cima à esquerda onde está o mouse — e o
  colado fica selecionado; **Esc** tira a seleção (sem sair do SM). O painel da direita mostra o resumo.
- Servidor (`copia_grupo`, `cola_grupo`, `move_grupo`, `apaga_grupo`, rota `editor/grupo`): uma edição do arquivo e o
  Gecko reabre — um passo só no desfazer. Colar troca os identificadores no grupo inteiro (um GATE e a chave dele,
  copiados juntos, continuam acoplados, com o nome novo da chave), tira os rótulos de nó de fora e anda as conexões. O
  copiar de um componente só virou o caso de um grupo de um.
- Prova: `validacao/tela/selecao_tela.js` 9/9 — retângulo (R.1, L.1 e a conexão, não o C.1), arrastar o grupo (a
  conexão continua nos terminais), Ctrl+Z num passo, Shift + clique, copiar e colar o grupo com a conexão, Delete com
  uma pergunta, Ctrl+Z, Esc.
- **De novo, depois de "salvar em branco"** (já no PEW instalado como app): o arquivo foi gravado, e os dois erros que
  vieram logo depois (a lista do Abrir e um pedido) não deixaram rastro no servidor nem no Vite — a mesma queda de
  conexão. A lista de modelos e a leitura do circuito usavam o fetch direto (sem repetir); agora passam pelo `api()`,
  que repete a leitura uma vez e diz o que houve.

## Variáveis globais ($) como no Gecko antigo (18/10, pedido de Marcelo para um sistema trifásico)
- "Como eu faço para essa unidade ser aquelas $var do Gecko antigo… quero colocar no parâmetro": no **campo do parâmetro**,
  escrever `$nome` no lugar do número liga o parâmetro à variável (a que não existe é criada com o valor que estava no
  campo); o campo mostra o nome (em destaque) e `= valor`; escrever um número desliga (fica o número). Dentro de um
  subcircuito vale para os iguais, como as outras mudanças. Só parâmetros numéricos (o tipo da fonte não).
- **⚙ com duas abas** (ideia dele): "simulação" (Δt, tempo final, nome, amostras: valem ao iniciar) e "variáveis globais
  ($)" — a lista com o valor (mudar vale na hora, Enter não fecha a janela), quantos componentes usam cada uma (a dica
  diz quais), criar ($ entra sozinho), × apagar (a usada pergunta antes; quem a usa fica com o valor dela) e "apagar as N
  que nenhum componente usa" (um passo do desfazer). O `$x` abre a mesma janela direto nessa aba.
- **⧉ ao lado de cada nome** (pedido dele em 19/10): copia o nome (`$Vdc`) para a área de transferência; colar no campo
  do parâmetro de um componente e sair do campo liga, como escrever o nome à mão. O botão fica verde por um instante e a
  barra de mensagens confirma (sem permissão de área de transferência, cai no `execCommand("copy")`; se nem isso der,
  diz para selecionar e copiar).
- Como o Gecko grava (lido no código dele): a lista `optimizerName[] /$a/$b` + `optimizerValue[] 1.0 2.0`; no componente,
  `<identificador>$ParameterName $a` antes da linha do valor (ele só lê o nome se a linha do valor existir) e o
  `nameOpt[]` antigo pelo índice. A interface remota só muda o valor de uma variável que existe (SETG); criar, apagar,
  ligar e desligar é no arquivo, e o Gecko reabre e confere (rota `editor/variavel`: nova, apaga — uma ou várias —,
  liga, desliga).
- O nome que a tela mostra (o da interface remota: uMAX, f, phase) é outro no arquivo (amplitude, frequency,
  phaseDegrees): o mapa vem do próprio Gecko — `motor/src/pew/PewParametros.java` constrói cada tipo e grava, de cada
  parâmetro, os nomes, o identificador, o índice e o tipo do valor em `parametros_gecko.json` (114 de 118 tipos; os
  mesmos 4 da geometria não se constroem sem janela). Regerar: `javac -cp $JAR -d /tmp/par motor/src/pew/PewParametros.java
  && java -Djava.awt.headless=true -cp $JAR:/tmp/par pew.PewParametros > parametros_gecko.json`. A busca segue a ordem
  do Gecko (o nome de agora primeiro, os alternativos por último): o alternativo do uDC da fonte é "uMAX", o nome da
  amplitude — sem a ordem, ligar o uDC aparecia como o uMAX ligado (achado na foto do teste).
- Achado no teste: o Gecko separa a lista de nomes só pela "/"; um espaço depois do último nome entra no nome (`"$b "`),
  e o parâmetro ligado a ele vale NaN (o amperímetro "has no output" na rodada). A lista é escrita como o Gecko
  escreve, sem espaço no fim (os arquivos do Gecko e do PEW conferidos: nenhum tinha o espaço).
- O circuito novo vem com as 25 variáveis do modelo base do MMC ($CSm, $igbt_…; nenhum componente as usa): "apagar as
  que nenhum componente usa" limpa.
- Prova: `validacao/variaveis_api.py` 16/16 — criar; repetida e nome inválido recusados; ligar uDC (dcValue) e uMAX
  (amplitude) sem confundir; a variável que não existe criada no ligar; o tipo da fonte recusado; **simulado: i =
  $Vdc/$R = 10/5 = 2,0 A e, com $Vdc = 20, 4,0 A** (a rodada usa a variável e acompanha); desligar (20/4 = 5,0 A);
  Ctrl+Z; apagar (quem usava fica com 20); dentro do subcircuito; a última da lista (não NaN). `validacao/tela/
  variaveis_tela.js` 15/15 — o $ no campo, as abas, mudar com Enter, criar, apagar (sem uso na hora; usada pergunta),
  o $x na aba, apagar as sem uso, o número desliga, nome inválido recusado, o ⧉ copia o nome e colá-lo no parâmetro liga.

## A beira da folha principal: o Gecko não aceita x nem y menor que 1 (18/10, achado de Marcelo)
- "Não consigo mover as fontes… arrasta e volta pro mesmo lugar": as três fontes do trifásico estavam em x = 1 (a beira
  da esquerda), e ele as arrastava para a esquerda. O Gecko põe em 1 qualquer x ou y menor que 1, sem erro e sem aviso
  (`AbstractBlockInterface.getCheckedSheetPosition`): o pedido chegava, o Gecko respondia "ok" e a fonte ficava (ou
  voltava a x = 1, como o Va_2 colado em (2, 4) e arrastado: ficou em (1, 5)). A tela, que desenha o que o Gecko diz,
  mostrava a fonte voltando.
- **Hipótese errada, registrada**: primeiro achei que era o registro de nomes do Gecko (IDStringDialog) com uma cópia
  velha do "Va" (o MOVE mexeria na cópia invisível) e pus uma conferência com "mover pelo arquivo" — servidor
  reiniciado com ela às 23:2x. O log dela mostrou os destinos: (−4, 0), (−2, 1), (−5, 0), (−4, −1), todos fora da folha;
  pelo arquivo também não ia ("nem pelo arquivo": o Gecko corrige ao abrir). A conferência saiu; o registro de nomes não
  tinha nada a ver.
- Agora: soltar além da beira de cima ou da esquerda **abre espaço** — o servidor anda o circuito todo da folha
  principal (componentes e conexões; os subcircuitos por dentro não mudam) o que faltar, e a peça fica onde foi solta em
  relação às outras; um passo do desfazer (`move_grupo` com `para=`, numa edição do arquivo; `r["deslocado"]`). A tela
  anda a vista o mesmo tanto: nada pula, e a mensagem diz quanto o circuito andou. Vale para o grupo (Shift) também.
  Dentro de um subcircuito (folha de tamanho fixo) o limite é 1…tamanho−1 e a tela recusa antes, como já fazia.
- O item "GeckoCIRCUITS" saiu do trilho ("nem precisa mais"): o simu faz tudo pelo Gecko escondido; a página
  /pew/gecko/ continua no endereço e no cartão da página inicial, para conferir.
- Prova: `validacao/move_api.py` 8/8 — Va para (−4, 0): o circuito anda (5, 1), Va fica 5 à esquerda e 1 acima em
  relação às outras, a conexão vai junto (o encaixe conta o mesmo), o SM por dentro igual; Ctrl+Z volta tudo; dentro da
  folha só ele anda; o grupo 4 para cima abre 3; no SM, nada anda. `validacao/tela/beira_tela.js` 5/5 — as três fontes
  em x = 1, Vb arrastada 6 para a esquerda e 2 para cima: fica assim em relação às outras e, na tela, onde o mouse
  soltou (nada pulou); a mensagem; Ctrl+Z.

## Rumo a um .exe para a comunidade (18/10)
- Pedido de Marcelo: o PEW portátil para Windows, para compartilhar. Roteiro em `ROTEIRO_EXE.md` (escopo, arquitetura,
  licenças — o Gecko é GPLv3 —, 8 fases com critérios de pronto, riscos e decisões em aberto).
- O modo de rede espelhado do WSL (`networkingMode=mirrored`), tentado em 19/10 para tirar o `wslrelay` do caminho,
  quebrou o Gecko do PEW: a ponte (6110) e o motor (6120) não conectaram ao RMI em localhost:43050 ("Connection timed
  out"; `npm run pew`: "o Gecko do PEW não ficou pronto em 2 min"). Voltou ao NAT, e tudo subiu (conferido pelo
  `curl.exe` do Windows: 5000 → simu, scope e trilho com 200 em ~0,2 s). Causa a investigar antes de tentar de novo.

## O que o Claude mudou, depois de aprovar (19/10, pedido de Marcelo)
- "Quando o Claude mudou o .py, fica salvo em algum lugar… só pra saber o que mudou depois de aprovar, um histórico": ao
  aplicar uma proposta, o histórico da conversa guarda o que mudou — o controle.py, os parâmetros e os acionamentos de
  antes (os que estavam na tela ao aplicar) e os da proposta. Na conversa, a resposta aplicada ganha **ver a mudança +N
  −M** (e "· parâmetros", se eles mudaram), que abre a mesma janela da diferença (unificado ou lado a lado, sem o
  aplicar), com o pedido e a hora; "voltar ao de antes" marca "aplicada e desfeita" (a mudança continua para ver).
- Servidor: `claude_aplicada(antes)` grava `mudanca` e `mudanca_resumo` no histórico (até 60 pedidos por conversa);
  `/claude/pedido` manda o histórico sem o código (só o resumo e o índice `i`); `/claude/mudanca?i=` traz a mudança;
  `/claude/desfeita`. As propostas aplicadas antes disto não têm a mudança guardada.
- Prova: `validacao/tela/claude_chat_tela.js` 38/38 (2 novos: o botão "ver a mudança +1 −0 · parâmetros" abre a mudança
  aplicada, sem o aplicar, com K2; depois do voltar, "aplicada e desfeita" e a mudança continua); `claude_pedido_api.py`
  sem falhas.
- `validacao/sobe_teste.sh` agora sobe também a página de teste (Vite 5010 → 8768), que caía com um `wsl --shutdown`;
  `desce_teste.sh` a derruba.

## O divisor entre o código e a conversa do Claude (19/10, pedido de Marcelo)
- "Mesmo com tela dividida, poder correr o divisor dentro da segunda, onde estão o controle e o Claude": a borda entre o
  código e a conversa se arrasta — ao lado, muda a largura da conversa (`--cc-w`); embaixo, a altura (`--cc-h`); o
  código fica com pelo menos 300 px; guardado no navegador; duplo clique volta ao padrão. As contas são em pixels de CSS,
  com a escala do zoom do PEW medida na hora (com 110 %, o divisor fica exatamente onde o mouse solta).
- Prova: `validacao/tela/divisor_tela.js` 7/7 (zoom 110 %: ao lado e embaixo, o limite de 300 px, guardado, duplo
  clique); `claude_chat_tela.js` 38/38 e `controladores_tela.js` 20/20 depois da mudança. O `codigo_tela.js` parou no
  passo que abre o scope pela 5010 (o scope 8765 estava fora: o WSL tinha reiniciado e o PEW não tinha subido) — a
  repetir com o PEW no ar.

## Módulos: ler → controlar → escrever (19/10, pedido de Marcelo)
- O Claude do PEW achou a pegadinha: dois .py eram dois controladores (processos à parte, com 1 amostra de atraso entre
  eles) — dividir a aquisição e o PLL em arquivos poria 100 µs dentro da malha do PLL. Marcelo: um padrão de arquivos,
  "para ele não alucinar e viajar", e emular certinho um controle com seus limites.
- **Todo .py que não é controlador é um módulo** (não precisou de campo novo: os arquivos que "não rodavam" viraram
  módulos): quem importa chama, no mesmo processo e na mesma amostra. O worker importa os módulos da memória (um
  `MetaPathFinder` com as fontes que vêm no `carrega`; a pasta do PEW sai do `sys.path` do usuário); cada controlador tem
  a sua cópia. Erro num módulo aponta o arquivo e a linha dele (também erro de sintaxe ao importar).
- **Circuito novo:** `leitura.py` (ADC e sensores) → `controle.py` (orquestrador) → `escrita.py` (PWM/DAC), dos modelos
  `leitura_modelo.py`, `controle_modelo.py`, `escrita_modelo.py`; "+ arquivo" cria um módulo (`modulo_modelo.py`).
  Contrato de módulo: `iniciar(p)` → estado; `passo(entrada, p, estado)` → saída. Um controle guardado de antes continua
  como era (`completa_controle`: sem os arquivos novos); na árvore, "organizar como um DSP" cria os dois sem mexer no
  `controle.py`. "virar controlador" / "virar módulo" na árvore.
- **Os riscos** (`analisa_modulos`): erros (impedem rodar) — nome de módulo do Python, import que não existe, import de um
  controlador; avisos — módulo que ninguém importa, ciclo, módulo com `passo(t, m, p, e)`, o mesmo módulo em dois
  controladores. O tempo de cálculo é zero na amostra: o atraso real é o do painel (anotado no guia, §3.0.1).
- O Claude do PEW sabe disso pelas regras e pelo CONTEXTO.md (os arquivos com o papel de cada um, os riscos acusados); ele
  ainda edita só o controle.py (diz o que mudar nos módulos) — editar vários arquivos é a etapa seguinte.
- Prova: `validacao/modulos_api.py` 12/12 — o PI de corrente em módulos (`leitura → pi → escrita`) é **bit a bit igual** ao
  PI num arquivo só (t, i_L, u_ctrl, erro; 101 amostras; i_L final 4,99915 A); os 6 riscos; erro no `pi.py` linha 6 na
  rodada; o exemplo antigo abre como era. `validacao/tela/modulos_tela.js` 9/9; `controladores_tela.js` 21/21 (o "+
  arquivo" nasce módulo, "virar controlador" segue como antes); `codigo_tela.js` 16/16.
- A instância de teste agora tem a página (5010) e um scope só dela (8776), em `validacao/sobe_pagina_teste.sh` (o
  `sobe_teste.sh` chama): com o PEW de Marcelo fechado, os testes do scope caíam.

## Etapa B: o Claude do PEW cria e edita os módulos; a ordem conferida (19/10, pedido de Marcelo)
- "Melhor criar separados e ter um padrão de comunicação entre eles… na ordem certa; o Claude manjar disso e sempre
  corrigir". A pasta do Claude recebe todos os .py; ele roda com `--tools Read,Edit,Write,Glob,Grep` e pode editar/criar
  só `./*.py` (além dos três arquivos de sempre e da memória): `Edit(./*.py)`, `Write(./*.py)`. As regras dizem o contrato
  e a ORDEM (leitura → módulos de controle, cada um com a saída do anterior → escrita, que devolve as atuações; cada
  módulo iniciado no `iniciar()`), que arquivo novo é módulo, que ele não apaga nem promove a controlador, e que corrija o
  que fugir disso. O `CONTEXTO.md` lista os arquivos com o papel e o que o PEW acusa, sem repetir o código (está na pasta:
  menos tokens).
- A ordem é conferida (`ordem_do_fluxo`, avisos): `leitura.passo()` 1ª chamada; `escrita.passo()` última; o `return` é o
  que o escrita devolveu; módulo chamado sem o `iniciar()` dele.
- A proposta lê de volta todos os .py (`arquivos_antes`/`arquivos`), confere a sintaxe e os riscos; o cartão mostra cada
  arquivo (`pll.py (novo): +7 −0`), a janela da diferença tem uma aba por arquivo, ▷ testar roda com os módulos da
  proposta, aplicar cria/troca/tira os módulos no editor, "voltar ao de antes" e "ver a mudança" levam os arquivos.
- Prova: `validacao/modulos_api.py` 17/17 (5 novos da ordem: o fluxo certo sem aviso; leitura fora de 1º, escrita fora
  de último, return que pula o escrita, módulo sem iniciar — cada um com o aviso dele); `validacao/tela/claude_modulos_tela.js`
  8/8 com o Claude falso (cenário "modulos": cria o pll.py, chama do controle.py na ordem, revisa o leitura.py) — o
  cartão, as opções do CLI, as abas da diferença, ▷ testar, aplicar (pll.py como módulo, sem aviso de ordem), ver a
  mudança (3 arquivos), voltar (o pll.py sai); `claude_pedido_api.py` com as opções novas.
- Erro de processo registrado: rodei os testes da etapa B na instância de teste enquanto a bateria da etapa A ainda
  rodava nela — os dois mexeram no mesmo servidor e no mesmo Claude falso (o cenário é um arquivo), e a bateria saiu
  contaminada (pontas, claude_tela, passo2, revisao). A bateria vale rodando sozinha.
- Efeito do mesmo erro, achado na bateria limpa: o `pontas_tela.js` salva por cima do circuito dele (`pontas_teste.ipes`,
  uma cópia de um circuito do Marcelo que só existia na pasta de teste) e, rodando junto com os testes da etapa B, salvou
  um circuito vazio. Agora o teste monta o próprio circuito pela API (U.1 e R.1 em paralelo nos nós + e −, VOLT.1 entre
  eles): 6/6, e não depende mais de um arquivo fora do repositório. Bateria limpa (sozinha): 30 de tela e 16 de API
  verdes, com o pontas_tela refeito.

## O modelo e o esforço do Claude do PEW; o enviar desligado enquanto ele responde (19/10, pedido de Marcelo)
- "Escolher qual modelo vamos usar antes de enviar, até para controle de consumo": ao lado do enviar, **modelo** (padrão
  da conta, Fable, Opus, Sonnet, Haiku → `claude --model <apelido>`) e **esforço** (padrão, baixo, médio, alto, muito alto,
  máximo → `--effort`), lembrados no navegador; o servidor só aceita os da lista (`MODELOS_CLAUDE`, `ESFORCOS_CLAUDE`).
  A linha de gasto de cada resposta mostra o modelo que respondeu (guardado no histórico).
- "Quando o Claude estiver respondendo, deixar desabilitado o enviar": já ficava desligado, mas não parecia (o roxo do
  botão primário não tinha estilo de desligado); agora fica cinza com "respondendo…", e o campo diz que dá para escrever
  o próximo (envia quando ele terminar).
- Prova: `claude_pedido_api.py` (--model sonnet --effort low no CLI; o modelo no histórico; modelo fora da lista
  recusado); `claude_modulos_tela.js` 12/12 (o enviar desligado e cinza durante o pedido lento, haiku/baixo no CLI, parar
  devolve o enviar, a escolha fica ao recarregar); `claude_chat_tela.js` 38/38, `claude_tela.js` 17/17.
- O controle reorganizado em módulos (09:36/09:42), apagado por uma restauração minha sem conferir: recuperado da rodada
  das 09:48 (que guarda o controle.json e todos os .py); a proposta do Claude aplicada depois o recriou igual (só dois
  comentários diferentes). Lição na memória: conferir o que está em uso antes de sobrescrever.

## Os nomes de fora de um subcircuito não vão junto (19/10, achado de Marcelo)
- "O subcircuito de onde tirou esses nós vap, EXT_… eu não dei; a ideia é ele ser usado sem trazer essas coisas de nome":
  o SM-HB da biblioteca chegava com vap, EXT_S3 e VC_SM3 (os nós do MMC de onde foi salvo) — ligado por rótulo, sem fio à
  vista, a qualquer nó com esse nome no circuito. O Gecko guarda o nome de fora no bloco E nos terminais de dentro
  (labelEndKnoten do terminal) e, ao abrir, refaz o do bloco pelos terminais: salvar na biblioteca e colar limpavam só o
  bloco, e os nomes voltavam. Agora `_sem_rotulos_de_fora` limpa os dois — ao salvar na biblioteca, ao inserir dela (os
  arquivos de antes, como o SM-HB, saem limpos) e ao colar um subcircuito (a cópia ficava ligada aos nós do original).
  Os terminais globais (que ligam pelo nome de propósito) ficam.
- Prova: `validacao/biblioteca_rotulos_api.py` 3/3 — inserir o SM-HB de antes, colar um SM do modelo 03 (o original
  continua com os dele) e salvar na biblioteca; no servidor antigo, os três falham.

## O × da aba fecha a aba; o × da lista apaga (19/10, pedido de Marcelo)
- As abas do editor são os arquivos abertos: o × da aba só a fecha (o arquivo continua na lista de arquivos e no
  controle; clicar nele na lista reabre a aba); o controle.py fica sempre aberto. Apagar é o × da lista ("apagar … (o
  código se perde)"), que pergunta antes. Prova: `modulos_tela.js` 11/11 (2 novos); `controladores_tela.js` apaga pelo
  × da lista.

## Girar: o Gecko não gira bloco de controle nem subcircuito (19/10, pergunta de Marcelo)
- "O CONST tá sempre pra um lado… um flip ficaria top?" — o "girar (R)" aparecia no CONST e não fazia nada. No código do
  Gecko: `RegelBlock.rotiereSymbol()` é vazio ("control components cannot be rotated at the moment!") e
  `RegelBlock.setComponentDirection` força a orientação para baixo; `SubcircuitBlock` força também. Conferido no Gecko de
  teste: quatro ROTATE no CONST, no GAIN e no SUB e a orientação continua 503. O .ipes nem guarda outra orientação para
  esses blocos (o Gecko original a desfaz ao abrir).
- Agora: "girar (R)" só nos componentes que o Gecko gira; no bloco de controle e no subcircuito o botão "girar" fica
  apagado e, clicado (ou com R), explica: para ligar sem fio, o mesmo rótulo nos dois terminais.
- Espelhar de verdade exigiria mudar o fork do Gecko (e o arquivo deixaria de abrir igual no Gecko original) ou um
  espelho só no desenho do PEW (o fio passaria por dentro do bloco no arquivo): nenhum dos dois foi feito.
- Prova: `validacao/tela/giro_tela.js` 7/7 — R gira o resistor (503 → 504); no CONST e no subcircuito o botão explica,
  o R avisa, nada muda e nada de "girado" no histórico. `sub_terminais_tela.js` 16/16.

## Atuações no fluxo de módulos e o ✕ da saída do testar (19/10, achados de Marcelo)
- "Depois de testar, como fechar o console?": a saída do ▷ testar (e a da rodada) não fechava. Agora tem um ✕ no canto;
  o ▷ testar abre de novo. O texto tem margem à direita para o ✕ não cobrir a primeira linha.
- Na mesma foto, o aviso "sm_an_1_s, sm_ap_1_s não é atuação marcada (a rodada pararia)": ao aplicar uma proposta do
  Claude do PEW, o PEW marca as atuações que o código escreve, mas procurava só chaves num `return {…}` literal. No fluxo
  leitura → controle → escrita o controle.py monta `u = {"sm_ap_1_s": …}` e devolve `escrita.passo(u, …)`: nada era
  marcado (o Claude até escreveu no comentário "o PEW marca ao aplicar"). Agora `chaves_devolvidas` lê, no passo() do
  controle.py e no dos módulos, as chaves de dicionário literal, de `dict(x=…)` e de `u["x"] = …`, cruzadas com os
  atuadores do circuito (um dicionário qualquer não marca nada). O validador do editor também sublinha a chave de
  atuador não marcada fora do return, e a regra do Claude do PEW diz `u = {…}` ou `return {…}`.
- Prova: `validacao/atuacoes_modulos_api.py` 9/9 — a proposta marca u_ctrl em `u = {…}` (o caso dele), `u["x"] = …`,
  `dict(x=…)`, numa chave do escrita.py e no `return {…}` de antes; o dicionário com chave que não é atuador não marca; o
  validador sublinha; marcada, o testar não avisa. A função antiga, no código do caso dele, não achava nenhuma chave.
  `validacao/tela/saida_tela.js` 5/5. Sem regressão: modulos_tela 11, validador_tela 13, controle_tela 11,
  controladores_tela 21, claude_modulos_tela 12, claude_chat_tela 38, modulos_api 18, claude_pedido_api 57,
  controladores_api 16, teste_controle 6.

## Variáveis em tabelas, como os arquivos (19/10, pedido de Marcelo)
- "Essa barra com atuações, medidas, parâmetros e acionamentos, quando tiver várias coisas, vai ficar ruim… quando abrir
  variáveis, ter sub-itens, e onde está o 'VS Code' ter as tabelas… mesma dinâmica dos arquivos". Escolhido com ele:
  abas como as dos arquivos, com "no código", filtro e ordenação.
- A coluna "variáveis" ficou com o Ts, a atuação no tempo e o **índice** das tabelas, na ordem do fluxo: **Medidas**
  (m["…"]), **Parâmetros** (p["…"]), **Atuações** (o código escreve) e **Acionamentos** (no tempo), cada uma com quanto
  tem e um ⚠ quando cabe (o código escreve uma atuação não marcada; acionamento num CONST que o código também escreve).
- Clicar mostra a tabela no lugar do código, **sem aba** (primeiro foram abas como as dos arquivos; ele, ao ver: "nem
  precisa abrir nas abas"). Voltar ao código: clicar num arquivo, de novo no item ou no ✕ da tabela; a tabela à vista
  fica no navegador ao recarregar. "modelo" e a quebra de linha somem com uma tabela à vista (só valem para o código).
- **No código** (Medidas, Parâmetros, Atuações): onde o nome aparece nos arquivos do editor, fora de comentário,
  arquivo:linha — clicar abre o arquivo na linha. Parâmetro: `p["x"]`; medida: o texto "x" (pega `m["Va"]`, `x["Va"]` e
  a lista `("Va", "Vb", "Vc")` do leitura.py dele), menos chave de dicionário de saída; atuação: chave `"x": …` ou
  `u["x"] = …`. "sem uso" ajuda a limpar.
- Ordenar (clique no título da coluna: ▲, ▼, a ordem do painel) e filtrar só mudam a vista: o que é guardado continua na
  ordem do painel (os acionamentos o servidor sempre guarda por t).
- Atuações × acionamentos (pergunta dele: "não são a mesma coisa?"): não. A **atuação** é o código escrevendo no CONST a
  cada Ts (malha fechada); o **acionamento** é uma mudança programada no instante t, sem código (degrau de carga, de
  referência em p["…"]). Ficaram lado a lado no fim do índice; a tabela de atuações mostra os acionamentos de cada CONST,
  e a de acionamentos avisa quando o CONST também é escrito pelo código — o acionamento só vale até a próxima escrita
  (era o caso dos dois dele, em t = 0).
- Medidas: a coluna "Controlador" (quem lê) só aparece com mais de um controlador. O ↳ "inserir no código" saiu (ele: "não
  faz sentido aqui"); no código, o autocompletar de m["…"] continua.
- Achado no caminho: a função `htmlUso` nova colidiu com a do claude.js (o uso da conta: a coluna mostrava "Não consegui
  ler o uso da conta") e `ordena` com a do claude_chat.js — scripts da página dividem o mesmo escopo; renomeadas.
- A etiqueta ⚙ do atuador foi para **cima do bloco CONST**, como o nome de um componente (ele: na saída ela cobria o que
  se liga ali, o borne S do SM encostado no CONST).
- Prova: `validacao/tela/tabelas_tela.js` 16/16 — índice com o ⚠, abrir parâmetros numa aba, "no código" (o comentário
  não conta), editar grava, ordenar não muda a ordem guardada, filtrar, ir à linha, marcar a atuação, a etiqueta em cima
  do CONST, medidas (lista de nomes, sem a coluna do controlador, sem ↳), a observação do acionamento, + e ×, voltar ao
  código (o item de novo, o ✕, um arquivo; nenhuma aba de tabela), a tabela à vista ao recarregar. Testes antigos ajustados à tabela: passo2_tela, revisao_tela, controladores_tela (a medida e
  quem a lê).

## Arquivos em árvore pelos imports, busca, e os botões da barra do mesmo tamanho (19/10, pedido de Marcelo)
- "Talvez ter uma busca de arquivos aqui… e até pensar na hierarquia, porque já está ficando cheia a lista" (8 arquivos:
  uma modulação por SM, mais o pwm.py e um modulacao.py que ninguém importava). Escolhido com ele: a árvore pelos imports.
- A coluna "arquivos" mostra cada **controlador na raiz** (o controle.py; os outros, se houver) e, embaixo, os **módulos
  que ele importa, na ordem em que o passo() os chama** (o fluxo do DSP: leitura → pll → modulações → escrita), não na
  ordem dos `import`; módulo que importa outro fica aninhado (as modulações → pwm.py); o que já apareceu aparece de novo
  só como referência, "(acima)"; os que nenhum controlador importa vão para **"sem uso"** no fim. Uma linha por arquivo;
  ▾ recolhe um ramo (fica no navegador); ⤴ (virar controlador) e × (apagar) aparecem ao passar o mouse.
- **Busca** no topo: os arquivos com o texto no nome e as linhas de código com o texto (maiúscula ou não, até 60); clicar
  abre o arquivo na linha; Esc limpa e a árvore volta.
- Os botões da barra do código (coluna, Claude, ▷ testar, modelo, quebra de linha, ?) ficaram todos com 26 px de altura,
  texto numa linha só (o "▷ testar" quebrava em duas), os de ícone quadrados (ele: "padronizar o tamanho desses botões").
- Achado: reabrir o circuito trocou o controle de trabalho pelo salvo (de antes do PWM) e o salvar seguinte gravou por
  cima — o PWM (modulacao.py, pwm.py, 6 parâmetros) foi recuperado da cópia que guardei antes de reiniciar o servidor
  (igual, conferido, à proposta aplicada às 12:08). Melhoria pendente: avisar e guardar cópia ao abrir/descartar.
- Prova: `validacao/tela/arvore_tela.js` 10/10 (o caso dele, com os imports noutra ordem que as chamadas); modulos_tela e
  controladores_tela ajustados à árvore (a dica da linha diz o papel); quebra_tela, divisor_tela, codigo_tela,
  claude_chat_tela, tabelas_tela, escala_tela, dica_tela, claude_modulos_tela verdes.

## O Claude do PEW cria e muda controladores (3 DSPs pela fibra) (19/10, pedido de Marcelo)
- "Estou tentando fazer 3 DSPs… idealmente na prática se comunicando por fibras ópticas… uma trava no Claude": o
  controle.py com o PLL manda o θ por envia() aos DSPs de cada célula (sm_ap_1.py, sm_an_1.py), que recebem e escrevem a
  chave do seu SM. O código o Claude fez; a lista de controladores, não — as regras diziam "não transforme módulo em
  controlador (é o usuário que decide)" e o painel não tinha como ele mexer.
- Agora a pasta do pedido tem **controladores.json** — `{"controladores": [{nome, arquivo, todas, medidas, atuacoes,
  subcircuitos}], "rede": {"latencia": s}}` — que o Claude pode editar (o CLI ganhou `Edit(./controladores.json)`); as
  regras explicam o formato, o dono único de cada atuação, envia/recebe e a latência (fibra: a mensagem chega na 1ª
  amostra com t ≥ t_envio + latência; 0 = a amostra seguinte), e pedem controlador novo só quando o usuário quer controle
  distribuído. O nome padrão é o do arquivo.
- O PEW valida a proposta como valida o painel (`confere_controle`), marca as atuações que o código e os controladores
  escrevem (antes de conferir os controladores: senão acusava "marque u_ctrl"), acusa atuação com dois donos, testa com os
  controladores propostos, e o histórico ("ver a mudança") guarda os controladores e a rede de antes e de depois. Na tela, o
  cartão e a janela da diferença listam "+ controlador dsp_a (dsp_a.py; lê nada; escreve u_ctrl)", "rede: latência 0 s → 20
  µs"; aplicar põe tudo no painel; ↶ voltar ao de antes tira.
- Prova: `validacao/claude_controladores_api.py` 9/9 — dois donos acusado; a proposta com 3 controladores e a fibra de
  20 µs; u_ctrl marcada; o CLI; ▷ testar; aplicado sem erros; o histórico; e a **rodada de verdade com os 3 DSPs**: i_L em
  0 até a mensagem chegar (t < 20 µs) e 1,9999 A no fim (u_ctrl = 2 V mandado pelo controle.py ao dsp_a, R = 1 Ω).
  `validacao/tela/claude_controladores_tela.js` 5/5 (o cartão, a diferença, aplicar com a árvore dsp_a.py e dsp_b.py na
  raiz, voltar). claude_pedido_api 57/57 (a lista exata de permissões, com o controladores.json), claude_chat_tela 38,
  claude_modulos_tela 12, claude_tela 17, controladores_api 16, controladores_tela 21, modulos_api 18,
  atuacoes_modulos_api 9.
- **Defeito da árvore, achado por Marcelo na hora (19/10, 15h)**: com controladores (os cartões) e o grupo "sem uso" ao
  mesmo tempo, o redesenho quebrava — guardar quais grupos dos cartões estavam abertos lia o cartão de todo `<details>`
  aberto, e o "sem uso" não tem cartão ("Cannot read properties of null (reading 'dataset')"). O servidor até gravava,
  mas o redesenho depois de gravar quebrava: a conversa dizia "não deu para guardar o controle antes" e a árvore ficava a
  do primeiro desenho (feito antes de o editor ter os arquivos: leitura.py e pll.py em "sem uso"). Corrigido; o motivo de
  não guardar agora vai junto na mensagem da conversa (a linha de estado podia estar espremida pelas abas; agora as abas
  ficam com pelo menos 140 px e o estado encolhe junto). O "sem uso" começa pelos arquivos que nenhum outro importa
  (sm_ap_1.py, com o que ele importa embaixo). `arvore_tela.js` 11/11 (o caso dele: redesenha sem quebrar, guarda, a
  árvore certa); controladores_tela, modulos_tela, codigo_tela, quebra_tela, divisor_tela, claude_* e tabelas_tela verdes.
- **O contador "o Claude está trabalhando… (-120 s)"** (19/10): o relógio do WSL estava 2 min adiantado em relação ao do
  Windows (15:16:09 × 15:14:04), e a tela subtraía a hora de início do servidor (WSL) da do navegador (Windows). Agora o
  servidor manda o tempo decorrido (`decorrido`, medido lá); a tela usa esse. E a regra do Claude do PEW ficou explícita:
  o que cada controlador lê e escreve e a latência ele muda no controladores.json — não é "ação do painel" (numa resposta
  ele ainda disse que era).

## As mensagens entre os DSPs nos cartões (19/10, pedido de Marcelo)
- "Mostrar aqui quando um DSP recebe uma variável de outro… o theta vem do PLL, que recebe as tensões e manda para os
  outros… ter essa cadeia". Cada cartão de controlador (aba arquivos) mostra, lido do código, **recebe theta ← controle**
  e **envia theta → sm_ap_1, sm_an_1 (na amostra seguinte / fibra de X)**: os `envia("destino", {"chave": …})` (ou
  `dict(chave=…)`) do arquivo do controlador e dos módulos que ele importa, fora de comentário; quem manda o mesmo a vários
  numa linha só; o que cada um recebe sai do que os outros mandam para ele. Avisos (⚠): destino que não é controlador
  (a mensagem não chega) e controlador que recebe mensagens mas não chama `recebe()` (elas se perdem). Acompanha o código
  a cada gravação. (Ele escolheu só isto por agora; o diagrama gráfico e tirar os checks dos cartões ficaram para depois.)
- Prova: `validacao/tela/mensagens_tela.js` 5/5 (agrupar, destino inexistente, comentário não conta, envia de dentro de
  um módulo com dict(…), recebe de dois, o aviso do recebe() e ele sumindo quando o código passa a chamar); com o controle
  dele (cópia, na instância de teste): controle "envia theta → sm_ap_1, sm_an_1", cada SM "recebe theta ← controle".

## A telinha de escolha nos cartões dos controladores (19/10, pedido de Marcelo)
- "Ao clicar nas setinhas, talvez abrir como tabela ou telinha… hoje são menos de 10, mas quando tiver centenas de
  variáveis fica ruim de clicar… um dropdown com filtro e multiselect… e quando clicar no .py, aí sim abrir o código".
- Clicar em **lê …**, **escreve …** ou **em subcircuitos …** num cartão abre uma telinha junto da linha (por cima do
  código; com o zoom do PEW, pela razão offsetWidth/largura medida, como o divisor): filtro, "todas as medidas" (em lê),
  **marcar / desmarcar os filtrados** (de uma vez, uma gravação só) e a lista com caixas (cerca de 5 linhas à vista e rolagem: ele, "umas 5 linhas e scroll"); em "escreve", a atuação de outro
  controlador aparece "(de sm_an_1)" e marcar tira de lá (dono único). É uma vista dos checkboxes do cartão, que continuam
  sendo o que se guarda: marcar ali dispara a mesma mudança do cartão. Esc, ✕ ou clique fora fecham; a lista no cartão não
  abre mais. O resumo da linha fica curto com muitos ("lê Va, Vb, Vc +37"). Clicar no nome do .py abre o código.
- Achado ao testar: ao fechar com Esc, o filtro (campo de busca) ainda dispara um "change" ao perder o foco, e a telinha já
  fechada quebrava ("Cannot read properties of null"); as respostas dela agora conferem se ela ainda está aberta.
- Prova: `validacao/tela/escolha_tela.js` 12/12 (12 CONST no circuito, 3 controladores, zoom 110 %): abre junto da linha,
  filtro, marcar os filtrados com uma gravação, desmarcar um com a telinha aberta e o filtro mantido, o resumo, Esc, o "(de
  dsp_a)" e o dono único, clique fora, o .py abre o código. controladores_tela, mensagens_tela, arvore_tela, modulos_tela,
  claude_controladores_tela, tabelas_tela verdes.

## O diagrama da arquitetura do controle (19/10, pedido de Marcelo)
- "Um diagrama de desenho para mostrar a arquitetura dos controles, tipo um flow, mostrando o que ele lê e o que sai dele,
  o que sai de um e entra no outro". O botão **◇ diagrama** (aba arquivos, ao lado de "controladores") mostra no lugar do
  código (como as tabelas; um arquivo, o ✕ ou o botão de novo voltam): à esquerda as medidas, no meio os DSPs (cada
  controlador) em colunas pela ordem das mensagens (quem só manda antes de quem recebe), com o arquivo e a cadeia de
  módulos (leitura → pll …); a medida que só um DSP de coluna posterior lê fica encostada nele (sem linha longa por baixo
  das outras caixas); as setas roxas são as mensagens (lidas do código, como nos cartões) com o que vai e a latência
  ("+1 amostra" ou "fibra 20 µs"; um rótulo só quando vai o mesmo a vários); à direita as atuações (laranja, como a
  etiqueta ⚙) com as chaves que comandam (→ IGBT.1, IGBT.2). Mais de 8 medidas (ou "todas") de um DSP viram um bloco.
  Passar o mouse num nó apaga o que não liga a ele; clicar num DSP abre o código dele. Acompanha o código e o painel.
  Encolhe para caber na largura; abaixo de 75 % fica no tamanho natural, com rolagem.
- Prova: `validacao/tela/diagrama_tela.js` 10/10 (3 DSPs sobre 6 CONST, fibra de 20 µs): colunas, medidas (a local
  encostada), 2 setas com um rótulo, atuações com o que comandam, o bloco "todas as medidas (6)", o código mudando (1 seta),
  clicar no DSP, ✕. Com a cópia do circuito e do controle dele, o desenho: Va, Vb, Vc → controle (leitura → pll) —
  theta, +1 amostra → sm_ap_1 (com vc_smap_1) e sm_an_1 (com vc_sman_1) → sm_ap_1_s, sm_an_1_s (→ IGBT.1, IGBT.2).

## Módulos compartilhados: "⇄ compartilhados" na árvore (19/10, pedido de Marcelo)
- "Um código que se repete aparece no 1º e aponta do segundo em itálico… não seria melhor um centralizador, um lugar do
  código compartilhado?" Antes, o mesmo módulo aparecia inteiro na 1ª vez e "(acima)" nas outras, como se o 1º fosse o
  dono. Agora, entre os arquivos em uso (alcançados a partir dos controladores pelos imports), o módulo que dois ou mais
  importam aparece igual em todo lugar — **⇄ em itálico, sem os filhos** — e uma vez só na seção **⇄ compartilhados**
  (embaixo, antes de "sem uso"), com o que ele importa e "usado por sm_ap_1, sm_an_1". Clicar em qualquer aparição abre o
  arquivo e realça todas. Deixa claro que o compartilhado é o CÓDIGO: cada controlador roda a sua cópia (sem memória
  comum). Os avisos "é importado por …: cada controlador tem a sua cópia" saem da lista de avisos do painel (a seção já
  diz; o Claude do PEW continua recebendo no CONTEXTO).
- No controle dele: pwm.py e escrita.py (usados por sm_ap_1 e sm_an_1) e modulacao.py (pelas duas modulações).
- Prova: `validacao/tela/arvore_tela.js` 12/12 (o pwm.py das duas modulações: ⇄ nas duas e na seção; "usado por"; o
  clique realça as 3 aparições; sem o aviso de importado por dois); modulos_tela, controladores_tela, claude_modulos_tela,
  mensagens_tela, escolha_tela, diagrama_tela, validador_tela verdes.
- **+/− do cartão** (19/10, ele: "um + para o card e a setinha para os códigos"): na linha de cada controlador, a seta
  recolhe os códigos (os módulos embaixo) e o **−/+** esconde ou mostra o cartão (lê, escreve, mensagens), cada um por
  si, guardados no navegador. `arvore_tela.js` 13/13.
- **O que vai na mensagem, num tooltip** (19/10, ele: "passar o mouse e ver o que estou enviando"): o PEW segue a
  variável do `envia("sm_ap_1", msg)` até a atribuição (`msg = {...}` e `msg["x"] = …`, antes do envia) e mostra as chaves
  ("envia theta, i_arm"); lê também o que cada DSP tira da mensagem (`msg["dados"]["theta"]` ou `.get("theta")`): a
  chave que chega e não é lida fica apagada no cartão de quem recebe. Passar o mouse na linha do cartão ou no rótulo da
  seta do diagrama mostra as linhas do código (envia e a atribuição), o que vai, quando chega e o que cada destino lê
  ("sm_ap_1 lê: theta · chega e não lê: i_arm"). `mensagens_tela.js` 6/6.

## Desativar um componente: fica no circuito, cinza (19/10, pedido de Marcelo)
- "Faltou um desabilitar… ao lado do girar, um check: preparado no circuito, mas desabilitado, na cor cinzinha". O Gecko
  tem: cada componente tem `enabled` (0 desativado, 1 ativo, 2 em curto: no lugar dele, um curto-circuito), gravado no
  .ipes como `enabledShorted`; a interface remota muda com `setParameter(nome, "enabled", v)` (o SETP do PEW); o bloco de
  controle também (NetzlisteCONTROL tira o desativado); um subcircuito desativado desativa tudo dentro.
- No painel do componente, embaixo do girar/apagar: **☐ desativado** (não aparece no terminal de subcircuito). Marcar
  manda enabled = 0; o desenho fica cinza (opacidade e sem cor), com a dica "desativado (o Gecko simula como se não
  existisse)"; desmarcar volta; Ctrl+Z volta; vai para o histórico. O servidor já tirava o desativado das contas (nós,
  fontes, chaves, CONST). O .ipes lido agora diz também `curto` (enabled 2): aparece "(em curto, no Gecko)" ao lado da
  caixinha (criar o curto pela tela ficou para depois).
- Prova: `validacao/desativar_api.py` 6/6 — **simulado**: fonte de 10 V e dois resistores de 5 Ω em paralelo, |i| = 4,0 A;
  com um desativado, 2,0 A; o arquivo com enabledShorted 0; Ctrl+Z; bloco de controle; em curto lido.
  `validacao/tela/desativar_tela.js` 7/7 (a caixinha, o cinza e a dica, Ctrl+Z, o GAIN, desmarcar, o histórico).
  giro_tela, tag_tela, sub_terminais_tela, selecao_tela, variaveis_tela, nao_salvo_api, assinatura_api verdes.

## Colar dentro de subcircuitos iguais (19/10, achado de Marcelo)
- "Por que eles estão diferentes? Se eu mexer no subcircuito, ficar todos iguais é top": o SM.ap.1 e o SM.an.1 eram
  idênticos às 18:20 (conferido nas cópias do desfazer); às 18:28 ele recortou o CONST da folha principal e colou
  (Ctrl+V) dentro do SM.ap.1 — e o colar ia só para a folha aberta, mesmo com "mudar os 2 juntos". Dali em diante eram
  diferentes, e o PEW (certo) passou a tratar o SM.ap.1 como "único".
- Agora, dentro de um SM com iguais e "mudar os N juntos" marcado, a página manda as folhas iguais (`folhas`) e o colar
  vai para todas: o MESMO nome (livre em cada uma) e a mesma posição, para continuarem iguais; um passo do desfazer.
  Colar numa folha só continua como antes (o nome livre em todo o circuito).
- Prova: `validacao/colar_sms_api.py` 5/5 (dois subcircuitos iguais, o CONST colado nos dois com o mesmo nome e a mesma
  posição, a mesma assinatura, Ctrl+Z tira dos dois, colar numa folha só como antes). biblioteca_rotulos_api,
  sub_terminais_api, copia_tela, selecao_tela, sub_novo_tela, sub_terminais_tela verdes.

## O bloco do subcircuito na folha de cima: rótulos dos bornes e o tamanho dos iguais (19/10, achados de Marcelo)
- "Uma ligação +Vcc ficou presa no SM.ap.1: apaguei o fio mas não consigo tirar do borne". Não era um fio: era a ligação
  por rótulo — no Gecko, o nó de fora de um borne é o rótulo do terminal de dentro (OUTNODE `SM.ap.1#+vSm`), e o mesmo
  rótulo é o mesmo nó, sem fio. A tela mostrava o "+Vcc" no borne, mas não deixava mudar. Agora o painel do bloco (na
  folha de cima) tem **rótulos dos bornes (o nó de fora)**: um campo por borne; apagar solta o borne, escrever um nome
  liga ao nó desse nome; vale só para este subcircuito (o igual a ele continua com o dele); vai para o histórico e o
  Ctrl+Z volta.
- "Se eles são iguais, tem que respeitar o tamanho quando muda": o tamanho do bloco (largura × altura, BlockSizeX/Y) e
  o da folha (SheetSizeX/Y) ficam no bloco, na folha de cima, onde o "mudar os N juntos" não chegava (o SM.ap.1 ficou
  4 × 5 e o SM.ap.2, 8 × 5). Agora o painel do bloco diz **☑ mudar os N iguais juntos** (o mesmo "mudar os N juntos" de
  dentro do SM, pela assinatura da folha de dentro): marcado, o tamanho vai para todos os iguais, num passo do desfazer;
  desmarcado, só ele. Se um igual estiver com outro tamanho, o aviso diz qual e **igualar a este** acerta todos.
- De quebra: o BlockSizeX/Y pelo painel de parâmetros chegava com o nome do Gecko (B maiúsculo) e o servidor não o
  reconhecia como tamanho do bloco — sem conferir os bornes juntos e sem reabrir, e o Gecko só reposiciona os bornes de
  baixo e da direita (os da esquerda ficavam no lugar velho). O servidor normaliza o nome (`normaliza`); num lote, a
  largura e a altura do mesmo bloco são conferidas uma depois da outra.
- Prova: `validacao/tela/sub_iguais_tela.js` 12/12 (o rótulo +Vcc no painel, apagar solta e o igual continua com o dele,
  escrever liga; 6 × 4 nos dois e um Ctrl+Z volta os dois; SheetSizeX nos dois; desmarcado, só ele e o aviso; igualar
  a este; BlockSizeY = 8 pelos parâmetros: os dois, e o borne da esquerda em ⌊8 · 9 / 40⌋ = 1, antes 0). move_api,
  sub_terminais_api, biblioteca_rotulos_api, colar_sms_api, sub_terminais_tela, sub_novo_tela, tag_tela, desativar_tela
  verdes.

## O PEW não trava numa janela de erro do Gecko (19/10, achado de Marcelo)
- "O PEW parece travado: não consegue copiar e colar vários componentes juntos" — e depois apagar também dava timeout.
  Ele colou a perna do MMC (6 SMs + La/Ra) abaixo da beira da folha principal (160 × 100). Para colar, o PEW grava o
  arquivo e o Gecko reabre; ao abrir, o Gecko confere se tudo cabe no tamanho gravado (`worksheetSizeX/Y`, no fim do
  arquivo) e, se não cabe, abre "There are circuit components located outside the selected sheet size…" (e depois
  "Cannot resize due to bad component location") e espera o OK — na tela escondida do Gecko do PEW (:99). O pedido ficou
  parado, e o PEW inteiro com ele (o cliente do motor ainda espera 60 s e repete). Como o tamanho não mudava, todo
  reabrir seguinte (mover em grupo, apagar, desfazer, colar) caía na mesma janela. Achado pelo jstack do motor (parado
  em `openFile`) e do Gecko (`WorksheetSize.setNewWorksheetSize` → `JOptionPane`); as janelas foram fechadas à mão
  (XTest) e o circuito dele seguiu inteiro.
- Camada 1, `abre()` no servidor: todo reabrir (os 11 `OPEN`: colar, mover/apagar em grupo, fios, acoplar, biblioteca,
  tamanho do bloco, desfazer, abrir um modelo) passa por ela; antes, a folha principal cresce para caber tudo (o ponto
  mais longe, com o bloco inteiro dos SMs, mais 6 quadrados de folga, arredondado para dezenas). Um arquivo que precisa
  crescer é aberto por uma cópia ajustada (`ajustado.ipes`; o modelo em disco não muda).
- Camada 2, a vigia do motor (`motor.py` + `janelas_gecko.py`): se um pedido ao Gecko passa de 2 s, ela olha a tela do
  Gecko a cada segundo; uma janela de erro (título Error/Warning…) é fotografada (`~/.cache/pew_simu/janelas_gecko/`,
  as últimas 20, para saber o que o Gecko disse) e fechada com OK (XTest, sem xdotool); a resposta leva `aviso_gecko`
  e a página mostra "o Gecko abriu uma janela de erro… o PEW fechou. Confira o desenho (Ctrl+Z volta)".
- A folha de um SM menor que o que tem dentro (SheetSizeX/Y) não abre janela nesta versão do Gecko (conferido: SETP e
  reabrir sem janela); fica para a vigia, se um dia abrir.
- Prova: `validacao/janela_gecko_api.py` 7/7 — colar em y = 280 numa folha de 160 × 200 responde na hora e a folha vai a
  160 × 300; mover em grupo além da direita (220 × 300); desfazer e apagar sem janela; sem a camada 1 (direto no motor de
  teste, com o servidor de teste parado uns segundos), o Gecko abre as duas janelas e a vigia fecha em 3,7 s, com as
  fotos. move_api, colar_sms_api, sub_terminais_api, biblioteca_rotulos_api, ponta_migra_api, nao_salvo_api,
  assinatura_api, desativar_api, copia_tela, selecao_tela, sub_iguais_tela verdes.

## Um sinal que o controle usa mudou de nome: o PEW pergunta (19/10, pedido de Marcelo)
- "Quando a gente muda uma variável de nome e ela está sendo usada em algum código, tem como mudar todos os lugares? Ou
  pelo menos alertar num modal e confirmar." O caso dele: os SMs passaram a se chamar SM.ap.1…SM.cn.3, as medidas e as
  atuações de dentro viraram SM_ap_1_vCSm e SM_ap_1_S (o prefixo do subcircuito + o rótulo de dentro); o código foi
  acertado, mas os cartões dos controladores ficaram com vc_smap_1 e sm_ap_1_s (os avisos "lê vc_smap_1, que não é
  medida do circuito").
- O servidor já sabia quando um medidor muda de nome (a cor e a ponta do scope acompanham, pelo identificador). Agora,
  depois de cada edição do circuito (cmd, cmds, mede, grupo, colar, fonte_sinal, fora, desfazer, biblioteca), ele compara
  os nomes das medidas (o canal do scope, o m[…]) e das atuações (CONST) pelo identificador (`nomes_por_uid`,
  `renomeados`): vale para renomear o rótulo, o componente ou o subcircuito (o prefixo), e para os N SMs iguais de uma
  vez. Se o nome de antes aparece no controle (`usos_no_controle`: no código só entre aspas — m["x"], return {"x": …},
  MEDIDA = "x" —, arquivo:linha; nos cartões dos controladores; nas atuações marcadas; nos acionamentos CONST:x), a
  resposta leva `renomeados` [{de, para, usos}].
- A página abre o modal "O controle usa o nome antigo": de → para e onde; **renomear no controle também** (guarda o que
  está no editor de código, `POST editor/controle/renomeia` com os pares, recarrega: todos de uma vez, a → b e b → c não
  viram a → c; comentários e variáveis com o mesmo nome ficam), **deixar como está** (a mensagem diz que o controle ficou
  com o nome antigo) ou **desfazer a mudança** (o Ctrl+Z do circuito). Desfazer um renomear que o controle já
  acompanhou pergunta de volta. Um sinal que o controle não usa não pergunta nada.
- Prova: `validacao/renomear_api.py` 11/11 (u1 → u_novo: código, cartão, atuações e acionamento, 4 trocas, só entre aspas;
  o que o controle não usa; o rótulo de dentro nos 2 SMs iguais dá 2 pares; o SM renomeado muda o prefixo; desfazer
  pergunta de volta; pares inválidos recusados). `validacao/tela/renomear_tela.js` 6/6 (o modal, os três botões, o
  código no editor acompanha).

## Os cartões seguem o código; o aviso é "variável do código não existe no esquema" (19/10, escolha de Marcelo)
- Os cartões do mmc_trifasico_pew ficaram com vc_smap_1 e sm_ap_1_s depois que o código passou a SM_ap_1_vCSm e
  SM_ap_1_S: "as variáveis nem existem mais". Marcar "não existe mais" no cartão foi recusado ("tem que ser algo tipo
  variável do código não existe no esquema"), e ele escolheu: **o cartão segue o código**.
- `segue_codigo(c, r)` (no painel, ao guardar, no ▷ testar e na rodada; com o circuito aberto): cada controlador sem
  instâncias em subcircuitos lê o que o código dele lê — o nome de uma medida do esquema entre aspas, fora de comentário,
  nos arquivos dele (o dele e os módulos que importa, sem os de outros controladores): m["x"], MEDIDA = "x", listas — e
  escreve o que o passo() dele escreve (`chaves_devolvidas`: {"x": …}, return f({"x": …}), dict(x=…), u["x"] = …) e existe
  como atuador; mais o que foi posto à mão (a telinha de escolha) e existe. O que não existe no esquema sai do cartão e
  das atuações marcadas sozinho, sem aviso; as atuações escritas ficam marcadas. Os avisos "lê x, que não é medida do
  circuito" e "marque x em atuações" deixam de aparecer por isso.
- Quem escreve no código é o dono: a atuação que o código de um controlador escreve sai do cartão de outro que só a tinha
  marcada à mão (dois códigos escrevendo a mesma continua erro: "escrita por dois controladores"). No cartão e na telinha
  de escolha, o que vem do código (`do_codigo` no painel) fica marcado e travado, com a dica "o código do x lê/escreve y";
  a atuação que o código de outro escreve fica travada fora ("cada atuação tem um dono só"); o resto (o que é seu) continua
  livre. Um nome montado na hora (m["i_" + "L"], {k: …}) o código não mostra: a visão local continua barrando na rodada.
  controladores_api e controladores_tela passaram a provar isso (antes: desmarcar à mão o i_L que o código lia, e mudar o
  dono de u_ctrl que o código do controle escrevia).
- `variaveis_sem_esquema(c, r)` → `sem_esquema` no painel: m["x"] (ou m[NOME] com NOME = "x" no mesmo arquivo; a linha é a
  do "x") que não é medida, e a chave que o passo() de um controlador devolve (return {"x": …} ou return f({"x": …})) que
  não é atuador. Na página: "⚠ a variável x do código (arquivo:linha) não existe no esquema" — o arquivo:linha abre o
  código ali — e **trocar por…** ("ter uma lista para tentar colocar outra"): a lista das medidas (ou atuações) do
  esquema, a mais parecida primeiro (pares de letras em comum, sem caixa nem _: vc_smap_1 ~ SM_ap_1_vCSm), com filtro;
  Enter ou duplo clique troca no código (editor/controle/renomeia: o nome entre aspas, em todos os arquivos) e o aviso sai.
- Com uma cópia do mmc_trifasico_pew dele na instância de teste: sm_ap_1 lê SM_ap_1_vCSm e escreve SM_ap_1_S, sm_an_1 lê
  SM_an_1_vCSm e escreve SM_an_1_S, sem nenhum aviso.
- Prova: `validacao/segue_codigo_api.py` 8/8 (o cartão pelo código, por NOME num módulo e por return f({…}); o posto à mão
  que existe fica, o que não existe sai; as atuações marcadas; as três variáveis sem esquema com arquivo:linha; trocar
  tira o aviso, também no módulo; a medida apagada do circuito sai dos cartões e vira aviso no código).
  `validacao/tela/sem_esquema_tela.js` 7/7 (o aviso, o cartão, o link, a lista com o mais parecido primeiro, o filtro, Enter
  troca e o editor acompanha).

## envia com o destino montado: o diagrama e os cartões ligam (19/10, achado de Marcelo)
- "Não está indo o theta do controle para os SMs… a saída está no for, aí não cria a variável para ligar… mas mostrar no
  esquema de ligar também": o controle.py (refeito pelo Claude do PEW para as 6 células) manda com
  `for k in (1, 2, 3): envia("sm_ap_%d" % k, {...})`. Na rodada isso funciona (o nome é montado e a mensagem chega), mas a
  leitura do código da página (`mensagensDe`) só reconhecia envia("nome", …) — o diagrama e os cartões ficavam sem as setas.
- `argumento()` lê o 1º argumento até a vírgula de fora (parênteses e texto); `destinosDe()` resolve: o nome escrito; "x_%d"
  % k, f"x_{k}", "x_{}".format(k) e "x_" + str(k), com os valores do último for antes (tupla, lista ou range(a, b[, passo]));
  uma variável de um for sobre nomes (ou a última atribuição de um nome); sem os valores, os controladores cujo nome casa
  com o molde (cada buraco vale qualquer trecho de letras e números). Um destino que não existe fica no cartão com o ⚠.
- Com o controle de agora dele (numa cópia): controle → sm_ap_1..3 e sm_an_1..3, com theta e i_arm, 6 setas; cada célula
  recebe do controle e lê theta e i_arm.
- Prova: `validacao/tela/envia_for_tela.js` 8/8 (as cinco formas, as chaves e a linha do código, o cartão com os destinos e
  o ⚠ dos que não existem, 9 setas). mensagens_tela, diagrama_tela, arvore_tela, escolha_tela, controladores_tela,
  claude_controladores_tela verdes.

## Sem o limite de 30 arquivos; o diagrama como no Figma (19/10, pedidos de Marcelo)
- O Claude do PEW fez a fase c (19 DSPs: o central + 18 células) e a proposta voltou "proposta inválida: até 30 arquivos no
  controle" ("naturalmente vamos ter mais de 30 arquivos… se tiver essa trava, pode tirar"). `confere_controle` aceitava até
  30 arquivos e cortava calado a lista em 50 controladores. Agora: até 1000 arquivos, até 500 controladores (com erro claro,
  sem corte calado) e o controle inteiro até 20 milhões de caracteres — limites só contra um pedido desgovernado.
- O diagrama da arquitetura ("clicar e arrastar, dar zoom + −, igual no Figma"): arrastar move (soltar em cima de um DSP
  não abre o código; clicar sem arrastar abre); a roda rola (Shift: para o lado); Ctrl + roda (ou a pinça do touchpad) dá
  zoom no ponto do mouse; na barra, − / % (clique: 100 %) / + / ajustar. Até alguém mexer, o desenho cabe inteiro e
  acompanha o código e o tamanho da tela; depois, a vista fica onde foi deixada (também ao fechar e reabrir). O SVG fica
  no tamanho dele, com translate + scale (o texto continua nítido em qualquer zoom); a conta usa a razão do zoom do PEW.
- Prova: `validacao/tela/diagrama_zoom_tela.js` 10/10 (inteiro na vista; + 25 %; Ctrl + roda com o dsp_a parado embaixo do
  mouse; arrastar −120, +60 e soltar em cima do DSP sem abrir; a roda rola; clique abre o código; a vista fica; ajustar;
  100 %). `segue_codigo_api.py` 9/9 (40 arquivos e 41 controladores aceitos). diagrama_tela, escolha_tela,
  claude_controladores_tela, envia_for_tela, controladores_api, claude_controladores_api verdes.

## Os olhos do Claude do PEW e o modo autônomo (19/10, pedido de Marcelo)
- O Claude do PEW implementou a Etapa 1 da estratégia de controle e parou pedindo "os números, que só você consegue
  ler": ele via o código e o circuito, mas não o resultado das rodadas. Marcelo: "ter os dois já pode ser vantagem".
- **Olhos** (`resumo_rodada.py`): ao fim de toda rodada (antes de dizer o estado final), o PEW grava ao lado do .npz o
  `resumo.md` — por canal: média, mín., máx., pico a pico, eficaz CA e o fasor de 50 Hz (por mínimos quadrados num número
  inteiro de ciclos; referência cosseno) na última de 5 janelas, e a média e o pico a pico em cada janela; o estado final,
  o erro e o fim da saída do controle — e `serie/<canal>.csv` (a média de cada bloco, ≈ 500 pontos, sem aliasing do
  chaveamento). Em ~1 s para 217 canais (43 KB de resumo). No pedido seguinte, a pasta do Claude recebe
  `ULTIMA_RODADA.md` e `ULTIMA_RODADA/` (a rodada mais nova), e o pedido diz qual é; as regras dizem para usar os números
  daí (Grep pelo canal) em vez de pedi-los ao usuário.
- **Modo autônomo** (o seletor "simular sozinho: não / até 3 / 5 / 10 / 20" ao lado do modelo e do esforço; volta a "não"
  ao recarregar): ao fim de cada resposta, se há uma versão nova sem erros e ele não escreveu [PRONTO], o PEW simula essa
  versão (rodada Claude_N, com o dt e o tfim da tela) **sem aplicar no controle do usuário** (`rodar(c, ctl_de_fora)`),
  põe o resumo na pasta dele e o chama de novo na mesma conversa (`--resume`): "a rodada N de M terminou… corrija e
  devolva, ou [PRONTO]". Para quando ele diz [PRONTO], quando não muda nada, quando a versão tem erros ou quando acabam as
  rodadas; o motivo aparece no chat, e as rodadas ficam no scope como Claude_1, Claude_2… A proposta final é a última
  versão (aplicar, descartar, ver a diferença, como sempre). Parar o pedido para também a rodada dele.
- **Segurança:** o Claude continua só com Read/Edit/Write/Glob/Grep nos arquivos da pasta; quem roda o código é o PEW, no
  mesmo processo à parte do "testar" e da rodada. A diferença do modo autônomo é que o código de cada versão roda sem o
  usuário olhar antes — por isso é um interruptor dele, desligado por padrão, com limite de voltas.
- Prova: `validacao/claude_autonomo_api.py` 12/12 (a rodada do usuário grava o resumo e 7 séries; o pedido seguinte leva
  ULTIMA_RODADA.md e diz qual rodada; sem o modo, uma chamada; com até 3: versão 1 → Claude_1 → ele lê o resumo → versão 2
  → Claude_2 → [PRONTO], 3 chamadas com --resume, as rodadas com Kp 3,77 e 7,54 e o do usuário em 1,885, a proposta final é
  a última versão; parar no meio da rodada Claude_1 para a rodada e não chama mais). claude_pedido_api 57/57,
  claude_controladores_api, atuacoes_modulos_api, claude_chat_tela 38/38, claude_tela, claude_controladores_tela,
  claude_modulos_tela, controle_tela verdes.

## O limite de passos e os fasores nas mensagens (20/10, achado de Marcelo)
- "Aprovei porque ele não conseguiu terminar e deu erro… esses 30 passos?!": a Etapa 3 do MMC (26 arquivos) estourou o
  `--max-turns 30` que o PEW passava ao CLI; o Claude parou no meio, o modo autônomo nem chegou a simular, e a proposta
  parcial aplicada dava no teste `TypeError: float() argument must be … not 'tuple'` no `envia`.
- **Limite:** `CLAUDE_PASSOS = 100` passos por chamada e `CLAUDE_PRAZO` de 40 min. No modo autônomo, quando a chamada
  chega ao limite no meio da versão, o PEW chama de novo na mesma conversa ("continue de onde parou", até 3 vezes
  seguidas) em vez de parar; quando ele termina, simula como sempre.
- **Mensagens:** o `envia` só aceitava `{nome: número}`, e a estratégia (e o md) manda fasores. Agora cada valor é um
  número, `None` (sem valor ainda) ou uma lista curta de números (até 64): o fasor vai como `(re, im)` e chega como
  `[re, im]`; texto ou dicionário dentro dão erro claro. O transporte entre os processos já era JSON.
- Prova: `claude_autonomo_api.py` 14/14 (+ o limite: continua de onde parou, termina, Claude_1, [PRONTO]; 100 passos por
  chamada); `controladores_api.py` (+ fasor, None e número chegam; texto dá erro claro); claude_pedido_api 57/57 (as
  opções com 100 passos), teste_passo2, rede_tela, mensagens_tela, claude_chat_tela verdes.
