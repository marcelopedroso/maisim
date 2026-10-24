<p align="center"><img src="app/public/marca/maisim-logo.svg" alt="MaiSim" width="360"></p>

# MaiSim

[English](README.md) | **Português**

**Plataforma aberta de simulação e controle de eletrônica de potência, com IA.**

O MaiSim roda no seu navegador, na sua máquina, com o [GeckoCIRCUITS](https://github.com/geckocircuits/GeckoCIRCUITS)
como motor de simulação. Você monta o circuito, escreve o código de controle em Python, simula e mede, e pode pedir a
um assistente de IA (Claude Code ou Google Antigravity) que vê o circuito, o código de controle e as rodadas.

> A interface é em português e em inglês: na primeira vez segue o idioma do navegador, e o botão PT/EN no pé do menu
> lateral troca.

| Módulo | O que faz | Documentação |
|---|---|---|
| **simu** (`/maisim/simu`) | o editor de circuitos (paleta, fios, subcircuitos, variáveis globais), o controle em Python amostrado a cada Ts, as rodadas e a conversa com a IA | [`simu/LEIA.md`](simu/LEIA.md), [`simu/GUIA_CONTROLE.md`](simu/GUIA_CONTROLE.md) |
| **scope** (`/maisim/scope`) | os gráficos das rodadas: ao vivo, comparar duas rodadas, seções e painéis, vistas exportáveis | [`scope/LEIA.md`](scope/LEIA.md) |
| **gecko** (`/maisim/gecko`) | a janela do GeckoCIRCUITS de verdade, numa tela virtual, aberta no navegador (noVNC) | [`gecko/LEIA.md`](gecko/LEIA.md) |
| **app** | a página inicial e o menu lateral (Vite), que levam aos outros módulos; instalável como aplicativo (PWA) | [`app/public/marca/LEIA.md`](app/public/marca/LEIA.md) |

Exemplos prontos ficam em [`exemplos/`](exemplos/): buck, boost, buck-boost, ponte H CC, inversores em meia ponte, em
ponte completa e trifásico, retificadores monofásico, trifásico e trifásico controlado (em malha aberta, com os medidores
prontos), e o controle digital (PI de corrente; buck com o PWM e o PI no código).

## Requisitos

Linux (testado no Ubuntu 22.04 e no WSL2):

- **Python 3** com **numpy**;
- **Java 11 (JDK)**, **Maven** e **git**, para construir o GeckoCIRCUITS;
- **Node.js 22**, para a página;
- a tela virtual e o noVNC: `xvfb x11vnc novnc websockify x11-utils libxtst6` (mais o `openbox`, opcional, para as
  janelas do Gecko terem borda e abrirem maximizadas).

```bash
sudo apt install -y python3 python3-numpy openjdk-11-jdk maven git xvfb x11vnc novnc websockify x11-utils libxtst6 openbox
```

A IA é opcional: instale o [Claude Code](https://claude.com/claude-code) (`claude`) e/ou o Google Antigravity. O login
é feito pela própria tela do MaiSim e fica numa pasta separada (`~/.claude-maisim`, `~/.agy-maisim`), sem mexer no seu
login de sempre.

## Instalar e rodar

```bash
git clone https://github.com/marcelopedroso/maisim.git && cd maisim
gecko/construir.sh            # o GeckoCIRCUITS original num commit fixo + o patch do MaiSim → gecko/build/gecko-lote.jar
npm ci --prefix app           # a página
cd app && npm run maisim      # sobe tudo; Ctrl+C derruba o que ele subiu
```

Abra **http://localhost:7100**. As portas (7100–7106, só `localhost`) e as pastas ficam em
[`config/padrao.env`](config/padrao.env); para mudar algo na sua máquina, crie um `.env` na raiz do repositório só com
o que muda.

Os seus dados (circuitos, subcircuitos, rodadas, contextos da IA) ficam em `~/.local/share/maisim`; o que dá para
refazer (estado do editor, conversas, registros, Gecko), em `~/.cache/maisim`.

## Testes e como contribuir

Tudo entra por pull request, com os testes rodando no GitHub Actions (testes de API em Python e de tela com o
Playwright, numa instância de teste isolada). O fluxo, as versões e como rodar os testes na sua máquina estão no
[`CONTRIBUTING.md`](CONTRIBUTING.md) (em inglês) e no [`simu/validacao/LEIA.md`](simu/validacao/LEIA.md).

## Licença

[GNU GPL v3](LICENSE). Autor: Marcelo Pedroso.

## Créditos

- **[GeckoCIRCUITS](https://github.com/geckocircuits/GeckoCIRCUITS)** (GPLv3): o simulador de circuitos por trás do
  MaiSim. O `gecko/construir.sh` baixa o original num commit fixo e aplica o patch de [`gecko/patches/`](gecko/patches/)
  (leitura e escrita em lote pela interface remota); o código-fonte dele não faz parte deste repositório.
- **[KaTeX](https://katex.org)** (MIT): as equações nas respostas da IA, em [`simu/static/katex/`](simu/static/katex/)
  com a licença dele.
- **[noVNC](https://novnc.com)** (MPL 2.0) e **websockify** (LGPLv3), do sistema: a tela do Gecko no navegador.
- **[Vite](https://vite.dev)** (MIT): o servidor da página. **[Playwright](https://playwright.dev)** (Apache 2.0): os
  testes de tela.
- **IA:** o MaiSim chama os programas oficiais [Claude Code](https://claude.com/claude-code) (Anthropic) e Google
  Antigravity, sem modificação; cada um segue os próprios termos de uso. O MaiSim não tem vínculo com nenhuma dessas
  empresas.
- **Logo:** conceito e direção de Marcelo Pedroso, desenhado com o Claude ([`app/public/marca/`](app/public/marca/)).
