"""Os nomes das peças escondidas do Gecko (instância de teste 7201; patch gecko/patches/0002-nomes-ocultos.patch). A
relutância não linear (NLRel) tem duas fontes "U" escondidas; o Gecko original as registrava como U.1 e U.2 e depois as
renomeava por fora do registro: os dois nomes ficavam "em uso" para sempre (com a NLRel na folha, depois de apagá-la e
até depois de um circuito novo), e criar uma fonte U.1 dava "The component name is already in use". Achado da vistoria
dos componentes (24/10). Confere: com a NLRel na folha, U.1 e U.2 entram; depois do Novo, U.1 entra de novo."""
import json, urllib.request
B = "http://localhost:7201/maisim/simu/"
def api(rota, corpo=None):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(q, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda *a: api("editor/cmd", {"op": "CREATE", "args": list(a)}).get("erro") or "ok"
api("editor/novo", {"modo": "descartar"})
r = c("NLRel.1", 20, 16, "NLRel")
ok(r == "ok", f"a relutância não linear entra: {r}")
r1, r2 = c("U.1", 10, 10, "U"), c("U.2", 10, 20, "U")
ok(r1 == "ok" and r2 == "ok", f"com a NLRel na folha, U.1 e U.2 entram (as fontes escondidas dela não guardam esses nomes): {r1} · {r2}")
api("editor/novo", {"modo": "descartar"})
r = c("U.1", 10, 10, "U")
ok(r == "ok", f"depois do Novo, U.1 entra de novo: {r}")
api("editor/novo", {"modo": "descartar"})
print(f"\n{3 - falhas}/3")
raise SystemExit(1 if falhas else 0)
