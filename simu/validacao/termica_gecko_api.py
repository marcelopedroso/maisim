"""Um exemplo térmico do próprio GeckoCIRCUITS (resources/Topologies/BuckBoost_thermal.ipes: buck-boost com IGBT e diodo, dois
Pv, uma rede Cauer de 4 Rth/Cth até o dissipador, um TEMP da Tj e dois FLOW das perdas), aberto no MaiSim da instância de
teste, dá os mesmos números que o Gecko sozinho:
  - abre sem pontas soltas e com os acoplamentos do arquivo (Pv → IGBT/diodo, FLOW → Pv, TEMP → Tj − Tzero);
  - a rodada do MaiSim (2 ms, Δt = 0,1 µs, uma amostra a cada 10 passos) × o Gecko passo a passo por um motor só deste
    teste (o do servidor atende um cliente por vez; este, noutra porta, fala com o mesmo Gecko: OPEN, INIT, STEP 1 e GETM a
    cada passo, sem nada do laço do MaiSim): a Tj (em ponto) igual em cada amostra; cada amostra das perdas
    (média do intervalo) igual à média dos 10 passos do Gecko; e a energia (a soma) igual;
  - o modo de perda de cada semicondutor (verlustTyp): o NPCmodel.ipes do Gecko tem peças no detalhado (curvas do .scl), e o
    estado do editor as marca (perda_modo 2: o painel avisa que k_on/k_off/uK não valem); as do BuckBoost, no simples (1).
Uso: python3 termica_gecko_api.py (precisa do GeckoCIRCUITS baixado em gecko/build). Reabre o exemplo do PWM no fim."""
import json, os, re, shutil, socket, subprocess, time, urllib.request
from pathlib import Path
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]


def config(chave, padrao):                               # do perfil de teste (config/teste.env)
    try:
        m = re.search(rf"^{chave}=(\S+)", (RAIZ / "config/teste.env").read_text(), re.M)
        return m.group(1).replace("~", str(Path.home()), 1) if m else padrao
    except OSError:
        return padrao


B = f"http://localhost:{config('MAISIM_PORTA_SIMU', '7201')}/maisim/simu/"
PORTA_GECKO = int(config("MAISIM_PORTA_GECKO", "7203"))
CIRC = Path(config("MAISIM_SALVOS", str(Path.home() / ".cache/maisim_teste/circuitos")))
ORIGEM = RAIZ / "gecko/build/GeckoCIRCUITS/resources/Topologies/BuckBoost_thermal.ipes"
DT, TFIM, CADA = 1e-7, 2e-3, 10


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=600).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


class Motor:
    """O motor do editor direto (uma linha por pedido, "OK …" ou "ERR …"): o Gecko sem o laço do MaiSim."""
    def __init__(self):
        with socket.socket() as s:                          # uma porta livre
            s.bind(("127.0.0.1", 0)); porta = s.getsockname()[1]
        cp = f"{RAIZ / 'gecko/build/gecko-lote.jar'}{os.pathsep}{RAIZ / 'simu/motor/bin'}"
        self.p = subprocess.Popen(["java", "-cp", cp, "maisim.MaiSimMotor", "--gecko-port", str(PORTA_GECKO), "--porta", str(porta)],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                self.s = socket.create_connection(("127.0.0.1", porta), timeout=120); break
            except OSError:
                time.sleep(0.5)
        self.f = self.s.makefile("rw", encoding="utf-8", newline="\n")

    def cmd(self, linha):
        self.f.write(linha + "\n"); self.f.flush()
        r = self.f.readline().rstrip("\n")
        assert r.startswith("OK"), f"{linha}: {r}"
        return r[3:]

    def fecha(self):
        try:
            self.cmd("QUIT")
        except Exception:
            pass
        self.p.terminate()


if not ORIGEM.is_file():
    print("OK    (sem o GeckoCIRCUITS em gecko/build: nada a conferir)")
    raise SystemExit(0)
arq, feitas, motor = CIRC / "termica_gecko_t.ipes", [], None
try:
    CIRC.mkdir(parents=True, exist_ok=True)
    shutil.copy(ORIGEM, arq)
    j = api("editor/abrir", {"arq": str(arq), "modo": "descartar"})
    assert "ERRO" not in j, j
    e = {x["nome"]: x for x in j["folhas"]["0"]["elementos"]}
    ok(not j["encaixe"]["soltas"], f"abre sem pontas soltas: {j['encaixe']}")
    ok(e["Pv.1"]["mede"][0] == "IGBT.1" and e["Pv.2"]["mede"][0] == "D.1" and e["FLOW.1"]["mede"][0] == "Pv.1"
       and e["FLOW.2"]["mede"][0] == "Pv.2" and e["TEMP.2"]["mede"] == ["Tj", "Tzero"],
       "os acoplamentos do arquivo: Pv → IGBT.1 e D.1, FLOW → Pv.1 e Pv.2, TEMP → Tj − Tzero")
    ok({x["perda_modo"] for x in e.values() if "perda_modo" in x} == {1}, "o BuckBoost: as peças no modo simples de perda (perda_modo 1)")
    npc = ORIGEM.parents[1] / "Newsletter/2011_10_NPC_optimization/NPCmodel.ipes"
    if npc.is_file():
        import sys; sys.path.insert(0, str(RAIZ / "simu")); import ipes
        modos = {x["nome"]: x["perda_modo"] for f in ipes.monta(npc)["folhas"].values() for x in f["elementos"] if "perda_modo" in x}
        ok(2 in modos.values() and 1 in modos.values(), f"o NPCmodel: peças no modo detalhado e no simples ({modos})")
    canais = j.get("canais", {})
    ok(all(canais.get(n) == c for n, c in (("FLOW.1", "PSw"), ("FLOW.2", "PD"), ("TEMP.2", "TjSw"))), f"os sinais da rodada: {canais}")

    # ------------------------------------------------ a rodada do MaiSim
    n = round(TFIM / DT)
    r = api("editor/rodar", {"dt": repr(DT), "tfim": repr(TFIM), "nome": "termica_gecko", "amostras": str(n // CADA)})
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.5); r = api("editor/rodada")
    feitas.append(r.get("arquivo"))
    ok(r.get("estado") == "fim", f"a rodada do MaiSim: {r.get('estado')} {r.get('erro') or ''}")
    a = r["arquivo"]
    z = np.load(a if os.path.isabs(a) else RAIZ / a)
    meta = json.loads(str(z["meta"]))
    ok(sorted(meta.get("media_intervalo", [])) == ["PD", "PSw"], f"as perdas são média do intervalo: {meta.get('media_intervalo')}")
    t = z["t"]; k = np.rint(t / DT).astype(int)
    ok(len(t) == n // CADA + 1 and np.all(np.diff(k)[:-1] == CADA) and 0 < np.diff(k)[-1] <= CADA,   # a última: o que sobrou até o fim
       f"uma amostra a cada {CADA} passos ({len(t)} amostras; a última com {np.diff(k)[-1]})")

    # ------------------------------------------------ o Gecko sozinho, passo a passo (o mesmo arquivo, o mesmo Δt)
    m = motor = Motor()
    m.cmd(f"OPEN {arq}")
    m.cmd(f"INIT {DT!r} {TFIM!r}")
    cru = np.empty((n + 1, 3))
    cru[0] = np.nan
    t0 = time.time()
    for q in range(1, n + 1):
        m.cmd("STEP 1")
        cru[q] = [float(x) for x in m.cmd("GETM FLOW.1 FLOW.2 TEMP.2").split()]
    print(f"      (o Gecko passo a passo: {n} passos em {time.time() - t0:.0f} s)")
    motor.fecha(); motor = None
    psw, pd, tj = cru[:, 0], cru[:, 1], cru[:, 2]
    escala = max(1.0, float(np.nanmax(np.abs(psw))))
    d_tj = float(np.max(np.abs(z["TjSw"][1:] - tj[k[1:]])))
    ok(d_tj <= 1e-9 * max(1.0, float(np.nanmax(np.abs(tj)))), f"a Tj do MaiSim = a do Gecko em cada amostra (diferença máxima {d_tj:.2e} K; Tj final {tj[-1]:.3f} °C)")
    med = lambda v, q: v[k[q - 1] + 1:k[q] + 1].mean()
    d_sw = max(abs(z["PSw"][q] - med(psw, q)) for q in range(1, len(k)))
    d_pd = max(abs(z["PD"][q] - med(pd, q)) for q in range(1, len(k)))
    ok(max(d_sw, d_pd) <= 1e-9 * escala, f"cada amostra das perdas = a média dos {CADA} passos do Gecko (PSw {d_sw:.2e} W, PD {d_pd:.2e} W)")
    e_mai, e_gk = float(z["PSw"][1:].sum() * CADA * DT), float(psw[1:].sum() * DT)
    ok(e_gk > 0 and abs(e_mai - e_gk) <= 1e-9 * e_gk, f"a energia do IGBT em 2 ms: MaiSim {e_mai * 1e3:.4f} mJ, Gecko {e_gk * 1e3:.4f} mJ")
    pontos = float(psw[k[1:]].mean())
    ok(abs(float(z["PSw"][1:].mean()) - float(psw[1:].mean())) <= 1e-9 * escala,
       f"⟨PSw⟩ = {z['PSw'][1:].mean():.3f} W nos dois (lendo só um ponto a cada {CADA} passos daria {pontos:.3f} W)")
finally:
    if motor:
        motor.fecha()
    for a in feitas:
        if a:
            p = Path(a) if os.path.isabs(a) else RAIZ / a
            shutil.rmtree(p.parent, ignore_errors=True)
    for f in CIRC.glob(arq.stem + ".*"):
        f.unlink()
    api("editor/abrir", {"arq": "exemplos/exemplo_controle_pwm.ipes", "modo": "descartar"})
print(f"\n{'OK' if not falhas else 'FALHA'}: {falhas} falha(s)")
raise SystemExit(1 if falhas else 0)
