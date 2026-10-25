"""A térmica e as perdas simples pela tela (instância de teste, C1 do plano dos fundamentos numéricos, 25/10): o exemplo do
buck térmico (exemplos/exemplo_buck_termico.ipes, de exemplos_monta.py) abre com os terminais térmicos onde o Gecko os põe
(Rth/Cth/DT com dois, o Pv à direita, o TREF um acima) e sem pontas soltas; os acoplamentos pela rota da tela (editor/mede:
Pv → IGBT, FLOW → Pv com o losscomp, TEMP → dois rótulos térmicos) valem, e os errados são recusados; o losscomp sobrevive a
salvar e reabrir.
E os números, conferidos à mão a partir do scope (uma rodada de 10 ms com todas as amostras, Δt = 0,5 µs, a Cth trocada
para 0,2 mJ/K: τ = 5 K/W · 0,2 mJ/K = 1 ms):
- condução do IGBT: ⟨|i|·uF + i²·rON⟩ das amostras de i_T = a média do Pcond_IGBT1;
- chaveamento: a soma, em cada ligar e desligar que a corrente mostra, de k_on·|i_on|·|v_antes|/uK e k_off·|i_antes|·|v|/uK,
  dividida pelo tempo = a média do Psw_IGBT1; e o fsw·(k_on·i_on + k_off·i_off)·|V|/uK da conta de papel, perto;
- o diodo: o mesmo, com a tensão dele (−v_sw);
- Tj: a rede RC (C·dT/dt = P − (T − 25)/ΣRth) alimentada pelo Pv_IGBT1 medido dá o Tj_IGBT1 medido; o τ que melhor encaixa é
  Rth·Cth; em regime, Tj = 25 + ⟨P⟩·ΣRth; Tj_D1 = 25 + Pv_D1·4 (sem Cth)."""
import gzip, json, os, re, shutil, time, urllib.request
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
CIRC = Path(config("MAISIM_SALVOS", str(Path.home() / ".cache/maisim_teste/circuitos")))
EX = "exemplos/exemplo_buck_termico.ipes"


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def els(j, folha="0"):
    return {e["nome"]: e for e in j["folhas"][folha]["elementos"]}


def roda(dt, tfim, amostras, nome="termica_teste"):
    r = api("editor/rodar", {"dt": str(dt), "tfim": str(tfim), "nome": nome, "amostras": str(amostras)})
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.4); r = api("editor/rodada")
    a = r.get("arquivo", "")
    return r, (np.load(a if os.path.isabs(a) else RAIZ / a) if r.get("estado") == "fim" else None)


def eventos(i, v, k_on, k_off, uK, eps=1e-2):
    """A energia de chaveamento que o modo simples do Gecko conta (AbstractLossCalculatorSwitch), refeita das amostras:
    ligou (|i| passa de < eps a > eps): k_on·|i|·|v de antes|/uK; desligou: k_off·|i de antes|·|v|/uK. → (E, n_on, n_off, i_on, i_off)"""
    a, b = np.abs(i[:-1]), np.abs(i[1:])
    on, off = (a < eps) & (b > eps), (a > eps) & (b < eps)
    e_on = k_on * b[on] * np.abs(v[:-1][on]) / uK
    e_off = k_off * a[off] * np.abs(v[1:][off]) / uK
    return e_on.sum() + e_off.sum(), on.sum(), off.sum(), b[on].mean() if on.any() else 0, a[off].mean() if off.any() else 0


def rc(P, t, rth, cth, T0, t0=25.0):
    """A rede de um nó: C·dT/dt = P − (T − t0)/Rth, a partir de T0, no passo das amostras. O Gecko resolve a rede térmica com
    a perda do passo anterior (o Pv a calcula depois da rede, ThermPvChip.doCalculation): T[k] vem de P[k − 1]."""
    T = np.empty_like(P); T[0] = T0
    for k in range(1, len(P)):
        a = (t[k] - t[k - 1]) / (rth * cth)
        T[k] = (T[k - 1] + a * (rth * P[k - 1] + t0)) / (1 + a)
    return T


feitas, salvo = [], CIRC / "termica_api_t.ipes"
try:
    j = api("editor/abrir", {"arq": EX, "modo": "descartar"})
    e = els(j)
    term = {n: [(t["x"], t["y"], t["rotulo"]) for t in e[n]["terminais"]] for n in ("Pv.1", "Rth.1", "Cth.1", "DT.1", "TREF.1")}
    ok(term["Pv.1"] == [(6, 34, "")] or term["Pv.1"][0][:2] == (6, 34), f"o Pv: um terminal, à direita (x + 2): {term['Pv.1']}")
    ok([p[:2] for p in term["Rth.1"]] == [(8, 34), (12, 34)] and [p[:2] for p in term["Cth.1"]] == [(8, 36), (8, 40)]
       and [p[:2] for p in term["DT.1"]] == [(20, 36), (20, 40)], f"Rth (deitado), Cth e DT (em pé): dois terminais a ±2 ({term})")
    ok([p[:2] for p in term["TREF.1"]] == [(14, 42)], f"o TREF: um terminal, um acima ({term['TREF.1']})")
    ok(not j["encaixe"]["soltas"] and j["encaixe"]["em_terminal"] > 20,
       f"sem pontas soltas: as conexões térmicas caem nos terminais ({j['encaixe']})")
    ok(e["Pv.1"]["mede"][0] == "IGBT.1" and e["Pv.2"]["mede"][0] == "D.1" and e["FLOW.2"]["mede"][0] == "Pv.1"
       and [e[f"FLOW.{k}"].get("losscomp") for k in (1, 2, 3, 4)] == ["total", "conduction", "switching", "total"]
       and e["TEMP.1"]["mede"] == ["Tj", "ref"], "os acoplamentos do exemplo: Pv → IGBT/diodo, FLOW → Pv com o losscomp, TEMP → Tj e ref")
    # as rotas: o losscomp muda e volta; os errados recusados
    r = api("editor/mede", {"nome": "FLOW.2", "tipo": "F", "componente": "Pv.1", "losscomp": "switching"})
    ok("ERRO" not in r and els(r)["FLOW.2"].get("losscomp") == "switching", f"FLOW.2 → chaveamento ({r.get('erro')})")
    r1 = api("editor/mede", {"nome": "Pv.1", "tipo": "P", "componente": "R.1"})
    r2 = api("editor/mede", {"nome": "FLOW.1", "tipo": "F", "componente": "IGBT.1"})
    r3 = api("editor/mede", {"nome": "FLOW.1", "tipo": "F", "componente": "Pv.1", "losscomp": "tudo"})
    ok(all(x.get("ERRO") for x in (r1, r2, r3)), f"recusados: Pv num resistor, FLOW sem Pv, losscomp inválido ({r1.get('erro')} | {r2.get('erro')} | {r3.get('erro')})")
    r = api("editor/mede", {"nome": "Pv.1", "tipo": "P", "componente": "D.1"})
    r = api("editor/mede", {"nome": "Pv.1", "tipo": "P", "componente": "IGBT.1"}) if "ERRO" not in r else r
    ok("ERRO" not in r and els(r)["Pv.1"]["mede"][0] == "IGBT.1", "o Pv troca de peça e volta (o acoplamento do GATE, no domínio térmico)")
    r = api("editor/mede", {"nome": "TEMP.2", "tipo": "T", "no1": "Tjd", "no2": "Tamb"})
    ok("ERRO" not in r and els(r)["TEMP.2"]["mede"] == ["Tjd", "Tamb"], "TEMP.2 mede Tjd − Tamb")
    api("editor/mede", {"nome": "TEMP.2", "tipo": "T", "no1": "Tjd", "no2": "ref"})
    s = api("editor/salvar", {"nome": salvo.stem, "pasta": "circuitos", "sobrescrever": True})
    j2 = api("editor/abrir", {"arq": str(salvo), "modo": "descartar"})
    txt = gzip.open(salvo, "rt").read() if open(salvo, "rb").read(2) == b"\x1f\x8b" else salvo.read_text()
    ok("ERRO" not in s and els(j2)["FLOW.2"].get("losscomp") == "switching" and "losscomp switching" in txt and els(j2)["Pv.1"]["mede"][0] == "IGBT.1",
       "salvar e reabrir: o losscomp e o Pv no arquivo")
    api("editor/mede", {"nome": "FLOW.2", "tipo": "F", "componente": "Pv.1", "losscomp": "conduction"})

    # ------------------------------------------------ os números (10 ms, todas as amostras, τ = 1 ms)
    api("editor/cmd", {"op": "SETP", "args": ["Cth.1", "Cth", 2e-4]})
    dt, tfim = 0.5e-6, 0.01
    r, z = roda(dt, tfim, int(round(tfim / dt)))
    feitas.append(r.get("arquivo"))
    if z is None:
        ok(False, f"a rodada não terminou ({r.get('estado')}: {r.get('erro')})")
    else:
        t = z["t"]; m = t >= 0.005                         # o regime elétrico (o LC assenta em ~2 ms)
        iT, vT, iD, vD = z["i_T"], z["v_T"], z["i_D"], -z["v_sw"]
        cond = np.mean(np.abs(iT[m]) * 0.6 + iT[m] ** 2 * 0.01); med = float(z["Pcond_IGBT1"][m].mean())
        ok(abs(cond - med) <= 0.01 * cond, f"condução do IGBT: ⟨|i|·uF + i²·rON⟩ = {cond:.3f} W; o Pcond_IGBT1 = {med:.3f} W")
        idx = np.nonzero(m)[0]; sl = slice(idx[0] - 1, idx[-1] + 1)
        E, non, noff, ion, ioff = eventos(iT[sl], vT[sl], 3e-5, 1.5e-5, 400.0)
        T = t[idx[-1]] - t[idx[0]] + dt
        sw, med_sw = E / T, float(z["Psw_IGBT1"][m].sum() * dt / T)
        papel = 20e3 * (3e-5 * ion + 1.5e-5 * ioff) * 48 / 400
        ok(abs(sw - med_sw) <= 0.02 * sw and abs(papel - med_sw) <= 0.05 * papel and non >= 99 and noff >= 99,
           f"chaveamento do IGBT: {non} ligar + {noff} desligar em {T * 1e3:.1f} ms, Σ k·|i|·|v|/uK ÷ T = {sw:.3f} W; "
           f"fsw·(k_on·{ion:.2f} A + k_off·{ioff:.2f} A)·48/400 = {papel:.3f} W; o Psw_IGBT1 = {med_sw:.3f} W")
        tot = float(z["Pv_IGBT1"][m].sum() * dt / T)
        ok(abs(tot - (med + med_sw)) <= 0.01 * tot, f"total = condução + chaveamento: {tot:.3f} = {med:.3f} + {med_sw:.3f} W")
        Ed, *_ = eventos(iD[sl], vD[sl], 2e-5, 3e-5, 400.0)
        pd = np.mean(np.abs(iD[m]) * 0.6 + iD[m] ** 2 * 0.01) + Ed / T; med_d = float(z["Pv_D1"][m].sum() * dt / T)
        ok(abs(pd - med_d) <= 0.02 * pd, f"o diodo: condução + chaveamento à mão = {pd:.3f} W; o Pv_D1 = {med_d:.3f} W")
        tj, P, tt = z["Tj_IGBT1"][1:], z["Pv_IGBT1"][1:], t[1:]       # a 1ª amostra é a do t = 0 repetida
        modelo = rc(P, tt, 5.0, 2e-4, tj[0])
        erro = float(np.max(np.abs(modelo - tj)))
        ok(erro <= 0.01 * (tj.max() - tj[0]), f"Tj_IGBT1 = a rede RC (Rth 5 K/W, Cth 0,2 mJ/K, de {tj[0]:.1f} °C) com o Pv_IGBT1 medido: erro máximo {erro:.3f} K")
        taus = np.linspace(0.5e-3, 1.5e-3, 41)
        melhor = taus[int(np.argmin([np.mean((rc(P, tt, 5.0, tau / 5.0, tj[0]) - tj) ** 2) for tau in taus]))]
        ok(abs(melhor - 1e-3) <= 0.03e-3, f"o τ que melhor encaixa: {melhor * 1e3:.3f} ms (Rth·Cth = 5 K/W · 0,2 mJ/K = 1 ms)")
        fim = tt >= tfim - 1e-3
        regime = 25 + float(P[fim].mean()) * 5.0
        ok(abs(float(tj[fim].mean()) - regime) <= 0.02 * (regime - 25),
           f"Tj em regime = 25 + ⟨P⟩·ΣRth: medido {tj[fim].mean():.2f} °C, conta {regime:.2f} °C (⟨P⟩ = {P[fim].mean():.3f} W)")
        dif = float(np.max(np.abs(25 + z["Pv_D1"][1:-1] * 4.0 - z["Tj_D1"][2:])))     # sem Cth: a perda do passo anterior
        sobe = float(z["Tj_D1"][m].mean()) - 25
        ok(dif <= 0.01 * sobe, f"Tj_D1 = 25 + Pv_D1·4 K/W em cada amostra (sem Cth; a perda do passo anterior): diferença máxima {dif:.3f} K (sobe {sobe:.1f} K)")
finally:
    for a in feitas:
        if a:
            p = Path(a) if os.path.isabs(a) else RAIZ / a
            shutil.rmtree(p.parent, ignore_errors=True)
    for f in CIRC.glob(salvo.stem + ".*"):
        f.unlink()
    api("editor/abrir", {"arq": str(CIRC / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
