<p align="center"><img src="app/public/marca/maisim-logo.svg" alt="MaiSim" width="360"></p>

# MaiSim

**Plataforma aberta de simulação e controle de eletrônica de potência, com IA.** *(Open-source power electronics
simulation and control platform.)*

O MaiSim roda no navegador, na sua máquina, com o [GeckoCIRCUITS](https://github.com/geckocircuits/GeckoCIRCUITS) como
motor de simulação. Você monta o circuito, escreve o controle em Python, roda e mede, e pode pedir ajuda a uma IA
(Claude Code ou Google Antigravity) que enxerga o circuito, o controle e as rodadas.

| Peça | O que faz | Documentação |
|---|---|---|
| **simu** (`/maisim/simu`) | o editor do circuito (paleta, fios, subcircuitos, variáveis globais), o controle em Python amostrado a cada Ts, as rodadas e a conversa com a IA | [`simu/LEIA.md`](simu/LEIA.md), [`simu/GUIA_CONTROLE.md`](simu/GUIA_CONTROLE.md) |
| **scope** (`/maisim/scope`) | os gráficos das rodadas: ao vivo, comparar duas rodadas, seções e painéis, visões exportáveis | [`scope/LEIA.md`](scope/LEIA.md) |
| **gecko** (`/maisim/gecko`) | o GeckoCIRCUITS de verdade numa tela virtual, aberto no navegador (noVNC) | [`gecko/LEIA.md`](gecko/LEIA.md) |
| **app** | a página inicial e o menu lateral (Vite), que encaminha para as outras peças; instalável como app (PWA) | [`app/public/marca/LEIA.md`](app/public/marca/LEIA.md) |

Os exemplos prontos estão em [`exemplos/`](exemplos/) (controle PI, PWM e três células meia-ponte em cascata, com subcircuitos).

## Requisitos

Linux (testado no Ubuntu 22.04 e no WSL2):

- **Python 3** com **numpy**;
- **Java 11 (JDK)**, **Maven** e **git**, para montar o GeckoCIRCUITS;
- **Node.js 22**, para a página;
- a tela virtual e o noVNC: `xvfb x11vnc novnc websockify x11-utils libxtst6` (e `openbox`, opcional, para as janelas
  do Gecko terem borda e abrirem maximizadas).

```bash
sudo apt install -y python3 python3-numpy openjdk-11-jdk maven git xvfb x11vnc novnc websockify x11-utils libxtst6 openbox
```

A IA é opcional: o [Claude Code](https://claude.com/claude-code) (`claude`) e/ou o Google Antigravity instalados. O
login é feito pela própria tela do MaiSim e fica numa pasta separada (`~/.claude-maisim`, `~/.agy-maisim`), sem mexer
no seu login de sempre.

## Instalar e abrir

```bash
git clone https://github.com/marcelopedroso/maisim.git && cd maisim
gecko/construir.sh            # o GeckoCIRCUITS original num commit fixo + o patch do MaiSim → gecko/build/gecko-lote.jar
npm ci --prefix app           # a página
cd app && npm run maisim      # sobe tudo; Ctrl+C derruba o que ele subiu
```

Abra **http://localhost:7100**. As portas (7100–7106, só em `localhost`) e as pastas ficam em
[`config/padrao.env`](config/padrao.env); para mudar algo na sua máquina, crie um `.env` na raiz só com o que muda.

O que é seu (circuitos, subcircuitos, rodadas, contextos da IA) fica em `~/.local/share/maisim`; o que dá para refazer
(estado do editor, conversas, registros, o Gecko), em `~/.cache/maisim`.

## Testes e contribuição

Tudo entra por PR, com os testes rodando no GitHub Actions (os de API em Python e os de tela com o Playwright, numa
instância de teste isolada). O fluxo, a versão e como rodar os testes na sua máquina estão em
[`CONTRIBUTING.md`](CONTRIBUTING.md) e em [`simu/validacao/LEIA.md`](simu/validacao/LEIA.md).

## Licença

[GNU GPL v3](LICENSE). Autor: Marcelo Pedroso.

## Créditos

- **[GeckoCIRCUITS](https://github.com/geckocircuits/GeckoCIRCUITS)** (GPLv3): o simulador de circuitos por trás do
  MaiSim. O `gecko/construir.sh` baixa o original num commit fixo e aplica o patch de [`gecko/patches/`](gecko/patches/)
  (a leitura e a escrita em lote pela interface remota); o código dele não está neste repositório.
- **[KaTeX](https://katex.org)** (MIT): as equações nas respostas da IA, em [`simu/static/katex/`](simu/static/katex/)
  com a licença dele.
- **[noVNC](https://novnc.com)** (MPL 2.0) e **websockify** (LGPLv3), do sistema: a tela do Gecko no navegador.
- **[Vite](https://vite.dev)** (MIT): o servidor da página. **[Playwright](https://playwright.dev)** (Apache 2.0): os
  testes de tela.
- **IA:** o MaiSim chama os programas oficiais do [Claude Code](https://claude.com/claude-code) (Anthropic) e do Google
  Antigravity, sem modificá-los; cada um segue os próprios termos de uso. O MaiSim não é afiliado a nenhuma dessas
  empresas.
- **Marca:** ideia e direção de Marcelo Pedroso, desenho feito com o Claude ([`app/public/marca/`](app/public/marca/)).
