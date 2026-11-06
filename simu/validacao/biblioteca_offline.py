"""A biblioteca de controle (simu/biblioteca_controle: pi, pwm, passa_baixa, rampa, pll), sem servidor: cada módulo em
Python e em C dá o MESMO número, bit a bit, amostra por amostra (as mesmas contas na mesma ordem; o C compilado como no SIL,
com as opções de sinais_c), com as mesmas entradas; o código das versões pt e en é o mesmo (só os comentários mudam); o C
compila também em float (como num C28x); o PLL trava numa rede de 60 Hz (vd → Vm, vq → 0, ω → 2π·60)."""
import importlib
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
BIB = RAIZ / "simu" / "biblioteca_controle"
sys.path[:0] = [str(RAIZ / "simu"), str(BIB)]
import sinais_c  # noqa: E402

MODULOS = ("pi", "pwm", "passa_baixa", "rampa", "pll")
falhas = 0


def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


def sem_comentarios(txt, ext):
    if ext == "py":
        txt = "\n".join(re.sub(r"\s*#.*$", "", l) for l in txt.splitlines())
    else:
        txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    return "\n".join(l.rstrip() for l in txt.splitlines() if l.strip())


# 1. os arquivos: os três de cada módulo, em pt e en, com o mesmo código
faltam = [f"{m}{l}.{x}" for m in MODULOS for l in ("", ".en") for x in ("py", "h", "c") if not (BIB / f"{m}{l}.{x}").exists()]
ok(not faltam, f"os {len(MODULOS)} módulos com .py, .h e .c em pt e en {faltam or ''}")
difs = [f"{m}.{x}" for m in MODULOS for x in ("py", "h", "c")
        if sem_comentarios((BIB / f"{m}.{x}").read_text(), x) != sem_comentarios((BIB / f"{m}.en.{x}").read_text(), x)]
ok(not difs, f"pt e en: o mesmo código, só os comentários mudam {difs or ''}")

# 2. as entradas (as mesmas para os dois): senos com um ruído determinístico
semente = 12345


def ruido():
    global semente
    semente = (1103515245 * semente + 12345) % 2 ** 31
    return semente / 2 ** 31 - 0.5


N = 3000
TS = 1e-4
erros_pi = [3.0 * math.sin(0.004 * k) + 0.5 * ruido() for k in range(N)]
pwm_t = [k * 1e-6 for k in range(N)]
pwm_d = [0.5 + 0.45 * math.sin(2 * math.pi * 50 * t) for t in pwm_t]
pb_x = [10.0 + 2.0 * ruido() + (5.0 if k > N // 2 else 0.0) for k in range(N)]
rampa_ref = [0.0 if k < 100 else 10.0 if k < 1500 else -5.0 for k in range(N)]
VM = 100.0
pll_t = [k * TS for k in range(N)]
fase = 0.7
pll_v = [(VM * math.cos(2 * math.pi * 60 * t + fase), VM * math.cos(2 * math.pi * 60 * t + fase - 2 * math.pi / 3),
          VM * math.cos(2 * math.pi * 60 * t + fase + 2 * math.pi / 3)) for t in pll_t]
kp_pll, ki_pll = 2 * 0.7 * (2 * math.pi * 20) / VM, (2 * math.pi * 20) ** 2 / VM

# 3. o Python
mods = {m: importlib.import_module(m) for m in MODULOS}
py = []
e = mods["pi"].iniciar(0.8, 120.0, TS, -1.0, 1.0)
py += [mods["pi"].passo(e, x) for x in erros_pi]
for tipo in (mods["pwm"].SERRA, mods["pwm"].TRIANGULAR):
    e = mods["pwm"].iniciar(5000.0, tipo)
    for t, d in zip(pwm_t, pwm_d):
        py += [mods["pwm"].passo(e, t, d), e["portadora"]]
e = mods["passa_baixa"].iniciar(500.0, TS)
py += [mods["passa_baixa"].passo(e, x) for x in pb_x]
e = mods["rampa"].iniciar(1000.0, TS)
py += [mods["rampa"].passo(e, x) for x in rampa_ref]
e = mods["pll"].iniciar(60.0, kp_pll, ki_pll, TS, 10.0)
for va, vb, vc in pll_v:
    py += [mods["pll"].passo(e, va, vb, vc), e["vd"], e["vq"], e["w"]]
pll_fim = dict(e)

# 4. o C: o mesmo, num programa que imprime cada número em hexadecimal (%a: exato)
H = float.hex
arr = lambda nome, xs: f"static const double {nome}[{len(xs)}] = {{{', '.join(H(float(x)) for x in xs)}}};"
prog = "\n".join([
    "#include <stdio.h>", *[f'#include "{m}.h"' for m in MODULOS],
    arr("erros_pi", erros_pi), arr("pwm_t", pwm_t), arr("pwm_d", pwm_d), arr("pb_x", pb_x), arr("rampa_ref", rampa_ref),
    arr("pll_a", [v[0] for v in pll_v]), arr("pll_b", [v[1] for v in pll_v]), arr("pll_c", [v[2] for v in pll_v]),
    "#define P(x) printf(\"%a\\n\", (double)(x))",
    "int main(void) {", "  int k, tipo;",
    f"  {{ PiEstado e; pi_iniciar(&e, {H(0.8)}, {H(120.0)}, {H(TS)}, -1.0, 1.0, 0.0); for (k = 0; k < {N}; k++) P(pi_passo(&e, erros_pi[k])); }}",
    f"  for (tipo = PWM_SERRA; tipo <= PWM_TRIANGULAR; tipo++) {{ PwmEstado e; pwm_iniciar(&e, 5000.0, tipo);"
    f" for (k = 0; k < {N}; k++) {{ P(pwm_passo(&e, pwm_t[k], pwm_d[k])); P(e.portadora); }} }}",
    f"  {{ PassaBaixaEstado e; passa_baixa_iniciar(&e, 500.0, {H(TS)}, 0.0); for (k = 0; k < {N}; k++) P(passa_baixa_passo(&e, pb_x[k])); }}",
    f"  {{ RampaEstado e; rampa_iniciar(&e, 1000.0, {H(TS)}, 0.0); for (k = 0; k < {N}; k++) P(rampa_passo(&e, rampa_ref[k])); }}",
    f"  {{ PllEstado e; pll_iniciar(&e, 60.0, {H(kp_pll)}, {H(ki_pll)}, {H(TS)}, 10.0);"
    f" for (k = 0; k < {N}; k++) {{ P(pll_passo(&e, pll_a[k], pll_b[k], pll_c[k])); P(e.vd); P(e.vq); P(e.w); }} }}",
    "  return 0;", "}", ""])
cc = sinais_c.compilador()
if not cc:
    ok(False, "sem compilador de C (tcc, gcc ou cc) para conferir a biblioteca")
    raise SystemExit(1)
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    for m in MODULOS:
        for x in ("h", "c"):
            (d / f"{m}.{x}").write_text((BIB / f"{m}.{x}").read_text())
    (d / "maisim_sinais.h").write_text(sinais_c.gera_sinais_h({"m": [], "p": [], "u": []}))
    (d / "maisim_controle.h").write_text((Path(sinais_c.DIR_C) / "maisim_controle.h").read_text())
    (d / "teste.c").write_text(prog)
    fontes = [f"{m}.c" for m in MODULOS] + ["teste.c"]
    r = subprocess.run([cc[0], *sinais_c.opcoes(cc[1]), *fontes, "-o", "teste", "-lm"], cwd=d, capture_output=True, text=True, timeout=120)
    ok(r.returncode == 0, f"a biblioteca compila (em double) com {Path(cc[0]).name}: {(r.stderr or '')[-300:]}")
    rf = subprocess.run([cc[0], *sinais_c.opcoes(cc[1], "float"), "-c", *[f"{m}.c" for m in MODULOS]], cwd=d, capture_output=True, text=True, timeout=120)
    ok(rf.returncode == 0, f"e em float (como num C28x): {(rf.stderr or '')[-300:]}")
    if r.returncode == 0:
        c_out = [float.fromhex(l) for l in subprocess.run([str(d / "teste")], capture_output=True, text=True, timeout=60).stdout.split()]
        partes = [("pi", N), ("pwm serra", 2 * N), ("pwm triangular", 2 * N), ("passa_baixa", N), ("rampa", N), ("pll", 4 * N)]
        i = 0
        for nome, n in partes:
            a, b = py[i:i + n], c_out[i:i + n]
            dif = [k for k in range(min(len(a), len(b))) if not (a[k] == b[k] or (a[k] != a[k] and b[k] != b[k]))]
            ok(len(a) == len(b) == n and not dif, f"{nome}: Python × C iguais bit a bit em {n} saídas"
               + (f" (a 1ª diferença na saída {dif[0]}: {a[dif[0]]!r} × {b[dif[0]]!r})" if dif else ""))
            i += n

# 5. o PLL de verdade: trava na rede
ok(abs(pll_fim["vq"]) < 0.5 and abs(pll_fim["vd"] - VM) < 0.5 and abs(pll_fim["w"] - 2 * math.pi * 60) < 0.5,
   f"o PLL trava em 0,3 s: vd = {pll_fim['vd']:.3f} (Vm = {VM}), vq = {pll_fim['vq']:.4f}, ω = {pll_fim['w']:.3f} rad/s (2π·60 = {2 * math.pi * 60:.3f})")
raise SystemExit(1 if falhas else 0)
