"""A IA do MaiSim gera o controle em C (instância de teste 7201, com o claude de mentira, cenário converte_c): a pasta do
pedido tem o controle.c (o modelo, se ainda não há), o maisim_sinais.h gerado do painel e o maisim_controle.h; a IA pode
escrever o controle.c; a proposta traz o C junto com os outros arquivos (a diferença, o aplicar por arquivo e o voltar), o
MaiSim o confere compilando (sem rodar: um erro volta com a linha) e o teste da proposta roda o C. O controle.c aplicado
roda e dá as mesmas formas de onda que o controle.py (exemplos/exemplo_controle_pwm). O CONTEXTO.md diz a linguagem
do painel (Python ou C), e com o painel em C o controle.c escrito do zero vira proposta."""
import json, subprocess, time, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
B = "http://localhost:7201/maisim/simu/"
PID = subprocess.run("ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1", shell=True, capture_output=True, text=True).stdout.strip()
ENV = dict(x.split("=", 1) for x in Path(f"/proc/{PID}/environ").read_bytes().decode().split("\0") if "=" in x)
assert ENV.get("MAISIM_CLAUDE_BIN", "").endswith("claude_falso.py"), "suba o servidor de teste com o claude de mentira (reinicia_servidor_teste.sh)"
CONF = Path(ENV["MAISIM_CLAUDE_DIR"])
assert "maisim_teste" in str(CONF) or "/tmp/" in str(CONF), "MAISIM_CLAUDE_DIR tem de ser uma pasta descartável"
CONF.mkdir(parents=True, exist_ok=True)


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "X-MaiSim": "1"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas
    print(("OK   " if c else "FALHA"), t)
    falhas += (not c)


def pede(controle_c, texto="Converta o controle.py para C, no controle.c."):
    (CONF / "falso_cenario").write_text("converte_c")
    (CONF / "falso_logado").write_text("")
    (CONF / "falso_controle.c").write_text(controle_c)
    r = api("claude/pedir", {"texto": texto, "dt": 1e-6, "tfim": 0.002})
    if "ERRO" in r:
        return r
    for _ in range(120):
        e = api("claude/pedido")
        if not e.get("andamento"):
            return e
        time.sleep(0.5)
    return e


# o C do exemplo do buck (o mesmo do controle_c_api.py)
src = (RAIZ / "simu/validacao/controle_c_api.py").read_text()
CONTROLE_C = src[src.index('CONTROLE_C = r"""') + len('CONTROLE_C = r"""'):]
CONTROLE_C = CONTROLE_C[:CONTROLE_C.index('"""')]
try:
    r = api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
    ok("ERRO" not in r, "abre o exemplo do buck com PWM no controle")
    api("claude/nova", {})
    e = pede(CONTROLE_C)
    p = e.get("proposta") or {}
    resp = e.get("resposta") or ""
    ok("M_i_L" in resp and "P_Ts" in resp and "U_g" in resp and "maisim_controle.h: sim" in resp and "havia controle.c: sim" in resp,
       f"a pasta do pedido tem o controle.c (modelo), o maisim_sinais.h (M_i_L, P_Ts, U_g) e o maisim_controle.h: {resp[:160]}")
    ok(p.get("mudou") and p.get("c_mudou") and (p.get("arquivos") or {}).get("controle.c") == CONTROLE_C and not p.get("erros"),
       f"a proposta traz o controle.c, sem erro de compilação (arquivos: {sorted(p.get('arquivos') or {})}, erros: {p.get('erros')})")
    chamada = [json.loads(l) for l in (CONF / "falso_chamadas.jsonl").read_text().splitlines() if '"-p"' in l and '/usage' not in l][-1]["args"]
    ok(all(x in chamada for x in ("Write(./*.c)", "Edit(./*.c)", "Write(./*.h)", "Edit(./*.h)")), "a IA pode escrever e editar o controle.c e os módulos em C (.c/.h)")
    t = api("claude/testar", {"dt": 1e-6})
    teste = (t.get("proposta") or {}).get("teste") or {}
    ok(teste.get("ok") and len(teste.get("passos") or []) == 3, f"o teste da proposta roda o C: {teste.get('erro') or [x['a'] for x in teste.get('passos', [])]}")
    # aplicar (o que a página faz): o controle.c vai no "c", ao lado dos .py
    c = api("editor/controle")["controle"]
    c["c"] = {**c["c"], "usar": True, "arquivos": {"controle.c": p["arquivos"]["controle.c"]}}
    g = api("editor/controle", {"controle": c})
    ok("ERRO" not in g and g["controle"]["c"]["arquivos"].get("controle.c") == CONTROLE_C, "aplicada: o controle.c guardado")
    # o C errado: a proposta volta com o erro na linha (compilado, não rodado)
    errado = CONTROLE_C.replace("e->n += 1;", "e->n += 1\n    sem_ponto_e_virgula")
    e2 = pede(errado)
    erros = (e2.get("proposta") or {}).get("erros") or []
    ok(any(x.get("arquivo") == "controle.c" and x.get("linha") == 38 for x in erros), f"a proposta com C errado traz o erro na linha 38: {erros[:1]}")
    # a IA sabe a linguagem do painel (o seletor Python | C): o CONTEXTO.md diz qual roda
    ok("Linguagem do controle: Python" in resp, f"com o painel em Python, o CONTEXTO.md diz Python: {resp[-80:]}")
    api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
    c = api("editor/controle")["controle"]
    c["c"] = {**c["c"], "usar": True}                    # o painel em C, ainda sem controle.c no circuito
    api("editor/controle", {"controle": c})
    py_antes = api("editor/controle")["controle"]["codigo"]
    e4 = pede(CONTROLE_C, "faça o controle de corrente do buck")
    p4, resp4 = e4.get("proposta") or {}, e4.get("resposta") or ""
    ok("Linguagem do controle: C" in resp4, f"com o painel em C, o CONTEXTO.md diz C: {resp4[-80:]}")
    ok(p4.get("c_mudou") and (p4.get("arquivos") or {}).get("controle.c") == CONTROLE_C and not p4.get("erros")
       and (p4.get("arquivos") or {}).get("controle.py", py_antes) == py_antes,
       f"com o painel em C e sem C antes, o controle.c escrito entra na proposta, sem erro, e o controle.py fica como estava ({sorted(p4.get('arquivos') or {})})")
    # a IA escreve um módulo em C (o par pwm.h/pwm.c): entra na proposta e compila junto
    pwm_h = '#ifndef PWM_H\n#define PWM_H\n#include "maisim_controle.h"\nmaisim_real pwm_compara(maisim_real portadora, maisim_real d);\n#endif\n'
    pwm_c = '#include "pwm.h"\nmaisim_real pwm_compara(maisim_real portadora, maisim_real d) { return portadora < d ? 1.0 : 0.0; }\n'
    com_mod = CONTROLE_C.replace('#include "maisim_controle.h"', '#include "maisim_controle.h"\n#include "pwm.h"', 1) \
                        .replace("u[U_g] = portadora < e->d ? 1.0 : 0.0;", "u[U_g] = pwm_compara(portadora, e->d);")
    (CONF / "falso_c_extra.json").write_text(json.dumps({"pwm.h": pwm_h, "pwm.c": pwm_c}))
    e5 = pede(com_mod, "separe o PWM num módulo")
    p5 = e5.get("proposta") or {}
    ok(all((p5.get("arquivos") or {}).get(a) == t for a, t in (("controle.c", com_mod), ("pwm.h", pwm_h), ("pwm.c", pwm_c))) and not p5.get("erros"),
       f"o módulo em C da IA (pwm.h + pwm.c) entra na proposta e compila junto: {sorted(p5.get('arquivos') or {})} {p5.get('erros')}")
    (CONF / "falso_c_extra.json").write_text(json.dumps({"pwm.h": pwm_h, "pwm.c": pwm_c.replace("1.0 : 0.0;", "1.0 : 0.0")}))
    e6 = pede(com_mod, "separe o PWM num módulo")
    erros6 = (e6.get("proposta") or {}).get("erros") or []
    ok(any(x.get("arquivo") == "pwm.c" for x in erros6), f"um erro no módulo volta com o arquivo dele (pwm.c): {erros6[:1]}")
    (CONF / "falso_c_extra.json").unlink()
    # o modelo intocado de um circuito sem C não vira proposta
    api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
    modelo = (RAIZ / "simu/controle_c/controle_modelo.c").read_text()
    e3 = pede(modelo, "explique o controle")
    p3 = e3.get("proposta") or {}
    ok(not p3.get("c_mudou") and "controle.c" not in (p3.get("arquivos") or {}), "sem C antes, o modelo intocado não entra na proposta")
except Exception as exc:
    ok(False, f"o teste caiu: {exc}")
finally:
    (CONF / "falso_cenario").write_text("ganho")
    (CONF / "falso_c_extra.json").unlink(missing_ok=True)
    api("editor/novo", {"modo": "descartar"})
raise SystemExit(1 if falhas else 0)
