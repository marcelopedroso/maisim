"""O HIL em tempo real dentro da placa (simu/hil/rt), sem o Gecko nem o servidor: o rt_prepara.py gera o maisim_sinais.h e
compila o rt_hil.c com o gcc; o rt_hil roda a planta (a RL do buck do exemplo_controle_pwm) numa thread e o mesmo controle.c
do SIL em outra, presas a dois núcleos, uma rodada curta (10 cenários de 10 ms, Ts = 20 µs, sem SCHED_FIFO: não depende de
permissão nem de núcleos isolados). Confere o que NÃO depende do tempo da máquina: a malha fecha (o controle manda e a planta
obedece: com o --vazio, que não chama o controle, a corrente fica em zero), o degrau de i_ref aparece, a conta das amostras
(executadas + perdidas = previstas) e os argumentos recusados. Só no Linux, com gcc e pelo menos 2 CPUs."""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


if not sys.platform.startswith("linux") or not shutil.which("gcc") or len(os.sched_getaffinity(0)) < 2:
    ok(True, "pulado: o HIL em tempo real precisa de Linux, gcc e pelo menos 2 CPUs")
    sys.exit(0)

import numpy as np

REG = np.dtype([("idx", "<i4"), ("atraso", "<i4"), ("exec", "<i4"), ("idade", "<i4"), ("i", "<f4"), ("g", "<f4")])
RUNS, TS_US = 10, 20


def le(arq):
    b = Path(arq).read_bytes()
    n, ts, dt, S, runs, vazio = np.frombuffer(b[:48], "<i8")
    return dict(n=int(n), ts=int(ts), dt=int(dt), S=int(S), runs=int(runs), vazio=int(vazio), r=np.frombuffer(b[48:], REG))


nucleos = sorted(os.sched_getaffinity(0))[-2:]                # os dois últimos que o processo pode usar
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    p = subprocess.run([sys.executable, str(RAIZ / "simu/hil/rt/rt_prepara.py"), str(d / "build")], capture_output=True, text=True, timeout=120)
    exe = d / "build" / "rt_hil"
    ok(p.returncode == 0 and exe.exists(), f"o rt_prepara.py gera o maisim_sinais.h e compila o rt_hil com o gcc {p.stderr[-200:]}")
    if not exe.exists():
        sys.exit(1)
    sinais = (d / "build" / "maisim_sinais.h").read_text()
    ok("#define M_i_L 0" in sinais and "#define U_g 0" in sinais and "#define P_i_ref" in sinais,
       "o maisim_sinais.h tem a medida i_L, a atuação g e os parâmetros do exemplo (P_i_ref…)")

    def roda(nome, *extra):
        out = d / f"{nome}.bin"
        r = subprocess.run([str(exe), "--ts-us", str(TS_US), "--runs", str(RUNS), "--prio", "0", "--core-ctl", str(nucleos[0]),
                            "--core-planta", str(nucleos[1]), "--out", str(out), *extra], capture_output=True, text=True, timeout=120)
        return r, (json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 and r.stdout.strip() else None), out

    r, js, out = roda("fechada")
    ok(r.returncode == 0 and js is not None, f"o rt_hil roda {RUNS} cenários de 10 ms (planta e controle em threads fixas nos núcleos {nucleos}) {r.stderr[-160:] if r.returncode else ''}")
    if js is None:
        sys.exit(1)
    S = 10_000 // TS_US                                         # amostras por cenário: 10 ms / Ts
    ok(js["amostras"] == S * RUNS and js["executadas"] + js["perdidas"] == js["amostras"],
       f"a conta das amostras fecha: {js['executadas']} executadas + {js['perdidas']} perdidas = {js['amostras']} previstas")
    ok(js["planta"]["passos"] == RUNS * 10_000, f"a planta deu todos os {js['planta']['passos']} passos de 1 µs")
    d1 = le(out)
    ok(d1["n"] == js["executadas"] and len(d1["r"]) == d1["n"] and d1["ts"] == TS_US * 1000 and d1["S"] == S,
       "o arquivo de registro tem um registro por amostra executada, com o cabeçalho certo")
    r1 = d1["r"]
    tj = (r1["idx"] % d1["S"]) * d1["ts"] * 1e-9
    ok(bool(np.all(r1["exec"] >= 0)) and bool(np.all(r1["atraso"] >= 0)), "os tempos registrados (execução e atraso do início) não são negativos")
    # o que depende do tempo da máquina: sem prioridade de tempo real, numa máquina ocupada (um CI compartilhado) o laço perde
    # amostras demais e a malha deixa de fechar — isso é o esperado, não um defeito; então só se confere com a máquina dando conta
    frac = len(r1) / js["amostras"]
    if frac < 0.9:
        ok(True, f"pulado: a máquina está ocupada (só {100 * frac:.0f} % das amostras executadas, abaixo de 90 %): o fechamento da malha "
                 "e o degrau de i_ref não são conferidos")
    else:
        fim = r1["i"][tj >= 9e-3]
        ok(len(fim) > 0 and 6.0 < float(fim.mean()) < 10.5, f"a malha fecha: i_L nos últimos 1 ms do cenário (i_ref = 8 A) = {float(fim.mean()):.2f} A")
        antes, degrau = r1["i"][(tj >= 3e-3) & (tj < 5e-3)], r1["i"][(tj >= 5.5e-3) & (tj < 7.5e-3)]
        ok(float(degrau.mean()) - float(antes.mean()) > 2.0,
           f"o degrau de i_ref (10 → 15 A em 5 ms) aparece na corrente: {float(antes.mean()):.1f} A → {float(degrau.mean()):.1f} A")

    rv, jv, outv = roda("vazia", "--vazio")
    dv = le(outv)["r"] if jv else None
    ok(jv is not None and float(np.abs(dv["i"]).max()) == 0.0 and float(np.abs(dv["g"]).max()) == 0.0,
       "com o --vazio (o controle não é chamado) a chave nunca fecha e a corrente fica em zero: a malha só fecha pelo controle")

    ruim = subprocess.run([str(exe), "--ts-us", "7", "--out", str(d / "x.bin")], capture_output=True, text=True, timeout=30)
    ok(ruim.returncode == 2, f"um Ts que não divide 10 ms é recusado (código {ruim.returncode})")
    desc = subprocess.run([str(exe), "--nao-existe"], capture_output=True, text=True, timeout=30)
    ok(desc.returncode == 2, f"uma opção desconhecida é recusada (código {desc.returncode})")

    a = subprocess.run([sys.executable, str(RAIZ / "simu/hil/rt/rt_analisa.py"), f"fechada={out}"], capture_output=True, text=True, timeout=60)
    ok(a.returncode == 0 and "perdidas" in a.stdout and "atraso do início" in a.stdout,
       f"o rt_analisa.py resume o registro (perdidas, atraso, execução, idade) {a.stderr[-120:]}")
sys.exit(1 if falhas else 0)
