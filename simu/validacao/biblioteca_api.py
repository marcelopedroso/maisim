"""A biblioteca de controle dentro da simulação (instância de teste 7201), no buck com PWM (exemplos/exemplo_controle_pwm):
o controle feito com o pi e o pwm da biblioteca, uma rodada com o controle.py (pi.py, pwm.py) e outra com o controle.c
(pi.h/pi.c, pwm.h/pwm.c, no SIL): as duas iguais bit a bit, coluna a coluna (o "Comparar Python × C" do painel). E a rota
editor/controle/biblioteca: os 5 módulos, cada um com o .py e o par .h/.c, e o pll pedindo o pi."""
import json, re, time, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def config(chave, padrao):                               # do perfil de teste (config/teste.env)
    try:
        m = re.search(rf"^{chave}=(\S+)", (RAIZ / "config/teste.env").read_text(), re.M)
        return m.group(1) if m else padrao
    except OSError:
        return padrao


B = f"http://localhost:{config('MAISIM_PORTA_SIMU', '7201')}/maisim/simu/"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def roda(nome):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.01", "nome": nome, "amostras": "5000"})
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.4); j = api("editor/rodada")
    return j


# o buck com o PI e o PWM da biblioteca (os ganhos do exemplo divididos por Vdc: a planta vira 1/(R + sL))
CONTROLE_PY = '''import pi
import pwm


def iniciar(p, e):
    e["pi"] = pi.iniciar(p["Kp"] / p["Vdc"], p["Ki"] / p["Vdc"], p["Ts"], 0.0, p["dmax"])
    e["pwm"] = pwm.iniciar(p["fsw"], pwm.SERRA)


def passo(t, m, p, e):
    d = pi.passo(e["pi"], p["i_ref"] - m["i_L"])
    g = pwm.passo(e["pwm"], t, d)
    scope("d", d)
    scope("portadora", e["pwm"]["portadora"])
    return {"g": g}
'''
CONTROLE_C = r'''#include "maisim_controle.h"
#include "pi.h"
#include "pwm.h"

typedef struct {
    PiEstado pi;
    PwmEstado pwm;
} Estado;

size_t maisim_tamanho_estado(void) { return sizeof(Estado); }

void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado) {
    Estado *e = (Estado *)estado;
    pi_iniciar(&e->pi, p[P_Kp] / p[P_Vdc], p[P_Ki] / p[P_Vdc], p[P_Ts], 0.0, p[P_dmax], 0.0);
    pwm_iniciar(&e->pwm, p[P_fsw], PWM_SERRA);
}

void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]) {
    Estado *e = (Estado *)estado;
    maisim_real d = pi_passo(&e->pi, p[P_i_ref] - m[M_i_L]);
    u[U_g] = pwm_passo(&e->pwm, t, d);
    maisim_scope("d", d);
    maisim_scope("portadora", e->pwm.portadora);
}
'''
ex = json.loads((RAIZ / "exemplos/exemplo_controle_pwm.controle.json").read_text())
try:
    b = api("editor/controle/biblioteca").get("modulos") or {}
    ok(sorted(b) == ["passa_baixa", "pi", "pll", "pwm", "rampa"] and all(set(b[m]["py"]) == {f"{m}.py"} and set(b[m]["c"]) == {f"{m}.h", f"{m}.c"} for m in b)
       and b["pll"]["precisa"] == ["pi"], f"a rota da biblioteca: {sorted(b)}, cada um com o .py e o par .h/.c; o pll pede o pi")
    r = api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
    ok("ERRO" not in r, f"abre o exemplo do buck com PWM {r.get('erro', '')}")
    r = api("editor/controle", {"controle": {**ex, "codigo": CONTROLE_PY, "arquivos": {**b["pi"]["py"], **b["pwm"]["py"]}, "c": {"usar": False, "arquivos": {}}}})
    ok("ERRO" not in r and not r.get("erros"), f"o controle.py com o pi.py e o pwm.py da biblioteca guardado {r.get('erro', '')} {r.get('erros', '')}")
    jp = roda("biblioteca_python")
    ok(jp.get("estado") == "fim", f"rodada em Python: {jp.get('estado')} {jp.get('erro', '')}")
    r = api("editor/controle", {"controle": {**ex, "codigo": CONTROLE_PY, "arquivos": {**b["pi"]["py"], **b["pwm"]["py"]},
                                             "c": {"usar": True, "arquivos": {"controle.c": CONTROLE_C, **b["pi"]["c"], **b["pwm"]["c"]}}}})
    ok("ERRO" not in r and not r.get("erros"), f"o controle.c com o pi.h/pi.c e o pwm.h/pwm.c da biblioteca guardado {r.get('erro', '')} {r.get('erros', '')}")
    jc = roda("biblioteca_c")
    ok(jc.get("estado") == "fim", f"rodada em C: {jc.get('estado')} {jc.get('erro', '')}")
    if jp.get("arquivo") and jc.get("arquivo"):
        cp = api("editor/controle/compara", {"a": jp["arquivo"], "b": jc["arquivo"]})
        cols = [c["nome"] for c in cp.get("colunas", [])]
        ok(cp.get("iguais") is True and {"d", "portadora", "g", "i_L"} <= set(cols),
           f"Python × C com a biblioteca: iguais bit a bit em {len(cols)} sinais ({', '.join(cols)})"
           + (f"; diferentes: {[c for c in cp.get('colunas', []) if not c.get('iguais')]}" if cp.get("iguais") is not True else ""))
except Exception as exc:
    ok(False, f"o teste caiu: {exc}")
finally:
    api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
