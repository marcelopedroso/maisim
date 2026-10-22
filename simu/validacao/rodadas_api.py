"""A rodada "por cima" e "guardar esta rodada" (instância de teste 7201), pedido de Marcelo em 22/10 ("não encher o disco"): com
por_cima, a rodada nova, depois de terminar bem, tira a anterior com o mesmo nome e do mesmo circuito; a guardada fica; com
erro, a anterior fica; sem por_cima (o padrão da API), cria outra; o mesmo nome em outro circuito não é tocado."""
import json, os, time, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
RODADAS = Path.home() / ".cache/maisim_teste/rodadas"
CIRC = Path.home() / ".cache/maisim_teste/circuitos"
NOME = "pc_teste"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=120).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def roda(por_cima, nome=NOME):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": "0.002", "nome": nome, "amostras": "100", "por_cima": por_cima})
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.3); j = api("editor/rodada")
    return j


def pastas(nome=NOME):
    return sorted(d.name for d in RODADAS.glob(f"*_{nome}") if d.is_dir())


antes = set(pastas())
ctl_pwm = None
try:
    api("editor/abrir", {"arq": str(CIRC / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    ctl_pwm = api("editor/controle")["controle"]
    j1 = roda("1"); p1 = set(pastas()) - antes
    j2 = roda("1"); p2 = set(pastas()) - antes
    ok(j1.get("estado") == "fim" and j2.get("estado") == "fim" and len(p1) == 1 and len(p2) == 1 and p1 != p2 and len(j2.get("substituidas") or []) == 1,
       f"duas rodadas por cima: fica uma pasta (a nova); a rodada diz o que substituiu ({j2.get('substituidas')})")
    g = api("editor/rodada/guardar", {"arq": j2["arquivo"]})
    ok(g.get("guardada") is True and (RODADAS / g.get("pasta", "-") / ".guardada").exists(), f"guardar: a pasta ganha .guardada ({g})")
    j3 = roda("1"); p3 = set(pastas()) - antes
    ok(j3.get("estado") == "fim" and p2 <= p3 and len(p3) == 2 and not j3.get("substituidas"), "por cima de uma guardada: ela fica (duas pastas)")
    j4 = roda("0"); p4 = set(pastas()) - antes
    ok(len(p4) == 3 and not j4.get("substituidas"), "criar outra (por_cima 0): mais uma pasta, nada sai")
    # o mesmo nome em outro circuito não é tocado
    api("editor/abrir", {"arq": str(CIRC / "exemplo_controle_pi.ipes"), "modo": "descartar"})
    j5 = roda("1"); p5 = set(pastas()) - antes
    ok(j5.get("estado") == "fim" and p4 <= p5 and len(p5) == 4, f"o mesmo nome noutro circuito: as do outro ficam ({len(p5)} pastas)")
    # o ULTIMA_RODADA.md da IA: a mais nova do circuito aberto, não a de outro (Marcelo, 22/10)
    import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1])); import resumo_rodada
    u_pi, u_pwm = resumo_rodada.ultima(RODADAS, str(CIRC / "exemplo_controle_pi.ipes")), resumo_rodada.ultima(RODADAS, str(CIRC / "exemplo_controle_pwm.ipes"))
    nenhum = resumo_rodada.ultima(RODADAS, str(CIRC / "nao_existe.ipes"))
    ok(u_pi and u_pi.name in p5 - p4 and u_pwm and u_pwm.name in p4 and u_pwm != u_pi and nenhum is None,
       f"a última rodada por circuito: o PI ({u_pi and u_pi.name}), o PWM ({u_pwm and u_pwm.name}); de um circuito sem rodada, nenhuma")
    # com erro, a anterior fica
    c = api("editor/controle")["controle"]
    ruim = dict(c, codigo=c["codigo"].replace("def passo(t, m, p, e):", "def passo(t, m, p, e):\n    if t > 5e-4:\n        raise ValueError('erro de propósito')", 1))
    api("editor/controle", {"controle": ruim})
    j6 = roda("1"); p6 = set(pastas()) - antes
    api("editor/controle", {"controle": c})
    ok(j6.get("estado") == "erro" and p5 <= p6 and len(p6) == 5, f"uma rodada com erro não tira a anterior ({j6.get('estado')}: {str(j6.get('erro'))[:50]})")
    r = api("editor/rodada/guardar", {"arq": "simu/servidor.py"})
    ok(r.get("ERRO") == 409 and "só uma rodada" in r.get("erro", ""), f"guardar o que não é rodada: recusado ({r.get('erro')})")
finally:
    if ctl_pwm:
        api("editor/abrir", {"arq": str(CIRC / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    for d in set(pastas()) - antes:
        import shutil; shutil.rmtree(RODADAS / d, ignore_errors=True)
raise SystemExit(1 if falhas else 0)
