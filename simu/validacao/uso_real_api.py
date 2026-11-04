"""Uso real: um subcircuito da biblioteca com os nomes de sempre (R.1, D.1, GATE.1, GATE.2, CONST.1) posto em cada exemplo
(instância de teste do perfil config/teste.env). Marcelo (04/11): o SM-HB-falha da biblioteca, com GATE.1 e GATE.2 dentro,
travou os GATE de fora ("Name ambiguousness error", patch 0013) — e nenhum teste juntava um circuito de verdade com um
subcircuito da biblioteca. Para cada exemplo: inserir o subcircuito; toda peça da folha principal com o mesmo nome de uma de
dentro gira (e o desfazer volta) e tem os parâmetros lidos; a de dentro, pelo caminho (SUBCIRCUIT.k#nome), também."""
import json, re, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def config(chave, padrao):                               # do perfil de teste (config/teste.env)
    try:
        m = re.search(rf"^{chave}=(\S+)", (RAIZ / "config/teste.env").read_text(), re.M)
        return m.group(1) if m else padrao
    except OSError:
        return padrao


B = f"http://localhost:{config('MAISIM_PORTA_SIMU', '7201')}/maisim/simu/"
LIB = "uso_real_lib_t"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def erro(r):
    return r.get("erro") if isinstance(r, dict) and "ERRO" in r else (None if isinstance(r, (dict, list)) else str(r))


try:
    # o subcircuito da biblioteca, com os nomes que todo circuito tem
    api("editor/novo", {"modo": "descartar"})
    r = api("editor/cmds", {"cmds": [{"op": "CREATE", "args": ["SUBCIRCUIT.1", 10, 10, "SUBCIRCUIT"]}] +
                            [{"op": "CREATE", "args": [f"SUBCIRCUIT.1#{n}", x, 6, t]} for n, x, t in
                             (("R.1", 6, "R"), ("D.1", 12, "D"), ("GATE.1", 18, "GATE"), ("GATE.2", 24, "GATE"), ("CONST.1", 30, "CONST"))]})
    s = api("editor/biblioteca", {"acao": "salvar", "nome": "SUBCIRCUIT.1", "folha": "0", "nome_lib": LIB, "sobrescrever": True})
    ok("ERRO" not in r and "ERRO" not in s, f"o subcircuito da biblioteca com R.1, D.1, GATE.1, GATE.2 e CONST.1 dentro {erro(r) or erro(s) or ''}")
    dentro_lib = {"R.1", "D.1", "GATE.1", "GATE.2", "CONST.1"}
    exemplos = sorted(p for p in (RAIZ / "exemplos").glob("*.ipes"))
    total = 0
    for ex in exemplos:
        rel = str(ex.relative_to(RAIZ))
        j = api("editor/abrir", {"arq": rel, "modo": "descartar"})
        if "ERRO" in j:
            ok(False, f"{ex.stem}: abrir {erro(j)}"); continue
        f0 = j["folhas"]["0"]; xs = [e["x"] for e in f0["elementos"]] or [0]; ys = [e["y"] for e in f0["elementos"]] or [0]
        ins = api("editor/biblioteca", {"acao": "inserir", "nome_lib": LIB, "x": max(xs) + 12, "y": max(ys) + 12, "folha": "0"})
        if "ERRO" in ins:
            ok(False, f"{ex.stem}: inserir o subcircuito da biblioteca {erro(ins)}"); continue
        f0 = ins["folhas"]["0"]
        sub = [e for e in f0["elementos"] if e["tipo"] == "SUBCIRCUIT"][-1]
        dentro = {e["nome"] for e in ins["folhas"].get(sub["uid"], {}).get("elementos", [])}
        repetidos = [e for e in f0["elementos"] if e["nome"] in dentro]
        problemas = []
        for e in repetidos:                              # o de fora: lê, gira e volta
            if erro(api(f"editor/params?nome={e['nome']}")):
                problemas.append(f"{e['nome']}: params")
            g = api("editor/cmd", {"op": "ROTATE", "args": [e["nome"]]})
            if erro(g):
                problemas.append(f"{e['nome']}: girar ({erro(g)[:60]})")
            else:
                api("editor/desfazer", {})
        for n in sorted(dentro & dentro_lib):           # o de dentro, pelo caminho
            g = api("editor/cmd", {"op": "ROTATE", "args": [f"{sub['nome']}#{n}"]})
            if erro(g):
                problemas.append(f"{sub['nome']}#{n}: girar ({erro(g)[:60]})")
            else:
                api("editor/desfazer", {})
        total += len(repetidos)
        ok(not problemas, f"{ex.stem}: o subcircuito da biblioteca dentro; {len(repetidos)} peça(s) de fora com nome repetido "
                          f"({', '.join(e['nome'] for e in repetidos) or 'nenhuma'}) giram e voltam; as de dentro pelo caminho {problemas or ''}")
    ok(total > 0, f"o teste teve nomes repetidos de verdade para conferir ({total} nos {len(exemplos)} exemplos)")
except Exception as ex:
    ok(False, f"o teste caiu: {ex}")
finally:
    api("editor/novo", {"modo": "descartar"})
    for p in Path(config("MAISIM_DADOS", str(Path.home() / ".cache/maisim_teste")).replace("~", str(Path.home()), 1)).glob(f"**/{LIB}.ipes"):
        try:
            p.unlink()
        except OSError:
            pass
raise SystemExit(1 if falhas else 0)
