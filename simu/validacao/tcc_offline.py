"""O TinyCC embutido nos pacotes (pacote/tcc.sh → <pasta>/tcc, libtcc1.a, include/), sem servidor: o worker do C do SIL
(controle_worker_c.py) com o TinyCC embutido dá EXATAMENTE as mesmas atuações e o mesmo scope que com o gcc — no buck (o
controle do controle_c_api.py) e num controle que usa a biblioteca inteira (pi, pwm, passa_baixa, rampa e o pll, com sin e
cos) —, compilando com os cabeçalhos mínimos do MaiSim (simu/controle_c/libc, -nostdinc) e sem a libc do sistema na
ligação (-nostdlib); o printf vai para o log; um erro de compilação do tcc volta com o arquivo e a linha.
O tcc: MAISIM_TCC_TESTE, ou pacote/.build/tcc/tcc (o CI o monta antes: bash pacote/tcc.sh pacote/.build/tcc)."""
import json, math, os, shutil, subprocess, sys, tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(RAIZ / "simu")]
import sinais_c  # noqa: E402

falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


TCC = os.environ.get("MAISIM_TCC_TESTE") or str(RAIZ / "pacote/.build/tcc/tcc")
GCC = shutil.which("gcc")
if not Path(TCC).is_file():
    print(f"{'FALHA' if os.environ.get('CI') else 'PULADO'} sem o TinyCC embutido em {TCC} (monte: bash pacote/tcc.sh pacote/.build/tcc)")
    raise SystemExit(1 if os.environ.get("CI") else 0)
ok(sinais_c.pasta_tcc(TCC) is not None and GCC, f"o TinyCC embutido ({TCC}) e o gcc ({GCC})")

src = (RAIZ / "simu/validacao/controle_c_api.py").read_text()
BUCK = src[src.index('CONTROLE_C = r"""') + len('CONTROLE_C = r"""'):]
BUCK = BUCK[:BUCK.index('"""')]
BIB = RAIZ / "simu/biblioteca_controle"
MODS = {f"{m}.{x}": (BIB / f"{m}.{x}").read_text() for m in ("pi", "pwm", "passa_baixa", "rampa", "pll") for x in ("h", "c")}
TUDO = r'''#include <stdio.h>
#include "maisim_controle.h"
#include "pi.h"
#include "pwm.h"
#include "passa_baixa.h"
#include "rampa.h"
#include "pll.h"

typedef struct { PiEstado pi; PwmEstado pwm; PassaBaixaEstado pb; RampaEstado rampa; PllEstado pll; int n; } Estado;

size_t maisim_tamanho_estado(void) { return sizeof(Estado); }

void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado) {
    Estado *e = (Estado *)estado;
    pi_iniciar(&e->pi, 0.8, 120.0, p[P_Ts], -1.0, 1.0, 0.0);
    pwm_iniciar(&e->pwm, 5000.0, PWM_TRIANGULAR);
    passa_baixa_iniciar(&e->pb, 500.0, p[P_Ts], 0.0);
    rampa_iniciar(&e->rampa, 1000.0, p[P_Ts], 0.0);
    pll_iniciar(&e->pll, 60.0, 1.76, 158.0, p[P_Ts], 10.0);
    e->n = 0;
}

void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]) {
    Estado *e = (Estado *)estado;
    maisim_real ref = rampa_passo(&e->rampa, 10.0);
    maisim_real x = passa_baixa_passo(&e->pb, m[M_x]);
    maisim_real d = pi_passo(&e->pi, ref - x);
    maisim_real th = pll_passo(&e->pll, m[M_va], m[M_vb], m[M_vc]);
    (void)p;
    u[U_g] = pwm_passo(&e->pwm, t, 0.5 + 0.4 * d);
    maisim_scope("th", th);
    maisim_scope("vd", e->pll.vd);
    maisim_scope("x", x);
    maisim_scope("d", d);
    if (e->n++ == 0) printf("o primeiro passo (printf do C)\n");
}
'''


def roda(cc, arquivos, sinais, p, amostras):
    """O worker do C com este compilador (MAISIM_CC), pelo pipe: [(a, s)] por amostra, e o log."""
    with tempfile.TemporaryDirectory() as d:
        log = open(Path(d) / "log.txt", "w")
        w = subprocess.Popen([sys.executable, "-I", str(RAIZ / "simu/controle_worker_c.py")], cwd=d, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=log, text=True, bufsize=1, env={**os.environ, "MAISIM_CC": cc})
        w.stdin.write(json.dumps({"op": "carrega", "p": p, "sinais": sinais, "arquivos_c": arquivos}) + "\n"); w.stdin.flush()
        r0 = json.loads(w.stdout.readline())
        out = []
        if r0.get("ok"):
            for t, m in amostras:
                w.stdin.write(json.dumps({"op": "passo", "t": t, "m": m}) + "\n"); w.stdin.flush()
                r = json.loads(w.stdout.readline())
                out.append((r.get("a"), r.get("s")) if r.get("ok") else ("erro", r.get("erro")))
        w.kill(); w.wait(); log.close()
        return r0, out, (Path(d) / "log.txt").read_text()


Ts = 2e-6
# 1. o buck
nomes = ["g", "v_sw", "v_o", "i_L"]
pars = {"fsw": 5000.0, "Vdc": 100.0, "i_ref": 10.0, "Kp": 3.1416, "Ki": 6283.0, "R": 2.0, "k_ff": 1.0, "dmax": 0.95, "Ts": Ts}
am = [(k * Ts, {n: 10.0 + 3.0 * math.sin(2 * math.pi * 5000 * k * Ts + j) for j, n in enumerate(nomes)}) for k in range(3000)]
sin_ = {"m": nomes, "p": list(pars), "u": ["g"]}
rg, og, _ = roda(GCC, {"controle.c": BUCK}, sin_, pars, am)
rt, ot, _ = roda(TCC, {"controle.c": BUCK}, sin_, pars, am)
ok(rg.get("ok") and rt.get("ok"), f"o buck compila com os dois {rg.get('erro', '')} {rt.get('erro', '')}")
ok(og == ot and len(ot) == 3000, f"o buck: o TinyCC ≡ o gcc, bit a bit, nas atuações e no scope de 3000 amostras"
   + (f" (a 1ª diferença: {next(k for k in range(min(len(og), len(ot))) if og[k] != ot[k])})" if og != ot and og and ot else ""))
# 2. a biblioteca inteira (com o sin e o cos do pll)
Ts2 = 1e-4
am2 = [(k * Ts2, {"x": 9.0 + math.sin(0.01 * k), "va": 100 * math.cos(2 * math.pi * 60 * k * Ts2), "vb": 100 * math.cos(2 * math.pi * 60 * k * Ts2 - 2.0944),
                  "vc": 100 * math.cos(2 * math.pi * 60 * k * Ts2 + 2.0944)}) for k in range(3000)]
sin2 = {"m": ["x", "va", "vb", "vc"], "p": ["Ts"], "u": ["g"]}
arqs2 = {"controle.c": TUDO, **MODS}
rg2, og2, _ = roda(GCC, arqs2, sin2, {"Ts": Ts2}, am2)
rt2, ot2, log_t = roda(TCC, arqs2, sin2, {"Ts": Ts2}, am2)
ok(rg2.get("ok") and rt2.get("ok"), f"a biblioteca compila com os dois {rg2.get('erro', '')} {rt2.get('erro', '')}")
ok(og2 == ot2 and len(ot2) == 3000, "a biblioteca (pi, pwm, passa_baixa, rampa, pll com sin/cos): o TinyCC ≡ o gcc, bit a bit, em 3000 amostras")
ok("o primeiro passo (printf do C)" in log_t, f"o printf (o stdio.h mínimo) vai para o log: {log_t.strip()[:60]!r}")
# 3. um erro de compilação do tcc: o arquivo e a linha
os.environ["MAISIM_CC"] = TCC
erros = sinais_c.confere({"controle.c": BUCK.replace("e->n += 1;", "e->n += 1\n    sem_ponto_e_virgula")}, {"m": nomes, "p": list(pars), "u": ["g"]})
ok(any(x["arquivo"] == "controle.c" and x["linha"] in (38, 39) for x in erros), f"o erro do tcc volta com o arquivo e a linha: {erros[:1]}")
raise SystemExit(1 if falhas else 0)
