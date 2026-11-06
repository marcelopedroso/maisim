"""Vários controladores em C (instância de teste 7201), o mesmo do controladores_api.py em Python: no PI de corrente do
exemplo (exemplo_controle_pi, congelado em dados/), a aquisição e o controle em processos separados, que calculam juntos e
conversam pela rede (maisim_envia / maisim_recebeu), com um módulo (copia.h/copia.c) usado pelos dois. A prova: em C dá
EXATAMENTE o mesmo que em Python (as mesmas contas na mesma ordem), com latência 0 e 2,5·Ts. E: cada controlador compila
na sua pasta com um maisim_sinais.h só com os sinais dele; um controlador sem o .c dele não roda (o erro diz qual falta);
maisim_envia para quem não existe é erro, com o arquivo; a proposta da IA compila cada controlador com os índices dele."""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
import numpy as np
RAIZ_PROJ = str(Path(__file__).resolve().parents[2])
B = "http://localhost:7201/maisim/simu/"
T = os.path.expanduser("~/.cache/maisim_teste")
def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read())}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)

PI = f"{T}/circuitos/exemplo_controle_pi.ipes"
r = api("editor/abrir", {"arq": PI, "modo": "descartar"})
base = api("editor/controle")["controle"]
Ts = base["Ts"]
def caminho(j):
    return j["arquivo"] if os.path.isabs(j["arquivo"]) else os.path.join(RAIZ_PROJ, j["arquivo"])
def roda2(nome, cfg):
    g = api("editor/controle", {"controle": cfg})
    if "ERRO" in g: return {"estado": "erro", "erro": g.get("erro")}, None
    j = api("editor/rodar", {"dt": "1e-06", "tfim": "0.03", "nome": nome, "amostras": "100000"})
    while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.3); j = api("editor/rodada")
    return j, (dict(np.load(caminho(j), allow_pickle=True)) if j.get("estado") == "fim" else None)

# em Python (o do controladores_api.py, com o módulo copia.py nos dois)
COPIA_PY = "def de(x):\n    return x\n"
AQ = '''import copia


def passo(t, m, p, e):
    envia("controle", {"i": copia.de(m["i_L"])})
'''
CTL = base["codigo"].replace('''def iniciar(p, e):
    e["integral"] = 0.0''', '''import copia


def iniciar(p, e):
    e["integral"] = 0.0
    e["i"] = 0.0''').replace('''    erro = p["i_ref"] - m["i_L"]''', '''    for msg in recebe():
        e["i"] = copia.de(msg["dados"]["i"])
    erro = p["i_ref"] - e["i"]''')
# em C, as mesmas contas na mesma ordem (min/max do Python: os mesmos ternários)
COPIA_H = '#ifndef COPIA_H\n#define COPIA_H\n#include "maisim_controle.h"\nmaisim_real copia_de(maisim_real x);\n#endif\n'
COPIA_C = '#include "copia.h"\nmaisim_real copia_de(maisim_real x) { return x; }\n'
AQ_C = r'''#include "maisim_controle.h"
#include "copia.h"

size_t maisim_tamanho_estado(void) { return 8; }
void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado) { (void)p; (void)estado; }
void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]) {
    (void)t; (void)p; (void)estado; (void)u;
    maisim_envia("controle", "i", copia_de(m[M_i_L]));
}
'''
CTL_C = r'''#include "maisim_controle.h"
#include "copia.h"

typedef struct { maisim_real integral, i; } Estado;

size_t maisim_tamanho_estado(void) { return sizeof(Estado); }
void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado) {
    Estado *e = (Estado *)estado;
    (void)p;
    e->integral = 0.0;
    e->i = 0.0;
}
void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]) {
    Estado *e = (Estado *)estado;
    maisim_real v, erro, saida, menor;
    (void)t; (void)m;
    if (maisim_recebeu("aquisicao", "i", &v))
        e->i = copia_de(v);
    erro = p[P_i_ref] - e->i;
    saida = p[P_Kp] * erro + p[P_Ki] * (e->integral + erro * p[P_Ts]);
    if (fabs(saida) < p[P_Vmax])
        e->integral += erro * p[P_Ts];
    menor = saida < p[P_Vmax] ? saida : p[P_Vmax];          /* min(Vmax, u) */
    saida = menor > -p[P_Vmax] ? menor : -p[P_Vmax];        /* max(-Vmax, …) */
    maisim_scope("i_ref", p[P_i_ref]);
    maisim_scope("erro", erro);
    u[U_u_ctrl] = saida;
}
'''
CTLS = [{"nome": "aquisicao", "arquivo": "aquisicao.py", "medidas": ["i_L"], "atuacoes": [], "subcircuitos": []},
        {"nome": "controle", "arquivo": "controle.py", "medidas": [], "atuacoes": ["u_ctrl"], "subcircuitos": []}]
ARQS_C = {"controle.c": CTL_C, "aquisicao.c": AQ_C, "copia.h": COPIA_H, "copia.c": COPIA_C}
def dist(lat, usar_c, arqs_c=ARQS_C):
    return dict(base, codigo=CTL, arquivos={"aquisicao.py": AQ, "copia.py": COPIA_PY}, rede={"latencia": lat}, controladores=CTLS,
                c={"usar": usar_c, "precisao": "double", "arquivos": arqs_c})

def nomes_longos():
    """O worker do C sozinho (pipe): uma chave de mais de 63 bytes no maisim_envia (o calço cortaria: viraria outra) e uma
    recebida com o nome longo são erro, com o arquivo (Codex, #231)."""
    longa = "x" * 70
    cod = ('#include "maisim_controle.h"\nsize_t maisim_tamanho_estado(void) { return 8; }\n'
           'void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *e) { (void)p; (void)e; }\n'
           'void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *e, maisim_real u[MAISIM_N_U]) {\n'
           f'    (void)t; (void)m; (void)p; (void)e; (void)u; maisim_envia("b", "{longa}", 1.0);\n}}\n')
    with tempfile.TemporaryDirectory() as d:
        w = subprocess.Popen([sys.executable, "-I", os.path.join(RAIZ_PROJ, "simu/controle_worker_c.py")], cwd=d, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
        resp = []
        for ped in ({"op": "carrega", "arquivo": "a.c", "nome": "a", "nomes": ["a", "b"], "varios": True, "p": {"Ts": 1e-4},
                     "sinais": {"m": [], "p": ["Ts"], "u": []}, "arquivos_c": {"a.c": cod}},
                    {"op": "passo", "t": 0.0, "m": {}},
                    {"op": "passo", "t": 1e-4, "m": {}, "msgs": [{"de": "b", "t": 0.0, "dados": {longa: 2.0}}]}):
            w.stdin.write(json.dumps(ped) + "\n"); w.stdin.flush()
            resp.append(json.loads(w.stdout.readline()))
        w.kill(); w.wait()
    envio, chegada = resp[1], resp[2]
    return (resp[0].get("ok") and not envio.get("ok") and "63 bytes" in envio.get("erro", "") and envio.get("arquivo") == "a.c"
            and not chegada.get("ok") and longa in chegada.get("erro", ""),
            f"nomes de mais de 63 bytes no C são erro (o envio: {envio.get('erro', '')[:70]}…; a chegada: {chegada.get('erro', '')[:40]}…)")


try:
    ok("recebe()" in CTL and "import copia" in CTL, "o controle em Python montado a partir do exemplo (o PI e o anti-windup são os mesmos)")
    for lat in (0.0, 2.5 * Ts):
        jp, a = roda2(f"dist_py_{round(lat / Ts * 10)}", dist(lat, False))
        jc, b = roda2(f"dist_c_{round(lat / Ts * 10)}", dist(lat, True))
        iguais = a is not None and b is not None and np.array_equal(a["i_L"], b["i_L"]) and np.array_equal(a["erro"], b["erro"], equal_nan=True)
        dif = float(np.max(np.abs(a["i_L"] - b["i_L"]))) if a is not None and b is not None else None
        ok(iguais, f"latência {lat / Ts:g}·Ts: aquisição + controle em C ≡ em Python, com o módulo nos dois — i_L e erro idênticos "
                   f"({len(a['i_L']) if a is not None else '?'} amostras, diferença máxima {dif}) {jp.get('erro', '')} {jc.get('erro', '')}")
        if lat == 0.0 and b is not None:
            pasta = Path(caminho(jc)).parent
            h_aq = (pasta / "c_aquisicao" / "maisim_sinais.h").read_text() if (pasta / "c_aquisicao" / "maisim_sinais.h").exists() else ""
            h_ct = (pasta / "c_controle" / "maisim_sinais.h").read_text() if (pasta / "c_controle" / "maisim_sinais.h").exists() else ""
            ok("M_i_L" in h_aq and "U_u_ctrl" not in h_aq and "U_u_ctrl" in h_ct and "M_i_L" not in h_ct,
               "cada controlador compila na sua pasta (c_aquisicao, c_controle), com os sinais só dele no maisim_sinais.h")
            mv = api("editor/controle").get("mensagens_vistas") or {}
            ok(mv.get("pares") == {"aquisicao|controle": ["i"]}, f"o que foi nas mensagens, da rodada em C: {mv.get('pares')}")
            cp = api("editor/controle/compara", {"a": jp["arquivo"], "b": jc["arquivo"]})
            ok(cp.get("iguais") is True, f"o 'Comparar Python × C' do painel: iguais em {len(cp.get('colunas', []))} sinais")
    # sem o .c de um controlador: não roda, e o erro diz qual falta
    j, _ = roda2("dist_c_falta", dist(0.0, True, {k: v for k, v in ARQS_C.items() if k != "aquisicao.c"}))
    ok(j.get("estado") != "fim" and "aquisicao.c" in (j.get("erro") or ""), f"sem o aquisicao.c: {(j.get('erro') or '')[:120]}")
    # maisim_envia para quem não existe: erro, com o arquivo
    j, _ = roda2("dist_c_envia", dist(0.0, True, {**ARQS_C, "aquisicao.c": AQ_C.replace('maisim_envia("controle"', 'maisim_envia("ninguem"')}))
    ok(j.get("estado") != "fim" and "ninguem" in (j.get("erro") or "") and "aquisicao.c" in (j.get("erro") or ""),
       f"maisim_envia para quem não existe: {(j.get('erro') or '')[:140]}")
    # a conferência (a da proposta da IA): cada controlador compilado com os índices dele — o M_i_L no controle.c não existe
    api("editor/controle", {"controle": dist(0.0, True)})
    t = api("editor/controle/testar", {"dt": 1e-6})
    ok("ERRO" not in t and len(t.get("passos", [])) == 3, f"o ▷ testar roda os dois em C: {t.get('erro', '')}")
    errado = {**ARQS_C, "controle.c": CTL_C.replace("(void)t; (void)m;", "(void)t; (void)m[M_i_L];")}
    j, _ = roda2("dist_c_indice", dist(0.0, True, errado))
    ok(j.get("estado") != "fim" and "controle.c" in (j.get("erro") or "") and "M_i_L" in (j.get("erro") or ""),
       f"o controle.c usando uma medida que é só da aquisição (M_i_L): {(j.get('erro') or '')[:140]}")
    # um controlador por subcircuito (a cascata do exemplo), em C: cada instância lê o vCSm do subcircuito dela (sem o prefixo)
    api("editor/abrir", {"arq": f"{T}/circuitos/exemplo_cascata_hb.ipes", "modo": "descartar"})
    pn = api("editor/controle")
    subs = sorted({f["nome"] for k, f in api("editor/estado")["folhas"].items() if k != "0"})
    SM_C = r'''#include "maisim_controle.h"
size_t maisim_tamanho_estado(void) { return 8; }
void maisim_iniciar(const maisim_real p[MAISIM_N_P], void *estado) { (void)p; (void)estado; }
void maisim_passo(maisim_real t, const maisim_real m[MAISIM_N_M], const maisim_real p[MAISIM_N_P], void *estado,
                  maisim_real u[MAISIM_N_U]) {
    (void)t; (void)p; (void)estado; (void)u;
    maisim_scope("v", m[M_vCSm]);
}
'''
    cfg = dict(pn["controle"], ativo=True, codigo='def passo(t, m, p, e):\n    return {}\n', arquivos={"sm.py": 'def passo(t, m, p, e):\n    scope("v", m["vCSm"])\n'},
               controladores=[{"nome": "sm", "arquivo": "sm.py", "medidas": [], "atuacoes": [], "subcircuitos": subs}],
               c={"usar": True, "precisao": "double", "arquivos": {"sm.c": SM_C}})
    g = api("editor/controle", {"controle": cfg})
    insts = [i["nome"] for i in g.get("instancias", [])]
    j = api("editor/rodar", {"dt": "1e-06", "tfim": "0.002", "nome": "sm_por_sub_c", "amostras": str(round(0.002 / cfg["Ts"]))})
    while j.get("estado") in ("rodando", "pausada", "preparando"): time.sleep(0.3); j = api("editor/rodada")
    d = dict(np.load(caminho(j), allow_pickle=True)) if j.get("estado") == "fim" else {}
    pares = [(f"{i}_v", f"{i[len('sm_'):]}_vCSm") for i in insts]
    iguais = d and pares and all(a in d and c in d and np.array_equal(d[a][:-1], d[c][:-1]) for a, c in pares)
    ok(bool(iguais), f"na cascata, em C: {len(insts)} instâncias do sm.c, cada uma com o vCSm do subcircuito dela "
                     f"({', '.join(f'{a} = {c}' for a, c in pares[:3])}…) {j.get('erro', '')}")
    ok(*nomes_longos())
except Exception as exc:
    ok(False, f"o teste caiu: {exc}")
finally:
    api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
