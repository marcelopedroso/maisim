"""A rodada "por cima" e "guardar esta rodada" (instância de teste 7201), pedido de Marcelo em 22/10 ("não encher o disco"): com
por_cima, a rodada nova, depois de terminar bem, tira a anterior com o mesmo nome e do mesmo circuito; a guardada fica; com
erro, a anterior fica; sem por_cima (o padrão da API), cria outra; o mesmo nome em outro circuito não é tocado."""
import json, os, shutil, time, urllib.request
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
    # revisão do Codex no PR #16. (a) uma pasta só para cada rodada: com as pastas dos próximos segundos já tomadas, a rodada
    # vai para a seguinte (antes, mkdir(exist_ok) reaproveitava e ela escrevia por cima da outra)
    api("editor/abrir", {"arq": str(CIRC / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    t0 = time.time(); tomadas = [RODADAS / f"{time.strftime('%Y-%m-%d_%H%M%S', time.localtime(t0 + k))}_pc_colide" for k in range(4)]
    for d in tomadas:
        d.mkdir(parents=True, exist_ok=True)
    jc = roda("0", "pc_colide"); dc = Path(jc.get("arquivo") or "x").parent
    ok(jc.get("estado") == "fim" and dc.name not in [d.name for d in tomadas] and all(not any(d.iterdir()) for d in tomadas),
       f"duas no mesmo segundo: a rodada vai para outra pasta ({dc.name}); as tomadas ficam como estavam")
    for d in tomadas:
        shutil.rmtree(d, ignore_errors=True)
    # (b) circuitos novos sem arquivo não se substituem (todos são "novo (sem arquivo)"); (c) salvo com nome, a IA acha a rodada dele
    import sys; sys.path.insert(0, str(Path(__file__).resolve().parent)); from exemplos_monta import poe, fio, mede
    def novo_rl():
        api("editor/novo", {"modo": "descartar"})
        poe("U.1", 4, 10, "U", 503, type=401, uDC=10.0); poe("R.1", 8, 10, "R", 503, R=5.0)
        fio("a", (4, 8), (4, 6), (8, 6), (8, 8)); fio("b", (4, 12), (4, 14), (8, 14), (8, 12))
        mede("VOLT.1", 14, 10, "v_r", no1="a", no2="b")
    novo_rl(); j1n = roda("1", "pc_novo"); novo_rl(); j2n = roda("1", "pc_novo")
    pn = pastas("pc_novo")
    ok(j1n.get("estado") == "fim" and j2n.get("estado") == "fim" and len(pn) == 2 and not j2n.get("substituidas"),
       f"dois circuitos novos, sem arquivo, com o mesmo nome de rodada: um não substitui o outro ({len(pn)} pastas)")
    sv = api("editor/salvar", {"nome": "pc_salvo", "pasta": "circuitos", "sobrescrever": True})
    aberto = api("editor/aberto").get("aberto")
    un = resumo_rodada.ultima(RODADAS, aberto)
    ok("ERRO" not in sv and un is not None and un.name == Path(j2n["arquivo"]).parent.name and resumo_rodada.do_modelo(RODADAS / Path(j1n["arquivo"]).parent.name / "resumo.md") == "novo (sem arquivo)",
       f"o circuito novo salvo com nome: a IA acha a rodada dele ({un and un.name}); a do outro circuito novo não vai junto")
    for ext in (".ipes", ".controle.json", ".aparencia.json"):
        (CIRC / f"pc_salvo{ext}").unlink(missing_ok=True)
    r = api("editor/rodada/guardar", {"arq": "simu/servidor.py"})
    ok(r.get("ERRO") == 409 and "só uma rodada" in r.get("erro", ""), f"guardar o que não é rodada: recusado ({r.get('erro')})")
finally:
    if ctl_pwm:
        api("editor/abrir", {"arq": str(CIRC / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
    for d in (set(pastas()) - antes) | set(pastas("pc_colide")) | set(pastas("pc_novo")):
        shutil.rmtree(RODADAS / d, ignore_errors=True)
raise SystemExit(1 if falhas else 0)
