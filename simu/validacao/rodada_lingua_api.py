"""O nome padrão da rodada e o circuito novo no idioma (instância de teste: simu 7201, scope 7202), achado de Marcelo em 30/10
ao gravar o vídeo em inglês: com tudo em inglês, a rodada se chamava "rodada" e o scope mostrava "MaiSim / simu · novo (sem
arquivo) · rodada · …". Confere: rodar sem nome com o cookie en → a rodada "run"; com pt → "rodada"; e a lista do scope com o
circuito novo como "new (no file)" (en) e "novo (sem arquivo)" (pt) — o meta continua com a marca de sempre."""
import json, time, urllib.request
B, SC = "http://localhost:7201/maisim/simu/", "http://localhost:7202/"
def api(rota, corpo=None, lingua="pt", base=B):
    h = {"Content-Type": "application/json", "Cookie": f"maisim-lingua={lingua}"}
    req = urllib.request.Request(base + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers=h)
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
def cmd(op, *a): return api("editor/cmd", {"op": op, "args": list(a)})
api("editor/novo", {"modo": "descartar"})
cmd("CREATE", "U.1", 4, 10, "U"); cmd("SETP", "U.1", "uDC", 12.0); cmd("CREATE", "R.1", 10, 10, "R")
api("editor/fio", {"acao": "novo", "cantos": [[4, 8], [4, 6], [10, 6], [10, 8]], "dom": "LK", "rotulo": ""})
api("editor/fio", {"acao": "novo", "cantos": [[4, 12], [4, 14], [10, 14], [10, 12]], "dom": "LK", "rotulo": ""})
cmd("CREATE", "AMP.1", 16, 10, "AMP"); cmd("OUTNODE", "AMP.1", 0, "i_R1"); api("editor/mede", {"nome": "AMP.1", "tipo": "I", "componente": "R.1"})
def roda(lingua):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": "1e-4", "amostras": "100"}, lingua=lingua)
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.3); j = api("editor/rodada", lingua=lingua)
    return j
en, pt = roda("en"), roda("pt")
ok(en.get("nome") == "run" and "_run" in str(en.get("arquivo")), f"sem nome, em inglês: a rodada {en.get('nome')!r} ({en.get('arquivo')})")
ok(pt.get("nome") == "rodada" and "_rodada" in str(pt.get("arquivo")), f"sem nome, em português: a rodada {pt.get('nome')!r}")
def rotulo(arq, lingua):
    return next((x["rotulo"] for x in api("rodadas", lingua=lingua, base=SC) if x["arq"] == arq), None)
re_, rp = rotulo(en.get("arquivo"), "en"), rotulo(en.get("arquivo"), "pt")
ok(re_ and "new (no file)" in re_ and "novo (sem arquivo)" not in re_, f"o scope em inglês: {re_!r}")
ok(rp and "novo (sem arquivo)" in rp, f"o scope em português: {rp!r}")
meta = json.loads(str(__import__("numpy").load(en["arquivo"], allow_pickle=True)["meta"]))
ok(meta.get("modelo") == "novo (sem arquivo)", f"o meta guarda a marca de sempre: {meta.get('modelo')!r}")   # i18n-ok (a marca)
print(f"\n{'tudo certo' if not falhas else f'{falhas} falha(s)'}")
raise SystemExit(1 if falhas else 0)
