"""Os blocos de controle do Gecko conferidos (v0.3.1, frente B; instância de teste do perfil config/teste.env): os padrões
de um bloco novo e o que cada bloco faz, num circuito pequeno por grupo, com a saída gravada comparada com a conta em numpy.

- Os padrões (servidor.py, PADROES_CONTROLE): PI com Kp (r0) = 1 e Ki (a1) = 100 1/s, HYS com h = 0,5, INT entre ∓1e9, PT1
  e PT2 com T = 1 ms, SDFT com janela de 20 ms em 50 Hz; o LIMIT fica em ±1. Criar e o padrão são um passo só do desfazer
  (editor/cmd e editor/cmds), e um circuito salvo com os valores do Gecko reabre com eles.
- Como a rodada grava: a amostra k (k ≥ 1) é a saída do passo k; a amostra 0 repete a 1. O bloco TIME (e as fontes SIGNAL)
  usa o tempo do começo do passo: TIME = t − Δt na amostra de tempo t.
- Os dinâmicos, contra a recorrência do Gecko (com as entradas gravadas) e contra a resposta contínua: PT1 (Tustin; 63,2 %
  em t = T, final a1), PT2 (a1·(1 − cos(t/T)): sem amortecimento), PI (r0·x + a1·∫x), INT (rampa, reset com z ≥ 1, z = 0,99
  não zera, limites), PD (derivador puro: a1·dx/dt), DELAY (atraso de int(T/Δt) passos, 0 enquanto enche), HYS (±1, troca
  em ±h), LIMIT, S-H (por nível, > 0,5), COUNTER (subidas por 0,5; reset > 0,5); a rodada de novo dá o mesmo (nada fica de
  uma rodada para a outra).
- Os de lógica e os Math contra o numpy: GE, GT, EQ, NE, AND, OR, XOR, NOT (limiar 0,5), ABS, ROUND (Math.round do Java),
  SQR, SQRT, EXP, LN, SIN, COS, TAN, ASIN, ACOS, ATAN, SGN, ADD de 3 entradas, SUB, MUL, DIV, MIN, MAX.
- abc → dq → abc de ida e volta, com um trifásico equilibrado; a SDFT nova (os padrões) dá a amplitude de 50 Hz.
O POW fica de fora: o calculador dele no Gecko nasce com uma entrada só (a frente C corrige no patch 0007). A TF também é da
frente C (tf_api.py)."""
import gzip, json, math, os, re, shutil, time, urllib.request
from pathlib import Path
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]


def config(chave, padrao):                               # do perfil de teste (config/teste.env)
    try:
        m = re.search(rf"^{chave}=(\S+)", (RAIZ / "config/teste.env").read_text(), re.M)
        return m.group(1).replace("~", str(Path.home()), 1) if m else padrao
    except OSError:
        return padrao


B = f"http://localhost:{config('MAISIM_PORTA_SIMU', '7201')}/maisim/simu/"
CIRC = Path(config("MAISIM_SALVOS", str(Path.home() / ".cache/maisim_teste/circuitos")))
SALVO = CIRC / "blocos_controle_api_t.ipes"
DT = 1e-5


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def params(nome):
    r = api(f"editor/params?nome={nome}")
    return {p["nome"]: p.get("valor") for p in r} if isinstance(r, list) else {"erro": r.get("erro")}


def nomes(r):
    return {e["nome"] for e in (r.get("folhas") or {}).get("0", {}).get("elementos", [])}


class Circuito:
    """Os pedidos de um circuito só de blocos de controle (ligados pelos rótulos), num lote (editor/cmds)."""
    def __init__(self):
        self.lst, self.k = [], 0

    def b(self, nome, tipo, ins=(), outs=(), **par):
        x, y = 4 + 10 * (self.k % 8), 4 + 6 * (self.k // 8)
        self.k += 1
        self.lst.append(("CREATE", nome, x, y, tipo))
        self.lst += [("SETP", nome, p, float(v)) for p, v in par.items()]
        self.lst += [("INNODE", nome, i, r) for i, r in enumerate(ins)]
        self.lst += [("OUTNODE", nome, i, r) for i, r in enumerate([outs] if isinstance(outs, str) else outs)]

    def monta(self):
        api("editor/novo", {"modo": "descartar"})
        r = api("editor/cmds", {"cmds": [{"op": o, "args": list(a)} for o, *a in self.lst]})
        ok("ERRO" not in r, f"o circuito montado ({len(self.lst)} pedidos) {r.get('erro', '')}")
        return r


pastas = []
def roda(nome, tfim, dt=DT):
    """Uma rodada com todas as amostras; devolve {canal: valores dos passos 1…N} (sem a amostra 0, que repete a 1)."""
    n = int(round(tfim / dt))
    r = api("editor/rodar", {"dt": str(dt), "tfim": str(tfim), "nome": nome, "amostras": str(n)})
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.3); r = api("editor/rodada")
    if r.get("estado") != "fim":
        ok(False, f"{nome}: a rodada não terminou ({r.get('estado')}: {r.get('erro')})")
        return None
    a = r["arquivo"]
    p = Path(a) if os.path.isabs(a) else RAIZ / a
    pastas.append(p.parent)
    z = np.load(p)
    return {k: np.asarray(z[k][1:], float) for k in z.files if k != "meta"}


def maxdif(a, b):
    return float(np.max(np.abs(np.asarray(a, float) - np.asarray(b, float))))


try:
    # ------------------------------------------------ os padrões de um bloco novo
    api("editor/novo", {"modo": "descartar"})
    esperado = {"PI": {"r0": 1.0, "a1": 100.0}, "HYS": {"h": 0.5}, "INT": {"min": -1e9, "max": 1e9, "a1": 1.0, "y0": 0.0},
                "PT1": {"T": 1e-3, "a1": 1.0}, "PT2": {"T": 1e-3, "a1": 1.0}, "SDFT": {"T": 0.02, "F1": 50.0},
                "LIMIT": {"min": -1.0, "max": 1.0}}
    for k, (tipo, ex) in enumerate(esperado.items()):
        r = api("editor/cmd", {"op": "CREATE", "args": [f"{tipo}.1", 4 + 10 * k, 4, tipo]})
        p = params(f"{tipo}.1")
        ok("ERRO" not in r and all(p.get(c) is not None and math.isclose(p[c], v, rel_tol=1e-12) for c, v in ex.items()),
           f"{tipo} novo: {', '.join(f'{c} = {p.get(c)}' for c in ex)} (esperado {ex}) {r.get('erro', '')}")
    ok(math.isclose(params("PI.1").get("T", 0), 0.01), f"o T do PI (só para ver, r0/a1) acompanha: {params('PI.1').get('T')} s")
    # um passo só do desfazer: criar com o padrão (editor/cmd) e um lote com o CREATE (editor/cmds)
    r = api("editor/cmd", {"op": "CREATE", "args": ["PI.9", 4, 20, "PI"]})
    d = api("editor/desfazer", {})
    ok("PI.9" in nomes(r) and "PI.9" not in nomes(d) and {f"{t}.1" for t in esperado} <= nomes(d),
       f"CREATE do PI com o padrão: um passo do desfazer ({d.get('desfeito')!r})")
    r = api("editor/cmds", {"cmds": [{"op": "CREATE", "args": ["INT.9", 4, 20, "INT"]}, {"op": "SETP", "args": ["INT.9", "a1", 5.0]}]})
    p9 = params("INT.9")
    d = api("editor/desfazer", {})
    ok("INT.9" in nomes(r) and p9.get("a1") == 5.0 and p9.get("max") == 1e9 and "INT.9" not in nomes(d),
       f"um lote com o CREATE: o padrão e o SETP do lote valem ({p9}), e um desfazer tira tudo")
    # circuito antigo: os valores do Gecko ficam (só o CREATE ganha o padrão)
    for c, v in (("r0", -1.0), ("a1", -1.0)):
        api("editor/cmd", {"op": "SETP", "args": ["PI.1", c, v]})
    api("editor/cmd", {"op": "SETP", "args": ["HYS.1", "h", -1.0]})
    s = api("editor/salvar", {"nome": SALVO.stem, "pasta": "circuitos", "sobrescrever": True})
    j = api("editor/abrir", {"arq": str(SALVO), "modo": "descartar"})
    p1, h1 = params("PI.1"), params("HYS.1")
    ok("ERRO" not in s and "ERRO" not in j and p1.get("r0") == -1.0 and p1.get("a1") == -1.0 and h1.get("h") == -1.0,
       f"um circuito salvo com os valores do Gecko reabre com eles (PI r0 = {p1.get('r0')}, a1 = {p1.get('a1')}; HYS h = {h1.get('h')})")

    # ------------------------------------------------ os dinâmicos (Δt = 10 µs, 20 ms)
    c = Circuito()
    c.b("TIME.1", "TIME", outs="tt")
    c.b("CONST.1", "CONST", outs="um", const=1)
    c.b("GAIN.1", "GAIN", ["tt"], "rampa", r0=200)
    c.b("SIGNAL.1", "SIGNAL", outs="sen", type=402, amplMAX=1, f=100)
    c.b("SIGNAL.2", "SIGNAL", outs="clk", type=404, amplMAX=1, f=1000, d=0.3)
    c.b("CONST.2", "CONST", outs="c5", const=0.005)
    c.b("CONST.3", "CONST", outs="c6", const=0.006)
    c.b("GE.1", "GE", ["tt", "c5"], "g5")
    c.b("GE.2", "GE", ["tt", "c6"], "g6")
    c.b("SUB.1", "SUB", ["g5", "g6"], "rst")               # 1 de 5 a 6 ms
    c.b("GAIN.2", "GAIN", ["rst"], "rst99", r0=0.99)
    c.b("PT1.1", "PT1", ["um"], "y_pt1", a1=2)             # T: o padrão (1 ms)
    c.b("PT2.1", "PT2", ["um"], "y_pt2")                   # T = 1 ms, a1 = 1
    c.b("PI.1", "PI", ["um"], "y_pi", r0=2, a1=50)
    c.b("PI.2", "PI", ["um"], "y_pi0")                     # o padrão: 1 + 100·t
    c.b("INT.1", "INT", ["um", "rst"], "y_int", a1=100, y0=0.5, max=1.2)
    c.b("INT.2", "INT", ["um", "rst99"], "y_int2", a1=-100, min=-0.8)
    c.b("INT.3", "INT", ["um"], "y_int3", a1=100)          # sem limite (o padrão): passa de 1
    c.b("PD.1", "PD", ["rampa"], "y_pd", a1=0.5)
    c.b("DELAY.1", "DELAY", ["tt"], "y_d1", T=7e-5)
    c.b("DELAY.2", "DELAY", ["tt"], "y_d2", T=1.23e-4)
    c.b("HYS.1", "HYS", ["sen"], "y_hys")                  # h: o padrão (0,5)
    c.b("LIMIT.1", "LIMIT", ["sen"], "y_lim", min=-0.3, max=0.6)
    c.b("SHLD.1", "SHLD", ["sen", "clk"], "y_sh")
    c.b("COUNTER.1", "COUNTER", ["clk", "rst"], "y_cnt")
    c.monta()
    TF = 0.02
    z = roda("blocos_dinamicos", TF)
    if z is not None:
        N = len(z["t"]); k = np.arange(1, N + 1); t = z["t"]; tt = z["tt"]
        ok(N == int(round(TF / DT)) and np.allclose(t, k * DT, rtol=0, atol=1e-12), f"{N} amostras, uma por passo (t = k·Δt)")
        ok(np.allclose(tt, t - DT, rtol=0, atol=1e-12),
           f"TIME = t − Δt: o Gecko calcula o controle do passo com o tempo do começo dele (TIME na amostra t = {t[9]:.0e}: {tt[9]:.0e})")
        ok(maxdif(z["sen"], np.sin(2 * np.pi * 100 * tt)) < 1e-9, "SIGNAL senoidal = sin(2π·f·TIME): as fontes usam o mesmo tempo do TIME")
        ok(maxdif(z["rst"], (tt >= 0.005).astype(float) - (tt >= 0.006)) == 0, "GE e SUB: o pulso de reset de 5 a 6 ms (de TIME)")

        # PT1: Tustin, y[k] = y[k−1]·(2T − Δt)/(2T + Δt) + a1/(1 + 2T/Δt)·(x[k] + x[k−1]), x[0] = 0
        T, a1 = 1e-3, 2.0
        y, yo, xo = np.empty(N), 0.0, 0.0
        for i, x in enumerate(z["um"]):
            yo = yo * (2 * T - DT) / (2 * T + DT) + a1 / (1 + 2 * T / DT) * (x + xo); xo = x; y[i] = yo
        iT = int(round(T / DT)) - 1
        ok(maxdif(z["y_pt1"], y) < 1e-12, f"PT1 = a recorrência de Tustin do Gecko (diferença {maxdif(z['y_pt1'], y):.1e})")
        ok(abs(z["y_pt1"][iT] / a1 - (1 - math.exp(-1))) < 0.005 and abs(z["y_pt1"][-1] - a1) < 1e-6,
           f"PT1 (T = 1 ms, a1 = 2): em t = T, {100 * z['y_pt1'][iT] / a1:.2f} % (63,21 %); no fim {z['y_pt1'][-1]:.6f} (a1)")
        # PT2: y[k] = y[k−1]·(2 − Δt²/T²) − y[k−2] + a1·Δt²/T²·x[k−1]  →  a1·(1 − cos(t/T)), sem amortecimento
        y, y1, y2, xo = np.empty(N), 0.0, 0.0, 0.0
        for i, x in enumerate(z["um"]):
            yn = y1 * (2 - DT ** 2 / T ** 2) - y2 + DT ** 2 / T ** 2 * xo; xo = x; y2, y1 = y1, yn; y[i] = yn
        cont = 1 - np.cos((t - DT) / T)
        ok(maxdif(z["y_pt2"], y) < 1e-9 and maxdif(z["y_pt2"], cont) < 0.02 and z["y_pt2"].max() > 1.99 and z["y_pt2"].min() < 0.001,
           f"PT2 (T = 1 ms): a recorrência do Gecko (diferença {maxdif(z['y_pt2'], y):.1e}); = 1 − cos(t/T) (±{maxdif(z['y_pt2'], cont):.3f}), "
           f"oscila de {z['y_pt2'].min():.3f} a {z['y_pt2'].max():.3f} sem amortecer (G = a1/(1 + (sT)²), não um PT2 com ζ)")
        # PI: y = r0·x + a1·∫x (trapézio, x[0] = 0): r0 + a1·Δt·(k − ½)
        ok(maxdif(z["y_pi"], 2 + 50 * DT * (k - 0.5)) < 1e-9 and abs(np.polyfit(t, z["y_pi"], 1)[0] - 50) < 1e-6,
           f"PI (r0 = 2, a1 = 50, degrau 1): y = r0 + a1·t (inclinação {np.polyfit(t, z['y_pi'], 1)[0]:.6f}; em t = 0, {z['y_pi'][0]:.6f})")
        ok(maxdif(z["y_pi0"], 1 + 100 * DT * (k - 0.5)) < 1e-9, f"PI novo (Kp = 1, Ki = 100): 1 + 100·t (no fim {z['y_pi0'][-1]:.4f})")

        def integrador(x, zr, a1, y0, mn, mx):              # IntegratorCalculation do Gecko
            y, y1, xo = np.empty(len(x)), y0, 0.0
            for i in range(len(x)):
                if zr[i] < 1:
                    y1 = min(max(y1 + a1 * DT * (x[i] + xo) / 2, mn), mx); xo = x[i]
                else:
                    xo, y1 = 0.0, y0
                y[i] = y1
            return y
        e1 = integrador(z["um"], z["rst"], 100, 0.5, -1e9, 1.2)
        no = lambda tq: int(round(tq / DT))                   # o índice da amostra do TIME = tq (t = tq + Δt)
        ok(maxdif(z["y_int"], e1) < 1e-12 and abs(z["y_int"][no(0.0049)] - (0.5 + 100 * 0.0049)) < 1e-3 and
           np.all(z["y_int"][z["rst"] >= 1] == 0.5) and z["y_int"][no(0.0069)] < 1.2 and abs(z["y_int"][no(0.0062)] - 0.52) < 1e-3
           and np.all(z["y_int"][no(0.0135):] == 1.2),
           f"INT (a1 = 100, y0 = 0,5, máx. 1,2): rampa 0,5 + 100·t ({z['y_int'][no(0.0049)]:.4f} em 4,9 ms), o reset (z ≥ 1) "
           f"segura y0 de 5 a 6 ms e recomeça ({z['y_int'][no(0.0062)]:.4f} em 6,2 ms), preso em 1,2 depois de 13 ms")
        e2 = integrador(z["um"], z["rst99"], -100, 0.0, -0.8, 1e9)
        ok(maxdif(z["y_int2"], e2) < 1e-12 and z["y_int2"][no(0.0055)] < -0.5 and np.all(z["y_int2"][no(0.0081):] == -0.8),
           f"INT (a1 = −100, mín. −0,8): z = 0,99 não zera ({z['y_int2'][no(0.0055)]:.3f} em 5,5 ms); preso em −0,8 depois de 8 ms")
        ok(abs(z["y_int3"][-1] - 100 * (TF - 0.5 * DT)) < 1e-6,
           f"INT novo (sem limite, a1 = 100): {z['y_int3'][-1]:.5f} no fim, passando de 1 (o Gecko prendia em ±1)")
        # PD: a1/Δt·(x[k] − x[k−1]) — derivador puro
        ok(maxdif(z["y_pd"][1:], 0.5 * 200) < 1e-6 and z["y_pd"][0] == 0,
           f"PD (a1 = 0,5) de uma rampa de inclinação 200: {z['y_pd'][5]:.6f} = a1·200 (derivador puro: G = a1·s)")
        for nome, Td in (("y_d1", 7e-5), ("y_d2", 1.23e-4)):
            n = int(Td / DT)
            esp = np.concatenate([np.zeros(n), tt[:-n]])
            ok(maxdif(z[nome], esp) < 1e-15 and np.all(z[nome][:n] == 0),
               f"DELAY (T = {Td:g} s): {n} passos = int(T/Δt) (T/Δt = {Td / DT!r}; atraso {n * DT:.2e} s), 0 enquanto enche")
        # HYS: +1 acima de h, −1 abaixo de −h, segura entre (0 até a 1ª troca)
        h, x = 0.5, z["sen"]
        e, v = np.empty(N), 0.0
        for i in range(N):
            v = 1.0 if x[i] > h else (-1.0 if x[i] < -h else v); e[i] = v
        trocas = tt[1:][np.diff(z["y_hys"]) != 0]
        ok(maxdif(z["y_hys"], e) == 0 and set(np.unique(z["y_hys"][no(0.001):])) == {-1.0, 1.0} and len(trocas) >= 3
           and abs(trocas[1] - (0.005 + math.asin(h) / (2 * np.pi * 100))) <= DT,
           f"HYS (h = 0,5, o padrão; seno de 1 a 100 Hz): saída ±1, troca em ±h ({len(trocas)} trocas; a 2ª em {trocas[1] * 1e3:.3f} ms, "
           f"a conta {1e3 * (0.005 + math.asin(h) / (2 * np.pi * 100)):.3f} ms)")
        ok(maxdif(z["y_lim"], np.clip(x, -0.3, 0.6)) == 0, "LIMIT (−0,3 a 0,6) = clip do numpy")
        e, v = np.empty(N), 0.0
        for i in range(N):
            v = x[i] if z["clk"][i] > 0.5 else v; e[i] = v
        ok(maxdif(z["y_sh"], e) == 0 and len(np.unique(z["y_sh"])) < N / 2,
           "S-H por nível: segue a entrada enquanto o relógio > 0,5 e segura no resto (não é por borda)")
        e, v, ult = np.empty(N), 0.0, 0.0
        for i in range(N):
            if z["clk"][i] >= 0.5 and ult < 0.5:
                v += 1
            if z["rst"][i] > 0.5:
                v = 0.0
            ult = z["clk"][i]; e[i] = v
        sobe = np.nonzero((z["clk"] >= 0.5) & (np.concatenate([[0.0], z["clk"][:-1]]) < 0.5))[0]
        depois = int((sobe > np.nonzero(z["rst"] > 0.5)[0][-1]).sum())      # as subidas depois do último reset
        ok(maxdif(z["y_cnt"], e) == 0 and z["y_cnt"][no(0.0049)] == 5 and z["y_cnt"][no(0.0059)] == 0 and z["y_cnt"][-1] == depois >= 13,
           f"COUNTER: conta as subidas por 0,5 ({z['y_cnt'][no(0.0049)]:.0f} em 4,9 ms, a 1 kHz), o reset > 0,5 zera "
           f"({z['y_cnt'][no(0.0059)]:.0f} em 5,9 ms), {z['y_cnt'][-1]:.0f} no fim (as subidas depois do reset)")
        z2 = roda("blocos_dinamicos_2", TF)
        ok(z2 is not None and all(np.array_equal(z[c_], z2[c_]) for c_ in z),
           "a rodada de novo dá o mesmo em todos os canais (nenhum bloco guarda estado de uma rodada para a outra)")

    # ------------------------------------------------ lógica e Math (Δt = 10 µs, 10 ms)
    c = Circuito()
    c.b("SIGNAL.1", "SIGNAL", outs="u", type=402, amplMAX=2, f=100)
    c.b("SIGNAL.2", "SIGNAL", outs="v", type=403, amplMAX=1.5, f=70)
    c.b("CONST.1", "CONST", outs="w", const=0.7)
    c.b("CONST.2", "CONST", outs="um", const=1)
    c.b("CONST.3", "CONST", outs="c01", const=0.1)
    c.b("CONST.4", "CONST", outs="zero", const=0)
    c.b("DIV.2", "DIV", ["u", "zero"], "i_div0")
    c.b("GAIN.1", "GAIN", ["u"], "s", r0=0.45)
    um_ = (("ABS", "u"), ("ROUND", "u"), ("SQR", "u"), ("EXP", "u"), ("SIN", "u"), ("COS", "u"), ("TAN", "v"),
           ("ASIN", "s"), ("ACOS", "s"), ("ATAN", "u"), ("SGN", "u"), ("NOT", "u"))
    for tipo, ent in um_:
        c.b(f"{tipo}.1", tipo, [ent], f"m_{tipo.lower()}")
    c.b("ADD.2", "ADD", ["m_sqr", "c01"], "p")             # p = u² + 0,1 > 0 (para SQRT e LN)
    c.b("SQRT.1", "SQRT", ["p"], "m_sqrt")
    c.b("LN.1", "LN", ["p"], "m_ln")
    c.b("ADD.1", "ADD", ["u", "v", "w"], "m_add", numberInputTerminals=3)
    dois = ("SUB", "MUL", "DIV", "MIN", "MAX", "GE", "GT", "AND", "OR", "XOR")
    for tipo in dois:
        c.b(f"{tipo}.1", tipo, ["u", "v"], f"m_{tipo.lower()}")
    for tipo in ("EQ", "NE", "GE", "GT"):                  # na igualdade: round(u) e 1
        c.b(f"{tipo}.2", tipo, ["m_round", "um"], f"i_{tipo.lower()}")
    c.monta()
    z = roda("blocos_math", 0.01)
    if z is not None:
        u, v, s, p, w = z["u"], z["v"], z["s"], z["p"], 0.7
        ok(u.max() > 1.99 and u.min() < -1.99 and v.max() > 1.49 and v.min() < -1.1 and abs(s).max() < 1,
           f"as entradas: seno de 2 a 100 Hz, triângulo de 1,5 a 70 Hz ({v.min():.2f} a {v.max():.2f} em 10 ms), s = 0,45·u")
        conta = {"abs": np.abs(u), "round": np.floor(u + 0.5), "sqr": u * u, "exp": np.exp(u), "sin": np.sin(u), "cos": np.cos(u),
                 "tan": np.tan(v), "asin": np.arcsin(s), "acos": np.arccos(s), "atan": np.arctan(u), "sgn": np.sign(u),
                 "not": (u < 0.5) * 1.0, "sqrt": np.sqrt(p), "ln": np.log(p), "add": u + v + w, "sub": u - v, "mul": u * v,
                 "min": np.minimum(u, v), "max": np.maximum(u, v), "ge": (u >= v) * 1.0, "gt": (u > v) * 1.0,
                 "and": ((u > 0.5) & (v > 0.5)) * 1.0, "or": ((u > 0.5) | (v > 0.5)) * 1.0, "xor": ((u >= 0.5) != (v >= 0.5)) * 1.0}
        for nome, e in conta.items():
            d = float(np.max(np.abs(z[f"m_{nome}"] - e) / np.maximum(1.0, np.abs(e))))
            ok(d < 1e-12, f"{nome.upper()} contra o numpy: diferença relativa {d:.1e}")
        ok(z["m_sgn"][0] == 0 and u[0] == 0, "SGN(0) = 0 (o seno começa em 0)")
        ok(maxdif(z["m_div"], u / v) < 1e-9 * max(1.0, float(np.max(np.abs(u / v)))), "DIV = u/v")
        ok(np.array_equal(z["i_div0"], np.where(u == 0, 0.0, np.sign(u) * 1e40)) and (u == 0).any(),
           "DIV por zero: ±1e40 com o sinal do numerador, e 0/0 = 0")
        r1 = z["m_round"] == 1
        ok(np.array_equal(z["i_eq"], r1 * 1.0) and np.array_equal(z["i_ne"], (~r1) * 1.0) and r1.any() and (~r1).any(),
           f"EQ e NE: igualdade exata (round(u) = 1 em {int(r1.sum())} amostras), sem limiar")
        ok(np.array_equal(z["i_ge"], (z["m_round"] >= 1) * 1.0) and np.array_equal(z["i_gt"], (z["m_round"] > 1) * 1.0),
           "GE e GT na igualdade: GE dá 1, GT dá 0")

    # ------------------------------------------------ abc → dq → abc, TIME, a SDFT nova (Δt = 10 µs, 40 ms)
    A, fi = 1.5, 0.4
    c = Circuito()
    c.b("TIME.1", "TIME", outs="tt")
    c.b("GAIN.1", "GAIN", ["tt"], "th", r0=2 * np.pi * 50)
    c.b("CONST.1", "CONST", outs="fi", const=fi)
    c.b("CONST.2", "CONST", outs="k1", const=-2 * np.pi / 3)
    c.b("CONST.3", "CONST", outs="k2", const=2 * np.pi / 3)
    c.b("ADD.1", "ADD", ["th", "fi"], "tha")
    c.b("ADD.2", "ADD", ["tha", "k1"], "thb")
    c.b("ADD.3", "ADD", ["tha", "k2"], "thc")
    for f, ent in (("a", "tha"), ("b", "thb"), ("c", "thc")):
        c.b(f"COS.{f}", "COS", [ent], f"c{f}")
        c.b(f"GAIN.{f}", "GAIN", [f"c{f}"], f, r0=A)
    c.b("ABCDQ.1", "ABCDQ", ["a", "b", "c", "th"], ["d", "q"])
    c.b("DQABC.1", "DQABC", ["d", "q", "th"], ["a2", "b2", "c2"])
    c.b("SIGNAL.1", "SIGNAL", outs="s50", type=402, amplMAX=2, f=50)
    c.b("SDFT.1", "SDFT", ["s50"], "dft")                  # os padrões: janela de 20 ms, 50 Hz
    c.monta()
    z = roda("blocos_dq", 0.04)
    if z is not None:
        th = 2 * np.pi * 50 * z["tt"]
        ok(maxdif(z["a"], A * np.cos(th + fi)) < 1e-9 and maxdif(z["b"], A * np.cos(th + fi - 2 * np.pi / 3)) < 1e-9,
           "o trifásico equilibrado: a = 1,5·cos(θ + 0,4), b e c a ∓120°")
        ok(maxdif(z["d"], A * math.cos(fi)) < 1e-9 and maxdif(z["q"], A * math.sin(fi)) < 1e-9,
           f"abc → dq (Park, amplitude): d = A·cos φ = {A * math.cos(fi):.6f} ({z['d'].mean():.6f}), q = A·sin φ = {A * math.sin(fi):.6f} ({z['q'].mean():.6f})")
        ok(all(maxdif(z[f"{f}2"], z[f]) < 1e-9 for f in "abc"),
           f"dq → abc de volta: a, b e c iguais (diferença máxima {max(maxdif(z[f + '2'], z[f]) for f in 'abc'):.1e})")
        ok(abs(z["dft"][-1] - 2) < 0.01 and abs(z["dft"][int(round(0.03 / DT))] - 2) < 0.01,
           f"SDFT nova (janela de 20 ms, 50 Hz) num seno de 2 a 50 Hz: {z['dft'][-1]:.4f} no fim (a amplitude, 2)")
finally:
    for p in pastas:
        shutil.rmtree(p, ignore_errors=True)
    for f in CIRC.glob(SALVO.stem + ".*"):
        f.unlink()
    api("editor/abrir", {"arq": str(CIRC / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
