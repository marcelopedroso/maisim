# MaiSim / simu — monte e simule circuitos

O simu é o editor de circuitos do MaiSim: você monta o circuito no navegador, escreve o controle em Python, simula e vê
as medidas no scope. Quem simula é o GeckoCIRCUITS (o "cérebro"): cada edição na tela vira um pedido ao próprio Gecko,
que aplica e grava o `.ipes`.

Este é o guia de uso. O controle tem um guia próprio, o [`GUIA_CONTROLE.md`](GUIA_CONTROLE.md) (também no botão **?**
do painel Controle), e o diário de como tudo foi feito, com as decisões e os testes, está no
[`HISTORICO.md`](HISTORICO.md).

## Subir e abrir

- Com o MaiSim inteiro: `cd app && npm run maisim` e abra **http://localhost:7100/maisim/simu/** (ou pelo menu lateral,
  cartão "Simu: monte e simule").
- Só o simu: `python3 simu/servidor.py` (da raiz do projeto) e abra http://localhost:7101/maisim/simu/.

As portas e as pastas ficam em [`config/padrao.env`](../config/padrao.env).

## O circuito

- **Abrir** mostra os circuitos em grupos: os exemplos do repositório ([`exemplos/`](../exemplos/)), os seus
  (`~/.local/share/maisim/circuitos`), a biblioteca de subcircuitos e, se o GeckoCIRCUITS foi baixado, os exemplos dele.
- **Arquivo ›** novo circuito, salvar (disquete ou Ctrl+S; o pontinho laranja indica mudança não salva), salvar como….
  Um exemplo do repositório não é gravado por cima: ele vai para os seus circuitos com Salvar como.
- **Editar:** a paleta (as abas do Gecko e a busca) põe componentes na folha; arrastar move, R gira, Delete apaga,
  Shift seleciona vários, Ctrl+C / Ctrl+X / Ctrl+V copiam, recortam e colam, e dá para desfazer. Selecionar mostra o
  painel do componente: nome, parâmetros, ligações (mesmo rótulo, mesmo nó, como no Gecko), o que um medidor mede, e o
  check de desativar (o componente fica no circuito, cinza).
- **Fios:** puxados de um terminal a outro; os rótulos de nó ligam pontos distantes.
- **Subcircuitos:** clicar num subcircuito abre a folha de dentro (editando, o clique seleciona e o duplo clique abre;
  Esc volta). Um subcircuito selecionado pode ir para a
  **biblioteca** (salvar na biblioteca…) e ser posto em outros circuitos pela aba Biblioteca da paleta. Mudanças dentro
  de um subcircuito valem para todos os iguais.
- **Variáveis globais ($)** (Simulação › variáveis globais): um parâmetro ligado a `$La` vale o da variável, como no Gecko.

## Simular

- **▶** (ou Ctrl+Enter) simula; **⚙** ao lado define Δt, tempo final, nome da rodada e amostras guardadas. Espaço pausa
  e continua. Enquanto roda, o circuito não aceita edição.
- Os sinais são as saídas dos medidores e dos blocos de controle (nome = rótulo da saída; dentro de um subcircuito, com
  o nome dele na frente). Eles aparecem ao vivo no scope, que abre ao lado ou embaixo, na mesma janela.
- Cada rodada fica em `~/.local/share/maisim/rodadas/<data>_<nome>/`, com o circuito exato, o `.npz` do scope e um
  `resumo.md` (média, pico a pico, eficaz, fasor de cada canal). No scope, o **Comparar** põe duas rodadas lado a lado.

## O controle em Python

O painel **Controle** (aba ao lado do scope, botão `</>`) liga um código Python à simulação, amostrado a cada Ts:

```python
def iniciar(p, e):          # uma vez, antes da 1ª amostra
    e["integral"] = 0.0


def passo(t, m, p, e):      # a cada Ts
    erro = p["i_ref"] - m["i_L"]
    e["integral"] += erro * p["Ts"]
    u = p["Kp"] * erro + p["Ki"] * e["integral"]
    scope("u", u)           # manda uma variável sua para o scope
    return {"u_ctrl": u}    # atuações: {atuador: valor}
```

- `m` são as medidas (os mesmos nomes do scope), `p` os parâmetros do painel (ganhos, referências, `p["Ts"]`), `e` o
  estado que você guarda entre amostras. As **atuações** são os blocos CONST do circuito marcados no painel.
- No painel: Ts, o **atraso da atuação** (logo, na amostra seguinte, ou uma latência), os parâmetros e os
  **acionamentos** no tempo (um degrau de carga ou de referência, por exemplo).
- **Arquivos:** um circuito novo já vem como um DSP, `leitura.py` → `controle.py` → `escrita.py`. Um `.py` que não é
  controlador é um módulo (quem importa chama, na mesma amostra).
- **Vários controladores:** cada controlador roda num processo à parte, com as medidas que lê e as atuações que escreve,
  ou uma instância por subcircuito. Eles conversam por mensagens (`envia(para, dados)`, `recebe()`), com a latência da
  rede. O **◇ diagrama** mostra quem lê o quê, quem manda para quem e o que sai.
- O código vai junto com o circuito, em `<modelo>.controle.json` ao lado do `.ipes`.

Como o tempo funciona (a linha do tempo de uma amostra, Ts × Δt, PWM no código) e os cuidados estão no
[`GUIA_CONTROLE.md`](GUIA_CONTROLE.md).

## Exemplos

Em [`exemplos/`](../exemplos/), abertos pelo **Abrir**:

- `exemplo_controle_pi.ipes`: PI de corrente num RL;
- `exemplo_controle_pwm.ipes`: buck com PWM de 5 kHz e PI, o PWM feito no código;
- em malha aberta, com o PWM no próprio circuito (portadora triangular + comparador; a razão cíclica num CONST, sem código) e
  os medidores nomeados para o scope: `exemplo_buck.ipes` (48 V → 24 V), `exemplo_boost.ipes` (24 V → 48 V),
  `exemplo_buck_boost.ipes` (24 V → −24 V), `exemplo_ponte_h_cc.ipes` (quatro quadrantes, um motor CC simples),
  `exemplo_inversor_meia_ponte.ipes`, `exemplo_inversor_ponte_completa.ipes` e `exemplo_inversor_trifasico.ipes` (SPWM),
  `exemplo_retificador_monofasico.ipes` (ponte com filtro capacitivo), `exemplo_retificador_trifasico.ipes` (ponte de 6
  diodos) e `exemplo_retificador_trifasico_controlado.ipes` (6 tiristores; α pela variável `$t_alfa` = α/(360·f)).
  Montados por `validacao/exemplos_monta.py` e conferidos com a teoria por `validacao/exemplos_api.py`.

Os exemplos não usam subcircuitos da biblioteca (o de células em cascata, que usava o SM-HB do MMC, saiu em 22/10; a
cópia congelada para os testes fica em `validacao/dados/`). Um exemplo não se salva por cima: o "salvar" vira "salvar como".

Os exemplos que vêm com o GeckoCIRCUITS ficam fora do **Abrir** (nem todos rodam no MaiSim); `MAISIM_EXEMPLOS_GECKO=1` (em
`config/` ou no `.env`) os mostra.

## O Claude do MaiSim

O botão **✦** no cabeçalho faz o login (Claude Code ou Google Antigravity), numa pasta só do MaiSim (`~/.claude-maisim`,
`~/.agy-maisim`), sem tocar no seu login de sempre. Na aba Controle, o botão **Claude** abre a conversa: ele vê o
circuito, as medidas, as atuações, o código e os números da última rodada, e propõe mudanças no controle (código,
parâmetros, acionamentos, módulos e controladores). Nada muda sem você aplicar: dá para ver a diferença, aplicar ou
descartar. Ele não mexe no circuito; se faltar algo, diz o que montar.

O modo **simular sozinho** (até 3, 5, 10 ou 20 rodadas, desligado por padrão) deixa que ele simule cada versão, leia o
resultado e corrija, até dizer que terminou.

## Testes

Os testes do simu (API e tela) estão em [`validacao/`](validacao/LEIA.md); como rodar, no
[`CONTRIBUTING.md`](../CONTRIBUTING.md).
