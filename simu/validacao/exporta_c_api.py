"""O "Exportar C" para o TI C2000 (instância de teste 7201), no buck com PWM (exemplos/exemplo_controle_pwm) com o controle
em C do controle_c_api.py: o .zip tem a pasta do controlador (o controle.c, o maisim_controle.h na precisão escolhida, o
maisim_sinais.h, o maisim_parametros.h, o maisim_alvo.c, alvos/c2000/c2000_isr.c, teste/replay.c) e o LEIA.md; o pacote
compila no PC (gcc), e o replay.c, com as mesmas medidas, dá EXATAMENTE as mesmas atuações que o C no SIL (o worker do
MaiSim); o esqueleto do C2000 compila com um F28x_Project.h de mentira; em float, o maisim_controle.h vem em float; sem C,
o exportar diz o que falta."""
import io, json, math, re, shutil, subprocess, sys, tempfile, urllib.request, zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(RAIZ / "simu")]
import sinais_c  # noqa: E402


def config(chave, padrao):                               # do perfil de teste (config/teste.env)
    try:
        m = re.search(rf"^{chave}=(\S+)", (RAIZ / "config/teste.env").read_text(), re.M)
        return m.group(1) if m else padrao
    except OSError:
        return padrao


B = f"http://localhost:{config('MAISIM_PORTA_SIMU', '7201')}/maisim/simu/"


def api(rota, corpo=None, cru=False):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=300).read()
        return r if cru else json.loads(r)
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


src = (RAIZ / "simu/validacao/controle_c_api.py").read_text()
CONTROLE_C = src[src.index('CONTROLE_C = r"""') + len('CONTROLE_C = r"""'):]
CONTROLE_C = CONTROLE_C[:CONTROLE_C.index('"""')]
STUB_TI = ("#define __interrupt\n#include <stdint.h>\nstatic struct { struct { struct { int ADCINT1; } bit; } ADCINTFLGCLR; } AdcaRegs;\n"
           "static struct { struct { int all; } PIEACK; } PieCtrlRegs;\n#define PIEACK_GROUP1 1\n")
ex = json.loads((RAIZ / "exemplos/exemplo_controle_pwm.controle.json").read_text())
cc = sinais_c.compilador()


def gcc(pasta, *args):
    return subprocess.run([cc[0], "-std=c99", "-ffp-contract=off", "-fno-builtin-sin", "-fno-builtin-cos", "-I.", *args], cwd=pasta,
                          capture_output=True, text=True, timeout=120)


try:
    ok(cc is not None, "há um compilador de C (gcc, cc ou tcc)")
    r = api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
    ok("ERRO" not in r, "abre o exemplo do buck com PWM")
    g = api("editor/controle", {"controle": {**ex, "c": {"usar": True, "precisao": "double", "arquivos": {"controle.c": CONTROLE_C}}}})
    ok("ERRO" not in g, f"o controle em C guardado {g.get('erro', '')}")
    zbytes = api("editor/controle/exportar?alvo=c2000&precisao=double", cru=True)
    ok(isinstance(zbytes, bytes) and zbytes[:2] == b"PK", f"o exportar devolve um .zip {zbytes if not isinstance(zbytes, bytes) else ''}")
    z = zipfile.ZipFile(io.BytesIO(zbytes))
    nomes = sorted(z.namelist())
    raiz = nomes[0].split("/")[0]
    esperado = {f"{raiz}/LEIA.md", *[f"{raiz}/controle/{a}" for a in ("controle.c", "maisim_controle.h", "maisim_sinais.h", "maisim_parametros.h",
                                                                        "maisim_alvo.c", "alvos/c2000/c2000_isr.c", "teste/replay.c")]}
    ok(raiz == "exemplo_controle_pwm_c2000" and set(nomes) == esperado, f"o .zip: {raiz}/ com {', '.join(n[len(raiz) + 1:] for n in nomes)}")
    ok(z.read(f"{raiz}/controle/controle.c").decode() == CONTROLE_C and "M_i_L" in z.read(f"{raiz}/controle/maisim_sinais.h").decode()
       and "[P_Ts] = 2e-06" in z.read(f"{raiz}/controle/maisim_parametros.h").decode() and "**controle**" in z.read(f"{raiz}/LEIA.md").decode(),
       "o controle.c é o mesmo do SIL; o maisim_sinais.h com o M_i_L; o maisim_parametros.h com o Ts; o LEIA.md com o controlador")
    with tempfile.TemporaryDirectory() as d:
        z.extractall(d)
        pasta = Path(d) / raiz / "controle"
        r = gcc(pasta, "controle.c", "maisim_alvo.c", "teste/replay.c", "-lm", "-o", "replay")
        ok(r.returncode == 0, f"o pacote compila no PC (o replay.c com o controle) {r.stderr[-300:]}")
        # as mesmas medidas no replay.c e no worker do SIL: as atuações iguais bit a bit
        nomes_m = json.loads("[" + re.search(r"nomes_m\[\] = \{ (.*) \};", (pasta / "teste/replay.c").read_text()).group(1) + "]")
        Ts, N = ex["Ts"], 3000
        amostras = [{"t": k * Ts, **{n: 10.0 + 3.0 * math.sin(2 * math.pi * 5000 * k * Ts + j) for j, n in enumerate(nomes_m)}} for k in range(N)]
        (pasta / "teste/medidas.csv").write_text("t," + ",".join(nomes_m) + "\n" + "".join(
            ",".join(repr(a[c]) for c in ["t", *nomes_m]) + "\n" for a in amostras))
        rr = subprocess.run(["./replay", "teste/medidas.csv", "teste/atuacoes.csv"], cwd=pasta, capture_output=True, text=True, timeout=60)
        linhas = (pasta / "teste/atuacoes.csv").read_text().splitlines() if rr.returncode == 0 else []
        g_replay = [float(l.split(",")[1]) if l.split(",")[1] else None for l in linhas[1:]]
        params = {q["nome"]: q["valor"] for q in ex["parametros"]} | {"Ts": Ts}
        with tempfile.TemporaryDirectory() as dw:
            w = subprocess.Popen([sys.executable, "-I", str(RAIZ / "simu/controle_worker_c.py")], cwd=dw, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL, text=True, bufsize=1)
            sinais = {"m": nomes_m, "p": [q["nome"] for q in ex["parametros"]] + ["Ts"], "u": ["g"]}
            w.stdin.write(json.dumps({"op": "carrega", "p": params, "sinais": sinais, "arquivos_c": {"controle.c": CONTROLE_C}}) + "\n"); w.stdin.flush()
            carregou = json.loads(w.stdout.readline())
            g_sil = []
            for a in amostras:
                w.stdin.write(json.dumps({"op": "passo", "t": a["t"], "m": {n: a[n] for n in nomes_m}}) + "\n"); w.stdin.flush()
                g_sil.append(json.loads(w.stdout.readline()).get("a", {}).get("g"))
            w.kill(); w.wait()
        difs = [k for k in range(min(len(g_sil), len(g_replay))) if g_sil[k] != g_replay[k]]
        ok(carregou.get("ok") and len(g_replay) == N and not difs and set(g_sil) == {0.0, 1.0},
           f"replay.c ≡ SIL: as {N} atuações iguais bit a bit (g liga e desliga) {rr.stderr[-200:]}"
           + (f"; a 1ª diferença na amostra {difs[0]}: {g_sil[difs[0]]} × {g_replay[difs[0]]}" if difs else ""))
        (pasta / "alvos/c2000/F28x_Project.h").write_text(STUB_TI)
        r = gcc(pasta, "-Ialvos/c2000", "-c", "alvos/c2000/c2000_isr.c", "-o", "isr.o")
        isr = (pasta / "alvos/c2000/c2000_isr.c").read_text()
        ok(r.returncode == 0 and "m[M_i_L] = 0;" in isr and "u[U_g] == u[U_g]" in isr and "maisim_passo(t_amostra, m, p, estado, u)" in isr,
           f"o esqueleto do C2000 compila (com um F28x_Project.h de mentira), com o TODO de cada medida e atuação {r.stderr[-300:]}")
    zf = zipfile.ZipFile(io.BytesIO(api("editor/controle/exportar?alvo=c2000&precisao=float", cru=True)))
    ok("#define MAISIM_REAL float" in zf.read(f"{raiz}/controle/maisim_controle.h").decode(), "em float: o maisim_controle.h já vem em float")
    e = api("editor/controle/exportar?alvo=stm32", cru=True)
    ok(isinstance(e, dict) and e.get("ERRO") == 409 and "stm32" in e.get("erro", ""), f"um alvo que ainda não existe: {e.get('erro', '') if isinstance(e, dict) else e}")
    api("editor/controle", {"controle": {**ex, "c": {"usar": False, "arquivos": {}}}})
    e = api("editor/controle/exportar?alvo=c2000", cru=True)
    ok(isinstance(e, dict) and e.get("ERRO") == 409 and "controle.c" in e.get("erro", ""), f"sem controle em C: {e.get('erro', '') if isinstance(e, dict) else e}")
except Exception as exc:
    ok(False, f"o teste caiu: {exc}")
finally:
    api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
