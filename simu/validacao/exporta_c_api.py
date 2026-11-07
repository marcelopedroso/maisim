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
        # o CSV com 300 colunas a mais (antes, depois da 256ª elas sumiam) e o CSV sem uma medida (antes, NAN calado) (Codex, #235)
        extra = [f"x{k}" for k in range(300)]
        (pasta / "teste/largo.csv").write_text("t," + ",".join(extra + nomes_m) + "\n" + "".join(
            ",".join([repr(a["t"])] + ["0"] * 300 + [repr(a[n]) for n in nomes_m]) + "\n" for a in amostras))
        rl = subprocess.run(["./replay", "teste/largo.csv", "teste/largo_out.csv"], cwd=pasta, capture_output=True, text=True, timeout=60)
        g_largo = [float(l.split(",")[1]) if l.split(",")[1] else None for l in (pasta / "teste/largo_out.csv").read_text().splitlines()[1:]] if rl.returncode == 0 else []
        ok(g_largo == g_replay, f"um CSV com 300 colunas a mais: as mesmas atuações {rl.stderr[-150:]}")
        (pasta / "teste/falta.csv").write_text("t," + ",".join(nomes_m[:-1]) + "\n" + "".join(
            ",".join(repr(a[c]) for c in ["t", *nomes_m[:-1]]) + "\n" for a in amostras[:10]))
        rf = subprocess.run(["./replay", "teste/falta.csv", "teste/falta_out.csv"], cwd=pasta, capture_output=True, text=True, timeout=60)
        ok(rf.returncode == 2 and nomes_m[-1] in rf.stderr, f"um CSV sem uma medida: o replay para e diz qual ({rf.returncode}: {rf.stderr.strip()[:80]})")
        (pasta / "alvos/c2000/F28x_Project.h").write_text(STUB_TI)
        r = gcc(pasta, "-Ialvos/c2000", "-c", "alvos/c2000/c2000_isr.c", "-o", "isr.o")
        isr = (pasta / "alvos/c2000/c2000_isr.c").read_text()
        ok(r.returncode == 0 and "m[M_i_L] = 0;" in isr and "u[U_g] == u[U_g]" in isr and "maisim_passo((maisim_real)((double)n_amostra * MAISIM_TS), m, p, estado, u)" in isr,
           f"o esqueleto do C2000 compila (com um F28x_Project.h de mentira), com o TODO de cada medida e atuação {r.stderr[-300:]}")
    # os outros alvos: o código de cada um rodando no PC (com os de mentira do alvo), com as mesmas medidas, ≡ o C no SIL
    csv = "t," + ",".join(nomes_m) + "\n" + "".join(",".join(repr(a[c_]) for c_ in ["t", *nomes_m]) + "\n" for a in amostras)
    LE_CSV = ("static char maisim_l[1 << 16];\nstatic int maisim_le(FILE *e, double *t, double *v, int n) { char *c; int k;\n"
              "  if (!fgets(maisim_l, sizeof maisim_l, e)) return 0; *t = strtod(strtok(maisim_l, \",\"), NULL);\n"
              "  for (k = 0; k < n; k++) v[k] = strtod(strtok(NULL, \",\\n\"), NULL); return 1; }\n")
    def pacote(alvo):
        zb = api(f"editor/controle/exportar?alvo={alvo}&precisao=double", cru=True)
        zz = zipfile.ZipFile(io.BytesIO(zb)); dd = tempfile.mkdtemp(); zz.extractall(dd)
        pp = Path(dd) / zz.namelist()[0].split("/")[0] / "controle"
        (pp / "teste/medidas.csv").write_text(csv)
        return zz, pp
    def saida(pp, fontes, *extra, args=()):
        r = gcc(pp, *extra, *fontes, "-lm", "-o", "prog")
        if r.returncode:
            return None, r.stderr[-300:]
        rr = subprocess.run(["./prog", *args], cwd=pp, capture_output=True, text=True, timeout=60)
        return [float(x) for x in rr.stdout.split()], rr.stderr[-200:]
    nm = len(nomes_m)
    # STM32: compila (com um main.h de mentira)
    zz, pp = pacote("stm32")
    (pp / "alvos/stm32/main.h").write_text("#include <stdint.h>\n#define HAL_OK 0\ntypedef struct { int x; } ADC_HandleTypeDef;\ntypedef struct { int x; } TIM_HandleTypeDef;\n"
                                          "static inline int HAL_ADC_Start_DMA(ADC_HandleTypeDef *h, uint32_t *b, int n) { (void)h; (void)b; (void)n; return HAL_OK; }\n"
                                          "ADC_HandleTypeDef hadc1; TIM_HandleTypeDef htim1;\n")
    r = gcc(pp, "-Ialvos/stm32", "-c", "alvos/stm32/stm32.c", "-o", "stm32.o")
    leia = zz.read(zz.namelist()[0].split("/")[0] + "/LEIA.md").decode()
    ok(r.returncode == 0 and "STM32CubeIDE" in leia and "STM32" in leia.splitlines()[0], f"STM32: o esqueleto (o callback do ADC) compila; o LEIA do STM32 {r.stderr[-200:]}")
    # Simulink / OPAL-RT: a S-function, com um simstruc.h de mentira, roda no PC
    zz, pp = pacote("simulink")
    (pp / "alvos/simulink/simstruc.h").write_text(
        "#include <stdio.h>\n#include <stdlib.h>\ntypedef double real_T; typedef int int_T; typedef const real_T *const *InputRealPtrsType;\n"
        "typedef struct { int wIn, wOut; void *pwork[4]; double t; const real_T *ent[512]; real_T sai[512]; } SimStruct;\n"
        "#define ssSetNumSFcnParams(S, n) ((void)0)\n#define ssSetNumInputPorts(S, n) 1\n#define ssSetNumOutputPorts(S, n) 1\n"
        "#define ssSetInputPortWidth(S, p, w) ((S)->wIn = (w))\n#define ssSetInputPortDirectFeedThrough(S, p, v) ((void)0)\n"
        "#define ssSetOutputPortWidth(S, p, w) ((S)->wOut = (w))\n#define ssSetNumSampleTimes(S, n) ((void)0)\n#define ssSetNumPWork(S, n) ((void)0)\n"
        "#define ssSetOptions(S, o) ((void)0)\n#define SS_OPTION_EXCEPTION_FREE_CODE 0\n#define ssSetSampleTime(S, i, v) ((void)0)\n#define ssSetOffsetTime(S, i, v) ((void)0)\n"
        "#define ssGetPWork(S) ((S)->pwork)\n#define ssGetInputPortRealSignalPtrs(S, p) ((InputRealPtrsType)(S)->ent)\n"
        "#define ssGetOutputPortRealSignal(S, p) ((S)->sai)\n#define ssGetT(S) ((S)->t)\n")
    (pp / "alvos/simulink/cg_sfun.h").write_text("")
    (pp / "sfun_tb.c").write_text("#include <string.h>\n#include \"alvos/simulink/simulink_sfun.c\"\n" + LE_CSV +
        f"int main(void) {{ static SimStruct S; double v[{nm}]; int k; FILE *e = fopen(\"teste/medidas.csv\", \"r\");\n"
        f"  for (k = 0; k < {nm}; k++) S.ent[k] = &v[k];\n  mdlInitializeSizes(&S); mdlInitializeSampleTimes(&S); mdlStart(&S); fgets(maisim_l, sizeof maisim_l, e);\n"
        f"  while (maisim_le(e, &S.t, v, {nm})) {{ mdlOutputs(&S, 0); printf(\"%.17g\\n\", S.sai[0]); }}\n  mdlTerminate(&S); return 0; }}\n")
    g_alvo, err = saida(pp, ["sfun_tb.c", "controle.c", "maisim_alvo.c"], "-Ialvos/simulink")
    ok(g_alvo == g_sil, f"Simulink/OPAL-RT: a S-function (mdlStart, mdlOutputs) ≡ o SIL nas {N} amostras {err}")
    # Typhoon HIL e PLECS: o texto para colar no bloco, dentro de um programa que faz o papel do bloco
    def secoes(txt):
        out, atual = {}, None
        for l in txt.splitlines():
            mm = re.match(r"^=+ (.+?) =+$", l)
            if mm:
                atual = mm.group(1); out[atual] = []
            elif atual:
                out[atual].append(l)
        return {k: "\n".join(v) for k, v in out.items()}
    zz, pp = pacote("typhoon")
    sec = secoes((pp / "alvos/typhoon/typhoon.txt").read_text())
    ids = [sinais_c.ident(n) for n in nomes_m]
    (pp / "typhoon_tb.c").write_text("#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n" + LE_CSV +
        "static double " + ", ".join(f"m_{x}" for x in ids) + ", u_g;\n" + sec["Global variables"] +
        f"\nint main(void) {{ double v[{nm}], t; FILE *e = fopen(\"teste/medidas.csv\", \"r\"); fgets(maisim_l, sizeof maisim_l, e);\n" + sec["Init function"] +
        f"\n  while (maisim_le(e, &t, v, {nm})) {{ " + " ".join(f"m_{x} = v[{k}];" for k, x in enumerate(ids)) + "\n" + sec["Output function"] +
        "\n  printf(\"%.17g\\n\", u_g); }\n  return 0; }\n")
    g_alvo, err = saida(pp, ["typhoon_tb.c"])
    ok(set(sec) == {"Global variables", "Init function", "Output function"} and g_alvo == g_sil,
       f"Typhoon HIL: as 3 seções do bloco C function (o controle num texto só) ≡ o SIL nas {N} amostras {err}")
    zz, pp = pacote("plecs")
    sec = secoes((pp / "alvos/plecs/plecs.txt").read_text())
    (pp / "plecs_tb.c").write_text("#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n" + LE_CSV +
        "static double maisim_ent[512], maisim_sai[512], CurrentTime;\n#define InputSignal(p, i) maisim_ent[i]\n#define OutputSignal(p, i) maisim_sai[i]\n" +
        sec["Code declarations"] + f"\nint main(void) {{ FILE *e = fopen(\"teste/medidas.csv\", \"r\"); fgets(maisim_l, sizeof maisim_l, e);\n" + sec["Start function code"] +
        f"\n  while (maisim_le(e, &CurrentTime, maisim_ent, {nm})) {{\n" + sec["Output function code"] + "\n  printf(\"%.17g\\n\", maisim_sai[0]); }\n  return 0; }\n")
    g_alvo, err = saida(pp, ["plecs_tb.c"])
    ok(set(sec) == {"Code declarations", "Start function code", "Output function code"} and g_alvo == g_sil,
       f"PLECS: as 3 seções do bloco C-Script ≡ o SIL nas {N} amostras {err}")
    # FPGA (Vitis HLS): a função de topo com o testbench, no PC
    zz, pp = pacote("fpga_hls")
    r = gcc(pp, "controle.c", "maisim_alvo.c", "alvos/fpga_hls/hls_top.c", "alvos/fpga_hls/hls_tb.c", "-lm", "-o", "tb")
    rr = subprocess.run(["./tb", "teste/medidas.csv", "teste/atuacoes.csv"], cwd=pp, capture_output=True, text=True, timeout=60) if r.returncode == 0 else None
    g_alvo = [float(l.split(",")[1]) for l in (pp / "teste/atuacoes.csv").read_text().splitlines()[1:]] if rr and rr.returncode == 0 else None
    ok(g_alvo == g_sil and "#pragma HLS INTERFACE" in (pp / "alvos/fpga_hls/hls_top.c").read_text(),
       f"FPGA (Vitis HLS): a função de topo maisim_top com o testbench ≡ o SIL nas {N} amostras {r.stderr[-200:]}")
    # o HLS mantém a atuação que o passo não escreve (a interface não traz a de antes): só nas amostras pares → 0, 0, 2, 2, 4…
    PARES = ('#include "maisim_controle.h"\ntypedef struct { long n; } Estado;\nsize_t maisim_tamanho_estado(void) { return sizeof(Estado); }\n'
             'void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *e) { (void)p; ((Estado *)e)->n = 0; }\n'
             'void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *e, maisim_real u[MAISIM_N_U]) {\n'
             '    Estado *s = (Estado *)e; (void)t; (void)m; (void)p; if (s->n % 2 == 0) u[U_g] = (maisim_real)s->n; s->n++; }\n')
    api("editor/controle", {"controle": {**ex, "c": {"usar": True, "precisao": "double", "arquivos": {"controle.c": PARES}}}})
    zz, pp = pacote("fpga_hls")
    (pp / "teste/medidas.csv").write_text("t," + ",".join(nomes_m) + "\n" + "".join(f"{k * Ts!r}," + ",".join("0" for _ in nomes_m) + "\n" for k in range(6)))
    r = gcc(pp, "controle.c", "maisim_alvo.c", "alvos/fpga_hls/hls_top.c", "alvos/fpga_hls/hls_tb.c", "-lm", "-o", "tb")
    rr = subprocess.run(["./tb", "teste/medidas.csv", "teste/atuacoes.csv"], cwd=pp, capture_output=True, text=True, timeout=60) if r.returncode == 0 else None
    seq = [float(l.split(",")[1]) for l in (pp / "teste/atuacoes.csv").read_text().splitlines()[1:]] if rr and rr.returncode == 0 else None
    isr = pacote("c2000")[1] / "alvos/c2000/c2000_isr.c"
    ok(seq == [0.0, 0.0, 2.0, 2.0, 4.0, 4.0] and "unsigned long long n_amostra" in isr.read_text(),
       f"FPGA: a atuação não escrita mantém a de antes ({seq}); o contador das amostras com 64 bits (não dá a volta) {r.stderr[-200:]}")
    api("editor/controle", {"controle": {**ex, "c": {"usar": True, "precisao": "double", "arquivos": {"controle.c": CONTROLE_C}}}})
    zf = zipfile.ZipFile(io.BytesIO(api("editor/controle/exportar?alvo=c2000&precisao=float", cru=True)))
    ok("#define MAISIM_REAL float" in zf.read(f"{raiz}/controle/maisim_controle.h").decode(), "em float: o maisim_controle.h já vem em float")
    e = api("editor/controle/exportar?alvo=arduino", cru=True)
    ok(isinstance(e, dict) and e.get("ERRO") == 409 and "arduino" in e.get("erro", ""), f"um alvo que não existe: {e.get('erro', '') if isinstance(e, dict) else e}")
    api("editor/controle", {"controle": {**ex, "c": {"usar": False, "arquivos": {}}}})
    e = api("editor/controle/exportar?alvo=c2000", cru=True)
    ok(isinstance(e, dict) and e.get("ERRO") == 409 and "controle.c" in e.get("erro", ""), f"sem controle em C: {e.get('erro', '') if isinstance(e, dict) else e}")
except Exception as exc:
    ok(False, f"o teste caiu: {exc}")
finally:
    api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
