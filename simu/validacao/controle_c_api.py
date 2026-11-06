"""O controle em C (SIL: controle_worker_c.py) × o mesmo controle em Python, no exemplo do buck com PWM e PI no controle
(exemplos/exemplo_controle_pwm): a rodada em C tem de dar as mesmas formas de onda que a em Python (as contas na mesma ordem
dão o mesmo double). Confere também: o teste de 3 passos em C, a precisão simples (float, como o C28x), um erro de
compilação com a linha, uma função que falta e que a tela, sem mandar o campo do C, não o apaga."""
import json, re, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
import numpy as np

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


# o mesmo controle do exemplo, em C, linha a linha (as contas na mesma ordem do Python)
CONTROLE_C = r"""#include "maisim_controle.h"

typedef struct {
    long periodo, n;
    maisim_real soma, integral, i_med, erro, d;
} Estado;

size_t maisim_tamanho_estado(void) { return sizeof(Estado); }

void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado) {
    Estado *e = (Estado *)estado;
    maisim_real d0 = p[P_k_ff] * p[P_R] * p[P_i_ref] / p[P_Vdc];
    e->periodo = -1; e->soma = 0.0; e->n = 0; e->integral = 0.0; e->i_med = 0.0; e->erro = 0.0;
    e->d = fmin(p[P_dmax], fmax(0.0, d0));
}

void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]) {
    Estado *e = (Estado *)estado;
    maisim_real fsw = p[P_fsw];
    long k = (long)(t * fsw + 1e-9);
    maisim_real portadora = t * fsw - k;
    if (k != e->periodo) {
        if (e->n > 0) {
            maisim_real i_med = e->soma / e->n;
            maisim_real erro = p[P_i_ref] - i_med;
            maisim_real d_ff = p[P_k_ff] * p[P_R] * p[P_i_ref] / p[P_Vdc];
            maisim_real integral = e->integral + erro / fsw;
            maisim_real d = d_ff + (p[P_Kp] * erro + p[P_Ki] * integral) / p[P_Vdc];
            maisim_real d_sat = fmin(p[P_dmax], fmax(0.0, d));
            if (d != d_sat && p[P_Ki] != 0.0)
                integral = (p[P_Vdc] * (d_sat - d_ff) - p[P_Kp] * erro) / p[P_Ki];
            e->integral = integral; e->d = d_sat; e->i_med = i_med; e->erro = erro;
        }
        e->periodo = k; e->soma = 0.0; e->n = 0;
    }
    e->soma += m[M_i_L];
    e->n += 1;
    u[U_g] = portadora < e->d ? 1.0 : 0.0;
    maisim_scope("portadora", portadora);
    maisim_scope("d", e->d);
    maisim_scope("i_med", e->i_med);
    maisim_scope("i_ref", p[P_i_ref]);
    maisim_scope("erro", e->erro);
}
"""

ex = json.loads((RAIZ / "exemplos/exemplo_controle_pwm.controle.json").read_text())


def roda(nome):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.01", "nome": nome, "amostras": "5000"})
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.4); j = api("editor/rodada")
    return j


def guarda(**c):
    return api("editor/controle", {"controle": {**ex, **c}})


try:
    r = api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
    ok("ERRO" not in r, f"abre o exemplo do buck com PWM no controle {r.get('erro', '')}")
    guarda(c={"usar": False, "arquivos": {}})
    jp = roda("controle_c_python")
    ok(jp.get("estado") == "fim", f"rodada em Python: {jp.get('estado')} {jp.get('erro', '')}")
    r = guarda(c={"usar": True, "arquivos": {"controle.c": CONTROLE_C}})
    ok("ERRO" not in r and not r.get("erros"), f"controle em C guardado {r.get('erro', '')} {r.get('erros', '')}")
    t3 = api("editor/controle/testar", {"dt": 1e-6})
    ok("ERRO" not in t3 and len(t3.get("passos", [])) == 3 and t3["passos"][0]["a"].get("g") in (0.0, 1.0),
       f"o teste de 3 passos roda em C: {[(x['t'], x['a']) for x in t3.get('passos', [])]} {t3.get('erro', '')}")
    jc = roda("controle_c_c")
    ok(jc.get("estado") == "fim", f"rodada em C: {jc.get('estado')} {jc.get('erro', '')}")
    if jp.get("arquivo") and jc.get("arquivo"):
        a, b = np.load(jp["arquivo"]), np.load(jc["arquivo"])
        cols = sorted(k for k in set(a.files) & set(b.files) if np.issubdtype(a[k].dtype, np.number))   # sem o meta (texto)
        ok(set(a.files) == set(b.files), f"as mesmas colunas: {cols}")
        difs = [k for k in cols if not np.array_equal(a[k], b[k], equal_nan=True)]   # o NaN no mesmo lugar conta como igual
        ok(not difs, f"C × Python iguais bit a bit em todas as {len(cols)} colunas (i_ref muda pelo evento p:i_ref)"
                     + (f"; diferentes: { {k: float(np.nanmax(np.abs(a[k] - b[k]))) for k in difs} }" if difs else ""))
        cp = api("editor/controle/compara", {"a": jp["arquivo"], "b": jc["arquivo"]})
        ok(cp.get("iguais") is True and len(cp.get("colunas", [])) >= 9, f"o 'Comparar Python × C' do painel: iguais em {len(cp.get('colunas', []))} sinais")
        fora = api("editor/controle/compara", {"a": "/etc/passwd", "b": jc["arquivo"]})
        ok("ERRO" in fora, "a comparação só lê rodadas da pasta das rodadas")
        # um módulo em C (o par pwm.h/pwm.c, com #include): compila junto e dá a mesma rodada
        pwm_h = '#ifndef PWM_H\n#define PWM_H\n#include "maisim_controle.h"\nmaisim_real pwm_compara(maisim_real portadora, maisim_real d);\n#endif\n'
        pwm_c = '#include "pwm.h"\nmaisim_real pwm_compara(maisim_real portadora, maisim_real d) { return portadora < d ? 1.0 : 0.0; }\n'
        com_mod = CONTROLE_C.replace('#include "maisim_controle.h"', '#include "maisim_controle.h"\n#include "pwm.h"', 1) \
                            .replace("u[U_g] = portadora < e->d ? 1.0 : 0.0;", "u[U_g] = pwm_compara(portadora, e->d);")
        r = guarda(c={"usar": True, "arquivos": {"controle.c": com_mod, "pwm.h": pwm_h, "pwm.c": pwm_c}})
        ok("ERRO" not in r and sorted(r["controle"]["c"]["arquivos"]) == ["controle.c", "pwm.c", "pwm.h"], "o controle.c com um módulo (pwm.h + pwm.c) guardado")
        jm = roda("controle_c_modulo")
        cpm = api("editor/controle/compara", {"a": jc["arquivo"], "b": jm.get("arquivo", "")}) if jm.get("arquivo") else {}
        ok(jm.get("estado") == "fim" and cpm.get("iguais") is True, f"com o PWM no módulo pwm.c, a rodada é igual bit a bit à do controle.c sozinho: {jm.get('estado')} {jm.get('erro', '')}")
        guarda(c={"usar": False, "arquivos": {"controle.c": CONTROLE_C}})          # guardado em Python; a rodada pede o C
        j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.01", "nome": "controle_c_pedido", "amostras": "5000", "linguagem": "c"})
        while j.get("estado") in ("preparando", "rodando", "pausada"):
            time.sleep(0.4); j = api("editor/rodada")
        cp2 = api("editor/controle/compara", {"a": jc["arquivo"], "b": j.get("arquivo", "")}) if j.get("arquivo") else {}
        ok(cp2.get("iguais") is True and api("editor/controle")["controle"]["c"]["usar"] is False,
           "a rodada com linguagem=c roda o C sem mudar o que está guardado (a comparação não mexe na chave)")
    rn = api("editor/controle/renomeia", {"pares": [["i_L", "i_bob"]]})
    cc = (rn.get("controle") or {}).get("c", {}).get("arquivos", {}).get("controle.c", "")
    ok("M_i_bob" in cc and "M_i_L" not in cc, "renomear a medida i_L troca também o índice no controle.c (m[M_i_bob])")
    api("editor/controle/renomeia", {"pares": [["i_bob", "i_L"]]})
    if jp.get("arquivo"):                                 # uma rodada mais curta não pode sair "igual"
        jcurta = api("editor/rodar", {"dt": "1e-6", "tfim": "0.005", "nome": "controle_c_curta", "amostras": "2500", "linguagem": "c"})
        while jcurta.get("estado") in ("preparando", "rodando", "pausada"):
            time.sleep(0.4); jcurta = api("editor/rodada")
        cp3 = api("editor/controle/compara", {"a": jp["arquivo"], "b": jcurta.get("arquivo", "")}) if jcurta.get("arquivo") else {}
        ok(cp3.get("iguais") is False and any(c.get("amostras") for c in cp3.get("colunas", [])),
           "rodadas de tamanhos diferentes não saem iguais (a sobra conta como diferença)")
    # o worker do C sozinho, no modo pipe (o do Windows): um printf() do controle.c vai para o log, não para o protocolo
    with tempfile.TemporaryDirectory() as d:
        cod = '#include <stdio.h>\n#include "maisim_controle.h"\nsize_t maisim_tamanho_estado(void) { return 8; }\n' \
              'void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *e) { (void)p; (void)e; printf("oi do iniciar\\n"); }\n' \
              'void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *e, maisim_real u[MAISIM_N_U]) {\n' \
              '  (void)p; (void)e; printf("oi do passo t=%g\\n", t); fflush(stdout); u[U_y] = 2 * m[M_x]; }\n'
        log = open(Path(d) / "log.txt", "w")
        w = subprocess.Popen([sys.executable, "-I", str(RAIZ / "simu/controle_worker_c.py")], cwd=d, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=log, text=True, bufsize=1)
        respostas = []
        for ped in ({"op": "carrega", "p": {"Ts": 1e-4}, "sinais": {"m": ["x"], "p": ["Ts"], "u": ["y"]}, "arquivos_c": {"controle.c": cod}},
                    {"op": "passo", "t": 0.0, "m": {"x": 3.0}}, {"op": "passo", "t": 1e-4, "m": {"x": 4.0}}):
            w.stdin.write(json.dumps(ped) + "\n"); w.stdin.flush()
            linha = w.stdout.readline()
            try:
                respostas.append(json.loads(linha))
            except ValueError:
                respostas.append({"ok": False, "erro": f"não é JSON: {linha!r}"})
        w.kill(); w.wait(); log.close()
        txt = (Path(d) / "log.txt").read_text()
        ok(all(r.get("ok") for r in respostas) and respostas[2].get("a") == {"y": 8.0} and "oi do passo" in txt,
           f"pipe: o printf do C vai para o log e o protocolo segue: {respostas} · log {txt.strip()[:80]!r}")
    pc0 = api("editor/controle")
    ok("maisim_controle.h" in (pc0.get("modelo_c") or ""), "o painel traz o modelo do controle.c")
    r = guarda(c={"usar": True, "precisao": "float", "arquivos": {"controle.c": CONTROLE_C}})
    jf = roda("controle_c_float")
    if jf.get("estado") == "fim" and jp.get("arquivo"):
        a, b = np.load(jp["arquivo"]), np.load(jf["arquivo"])
        e_i = float(np.max(np.abs(a["i_L"] - b["i_L"])))
        ok(0.0 < e_i < 1.0, f"em float (precisão simples, como o C28x) roda e fica perto: max|Δi_L| = {e_i:.3g} A")
    else:
        ok(False, f"rodada em float: {jf.get('estado')} {jf.get('erro', '')}")
    errado = CONTROLE_C.replace("e->n += 1;", "e->n += 1\n    sem_ponto_e_virgula")
    guarda(c={"usar": True, "arquivos": {"controle.c": errado}})
    je = roda("controle_c_erro")
    ok("ERRO" in je and re.match(r"controle\.c linha 38:", je.get("erro", "")),
       f"erro de compilação volta com o arquivo e a linha, como o do Python: {je.get('erro', '')[:160]}")
    falta = CONTROLE_C.replace("size_t maisim_tamanho_estado(void) { return sizeof(Estado); }", "")
    guarda(c={"usar": True, "arquivos": {"controle.c": falta}})
    jf2 = roda("controle_c_falta")
    ok("ERRO" in jf2 and "maisim_tamanho_estado" in jf2.get("erro", ""), f"falta uma função: {jf2.get('erro', '')[:160]}")
    guarda(c={"usar": True, "arquivos": {"controle.c": CONTROLE_C}})
    api("editor/controle", {"controle": {k: v for k, v in ex.items()}})        # a tela de antes: sem o campo do C
    pc = api("editor/controle")
    ok((pc.get("controle") or pc).get("c", {}).get("arquivos", {}).get("controle.c") == CONTROLE_C,
       "guardar pela tela sem o campo do C não apaga o controle.c")
except Exception as exc:
    ok(False, f"o teste caiu: {exc}")
finally:
    api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
