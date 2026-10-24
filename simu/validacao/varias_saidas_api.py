"""Blocos com várias saídas na folha principal (instância de teste 7201), achado da vistoria dos componentes em 24/10: um
abc>>dq, DEMUX, Java, Thyristor Control… derrubava toda rodada antes de começar — o servidor lia cada bloco como um sinal
só (GETM bloco → getOutput(bloco) do Gecko: "has more than one output"). Agora cada saída é um sinal (bloco@saída no
GETM → getOutput(bloco, saída)), com o rótulo dela ou <bloco>_<saída>. Confere, num circuito só de controle:
- abc>>dq de um trifásico equilibrado (três SIGNAL senoidais de 2, 50 Hz, fases −30°, 90°, −150°: a = 2·sin(ωt + 30°), b e
  c a −120° e +120°) com θ = ωt (TIME → ganho 2π·50): pelo ReglerABCDQ (ABCDQCalculator), d = (2(a−b)cosθ +
  (b−c)(cosθ + √3 sinθ))/3 e q = −(2(a−b)sinθ + (b−c)(sinθ − √3 cosθ))/3, que para a = A·sin(ωt + φ) dá d = A·sin φ = 1 e
  q = −A·cos φ = −√3, constantes; a saída d com rótulo (v_d), a q sem (ABCDQ_1_q);
- DEMUX de 5 saídas de um MUX de cinco CONST (1…5): DEMUX_1_0 … DEMUX_1_3 = 1 … 4; a 5ª o Gecko não nomeia
  (getOutputNames do DEMUX: "0", "1", "2", "etc.") — fica fora da rodada com aviso, e a rodada vai até o fim;
- o estado diz os canais de cada saída (canais_saidas) e as medidas do controle os têm; "→ Scope" desmarcado no DEMUX tira
  as saídas dele todas da gravação (as caixinhas são do bloco)."""
import json, math, os, re, shutil, time, urllib.request
from pathlib import Path
import numpy as np

RAIZ_PROJ = str(Path(__file__).resolve().parents[2])   # a raiz do projeto (validacao → simu → raiz)


def porta():                                             # a do simu no perfil de teste (config/teste.env)
    try:
        m = re.search(r"^MAISIM_PORTA_SIMU=(\d+)", (Path(RAIZ_PROJ) / "config/teste.env").read_text(), re.M)
        return int(m.group(1)) if m else 7201
    except OSError:
        return 7201


B = f"http://localhost:{porta()}/maisim/simu/"


def api(rota, corpo=None):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(q, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas, total = 0, 0
def ok(c, t):
    global falhas, total; print(("OK   " if c else "FALHA"), t); falhas += (not c); total += 1


def roda(nome):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.004", "nome": nome, "amostras": "200"})
    while j.get("estado") in ("rodando", "pausada", "preparando"):
        time.sleep(0.3); j = api("editor/rodada")
    z = None
    if j.get("estado") == "fim":
        p = j["arquivo"] if os.path.isabs(j["arquivo"]) else os.path.join(RAIZ_PROJ, j["arquivo"])
        z = dict(np.load(p, allow_pickle=False)); z["_pasta"] = os.path.dirname(p)
    return j, z


faixa = lambda x: "—" if x is None else f"{x.min():.5g} … {x.max():.5g}"
c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
pastas = []
try:
    api("editor/novo", {"modo": "descartar"})
    els = [("SIGNAL.1", 6, 6, "SIGNAL"), ("SIGNAL.2", 6, 10, "SIGNAL"), ("SIGNAL.3", 6, 14, "SIGNAL"), ("TIME.1", 6, 18, "TIME"),
           ("GAIN.1", 12, 18, "GAIN"), ("ABCDQ.1", 20, 10, "ABCDQ"), ("MUX.1", 20, 30, "MUX"), ("DEMUX.1", 30, 30, "DEMUX")]
    els += [(f"CONST.{k}", 6, 24 + 3 * k, "CONST") for k in range(1, 6)]
    for a in els:
        r = c("CREATE", *a)
        if r.get("erro") or r.get("ERRO"):
            ok(False, f"CREATE {a[0]}: {r.get('erro')}")
    for k, (n, fase) in enumerate((("SIGNAL.1", -30.0), ("SIGNAL.2", 90.0), ("SIGNAL.3", -150.0))):
        c("SETP", n, "type", 402); c("SETP", n, "amplMAX", 2.0); c("SETP", n, "f", 50.0)    # 402: a senoide
        c("SETP", n, "phase", fase); c("OUTNODE", n, 0, "abc"[k])
    c("OUTNODE", "TIME.1", 0, "tm"); c("INNODE", "GAIN.1", 0, "tm"); c("SETP", "GAIN.1", "r0", 2 * math.pi * 50); c("OUTNODE", "GAIN.1", 0, "th")
    for i, rot in enumerate(("a", "b", "c", "th")):
        c("INNODE", "ABCDQ.1", i, rot)
    c("OUTNODE", "ABCDQ.1", 0, "v_d")                    # a d com rótulo; a q sem (o nome vem do bloco e da saída)
    c("SETP", "MUX.1", "numberInputTerminals", 5); c("SETP", "DEMUX.1", "numberOutputTerminals", 5)
    for k in range(1, 6):
        c("SETP", f"CONST.{k}", "const", float(k)); c("OUTNODE", f"CONST.{k}", 0, f"k{k}"); c("INNODE", "MUX.1", k - 1, f"k{k}")
    c("OUTNODE", "MUX.1", 0, "vec"); c("INNODE", "DEMUX.1", 0, "vec")
    api("editor/controle", {"controle": {"ativo": False, "Ts": 1e-4, "atuacoes": [], "parametros": [], "acionamentos": [], "controladores": []}})
    est = api("editor/estado")
    el = {e["nome"]: e for e in est["folhas"]["0"]["elementos"]}
    cs = est.get("canais_saidas") or {}
    demux = [f"DEMUX_1_{i}" for i in range(5)]
    ok(len(el.get("DEMUX.1", {}).get("saidas", [])) == 5 and len(el.get("MUX.1", {}).get("entradas", [])) == 5,
       f"MUX de 5 entradas e DEMUX de 5 saídas ({len(el.get('MUX.1', {}).get('entradas', []))}, {len(el.get('DEMUX.1', {}).get('saidas', []))})")
    ok(cs.get("ABCDQ.1") == ["v_d", "ABCDQ_1_q"] and cs.get("DEMUX.1") == demux,
       f"o estado diz o canal de cada saída: {cs}")
    ok(est.get("canais", {}).get("ABCDQ.1@d") == "v_d" and est.get("canais", {}).get("ABCDQ.1@q") == "ABCDQ_1_q" and "ABCDQ.1" not in est.get("canais", {}),
       f"canais: bloco@saída ({ {k: v for k, v in est.get('canais', {}).items() if '@' in k} })")
    ent = api("editor/controle").get("entradas", [])
    ok({"v_d", "ABCDQ_1_q", *demux} <= set(ent), f"as medidas do controle têm cada saída ({', '.join(ent)})")

    j, z = roda("varias_saidas_api")
    pastas.append(z and z["_pasta"])
    av = " ".join(j.get("avisos") or [])
    ok(j.get("estado") == "fim", f"a rodada vai até o fim ({j.get('estado')} {j.get('erro', '')})")
    z = z or {}
    d, q = z.get("v_d"), z.get("ABCDQ_1_q")
    ok(d is not None and q is not None and np.max(np.abs(d - 1.0)) < 1e-2 and np.max(np.abs(q + math.sqrt(3))) < 1e-2,
       f"abc>>dq do trifásico equilibrado: d = {faixa(d)} (1), q = {faixa(q)} (−√3 = −1.732), constantes")
    ok(all(k in z and np.allclose(z[k][1:], i + 1) for i, k in enumerate(demux[:4])),
       f"DEMUX: as 4 primeiras saídas = 1, 2, 3, 4 ({[float(z[k][-1]) for k in demux[:4] if k in z]})")
    ok("DEMUX_1_4" not in z and "DEMUX_1_4" in av and "DEMUX_1_4" not in (j.get("sinais") or []),
       f"a 5ª saída do DEMUX (o Gecko não a nomeia) fica fora, com aviso: {av[:200]!r}")
    meta = json.loads(str(z["meta"])) if "meta" in z else {}
    ok({"ABCDQ.1@d", "ABCDQ.1@q", "DEMUX.1@etc."} <= {x["elemento"] for x in meta.get("sinais", [])},
       f"o meta da gravação diz bloco@saída de cada sinal ({[x['elemento'] for x in meta.get('sinais', []) if '@' in x['elemento']]})")

    # as caixinhas são do bloco: "→ Scope" desmarcado no DEMUX tira as saídas todas da gravação (e o controle ainda as tem)
    r = api("editor/destino", {"uid": el["DEMUX.1"]["uid"], "scope": False, "controle": True})
    ent = api("editor/controle").get("entradas", [])
    j2, z2 = roda("varias_saidas_api")
    pastas.append(z2 and z2["_pasta"])
    z2 = z2 or {}
    ok(not r.get("ERRO") and j2.get("estado") == "fim" and not any(k in z2 for k in demux) and "v_d" in z2 and set(demux[:4]) <= set(ent),
       f"DEMUX fora do scope: nenhuma saída dele gravada ({sorted(k for k in z2 if k.startswith('DEMUX'))}), no controle ainda ({j2.get('erro', '')})")
    api("editor/destino", {"uid": el["DEMUX.1"]["uid"], "scope": True, "controle": True})
finally:
    api("editor/novo", {"modo": "descartar"})
    for p in pastas:
        if p and "maisim_teste" in p:
            shutil.rmtree(p, ignore_errors=True)
print(f"\n{total - falhas}/{total}")
raise SystemExit(1 if falhas else 0)
