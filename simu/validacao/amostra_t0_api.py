"""A amostra de t = 0 (Marcelo, 26/10): o estado INICIAL do circuito, com as condições iniciais dele quando existirem (o
Temp(0) de uma Cth, o uC(0) de um capacitor, o y0 de um integrador, a velocidade inicial da máquina) e, sem condição
inicial, o valor natural de partida — nunca o resto da rodada anterior nem o efeito de um passo de prova. Antes (21/10) o
MaiSim dava um passo de prova e mostrava em t = 0 o estado de t = Δt (o motor CC saía com −0,0153 rpm na 1ª rodada depois
de abrir e 0,0 nas outras; a perda de chaveamento do 1º passo, 3,6 W, aparecia em t = 0). Agora o INICIAL do motor
(patch 0009 do Gecko) lê o que o Gecko resolve no INIT, sem andar. Na instância de teste (7201):
  - o motor CC: t = 0 igual (0,0 rpm) na 1ª rodada depois de abrir e na seguinte, e as duas rodadas iguais por inteiro;
  - condições iniciais diferentes de zero: Cth com Temp(0) = 40 °C, capacitor com uC(0) = 10 V e integrador com y0 = 1
    aparecem exatos em t = 0 (e o integrador anda a partir de y0); as perdas (FLOW de um Pv) são 0 em t = 0, também na
    2ª rodada (nada de resto da anterior); a corrente do indutor sem condição inicial é 0;
  - com controle, o passo(t = 0) recebe esse mesmo estado inicial (o que o scope mostra), e sem controle a 1ª amostra é a
    mesma; o resto da rodada não depende de nada disso (Ts = 2Δt e Ts = Δt batem nos instantes comuns)."""
import json, time, urllib.request
from pathlib import Path
import numpy as np
B = "http://localhost:7201/maisim/simu/"
T = Path.home() / ".cache/maisim_teste"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-MaiSim": "1"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def roda(nome, dt, tfim, amostras):
    j = api("editor/rodar", {"dt": dt, "tfim": tfim, "nome": nome, "amostras": amostras}); assert "ERRO" not in j, j
    while j.get("estado") in ("rodando", "pausada", "preparando"):
        time.sleep(0.1); j = api("editor/rodada")
    assert j.get("estado") == "fim", j
    return np.load(j["arquivo"])


def cmd(op, args):
    r = api("editor/cmd", {"op": op, "args": args}); assert "ERRO" not in r, (op, args, r)


# 1. o motor CC do exemplo: o t = 0 da 1ª rodada depois de abrir é o das seguintes (0,0 rpm, a máquina parada)
api("editor/abrir", {"arq": "exemplos/exemplo_motor_cc.ipes", "modo": "descartar"})
m1 = roda("t0_motor1", "1e-06", "0.01", "200")
m2 = roda("t0_motor2", "1e-06", "0.01", "200")
iguais = all(np.array_equal(m1[k], m2[k], equal_nan=True) for k in m1.files if k != "meta")
ok(m1["n_MDC1"][0] == 0.0 and m2["n_MDC1"][0] == 0.0 and m1["ia_MDC1"][0] == 0.0 and iguais,
   f"motor CC: n(0) = {m1['n_MDC1'][0]} rpm na 1ª rodada depois de abrir e {m2['n_MDC1'][0]} na seguinte (era −0,0153 na 1ª); as duas rodadas iguais por inteiro")

# 2. condições iniciais: a Cth do IGBT com Temp(0) = 40 °C no buck térmico; as perdas em t = 0 (duas rodadas seguidas)
api("editor/abrir", {"arq": "exemplos/exemplo_buck_termico.ipes", "modo": "descartar"})
cmd("SETP", ["Cth.1", "Temp(0)", 40.0])
c1 = roda("t0_cth1", "5e-07", "0.001", "2000")
c2 = roda("t0_cth2", "5e-07", "0.001", "2000")
perdas = ("Pv_IGBT1", "Pcond_IGBT1", "Psw_IGBT1", "Pv_D1")
ok(c1["Tj_IGBT1"][0] == 40.0 and c1["Tj_D1"][0] == 25.0 and 40.0 < c1["Tj_IGBT1"][1] < 40.01,
   f"Cth com Temp(0) = 40 °C: Tj(0) = {c1['Tj_IGBT1'][0]} °C (e anda dali: {c1['Tj_IGBT1'][1]:.6f}); o diodo, sem condição inicial, no ambiente: {c1['Tj_D1'][0]} °C")
ok(all(c1[k][0] == 0.0 and c2[k][0] == 0.0 for k in perdas) and max(c1["Pcond_IGBT1"]) > 0,
   f"as perdas em t = 0 são 0 nas duas rodadas (nada dissipado ainda; a 2ª não herda a última da 1ª): {[float(c2[k][0]) for k in perdas]}")
ok(all(np.array_equal(c1[k], c2[k], equal_nan=True) for k in c1.files if k != "meta"), "buck térmico: duas rodadas seguidas iguais por inteiro")

# 3. o capacitor do buck com uC(0) = 10 V: v_o(0) = 10 V; o indutor sem condição inicial: i_L(0) = 0
api("editor/abrir", {"arq": "exemplos/exemplo_buck.ipes", "modo": "descartar"})
cmd("SETP", ["C.1", "uC(0)", 10.0])
b = roda("t0_cap", "5e-07", "0.0005", "1000")
ok(b["v_o"][0] == 10.0 and b["i_L"][0] == 0.0 and b["portadora"][0] == 0.5,
   f"capacitor com uC(0) = 10 V: v_o(0) = {b['v_o'][0]} V; i_L(0) = {b['i_L'][0]} A (era a corrente depois de um passo); a portadora em t = 0: {b['portadora'][0]}")

# 4. um integrador com y0 = 1 (entrada 0,5): y(0) = 1 exato e o 1º passo do trapézio a partir dele
api("editor/novo", {"modo": "descartar"})
for a in (["CONST.1", 10, 10, "CONST"], ["INT.1", 20, 10, "INT"]):
    cmd("CREATE", a)
for op, a in (("SETP", ["CONST.1", "const", 0.5]), ("OUTNODE", ["CONST.1", 0, "x"]), ("INNODE", ["INT.1", 0, "x"]),
              ("OUTNODE", ["INT.1", 0, "y"]), ("SETP", ["INT.1", "y0", 1.0]), ("SETP", ["INT.1", "a1", 1.0])):
    cmd(op, a)
y = roda("t0_int", "1e-06", "0.001", "1000")
ok(y["y"][0] == 1.0 and y["y"][1] == 1.0 + 1e-6 * 0.5 / 2,
   f"integrador com y0 = 1: y(0) = {y['y'][0]} (era o valor depois de um passo); y(Δt) = {float(y['y'][1])!r} = y0 + Δt·(0,5 + 0)/2")

# 5. com controle: o passo(t = 0) recebe o mesmo estado inicial que o scope mostra; sem controle, a mesma 1ª amostra
dados = Path(__file__).resolve().parent / "dados"
for f in ("exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"):
    (T / "circuitos" / f).write_bytes((dados / f).read_bytes())
COD = ("def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    scope('vsw_visto', m['v_sw']); scope('iL_visto', m['i_L'])\n"
       "    return {'g': 1.0 if (t % 1e-4) < 5e-5 else 0.0}\n")
FIXO = "def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {'g': 1.0}\n"   # sem bordas (o t % de um PWM arredonda diferente com outro Ts)


def roda_pwm(nome, ts, ativo=True, cod=COD):
    r = api("editor/abrir", {"arq": str(T / "circuitos" / "exemplo_controle_pwm.ipes"), "modo": "descartar"}); assert "ERRO" not in r, r
    cmd("SETP", ["CONST.1", "const", 1.0])                # a chave fechada (o CONST do gate em 1)
    cfg = {"ativo": ativo, "Ts": ts, "atuacoes": ["g"], "parametros": [], "codigo": cod, "atraso": {"modo": "logo", "tempo": 0}, "acionamentos": []}
    r = api("editor/controle", {"controle": cfg}); assert "ERRO" not in r, r
    return roda(nome, "1e-06", "0.0002", "100000")


a = roda_pwm("t0_ts2", 2e-6)
ok(a["vsw_visto"][0] == a["v_sw"][0] and a["iL_visto"][0] == a["i_L"][0] == 0.0,
   f"com controle: o passo(t = 0) recebe o estado inicial que o scope mostra (v_sw {a['v_sw'][0]:.4f} V, i_L {a['i_L'][0]} A: a corrente do indutor parte de 0)")
a2, b2 = roda_pwm("t0_fixo2", 2e-6, cod=FIXO), roda_pwm("t0_fixo1", 1e-6, cod=FIXO)
n = min(len(a2["t"]), (len(b2["t"]) + 1) // 2)
ok(all(np.array_equal(a2[k][1:n], b2[k][2:2 * n:2]) for k in ("v_sw", "v_o", "i_L")) and a2["v_sw"][0] == b2["v_sw"][0],
   f"o resto da rodada não depende da leitura de t = 0 (chave sempre fechada: Ts = 2Δt e Ts = Δt batem nos {n - 1} instantes comuns)")
c = roda_pwm("t0_sem", 2e-6, ativo=False)
ok(all(c[k][0] == a[k][0] for k in ("v_sw", "v_o", "i_L")), f"sem controle (só o scope): a 1ª amostra é o mesmo estado inicial (v_sw {c['v_sw'][0]:.4f} V)")
api("editor/abrir", {"arq": str(T / "circuitos" / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
