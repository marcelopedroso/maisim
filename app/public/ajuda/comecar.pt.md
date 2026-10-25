# Primeiros passos no MaiSim

O MaiSim une o desenho de circuitos em eletrônica de potência, a simulação em tempo real, o projeto de controle digital em Python e uma IA embarcada no seu fluxo de trabalho.

## O caminho de uso

1. **Escolha ou monte um circuito:** na página inicial ou pelo botão **Abrir** do [editor de circuitos](#ajuda:simu), abra um dos exemplos prontos ou crie um circuito novo na folha em branco.
2. **Configure a simulação:** ajuste o passo de cálculo $\Delta t$, o tempo final e o nome da rodada no botão de configurações (**⚙**).
3. **Simule e visualize:** clique em **▶** (ou tecle **Ctrl+Enter**) para simular; acompanhe as curvas e faça medições ao vivo no [Scope](#ajuda:scope).
4. **Escreva o controle digital:** abra a aba [Controle](#ajuda:codigo) para programar controladores em Python com amostragem em $T_s$, atuando nos blocos do circuito.
5. **Consulte o Claude:** use o assistente de [IA](#ajuda:ia) para revisar códigos de controle, tirar dúvidas sobre o circuito ou propor ajustes numéricos.

## Onde os arquivos ficam gravados

- **Seus circuitos:** salvos na sua pasta de usuário (`~/.local/share/maisim/circuitos/`).
- **Rodadas de simulação:** guardadas com os dados numéricos e gráficos em `~/.local/share/maisim/rodadas/`.
- **Biblioteca de subcircuitos:** modelos reutilizáveis ficam em `~/.local/share/maisim/subcircuitos/`.
- **Conta de IA:** a autenticação do Claude fica isolada em `~/.claude-maisim/`.

## Veja também

- [Página inicial](#ajuda:inicio)
- [Editor de circuitos](#ajuda:simu)
- [Controle em Python](#ajuda:codigo)
- [Scope e medições](#ajuda:scope)
- [O Claude do MaiSim](#ajuda:ia)
- [Atalhos de teclado](#ajuda:atalhos)
