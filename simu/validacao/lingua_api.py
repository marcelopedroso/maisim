"""O servidor do simu nos dois idiomas (o MaiSim bilíngue, 24/10/2026) — instância de teste (7201). Sem o cookie
maisim-lingua, português, como sempre; com maisim-lingua=en, inglês. O que a página confere vem num código, igual nos dois
idiomas (o texto muda; o código não)."""
import json
import urllib.request

B = "http://localhost:7201/maisim/simu/"
falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


def api(rota, corpo=None, lingua=None):
    h = {"Content-Type": "application/json"}
    if lingua:
        h["Cookie"] = f"tema=claro; maisim-lingua={lingua}"
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers=h)
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read())}


try:
    # um circuito salvo; salvar de novo com o mesmo nome, sem "sobrescrever": o servidor pergunta
    api("editor/abrir", {"arq": "exemplos/exemplo_buck.ipes", "modo": "descartar"})
    api("editor/salvar", {"nome": "lingua_teste", "pasta": "circuitos", "sobrescrever": True})
    pt = api("editor/salvar", {"nome": "lingua_teste", "pasta": "circuitos"})
    en = api("editor/salvar", {"nome": "lingua_teste", "pasta": "circuitos"}, lingua="en")
    pt2 = api("editor/salvar", {"nome": "lingua_teste", "pasta": "circuitos"}, lingua="pt")
    ok(pt.get("ERRO") == 409 and pt.get("codigo") == "confirmar" and "já existe" in pt.get("erro", "") and pt.get("pergunta", "").endswith("lingua_teste.ipes."),
       f"sem cookie, português: \"{pt.get('erro')}\" (código {pt.get('codigo')}, pergunta \"{pt.get('pergunta')}\")")
    ok(en.get("codigo") == "confirmar" and "already exists" in en.get("erro", "") and en.get("pergunta", "").endswith("already exists."),
       f"com maisim-lingua=en (e outro cookie junto), inglês: \"{en.get('erro')}\" — o mesmo código")
    ok(pt2.get("erro") == pt.get("erro"), "com maisim-lingua=pt, o mesmo português de sem cookie")
    # um cookie malformado de outro programa do localhost não esconde o nosso
    req = urllib.request.Request(B + "editor/salvar", data=json.dumps({"nome": "lingua_teste", "pasta": "circuitos"}).encode(),
                                 headers={"Content-Type": "application/json", "Cookie": 'outro={"x":1}; maisim-lingua=en'})
    try:
        urllib.request.urlopen(req, timeout=60)
        ruim = {}
    except urllib.error.HTTPError as e:
        ruim = json.loads(e.read())
    ok("already exists" in ruim.get("erro", ""), f"um cookie malformado antes do nosso: continua em inglês (\"{ruim.get('erro')}\")")
finally:
    api("editor/abrir", {"arq": "exemplos/exemplo_buck.ipes", "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
