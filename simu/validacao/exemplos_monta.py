"""Monta os modelos de exemplo do MaiSim (pedido de Marcelo, 22/10: "nós mesmos criamos uns modelos de exemplo, com scopes e
tags: retificador trifásico, buck, boost, buck-boost e um inversor full-bridge monofásico"), em malha aberta, com o PWM no
Gecko (portadora SIGNAL + comparador GE, a razão cíclica num CONST — sem código), os medidores nomeados para o scope.

Na instância de teste (7201): monta cada um, roda uma vez (o .ipes guarda Δt e o tempo final) e salva em circuitos/; com
--exemplos, copia para exemplos/ do repositório. A conferência dos números fica em exemplos_api.py.
    python3 exemplos_monta.py [buck boost buck_boost retificador inversor] [--exemplos]"""
import json, math, re, shutil, sys, time, urllib.request
from pathlib import Path

_CONF = Path(__file__).resolve().parents[2] / "config/teste.env"     # a porta do simulador de teste (o perfil config/teste.env)
_PORTA = re.search(r"(?m)^MAISIM_PORTA_SIMU=(\d+)", _CONF.read_text()) if _CONF.exists() else None
B = f"http://localhost:{_PORTA.group(1) if _PORTA else 7201}/maisim/simu/"
CIRC = Path.home() / ".cache/maisim_teste/circuitos"
EXEMPLOS = Path(__file__).resolve().parents[2] / "exemplos"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": json.loads(e.read() or b"{}")}


def ok(r, o):
    if "ERRO" in r:
        sys.exit(f"ERRO {o}: {r['ERRO']}")
    return r


def cmd(op, *args):
    return ok(api("editor/cmd", {"op": op, "args": list(args)}), (op, args))


def els():
    return {e["nome"]: e for e in api("editor/estado")["folhas"]["0"]["elementos"]}


# orientação dos de dois terminais (o terminal 0 é o + da fonte, o anodo do diodo, o coletor da chave, o início do L):
# 503 = 0 em cima, 1 embaixo; 501 = 0 embaixo, 1 em cima; 502 = 0 à esquerda, 1 à direita; 504 = 0 à direita, 1 à esquerda
def poe(nome, x, y, tipo, d=None, **par):
    cmd("CREATE", nome, x, y, tipo)
    if d is not None:
        for _ in range(4):
            if els()[nome]["dir"] == d:
                break
            cmd("ROTATE", nome)
        assert els()[nome]["dir"] == d, (nome, els()[nome]["dir"])
    for k, v in par.items():
        cmd("SETP", nome, k, v)


def fio(rotulo, *pts):
    ok(api("editor/fio", {"acao": "novo", "cantos": [list(p) for p in pts], "dom": "LK", "rotulo": rotulo}), (rotulo, pts))


def sinal(nome, x, y, tipo, saida=None, entradas=(), **par):
    """Um bloco de controle ligado por rótulos (a saída e as entradas)."""
    cmd("CREATE", nome, x, y, tipo)
    for k, v in par.items():
        cmd("SETP", nome, k, v)
    for i, r in enumerate(entradas):
        cmd("INNODE", nome, i, r)
    if saida:
        cmd("OUTNODE", nome, 0, saida)


def gate(nome, x, y, entrada, chave):
    sinal(nome, x, y, "GATE", entradas=(entrada,))
    ok(api("editor/mede", {"nome": nome, "tipo": "G", "componente": chave}), (nome, chave))


def mede(nome, x, y, rotulo, **o):
    tipo = "VOLT" if "no1" in o else "AMP"
    sinal(nome, x, y, tipo, saida=rotulo)
    ok(api("editor/mede", dict(nome=nome, tipo="V" if tipo == "VOLT" else "I", **o)), nome)


def pwm(x, y, d, fsw, saida="g"):
    """PWM no Gecko: a razão cíclica d (CONST "d") contra a portadora triangular de 0 a 1 (SIGNAL "portadora"): g = d ≥ portadora."""
    sinal("CONST.1", x, y, "CONST", saida="d", const=d)
    sinal("SIGNAL.1", x, y + 4, "SIGNAL", saida="portadora", type=403, amplMAX=0.5, offset=0.5, f=fsw)
    sinal("GE.1", x + 8, y + 2, "GE", saida=saida, entradas=("d", "portadora"))


def tira_globais_sem_uso():
    """A folha nova do Gecko já vem com as variáveis $ do circuito de antes (as do MMC): fica só o que algum componente usa."""
    r = api("editor/estado")
    usadas = {v for f in r["folhas"].values() for e in f["elementos"] for k, v in e["par"].items() if k.endswith("_var") and v}
    sobra = sorted(set(r.get("globais", {})) - usadas)
    if sobra:
        ok(api("editor/variavel", {"acao": "apaga", "nomes": sobra}), ("apaga", sobra))


# ---------------------------------------------------------------- os circuitos
def buck_planta():
    """A potência do buck (o exemplo_buck e o buck com PI em blocos): 48 V, 20 kHz, L 1 mH, C 100 µF, R 10 Ω; a chave S.1."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=48.0)
    poe("S.1", 8, 6, "S", 502); poe("D.1", 12, 10, "D", 501); poe("L.1", 16, 6, "L", 502, L=1e-3)
    poe("C.1", 20, 10, "C", 503, C=100e-6); poe("R.1", 24, 10, "R", 503, R=10.0)
    fio("vin", (4, 8), (4, 6), (6, 6)); fio("sw", (10, 6), (14, 6)); fio("", (12, 8), (12, 6))
    fio("o", (18, 6), (24, 6), (24, 8)); fio("", (20, 8), (20, 6))
    fio("gnd", (4, 12), (4, 14), (24, 14), (24, 12)); fio("", (12, 12), (12, 14)); fio("", (20, 12), (20, 14))


def buck():
    """Buck: 48 V, d = 0,5 (V_o ≈ 24 V), 20 kHz, L 1 mH, C 100 µF, R 10 Ω."""
    buck_planta()
    pwm(4, 20, 0.5, 20e3); gate("GATE.1", 20, 22, "g", "S.1")
    mede("VOLT.1", 30, 6, "v_o", no1="o", no2="gnd"); mede("AMP.1", 30, 10, "i_L", componente="L.1"); mede("VOLT.2", 30, 14, "v_sw", no1="sw", no2="gnd")
    return dict(dt=0.5e-6, tfim=0.02, amostras=8000)


def buck_degrau():
    """O buck com um degrau de carga (o vídeo do site, Marcelo 23/10): aos 10 ms, uma 2ª carga de 10 Ω entra pela chave S.2
    (R de 10 para 5 Ω: i_L de 2,4 para 4,8 A; a v_o afunda, oscila e volta). O degrau é a onda quadrada do Gecko (404) de
    período longo (25 Hz), deslocada 90° para subir aos 10 ms."""
    buck()
    for m in ("VOLT.1", "AMP.1", "VOLT.2"):
        cmd("MOVE", m, 36, {"VOLT.1": 6, "AMP.1": 10, "VOLT.2": 14}[m])
    poe("S.2", 28, 8, "S", 503); poe("R.2", 28, 12, "R", 503, R=10.0)
    fio("o", (24, 6), (28, 6)); fio("gnd", (24, 14), (28, 14))
    sinal("SIGNAL.2", 4, 30, "SIGNAL", saida="carga", type=404, amplMAX=1.0, offset=0.0, f=25.0, d=0.5, phase=90.0)
    gate("GATE.2", 20, 30, "carga", "S.2")
    return dict(dt=0.5e-6, tfim=0.02, amostras=8000)


def buck_pi_blocos():
    """O buck com a malha de tensão toda em blocos (v0.3.1, Marcelo 25/10: "controlar tudo no circuito, sem Python"): a
    potência do exemplo_buck, a referência v_ref de 24 V que sobe para 30 V aos 20 ms (TIME ≥ 20 ms → GAIN 6 → ADD com o
    CONST de 24 V) e, aos 40 ms, a 2ª carga de 10 Ω pela chave S.2 (R de 10 para 5 Ω; TIME ≥ 40 ms → GATE.2).
    A malha: erro = v_ref − v_o (SUB) → PI (r0 = Kp, a1 = Ki: y = Kp·x + Ki·∫x) → LIMIT de 0 a 0,95 → a razão cíclica d
    contra a portadora triangular de 0 a 1 a 20 kHz (GE) → GATE.1 → S.1.
    O ajuste pela planta LC (d → v_o: Vin/(LC·s² + (L/R)·s + 1), ω0 = 1/√(LC) = 3162 rad/s, Q = R·√(C/L) = 3,2 a 10 Ω):
    um PI de integral dominante, o cruzamento ωc ≈ Ki·Vin = 480 rad/s abaixo de ω0/Q ≈ 1000 rad/s (o pico da ressonância
    fica abaixo de 0 dB) com Ki = 10 1/(V·s); Kp = 0,005 1/V (Kp·Vin·Q = 0,76 < 1) põe o zero do PI em Ki/Kp = 2000 rad/s,
    o que dá fase perto da ressonância: margem de fase ≈ 100°, de ganho ≈ 12 dB. O PI do Gecko não tem anti-windup, e
    aqui nem precisa: com esse ganho a d não chega ao limite (no máximo ≈ 0,7)."""
    buck_planta()
    poe("S.2", 28, 8, "S", 503); poe("R.2", 28, 12, "R", 503, R=10.0)
    fio("o", (24, 6), (28, 6)); fio("gnd", (24, 14), (28, 14))
    # a referência e o degrau de carga (o tempo da simulação contra os instantes)
    sinal("TIME.1", 4, 20, "TIME", saida="tempo")
    sinal("CONST.1", 4, 24, "CONST", saida="t_ref", const=0.02)
    sinal("GE.1", 12, 22, "GE", saida="degrau_ref", entradas=("tempo", "t_ref"))
    sinal("GAIN.1", 20, 22, "GAIN", saida="dv_ref", entradas=("degrau_ref",), r0=6.0)
    sinal("CONST.2", 20, 26, "CONST", saida="v_ref0", const=24.0)
    sinal("ADD.1", 28, 24, "ADD", saida="v_ref", entradas=("v_ref0", "dv_ref"))
    sinal("CONST.3", 4, 32, "CONST", saida="t_carga", const=0.04)
    sinal("GE.2", 12, 32, "GE", saida="carga", entradas=("tempo", "t_carga"))
    gate("GATE.2", 20, 32, "carga", "S.2")
    # a malha de tensão e o PWM
    sinal("SUB.1", 36, 24, "SUB", saida="erro", entradas=("v_ref", "v_o"))
    sinal("PI.1", 44, 24, "PI", saida="u", entradas=("erro",), r0=0.005, a1=10.0)
    sinal("LIMIT.1", 52, 24, "LIMIT", saida="d", entradas=("u",), min=0.0, max=0.95)
    sinal("SIGNAL.1", 52, 28, "SIGNAL", saida="portadora", type=403, amplMAX=0.5, offset=0.5, f=20e3)
    sinal("GE.3", 60, 26, "GE", saida="g", entradas=("d", "portadora"))
    gate("GATE.1", 68, 26, "g", "S.1")
    mede("VOLT.1", 34, 6, "v_o", no1="o", no2="gnd"); mede("AMP.1", 34, 10, "i_L", componente="L.1")
    mede("VOLT.2", 34, 14, "v_sw", no1="sw", no2="gnd")
    return dict(dt=0.5e-6, tfim=0.06, amostras=12000)


def boost():
    """Boost: 24 V, d = 0,5 (V_o ≈ 48 V), 20 kHz, L 1 mH, C 47 µF, R 40 Ω."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=24.0)
    poe("L.1", 8, 6, "L", 502, L=1e-3); poe("S.1", 12, 10, "S", 503); poe("D.1", 16, 6, "D", 502)
    poe("C.1", 20, 10, "C", 503, C=47e-6); poe("R.1", 24, 10, "R", 503, R=40.0)
    fio("vin", (4, 8), (4, 6), (6, 6)); fio("sw", (10, 6), (14, 6)); fio("", (12, 8), (12, 6))
    fio("o", (18, 6), (24, 6), (24, 8)); fio("", (20, 8), (20, 6))
    fio("gnd", (4, 12), (4, 14), (24, 14), (24, 12)); fio("", (12, 12), (12, 14)); fio("", (20, 12), (20, 14))
    pwm(4, 20, 0.5, 20e3); gate("GATE.1", 20, 22, "g", "S.1")
    mede("VOLT.1", 30, 6, "v_o", no1="o", no2="gnd"); mede("AMP.1", 30, 10, "i_L", componente="L.1"); mede("VOLT.2", 30, 14, "v_sw", no1="sw", no2="gnd")
    return dict(dt=0.5e-6, tfim=0.04, amostras=8000)


def buck_boost():
    """Buck-boost (inversor de polaridade): 24 V, d = 0,5 (V_o ≈ −24 V), 20 kHz, L 1 mH, C 47 µF, R 20 Ω."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=24.0)
    poe("S.1", 8, 6, "S", 502); poe("L.1", 12, 10, "L", 503, L=1e-3); poe("D.1", 16, 6, "D", 504)   # o anodo na saída (negativa)
    poe("C.1", 20, 10, "C", 503, C=47e-6); poe("R.1", 24, 10, "R", 503, R=20.0)
    fio("vin", (4, 8), (4, 6), (6, 6)); fio("sw", (10, 6), (14, 6)); fio("", (12, 8), (12, 6))
    fio("o", (18, 6), (24, 6), (24, 8)); fio("", (20, 8), (20, 6))
    fio("gnd", (4, 12), (4, 14), (24, 14), (24, 12)); fio("", (12, 12), (12, 14)); fio("", (20, 12), (20, 14))
    pwm(4, 20, 0.5, 20e3); gate("GATE.1", 20, 22, "g", "S.1")
    mede("VOLT.1", 30, 6, "v_o", no1="o", no2="gnd"); mede("AMP.1", 30, 10, "i_L", componente="L.1"); mede("VOLT.2", 30, 14, "v_sw", no1="sw", no2="gnd")
    return dict(dt=0.5e-6, tfim=0.04, amostras=8000)


def retificador():
    """Retificador trifásico a diodos (ponte de 6 pulsos): 127/220 V, 60 Hz, carga RL (20 Ω, 50 mH): V_dc ≈ 1,35·220 ≈ 297 V."""
    for k, (f, fase) in enumerate((("a", 0.0), ("b", -120.0), ("c", 120.0))):
        x = 4 + 4 * k
        poe(f"U.{k + 1}", x, 6, "U", 503, type=402, uMAX=179.6, f=60.0, phase=fase)
        fio(f, (x, 4), (x, 2))                             # o + de cada fase: o rótulo a, b, c (ligado à ponte pelo nome)
    fio("n", (4, 8), (4, 10), (12, 10), (12, 8)); fio("", (8, 8), (8, 10))     # o neutro
    for k, f in enumerate("abc"):                          # as pernas: diodo de cima (anodo na fase) e de baixo (catodo na fase)
        x = 20 + 4 * k
        poe(f"D.{k + 1}", x, 6, "D", 501); poe(f"D.{k + 4}", x, 12, "D", 501)
        fio(f, (x, 8), (x, 10))
    poe("R.1", 36, 6, "R", 503, R=20.0); poe("L.1", 36, 12, "L", 503, L=50e-3)
    fio("p", (20, 4), (36, 4)); fio("neg", (20, 14), (36, 14)); fio("", (36, 8), (36, 10))
    mede("VOLT.1", 42, 4, "v_dc", no1="p", no2="neg"); mede("AMP.1", 42, 8, "i_dc", componente="L.1")
    mede("AMP.2", 42, 12, "i_a", componente="U.1"); mede("VOLT.2", 42, 16, "v_an", no1="a", no2="n"); mede("VOLT.3", 42, 20, "v_ab", no1="a", no2="b")
    return dict(dt=1e-6, tfim=0.05, amostras=10000)


def inversor():
    """Inversor monofásico em ponte completa, SPWM bipolar: 200 V, m = 0,8 (fundamental de v_ab ≈ 160 V de pico), 60 Hz,
    portadora de 5 kHz, carga RL (10 Ω, 10 mH). S1 e S4 juntas (g1 = ref ≥ portadora), S2 e S3 com o contrário (g2)."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=200.0)
    for nome, x, y in (("S.1", 12, 6), ("S.2", 12, 12), ("S.3", 20, 6), ("S.4", 20, 12)):
        poe(nome, x, y, "S", 503)
    fio("p", (4, 8), (4, 4), (20, 4)); fio("neg", (4, 12), (4, 14), (20, 14))
    fio("a", (12, 8), (12, 10)); fio("b", (20, 8), (20, 10))
    poe("R.1", 14, 18, "R", 502, R=10.0); poe("L.1", 18, 18, "L", 502, L=10e-3)
    fio("a", (12, 18), (10, 18)); fio("b", (20, 18), (22, 18))   # a carga: ligada às pernas pelos rótulos a e b
    sinal("SIGNAL.1", 4, 24, "SIGNAL", saida="ref", type=402, amplMAX=0.8, offset=0.0, f=60.0)
    sinal("SIGNAL.2", 4, 28, "SIGNAL", saida="portadora", type=403, amplMAX=1.0, offset=0.0, f=5e3)
    sinal("GE.1", 12, 26, "GE", saida="g1", entradas=("ref", "portadora")); sinal("NOT.1", 18, 30, "NOT", saida="g2", entradas=("g1",))
    gate("GATE.1", 24, 24, "g1", "S.1"); gate("GATE.2", 24, 26, "g1", "S.4"); gate("GATE.3", 24, 28, "g2", "S.2"); gate("GATE.4", 24, 30, "g2", "S.3")
    mede("VOLT.1", 30, 6, "v_ab", no1="a", no2="b"); mede("AMP.1", 30, 10, "i_o", componente="L.1")
    return dict(dt=1e-6, tfim=0.05, amostras=10000)


def liga_var(componente, parametro, nome, valor):
    """O parâmetro ligado a uma variável $ (criada com o valor, se ainda não existe): mudar a variável muda todos."""
    ok(api("editor/variavel", {"acao": "liga", "componente": componente, "parametro": parametro, "nome": nome, "valor": valor}), (componente, nome))


def pontes_spwm(fases, m, fsw, f=60.0, y=30):
    """SPWM: uma referência senoidal por fase (amplitude m) contra a portadora triangular de −1 a 1; g_k = ref_k ≥ portadora e
    o complementar n_k (NOT). Devolve {fase: (g, n)}."""
    sinal("SIGNAL.9", 4, y, "SIGNAL", saida="portadora", type=403, amplMAX=1.0, offset=0.0, f=fsw)
    out = {}
    for k, (fase, ang) in enumerate(fases):
        yy = y + 4 + 4 * k
        sinal(f"SIGNAL.{k + 1}", 4, yy, "SIGNAL", saida=f"ref_{fase}", type=402, amplMAX=m, offset=0.0, f=f, phase=ang)
        sinal(f"GE.{k + 1}", 12, yy, "GE", saida=f"g_{fase}", entradas=(f"ref_{fase}", "portadora"))
        sinal(f"NOT.{k + 1}", 18, yy + 2, "NOT", saida=f"n_{fase}", entradas=(f"g_{fase}",))
        out[fase] = (f"g_{fase}", f"n_{fase}")
    return out


def perna(x, no, sup, inf):
    """Uma perna: a chave de cima (de p ao nó) e a de baixo (do nó a neg), o nó com o rótulo."""
    poe(sup, x, 6, "S", 503); poe(inf, x, 12, "S", 503)
    fio(no, (x, 8), (x, 10))


def inversor_trifasico():
    """Inversor trifásico de dois níveis, SPWM senoidal: 400 V, m = 0,8 (fundamental da tensão de linha ≈ 0,866·m·V_dc ≈ 277 V
    de pico), 60 Hz, portadora de 5 kHz, carga RL em estrela (10 Ω, 10 mH)."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=400.0)
    for k, f in enumerate("abc"):
        perna(12 + 8 * k, f, f"S.{k + 1}", f"S.{k + 4}")
    fio("p", (4, 8), (4, 4), (28, 4)); fio("neg", (4, 12), (4, 14), (28, 14))
    for k, f in enumerate("abc"):                          # a carga em estrela (o centro: n), ligada às pernas pelos rótulos
        yy = 18 + 4 * k
        poe(f"R.{k + 1}", 36, yy, "R", 502, R=10.0); poe(f"L.{k + 1}", 42, yy, "L", 502, L=10e-3)
        fio(f, (34, yy), (32, yy)); fio("", (38, yy), (40, yy))
    fio("n", (44, 18), (44, 26))
    g = pontes_spwm((("a", 0.0), ("b", -120.0), ("c", 120.0)), 0.8, 5e3)
    for k, f in enumerate("abc"):
        gate(f"GATE.{k + 1}", 26, 34 + 4 * k, g[f][0], f"S.{k + 1}"); gate(f"GATE.{k + 4}", 30, 36 + 4 * k, g[f][1], f"S.{k + 4}")
    mede("VOLT.1", 50, 6, "v_ab", no1="a", no2="b"); mede("VOLT.2", 50, 10, "v_an", no1="a", no2="n")
    for k, f in enumerate("abc"):
        mede(f"AMP.{k + 1}", 50, 14 + 4 * k, f"i_{f}", componente=f"L.{k + 1}")
    return dict(dt=1e-6, tfim=0.05, amostras=10000)


def inversor_meia_ponte():
    """Inversor monofásico em meia ponte, SPWM: 2 × 100 V (o ponto médio m), m = 0,8 (fundamental de v_am ≈ 80 V de pico),
    60 Hz, portadora de 5 kHz, carga RL (10 Ω, 10 mH) entre a perna e o ponto médio."""
    poe("U.1", 4, 6, "U", 503, type=401, uDC=100.0); poe("U.2", 4, 12, "U", 503, type=401, uDC=100.0)
    fio("m", (4, 8), (4, 10))
    perna(12, "a", "S.1", "S.2")
    fio("p", (4, 4), (12, 4)); fio("neg", (4, 14), (12, 14))
    poe("R.1", 18, 18, "R", 502, R=10.0); poe("L.1", 22, 18, "L", 502, L=10e-3)
    fio("a", (16, 18), (14, 18)); fio("m", (24, 18), (26, 18))
    g = pontes_spwm((("a", 0.0),), 0.8, 5e3)
    gate("GATE.1", 26, 34, g["a"][0], "S.1"); gate("GATE.2", 26, 38, g["a"][1], "S.2")
    mede("VOLT.1", 32, 6, "v_am", no1="a", no2="m"); mede("AMP.1", 32, 10, "i_o", componente="L.1")
    return dict(dt=1e-6, tfim=0.05, amostras=10000)


def ponte_h_cc():
    """Ponte H CC (quatro quadrantes), PWM bipolar: 100 V, d = 0,75 (v_ab médio = (2d − 1)·V_dc = 50 V), 20 kHz, acionando
    um motor CC simples (R 1 Ω, L 10 mH e a f.c.e.m. E = 40 V): corrente média (50 − 40)/1 = 10 A."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=100.0)
    perna(12, "a", "S.1", "S.2"); perna(20, "b", "S.3", "S.4")
    fio("p", (4, 8), (4, 4), (20, 4)); fio("neg", (4, 12), (4, 14), (20, 14))
    poe("R.1", 14, 18, "R", 502, R=1.0); poe("L.1", 18, 18, "L", 502, L=10e-3); poe("U.2", 22, 18, "U", 502, type=401, uDC=40.0)
    fio("a", (12, 18), (10, 18)); fio("b", (24, 18), (26, 18))
    sinal("CONST.1", 4, 30, "CONST", saida="d", const=0.75)
    sinal("SIGNAL.1", 4, 34, "SIGNAL", saida="portadora", type=403, amplMAX=0.5, offset=0.5, f=20e3)
    sinal("GE.1", 12, 32, "GE", saida="g1", entradas=("d", "portadora")); sinal("NOT.1", 18, 34, "NOT", saida="g2", entradas=("g1",))
    gate("GATE.1", 26, 30, "g1", "S.1"); gate("GATE.2", 26, 32, "g1", "S.4"); gate("GATE.3", 26, 34, "g2", "S.2"); gate("GATE.4", 26, 36, "g2", "S.3")
    mede("VOLT.1", 32, 6, "v_ab", no1="a", no2="b"); mede("AMP.1", 32, 10, "i_a", componente="L.1")
    return dict(dt=0.5e-6, tfim=0.05, amostras=10000)


def retificador_monofasico():
    """Retificador monofásico em ponte com filtro capacitivo: 127 V, 60 Hz, R da rede 1 Ω, C 1000 µF, carga 100 Ω: a tensão
    perto do pico (≈ 165 V) com a ondulação de 120 Hz e a corrente da rede em picos."""
    poe("U.1", 4, 10, "U", 503, type=402, uMAX=179.6, f=60.0, phase=0.0)
    poe("R.1", 8, 4, "R", 502, R=1.0)
    fio("s", (4, 8), (4, 4), (6, 4)); fio("a", (10, 4), (12, 4)); fio("b", (4, 12), (4, 14), (6, 14))
    for k, (x, f) in enumerate(((16, "a"), (20, "b"))):
        poe(f"D.{k + 1}", x, 6, "D", 501); poe(f"D.{k + 3}", x, 12, "D", 501)
        fio(f, (x, 8), (x, 10))
    poe("C.1", 26, 6, "C", 503, C=1e-3); poe("R.2", 32, 6, "R", 503, R=100.0)
    fio("p", (16, 4), (32, 4)); fio("neg", (16, 14), (32, 14)); fio("", (26, 8), (26, 14)); fio("", (32, 8), (32, 14))
    mede("VOLT.1", 38, 4, "v_s", no1="s", no2="b"); mede("AMP.1", 38, 8, "i_s", componente="R.1")
    mede("VOLT.2", 38, 12, "v_dc", no1="p", no2="neg"); mede("AMP.2", 38, 16, "i_o", componente="R.2")
    return dict(dt=1e-6, tfim=0.1, amostras=10000)


def retificador_controlado():
    """Retificador trifásico controlado (ponte de 6 tiristores): 127/220 V, 60 Hz, carga RL (20 Ω, 50 mH), α = 30°:
    V_dc ≈ 1,35·220·cos α ≈ 257 V. Cada tiristor conduz numa janela de 120° (a referência senoidal dele ≥ 0,5) atrasada
    de α: o atraso é $t_alfa = α/(360·f) — mude-o para mudar α (30° a 60 Hz: 1,389 ms)."""
    for k, (f, fase) in enumerate((("a", 0.0), ("b", -120.0), ("c", 120.0))):
        x = 4 + 4 * k
        poe(f"U.{k + 1}", x, 6, "U", 503, type=402, uMAX=179.6, f=60.0, phase=fase)
        fio(f, (x, 4), (x, 2))
    fio("n", (4, 8), (4, 10), (12, 10), (12, 8)); fio("", (8, 8), (8, 10))
    for k, f in enumerate("abc"):                          # T1, T2, T3 em cima (a, b, c); T4, T5, T6 embaixo
        x = 20 + 4 * k
        poe(f"THYR.{k + 1}", x, 6, "THYR", 501); poe(f"THYR.{k + 4}", x, 12, "THYR", 501)
        fio(f, (x, 8), (x, 10))
    poe("R.1", 36, 6, "R", 503, R=20.0); poe("L.1", 36, 12, "L", 503, L=50e-3)
    fio("p", (20, 4), (36, 4)); fio("neg", (20, 14), (36, 14)); fio("", (36, 8), (36, 10))
    sinal("CONST.1", 4, 30, "CONST", saida="limiar", const=0.5)
    # a janela de cada um: a fase da referência (o de cima conduz no pico da fase; o de baixo, no vale)
    for k, (t, fase) in enumerate((("T1", 0.0), ("T2", -120.0), ("T3", 120.0), ("T4", 180.0), ("T5", 60.0), ("T6", -60.0))):
        yy = 34 + 4 * k
        sinal(f"SIGNAL.{k + 1}", 4, yy, "SIGNAL", saida=f"ref_{t}", type=402, amplMAX=1.0, offset=0.0, f=60.0, phase=fase)
        sinal(f"DELAY.{k + 1}", 12, yy, "DELAY", saida=f"atr_{t}", entradas=(f"ref_{t}",))
        liga_var(f"DELAY.{k + 1}", "T", "$t_alfa", 30.0 / (360 * 60))
        sinal(f"GE.{k + 1}", 18, yy, "GE", saida=f"g_{t}", entradas=(f"atr_{t}", "limiar"))
        gate(f"GATE.{k + 1}", 26, yy, f"g_{t}", f"THYR.{k + 1}")
    mede("VOLT.1", 42, 4, "v_dc", no1="p", no2="neg"); mede("AMP.1", 42, 8, "i_dc", componente="L.1")
    mede("VOLT.2", 42, 12, "v_an", no1="a", no2="n"); mede("AMP.2", 42, 16, "i_a", componente="U.1")
    return dict(dt=1e-6, tfim=0.05, amostras=10000)


def fio_t(rotulo, *pts):
    """Uma conexão térmica (a rede de Rth, Cth, DT, TREF e a saída do Pv)."""
    ok(api("editor/fio", {"acao": "novo", "cantos": [list(p) for p in pts], "dom": "THERM", "rotulo": rotulo}), (rotulo, pts))


def acopla(nome, x, y, tipo, saida=None, **o):
    """Um medidor térmico (TEMP: dois rótulos térmicos; FLOW: um Pv e a perda) ou o Pv (a peça que ele aquece), pela rota
    da tela (editor/mede); a saída com o nome que a tela daria (Tj_IGBT1, Pv_IGBT1…)."""
    if tipo == "Pv":
        poe(nome, x, y, "Pv")
        ok(api("editor/mede", dict(nome=nome, tipo="P", **o)), nome)
        return
    sinal(nome, x, y, tipo, saida=saida)
    ok(api("editor/mede", dict(nome=nome, tipo="T" if tipo == "TEMP" else "F", **o)), nome)


def buck_termico():
    """Buck com perdas e térmica (C1, 25/10): 48 V → 24 V, 20 kHz, L 1 mH, C 100 µF, R 2 Ω (i_L ≈ 12 A), com um IGBT e um
    diodo no modo simples de perdas do Gecko (uF 0,6 V, rON 10 mΩ, k_on/k_off e uK 400 V, os de fábrica). Cada um tem um Pv
    (a perda vira calor no nó térmico dele); o IGBT: Rth_jc 2 K/W, Rth_ca 3 K/W até o ambiente (DT, 25 °C sobre o TREF) e
    Cth 2 mJ/K na junção: Tj em regime = 25 + P·5 K/W, constante de tempo 5 K/W · 2 mJ/K = 10 ms; o diodo: Rth 4 K/W e
    Cth 1 mJ/K na junção (τ = 4 ms; sem a Cth, a Tj do diodo seguia cada pulso de perda: picos de ~350 °C, Marcelo, 25/10).
    Os medidores: Tj_IGBT1 e Tj_D1 (TEMP), Pv_IGBT1, Pcond_IGBT1, Psw_IGBT1 e Pv_D1 (FLOW), e a corrente e a tensão de
    cada um (para a conta à mão de exemplos_api.py e termica_api.py)."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=48.0)
    poe("IGBT.1", 8, 6, "IGBT", 502); poe("D.1", 12, 10, "D", 501); poe("L.1", 16, 6, "L", 502, L=1e-3)
    poe("C.1", 20, 10, "C", 503, C=100e-6); poe("R.1", 24, 10, "R", 503, R=2.0)
    fio("vin", (4, 8), (4, 6), (6, 6)); fio("sw", (10, 6), (14, 6)); fio("", (12, 8), (12, 6))
    fio("o", (18, 6), (24, 6), (24, 8)); fio("", (20, 8), (20, 6))
    fio("gnd", (4, 12), (4, 14), (24, 14), (24, 12)); fio("", (12, 12), (12, 14)); fio("", (20, 12), (20, 14))
    pwm(4, 20, 0.5, 20e3); gate("GATE.1", 20, 22, "g", "IGBT.1")
    # a rede térmica (embaixo): Pv.1 → Tj → Rth.1 (jc) → Tc → Rth.2 (ca) → Tamb = DT.1 (25 °C) sobre a referência (TREF.1);
    # Cth.1 da junção à referência, começando no ambiente (Temp(0) = 25: sem isso a junção parte de 0 °C); Pv.2 → Tjd → Rth.3 → Tamb,
    # com a Cth.2 do Tjd à referência (o mesmo Temp(0))
    acopla("Pv.1", 4, 34, "Pv", componente="IGBT.1")
    poe("Rth.1", 10, 34, "Rth", 502, Rth=2.0); poe("Rth.2", 16, 34, "Rth", 502, Rth=3.0)
    poe("Cth.1", 8, 38, "Cth", 503, Cth=2e-3, **{"Temp(0)": 25.0}); poe("DT.1", 20, 38, "DT", 503, T_DC=25.0)
    poe("TREF.1", 14, 43, "TREF")
    fio_t("Tj", (6, 34), (8, 34)); fio_t("", (8, 34), (8, 36)); fio_t("Tc", (12, 34), (14, 34))
    fio_t("Tamb", (18, 34), (20, 34), (20, 36))
    fio_t("ref", (8, 40), (8, 42), (14, 42)); fio_t("", (14, 42), (20, 42), (20, 40))
    acopla("Pv.2", 4, 48, "Pv", componente="D.1")
    poe("Rth.3", 10, 48, "Rth", 502, Rth=4.0)
    poe("Cth.2", 8, 52, "Cth", 503, Cth=1e-3, **{"Temp(0)": 25.0})
    fio_t("Tjd", (6, 48), (8, 48)); fio_t("", (8, 48), (8, 50)); fio_t("Tamb", (12, 48), (14, 48)); fio_t("ref", (8, 54), (8, 56))
    acopla("TEMP.1", 30, 30, "TEMP", "Tj_IGBT1", no1="Tj", no2="ref")
    acopla("TEMP.2", 30, 32, "TEMP", "Tj_D1", no1="Tjd", no2="ref")
    acopla("FLOW.1", 30, 36, "FLOW", "Pv_IGBT1", componente="Pv.1", losscomp="total")
    acopla("FLOW.2", 30, 38, "FLOW", "Pcond_IGBT1", componente="Pv.1", losscomp="conduction")
    acopla("FLOW.3", 30, 40, "FLOW", "Psw_IGBT1", componente="Pv.1", losscomp="switching")
    acopla("FLOW.4", 30, 42, "FLOW", "Pv_D1", componente="Pv.2", losscomp="total")
    mede("VOLT.1", 30, 6, "v_o", no1="o", no2="gnd"); mede("AMP.1", 30, 10, "i_T", componente="IGBT.1")
    mede("VOLT.2", 30, 14, "v_T", no1="vin", no2="sw"); mede("AMP.2", 30, 18, "i_D", componente="D.1")
    mede("VOLT.3", 30, 22, "v_sw", no1="sw", no2="gnd")
    return dict(dt=0.5e-6, tfim=0.06, amostras=12000)


def maquina(nome, x, y, tipo, carga=None, d=None, **par):
    """Uma máquina (aba Motor & EMI) com os parâmetros e o torque de carga vindo do sinal de controle com o rótulo carga
    (editor/mede tipo L, como o painel do motor)."""
    poe(nome, x, y, tipo, d, **par)
    if carga:
        ok(api("editor/mede", {"nome": nome, "tipo": "L", "sinal": carga}), (nome, carga))


def grandeza(nome, x, y, maq, q, saida):
    """Um VIEWMOT ("Grandeza da máquina"): a grandeza interna q da máquina maq (a lista do Gecko: "n [rpm]", "ia [A]"…) na saída."""
    sinal(nome, x, y, "VIEWMOT", saida=saida)
    ok(api("editor/mede", {"nome": nome, "tipo": "M", "componente": maq, "grandeza": q}), (nome, maq, q))


def motor_cc():
    """Motor CC de excitação independente com controle de velocidade em Python (v0.3.1): meia ponte (S.1/S.2
    complementares, PWM de 20 kHz pelo Gecko: o CONST "d" que o controle.py escreve contra a portadora) no barramento de
    240 V, armadura Ra 0,5 Ω, La 5 mH; campo próprio de 100 V (Re 100 Ω, Le 0,5 H, Ne 100, I_Le(0) = 1 A: ie = 1 A e
    k = c·Le·ie/Ne = 1 V·s/rad com c = 200); J 0,005 kg·m², fr 0,001 N·m·s. O torque de carga é o sinal Tm (um CONST que o
    acionamento muda de 0 para 8 N·m em 0,15 s); as medidas, n_MDC1, ia_MDC1 e Tel_MDC1 (blocos "Grandeza da máquina")."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=240.0)
    perna(12, "a", "S.1", "S.2")
    fio("p", (4, 8), (4, 4), (12, 4)); fio("gnd", (4, 12), (4, 14), (30, 14))
    maquina("M-DC.1", 24, 10, "M-DC", carga="Tm", d=503, Ra=0.5, La=5e-3, Le=0.5, Re=100.0, Ne=100.0, I_Le=1.0, c=200.0,
            J=5e-3, fr=1e-3)
    fio("a", (18, 10), (22, 10)); fio("", (26, 10), (30, 10), (30, 14))          # a armadura: + no nó a, − no gnd
    poe("U.2", 16, 22, "U", 503, type=401, uDC=100.0)                            # o campo: a fonte própria (vf), − no gnd
    fio("vf", (22, 6), (22, 8)); fio("gnd", (20, 9), (22, 9))
    fio("vf", (16, 20), (16, 18)); fio("gnd", (16, 24), (16, 26))
    sinal("CONST.1", 4, 30, "CONST", saida="d", const=0.0)
    sinal("SIGNAL.1", 4, 34, "SIGNAL", saida="portadora", type=403, amplMAX=0.5, offset=0.5, f=20e3)
    sinal("GE.1", 12, 32, "GE", saida="g", entradas=("d", "portadora")); sinal("NOT.1", 18, 34, "NOT", saida="gn", entradas=("g",))
    gate("GATE.1", 26, 30, "g", "S.1"); gate("GATE.2", 26, 34, "gn", "S.2")
    sinal("CONST.2", 34, 30, "CONST", saida="Tm", const=0.0)
    grandeza("VIEWMOT.1", 34, 34, "M-DC.1", "n [rpm]", "n_MDC1"); grandeza("VIEWMOT.2", 34, 36, "M-DC.1", "ia [A]", "ia_MDC1")
    grandeza("VIEWMOT.3", 34, 38, "M-DC.1", "Tel [Nm]", "Tel_MDC1")
    mede("VOLT.1", 40, 6, "v_a", no1="a", no2="gnd")
    return dict(dt=1e-6, tfim=0.45, amostras=9000)


def motor_cc_blocos():
    """O motor CC do exemplo_motor_cc (a mesma potência e a mesma máquina) com o controle em cascata todo em blocos, sem
    Python (v0.3.1). Os degraus, pelo tempo da simulação (TIME ≥ instante → GAIN): o torque de carga Tm de 0 para 8 N·m em
    0,15 s e a referência n_ref de 1000 para 1500 rpm em 0,3 s (o CONST de 1000 + GAIN 500).
    - velocidade (os ganhos do exemplo em Python: Kp_w = 1 A·s/rad, Ki_w = 50 A/rad, cruzamento em 200 rad/s): o erro
      n_ref − n_MDC1 (rpm) → GAIN π/30 (rad/s) → o P (GAIN Kp_w) + o I (INT de a1 = Ki_w) → LIMIT ±15 A = i_ref. O bloco PI
      do Gecko não tem anti-windup, e esta malha satura em cada degrau (só com ele, o modelo médio dá ≈ 560 rpm de
      sobressinal na partida): o INT só integra com |erro| < 10 rad/s (ABS, GT e MUL; longe da referência, só o P), como o
      "só integra sem saturar" do Python. Os 10 rad/s: Kp_w·10 = 10 A, acima dos 8,2 A da carga (o P sozinho põe o erro
      abaixo do limiar: o I nunca trava fora dele).
    - corrente (os ganhos do Python: cruzamento em 500 Hz, Kp_i = La·ωc = 15,708 V/A e Ki_i = Ra·ωc = 1570,8 V/(A·s)):
      i_ref − ia_MDC1 → PI (r0 = Kp_i, a1 = Ki_i) + a f.c.e.m. k·ω à frente (GAIN k·π/30 sobre o n) = a tensão de armadura
      → GAIN 1/Vdc → LIMIT de 0 a 0,98 = d → a portadora de 20 kHz (GE, NOT) → GATE.1/GATE.2 → S.1/S.2.
    As medidas: n_MDC1, ia_MDC1 e Tel_MDC1 (VIEWMOT). Em regime: Tel = Tm + fr·ω."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=240.0)
    perna(12, "a", "S.1", "S.2")
    fio("p", (4, 8), (4, 4), (12, 4)); fio("gnd", (4, 12), (4, 14), (30, 14))
    maquina("M-DC.1", 24, 10, "M-DC", carga="Tm", d=503, Ra=0.5, La=5e-3, Le=0.5, Re=100.0, Ne=100.0, I_Le=1.0, c=200.0,
            J=5e-3, fr=1e-3)
    fio("a", (18, 10), (22, 10)); fio("", (26, 10), (30, 10), (30, 14))
    poe("U.2", 16, 22, "U", 503, type=401, uDC=100.0)
    fio("vf", (22, 6), (22, 8)); fio("gnd", (20, 9), (22, 9))
    fio("vf", (16, 20), (16, 18)); fio("gnd", (16, 24), (16, 26))
    grandeza("VIEWMOT.1", 40, 10, "M-DC.1", "n [rpm]", "n_MDC1"); grandeza("VIEWMOT.2", 40, 12, "M-DC.1", "ia [A]", "ia_MDC1")
    grandeza("VIEWMOT.3", 40, 14, "M-DC.1", "Tel [Nm]", "Tel_MDC1")
    mede("VOLT.1", 40, 6, "v_a", no1="a", no2="gnd")
    # os degraus de carga e de referência
    sinal("TIME.1", 4, 30, "TIME", saida="tempo")
    sinal("CONST.1", 4, 34, "CONST", saida="t_carga", const=0.15)
    sinal("GE.1", 12, 32, "GE", saida="degrau_carga", entradas=("tempo", "t_carga"))
    sinal("GAIN.1", 20, 32, "GAIN", saida="Tm", entradas=("degrau_carga",), r0=8.0)
    sinal("CONST.2", 4, 38, "CONST", saida="t_ref", const=0.3)
    sinal("GE.2", 12, 38, "GE", saida="degrau_ref", entradas=("tempo", "t_ref"))
    sinal("GAIN.2", 20, 38, "GAIN", saida="dn_ref", entradas=("degrau_ref",), r0=500.0)
    sinal("CONST.3", 20, 42, "CONST", saida="n_ref0", const=1000.0)
    sinal("ADD.1", 28, 40, "ADD", saida="n_ref", entradas=("n_ref0", "dn_ref"))
    # a malha de velocidade: P + I com a integração só perto da referência → i_ref
    sinal("SUB.1", 36, 40, "SUB", saida="erro_n", entradas=("n_ref", "n_MDC1"))
    sinal("GAIN.3", 44, 40, "GAIN", saida="erro_w", entradas=("erro_n",), r0=math.pi / 30)
    sinal("GAIN.4", 52, 38, "GAIN", saida="P_w", entradas=("erro_w",), r0=1.0)
    sinal("ABS.1", 52, 44, "ABS", saida="erro_abs", entradas=("erro_w",))
    sinal("CONST.4", 52, 48, "CONST", saida="erro_max", const=10.0)
    sinal("GT.1", 60, 46, "GT", saida="integra", entradas=("erro_max", "erro_abs"))
    sinal("MUL.1", 68, 42, "MUL", saida="erro_int", entradas=("erro_w", "integra"))
    sinal("INT.1", 76, 42, "INT", saida="I_w", entradas=("erro_int",), a1=50.0, y0=0.0, min=-15.0, max=15.0)
    sinal("ADD.2", 84, 40, "ADD", saida="i_ref_u", entradas=("P_w", "I_w"))
    sinal("LIMIT.1", 92, 40, "LIMIT", saida="i_ref", entradas=("i_ref_u",), min=-15.0, max=15.0)
    # a malha de corrente: PI + a f.c.e.m. à frente → d
    sinal("SUB.2", 36, 54, "SUB", saida="erro_i", entradas=("i_ref", "ia_MDC1"))
    sinal("PI.1", 44, 54, "PI", saida="v_pi", entradas=("erro_i",), r0=15.708, a1=1570.8)
    sinal("GAIN.5", 44, 58, "GAIN", saida="fcem", entradas=("n_MDC1",), r0=1.0 * math.pi / 30)
    sinal("ADD.3", 52, 56, "ADD", saida="v_a_ref", entradas=("v_pi", "fcem"))
    sinal("GAIN.6", 60, 56, "GAIN", saida="d_u", entradas=("v_a_ref",), r0=1 / 240.0)
    sinal("LIMIT.2", 68, 56, "LIMIT", saida="d", entradas=("d_u",), min=0.0, max=0.98)
    sinal("SIGNAL.1", 68, 60, "SIGNAL", saida="portadora", type=403, amplMAX=0.5, offset=0.5, f=20e3)
    sinal("GE.3", 76, 58, "GE", saida="g", entradas=("d", "portadora")); sinal("NOT.1", 84, 60, "NOT", saida="gn", entradas=("g",))
    gate("GATE.1", 92, 56, "g", "S.1"); gate("GATE.2", 92, 60, "gn", "S.2")
    return dict(dt=1e-6, tfim=0.45, amostras=9000)


def pmsm():
    """PMSM com controle dq em Python (v0.3.1), adaptado do dq_control_pmsm.ipes do Gecko (a máquina dele: Psi 0,191 Wb,
    3 pares de polos, Rs 1 Ω, Ld = Lq = 5 mH; aqui J 2e-3 kg·m², para a velocidade não andar aos saltos com a carga): o
    inversor trifásico de dois níveis (S.1 a S.6, as pernas a, b, c) no barramento de 400 V; o PWM pelo Gecko (os CONST
    da, db e dc que o controle.py escreve contra a portadora triangular de 10 kHz: g_k = d_k ≥ portadora, n_k o
    complementar); o torque de carga Tm (CONST: de 0 para 5 N·m em 40 ms, pelo acionamento); as medidas da máquina:
    isa/isb/isc_PMSM1, theta_PMSM1, n_PMSM1 e Tel_PMSM1."""
    poe("U.1", 4, 10, "U", 503, type=401, uDC=400.0)
    for k, f in enumerate("abc"):
        perna(12 + 8 * k, f, f"S.{k + 1}", f"S.{k + 4}")
    fio("p", (4, 8), (4, 4), (28, 4)); fio("neg", (4, 12), (4, 14), (28, 14))
    maquina("PMSM.1", 40, 10, "PMSM", carga="Tm", d=503, Psi=0.191, p=3.0, Rs=1.0, Ld=5e-3, Lq=5e-3, J=2e-3, fr=2.1e-4)
    for k, f in enumerate("abc"):                          # as fases da máquina (a, b, c de cima para baixo), pelos rótulos
        fio(f, (35, 9 + k), (38, 9 + k))
    sinal("SIGNAL.1", 4, 40, "SIGNAL", saida="portadora", type=403, amplMAX=0.5, offset=0.5, f=10e3)
    for k, f in enumerate("abc"):
        yy = 28 + 4 * k
        sinal(f"CONST.{k + 1}", 4, yy, "CONST", saida=f"d{f}", const=0.5)
        sinal(f"GE.{k + 1}", 15, yy, "GE", saida=f"g_{f}", entradas=(f"d{f}", "portadora"))
        sinal(f"NOT.{k + 1}", 21, yy + 2, "NOT", saida=f"n_{f}", entradas=(f"g_{f}",))
        gate(f"GATE.{k + 1}", 28, yy, f"g_{f}", f"S.{k + 1}"); gate(f"GATE.{k + 4}", 33, yy + 2, f"n_{f}", f"S.{k + 4}")
    sinal("CONST.4", 40, 26, "CONST", saida="Tm", const=0.0)
    for k, (q, s) in enumerate((("isa [A]", "isa"), ("isb [A]", "isb"), ("isc [A]", "isc"), ("theta [rad]", "theta"),
                                ("n [rpm]", "n"), ("Tel [Nm]", "Tel"))):
        grandeza(f"VIEWMOT.{k + 1}", 40, 30 + 2 * k, "PMSM.1", q, f"{s}_PMSM1")
    mede("VOLT.1", 48, 6, "v_ab", no1="a", no2="b")
    return dict(dt=1e-6, tfim=0.12, amostras=12000)


MONTA = {"buck": buck, "buck_degrau": buck_degrau, "buck_pi_blocos": buck_pi_blocos, "buck_termico": buck_termico, "boost": boost, "buck_boost": buck_boost, "retificador_trifasico": retificador, "inversor_ponte_completa": inversor,
         "inversor_trifasico": inversor_trifasico, "inversor_meia_ponte": inversor_meia_ponte, "ponte_h_cc": ponte_h_cc,
         "retificador_monofasico": retificador_monofasico, "retificador_trifasico_controlado": retificador_controlado,
         "motor_cc": motor_cc, "motor_cc_blocos": motor_cc_blocos, "pmsm": pmsm}


def monta(nome):
    api("editor/novo", {"descartar": True})
    par = MONTA[nome]()
    tira_globais_sem_uso()
    est = api("editor/estado")
    soltas = (est.get("encaixe") or {}).get("soltas")
    print(f"{nome}: {len(els())} elementos; pontas soltas: {soltas}")
    ctl = EXEMPLOS / f"exemplo_{nome}.controle.json"     # os de controle em Python: o controle do repositório (a fonte) roda junto
    if ctl.exists():
        ok(api("editor/controle", {"controle": json.loads(ctl.read_text())}), "controle")
    j = ok(api("editor/rodar", {"dt": str(par["dt"]), "tfim": str(par["tfim"]), "nome": f"monta_{nome}", "amostras": str(par["amostras"])}), "rodar")
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.5); j = api("editor/rodada")
    print(f"  rodada: {j.get('estado')} {j.get('erro') or ''} — {j.get('arquivo')}")
    arq = f"exemplo_{nome}"
    s = ok(api("editor/salvar", {"nome": arq, "pasta": "circuitos", "sobrescrever": True}), "salvar")
    print("  salvo:", s.get("salvo"))
    return j


if __name__ == "__main__":
    nomes = [a for a in sys.argv[1:] if not a.startswith("--")] or list(MONTA)
    for n in nomes:
        monta(n)
        if "--exemplos" in sys.argv:
            for suf in (".ipes", ".aparencia.json"):           # o .controle.json (os de controle em Python) é a fonte: já está em exemplos/
                f = CIRC / f"exemplo_{n}{suf}"
                if f.exists() and suf == ".ipes":           # a linha path do Gecko só com o nome do arquivo (sem a pasta de quem montou)
                    import gzip
                    t = re.sub(r"(?m)^path [^\n]*[/\\]([^/\\\n]+)$", r"path \1", gzip.decompress(f.read_bytes()).decode("utf-8", "replace"))
                    (EXEMPLOS / f.name).write_bytes(gzip.compress(t.encode("utf-8")))
                    print("  →", EXEMPLOS / f.name)
                elif f.exists():
                    shutil.copyfile(f, EXEMPLOS / f.name)
                    print("  →", EXEMPLOS / f.name)
