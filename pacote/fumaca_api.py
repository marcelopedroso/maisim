"""O que o teste de fumaça pede ao MaiSim de um pacote já no ar, igual no Linux (pacote/linux/fumaca.sh) e no Windows
(pacote/windows/fumaca.py): abre o exemplo do buck e roda; gera um PDF no Figuras com a rodada; roda o controle em C (o
TinyCC do pacote: a máquina pode não ter compilador). Só a biblioteca padrão. Sai com erro (e a mensagem do MaiSim) se
algo falhar.
uso: python3 pacote/fumaca_api.py <porta da página> <raiz do repositório>   (o controle.c e o exemplo vêm do repositório)"""
import json, sys, time, urllib.error, urllib.parse, urllib.request

B = f"http://localhost:{sys.argv[1]}"
RAIZ = sys.argv[2]


def api(rota, corpo=None, cru=False):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None,
                               headers={"Content-Type": "application/json", "X-MaiSim": "1", "Origin": B})
    try:
        r = urllib.request.urlopen(q, timeout=600).read()
    except urllib.error.HTTPError as e:                  # a mensagem do MaiSim, não só o código
        raise SystemExit(f"fumaça: {rota} → {e.code}: {e.read().decode(errors='replace')[:400]}")
    return r if cru else json.loads(r)


def espera(j):
    while j.get("estado") in ("rodando", "pausada", "preparando"):
        time.sleep(0.3); j = api("/maisim/simu/editor/rodada")
    return j


api("/maisim/simu/editor/abrir", {"arq": "exemplos/exemplo_buck.ipes", "modo": "descartar"})
t0 = time.time()
j = espera(api("/maisim/simu/editor/rodar", {"dt": "1e-06", "tfim": "0.005", "nome": "fumaca", "amostras": "500"}))
assert j.get("estado") == "fim", f"a rodada não terminou: {j}"
print(f"fumaça: o buck rodou em {time.time() - t0:.1f} s ({j['arquivo']})", flush=True)
arq = j["arquivo"]
canais = api("/maisim/figuras/canais?arq=" + urllib.parse.quote(arq))
nomes = [c["nome"] if isinstance(c, dict) else c for c in (canais.get("canais") or canais.get("sinais") or [])]
assert nomes, f"sem os sinais da rodada: {canais}"
pdf = api("/maisim/figuras/figura", {"arq": arq, "paineis": [{"sinais": [{"canal": nomes[0]}]}], "estilo": {"preset": "ieee1"}, "formato": "pdf"}, cru=True)
assert pdf.startswith(b"%PDF"), f"a figura não é um PDF: {pdf[:80]!r}"
print(f"fumaça: o PDF do Figuras ({nomes[0]}, {len(pdf)} bytes)", flush=True)
# o controle em C com o TinyCC do pacote: o buck com PWM em C
src = open(RAIZ + "/simu/validacao/controle_c_api.py", encoding="utf-8").read()
cod = src[src.index('CONTROLE_C = r"""') + len('CONTROLE_C = r"""'):]
cod = cod[:cod.index('"""')]
ex = json.load(open(RAIZ + "/exemplos/exemplo_controle_pwm.controle.json", encoding="utf-8"))
api("/maisim/simu/editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
api("/maisim/simu/editor/controle", {"controle": {**ex, "c": {"usar": True, "precisao": "double", "arquivos": {"controle.c": cod}}}})
j = espera(api("/maisim/simu/editor/rodar", {"dt": "1e-06", "tfim": "0.002", "nome": "fumaca_c", "amostras": "500"}))
assert j.get("estado") == "fim", f"o controle em C não rodou: {j.get('erro', j)}"
print("fumaça: o controle em C rodou (o TinyCC do pacote)", flush=True)
# o PWM dos registradores em C: o exemplo já vem em C (controle.c + pwm.c + pwm.h), com o pulso dentro da amostra
api("/maisim/simu/editor/abrir", {"arq": "exemplos/exemplo_buck_pwm_interrupcao.ipes", "modo": "descartar"})
c = api("/maisim/simu/editor/controle")["controle"]
assert c.get("ativo") and (c.get("c") or {}).get("usar") and "pwm.c" in c["c"].get("arquivos", {}), f"o exemplo do PWM não veio em C: {sorted((c.get('c') or {}).get('arquivos', {}))}"
j = espera(api("/maisim/simu/editor/rodar", {"dt": "1e-06", "tfim": "0.002", "nome": "fumaca_pwm_c", "amostras": "500"}))
assert j.get("estado") == "fim", f"o PWM dos registradores em C não rodou: {j.get('erro', j)}"
print("fumaça: o PWM dos registradores em C rodou (controle.c + pwm.c)", flush=True)
api("/maisim/simu/editor/novo", {"modo": "descartar"})     # o controle mudado não fica sem salvar (o --parar recusaria desligar o Gecko)
