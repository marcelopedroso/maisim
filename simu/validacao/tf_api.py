"""A função de transferência H(s) editável e o patch 0007 do Gecko (instância de teste 7201; frente C da v0.3.1, 25/10).
O bloco TF do Gecko guarda o numerador e o denominador fora dos parâmetros (nominatorPolynom / denominatorPolynom, 20
valores crescentes); o MaiSim os escreve pelo editor/mede tipo H (o Gecko salva, o servidor reescreve o bloco, o Gecko
reabre e confere). Confere, num circuito só de controle (Δt = 1 µs, 40 ms, uma amostra a cada 10 µs):
- a TF nova da paleta é 1/(1 + 1e-3 s), em modo polinômio (o patch: era 1/1, e o diálogo do Gecko a refazia como (s−1)/(s−2));
- 1ª ordem: a TF 1/(1 + τs) e o PT1 com T = τ = 1 ms, do mesmo degrau: a mesma resposta, 1 − e^(−t/τ) (63,2 % em t = τ);
- 2ª ordem: ωn²/(s² + 2ζωn s + ωn²), ωn = 1000 rad/s, ζ = 0,5, escrita "1 + 2*0.5/1000 s + 1e-6 s^2": o pico de
  1 + e^(−ζπ/√(1−ζ²)) = 1,163 em tp = π/(ωn√(1−ζ²)) = 3,628 ms, e a resposta inteira contra a fórmula analítica;
- numerador de grau maior (o dt² do patch, StateSpaceCalculator: a 2ª derivada era dividida por dt, não por dt²): com
  w = sin(ω₀t), ω₀ = 2π·50, (1 + s/ω₀)² dá w + 2w'/ω₀ + w''/ω₀² = 2cos(ω₀t) (com o erro, sin + 2cos); e (1 + s/ω₀)³/(1 +
  s/(2ω₀)) em regime: amplitude e fase de H(jω₀). (O Gecko faz a parte imprópria por diferenças finitas e o resto pelo
  trapézio, com erro O(Δt) que a divisão amplifica quando o polo é rápido: com 1 + s/(10ω₀), 4 % em Δt = 1 µs, 0,4 % em
  0,1 µs — a mesma conta refeita em numpy dá o mesmo; não é do patch);
- o POW com as duas entradas ligadas (o patch: o calculador tinha uma só): x^y contra o numpy, x = 1,5 + 0,5·sin, y = 100·t;
- polos, zeros e ganho (a conta em numpy): k/(s − p)(s − p*) dá os polinômios de numpy.poly; o desfazer volta ao de antes;
- salvar e reabrir mantém os polinômios (e o polynomMode true no arquivo);
- o DELAY (patch 0007, achado da frente B): T = 70 µs com Δt = 10 µs atrasa 7 passos (o (int)(T/Δt) dava 6,999… → 6);
- os erros, em pt e em en: denominador nulo, numerador de grau > denominador + 2, grau 20, texto que não se lê, número não
  finito, divisão por s, um bloco que não é TF."""
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
SALVO = CIRC / "tf_api_t.ipes"


def api(rota, corpo=None, lingua=None):
    h = {"Content-Type": "application/json"}
    if lingua:
        h["Cookie"] = f"maisim-lingua={lingua}"
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers=h)
    try:
        return json.loads(urllib.request.urlopen(q, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
def el(j, nome):
    return next((e for e in j.get("folhas", {}).get("0", {}).get("elementos", []) if e["nome"] == nome), None)
def h(j, nome):
    return (el(j, nome) or {}).get("tf")
def perto(a, b, rel=1e-9):
    return a is not None and len(a) == len(b) and all(abs(x - y) <= rel * max(abs(x), abs(y), 1e-300) for x, y in zip(a, b))


TAU, WN, ZETA, W0 = 1e-3, 1000.0, 0.5, 2 * math.pi * 50
feitas = []
try:
    api("editor/novo", {"modo": "descartar"})
    els = [("CONST.1", 4, 6, "CONST"), ("TF.1", 12, 4, "TF"), ("PT1.1", 12, 8, "PT1"), ("TF.2", 12, 12, "TF"),
           ("SIGNAL.1", 4, 18, "SIGNAL"), ("TF.3", 12, 16, "TF"), ("TF.4", 12, 20, "TF"),
           ("SIGNAL.2", 4, 26, "SIGNAL"), ("TIME.1", 4, 30, "TIME"), ("GAIN.1", 8, 30, "GAIN"), ("POW.1", 14, 28, "POW")]
    for a in els:
        r = c("CREATE", *a)
        if r.get("erro"):
            ok(False, f"CREATE {a[0]}: {r.get('erro')}")
    j = api("editor/estado")
    par = {q["id"]: q["valor"] for q in api("editor/params?nome=TF.1&dom=CONTROL&typ=74")}
    ok(perto(h(j, "TF.1")["num"], [1.0]) and perto(h(j, "TF.1")["den"], [1.0, 1e-3]) and par.get("polynomMode") == 1.0,
       f"a TF nova: 1/(1 + 1e-3 s), em modo polinômio ({h(j, 'TF.1')}, polynomMode = {par.get('polynomMode')})")
    c("SETP", "CONST.1", "const", 1.0); c("OUTNODE", "CONST.1", 0, "u")
    for n, s in (("TF.1", "y_tf1"), ("PT1.1", "y_pt1"), ("TF.2", "y_tf2")):
        c("INNODE", n, 0, "u"); c("OUTNODE", n, 0, s)
    c("SETP", "PT1.1", "T", TAU); c("SETP", "PT1.1", "a1", 1.0)
    c("SETP", "SIGNAL.1", "type", 402); c("SETP", "SIGNAL.1", "amplMAX", 1.0); c("SETP", "SIGNAL.1", "f", 50.0); c("OUTNODE", "SIGNAL.1", 0, "w")
    for n, s in (("TF.3", "y_d2"), ("TF.4", "y_d3")):
        c("INNODE", n, 0, "w"); c("OUTNODE", n, 0, s)
    c("SETP", "SIGNAL.2", "type", 402); c("SETP", "SIGNAL.2", "amplMAX", 0.5); c("SETP", "SIGNAL.2", "f", 50.0)
    c("SETP", "SIGNAL.2", "offset", 1.5); c("OUTNODE", "SIGNAL.2", 0, "px")
    c("OUTNODE", "TIME.1", 0, "tm"); c("INNODE", "GAIN.1", 0, "tm"); c("SETP", "GAIN.1", "r0", 100.0); c("OUTNODE", "GAIN.1", 0, "py")
    c("INNODE", "POW.1", 0, "px"); c("INNODE", "POW.1", 1, "py"); c("OUTNODE", "POW.1", 0, "pw")

    # ------------------------------------------------ as TFs, escritas de jeitos diferentes
    pedidos = [("TF.1", {"num": "1", "den": f"1 + {TAU} s"}, [1.0], [1.0, TAU]),
               ("TF.2", {"num": "1", "den": "1 + 2*0.5/1000 s + 1e-6 s^2"}, [1.0], [1.0, 2 * ZETA / WN, 1 / WN ** 2]),
               ("TF.3", {"num": [1.0, 2 / W0, 1 / W0 ** 2], "den": "1"}, [1.0, 2 / W0, 1 / W0 ** 2], [1.0]),
               ("TF.4", {"num": f"(1 + s/{W0!r})^3", "den": f"1, {1 / (2 * W0)!r}"},
                [1.0, 3 / W0, 3 / W0 ** 2, 1 / W0 ** 3], [1.0, 1 / (2 * W0)])]
    for n, corpo, num, den in pedidos:
        r = api("editor/mede", {"nome": n, "tipo": "H", "descr": f"{n}: H(s)", **corpo})
        ok("ERRO" not in r and perto(h(r, n)["num"], num) and perto(h(r, n)["den"], den),
           f"{n}: {corpo} → num {h(r, n) and h(r, n)['num']}, den {h(r, n) and h(r, n)['den']} ({r.get('erro')})")

    # ------------------------------------------------ polos, zeros e ganho; o desfazer
    r = api("editor/mede", {"nome": "TF.1", "tipo": "H", "zeros": "", "polos": "-500+866j", "ganho": "1e6"})
    esp = np.real(np.poly([-500 + 866j, -500 - 866j]))[::-1].tolist()
    ok("ERRO" not in r and perto(h(r, "TF.1")["num"], [1e6]) and perto(h(r, "TF.1")["den"], esp),
       f"polos −500 ± 866j (o conjugado entra sozinho), k = 1e6: num {h(r, 'TF.1') and h(r, 'TF.1')['num']}, den {h(r, 'TF.1') and h(r, 'TF.1')['den']} (numpy.poly: {esp})")
    r = api("editor/mede", {"nome": "TF.1", "tipo": "H", "zeros": [-100], "polos": [-1000, -10000], "ganho": 2})
    ok("ERRO" not in r and perto(h(r, "TF.1")["num"], [200.0, 2.0]) and perto(h(r, "TF.1")["den"], [1e7, 11000.0, 1.0]),
       f"zpk pela lista: 2(s + 100)/((s + 1000)(s + 10000)) → num {h(r, 'TF.1') and h(r, 'TF.1')['num']}, den {h(r, 'TF.1') and h(r, 'TF.1')['den']}")
    api("editor/desfazer", {}); r = api("editor/desfazer", {})
    ok(perto(h(r, "TF.1")["num"], [1.0]) and perto(h(r, "TF.1")["den"], [1.0, TAU]),
       f"desfazer duas vezes: a TF.1 volta a 1/(1 + τs) ({h(r, 'TF.1')})")

    # ------------------------------------------------ os erros (pt e en); nada muda
    antes = h(api("editor/estado"), "TF.2")
    casos = [({"num": "1", "den": "0"}, "denominador não pode ser zero", "denominator cannot be zero"),
             ({"num": "1 + s + s^2 + s^3 + s^4", "den": "1 + s"}, "grau do numerador (4) passa", "numerator degree (4) exceeds"),
             ({"num": "1", "den": [1.0] * 21}, "grau 20", "degree 20"),
             ({"num": "1", "den": "s^20"}, "expoente é um inteiro de 0 a 19", "exponent is an integer from 0 to 19"),
             ({"num": "1 + x", "den": "1"}, "numerador: não entendi", "numerator: could not read"),
             ({"num": "1", "den": "1 + 1e999 s"}, "denominador: só números finitos", "denominator: finite numbers only"),
             ({"num": "1", "den": "1/s"}, "só se divide por número", "divide by numbers only"),
             ({"num": "", "den": "1"}, "numerador está vazio", "numerator is empty"),
             ({"num": "1", "den": "1, s"}, "na lista, só números", "the list takes numbers only")]
    for corpo, pt, en in casos:
        rp = api("editor/mede", {"nome": "TF.2", "tipo": "H", **corpo})
        re_ = api("editor/mede", {"nome": "TF.2", "tipo": "H", **corpo}, lingua="en")
        ok(rp.get("ERRO") and pt in rp.get("erro", "") and re_.get("ERRO") and en in re_.get("erro", ""),
           f"recusado {corpo}: “{rp.get('erro')}” / “{re_.get('erro')}”")
    rp = api("editor/mede", {"nome": "GAIN.1", "tipo": "H", "num": "1", "den": "1 + s"})
    ok(rp.get("ERRO") and "não é uma função de transferência" in rp.get("erro", ""), f"um GAIN não é TF: {rp.get('erro')}")
    ok(perto(h(api("editor/estado"), "TF.2")["den"], antes["den"]), "os recusados não mudaram a TF.2")

    # ------------------------------------------------ a rodada
    dt, tfim = 1e-6, 0.04
    r = api("editor/rodar", {"dt": str(dt), "tfim": str(tfim), "nome": "tf_api", "amostras": "4000"})
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.4); r = api("editor/rodada")
    feitas.append(r.get("arquivo"))
    if r.get("estado") != "fim":
        ok(False, f"a rodada não terminou ({r.get('estado')}: {r.get('erro')})")
    else:
        a = r["arquivo"]; z = np.load(a if os.path.isabs(a) else RAIZ / a)
        t = z["t"]
        falta = [k for k in ("y_tf1", "y_pt1", "y_tf2", "w", "y_d2", "y_d3", "px", "py", "pw") if k not in z.files]
        ok(not falta, f"os sinais na rodada (faltam: {falta})")
        if not falta:
            y1, yp = z["y_tf1"], z["y_pt1"]; m = t <= 5 * TAU
            ana = 1 - np.exp(-t / TAU)
            e_tp, e_ta = float(np.max(np.abs(y1 - yp)[m])), float(np.max(np.abs(y1 - ana)[m]))
            k = int(np.argmin(np.abs(t - TAU)))
            ok(e_tp < 2e-3 and e_ta < 2e-3, f"1ª ordem: TF 1/(1 + τs) × PT1 (T = τ): diferença máxima {e_tp:.2e}; TF × 1 − e^(−t/τ): {e_ta:.2e}; "
                                            f"em t = τ: TF {y1[k]:.4f}, PT1 {yp[k]:.4f}, esperado {1 - math.exp(-1):.4f}")
            y2 = z["y_tf2"]; wd = WN * math.sqrt(1 - ZETA ** 2)
            ana2 = 1 - np.exp(-ZETA * WN * t) * (np.cos(wd * t) + ZETA / math.sqrt(1 - ZETA ** 2) * np.sin(wd * t))
            kp = int(np.argmax(y2)); pico, tp = float(y2[kp]), float(t[kp])
            pico_a, tp_a = 1 + math.exp(-ZETA * math.pi / math.sqrt(1 - ZETA ** 2)), math.pi / wd
            ok(abs(pico - pico_a) < 2e-3 and abs(tp - tp_a) < 30e-6 and float(np.max(np.abs(y2 - ana2))) < 3e-3,
               f"2ª ordem (ωn = 1000 rad/s, ζ = 0,5): pico {pico:.4f} em {tp * 1e3:.3f} ms; analítico {pico_a:.4f} em {tp_a * 1e3:.3f} ms; "
               f"erro máximo da resposta {float(np.max(np.abs(y2 - ana2))):.2e}; em 40 ms: {float(y2[-1]):.4f}")
            w, yd2, yd3 = z["w"], z["y_d2"], z["y_d3"]; m2 = t >= 0.01
            ok(float(np.max(np.abs(w[m2] - np.sin(W0 * t[m2])))) < 1e-3, "a senoide de entrada: w = sin(ω₀t)")
            esp2 = 2 * np.cos(W0 * t)
            e2 = float(np.max(np.abs(yd2 - esp2)[m2]))
            ok(e2 < 0.01, f"(1 + s/ω₀)²·sin(ω₀t) = 2cos(ω₀t): erro máximo {e2:.2e} (sem o dt², seria sin + 2cos: erro ~1; "
                          f"medido em t = 20 ms: {float(yd2[np.argmin(np.abs(t - 0.02))]):.4f}, esperado 2)")
            H = (1 + 1j) ** 3 / (1 + 1j / 2)
            esp3 = abs(H) * np.sin(W0 * t + np.angle(H))
            e3 = float(np.max(np.abs(yd3 - esp3)[m2]))
            ok(e3 < 0.002 * abs(H), f"(1 + s/ω₀)³/(1 + s/(2ω₀)) em regime: |H(jω₀)| = {abs(H):.4f}, ∠ = {math.degrees(np.angle(H)):.2f}°; "
                                   f"pico medido {float(np.max(yd3[m2])):.4f}; erro máximo {e3:.2e}")
            px, py, pw = z["px"], z["py"], z["pw"]; m3 = t > 1e-4
            rel = float(np.max(np.abs(pw[m3] - px[m3] ** py[m3]) / np.maximum(1.0, np.abs(px[m3] ** py[m3]))))
            ok(rel < 1e-9 and float(py[-1]) > 3.9 and float(np.ptp(px)) > 0.99,
               f"POW com as duas entradas: x^y contra o numpy, erro relativo máximo {rel:.1e} (x de {float(px.min()):.3f} a {float(px.max()):.3f}, "
               f"y até {float(py[-1]):.3f}; pw em 40 ms = {float(pw[-1]):.4f})")

    # ------------------------------------------------ salvar e reabrir
    s = api("editor/salvar", {"nome": SALVO.stem, "pasta": "circuitos", "sobrescrever": True})
    j2 = api("editor/abrir", {"arq": str(SALVO), "modo": "descartar"})
    b = SALVO.read_bytes(); txt = gzip.decompress(b).decode() if b[:2] == b"\x1f\x8b" else b.decode()
    bloco = re.search(r"idStringDialog TF\.4\n(.*?)<\\ElementCONTROL>", txt, re.S)
    ok("ERRO" not in s and all(perto(h(j2, n)["num"], num) and perto(h(j2, n)["den"], den) for n, _, num, den in pedidos[1:])
       and bloco and "polynomMode true" in bloco.group(1) and re.search(r"\nnominatorPolynom 1\.0 ", bloco.group(1)),
       f"salvar e reabrir: os polinômios de TF.2, TF.3 e TF.4 e o polynomMode true no arquivo ({h(j2, 'TF.4')})")

    # ------------------------------------------------ o DELAY: T/Δt com tolerância (70 µs / 10 µs = 6,999… → 7 passos)
    api("editor/novo", {"modo": "descartar"})
    for a in (("TIME.1", 4, 6, "TIME"), ("DELAY.1", 10, 6, "DELAY")):
        c("CREATE", *a)
    c("OUTNODE", "TIME.1", 0, "tx"); c("INNODE", "DELAY.1", 0, "tx"); c("OUTNODE", "DELAY.1", 0, "td"); c("SETP", "DELAY.1", "T", 7e-5)
    r = api("editor/rodar", {"dt": "1e-5", "tfim": "0.001", "nome": "tf_api_delay", "amostras": "100"})
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.4); r = api("editor/rodada")
    feitas.append(r.get("arquivo"))
    if r.get("estado") != "fim":
        ok(False, f"a rodada do DELAY não terminou ({r.get('estado')}: {r.get('erro')})")
    else:
        a = r["arquivo"]; z = np.load(a if os.path.isabs(a) else RAIZ / a)
        tx, td = z["tx"], z["td"]; m = tx > 2e-4
        passos = np.round((tx[m] - td[m]) / 1e-5)
        ok(len(passos) > 50 and np.all(passos == 7), f"DELAY T = 70 µs, Δt = 10 µs: atraso de {sorted(set(passos.astype(int).tolist()))} passos (esperado 7; "
                                                     f"(int)(7e-5/1e-5) = {int(7e-5 / 1e-5)})")
finally:
    for a in feitas:                                     # a rodada do teste não fica entre as do usuário de teste
        if a:
            p = Path(a) if os.path.isabs(a) else RAIZ / a
            shutil.rmtree(p.parent, ignore_errors=True)
    for f in CIRC.glob(SALVO.stem + ".*"):
        f.unlink()
    api("editor/novo", {"modo": "descartar"})
print("FALHA" if falhas else "OK", f"tf_api: {falhas} falha(s)")
raise SystemExit(1 if falhas else 0)
