"""Os laços rápidos da rodada (instância de teste 7201): sem controle em Python, em blocos de amostras (STEPS, patch 0008
do Gecko: muitas amostras numa chamada); com controle em Python, um Ts numa chamada (PREP/STEPC, patch 0010: as escritas
nos CONST nos passos certos, os trechos e a leitura de uma vez) — contra o antigo (um STEP, SETM e GETM por vez),
escolhidos por rodada ("laco": "novo" | "antigo" no editor/rodar; MAISIM_LACO dá o padrão).
1. Os números IDÊNTICOS (bit a bit): cada exemplo de exemplos/ (com o Δt e o tempo final dele) roda pelos dois caminhos,
   cada rodada logo depois de abrir o circuito (a mesma posição: a 1ª rodada depois de abrir tem um t = 0 próprio no
   motor CC), e todas as colunas do .npz, o meta e os avisos têm de ser iguais (np.array_equal com equal_nan).
2. Um sintético: o buck térmico (as perdas, FLOW, gravadas pela média do intervalo) com o CONST do ciclo de trabalho
   mudando no meio da rodada (acionamentos: no começo de uma amostra, no meio de outra e de volta) e a última amostra mais
   curta (o número de passos não é múltiplo do da amostra).
3. Pausar, continuar e parar no caminho novo: a pausa não muda nada; o parar grava o começo da rodada inteira.
4. A medida, intercalada (antigo, novo, antigo, novo, antigo, novo, para a carga da máquina pesar igual nos dois), com as
   medianas: o novo tem de ser pelo menos LIMITE vezes mais rápido no buck. O ganho depende da máquina: a ida e volta entre
   os processos é cara no WSL (≈ 8× medido) e barata no servidor do CI (1,9×: o antigo já leva ~1,5 s ali); o limite pega a
   regressão de verdade — o caminho novo deixar de ganhar — sem falhar por máquina.
5. Com controle em Python: os exemplos com Python (no item 1, também o controle.log igual e o STEPC valendo) e um
   sintético — o buck térmico com dois controladores que trocam mensagens, um CONST a mais, o padrão por Δt, os três modos
   de atraso (logo, amostra, tempo), acionamentos de CONST (no mesmo CONST da atuação: o acionamento prevalece) e de p[...],
   as perdas (FLOW) no m[...], e uma pausa no meio — idênticos pelos dois caminhos, inclusive o controle.log; e a medida
   intercalada no motor CC (o limite LIMITE_PY, folgado: no CI a ida e volta já é barata). Os processos dos controladores
   conversam pela conexão do multiprocessing no laço novo (sem as threads leitoras; fora do Windows, por enquanto) e pelo
   stdin/stdout no antigo: 13 controladores num anel de mensagens e um que trava ou morre (o mesmo erro) também batem.
   `python3 desempenho_api.py --tabela [exemplo…]` faz a tabela (3 de cada, intercaladas), sem conferir os limites;
   `--rodada PASTA [--tfim T] [--tabela]`: o circuito e o controle de uma rodada gravada (o .ipes, controle.json e os .py
   dela; a cópia vai para os circuitos de teste), comparado pelos dois caminhos (ou medido, com --tabela)."""
import gzip, json, re, statistics, sys, time, urllib.request
from pathlib import Path
import numpy as np
B = "http://localhost:7201/maisim/simu/"
RAIZ = Path(__file__).resolve().parents[2]
LIMITE = 1.5
LIMITE_PY = 1.3
T = Path.home() / ".cache/maisim_teste"


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


def roda(arq, laco, dt=None, tfim=None, amostras="10000", controle=None, acao=None, prep=None):
    """Abre o circuito (descartando) e roda pelo laço pedido: (rodada no fim, .npz)."""
    j = api("editor/abrir", {"arq": arq, "modo": "descartar"})
    assert "ERRO" not in j, j
    for op, args in prep or []:                         # mudanças no circuito antes de rodar (editor/cmd)
        j = api("editor/cmd", {"op": op, "args": args})
        assert "ERRO" not in j, (op, args, j)
    if controle is not None:
        j = api("editor/controle", {"controle": controle})
        assert "ERRO" not in j, j
    d, t = simulacao(arq) if not Path(arq).is_absolute() else (None, None)
    r = api("editor/rodar", {"dt": dt or d, "tfim": tfim or t, "nome": "desempenho", "amostras": amostras, "laco": laco})
    assert "ERRO" not in r, r
    r = espera(r, acao)
    return r, (np.load(r["arquivo"]) if r.get("estado") in ("fim", "parada") else None)


def meta(z):
    m = json.loads(str(z["meta"]))
    return {k: v for k, v in m.items() if k not in ("segundos", "inicio")}


def log_de(r):
    """O controle.log da rodada (vazio sem controle), linha a linha em ordem: com vários controladores, cada processo escreve
    no mesmo arquivo quando calcula, e a ordem entre as linhas de processos diferentes muda de uma rodada para outra (nos
    dois caminhos); o conteúdo, não."""
    f = Path(r.get("arquivo") or "").parent / "controle.log"
    return "".join(sorted(f.read_text().splitlines(keepends=True))) if f.is_file() else ""


def iguais(za, zb):
    """As colunas que diferem (ou faltam num dos dois) e se o meta é o mesmo."""
    dif = sorted(k for k in set(za.files) | set(zb.files) if k != "meta" and
                 not (k in za.files and k in zb.files and np.array_equal(za[k], zb[k], equal_nan=True)))
    return dif, meta(za) == meta(zb)


exemplos = sorted(f"exemplos/{p.name}" for p in (RAIZ / "exemplos").glob("*.ipes"))

def rodada_gravada(pasta):
    """O circuito e o controle de uma rodada gravada, copiados para os circuitos de teste: (arq, controle)."""
    pasta = Path(pasta)
    ipes = next(pasta.glob("*.ipes"))
    (T / "circuitos").mkdir(parents=True, exist_ok=True)
    arq = T / "circuitos" / ipes.name
    arq.write_bytes(ipes.read_bytes())
    ctl = json.loads((pasta / "controle.json").read_text())
    ctl["codigo"] = (pasta / "controle.py").read_text()
    return str(arq), ctl


def argumento(nome, padrao=None):
    return sys.argv[sys.argv.index(nome) + 1] if nome in sys.argv else padrao


if "--rodada" in sys.argv and "--tabela" not in sys.argv:   # a comparação numa rodada gravada (o MMC do Marcelo, por exemplo)
    arq, ctl = rodada_gravada(argumento("--rodada"))
    tf = argumento("--tfim", "0.01")
    am = str(int(float(tf) / 6e-5) + 1)
    ra, za = roda(arq, "antigo", "1e-06", tf, am, ctl)
    rb, zb = roda(arq, "novo", "1e-06", tf, am, ctl)
    dif, meta_igual = iguais(za, zb)
    ok(not dif and meta_igual and ra.get("avisos") == rb.get("avisos") and log_de(ra) == log_de(rb) and rb.get("stepc") and not ra.get("stepc"),
       f"{Path(arq).stem} ({tf} s): {len(za.files) - 1} colunas × {len(za['t'])} amostras, o meta, os avisos e o controle.log idênticos "
       f"pelos dois caminhos; antigo {ra.get('segundos')} s, novo {rb.get('segundos')} s{'' if not dif else f' — DIFEREM: {dif[:6]}'}")
    sys.exit(1 if falhas else 0)

if "--tabela" in sys.argv:                              # a tabela de antes e depois: 3 rodadas intercaladas de cada exemplo
    print("| exemplo | antigo (s) | novo (s) | mediana antigo | mediana novo | ganho |")
    print("|---|---|---|---|---|---|")
    nomes = [x for x in sys.argv[sys.argv.index("--tabela") + 1:] if not x.startswith("--")]
    casos = [(a, {}) for a in exemplos if not nomes or Path(a).stem.replace("exemplo_", "") in nomes]
    if "--rodada" in sys.argv:
        arq_, ctl_ = rodada_gravada(argumento("--rodada"))
        tf_ = argumento("--tfim", "0.05")
        casos.append((arq_, dict(dt="1e-06", tfim=tf_, amostras=str(int(float(tf_) / 6e-5) + 1), controle=ctl_)))
    for arq, kw in casos:
        t = {"antigo": [], "novo": []}
        for _ in range(3):
            for laco in ("antigo", "novo"):
                r, _ = roda(arq, laco, **kw)
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
        com_py = bool(ra.get("controle_py"))
        mesmo_log = log_de(ra) == log_de(rb)
        ok(not dif and meta_igual and ra.get("avisos") == rb.get("avisos") and mesmo_log and rb.get("laco") == "novo" and
           (not com_py or (rb.get("stepc") is True and ra.get("stepc") is False)),
           f"{Path(arq).stem}: {len(za.files) - 1} colunas × {len(za['t'])} amostras idênticas pelos dois caminhos"
           f"{' (controle em Python: STEPC × STEP/SETM/GETM, e o controle.log igual)' if com_py else ''}; antigo {ra.get('segundos')} s, novo {rb.get('segundos')} s"
           f"{'' if not dif else f' — DIFEREM: {dif[:6]}'}{'' if meta_igual else ' — o meta difere'}{'' if mesmo_log else ' — o controle.log difere'}")

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

    # 5. o sintético com controle em Python: dois controladores (mensagens), um CONST a mais (aux), o padrão por Δt, as
    # perdas no m[...], acionamentos de CONST (no d, que o controle também escreve: o acionamento prevalece) e de p[...],
    # os três modos de atraso; no logo, uma pausa no meio da rodada nova
    arq, dt, tfim = "exemplos/exemplo_buck_termico.ipes", "5e-07", "0.004"
    prep = [("CREATE", ["CONST.9", 2, 2, "CONST"]), ("OUTNODE", ["CONST.9", 0, "aux"])]
    CTL = """def iniciar(p, e):
    e["n"] = 0
    e["x"] = 0.0


def passo(t, m, p, e):
    e["n"] += 1
    for msg in recebe():
        e["x"] = msg["dados"]["x"]
    scope("pv_visto", m["Pv_IGBT1"]); scope("tj_visto", m["Tj_IGBT1"]); scope("kx", p["Kx"]); scope("x_aux", e["x"])
    print("passo", e["n"], repr(t), repr(m["Pv_IGBT1"]))
    envia("aux", {"y": m["v_o"]})
    base = 0.3 + 0.4 * ((e["n"] // 7) % 2)
    if e["n"] % 3 == 0:                      # o padrão por Δt: 10 valores (Ts = 10 Δt), mudando no meio
        return {"d": [base if i < 4 else base + 0.1 for i in range(10)]}
    return {"d": base * p["Kx"]}
"""
    AUX = """def passo(t, m, p, e):
    y = None
    for msg in recebe():
        y = msg["dados"]["y"]
    envia("controle", {"x": 0.0 if y is None else y})
    return {"aux": 0.0 if y is None else round(y, 4)}
"""
    def sintetico(atraso):
        return {"ativo": True, "Ts": 5e-6, "atuacoes": ["d", "aux"], "codigo": CTL, "arquivos": {"aux.py": AUX},
                "parametros": [{"nome": "Kx", "valor": 1.0, "unidade": ""}], "atraso": atraso, "rede": {"latencia": 0.0},
                "controladores": [{"nome": "controle", "arquivo": "controle.py", "medidas": ["v_o", "Tj_IGBT1", "Pv_IGBT1"], "atuacoes": ["d"], "subcircuitos": []},
                                  {"nome": "aux", "arquivo": "aux.py", "medidas": [], "atuacoes": ["aux"], "subcircuitos": []}],
                "acionamentos": [{"alvo": "CONST:d", "t": 1.0e-3, "valor": 0.9}, {"alvo": "CONST:aux", "t": 2.0e-3, "valor": 5.0},
                                 {"alvo": "p:Kx", "t": 1.5e-3, "valor": 0.5}]}
    pausa_ = {"feita": False}
    def pausa_no_meio(r):
        if not pausa_["feita"] and r.get("estado") == "rodando" and (r.get("t") or 0) > 1e-3:
            api("editor/pausar", {}); pausa_["feita"] = True
            time.sleep(0.5); api("editor/continuar", {})
    for atraso in ({"modo": "logo", "tempo": 0.0}, {"modo": "amostra", "tempo": 0.0}, {"modo": "tempo", "tempo": 2e-6}):
        ra, za = roda(arq, "antigo", dt, tfim, "100000", sintetico(atraso), prep=prep)
        rb, zb = roda(arq, "novo", dt, tfim, "100000", sintetico(atraso), prep=prep, acao=pausa_no_meio if atraso["modo"] == "logo" else None)
        if za is None or zb is None:
            ok(False, f"sintético com controle ({atraso['modo']}): {ra.get('estado')} {ra.get('erro', '')} / {rb.get('estado')} {rb.get('erro', '')}")
            continue
        dif, meta_igual = iguais(za, zb)
        la, lb = log_de(ra), log_de(rb)
        cobre = (len({round(float(x), 6) for x in zb["d"]}) >= 4 and float(np.nanmax(zb["pv_visto"])) > 0 and
                 float(np.nanmax(zb["x_aux"])) > 0 and 0.5 in set(np.round(zb["kx"][~np.isnan(zb["kx"])], 6)) and la.count("passo") > 100)
        ok(not dif and meta_igual and ra.get("avisos") == rb.get("avisos") and la == lb and cobre and rb.get("stepc") and not ra.get("stepc")
           and (atraso["modo"] != "logo" or pausa_["feita"]),
           f"sintético com controle, atraso {atraso['modo']}: {len(zb.files) - 1} colunas × {len(zb['t'])} amostras, o meta, os avisos e o "
           f"controle.log ({la.count(chr(10))} linhas) idênticos pelos dois caminhos{' (com uma pausa no meio do novo)' if atraso['modo'] == 'logo' else ''}"
           f"{'' if cobre else ' — o sintético não exercitou tudo'}{'' if not dif else f' — DIFEREM: {dif[:6]}'}{'' if la == lb else ' — o controle.log difere'}")

    # 5b. muitos controladores trocando mensagens (um anel de 12 e o central somando), os processos pela conexão do
    # multiprocessing no laço novo (sem as threads leitoras) e pelo stdin/stdout no antigo: o mesmo, inclusive o controle.log
    N = 12
    NO = (f"N = {N}\n\n\n" + "def passo(t, m, p, e):\n"
          "    v = 0.0\n"
          "    for msg in recebe():\n"
          "        v += msg['dados']['v']\n"
          "    eu = int(p['id'][3:])\n"
          "    print('no', eu, repr(v))\n"
          "    envia(['no_%d' % ((eu + 1) % N), 'controle'], {'v': v * 0.5 + eu + t * 1e3})\n"
          "    scope('v', v)\n")
    CENTRAL = ("def passo(t, m, p, e):\n"
               "    soma = sum(msg['dados']['v'] for msg in recebe())\n"
               "    scope('soma', soma)\n"
               "    print('soma', repr(soma))\n"
               "    return {'d': 0.3 + 0.4 * ((int(soma) // 50) % 2)}\n")
    muitos = {"ativo": True, "Ts": 5e-6, "atuacoes": ["d"], "codigo": CENTRAL, "parametros": [], "atraso": {"modo": "logo", "tempo": 0.0},
              "rede": {"latencia": 0.0}, "acionamentos": [], "arquivos": {"no.py": NO},
              "controladores": [{"nome": "controle", "arquivo": "controle.py", "medidas": [], "atuacoes": ["d"], "subcircuitos": []}] +
                               [{"nome": f"no_{i}", "arquivo": "no.py", "medidas": [], "atuacoes": [], "subcircuitos": [], "p": {}} for i in range(N)]}
    ra, za = roda(arq, "antigo", dt, "0.002", "100000", muitos)
    rb, zb = roda(arq, "novo", dt, "0.002", "100000", muitos)
    if za is None or zb is None:
        ok(False, f"muitos controladores: {ra.get('estado')} {ra.get('erro', '')} / {rb.get('estado')} {rb.get('erro', '')}")
    else:
        dif, meta_igual = iguais(za, zb)
        la, lb = log_de(ra), log_de(rb)
        ok(not dif and meta_igual and ra.get("avisos") == rb.get("avisos") and la == lb and la.count("no ") > 1000 and float(np.nanmax(zb["soma"])) > 0,
           f"{N + 1} controladores trocando mensagens: {len(zb.files) - 1} colunas, o meta, os avisos e o controle.log ({la.count(chr(10))} linhas) "
           f"idênticos pelos dois caminhos{'' if not dif else f' — DIFEREM: {dif[:6]}'}{'' if la == lb else ' — o controle.log difere'}")

    # 5c. um controlador que trava (laço infinito) e um que morre: a rodada para com o mesmo erro pelos dois caminhos
    for caso, cod in (("trava", "    if e['n'] == 40:\n        while True:\n            pass\n"),
                      ("morre", "    if e['n'] == 40:\n        raise SystemExit(3)\n")):
        ruim = CTL.replace('    e["n"] += 1\n', '    e["n"] += 1\n' + cod)
        cfg = dict(sintetico({"modo": "logo", "tempo": 0.0}), codigo=ruim, acionamentos=[])
        ra, _ = roda(arq, "antigo", dt, tfim, "100000", cfg, prep=prep)
        rb, _ = roda(arq, "novo", dt, tfim, "100000", cfg, prep=prep)
        ok(ruim != CTL and ra.get("estado") == rb.get("estado") == "erro" and ra.get("erro") == rb.get("erro") and ra.get("t") == rb.get("t")
           and log_de(ra) == log_de(rb),
           f"o controlador que {caso}: a rodada para em t = {rb.get('t')} com o mesmo erro pelos dois caminhos ({rb.get('erro')!r})")

    # 6. a medida intercalada no motor CC (controle em Python): o Ts numa chamada mais rápido (medianas de 3)
    arq = "exemplos/exemplo_motor_cc.ipes"
    t = {"antigo": [], "novo": []}
    for _ in range(3):
        for laco in ("antigo", "novo"):
            r, _ = roda(arq, laco, tfim="0.15")
            t[laco].append(r.get("segundos") or float("nan"))
    ma, mn = statistics.median(t["antigo"]), statistics.median(t["novo"])
    ok(ma / mn >= LIMITE_PY, f"o motor CC (controle em Python) pelo caminho novo {ma / mn:.1f}× mais rápido (medianas: antigo {ma:.2f} s {t['antigo']}, novo {mn:.2f} s {t['novo']}; limite {LIMITE_PY}×)")
finally:
    print(f"{'OK' if not falhas else 'FALHA'}: desempenho, {falhas} falha(s)")
