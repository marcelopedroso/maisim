"""Os modelos de exemplo do MaiSim (instância de teste 7201), pedido de Marcelo em 22/10: cada um (exemplos/, montados por
exemplos_monta.py) abre sem pontas soltas nem variáveis sobrando, roda com o Δt e o tempo final gravados nele e dá o número
da teoria na janela de regime; o "Abrir" mostra os exemplos e não os do GeckoCIRCUITS (MAISIM_EXEMPLOS_GECKO desligado);
os exemplos de antes sem as sobras (o SM solto e o TAG.1 do PWM; as variáveis $ do MMC)."""
import gzip, json, os, re, time, urllib.request
from pathlib import Path
import numpy as np
B = "http://localhost:7201/maisim/simu/"
RAIZ = Path(__file__).resolve().parents[2]


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def simulacao(arq):                                     # o Δt e o tempo final gravados no .ipes
    txt = gzip.open(RAIZ / arq, "rt", errors="replace").read()
    return float(re.search(r"(?m)^dt (\S+)", txt).group(1)), float(re.search(r"(?m)^tDURATION (\S+)", txt).group(1))


def roda(arq, amostras=10000):
    j = api("editor/abrir", {"arq": arq, "modo": "descartar"})
    dt, tfim = simulacao(arq)
    r = api("editor/rodar", {"dt": str(dt), "tfim": str(tfim), "nome": "exemplo_teste", "amostras": str(amostras)})
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.4); r = api("editor/rodada")
    arq_npz = r.get("arquivo", "")
    z = np.load(arq_npz if os.path.isabs(arq_npz) else RAIZ / arq_npz) if r.get("estado") == "fim" else None
    return j, r, z


def perto(x, alvo, tol):
    return abs(x - alvo) <= tol * abs(alvo)


feitas = []
try:
    # o "Abrir": os exemplos novos no grupo "exemplos"; os do GeckoCIRCUITS escondidos
    mods = api("modelos")
    grupos = {m.get("grupo") for m in mods}
    nomes = {Path(m["arq"]).stem for m in mods if m.get("grupo") == "exemplos"}
    novos = {"exemplo_buck", "exemplo_buck_degrau", "exemplo_buck_termico", "exemplo_boost", "exemplo_buck_boost", "exemplo_retificador_trifasico", "exemplo_inversor_ponte_completa",
             "exemplo_inversor_trifasico", "exemplo_inversor_meia_ponte", "exemplo_ponte_h_cc", "exemplo_retificador_monofasico",
             "exemplo_retificador_trifasico_controlado"}
    sub = list((RAIZ / "exemplos" / "subcircuitos").glob("*.ipes")) if (RAIZ / "exemplos" / "subcircuitos").is_dir() else []
    ok(novos <= nomes and len(nomes) == 14 and "exemplo_cascata_hb" not in nomes and not sub and "exemplos do GeckoCIRCUITS" not in grupos,
       f"o Abrir: os 14 exemplos (sem as células em cascata, que usam o SM-HB do MMC; nenhum subcircuito em exemplos/); sem o grupo do GeckoCIRCUITS ({sorted(grupos)})")
    CONF = [  # arquivo, o que conferir na janela final (a média, salvo dito), alvo, tolerância
        ("buck", "v_o", 24.0, 0.04), ("buck_degrau", "i_L", 24.0 / 5, 0.04),
        # o buck térmico: Tj em regime = 25 °C + P·ΣRth, com P do modo simples do Gecko a 12 A e 48 V (condução
        # 0,5·(12·0,6 + 12²·0,01) = 4,32 W; chaveamento 20 kHz·(3 + 1,5)·10⁻⁵ Ws/A·12 A·48/400 = 1,30 W) e ΣRth = 5 K/W: ≈ 53 °C
        ("buck_termico", "Tj_IGBT1", 25 + 5.0 * (0.5 * (12 * 0.6 + 144 * 0.01) + 20e3 * 4.5e-5 * 12 * 48 / 400), 0.05), ("boost", "v_o", 48.0, 0.04), ("buck_boost", "v_o", -24.0, 0.04),
        ("retificador_trifasico", "v_dc", 1.35 * 220, 0.02), ("inversor_ponte_completa", "fundamental de v_ab", 0.8 * 200, 0.02),
        ("inversor_trifasico", "fundamental de v_ab", 0.866 * 0.8 * 400, 0.02), ("inversor_meia_ponte", "fundamental de v_am", 0.8 * 100, 0.02),
        ("ponte_h_cc", "i_a", (0.5 * 100 - 40) / 1.0, 0.05), ("retificador_monofasico", "v_dc", 165.0, 0.05),
        ("retificador_trifasico_controlado", "v_dc", 1.35 * 220 * 0.866, 0.02)]
    for nome, sinal, alvo, tol in CONF:
        arq = f"exemplos/exemplo_{nome}.ipes"
        j, r, z = roda(arq)
        feitas.append(r.get("arquivo"))
        soltas = (j.get("encaixe") or {}).get("soltas")
        usadas = {v for f in j["folhas"].values() for e in f["elementos"] for k, v in e["par"].items() if k.endswith("_var") and v}
        globais = set(j.get("globais") or {}) - usadas                 # as que sobram (o retificador controlado usa $t_alfa)
        if z is None:
            ok(False, f"{nome}: a rodada não terminou ({r.get('estado')}: {r.get('erro')})"); continue
        t = z["t"]
        if sinal.startswith("fundamental"):
            m = t >= t[-1] - 3 / 60; v, tt = z[sinal.split()[-1]][m], t[m]
            x = float(np.hypot(2 * np.mean(v * np.cos(2 * np.pi * 60 * tt)), 2 * np.mean(v * np.sin(2 * np.pi * 60 * tt))))
        else:
            m = t >= t[-1] - (2 / 60 if nome.startswith("retificador") else 0.005); x = float(z[sinal][m].mean())
        if nome == "buck_degrau":                       # antes do degrau (10 ms), a carga de 10 Ω: a metade da corrente
            m0 = (t >= 0.005) & (t < 0.0099); x0 = float(z["i_L"][m0].mean())
            ok(perto(x0, 24.0 / 10, 0.05), f"buck_degrau: antes do degrau (5 a 10 ms) i_L = {x0:.2f} (teoria 2,4); depois, a seguir")
        ok(not soltas and not globais and perto(x, alvo, tol),
           f"{nome}: sem pontas soltas nem variáveis sobrando; {sinal} = {x:.2f} (teoria {alvo:.1f}, ±{tol:.0%}); sinais {sorted(k for k in z.files if k not in ('t', 'meta'))}")
    # os de antes, sem as sobras
    j = api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
    els = [e["nome"] for e in j["folhas"]["0"]["elementos"]]
    jp = api("editor/abrir", {"arq": "exemplos/exemplo_controle_pi.ipes", "modo": "descartar"})
    ok("TAG.1" not in els and "SM1" not in els and list(j["folhas"]) == ["0"] and not j.get("globais") and not jp.get("globais"),
       f"exemplo_controle_pwm sem o SM solto e o TAG.1; o PWM e o PI sem as variáveis $ do MMC ({els})")
    # o painel XY pronto no layout padrão do scope (<nome>.scope.json, 25/10): o trifásico com o vetor espacial das correntes
    # (αβ e dq a −60 Hz, a sequência do exemplo) e o U–Z·i de v_an; a ponte completa com o U–Z·i de v_ab; os títulos em inglês
    def padrao(arq, l):
        q = urllib.request.Request(B + "scope/padrao?modelo=" + arq, headers={"Cookie": f"maisim-lingua={l}"})
        return (json.loads(urllib.request.urlopen(q, timeout=60).read()).get("layout") or {}).get("itens") or []
    for arq, quer in (("exemplos/exemplo_inversor_trifasico.ipes", [("vetor", False, "i_a"), ("vetor", True, "i_a"), ("uzi", False, "v_an")]),
                      ("exemplos/exemplo_inversor_ponte_completa.ipes", [("uzi", False, "v_ab")])):
        pt, en = padrao(arq, "pt"), padrao(arq, "en")
        xy = [x["xy"] for x in pt if x.get("xy")]
        tem = [(x["modo"], bool(x.get("dq")), x.get("a") or x["pares"][0]["u"]) for x in xy]
        dq_ok = all(x["th"]["f"] == -60 for x in xy if x.get("dq"))
        uzi_ok = all(abs(x["pares"][0]["z"] - 10.69) < 0.01 and x["media"] == 200 for x in xy if x["modo"] == "uzi")
        tit_en = [x.get("titulo") or x.get("secao") for x in en]
        ok(tem == quer and dq_ok and uzi_ok and len(en) == len(pt) and [x.get("xy") for x in en] == [x.get("xy") for x in pt]
           and tit_en != [x.get("titulo") or x.get("secao") for x in pt] and all(t and not re.search(r"[ãçõé]|Tensão|Corrente", t) for t in tit_en),
           f"{Path(arq).stem}: o scope abre com os painéis XY {tem} (dq a −60 Hz, U–Z·i com |Z| = 10,69 Ω e média de 200 µs); em inglês: {tit_en}")
    # a trava (Marcelo, 22/10: "não poder salvar por cima o exemplo"): um exemplo aberto não tem dono (o "salvar" vira "salvar
    # como") e o servidor só grava em circuitos/ ou subcircuitos/
    j = api("editor/abrir", {"arq": "exemplos/exemplo_buck.ipes", "modo": "descartar"})
    r = api("editor/salvar", {"nome": "exemplo_buck", "pasta": "exemplos", "sobrescrever": True})
    ok(not j.get("dono") and r.get("ERRO") == 409 and "circuitos ou subcircuitos" in r.get("erro", ""),
       f"um exemplo não se salva por cima: sem dono (salvar → salvar como); gravar em exemplos/ recusado ({r.get('erro')})")
finally:
    for a in feitas:
        if a:
            p = Path(a) if os.path.isabs(a) else RAIZ / a
            import shutil; shutil.rmtree(p.parent, ignore_errors=True)
    api("editor/abrir", {"arq": str(Path.home() / ".cache/maisim_teste/circuitos/exemplo_controle_pwm.ipes"), "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
