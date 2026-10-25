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
  Rth·Cth; em regime, Tj = 25 + ⟨P⟩·ΣRth; Tj_D1: a rede RC do diodo (Rth 4 K/W, Cth 1 mJ/K, τ = 4 ms) com o Pv_D1 medido,
  e sem picos (sem a Cth, a Tj do diodo seguia cada pulso de perda: ~350 °C).
E a amostragem das perdas (o FLOW: média do intervalo, não o ponto; 25/10): com uma amostra a cada 50 passos (sem controle)
e a cada 100 (com um controle que não atua, Ts = 5Δt), cada amostra do Pv/Pcond/Psw é a média dos passos do intervalo da
rodada com todas (o Psw de antes, em ponto, dava média 0); o ⟨Psw⟩ do regime é o da soma passo a passo (±5%); Pv = Pcond
+ Psw; o Tj, o PWM (g) e as tensões seguem em ponto, iguais aos da rodada com todas; a meta diz quais são média."""
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
    term = {n: [(t["x"], t["y"], t["rotulo"]) for t in e[n]["terminais"]] for n in ("Pv.1", "Rth.1", "Cth.1", "Cth.2", "DT.1", "TREF.1")}
    ok(term["Pv.1"] == [(6, 34, "")] or term["Pv.1"][0][:2] == (6, 34), f"o Pv: um terminal, à direita (x + 2): {term['Pv.1']}")
    ok([p[:2] for p in term["Rth.1"]] == [(8, 34), (12, 34)] and [p[:2] for p in term["Cth.1"]] == [(8, 36), (8, 40)]
       and [p[:2] for p in term["DT.1"]] == [(20, 36), (20, 40)] and [p[:2] for p in term["Cth.2"]] == [(8, 50), (8, 54)],
       f"Rth (deitado), Cth (a do IGBT e a do diodo) e DT (em pé): dois terminais a ±2 ({term})")
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
        # o diodo: um nó só (Pv.2 → Tjd, Cth.2 à referência, Rth.3 ao ambiente): a mesma conta, com Rth 4 K/W e Cth 1 mJ/K
        tjd, Pd = z["Tj_D1"][1:], z["Pv_D1"][1:]
        sobe = float(tjd[fim].mean()) - 25
        erro_d = float(np.max(np.abs(rc(Pd, tt, 4.0, 1e-3, tjd[0]) - tjd)))
        ok(erro_d <= 0.01 * sobe, f"Tj_D1 = a rede RC do diodo (Rth 4 K/W, Cth 1 mJ/K, τ = 4 ms) com o Pv_D1 medido: erro máximo {erro_d:.3f} K (sobe {sobe:.1f} K)")
        passo, pico, final = float(np.max(np.abs(np.diff(tjd)))), float(tjd.max()), 25 + float(Pd[m[1:]].mean()) * 4.0
        ok(passo <= 0.1 and pico <= final + 1.0,
           f"Tj_D1 sem picos: o maior salto entre amostras {passo:.3f} K, o máximo {pico:.1f} °C (o regime, 25 + ⟨Pv_D1⟩·4 = {final:.1f} °C)")
        # ------------------------------------------------ as perdas pela média do intervalo (com e sem o controle)
        FLOW = ["Pv_IGBT1", "Pcond_IGBT1", "Psw_IGBT1", "Pv_D1"]
        ref_sw = float(z["Psw_IGBT1"][m].mean())                # a soma passo a passo ÷ passos (a rodada com todas)
        for rotulo, cada, ctl in (("sem controle", 50, None), ("com controle (Ts = 5Δt)", 100, 5 * dt)):
            if ctl:
                rc_ = api("editor/controle", {"controle": {"ativo": True, "Ts": ctl, "atuacoes": [], "parametros": [], "acionamentos": [],
                          "atraso": {"modo": "logo", "tempo": 0}, "codigo": "def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {}\n"}})
                ok("ERRO" not in rc_, f"o controle que não atua ({rc_.get('erro')})")
            r2, z2 = roda(dt, tfim, int(round(tfim / dt)) // cada, nome="termica_media")
            feitas.append(r2.get("arquivo"))
            if z2 is None:
                ok(False, f"{rotulo}: a rodada não terminou ({r2.get('estado')}: {r2.get('erro')})"); continue
            meta = json.loads(str(z2["meta"]))
            ok(sorted(meta.get("media_intervalo", [])) == sorted(FLOW), f"{rotulo}: a meta diz os de média: {meta.get('media_intervalo')}")
            t2 = z2["t"]; k = np.rint(t2 / dt).astype(int)       # o passo de cada amostra na rodada com todas
            ok(len(t2) == len(t) // cada + 1 and np.all(np.diff(k)[:-1] == cada), f"{rotulo}: uma amostra a cada {cada} passos ({len(t2)})")
            difs = {c: float(np.max(np.abs([z2[c][q] - z[c][k[q - 1] + 1:k[q] + 1].mean() for q in range(1, len(k))]))) for c in FLOW}
            ok(max(difs.values()) <= 1e-9 * max(1.0, float(np.max(np.abs(z["Pv_IGBT1"])))),
               f"{rotulo}: cada amostra das perdas = a média dos {cada} passos do intervalo (diferença máxima {max(difs.values()):.2e})")
            m2 = t2 >= 0.005
            sw2 = float(z2["Psw_IGBT1"][m2].mean())
            ponto = float(z["Psw_IGBT1"][k][m2].mean())
            ok(abs(sw2 - ref_sw) <= 0.05 * ref_sw and np.count_nonzero(z2["Psw_IGBT1"][m2]) > 0.5 * m2.sum(),
               f"{rotulo}: ⟨Psw_IGBT1⟩ do regime = {sw2:.3f} W; a soma passo a passo = {ref_sw:.3f} W (em ponto seria {ponto:.3f} W)")
            ok(np.allclose(z2["Pv_IGBT1"], z2["Pcond_IGBT1"] + z2["Psw_IGBT1"], atol=1e-9), f"{rotulo}: Pv_IGBT1 = Pcond_IGBT1 + Psw_IGBT1 em cada amostra")
            ok(all(np.array_equal(z2[c], z[c][k]) for c in ("Tj_IGBT1", "Tj_D1", "g", "v_sw", "i_T")),
               f"{rotulo}: Tj, o PWM (g), v_sw e i_T seguem em ponto, iguais aos da rodada com todas")
        api("editor/controle", {"controle": {"ativo": False, "Ts": 5 * dt, "atuacoes": [], "parametros": [], "acionamentos": [],
            "atraso": {"modo": "logo", "tempo": 0}, "codigo": "def iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {}\n"}})
finally:
    for a in feitas:
        if a:
            p = Path(a) if os.path.isabs(a) else RAIZ / a
            shutil.rmtree(p.parent, ignore_errors=True)
    for f in CIRC.glob(salvo.stem + ".*"):
        f.unlink()
    api("editor/abrir", {"arq": str(CIRC / "exemplo_controle_pwm.ipes"), "modo": "descartar"})
raise SystemExit(1 if falhas else 0)
