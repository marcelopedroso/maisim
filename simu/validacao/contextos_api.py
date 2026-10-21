"""Os contextos salvos (instância de teste 7201, claude de mentira), Marcelo em 21/10 ("um botãozinho para salvar isso na
memória não volátil… usar em outras conversas"): salvar a conversa (a nota de quem salva, a conversa, o controle e a rodada; sem resumo pela IA),
listar, ler, renomear, usar numa conversa nova (a pasta recebe contextos/<id>/ e o pedido cita), salvar uma conversa
anterior (que o "nova" deixou), exportar e importar o .maisimctx (e recusar um malicioso), apagar. Nada no repositório."""
import base64, io, json, os, subprocess, time, urllib.request, zipfile
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py"), "suba o servidor de teste com o claude de mentira (reinicia_servidor_teste.sh)"
CONF, CTX = Path(ENV["MAISIM_CLAUDE_DIR"]), Path(ENV.get("MAISIM_CONTEXTOS", ""))
assert "maisim_teste" in str(CTX), f"a pasta dos contextos tem de ser a da instância de teste (veio {CTX})"
CASA, SALVOS = Path(ENV["MAISIM_SIMU_CACHE"]) / "claude", Path(ENV["MAISIM_SALVOS"])
REPO = Path(__file__).resolve().parents[2]


def api(rota, corpo=None, cru=False):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-MaiSim": "1"})
    try:
        r = urllib.request.urlopen(req, timeout=180).read()
        return r if cru else json.loads(r)
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


def chamadas_falso(com_cwd=False):
    f = CONF / "falso_chamadas.jsonl"
    cs = [json.loads(x) for x in f.read_text().splitlines()] if f.exists() else []
    return cs if com_cwd else [c["args"] for c in cs]


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def espera(seg=120):
    for _ in range(int(seg / 0.4)):
        e = api("claude/pedido")
        if not e.get("andamento"):
            return e
        time.sleep(0.4)
    return e


git_antes = subprocess.run(["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True).stdout
dados = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    (SALVOS / f).write_bytes((dados / f).read_bytes())
(CONF / "falso_logado").write_text("")
ids = []
try:
    api("editor/abrir", {"arq": str(SALVOS / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    api("claude/nova", {})
    r = api("claude/contexto/salvar", {"titulo": "vazia"})
    ok(r.get("ERRO") == 409 and "vazia" in r.get("erro", ""), f"conversa vazia: não salva ({r.get('erro')})")
    (CONF / "falso_cenario").write_text("ganho")
    api("claude/pedir", {"texto": "dobre o Kp", "dt": 1e-6, "tfim": 0.002})
    e = espera()
    sid1 = api("claude/contextos")["conversa"]
    resumo = "## O que lembrar\nKp dobrado; $i_L$ em 10 A."
    ok(api("claude/contexto/resumo", {}).get("ERRO") == 404, "sem o pedido de resumo que aparecia na conversa (a rota antiga saiu; o resumo pela IA agora é à parte, abaixo)")
    r = api("claude/contexto/salvar", {"titulo": "Buck: Kp dobrado", "etiquetas": "buck, kp", "resumo": resumo})
    cid = r.get("id", "")
    ids.append(cid)
    d = CTX / cid
    meta = json.loads((d / "meta.json").read_text()) if (d / "meta.json").exists() else {}
    conv_md = (d / "conversa.md").read_text() if (d / "conversa.md").exists() else ""
    ctx_md = (d / "contexto.md").read_text() if (d / "contexto.md").exists() else ""
    ok(cid and meta.get("titulo") == "Buck: Kp dobrado" and meta.get("etiquetas") == ["buck", "kp"] and meta.get("ia") == "claude"
       and meta.get("modelo") == "claude-falso" and meta.get("pedidos") == 1 and meta.get("circuito", "").endswith("exemplo_controle_pwm.ipes"),
       f"salvo em {d}: {json.dumps({k: meta.get(k) for k in ('titulo', 'etiquetas', 'circuito', 'ia', 'modelo', 'pedidos', 'autor')}, ensure_ascii=False)}")
    ok(ctx_md.startswith("# Buck: Kp dobrado") and "## O que lembrar" in ctx_md and "dobre o Kp" in conv_md
       and (d / "controle" / "controle.py").exists() and (d / "controle" / "controle.json").exists() and (d / "rodada" / "resumo.md").exists()
       and not (d / "anexos").exists(), "contexto.md (título e a nota), conversa.md (o pedido), controle/ e rodada/; sem anexos")
    lst = api("claude/contextos")
    um = api(f"claude/contexto?id={cid}")
    ok(any(x["id"] == cid and x["tem"]["controle"] for x in lst["contextos"]) and um.get("meta", {}).get("id") == cid and "## O que lembrar" in um.get("contexto", ""),
       f"listar ({len(lst['contextos'])} contexto(s)) e ler")
    r = api("claude/contexto/mudar", {"id": cid, "titulo": "Buck — Kp dobrado (rev)", "etiquetas": ["buck"]})
    ok(r.get("titulo") == "Buck — Kp dobrado (rev)" and (d / "contexto.md").read_text().startswith("# Buck — Kp dobrado (rev)"),
       "renomear: o meta e o contexto.md")
    # usar numa conversa nova
    api("claude/nova", {})
    r = api("claude/contexto/usar", {"id": cid, "usar": True})
    sid2 = api("claude/contextos")["conversa"]
    ok(r.get("conversa", {}).get("contextos") == [{"id": cid, "titulo": "Buck — Kp dobrado (rev)"}]
       and (CASA / "conversas" / sid2 / "contextos" / cid / "contexto.md").exists(), "usar numa conversa nova: marcado e copiado para contextos/<id>/")
    (CONF / "falso_cenario").write_text("le_contexto")
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    api("claude/pedir", {"texto": "continue daquele contexto", "dt": 1e-6, "tfim": 0.002})
    e = espera()
    resp = e["conversa"]["historico"][-1].get("resposta", "")
    cham = [json.loads(x) for x in (CONF / "falso_chamadas.jsonl").read_text().splitlines() if "stream-json" in x]
    prompt = cham[-1]["args"][cham[-1]["args"].index("-p") + 1] if cham else ""
    ok(resp == "li os contextos: Buck — Kp dobrado (rev)" and f"contextos/{cid}/contexto.md" in prompt,
       f"a IA da conversa nova lê o contexto (o pedido cita contextos/{cid}/contexto.md): {resp!r}")
    # a conversa anterior (a do sid1, deixada pelo "nova")
    ant = api("claude/contextos")["anteriores"]
    ok(any(x["id"] == sid1 and x["pedidos"] == 1 and x["primeiro"] == "dobre o Kp" for x in ant), f"conversas anteriores: {len(ant)} (a primeira está lá)")
    r = api("claude/contexto/salvar", {"conversa": sid1, "titulo": "a conversa antiga", "resumo": "só a conversa"})
    cid2 = r.get("id", "")
    ids.append(cid2)
    m2 = json.loads((CTX / cid2 / "meta.json").read_text()) if cid2 else {}
    ok(cid2 and m2.get("conversa") == sid1 and "dobre o Kp" in (CTX / cid2 / "conversa.md").read_text() and not (CTX / cid2 / "rodada").exists(),
       "salvar uma conversa anterior: a conversa dela (sem a rodada de agora; controle só o da última proposta aplicada)")
    # exportar e importar de volta
    z = api(f"claude/contexto/exportar?id={cid}&anexos=1", cru=True)
    nomes = sorted(zipfile.ZipFile(io.BytesIO(z)).namelist()) if isinstance(z, bytes) else []
    r = api("claude/contexto/importar", {"nome": f"{cid}.maisimctx", "dados": base64.b64encode(z).decode()})
    cid3 = r.get("id", "")
    ids.append(cid3)
    m3 = json.loads((CTX / cid3 / "meta.json").read_text()) if cid3 else {}
    iguais = cid3 and all((CTX / cid / n.split("/", 1)[1]).read_bytes() == (CTX / cid3 / n.split("/", 1)[1]).read_bytes()
                          for n in nomes if not n.endswith("meta.json"))
    ok(cid3 and cid3 != cid and iguais and m3.get("importado", {}).get("arquivo") == f"{cid}.maisimctx",
       f"exportar ({len(nomes)} arquivos) e importar de volta: {cid3}, igual, com a origem no meta")
    ruim = io.BytesIO()
    with zipfile.ZipFile(ruim, "w") as zz:
        zz.writestr("x/meta.json", json.dumps({"titulo": "mal"})); zz.writestr("x/contexto.md", "# mal"); zz.writestr("x/../../fora.txt", "!")
    r1 = api("claude/contexto/importar", {"nome": "mal.maisimctx", "dados": base64.b64encode(ruim.getvalue()).decode()})
    r2 = api("claude/contexto/importar", {"nome": "nada.maisimctx", "dados": base64.b64encode(b"isto nao e zip").decode()})
    ok(r1.get("ERRO") == 409 and "inválido" in r1.get("erro", "") and r2.get("ERRO") == 409 and not (CTX.parent / "fora.txt").exists(),
       f"importar um .maisimctx malicioso ou que não é zip: recusado ({r1.get('erro')} | {r2.get('erro')})")
    # o resumo pela IA, opcional, depois de salvar e invisível (Marcelo, 21/10: "invisível… mas SEM RISCO de falha")
    (CONF / "falso_resumo_lento").write_text("2")
    (CONF / "falso_cenario").write_text("ganho")
    (CONF / "falso_chamadas.jsonl").unlink(missing_ok=True)
    n_hist = len(api("claude/pedido")["conversa"]["historico"])
    r = api("claude/contexto/salvar", {"conversa": sid1, "titulo": "com resumo pela IA", "resumo": "nota", "resumo_ia": True})
    cid4 = r.get("id", ""); ids.append(cid4)
    m4 = json.loads((CTX / cid4 / "meta.json").read_text()) if cid4 else {}
    dobro = api("claude/contexto/resumo_ia", {"id": cid4})
    time.sleep(0.6)
    uso_durante = [a for a in chamadas_falso() if "/usage" in a]
    api("claude/uso?forca=1")
    time.sleep(0.3)
    ok(m4.get("resumo_ia", {}).get("estado") == "gerando" and dobro.get("ERRO") == 409 and len([a for a in chamadas_falso() if "/usage" in a]) == len(uso_durante),
       f"salvar com o resumo pela IA: salvo na hora, o resumo \"gerando\" em segundo plano; pedir de novo enquanto gera: recusado; o uso não chama o claude ({dobro.get('erro')})")
    for _ in range(60):
        m4 = json.loads((CTX / cid4 / "meta.json").read_text())
        if m4.get("resumo_ia", {}).get("estado") != "gerando":
            break
        time.sleep(0.5)
    res_ia = (CTX / cid4 / "resumo_ia.md").read_text() if (CTX / cid4 / "resumo_ia.md").exists() else ""
    ctx4 = (CTX / cid4 / "contexto.md").read_text()
    cham = [c for c in chamadas_falso(True) if "Resuma a conversa do MaiSim guardada nesta pasta" in " ".join(c["args"])]
    ok(m4.get("resumo_ia", {}).get("estado") == "pronto" and "li conversa.md: 1 pedido(s)" in res_ia and "## Resumo pela IA" in ctx4 and "### Objetivo" in ctx4
       and len(api("claude/pedido")["conversa"]["historico"]) == n_hist and cham and cham[0]["cwd"] == str(CTX / cid4)
       and "--no-session-persistence" in cham[0]["args"] and cham[0]["args"][cham[0]["args"].index("--tools") + 1] == "Read,Glob,Grep",
       f"o resumo pronto: em resumo_ia.md e no contexto.md (seção \"Resumo pela IA\"); invisível (a conversa continua com {n_hist}); só leitura, sem sessão, na pasta do contexto")
    (CONF / "falso_cenario").write_text("resumo_falha")
    api("claude/contexto/resumo_ia", {"id": cid4})
    for _ in range(60):
        r4 = json.loads((CTX / cid4 / "meta.json").read_text()).get("resumo_ia", {})
        if r4.get("estado") != "gerando":
            break
        time.sleep(0.5)
    ok(r4.get("estado") == "falhou" and "529" in r4.get("erro", "") and (CTX / cid4 / "conversa.md").exists(),
       f"o resumo falhou (529): o contexto continua inteiro, a biblioteca mostra \"falhou\" ({r4.get('erro')})")
    (CONF / "falso_cenario").write_text("ganho")
    api("claude/contexto/resumo_ia", {"id": cid4})
    for _ in range(60):
        r4 = json.loads((CTX / cid4 / "meta.json").read_text()).get("resumo_ia", {})
        if r4.get("estado") != "gerando":
            break
        time.sleep(0.5)
    ok(r4.get("estado") == "pronto", "gerar de novo: pronto")
    (CONF / "falso_resumo_lento").unlink(missing_ok=True)
    # apagar: some da biblioteca e da conversa que o usava
    api("claude/contexto/apagar", {"id": cid})
    e = api("claude/pedido")
    ok(not (CTX / cid).exists() and e["conversa"]["contextos"] == [] and not any(x["id"] == cid for x in api("claude/contextos")["contextos"]),
       "apagar: some da biblioteca e da conversa que o usava")
    ids.remove(cid)
    git_depois = subprocess.run(["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True).stdout
    ok(git_depois == git_antes and not (Path.home() / ".local/share/maisim/contextos" / cid2).exists(), "nada no repositório nem na pasta de contextos de verdade")
finally:
    for i in ids:
        if i:
            api("claude/contexto/apagar", {"id": i})
    for f in ("falso_logado", "falso_cenario", "falso_resumo_lento"):
        (CONF / f).unlink(missing_ok=True)
    api("claude/descartar", {})
    api("claude/nova", {})
raise SystemExit(1 if falhas else 0)
