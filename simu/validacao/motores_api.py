"""As máquinas (v0.3.1, frente C; instância de teste do perfil config/teste.env): os bornes onde o Gecko os põe (ipes.py,
MOTORES), o torque de carga por um sinal de controle (editor/mede tipo L: o parameterString[0] da máquina) e a grandeza da
máquina (VIEWMOT, tipo M: a máquina e a grandeza do getParameterStringIntern), e os dois exemplos com o controle em Python.

- Os bornes: o M-DC (armadura e campo), o PMSM (três fases) e o PM-DC e o IM-CAGE nas posições da geometria do Gecko; nos
  exemplos e no dq_control_pmsm.ipes do Gecko (se houver o código dele), nenhuma ponta solta.
- Os acoplamentos: a carga e a grandeza entram, os errados são recusados, salvar e abrir de novo os mantém, e o nome da
  máquina no parameterString do VIEWMOT não cresce a cada abertura (o patch 0006 do Gecko).
- O motor CC (exemplo_motor_cc): em regime, ω = (V_a − Ra·I_a)/k (V_a a média exata, pela integral de v_a; k = c·Le·ie/Ne
  com o ie da máquina), Tel = k·I_a = T_carga + fr·ω; a velocidade segue a referência (1000 e 1500 rpm) e o degrau de carga.
- O PMSM (exemplo_pmsm): i_d ≈ 0 e i_q seguindo a referência (Park das correntes da máquina, conta à parte), Tel = 1,5·p·Psi·i_q
  = T_carga + fr·ω e a velocidade nos degraus."""
import gzip, json, math, os, re, shutil, time, urllib.request
from pathlib import Path
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
_P = re.search(r"(?m)^MAISIM_PORTA_SIMU=(\d+)", (RAIZ / "config/teste.env").read_text())
B = f"http://localhost:{_P.group(1) if _P else 7201}/maisim/simu/"
SALVOS = Path.home() / ".cache/maisim_teste/circuitos"


def api(rota, corpo=None):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(q, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def cmd(op, *a):
    return api("editor/cmd", {"op": op, "args": list(a)})


def el(r, nome):
    return next((e for e in r["folhas"]["0"]["elementos"] if e["nome"] == nome), None)


def ponto(e, px, py):                                   # ipes.ponto_gecko (a orientação 503 dos exemplos: (x + px, y − py))
    return {504: (e["x"] + py, e["y"] + px), 501: (e["x"] - px, e["y"] + py), 502: (e["x"] - py, e["y"] - px)}.get(e["dir"], (e["x"] + px, e["y"] - py))


def ligados(r, e):
    """Os bornes da máquina com uma conexão chegando ou um rótulo (ligação pelo nome, como no Gecko)."""
    pts = {tuple(p) for f in r["folhas"]["0"]["fios"] for p in f["pts"]}
    return all((t["x"], t["y"]) in pts or t["rotulo"] for t in e["terminais"])


def roda(nome, dt, tfim, amostras):
    r = api("editor/rodar", {"dt": str(dt), "tfim": str(tfim), "nome": nome, "amostras": str(amostras)})
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.4); r = api("editor/rodada")
    a = r.get("arquivo", "")
    return r, (np.load(a if os.path.isabs(a) else RAIZ / a) if r.get("estado") == "fim" else None)


def perto(x, alvo, tol):
    return abs(x - alvo) <= tol * max(abs(alvo), 1e-9)


feitas = []
try:
    # ---------------------------------------------------------------- os bornes
    r = api("editor/novo", {"descartar": True})
    for n, t, x in (("M-DC.1", "M-DC", 10), ("PM-DC.1", "PM-DC", 20), ("PMSM.1", "PMSM", 30), ("IM-CAGE.1", "IM-CAGE", 40)):
        r = cmd("CREATE", n, x, 10, t)
    geo = {g["id"]: g for g in json.loads((RAIZ / "simu/geometria_gecko.json").read_text()) if "id" in g}
    for n in ("M-DC.1", "PM-DC.1", "PMSM.1", "IM-CAGE.1"):
        e = el(r, n)
        g = geo[e["id_gecko"]]
        esperado = [ponto(e, *p) for p in g["entradas"] + g["saidas"]]
        ok(e and [(t["x"], t["y"]) for t in e["terminais"]] == esperado and e.get("grandezas"),
           f"{n}: os bornes onde o Gecko os põe {esperado} e a lista de grandezas ({len(e.get('grandezas') or [])})")
    # ---------------------------------------------------------------- os acoplamentos
    cmd("CREATE", "CONST.1", 10, 20, "CONST"); cmd("OUTNODE", "CONST.1", 0, "Tm")
    cmd("CREATE", "VIEWMOT.1", 20, 20, "VIEWMOT"); cmd("OUTNODE", "VIEWMOT.1", 0, "n_MDC1")
    cmd("CREATE", "R.1", 50, 10, "R")
    r = api("editor/mede", {"nome": "M-DC.1", "tipo": "L", "sinal": "Tm"})
    ok("ERRO" not in r and el(r, "M-DC.1")["mede"][0] == "Tm", f"o torque de carga do M-DC.1 vem do sinal Tm: {r.get('erro') or el(r, 'M-DC.1')['mede']}")
    r = api("editor/mede", {"nome": "VIEWMOT.1", "tipo": "M", "componente": "M-DC.1", "grandeza": "n [rpm]"})
    v = "ERRO" not in r and el(r, "VIEWMOT.1")
    ok(v and v["mede"][1] == "M-DC.1" and v["grandeza"] == "n [rpm]", f"o VIEWMOT.1 lê n [rpm] do M-DC.1: {r.get('erro') or (v['mede'], v['grandeza'])}")
    ruins = [api("editor/mede", {"nome": "VIEWMOT.1", "tipo": "M", "componente": "R.1", "grandeza": "n [rpm]"}),
             api("editor/mede", {"nome": "VIEWMOT.1", "tipo": "M", "componente": "M-DC.1", "grandeza": "isa [A]"}),
             api("editor/mede", {"nome": "R.1", "tipo": "L", "sinal": "Tm"})]
    ok(all(x.get("ERRO") == 409 for x in ruins), f"recusados: a grandeza de um resistor, a do PMSM no M-DC e a carga de um resistor ({[x.get('erro') for x in ruins]})")
    r = api("editor/estado")
    ok(el(r, "VIEWMOT.1")["grandeza"] == "n [rpm]" and el(r, "M-DC.1")["mede"][0] == "Tm", "a recusa não mexeu no que já estava")
    # salvar, abrir de novo (duas vezes): os acoplamentos ficam e o nome da máquina não se repete no parameterString
    api("editor/salvar", {"nome": "motores_teste", "pasta": "circuitos", "sobrescrever": True})
    for _ in range(2):
        r = api("editor/abrir", {"arq": str(SALVOS / "motores_teste.ipes"), "modo": "descartar"})
        cmd("MOVE", "R.1", 52, 10)                    # uma edição (o Gecko reabre o arquivo de novo)
        api("editor/salvar", {"nome": "motores_teste", "pasta": "circuitos", "sobrescrever": True})
    r = api("editor/abrir", {"arq": str(SALVOS / "motores_teste.ipes"), "modo": "descartar"})
    txt = gzip.open(SALVOS / "motores_teste.ipes", "rt").read() if (SALVOS / "motores_teste.ipes").read_bytes()[:2] == b"\x1f\x8b" else (SALVOS / "motores_teste.ipes").read_text()
    linha = re.search(r"parameterString\[\] (/M-DC\.1[^\n]*)\nnameOpt[^\n]*\norientierung[^\n]*\nidStringDialog VIEWMOT\.1", txt) or re.search(r"parameterString\[\] (/[^\n]*n \[rpm\][^\n]*)", txt)
    ok(el(r, "M-DC.1")["mede"][0] == "Tm" and el(r, "VIEWMOT.1")["mede"][1] == "M-DC.1" and el(r, "VIEWMOT.1")["grandeza"] == "n [rpm]"
       and linha and linha.group(1).count("M-DC.1") == 2,
       f"salvo e aberto três vezes: a carga e a grandeza ficam; no arquivo, {linha and linha.group(1)!r} (o nome da máquina não cresce)")
    # ---------------------------------------------------------------- o exemplo do Gecko (PMSM ligado só por rótulos)
    ex = RAIZ / "gecko/build/GeckoCIRCUITS/resources/Newsletter/ipes_files/dq_control_pmsm.ipes"
    if ex.exists():
        shutil.copy(ex, SALVOS / "motores_dq_gecko.ipes")
        r = api("editor/abrir", {"arq": str(SALVOS / "motores_dq_gecko.ipes"), "modo": "descartar"})
        e = el(r, "PMSM.1") if "ERRO" not in r else None
        vm = [x for x in (r.get("folhas") or {}).get("0", {}).get("elementos", []) if x["tipo"] == "VIEWMOT"]
        ok(e and [t["rotulo"] for t in e["terminais"]] == ["UR", "US", "UT"] and not r["encaixe"]["soltas"] and e["mede"][0] == "Tm"
           and all(x["mede"][1] == "PMSM.1" and x["grandeza"] in e["grandezas"] for x in vm) and len(vm) == 5,
           f"dq_control_pmsm.ipes do Gecko: PMSM.1 com as fases UR/US/UT nos bornes, carga Tm, 5 VIEWMOT ligados, pontas soltas {r.get('encaixe', {}).get('soltas')}")
    else:
        print("(sem o código do Gecko em gecko/build/GeckoCIRCUITS: o exemplo dele fica de fora)")

    # ---------------------------------------------------------------- o motor CC
    r = api("editor/abrir", {"arq": "exemplos/exemplo_motor_cc.ipes", "modo": "descartar"})
    e = el(r, "M-DC.1")
    ok(e and len(e["terminais"]) == 4 and ligados(r, e) and not r["encaixe"]["soltas"] and e["mede"][0] == "Tm",
       f"exemplo_motor_cc: M-DC.1 com os 4 bornes ligados (armadura a/gnd, campo vf/gnd), carga Tm, pontas soltas {r['encaixe']['soltas']}")
    ctl = api("editor/controle")
    ctl = ctl.get("controle", ctl)
    ok(ctl.get("ativo") and ctl.get("atuacoes") == ["d"] and "n_MDC1" in ctl.get("codigo", ""), "o controle do exemplo vem junto (ativo, atua em d, lê n_MDC1)")
    # nada "sem salvar" ao abrir nem depois de rodar (o VIEWMOT guarda "M-DC.1.n [rpm]" igual antes e depois: patch 0006)
    p0 = api("editor/pendente").get("pendente")
    rr, _ = roda("motores_curta", 1e-6, 0.002, 40)
    feitas.append(rr.get("arquivo"))
    ok(p0 is False and api("editor/pendente").get("pendente") is False, f"exemplo_motor_cc: nada pendente ao abrir e depois de uma rodada curta ({p0})")
    # para a conta: a média exata de v_a (a integral, lida nas pontas da janela) e o ie da máquina (k = c·Le·ie/Ne)
    cmd("CREATE", "INT.9", 50, 40, "INT"); cmd("INNODE", "INT.9", 0, "v_a"); cmd("OUTNODE", "INT.9", 0, "int_va")
    for k, v in (("a1", 1.0), ("min", -1e9), ("max", 1e9)):
        cmd("SETP", "INT.9", k, v)
    cmd("CREATE", "VIEWMOT.9", 50, 44, "VIEWMOT"); cmd("OUTNODE", "VIEWMOT.9", 0, "ie_MDC1")
    api("editor/mede", {"nome": "VIEWMOT.9", "tipo": "M", "componente": "M-DC.1", "grandeza": "ie [A]"})
    rr, z = roda("motores_cc", 1e-6, 0.45, 9000)
    feitas.append(rr.get("arquivo"))
    if z is None:
        ok(False, f"motor CC: a rodada não terminou ({rr.get('estado')}: {rr.get('erro')})")
    else:
        t = z["t"]; P = {p["nome"]: p["valor"] for p in ctl["parametros"]}
        Ra, c, Le, Ne, fr = 0.5, 200.0, 0.5, 100.0, 1e-3
        def janela(a, b):
            m = (t >= a) & (t <= b); return m, t[m]
        m, tt = janela(0.40, 0.45)
        w = float(np.mean(z["n_MDC1"][m])) * math.pi / 30
        ia, tel, ie = (float(np.mean(z[k][m])) for k in ("ia_MDC1", "Tel_MDC1", "ie_MDC1"))
        va = float((z["int_va"][m][-1] - z["int_va"][m][0]) / (tt[-1] - tt[0]))
        k = c * Le * ie / Ne
        w_teo = (va - Ra * ia) / k
        ok(perto(ie, 1.0, 0.01) and perto(w, w_teo, 0.01),
           f"motor CC em regime (0,40 a 0,45 s): ω = {w:.2f} rad/s; (V_a − Ra·I_a)/k = ({va:.2f} − {Ra}·{ia:.3f})/{k:.4f} = {w_teo:.2f} rad/s (±1%; ie = {ie:.4f} A)")
        ok(perto(tel, k * ia, 0.005) and perto(tel, 8.0 + fr * w, 0.02),
           f"motor CC: Tel = {tel:.3f} N·m; k·I_a = {k * ia:.3f}; T_carga + fr·ω = 8 + {fr}·{w:.1f} = {8 + fr * w:.3f} (±2%)")
        n = z["n_MDC1"]
        n1 = float(np.mean(n[(t >= 0.10) & (t < 0.15)])); n2 = float(np.mean(n[(t >= 0.25) & (t < 0.30)])); n3 = float(np.mean(n[t >= 0.40]))
        ok(perto(n1, 1000, 0.005) and perto(n2, 1000, 0.005) and perto(n3, 1500, 0.005),
           f"motor CC: a velocidade segue a referência — {n1:.1f} rpm antes da carga, {n2:.1f} com 8 N·m, {n3:.1f} depois do degrau para 1500 (±0,5%)")
        pico = float(n[(t > 0.30) & (t < 0.45)].max()); vale = float(n[(t > 0.15) & (t < 0.25)].min())
        ass = float(np.abs(n[(t >= 0.36) & (t < 0.45)] - 1500).max())
        ok(pico < 1500 * 1.03 and ass < 15 and vale > 900,
           f"motor CC: o degrau 1000 → 1500 rpm passa no máximo {pico - 1500:.1f} rpm (< 3%) e a 60 ms dele fica a {ass:.1f} rpm (< 1%); a carga de 8 N·m afunda até {vale:.0f} rpm (> 900)")

    # ---------------------------------------------------------------- o PMSM
    r = api("editor/abrir", {"arq": "exemplos/exemplo_pmsm.ipes", "modo": "descartar"})
    e = el(r, "PMSM.1")
    ok(e and len(e["terminais"]) == 3 and ligados(r, e) and not r["encaixe"]["soltas"] and [t["rotulo"] for t in e["terminais"]] == ["a", "b", "c"],
       f"exemplo_pmsm: PMSM.1 com as fases a, b, c ligadas ao inversor, pontas soltas {r['encaixe']['soltas']}")
    ctl = api("editor/controle"); ctl = ctl.get("controle", ctl)
    rr, z = roda("motores_pmsm", 1e-6, 0.12, 1200)
    feitas.append(rr.get("arquivo"))
    if z is None:
        ok(False, f"PMSM: a rodada não terminou ({rr.get('estado')}: {rr.get('erro')})")
    else:
        t = z["t"]; pp, psi, fr = 3, 0.191, 2.1e-4
        th = pp * z["theta_PMSM1"]; ia, ib, ic = z["isa_PMSM1"], z["isb_PMSM1"], z["isc_PMSM1"]
        i_d = 2 / 3 * (ia * np.cos(th) + ib * np.cos(th - 2 * np.pi / 3) + ic * np.cos(th + 2 * np.pi / 3))      # o Park do Gecko
        i_q = -2 / 3 * (ia * np.sin(th) + ib * np.sin(th - 2 * np.pi / 3) + ic * np.sin(th + 2 * np.pi / 3))    # (MotorPMSM)
        m = t >= 0.005
        ok(float(np.abs(i_d[m]).max()) < 0.6 and float(np.sqrt(np.mean(i_d[m] ** 2))) < 0.15,
           f"PMSM: i_d ≈ 0 (máx |i_d| = {np.abs(i_d[m]).max():.3f} A, rms {np.sqrt(np.mean(i_d[m] ** 2)):.3f} A, de 5 a 120 ms)")
        f = np.isfinite(z["i_q"])                       # a última amostra (o fim da rodada) não passa pelo controle: sem os scope() dele
        ok(f.sum() >= len(t) - 1 and float(np.max(np.abs(i_q - z["i_q"])[f])) < 1e-6 and float(np.max(np.abs(i_d - z["i_d"])[f])) < 1e-6,
           "PMSM: o Park do controle.py é o mesmo do Gecko (a conta à parte, das correntes da máquina, dá os mesmos i_d e i_q)")
        for a, b, alvo_n in ((0.03, 0.04, 1000), (0.06, 0.07, 1000), (0.11, 0.12, 2000)):
            mm = (t >= a) & (t < b) & f
            erro_q = float(np.sqrt(np.mean((i_q[mm] - z["iq_ref"][mm]) ** 2)))
            nn = float(np.mean(z["n_PMSM1"][mm]))
            ok(erro_q < 0.5 and perto(nn, alvo_n, 0.01), f"PMSM de {a * 1e3:.0f} a {b * 1e3:.0f} ms: i_q segue a referência (rms do erro {erro_q:.3f} A) e n = {nn:.1f} rpm (alvo {alvo_n}, ±1%)")
        mm = t >= 0.11
        tel, iq, w = float(np.mean(z["Tel_PMSM1"][mm])), float(np.mean(i_q[mm])), float(np.mean(z["n_PMSM1"][mm])) * math.pi / 30
        ok(perto(tel, 1.5 * pp * psi * iq, 0.01) and perto(tel, 5.0 + fr * w, 0.03),
           f"PMSM em regime: Tel = {tel:.3f} N·m; 1,5·p·Psi·i_q = {1.5 * pp * psi * iq:.3f}; T_carga + fr·ω = {5 + fr * w:.3f} (±3%)")
finally:
    for a in feitas:
        if a:
            p = Path(a) if os.path.isabs(a) else RAIZ / a
            shutil.rmtree(p.parent, ignore_errors=True)
    for f in ("motores_teste", "motores_dq_gecko"):
        for x in SALVOS.glob(f + ".*"):
            x.unlink()
    api("editor/abrir", {"arq": str(SALVOS / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
