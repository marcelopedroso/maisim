"""O transformador ideal (LK_TRANS, "Ideal Transformer" na paleta) no MaiSim, na instância de teste (7201). Até 11/2026 ele
aparecia sem bornes: não dava para ligar nem desenhar (Marcelo, 15/11, o vídeo do retificador de onda completa com
derivação central). Confere:
- os 4 bornes onde o Gecko os põe (o primário à esquerda, o secundário à direita) e que eles giram com o elemento;
- n1, n2, a relação e a polaridade no par (o painel e o desenho) e no editor/params;
- U.1 de 100 V de pico → transformador 2:1 → R de 10 Ω: v2 = 50 V, i2 = 5 A e i1 = 2,5 A de pico (a corrente refletida);
- a polaridade: reversed = 1 inverte o secundário;
- a derivação central com dois transformadores 1:1 em série (os primários em paralelo): o retificador de onda completa com
  dois diodos dá V_CC = 2·Vm/π = 63,66 V na carga de 5 Ω e a tensão reversa de 2·Vm = 200 V no diodo;
- salvar e reabrir guarda a relação e a polaridade."""
import math, sys, time
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from exemplos_monta import api, poe, fio, mede, els   # noqa: E402

falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t, flush=True); falhas += (not c)


def cmd(op, *a):
    return api("editor/cmd", {"op": op, "args": list(a)})


def bornes(nome):
    return [(t["x"], t["y"]) for t in els()[nome]["terminais"]]


def roda(nome, tfim="0.05"):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": tfim, "nome": nome, "amostras": "50000"})
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.3); j = api("editor/rodada")
    if j.get("estado") != "fim":
        return None, j
    z = np.load(j["arquivo"]); return {k: z[k] for k in z.files if z[k].dtype.kind == "f" and z[k].ndim == 1}, j


def trafo(nome, x, y, n1, n2, rev=-1.0):
    cmd("CREATE", nome, x, y, "Trans")
    for k, v in (("n1", n1), ("n2", n2), ("reversed", rev)):
        cmd("SETP", nome, k, v)


try:
    # 1. os bornes e os parâmetros
    api("editor/novo", {"descartar": True})
    trafo("Trans.1", 10, 10, 2.0, 1.0)
    e = els()["Trans.1"]
    ok(bornes("Trans.1") == [(9, 8), (9, 12), (11, 8), (11, 12)] and [t["lado"] for t in e["terminais"]] == ["e", "e", "s", "s"],
       f"os 4 bornes do Gecko: o primário à esquerda, o secundário à direita ({bornes('Trans.1')})")
    ok(e["par"].get("windings1") == 2.0 and e["par"].get("windings2") == 1.0 and e["par"].get("windingsRatio") == 2.0 and e["par"].get("reversed") == -1.0,
       f"n1, n2, a relação e a polaridade no par: {e['par']}")
    q = {p["nome"]: p["valor"] for p in api("editor/params?nome=Trans.1")}
    ok(q.get("n1") == 2.0 and q.get("n2") == 1.0 and q.get("ratio") == 2.0, f"o painel (editor/params): {q}")
    cmd("ROTATE", "Trans.1")
    gir = bornes("Trans.1")
    ok(len(gir) == 4 and gir != [(9, 8), (9, 12), (11, 8), (11, 12)] and all(abs(x - 10) <= 2 and abs(y - 10) <= 2 for x, y in gir),
       f"girado, os bornes giram junto ({gir})")
    cmd("ROTATE", "Trans.1"); cmd("ROTATE", "Trans.1"); cmd("ROTATE", "Trans.1")
    ok(bornes("Trans.1") == [(9, 8), (9, 12), (11, 8), (11, 12)], "quatro giros: de volta ao lugar")

    # 2. U → 2:1 → R
    poe("U.1", 4, 10, "U", 503, type=402, uMAX=100.0, f=60.0, phase=0.0)
    poe("R.1", 16, 10, "R", 503, R=10.0)
    fio("p", (4, 8), (4, 6), (8, 6), (8, 8), (9, 8))
    fio("gp", (4, 12), (4, 14), (8, 14), (8, 12), (9, 12))
    fio("s", (11, 8), (12, 8), (16, 8))
    fio("gs", (11, 12), (12, 12), (16, 12))
    mede("VOLT.1", 22, 6, "v_s", no1="s", no2="gs"); mede("AMP.1", 22, 9, "i_s", componente="R.1")
    mede("VOLT.2", 22, 12, "v_p", no1="p", no2="gp"); mede("AMP.2", 22, 15, "i_p", componente="U.1")
    ok(not (api("editor/estado").get("encaixe") or {}).get("soltas"), "ligado nos 4 bornes, sem pontas soltas")
    z, j = roda("trafo_2_1")
    if z is None:
        ok(False, f"a rodada: {j}")
    else:
        k = int(np.argmax(z["v_p"]))
        ok(abs(z["v_p"].max() - 100) < 0.1 and abs(z["v_s"].max() - 50) < 0.05 and abs(z["i_s"].max() - 5) < 0.01,
           f"2:1: v1 {z['v_p'].max():.2f} V → v2 {z['v_s'].max():.3f} V, i2 {z['i_s'].max():.4f} A de pico")
        ok(abs(abs(z["i_p"]).max() - 2.5) < 0.01, f"a corrente refletida no primário: {abs(z['i_p']).max():.4f} A (i2·n2/n1 = 2,5 A)")
        ok(z["v_s"][k] > 49, f"em fase (os pontos em cima): no pico de v1, v2 = {z['v_s'][k]:.2f} V")
    # o que a IA do MaiSim lê (CONTEXTO.md): quais nós são o primário e o secundário e a relação (com o claude de mentira)
    import json as _json, os as _os, subprocess as _sp
    from _servidor import ambiente
    env = ambiente()
    import urllib.request as _ur
    def api_ia(rota, corpo=None):                          # as rotas da IA só aceitam a página do MaiSim (o X-MaiSim)
        q = _ur.Request(f"http://127.0.0.1:7201/maisim/simu/{rota}", data=_json.dumps(corpo).encode() if corpo is not None else None,
                        headers={"Content-Type": "application/json", "X-MaiSim": "1"})
        return _json.loads(_ur.urlopen(q, timeout=120).read())
    if env.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py"):
        conf = Path(env["MAISIM_CLAUDE_DIR"]); conf.mkdir(parents=True, exist_ok=True)
        (conf / "falso_logado").write_text(""); (conf / "falso_cenario").write_text("ganho")
        api_ia("claude/nova", {}); api_ia("claude/pedir", {"texto": "calcule a tensão no secundário", "dt": 1e-6, "tfim": 0.05})
        for _ in range(120):
            if not api_ia("claude/pedido").get("andamento"):
                break
            time.sleep(0.5)
        ch = [_json.loads(x) for x in (conf / "falso_chamadas.jsonl").read_text().splitlines() if "stream-json" in x]
        ctx = (Path(ch[-1]["cwd"]) / "CONTEXTO.md").read_text() if ch else ""
        linha = next((x for x in ctx.splitlines() if "primário" in x or "primary" in x), "")
        ok(("p–gp" in linha and "s–gs" in linha and "2:1" in linha), f"a IA lê o transformador: {linha.strip()}")
        api_ia("claude/nova", {})
    else:
        print("PULADO a IA lê o transformador (o servidor de teste sem o claude de mentira)")
    cmd("SETP", "Trans.1", "reversed", 1.0)
    z, j = roda("trafo_invertido")
    k = int(np.argmax(z["v_p"])) if z is not None else 0
    ok(z is not None and z["v_s"][k] < -49 and els()["Trans.1"]["par"].get("reversed") == 1.0,
       f"reversed = 1: o secundário invertido (no pico de v1, v2 = {z['v_s'][k] if z is not None else '?'} V)")

    # 3. salvar e reabrir
    r = api("editor/salvar", {"nome": "trafo_api", "pasta": "circuitos", "sobrescrever": True})
    api("editor/novo", {"descartar": True}); api("editor/abrir", {"arq": r.get("salvo"), "modo": "descartar"})
    p = els().get("Trans.1", {}).get("par", {})
    ok(p.get("windings1") == 2.0 and p.get("windings2") == 1.0 and p.get("reversed") == 1.0 and len(els()["Trans.1"]["terminais"]) == 4,
       f"salvo e reaberto: {p}")

    # 4. a derivação central: dois 1:1 em série, os primários em paralelo, o meio no terra; D.1 e D.2 → R de 5 Ω
    api("editor/novo", {"descartar": True})
    poe("U.1", 2, 12, "U", 503, type=402, uMAX=100.0, f=60.0, phase=0.0)
    trafo("Trans.1", 10, 8, 1.0, 1.0); trafo("Trans.2", 10, 16, 1.0, 1.0)
    # (pontas curtas com rótulo: o mesmo rótulo é o mesmo nó) Trans.1 em (10, 8): bornes (9, 6), (9, 10) | (11, 6), (11, 10);
    # Trans.2 em (10, 16): (9, 14), (9, 18) | (11, 14), (11, 18)
    for rot, a, b in (("p", (2, 10), (2, 8)), ("gp", (2, 14), (2, 16)), ("p", (9, 6), (8, 6)), ("gp", (9, 10), (8, 10)),
                      ("p", (9, 14), (8, 14)), ("gp", (9, 18), (8, 18)), ("a1", (11, 6), (12, 6)), ("meio", (11, 10), (12, 10)),
                      ("meio", (11, 14), (12, 14)), ("a2", (11, 18), (12, 18))):
        fio(rot, a, b)
    for nome, y, a in (("D.1", 6, "a1"), ("D.2", 18, "a2")):   # o anodo à esquerda (no secundário), o catodo comum em o
        poe(nome, 14, y, "D", 502)
        for k, v in (("uF", 0.0), ("rON", 1e-4)):
            cmd("SETP", nome, k, v)
        fio("o", (16, y), (17, y))
    poe("R.1", 20, 12, "R", 503, R=5.0)
    fio("o", (20, 10), (20, 9)); fio("meio", (20, 14), (20, 15))
    mede("VOLT.1", 26, 6, "v_o", no1="o", no2="meio"); mede("AMP.1", 26, 9, "i_o", componente="R.1")
    mede("VOLT.2", 26, 12, "v_D1", no1="a1", no2="o")
    est = api("editor/estado")
    soltas = (est.get("encaixe") or {}).get("soltas")
    z, j = roda("derivacao_central", tfim="0.1")
    if z is None:
        ok(False, f"a derivação central não rodou ({soltas}): {j}")
    else:
        t = np.linspace(0, 1, len(z["v_o"]))
        reg = t >= 0.5                                   # os últimos 50 ms (3 períodos)
        vcc = float(z["v_o"][reg].mean())
        ok(abs(vcc - 200 / math.pi) < 0.2, f"onda completa com derivação central: V_CC {vcc:.3f} V (2·Vm/π = {200 / math.pi:.3f} V)")
        ok(z["v_o"][reg].min() > -0.1 and abs(z["v_o"][reg].max() - 100) < 0.2, f"v_o só positiva, pico {z['v_o'][reg].max():.2f} V")
        ok(abs(z["v_D1"][reg].min() + 200) < 0.5, f"a tensão reversa no diodo: {z['v_D1'][reg].min():.2f} V (−2·Vm = −200 V)")
except Exception as x:                                    # noqa: BLE001
    ok(False, f"o teste caiu: {type(x).__name__}: {x}")
finally:
    api("editor/novo", {"descartar": True})
sys.exit(1 if falhas else 0)
