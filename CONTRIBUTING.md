# Como o código entra no MaiSim

1. **Sempre por PR.** Todo trabalho num ramo (`git switch -c <assunto>`), enviado com `git push -u origin <assunto>` e
   aberto como PR para o `main` (`gh pr create --fill`). Nunca push direto no `main`: a proteção do ramo no GitHub barra
   (PR obrigatório, a verificação obrigatória, vale também para administradores, histórico linear, sem force-push), e o
   gancho `.githooks/pre-push` avisa antes, na máquina (ative uma vez por cópia: `git config core.hooksPath .githooks`).
2. **A verificação de cada PR** (`.github/workflows/verificacao.yml`): o GitHub Actions sobe a instância de teste (o
   GeckoCIRCUITS numa tela virtual, o simulador, o scope, a página) e roda o conjunto rápido dos testes
   (`simu/validacao/ci.sh rapido`: os offline e o essencial de API e de tela, com o Playwright). Passou → o próprio
   Actions junta o PR no `main` (squash: um commit por PR) e apaga o ramo. Não junta sozinho: PR em rascunho, PR com o
   rótulo `nao-juntar`, e PR de quem não é o dono do repositório (esse espera a revisão). O merge vale só para o commit
   que foi testado. Um rascunho que fica pronto roda a verificação de novo (e é juntado se passar).
   **O Codex revisa cada PR** (o app do ChatGPT no GitHub): os comentários dele são respondidos no próprio PR —
   corrigidos no ramo, ou explicado por que não — e a conversa é resolvida. Antes de juntar, o Actions espera a revisão
   do Codex terminar e não junta com conversa aberta (`.github/scripts/espera_codex.py`; a proteção do `main` também
   exige as conversas resolvidas). Se o job "juntar no main" falhar por isso: resolva as conversas e rode o job de novo
   (ou envie a correção no ramo, que roda a verificação inteira outra vez).
3. **Depois do merge, a bateria inteira** (`.github/workflows/bateria.yml`, `simu/validacao/ci.sh completo`: tela, API,
   offline e o scope ao vivo). Se falhar, abre um issue com o link dos registros e das fotos.
4. **Versão:** o arquivo `VERSION` ([SemVer](https://semver.org/lang/pt-BR/)). Um PR que muda o `VERSION`, depois do
   merge e da bateria verde, vira a tag `vX.Y.Z` e uma Release no GitHub com as notas geradas dos PRs.

## Os testes na sua máquina

```bash
simu/validacao/sobe_teste.sh          # a instância de teste (portas 7200–7206, perfil config/teste.env)
simu/validacao/ci.sh rapido           # o que a verificação de um PR roda (~10 min)
simu/validacao/ci.sh completo         # a bateria inteira (~70 min)
simu/validacao/ci.sh inicio_tela      # só os testes dados
simu/validacao/desce_teste.sh         # derruba a instância de teste
```

Os testes rodam só na instância de teste, nunca no MaiSim de uso (7100): as IAs são as de mentira
(`simu/validacao/*_falso.py`) e as pastas são descartáveis (`~/.cache/maisim_teste`). O `claude_tela` (o link do login de
verdade do Claude) roda só na máquina, não no Actions.
