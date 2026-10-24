"""O servidor do simu nos dois idiomas (o MaiSim bilíngue, 24/10/2026) — instância de teste (7201). Sem o cookie
maisim-lingua, português, como sempre; com maisim-lingua=en, inglês. O que a página confere vem num código, igual nos dois
idiomas (o texto muda; o código não)."""
import json
import urllib.request
from pathlib import Path

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
    arq = pt.get("pergunta", "")[len("já existe "):-1]
    ok(pt.get("ERRO") == 409 and pt.get("codigo") == "confirmar" and pt.get("erro") == f"já existe {arq}; confirme para sobrescrever"
       and arq.endswith("lingua_teste.ipes"),
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
    # a biblioteca de subcircuitos: o mesmo código ao salvar por cima de um que existe
    # (a máquina do GitHub começa sem nenhum: um arquivo qualquer na biblioteca de teste basta — o "já existe" vem antes)
    LIB = Path.home() / ".cache/maisim_teste/subcircuitos"
    LIB.mkdir(parents=True, exist_ok=True)
    (LIB / "lingua_lib.ipes").write_bytes((Path(__file__).resolve().parents[2] / "exemplos/exemplo_buck.ipes").read_bytes())
    lib = next((m for m in api("modelos") if m.get("id_grupo") == "subcircuitos" and m["nome"] == "lingua_lib.ipes"), None)
    if lib:
        nome_lib = lib["nome"].removesuffix(".ipes")
        bpt = api("editor/biblioteca", {"acao": "salvar", "nome": "x", "folha": "0", "nome_lib": nome_lib})
        ben = api("editor/biblioteca", {"acao": "salvar", "nome": "x", "folha": "0", "nome_lib": nome_lib}, lingua="en")
        ok(bpt.get("codigo") == ben.get("codigo") == "confirmar" and bpt.get("erro") == f"já existe {nome_lib} na biblioteca; confirme para sobrescrever"
           and ben.get("pergunta") == f"{nome_lib} already exists in the library.", f"biblioteca: \"{bpt.get('erro')}\" / \"{ben.get('pergunta')}\"")
    else:
        ok(False, "biblioteca: nenhum subcircuito na instância de teste para conferir")
    # os grupos da lista de circuitos: um id que não muda com o idioma
    ids = {m.get("id_grupo") for m in api("modelos")}
    ok({"exemplos", "circuitos"} <= ids, f"os grupos da lista com id ({sorted(i for i in ids if i)})")
finally:
    api("editor/abrir", {"arq": "exemplos/exemplo_buck.ipes", "modo": "descartar"})
    for suf in (".ipes", ".controle.json", ".aparencia.json", ".scope.json"):   # o circuito que o teste salvou
        (Path.home() / ".cache/maisim_teste/circuitos" / f"lingua_teste{suf}").unlink(missing_ok=True)
    (Path.home() / ".cache/maisim_teste/subcircuitos/lingua_lib.ipes").unlink(missing_ok=True)
raise SystemExit(1 if falhas else 0)
