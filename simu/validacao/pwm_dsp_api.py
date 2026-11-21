"""O PWM do DSP dentro do controle (instância de teste 7201): os registradores do ePWM são parâmetros do painel (f_clk,
TBPRD, CTRMODE, SHDWAMODE, INTSEL, DB), o MaiSim tira o Ts deles, e o módulo pwm da biblioteca (pwm.iniciar_registradores e
pwm.pulsos, ou o pwm.c) devolve o pulso do intervalo inteiro, contado pelo contador a f_clk. Circuito: duas fontes
controladas pelos CONST "g" e "h" (a saída A e a complementar B), cada uma num R de 1 Ω (a corrente é o valor do CONST,
passo a passo), e uma terceira fonte de 100·g num RL. Δt = 1 µs, f_clk = 100 MHz (100 contagens por passo), TBPRD = 5000
no sobe-desce: 10 kHz, 100 passos por período. Confere:
- o Ts tirado dos registradores: 100 µs com a interrupção em CTR = 0 (e em CTR = PRD), 50 µs nos dois (p["Ts"]);
- a largura: 2·CMPA contagens (d = 0,4 → 40 passos), centrada no zero do contador (t = k·Ts); com a interrupção em CTR =
  PRD, centrada no meio do intervalo;
- o registrador sombra: o CMPA escrito na amostra de 200 µs só vale no zero de 300 µs;
- a amostra em CTR = 0 lê a média da corrente do período (o meio do pulso);
- o tempo morto (DB = 200 contagens = 2 µs): A·B = 0 e a subida de B 2 passos depois da descida de A;
- o mesmo PWM no pwm.c: as mesmas ondas, passo a passo;
- a Atuação diferente de "Logo" dá aviso;
- o tempo: o PWM comparado a cada Ts (Ts = 1 µs) × o PWM com os registradores (Ts = 100 µs)."""
import json, time, urllib.request
import numpy as np
B = "http://localhost:7201/maisim/simu/"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": json.loads(e.read() or b"{}")}


falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


c = lambda op, args: api("editor/cmd", {"op": op, "args": args})
api("editor/novo", {"modo": "descartar"})
for a in (["U.1", 6, 12, "U"], ["R.1", 12, 12, "R"], ["U.2", 6, 24, "U"], ["R.2", 12, 24, "R"], ["U.3", 6, 36, "U"], ["L.1", 12, 36, "L"],
          ["R.3", 18, 36, "R"], ["CONST.1", 30, 12, "CONST"], ["CONST.2", 30, 24, "CONST"], ["GAIN.1", 30, 36, "GAIN"],
          ["AMP.1", 40, 12, "AMP"], ["AMP.2", 40, 24, "AMP"], ["AMP.3", 40, 36, "AMP"]):
    c("CREATE", a)
for nome, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "gnd"), ("U.2", "b", "gnd"), ("R.2", "b", "gnd"), ("U.3", "c", "gnd"), ("L.1", "c", "d"), ("R.3", "d", "gnd")):
    c("INNODE", [nome, 0, i]); c("OUTNODE", [nome, 0, o])
c("SETP", ["R.1", "R", 1.0]); c("SETP", ["R.2", "R", 1.0]); c("SETP", ["L.1", "L", 1e-3]); c("SETP", ["R.3", "R", 1.0])
c("SETP", ["CONST.1", "const", 0.0]); c("SETP", ["CONST.2", "const", 0.0]); c("SETP", ["GAIN.1", "r0", 100.0])
c("OUTNODE", ["CONST.1", 0, "g"]); c("OUTNODE", ["CONST.2", 0, "h"]); c("INNODE", ["GAIN.1", 0, "g"]); c("OUTNODE", ["GAIN.1", 0, "u"])
c("OUTNODE", ["AMP.1", 0, "i_g"]); c("OUTNODE", ["AMP.2", 0, "i_h"]); c("OUTNODE", ["AMP.3", 0, "i_L"])
for amp, comp in (("AMP.1", "R.1"), ("AMP.2", "R.2"), ("AMP.3", "L.1")):
    api("editor/mede", {"nome": amp, "tipo": "I", "componente": comp})
rs = [api("editor/fonte_sinal", {"nome": u, "sinal": s}) for u, s in (("U.1", "g"), ("U.2", "h"), ("U.3", "u"))]
ok(not any("ERRO" in x for x in rs), "circuito: g e h em fontes num R de 1 Ω (a corrente é o CONST) e 100·g num RL")
N = 100                                              # passos por período (10 kHz com Δt = 1 µs)
PWM_PY = api("editor/controle/biblioteca").get("modulos", {}).get("pwm", {})
COD = '''import pwm


def iniciar(p, e):
    e["pwm"] = pwm.iniciar_registradores(p)


def passo(t, m, p, e):
    scope("Ts", p["Ts"])
    scope("iv", m["i_L"])
    d = p["d"] if t < p["t_degrau"] - 1e-9 else p["d2"]
    a, b = pwm.pulsos(e["pwm"], t, d * p["TBPRD"])
    return {"g": a, "h": b}
'''
COD_C = r'''#include "maisim_controle.h"
#include "pwm.h"

typedef struct { PwmRegistradores pwm; } Estado;

size_t maisim_tamanho_estado(void) { return sizeof(Estado); }

void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado) {
    Estado *e = (Estado *)estado;
    pwm_iniciar_registradores(&e->pwm, p);
}

void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]) {
    Estado *e = (Estado *)estado;
    maisim_real d = t < p[P_t_degrau] - 1e-9 ? p[P_d] : p[P_d2];
    (void)m; (void)u;
    pwm_pulsos(&e->pwm, t, d * p[P_TBPRD], U_g, U_h);
}
'''


def cfg(d=0.4, d2=None, intsel=1, db=0, shdw=0, atraso="logo", c_usar=False, t_degrau=1.0):
    regs = {"f_clk": 100e6, "TBPRD": 5000, "CTRMODE": 2, "SHDWAMODE": shdw, "INTSEL": intsel, "DB": db}
    pars = [{"nome": k, "valor": v, "unidade": ""} for k, v in regs.items()] + \
           [{"nome": "d", "valor": d, "unidade": ""}, {"nome": "d2", "valor": d if d2 is None else d2, "unidade": ""},
            {"nome": "t_degrau", "valor": t_degrau, "unidade": "s"}]
    return {"ativo": True, "Ts": 1e-3, "atuacoes": ["g", "h"], "parametros": pars, "codigo": COD, "arquivos": dict(PWM_PY.get("py") or {}),
            "atraso": {"modo": atraso, "tempo": 0}, "acionamentos": [],
            "c": {"usar": c_usar, "precisao": "double", "arquivos": {"controle.c": COD_C, **(PWM_PY.get("c") or {})}}}


def roda(conf, nome, tfim="1e-3"):
    r = api("editor/controle", {"controle": conf})
    if "ERRO" in r:
        return None, r["ERRO"], None
    j = api("editor/rodar", {"dt": "1e-06", "tfim": tfim, "nome": nome, "amostras": "1000000"})
    if "ERRO" in j:
        return None, j["ERRO"], None
    t0 = time.time()
    while j.get("estado") in ("rodando", "pausada", "preparando"):
        time.sleep(0.1); j = api("editor/rodada")
    if j.get("estado") != "fim":
        return None, j.get("erro") or j.get("estado"), j
    return np.load(j["arquivo"]), None, dict(j, segundos_medidos=time.time() - t0)


def por_passo(z, canal, n):
    """O valor que o circuito sentiu em cada passo j = 0 … n − 1: o passo j vai de j·Δt a (j + 1)·Δt, e a amostra do fim
    dele, em t = (j + 1)·Δt, mostra o valor (a rodada grava a cada Δt dentro do Ts)."""
    t, y = z["t"], z[canal]
    idx = np.searchsorted(np.round(t * 1e6).astype(int), np.arange(n) + 1)
    return np.round(y[np.minimum(idx, len(y) - 1)]).astype(int)


def esperado(desloc=0, cmpa_frac=0.4):
    """O pulso no sobe-desce com o contador zerado em j = desloc (mod 100): ligado com a posição x < 2·d·50 subindo ou
    x ≥ 100 − 2·d·50 descendo (em passos de 100 contagens)."""
    x = (np.arange(1000) - desloc) % N
    w = int(round(cmpa_frac * 50))
    return ((x < w) | (x >= N - w)).astype(int)


ok(len(PWM_PY.get("py") or {}) == 1 and "pwm.c" in (PWM_PY.get("c") or {}), "o pwm da biblioteca (pwm.py e pwm.h/pwm.c) vem da rota")
# 1. o Ts tirado dos registradores e a largura centrada no zero (interrupção em CTR = 0)
z, err, j = roda(cfg(), "pwm_dsp")
if z is not None:
    ts = z["Ts"][np.isfinite(z["Ts"])]
    ok(np.allclose(ts, 1e-4), f"Ts tirado dos registradores: 2·TBPRD/f_clk = {ts[:1]} s (o painel tinha 1 ms)")
    g = por_passo(z, "i_g", 1000)
    larg = [int(g[p * N:(p + 1) * N].sum()) for p in range(2, 10)]
    ok(larg == [40] * 8 and np.array_equal(g[200:], esperado()[200:]), f"d = 0,4: 2·CMPA = 4000 contagens = 40 passos, centrado no zero do contador ({larg})")
else:
    ok(False, f"PWM com os registradores: {err}")
# 2. a interrupção nos dois (Ts = 50 µs) e em CTR = PRD (o pulso centrado no meio do intervalo)
z, err, _ = roda(cfg(intsel=3), "pwm_dsp_ambos")
ts = z["Ts"][np.isfinite(z["Ts"])] if z is not None else []
ok(z is not None and np.allclose(ts, 5e-5), f"INTSEL = 3 (CTR = 0 e PRD): Ts = período/2 = {ts[:1] if len(ts) else err}")
z, err, _ = roda(cfg(intsel=2), "pwm_dsp_prd")
ok(z is not None and np.array_equal(por_passo(z, "i_g", 1000)[200:], esperado(desloc=50)[200:]),
   f"INTSEL = 2 (CTR = PRD): a amostra no pico do contador; o pulso centrado meio período depois ({err or 'ok'})")
# 3. o registrador sombra: 0,4 até a amostra de 200 µs, 0,7 depois → vale no zero de 300 µs
z, err, _ = roda(cfg(d=0.4, d2=0.7, t_degrau=2e-4), "pwm_dsp_sombra")
if z is not None:
    g = por_passo(z, "i_g", 1000)
    ok(g[219] == 1 and g[220] == 0 and g[279] == 0 and g[280] == 1 and g[299] == 1 and g[334] == 1 and g[335] == 0 and g[364] == 0 and g[365] == 1,
       f"registrador sombra: o CMPA de 200 µs só vale no zero de 300 µs (até 299 a metade antiga, de 300 a 334 a nova: "
       f"g[280:300] = {int(g[280:300].sum())}, g[300:335] = {int(g[300:335].sum())}, g[365:400] = {int(g[365:400].sum())})")
else:
    ok(False, f"registrador sombra: {err}")
# 4. a amostra em CTR = 0 = a média da corrente do período (em regime)
z, err, _ = roda(cfg(), "pwm_dsp_media", tfim="2e-2")
if z is not None:
    t, iL = z["t"], z["i_L"]
    sel = (t >= 0.018 - 1e-9) & (t < 0.019 - 1e-9)
    media, onda = float(iL[sel].mean()), float(iL[sel].max() - iL[sel].min())
    lido = float(z["iv"][np.isfinite(z["iv"])][-5])
    ok(abs(lido - media) < 0.1 * onda, f"a amostra em CTR = 0 = a média do período: lido {lido:.4f} A, média {media:.4f} A, ondulação {onda:.3f} A")
else:
    ok(False, f"média: {err}")
# 5. o tempo morto: DB = 200 contagens (2 µs)
z, err, _ = roda(cfg(db=200), "pwm_dsp_db")
if z is not None:
    g, h = por_passo(z, "i_g", 1000), por_passo(z, "i_h", 1000)
    desce_g = [i for i in range(201, 1000) if g[i - 1] == 1 and g[i] == 0]
    sobe_h = [i for i in range(201, 1000) if h[i - 1] == 0 and h[i] == 1]
    ok(int((g * h).sum()) == 0 and [b - a for a, b in zip(desce_g, sobe_h)] == [2] * len(desce_g) and int(g[300:400].sum()) == 38,
       f"tempo morto: A·B = 0, B sobe 2 passos depois de A descer ({len(desce_g)} bordas), A com 40 − 2 = {int(g[300:400].sum())} passos")
    zp = z
else:
    ok(False, f"tempo morto: {err}")
    zp = None
# 6. o mesmo no pwm.c (o C devolve o pulso dentro da amostra pelo maisim_padrao)
zc, err, _ = roda(cfg(db=200, c_usar=True), "pwm_dsp_c")
ok(zc is not None and zp is not None and np.array_equal(por_passo(zc, "i_g", 1000), por_passo(zp, "i_g", 1000))
   and np.array_equal(por_passo(zc, "i_h", 1000), por_passo(zp, "i_h", 1000)), f"pwm.c ≡ pwm.py: A e B iguais passo a passo ({err or 'ok'})")
# 7. a Atuação diferente de "Logo": aviso
_, err, j = roda(cfg(atraso="amostra"), "pwm_dsp_amostra")
ok(j is not None and any("Logo" in a or "Right away" in a for a in j.get("avisos", [])), f"Atuação \"amostra\" com os registradores: avisa ({[a for a in (j or {}).get('avisos', []) if 'Logo' in a][:1]})")
# 8. o tempo: o PWM comparado a cada Ts (Ts = 1 µs) × os registradores (Ts = 100 µs), 20 ms
NO_TS = "def passo(t, m, p, e):\n    k = int(t * 1e4 + 1e-9)\n    return {'g': 1.0 if t * 1e4 - k < 0.4 else 0.0}\n"
a, err_a, ja = roda({"ativo": True, "Ts": 1e-6, "atuacoes": ["g"], "parametros": [], "codigo": NO_TS, "atraso": {"modo": "logo", "tempo": 0},
                     "acionamentos": [], "c": {"usar": False}}, "pwm_a_cada_ts", tfim="2e-2")
b, err_b, jb = roda(cfg(), "pwm_registradores", tfim="2e-2")
if a is not None and b is not None:
    ta, tb = ja.get("segundos") or ja["segundos_medidos"], jb.get("segundos") or jb["segundos_medidos"]
    ok(tb < ta, f"tempo, 20 ms: PWM comparado a cada Ts (Ts = 1 µs) {ta:.2f} s × registradores (Ts = 100 µs) {tb:.2f} s ({ta / max(tb, 1e-9):.1f}× mais rápido)")
else:
    ok(False, f"tempo: {err_a or err_b}")
# 9. o exemplo (exemplos/exemplo_buck_pwm_interrupcao): os registradores nos parâmetros, o pwm.py junto, o Ts de 100 µs, e a
# corrente segue a referência (o último degrau de i_ref é para 8 A, em 7,5 ms)
r = api("editor/abrir", {"arq": "exemplos/exemplo_buck_pwm_interrupcao.ipes", "modo": "descartar"})
ctl = api("editor/controle").get("controle", {})
nomes_p = [q["nome"] for q in ctl.get("parametros", [])]
ok("ERRO" not in r and {"f_clk", "TBPRD", "CTRMODE", "SHDWAMODE", "INTSEL", "DB"} <= set(nomes_p) and "pwm.py" in (ctl.get("arquivos") or {}),
   f"exemplo_buck_pwm_interrupcao abre com os registradores nos parâmetros e o pwm.py ({r.get('ERRO', 'ok')})")
j = api("editor/rodar", {"dt": "1e-06", "tfim": "0.01", "nome": "exemplo_pwm_interrupcao", "amostras": "100000"})
while j.get("estado") in ("rodando", "pausada", "preparando"):
    time.sleep(0.2); j = api("editor/rodada")
if j.get("estado") == "fim":
    ze = np.load(j["arquivo"]); t, iL = ze["t"], ze["i_L"]
    sel = (t >= 0.009 - 1e-9) & (t < 0.0099 - 1e-9)
    media, onda = float(iL[sel].mean()), float(iL[sel].max() - iL[sel].min())
    ok(abs(media - 8.0) < 0.15 and 0.5 < onda < 4, f"o exemplo segue a referência: i_L médio {media:.3f} A (i_ref = 8 A), ondulação {onda:.2f} A, em {j.get('segundos')} s")
else:
    ok(False, f"o exemplo: {j.get('erro') or j}")
# 10. o Exportar C do exemplo (C2000): os registradores no maisim_parametros.h, o aviso do pwm_pulsos → CMPA no esqueleto, e o
# pacote compila e liga no PC (o pwm.c chama o maisim_padrao, que no alvo é o do maisim_alvo.c)
import io, subprocess, sys, tempfile, zipfile
from pathlib import Path
RAIZ = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(RAIZ / "simu")]
import sinais_c  # noqa: E402
try:
    zb = urllib.request.urlopen(B + "editor/controle/exportar?alvo=c2000&precisao=double", timeout=120).read()
    zz = zipfile.ZipFile(io.BytesIO(zb))
    par = next(zz.read(n).decode() for n in zz.namelist() if n.endswith("maisim_parametros.h"))
    isr = next(zz.read(n).decode() for n in zz.namelist() if n.endswith("c2000_isr.c"))
    ok("[P_TBPRD] = 5000.0" in par and "#define MAISIM_TS 0.0001" in par and "EPwmxRegs.CMPA" in isr,
       "Exportar C (C2000): os registradores no maisim_parametros.h, o Ts deles e, no esqueleto, o pwm_pulsos → CMPA do ePWM")
    cc = sinais_c.compilador()
    if cc:
        with tempfile.TemporaryDirectory() as tmp:
            zz.extractall(tmp)
            pasta = next(Path(tmp).glob("*/controle"))
            fontes = [str(p.relative_to(pasta)) for p in pasta.glob("*.c")] + ["teste/replay.c"]
            rc = subprocess.run([cc[0], "-std=c99", "-I.", *fontes, "-lm", "-o", "replay"], cwd=pasta, capture_output=True, text=True, timeout=120)
            ok(rc.returncode == 0, f"o pacote exportado (controle.c + pwm.c + maisim_alvo.c + replay.c) compila e liga no PC {rc.stderr[-300:]}")
    else:
        print("(sem compilador de C: o pacote não foi compilado)")
except Exception as e:
    ok(False, f"Exportar C do exemplo: {e}")
api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
