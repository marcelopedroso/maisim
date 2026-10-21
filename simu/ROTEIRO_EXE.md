# Roteiro: o PEW como programa portátil para Windows (.exe)

*Proposta de 18/10/2026. Objetivo: entregar o PEW (simu, scope, controle e, opcionalmente, o Claude do PEW) à comunidade
de eletrônica de potência como um programa que se baixa e roda no Windows, sem WSL, sem Node e sem instalar Python ou
Java à parte.*

## 1. Motivação

Hoje o PEW roda no WSL e o navegador, no Windows. A ponte entre os dois (`wslrelay`, no modo de rede NAT) derruba
conexões de tempos em tempos: em 18/10 foram "Failed to fetch" ao apagar, o trilho que não carregou e, por fim, o
próprio canal (vsock) do WSL fora do ar, resolvido só com `wsl --shutdown`. O modo de rede espelhado
(`networkingMode=mirrored`), tentado em 19/10, tirou o `wslrelay` do caminho mas quebrou o Gecko do PEW: a ponte e o
motor não conectaram ao RMI dele em localhost:43050 ("Connection timed out"); voltou-se ao NAT (causa a investigar antes
de tentar de novo). Para outras pessoas, pedir WSL, Node, Python e Java é a barreira: um .exe portátil a remove e, de
quebra, tira a ponte do caminho — é o argumento mais forte para este roteiro.

## 2. Escopo da primeira versão pública

| Entra | Fica de fora (por ora) |
|---|---|
| /pew/simu: editor, paleta, subcircuitos, biblioteca, variáveis $, desfazer | os seminários e a página de apresentações do pew-app |
| /pew/scope: rodadas, medição, espectro, comparação | /pew/gecko (a tela remota do Gecko; já saiu do trilho) |
| controle em Python (vários controladores, janela do código) | a co-simulação do run.py e os lotes da tese (continuam no WSL) |
| Claude do PEW **opcional**: só se o usuário tiver o Claude Code instalado e a própria conta | qualquer credencial embutida; o PEW nunca lê nem guarda credencial |
| exemplos: buck com PI, buck com PWM no Python, fonte trifásica com variáveis $ | interface em inglês (fase posterior: i18n) |

## 3. Arquitetura alvo

```
PEW.exe (lançador, ícone na bandeja)
 ├─ python\ (Python embutido + numpy)
 │    └─ servidor do PEW numa porta só (127.0.0.1, porta livre escolhida ao subir)
 │         ├─ /pew/simu   (servidor.py de hoje)
 │         ├─ /pew/scope  (o scope, no mesmo processo ou repassado)
 │         ├─ /            (a página inicial, build estático do React)
 │         └─ controladores: um processo Python por instância (controle_worker.py)
 ├─ jre\ (Java 8, Temurin) ─ Gecko (jar do fork, janela escondida) + PewMotor (RMI, 127.0.0.1)
 └─ web\ (build estático: React, Monaco, marked, uPlot — tudo local, funciona offline)
Janela: Edge em modo aplicativo (msedge --app=http://127.0.0.1:<porta>/pew/simu/), sem barra de endereço
Dados do usuário: Documentos\PEW (circuitos, controles, rodadas); %LOCALAPPDATA%\PEW (estado, desfazer, logs)
```

Ordem de grandeza (estimativas, a medir na fase 4):

| Peça | Disco |
|---|---|
| Python embutido + numpy | ~60 MB |
| JRE 8 + jar do Gecko (44 MB, medido) | ~150 MB |
| front estático (React, Monaco, uPlot, marked) | ~10 MB |
| **total descompactado / zip** | **~220 MB / ~100 MB** |

Memória: sem a máquina virtual do WSL, sem Xvfb, x11vnc e noVNC; ficam o Gecko (~300 MB), os servidores (~100 MB) e a
janela do Edge.

## 4. Licenças e marcas (decidir antes de publicar)

- **GeckoCIRCUITS é GPLv3** (LICENSE do MDPGeckoCIRCUITS; uso comercial é com a Gecko-Research). Distribuir o jar exige
  oferecer o código-fonte do fork; o PewMotor é compilado contra as classes do Gecko e, portanto, também GPLv3. O
  caminho simples: **publicar o PEW inteiro sob GPLv3**, com o fork no GitHub. Conferir com quem entende de licenças
  antes do primeiro release.
- Demais peças: Python (PSF), numpy (BSD), Temurin (GPLv2 + Classpath Exception), Monaco, uPlot e marked (MIT):
  compatíveis; listar todas num `TERCEIROS.md` com os textos das licenças.
- **Claude Code não vai no pacote**: é do usuário, instalado por ele, com a conta dele; o PEW só o chama se existir.
  Conferir os termos de uso do Claude Code para esse modo (o PEW chama `claude -p` em nome do usuário). Sem logotipo nem
  marca da Anthropic na interface (regra que já vale).

## 5. Fases

Estimativas em dias de trabalho concentrado (palpite, revisar ao fim de cada fase). Cada fase termina com a bateria de
testes verde no ambiente da fase.

| Fase | Entrega | Critério de pronto | Estimativa |
|---|---|---|---|
| **0. Decisões** | licença, nome, escopo do 1.0 público, pasta dos dados | §4 e §7 respondidos | 0,5 |
| **1. Código sem Linux** | servidores rodando no Windows com Python e Java "à mão" | simu, scope, Gecko e controle funcionando no Windows; sem `setsid`, `killpg`, `xwininfo`, `ss` | 2–3 |
| **2. Gecko escondido** | Gecko sem janela à vista e sem diálogo que trave | patch no fork (bandeira de janela oculta; diálogos registrados e respondidos), no lugar do Xvfb e do `xwininfo` | 1–2 |
| **3. Uma porta, offline** | o servidor Python serve tudo (sem Vite e sem Node); Monaco e marked locais; dados em Documentos\PEW | PEW completo sem internet, numa porta só | 1–2 |
| **4. Pacote portátil** | `PEW.exe` (lançador pequeno, Go ou Rust) + Python embutido + JRE + web | zip descompactado roda num Windows limpo; fechar o PEW encerra tudo (Job Object do Windows) | 1–2 |
| **5. Claude opcional** | o ✦ aparece só com o Claude Code instalado; login pelo CLI oficial | sem o CLI, o PEW funciona inteiro e explica como ativar | 0,5–1 |
| **6. Testes no Windows** | a bateria (Playwright) rodando no Windows e no GitHub Actions (windows-latest) | bateria verde no CI a cada commit | 2 |
| **7. Distribuição** | GitHub Releases: zip portátil + soma SHA-256; depois instalador (Inno Setup) | guia de instalação, primeiro circuito, os 3 exemplos, GUIA_CONTROLE | 1–2 |

**Marcos.** *Alfa* (fases 1–4): só o Marcelo usa o .exe no dia a dia. *Beta* (fases 5–6): 3 a 5 colegas do laboratório,
com um formulário de problemas. *1.0 público* (fase 7): release no GitHub e anúncio.

**Total estimado:** 9 a 14 dias de trabalho.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| SmartScreen e antivírus barrando um .exe sem assinatura | lançador pequeno (Go/Rust, não PyInstaller); assinatura de código (há programas gratuitos para código aberto, ex.: SignPath) |
| diálogo modal do Gecko travando sem ninguém ver | fase 2: o fork registra e responde os diálogos; o servidor avisa na tela |
| caminhos com espaço e acento (C:\Users\Usuário…) | testes da fase 6 rodam num usuário com acento |
| porta ocupada no Windows | porta livre escolhida ao subir; o lançador abre a janela na porta certa |
| dois mundos (PEW no Windows, tese no WSL) | um clone do repositório em cada lado, sincronizados pelo git; o `smauto` instalado no Python do PEW quando um controle o importar |
| interface só em português | i18n (pt/en) depois do 1.0; os textos já estão concentrados no front |

## 7. Decisões em aberto (do Marcelo)

1. A licença (GPLv3 para o PEW inteiro?) e onde o código público vai morar (repositório próprio do PEW?).
2. O nome do pacote e o ícone (o diodo com o brilho, de `pew-app/public/marca`).
3. O Claude do PEW entra no 1.0 público ou fica para depois?
4. A janela: Edge em modo aplicativo (simples) ou Tauri (janela própria, mais trabalho)?
5. Quem são os primeiros testadores do beta?
