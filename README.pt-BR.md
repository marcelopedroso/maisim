<p align="center"><img src="app/public/marca/maisim-logo.svg" alt="MaiSim" width="360"></p>

# MaiSim

[English](README.md) | **Português**

[![verify](https://github.com/marcelopedroso/maisim/actions/workflows/verify.yml/badge.svg)](https://github.com/marcelopedroso/maisim/actions/workflows/verify.yml) [![full suite](https://github.com/marcelopedroso/maisim/actions/workflows/full-suite.yml/badge.svg?branch=main)](https://github.com/marcelopedroso/maisim/actions/workflows/full-suite.yml)

**Plataforma aberta de simulação e controle de eletrônica de potência, com IA.**

O MaiSim roda no seu navegador, na sua máquina, com o [GeckoCIRCUITS](https://github.com/geckocircuits/GeckoCIRCUITS)
como motor de simulação. Você monta o circuito, escreve o código de controle em Python, simula e mede, e pode pedir a
um assistente de IA (Claude Code) que vê o circuito, o código de controle e as rodadas.

> A interface é em português e em inglês: na primeira vez segue o idioma do navegador, e o botão PT/EN no pé do menu
> lateral troca.

| Módulo | O que faz | Documentação |
|---|---|---|
| **simu** (`/maisim/simu`) | o editor de circuitos (paleta, fios, subcircuitos, variáveis globais), o controle em Python amostrado a cada Ts, as rodadas e a conversa com a IA | [`simu/LEIA.md`](simu/LEIA.md), [`simu/GUIA_CONTROLE.md`](simu/GUIA_CONTROLE.md) |
| **scope** (`/maisim/scope`) | os gráficos das rodadas: ao vivo, comparar duas rodadas, seções e painéis, vistas exportáveis | [`scope/LEIA.md`](scope/LEIA.md) |
| **gecko** (`/maisim/gecko`) | a janela do GeckoCIRCUITS de verdade, numa tela virtual, aberta no navegador (noVNC) | [`gecko/LEIA.md`](gecko/LEIA.md) |
| **app** | a página inicial e o menu lateral (servidos pelo Python, `app/pagina.py`), que levam aos outros módulos; instalável como aplicativo (PWA) | [`app/public/marca/LEIA.md`](app/public/marca/LEIA.md) |

Exemplos prontos ficam em [`exemplos/`](exemplos/): buck, boost, buck-boost, ponte H CC, inversores em meia ponte, em
ponte completa e trifásico, retificadores monofásico, trifásico e trifásico controlado (em malha aberta, com os medidores
prontos), e o controle digital (PI de corrente; buck com o PWM e o PI no código).

## Baixar

| | |
|---|---|
| **Windows** (instalador) | [**MaiSim-Setup.exe**](https://github.com/marcelopedroso/maisim/releases/latest/download/MaiSim-Setup.exe) |
| **Linux** (AppImage, sem instalar) | [**MaiSim-x86_64.AppImage**](https://github.com/marcelopedroso/maisim/releases/latest/download/MaiSim-x86_64.AppImage) |
| Versões anteriores e de teste (`-rc`) | [Releases](https://github.com/marcelopedroso/maisim/releases) |

Cada arquivo tem o seu `.sha256` ao lado, na página de Releases. Vai tudo dentro (Python, Java, GeckoCIRCUITS): depois de
baixar, não precisa de internet nem de instalar mais nada.

- **Windows 10 (1809+) ou 11, 64 bits**, cerca de 250 MB, Edge ou Chrome; instala só para o seu usuário, **sem
  administrador**. Instalar uma versão nova por cima da antiga atualiza e mantém os seus circuitos e configurações. O
  instalador ainda não tem assinatura de código: se o SmartScreen avisar, escolha **Mais informações → Executar assim
  mesmo**.
- **Linux x86_64** (glibc 2.17+) com o Xvfb (`sudo apt install xvfb`): `chmod +x MaiSim-x86_64.AppImage` e execute.
- **IA (opcional):** uma conta Claude. No Windows, o MaiSim instala o Claude Code para você, pela janela de contas da IA.

Os seus circuitos e rodadas ficam numa pasta à vista: `Documentos\MaiSim` no Windows (dá para escolher outra ao
instalar), `~/MaiSim` no Linux.

Para mexer no código, rode a partir do código-fonte (abaixo).

## Rodar a partir do código-fonte (para programadores)

### Requisitos

Linux (testado no Ubuntu 22.04 e no WSL2):

- **Python 3** com **numpy**;
- **Java 11 (JDK)**, **Maven** e **git**, para construir o GeckoCIRCUITS;
- **Node.js 22** só para rodar os testes de tela (a página é servida pelo Python, `app/pagina.py`);
- a tela virtual e o noVNC: `xvfb x11vnc novnc websockify x11-utils libxtst6` (mais o `openbox`, opcional, para as
  janelas do Gecko terem borda e abrirem maximizadas).

```bash
sudo apt install -y python3 python3-numpy openjdk-11-jdk maven git xvfb x11vnc novnc websockify x11-utils libxtst6 openbox
```

O MaiSim trabalha com a IA instalada no seu computador (opcional): o [Claude Code](https://claude.com/claude-code)
(`claude`). O login é feito pela própria tela do MaiSim e fica numa pasta separada (`~/.claude-maisim`), sem mexer no
seu login de sempre. Outras IAs (por exemplo, um modelo local) podem vir depois.

### Instalar e rodar

```bash
git clone https://github.com/marcelopedroso/maisim.git && cd maisim
simu/vendor.sh                # o editor de código (Monaco) aqui, para o MaiSim funcionar sem internet
gecko/construir.sh            # o GeckoCIRCUITS original num commit fixo + o patch do MaiSim → gecko/build/gecko-lote.jar
app/scripts/maisim.sh --abrir # sobe tudo e abre a janela do MaiSim (ou: cd app && npm run abrir)
```

Com `--abrir` ele usa o mesmo lançador do instalador do Windows e do AppImage (`app/lancador.py`): fechar a última janela
do MaiSim desliga o MaiSim uns 20 s depois (nunca no meio de uma rodada; o Gecko fica se houver circuito sem salvar), e
rodar de novo com o MaiSim no ar só abre a janela outra vez. No WSL a janela abre no Chrome ou no Edge do Windows
(`MAISIM_NAVEGADOR` escolhe outro navegador, com opções). Sem `--abrir` (`npm run maisim`, ou `app/scripts/sobe_fundo.sh`
em segundo plano) o MaiSim fica no ar até o Ctrl+C (ou `app/scripts/para_fundo.sh`), com a janela aberta ou não;
`MAISIM_PAGINA=vite` serve a página pelo Vite nesse modo.

Abra **http://localhost:7100**. Para usar outra porta, passe com `-p`: `npm run maisim -- -p 8100` serve a página na 8100
e os outros serviços nas portas logo depois (8101–8106). Para ficar de vez com outra porta, uma linha num `.env` na raiz:
`MAISIM_PORTA=8100` (útil quando a 7100 já está em uso na sua máquina). As portas (7100–7106 por padrão, só `localhost`) e as pastas ficam
em [`config/padrao.env`](config/padrao.env); para mudar de vez na sua máquina, crie um `.env` na raiz do repositório só
com o que muda.

Os seus dados (circuitos, subcircuitos, rodadas, contextos da IA) ficam em `~/.local/share/maisim`; o que dá para
refazer (estado do editor, conversas, registros, Gecko), em `~/.cache/maisim`.

## Levar um circuito para outra máquina

Na página inicial, **Exportar**, na linha de um circuito, grava um arquivo `<nome>.msd`: o circuito (com os subcircuitos),
o controle, a aparência e o layout padrão do scope, e as rodadas que você marcar (nenhuma por padrão; o tamanho estimado
aparece antes). **Importar…**, no cabeçalho de Circuitos, lê um `.msd` em qualquer MaiSim (Windows, WSL ou Linux), mostra
o que vem e, se o nome já existe, sugere `<nome>_2` (substituir pede confirmação). As rodadas chegam ligadas ao circuito
importado. Um `.msd` é um zip com um `manifest.json` que lista cada arquivo com o SHA-256; nada é gravado se algum não conferir.

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
- **[Vite](https://vite.dev)** (MIT): o servidor da página na versão de programador (`npm run maisim`). **[Playwright](https://playwright.dev)** (Apache 2.0): os
  testes de tela.
- **IA:** o MaiSim chama o programa oficial [Claude Code](https://claude.com/claude-code) (Anthropic), sem modificação;
  ele segue os próprios termos de uso. O MaiSim não tem vínculo com a Anthropic.
- **Logo:** conceito e direção de Marcelo Pedroso, desenhado com o Claude ([`app/public/marca/`](app/public/marca/)).
