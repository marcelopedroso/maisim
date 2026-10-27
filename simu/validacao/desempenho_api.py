"""O laço da rodada sem controle em Python em blocos de amostras (instância de teste 7201): o caminho novo (STEPS, patch
0008 do Gecko: muitas amostras numa chamada) contra o antigo (um STEP e um GETM por amostra), escolhidos por rodada
("laco": "novo" | "antigo" no editor/rodar; MAISIM_LACO dá o padrão).
1. Os números IDÊNTICOS (bit a bit): cada exemplo de exemplos/ (com o Δt e o tempo final dele) roda pelos dois caminhos,
   cada rodada logo depois de abrir o circuito (a mesma posição: a 1ª rodada depois de abrir tem um t = 0 próprio no
   motor CC), e todas as colunas do .npz, o meta e os avisos têm de ser iguais (np.array_equal com equal_nan).
2. Um sintético: o buck térmico (as perdas, FLOW, gravadas pela média do intervalo) com o CONST do ciclo de trabalho
   mudando no meio da rodada (acionamentos: no começo de uma amostra, no meio de outra e de volta) e a última amostra mais
   curta (o número de passos não é múltiplo do da amostra).
3. Pausar, continuar e parar no caminho novo: a pausa não muda nada; o parar grava o começo da rodada inteira.
4. A medida, intercalada (antigo, novo, antigo, novo, antigo, novo, para a carga da máquina pesar igual nos dois), com as
   medianas: o novo tem de ser pelo menos LIMITE vezes mais rápido no buck (≈ 8× medido; o limite é folgado para o ruído).
   `python3 desempenho_api.py --tabela` faz a tabela dos exemplos todos (3 de cada, intercaladas), sem conferir o limite."""
import gzip, json, re, statistics, sys, time, urllib.request
from pathlib import Path
import numpy as np
B = "http://localhost:7201/maisim/simu/"
RAIZ = Path(__file__).resolve().parents[2]
LIMITE = 3.0


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=600).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def simulacao(arq):                                     # o Δt e o tempo final gravados no .ipes
    txt = gzip.open(RAIZ / arq, "rt", errors="replace").read()
    return re.search(r"(?m)^dt (\S+)", txt).group(1), re.search(r"(?m)^tDURATION (\S+)", txt).group(1)


def espera(r, acao=None):
    while r.get("estado") in ("preparando", "rodando", "pausada"):
        if acao:
            acao(r)
        time.sleep(0.05); r = api("editor/rodada")
    return r


def roda(arq, laco, dt=None, tfim=None, amostras="10000", controle=None, acao=None):
    """Abre o circuito (descartando) e roda pelo laço pedido: (rodada no fim, .npz)."""
    j = api("editor/abrir", {"arq": arq, "modo": "descartar"})
    assert "ERRO" not in j, j
    if controle is not None:
        j = api("editor/controle", {"controle": controle})
        assert "ERRO" not in j, j
    d, t = simulacao(arq)
    r = api("editor/rodar", {"dt": dt or d, "tfim": tfim or t, "nome": "desempenho", "amostras": amostras, "laco": laco})
    assert "ERRO" not in r, r
    r = espera(r, acao)
    return r, (np.load(r["arquivo"]) if r.get("estado") in ("fim", "parada") else None)


def meta(z):
    m = json.loads(str(z["meta"]))
    return {k: v for k, v in m.items() if k not in ("segundos", "inicio")}


def iguais(za, zb):
    """As colunas que diferem (ou faltam num dos dois) e se o meta é o mesmo."""
    dif = sorted(k for k in set(za.files) | set(zb.files) if k != "meta" and
                 not (k in za.files and k in zb.files and np.array_equal(za[k], zb[k], equal_nan=True)))
    return dif, meta(za) == meta(zb)


exemplos = sorted(f"exemplos/{p.name}" for p in (RAIZ / "exemplos").glob("*.ipes"))

if "--tabela" in sys.argv:                              # a tabela de antes e depois: 3 rodadas intercaladas de cada exemplo
    print("| exemplo | antigo (s) | novo (s) | mediana antigo | mediana novo | ganho |")
    print("|---|---|---|---|---|---|")
    for arq in exemplos:
        t = {"antigo": [], "novo": []}
        for _ in range(3):
            for laco in ("antigo", "novo"):
                r, _ = roda(arq, laco)
                t[laco].append(r.get("segundos") or float("nan"))
        ma, mn = statistics.median(t["antigo"]), statistics.median(t["novo"])
        print(f"| {Path(arq).stem.replace('exemplo_', '')} | {' / '.join(f'{x:.2f}' for x in t['antigo'])} | "
              f"{' / '.join(f'{x:.2f}' for x in t['novo'])} | {ma:.2f} | {mn:.2f} | {ma / mn:.1f}× |", flush=True)
    sys.exit(0)

try:
    # 1. os exemplos: os dois caminhos dão os mesmos números
    ok(len(exemplos) >= 18, f"{len(exemplos)} exemplos em exemplos/")
    for arq in exemplos:
        ra, za = roda(arq, "antigo")
        rb, zb = roda(arq, "novo")
        if za is None or zb is None:
            ok(False, f"{arq}: as duas rodadas terminam ({ra.get('estado')} {ra.get('erro', '')} / {rb.get('estado')} {rb.get('erro', '')})")
            continue
        dif, meta_igual = iguais(za, zb)
        com_py = ra.get("laco") == "controle"
        ok(not dif and meta_igual and ra.get("avisos") == rb.get("avisos") and rb.get("laco") == ("controle" if com_py else "novo"),
           f"{Path(arq).stem}: {len(za.files) - 1} colunas × {len(za['t'])} amostras idênticas pelos dois caminhos"
           f"{' (controle em Python: o mesmo laço nos dois)' if com_py else ''}; antigo {ra.get('segundos')} s, novo {rb.get('segundos')} s"
           f"{'' if not dif else f' — DIFEREM: {dif[:6]}'}{'' if meta_igual else ' — o meta difere'}")

    # 2. o sintético: perdas (FLOW) + o CONST do ciclo de trabalho mudando no meio + a última amostra mais curta
    arq = "exemplos/exemplo_buck_termico.ipes"
    dt, tfim, amostras = "5e-07", "0.01231", "1001"      # 24 620 passos, 25 por amostra: 984 inteiras e uma de 20
    ac = [{"alvo": "CONST:d", "t": 1.25e-3, "valor": 0.3}, {"alvo": "CONST:d", "t": 2.0004e-3, "valor": 0.7},
          {"alvo": "CONST:d", "t": 6.1e-3, "valor": 0.5}, {"alvo": "CONST:d", "t": 0.0123, "valor": 0.4}]
    ctl = {"ativo": False, "Ts": 1e-4, "atuacoes": [], "parametros": [], "acionamentos": ac}
    ra, za = roda(arq, "antigo", dt, tfim, amostras, ctl)
    rb, zb = roda(arq, "novo", dt, tfim, amostras, ctl)
    ok(za is not None and zb is not None, f"o sintético roda pelos dois caminhos ({ra.get('estado')} {ra.get('erro', '')} / {rb.get('estado')} {rb.get('erro', '')})")
    if za is not None and zb is not None:
        dif, meta_igual = iguais(za, zb)
        m = meta(zb)
        d = zb["d"] if "d" in zb.files else None
        ok(len(m.get("media_intervalo") or []) > 0 and len(m.get("acionamentos") or []) == 4,
           f"o sintético tem perdas pela média do intervalo {m.get('media_intervalo')} e os 4 acionamentos do CONST no meta")
        ok(d is not None and len({round(float(x), 6) for x in d}) >= 4, f"o ciclo de trabalho muda no meio da rodada (valores de d: {sorted({round(float(x), 6) for x in d}) if d is not None else '—'})")
        # a última, mais curta (20 passos pedidos; o Gecko dá 19: a soma t += Δt passa de tEND no último e ele recusa — o
        # mesmo nos dois caminhos, com o aviso das perdas "parou no meio de um trecho")
        curta = float(zb["t"][-1] - zb["t"][-2]) / float(dt)
        ok(len(zb["t"]) == 986 and 18.5 < curta < 20.5, f"a última amostra mais curta: {len(zb['t'])} amostras (t = 0, 984 inteiras e a curta, de {curta:.0f} passos), t final {float(zb['t'][-1]):.6g} s")
        ok(not dif and meta_igual and ra.get("avisos") == rb.get("avisos"),
           f"o sintético: {len(zb.files) - 1} colunas idênticas pelos dois caminhos (as perdas, o CONST no meio, a amostra curta){'' if not dif else f' — DIFEREM: {dif[:6]}'}")

    # 3. pausar, continuar e parar no caminho novo (o buck, mais longo: 0,1 s com 20 000 amostras)
    arq, tfim, am = "exemplos/exemplo_buck.ipes", "0.1", "20000"
    estado = {"pausou": False, "t_pausa": None, "parado": False}
    def pausa(r):
        if not estado["pausou"] and r.get("estado") == "rodando" and (r.get("t") or 0) > 0:
            api("editor/pausar", {}); estado["pausou"] = True
            time.sleep(0.6); r1 = api("editor/rodada"); time.sleep(0.6); r2 = api("editor/rodada")
            estado["t_pausa"] = (r1.get("estado"), r1.get("t"), r2.get("t"))
            api("editor/continuar", {})
    rb, zb = roda(arq, "novo", tfim=tfim, amostras=am, acao=pausa)
    ra, za = roda(arq, "antigo", tfim=tfim, amostras=am)
    e, t1, t2 = estado["t_pausa"] or (None, None, None)
    ok(estado["pausou"] and e == "pausada" and t1 == t2 and t1 is not None and t1 < float(tfim),
       f"pausada no meio (t = {t1} s), parada de verdade (t igual depois de 0,6 s: {t2}) e continuada")
    if za is not None and zb is not None:
        dif, meta_igual = iguais(za, zb)
        ok(rb.get("estado") == "fim" and not dif and meta_igual, f"com a pausa, os mesmos números do caminho antigo ({len(zb['t'])} amostras){'' if not dif else f' — DIFEREM: {dif[:6]}'}")
    def para(r):
        if not estado["parado"] and r.get("estado") == "rodando" and (r.get("t") or 0) > 0.01:
            api("editor/parar", {}); estado["parado"] = True
    rp, zp = roda(arq, "novo", tfim=tfim, amostras=am, acao=para)
    if zp is not None and za is not None:
        k = len(zp["t"])
        prefixo = all(np.array_equal(zp[c], za[c][:k], equal_nan=True) for c in zp.files if c != "meta")
        ok(rp.get("estado") == "parada" and 1 < k < len(za["t"]) and prefixo,
           f"parada no meio ({k} de {len(za['t'])} amostras, t = {float(zp['t'][-1]):.4g} s): o começo da rodada inteira, número a número")
    else:
        ok(False, f"parar: {rp.get('estado')} {rp.get('erro', '')}")

    # 4. a medida intercalada no buck: o novo bem mais rápido (medianas de 3)
    arq = "exemplos/exemplo_buck.ipes"
    t = {"antigo": [], "novo": []}
    for _ in range(3):
        for laco in ("antigo", "novo"):
            r, _ = roda(arq, laco)
            t[laco].append(r.get("segundos") or float("nan"))
    ma, mn = statistics.median(t["antigo"]), statistics.median(t["novo"])
    ok(ma / mn >= LIMITE, f"o buck pelo caminho novo {ma / mn:.1f}× mais rápido (medianas: antigo {ma:.2f} s {t['antigo']}, novo {mn:.2f} s {t['novo']}; limite {LIMITE}×)")
finally:
    print(f"{'OK' if not falhas else 'FALHA'}: desempenho, {falhas} falha(s)")
