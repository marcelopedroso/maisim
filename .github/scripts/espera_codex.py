#!/usr/bin/env python3
"""Antes de o Actions juntar um PR (job "juntar" da verificacao.yml): espera a revisão do Codex terminar e recusa o
merge enquanto houver conversa aberta no PR.

- O Codex mantém no PR um comentário-resumo com o estado da revisão (<!-- codex-review-state:v1 {...} -->). Enquanto
  ele diz "running", espera. Terminou → segue.
- Sem resumo do Codex depois de SEM_CODEX segundos da abertura do PR → segue (o Codex não está revisando este PR).
- Ainda "running" depois de LIMITE segundos → segue sem ela, com um aviso (o Codex às vezes fica preso em "running";
  os testes são a trava de verdade, e o que ele comentar depois vira um PR de correção).
- Por fim, conta as conversas abertas (review threads não resolvidas). Alguma → falha com a lista: corrija ou responda e
  resolva cada uma, depois rode de novo o job "juntar no main". A proteção do main ("conversation resolution") barraria
  o merge de qualquer jeito; aqui a mensagem fica clara.

Usa o gh (GH_TOKEN) e as variáveis PR e GITHUB_REPOSITORY.
"""
import html
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

CODEX = "chatgpt-codex-connector[bot]"
ESTADO = re.compile(r"<!-- codex-review-state:v1 (\{.*?\}) -->", re.S)
INTERVALO = 20
SEM_CODEX = 5 * 60
LIMITE = 10 * 60

REPO = os.environ["GITHUB_REPOSITORY"]
PR = os.environ["PR"]


def gh(*args):
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def estado_codex():
    """O estado da revisão no comentário-resumo do Codex, ou None se ele ainda não comentou."""
    comentarios = json.loads(gh("api", "--paginate", "--slurp", f"repos/{REPO}/issues/{PR}/comments"))
    for c in reversed([c for pagina in comentarios for c in pagina]):
        if c["user"]["login"] != CODEX:
            continue
        m = ESTADO.search(html.unescape(c["body"] or ""))
        if m:
            return json.loads(m.group(1))
    return None


def rodando(estado):
    return any((estado.get(k) or {}).get("status") == "running" for k in ("code_review", "security_review"))


def conversas_abertas():
    dono, nome = REPO.split("/")
    consulta = """query($dono: String!, $nome: String!, $pr: Int!) {
      repository(owner: $dono, name: $nome) { pullRequest(number: $pr) {
        reviewThreads(first: 100) { nodes { isResolved path line comments(first: 1) { nodes { author { login } body } } } }
      } } }"""
    r = json.loads(gh("api", "graphql", "-f", f"query={consulta}", "-F", f"dono={dono}", "-F", f"nome={nome}",
                      "-F", f"pr={PR}"))
    fios = r["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
    return [f for f in fios if not f["isResolved"]]


def main():
    aberto = json.loads(gh("api", f"repos/{REPO}/pulls/{PR}"))["created_at"]
    aberto = datetime.fromisoformat(aberto.replace("Z", "+00:00"))
    inicio = time.monotonic()
    while True:
        estado = estado_codex()
        desde_abertura = (datetime.now(timezone.utc) - aberto).total_seconds()
        if estado is None and desde_abertura > SEM_CODEX:
            print(f"codex: nenhuma revisão do Codex neste PR em {SEM_CODEX // 60} min — segue sem ela")
            break
        if estado is not None and not rodando(estado):
            cr = estado.get("code_review") or {}
            print(f"codex: revisão terminada ({cr.get('status')}, commit {str(cr.get('commit_sha'))[:7]})")
            break
        if time.monotonic() - inicio > LIMITE:
            print(f"::warning::o Codex ainda está revisando depois de {LIMITE // 60} min — segue sem esperar por ele")
            break
        print("codex: revisando…" if estado else "codex: esperando o resumo da revisão…", flush=True)
        time.sleep(INTERVALO)

    abertas = conversas_abertas()
    if abertas:
        print(f"::error::{len(abertas)} conversa(s) aberta(s) no PR — corrija ou responda e resolva cada uma, depois "
              "rode de novo o job \"juntar no main\":")
        for f in abertas:
            c = (f["comments"]["nodes"] or [{}])[0]
            autor = (c.get("author") or {}).get("login", "?")
            primeira = next((l for l in (c.get("body") or "").splitlines() if l.strip()), "")[:160]
            print(f"  - {f['path']}:{f['line']} ({autor}) {primeira}")
        return 1
    print("conversas: nenhuma aberta — pode juntar")
    return 0


if __name__ == "__main__":
    sys.exit(main())
