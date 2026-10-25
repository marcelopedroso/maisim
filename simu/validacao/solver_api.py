"""O método de integração (o campo "Integração" do ⚙ = o solverType do .ipes), pela API da instância de teste (7201):
  - o estado do editor diz o solverType do circuito (simulacao.solver);
  - a rodada com "solver" aplica o método (o servidor reescreve a linha na cópia da rodada e o Gecko a reabre): o meta,
    o .ipes da rodada e o resumo.md dizem qual; e vale de fato (o trapézio oscila depois que o diodo bloqueia, o Euler não);
  - sem "solver" (a API, o modo autônomo), fica o que o Gecko já tem; um valor fora de 0, 1, 2 é recusado (pt e en);
  - Salvar grava o solverType no modelo, e reabrir o lê de volta;
  - o ⚙ (POST editor/solver) troca no circuito na hora, sem rodar: Salvar grava, trocar marca "não salvo", Ctrl+Z desfaz;
  - Novo circuito volta ao Euler implícito (o CLEAR do Gecko não mexia no solverType);
  - só os inteiros 0, 1, 2 valem (true, 1.9, "1.5" recusados), na rodada e no editor/solver.
Termina com o Gecko de teste no Euler implícito (o padrão) e apaga o que criou."""
import gzip, json, subprocess, sys, time, urllib.request
from pathlib import Path
import numpy as np

AQUI = Path(__file__).resolve().parent
B = "http://localhost:7201/maisim/simu/"
T = Path.home() / ".cache/maisim_teste"


def api(rota, corpo=None, lingua=None):
    h = {"Content-Type": "application/json", "X-MaiSim": "1", **({"Cookie": f"maisim-lingua={lingua}"} if lingua else {})}
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers=h)
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def texto(arq):
    b = Path(arq).read_bytes()
    return (gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b).decode("utf-8", "replace")


def roda(nome, solver=None, lingua=None):
    corpo = {"dt": "1e-06", "tfim": "0.003", "nome": nome, "amostras": "100000", **({"solver": solver} if solver is not None else {})}
    j = api("editor/rodar", corpo, lingua); assert "ERRO" not in j, j
    while j.get("estado") in ("rodando", "pausada", "preparando"):
        time.sleep(0.2); j = api("editor/rodada")
    assert j.get("estado") == "fim", j
    pasta = Path(j["arquivo"]).parent
    d = np.load(j["arquivo"])
    return dict(meta=json.loads(str(d["meta"])), ipes=texto(pasta / f"{nome}.ipes"), resumo=(pasta / "resumo.md").read_text(),
                t=d["t"], v=d["v_sw"], i=d["i_L"])


def oscila(r):
    """|v_sw| máximo 0,1 ms depois que o diodo bloqueou (a corrente no piso)."""
    blq = r["t"][(r["t"] > 2.5e-4) & (r["i"] < 1e-4)]
    return float(np.abs(r["v"][r["t"] > blq[0] + 1e-4]).max()) if len(blq) else float("nan")


# o buck do buck_monta.py, a chave fechada em t = 0 e aberta em 0,2 ms (o mesmo do buck_solvers.py)
api("editor/novo", {"descartar": True})
subprocess.run([sys.executable, str(AQUI / "buck_monta.py")], check=True, capture_output=True, cwd=AQUI)
assert "ERRO" not in api("editor/cmd", {"op": "SETP", "args": ["CONST.1", "const", 1.0]})
r = api("editor/controle", {"controle": {"ativo": False, "Ts": 1e-6, "atuacoes": [], "parametros": [], "codigo": "",
        "atraso": {"modo": "logo", "tempo": 0}, "acionamentos": [{"t": 2e-4, "alvo": "CONST:g", "valor": 0.0}]}})
assert "ERRO" not in r and not r.get("erros"), r
e = api("editor/estado")
ok(e.get("simulacao", {}).get("solver") == 0, f"o estado do editor diz o solverType do circuito: {e.get('simulacao')}")

a = roda("solver_api_trz", "1")
ok(a["meta"].get("solver") == "trapezoidal" and "\nsolverType 1\n" in a["ipes"],
   f"solver 1: o meta diz {a['meta'].get('solver')} e o .ipes da rodada tem solverType 1")
ok("- integração (solverType do Gecko): trapézio (trapezoidal)" in a["resumo"], "o resumo.md diz a integração (em português)")
ok(oscila(a) > 0.05, f"o trapézio vale de fato: v_sw oscila ±{oscila(a):.3f} V depois que o diodo bloqueia")
e = api("editor/estado")
ok(e.get("simulacao", {}).get("solver") == 1, "depois da rodada o Gecko fica com o trapézio (o estado do editor diz 1)")

b = roda("solver_api_sem", lingua="en")
ok(b["meta"].get("solver") == "trapezoidal" and "\nsolverType 1\n" in b["ipes"],
   "sem \"solver\" no pedido, fica o que o Gecko tem (trapezoidal)")
ok("- integration (Gecko solverType): trapezoidal (trapezoidal)" in b["resumo"], "o resumo.md em inglês diz a integração")

for v, lg, frase in (("7", None, "método de integração desconhecido"), ("x", "en", "unknown integration method"),
                     (True, None, "desconhecido"), (1.9, None, "desconhecido"), ("1.5", None, "desconhecido")):
    r = api("editor/rodar", {"dt": "1e-06", "tfim": "0.001", "nome": "solver_api_ruim", "solver": v}, lg)
    ok(r.get("ERRO") and frase in str(r.get("erro", "")), f"solver {v!r} é recusado ({lg or 'pt'}): {r.get('erro')}")

dest = T / "circuitos" / "solver_api.ipes"
r = api("editor/salvar", {"nome": "solver_api", "pasta": "circuitos", "sobrescrever": True}); assert "ERRO" not in r, r
ok("\nsolverType 1\n" in texto(dest), "Salvar grava o solverType 1 no modelo")
api("editor/novo", {"descartar": True})
r = api("editor/abrir", {"arq": str(dest), "modo": "descartar"}); assert "ERRO" not in r, r
ok(r.get("simulacao", {}).get("solver") == 1, f"reabrir lê o solverType de volta: {r.get('simulacao')}")

c = roda("solver_api_be", "0")
ok(c["meta"].get("solver") == "backward-euler" and "\nsolverType 0\n" in c["ipes"] and oscila(c) < 1e-3,
   f"solver 0 volta ao Euler implícito: sem a oscilação (|v_sw| ≤ {oscila(c):.1e} V)")

# o ⚙ troca no circuito na hora (sem rodar): o estado diz, o circuito fica "não salvo", Salvar grava, Ctrl+Z desfaz
r = api("editor/abrir", {"arq": str(dest), "modo": "descartar"}); assert "ERRO" not in r, r
ok(api("editor/pendente").get("pendente") is False, "reaberto: nada pendente")
r = api("editor/solver", {"solver": 2})
ok(r.get("simulacao", {}).get("solver") == 2, f"editor/solver 2: o estado diz Gear ({r.get('simulacao')})")
p = api("editor/pendente")
ok(p.get("pendente") is True and p.get("itens") == ["o circuito"], f"trocar o método marca o circuito como não salvo: {p.get('itens')}")
r = api("editor/desfazer", {}); ok(r.get("simulacao", {}).get("solver") == 1, f"Ctrl+Z volta ao de antes (o trapézio salvo): {r.get('simulacao')}")
ok(api("editor/pendente").get("pendente") is False, "desfeito: nada pendente")
api("editor/solver", {"solver": 2})
r = api("editor/salvar", {"nome": "solver_api", "pasta": "circuitos", "sobrescrever": True}); assert "ERRO" not in r, r
ok("\nsolverType 2\n" in texto(dest), "Salvar sem rodar grava o que o ⚙ escolheu (solverType 2)")
ok(api("editor/pendente").get("pendente") is False, "salvo: nada pendente")
for v in ("x", True, 1.9, 3):
    r = api("editor/solver", {"solver": v})
    ok(r.get("ERRO") and "desconhecido" in str(r.get("erro", "")), f"editor/solver {v!r} é recusado: {r.get('erro')}")
ok(api("editor/estado").get("simulacao", {}).get("solver") == 2, "os recusados não mexem no circuito (continua Gear)")
# Novo: volta ao Euler implícito, e o circuito novo salvo nasce com 0
r = api("editor/novo", {"descartar": True})
ok(r.get("simulacao", {}).get("solver") == 0, f"Novo circuito: Euler implícito, não o Gear de antes ({r.get('simulacao')})")
ok(api("editor/pendente").get("pendente") is False, "o circuito novo (vazio) não fica pendente por causa do método")

# limpeza: o modelo salvo e as rodadas deste teste (o Gecko de teste já voltou ao Euler implícito)
api("editor/novo", {"descartar": True})
dest.unlink(missing_ok=True)
for p in (T / "rodadas").glob("*_solver_api_*"):
    subprocess.run(["rm", "-rf", str(p)])
print(f"\n{'OK' if not falhas else 'FALHA'}: {falhas} falha(s)")
sys.exit(1 if falhas else 0)
