"""Para onde vai cada sinal (instância de teste 7201), pedido de Marcelo em 24/10: duas caixinhas no painel do componente,
"→ Scope" (vira coluna gravada na rodada) e "→ Controle" (fica no m[...] do código), no lugar da "no scope e no controle".
No PWM do exemplo: o CONST.1 (g, a atuação) só no controle e o voltímetro v_o só no scope pela rota editor/destino; o
estado diz os dois; as medidas do controle (o painel e o testar) não têm o v_o e têm o g; numa rodada curta, o código
recebe o g e não o v_o (um print no passo), o .npz grava o v_o e não o g (nem no meta), e scope("g", m["g"]) no código o
grava com o nome dele; a rota de antes, editor/fora, tira dos dois e devolve aos dois; um pedido inválido é recusado.
Da revisão: o código que lê uma medida só do scope (o i_L) — o painel diz qual caixinha marcar e a rodada nem começa; com o
controle desligado, a rodada grava só os do scope e, sem nenhum, recusa (rodada.sem_scope); salvar e reabrir leva as duas
listas; um .aparencia.json de antes (só "fora") abre com o sinal fora dos dois; o "não salvo" conta a troca (também num
circuito sem arquivo). No fim, o controle e o circuito voltam como estavam."""
import json, re, time, urllib.request
from pathlib import Path
import numpy as np


def porta():                                             # a do simu no perfil de teste (config/teste.env)
    try:
        m = re.search(r"^MAISIM_PORTA_SIMU=(\d+)", (Path(__file__).resolve().parents[2] / "config/teste.env").read_text(), re.M)
        return int(m.group(1)) if m else 7201
    except OSError:
        return 7201


B = f"http://localhost:{porta()}/maisim/simu/"
CIRC = Path.home() / ".cache/maisim_teste/circuitos"
PWM = str(CIRC / "exemplo_controle_pwm.ipes")
SALVO = CIRC / "destino_api_t.ipes"                     # a cópia salva pelo teste (sai no fim)


def api(rota, corpo=None):
    req = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def roda(nome, tfim="0.001"):
    j = api("editor/rodar", {"dt": "1e-6", "tfim": tfim, "nome": nome, "amostras": "100"})
    while j.get("estado") in ("preparando", "rodando", "pausada"):
        time.sleep(0.3); j = api("editor/rodada")
    return j


def npz(j):
    d = np.load(j["arquivo"], allow_pickle=False)
    return set(d.files), json.loads(str(d["meta"]))


ctl0 = None
try:
    r = api("editor/abrir", {"arq": PWM, "modo": "descartar"})
    ok(not r.get("ERRO") and r.get("fora_scope") == [] and r.get("fora_controle") == [] and r.get("fora") == [],
       f"o PWM aberto: tudo no scope e no controle (fora_scope, fora_controle e fora vazios) {r.get('erro', '')}")
    uid = {e["nome"]: e["uid"] for e in r["folhas"]["0"]["elementos"]}
    ctl0 = api("editor/controle")["controle"]
    # o CONST.1 (g) só no controle, o VOLT.2 (v_o) só no scope
    r1 = api("editor/destino", {"uid": uid["CONST.1"], "scope": False, "controle": True})
    r2 = api("editor/destino", {"uid": uid["VOLT.2"], "scope": True, "controle": False})
    ok(not r1.get("ERRO") and not r2.get("ERRO") and r2.get("fora_scope") == [uid["CONST.1"]] and r2.get("fora_controle") == [uid["VOLT.2"]] and r2.get("fora") == [],
       f"editor/destino: g fora do scope, v_o fora do controle; nenhum fora dos dois ({r2.get('erro') or r1.get('erro') or ''})")
    p = api("editor/controle")
    ok("g" in p["entradas"] and "v_o" not in p["entradas"] and "i_L" in p["entradas"], f"as medidas do controle: o g sim, o v_o não ({', '.join(p['entradas'])})")
    # o código: um print das medidas na 1ª amostra e o g mandado ao scope pelo código
    cod = ctl0["codigo"].replace("def passo(t, m, p, e):", "def passo(t, m, p, e):\n    if t == 0:\n        print('MEDIDAS', sorted(m))\n    scope(\"g\", m[\"g\"])", 1)
    ok(cod != ctl0["codigo"], "o código do exemplo tem o passo(t, m, p, e) (para pôr o print)")
    api("editor/controle", {"controle": dict(ctl0, codigo=cod)})
    t = api("editor/controle/testar", {"dt": 1e-6})
    ok(t.get("ok") and "g" in t.get("medidas", []) and "v_o" not in t.get("medidas", []) and "'g'" in t.get("saida", "") and "'v_o'" not in t.get("saida", ""),
       f"testar: o m[...] tem o g e não o v_o ({t.get('medidas')}; {t.get('erro', '')})")
    j = roda("destino_api")
    cols, meta = npz(j) if j.get("estado") == "fim" else (set(), {})
    linha = next((x for x in (j.get("saida_controle") or "").splitlines() if x.startswith("MEDIDAS")), "")
    ok(j.get("estado") == "fim" and "'g'" in linha and "'v_o'" not in linha and "'i_L'" in linha,
       f"a rodada: o controle recebeu o g e não o v_o ({linha or j.get('erro')})")
    canais = [s_["canal"] for s_ in meta.get("sinais", [])]
    ok({"v_o", "v_sw", "i_L"} <= cols and "g" not in canais and "v_o" in canais and "ctrl_g" not in cols and "g" in cols and j.get("sinais") == canais,
       f"o .npz: v_o gravado; g não é medida gravada (meta: {', '.join(canais)}), só a coluna do scope(\"g\", …) do código")
    # sem o scope("g") no código: o g não vai para o arquivo
    api("editor/controle", {"controle": dict(ctl0, codigo=cod.replace("    scope(\"g\", m[\"g\"])\n", ""))})
    j = roda("destino_api", "0.0005")
    cols, meta = npz(j) if j.get("estado") == "fim" else (set(), {})
    ok(j.get("estado") == "fim" and "g" not in cols and "v_o" in cols and "portadora" in cols,
       f"sem o scope() do g: a rodada não grava o g (colunas: {', '.join(sorted(cols)) or j.get('erro')})")
    # a rota de antes: fora dos dois e de volta aos dois
    r = api("editor/fora", {"uid": uid["VOLT.1"], "fora": True})
    p = api("editor/controle")
    ok(not r.get("ERRO") and uid["VOLT.1"] in r.get("fora", []) and uid["VOLT.1"] in r.get("fora_scope", []) and uid["VOLT.1"] in r.get("fora_controle", [])
       and "v_sw" not in p["entradas"], "editor/fora {fora: true}: o v_sw fora do scope e do controle")
    r = api("editor/fora", {"uid": uid["VOLT.1"], "fora": False})
    p = api("editor/controle")
    ok(not r.get("ERRO") and uid["VOLT.1"] not in r.get("fora_scope", []) + r.get("fora_controle", []) and "v_sw" in p["entradas"],
       "editor/fora {fora: false}: de volta aos dois")
    r = api("editor/destino", {"uid": uid["VOLT.1"], "scope": "sim", "controle": True})
    r2 = api("editor/destino", {"uid": "x", "scope": True, "controle": True})
    ok(r.get("ERRO") == 409 and r2.get("ERRO") == 409, f"pedido inválido recusado ({r.get('erro')}; {r2.get('erro')})")
    # devolve os dois ao normal pela rota nova
    api("editor/destino", {"uid": uid["CONST.1"], "scope": True, "controle": True})
    r = api("editor/destino", {"uid": uid["VOLT.2"], "scope": True, "controle": True})
    ok(r.get("fora_scope") == [] and r.get("fora_controle") == [], "editor/destino com os dois marcados: tudo de volta")
    # o código lê o i_L, que passa a ir só para o scope: o painel diz qual caixinha marcar; a rodada nem começa
    api("editor/controle", {"controle": ctl0})
    api("editor/destino", {"uid": uid["AMP.1"], "scope": True, "controle": False})
    p = api("editor/controle")
    sem = [x for x in p.get("sem_esquema", []) if x["nome"] == "i_L"]
    conf = [x["msg"] for x in p.get("conferencia", []) if "i_L" in x["msg"]]
    ok(sem and sem[0].get("so_scope") == "AMP.1" and conf and all("só para o scope" in x and "AMP.1" in x for x in conf),
       f"m[\"i_L\"] só no scope: o painel diz para marcar → Controle no AMP.1 ({conf[:1]})")
    j = roda("destino_api")
    ok(j.get("ERRO") == 409 and "só para o scope" in j.get("erro", ""), f"a rodada não começa: {j.get('erro')}")
    api("editor/destino", {"uid": uid["AMP.1"], "scope": True, "controle": True})
    # controle desligado: a rodada lê e grava só os do scope; sem nenhum, recusa
    api("editor/controle", {"controle": dict(ctl0, ativo=False)})
    api("editor/destino", {"uid": uid["CONST.1"], "scope": False, "controle": True})
    j = roda("destino_api", "0.0005")
    cols, meta = npz(j) if j.get("estado") == "fim" else (set(), {})
    ok(j.get("estado") == "fim" and "g" not in cols and {"v_o", "v_sw", "i_L"} <= cols and "g" not in [x["canal"] for x in meta.get("sinais", [])],
       f"controle desligado: grava só os do scope (colunas: {', '.join(sorted(cols)) or j.get('erro')})")
    for n in ("VOLT.1", "VOLT.2", "AMP.1"):
        api("editor/destino", {"uid": uid[n], "scope": False, "controle": True})
    j = roda("destino_api", "0.0005")
    ok(j.get("ERRO") == 409 and "nada vai para o scope" in j.get("erro", ""), f"controle desligado e nada no scope: recusa ({j.get('erro')})")
    for n in ("VOLT.1", "VOLT.2", "AMP.1"):
        api("editor/destino", {"uid": uid[n], "scope": True, "controle": True})
    api("editor/controle", {"controle": ctl0})
    # salvar e reabrir: as duas listas vão junto (e o "fora" de antes, a interseção)
    api("editor/destino", {"uid": uid["VOLT.2"], "scope": True, "controle": False})
    r = api("editor/salvar", {"nome": SALVO.stem, "pasta": "circuitos", "sobrescrever": True})
    ap = json.loads(SALVO.with_name(SALVO.stem + ".aparencia.json").read_text()) if not r.get("ERRO") else {}
    ok(ap.get("fora_scope") == [uid["CONST.1"]] and ap.get("fora_controle") == [uid["VOLT.2"]] and ap.get("fora") == [],
       f"salvo: {SALVO.stem}.aparencia.json com fora_scope, fora_controle e fora ({r.get('erro') or ap})")
    ok(api("editor/pendente").get("pendente") is False, "salvo: nada pendente")
    api("editor/abrir", {"arq": PWM, "modo": "descartar"})
    r = api("editor/abrir", {"arq": str(SALVO), "modo": "descartar"})
    ok(r.get("fora_scope") == [uid["CONST.1"]] and r.get("fora_controle") == [uid["VOLT.2"]], "reaberto: as duas listas voltam")
    # trocar uma caixinha conta como não salvo; voltar, não
    api("editor/destino", {"uid": uid["VOLT.1"], "scope": False, "controle": True})
    p = api("editor/pendente")
    ok(p.get("pendente") is True and any("aparência" in x for x in p.get("itens", [])), f"trocada: pendente ({p.get('motivo')})")
    api("editor/destino", {"uid": uid["VOLT.1"], "scope": True, "controle": True})
    ok(api("editor/pendente").get("pendente") is False, "voltou como no arquivo: nada pendente")
    # um .aparencia.json de antes (só "fora"): o sinal fora dos dois
    SALVO.with_name(SALVO.stem + ".aparencia.json").write_text(json.dumps({"cores": {}, "pontas": {}, "fora": [uid["VOLT.1"]]}))
    r = api("editor/abrir", {"arq": str(SALVO), "modo": "descartar"})
    p = api("editor/controle")
    ok(r.get("fora_scope") == r.get("fora_controle") == r.get("fora") == [uid["VOLT.1"]] and "v_sw" not in p["entradas"],
       f"arquivo de antes (só fora): o v_sw fora do scope e do controle ({r.get('fora_scope')}, {r.get('fora_controle')})")
    # um circuito sem arquivo: a troca também conta
    api("editor/novo", {"modo": "descartar"})
    r = api("editor/cmd", {"op": "CREATE", "args": ["C1", 10, 5, "CONST"]}); r = api("editor/cmd", {"op": "OUTNODE", "args": ["C1", 0, "u1"]})
    u = next((e["uid"] for e in r.get("folhas", {}).get("0", {}).get("elementos", []) if e["nome"] == "C1"), "x")
    antes = api("editor/pendente").get("itens", [])
    api("editor/destino", {"uid": u, "scope": False, "controle": True})
    depois = api("editor/pendente").get("itens", [])
    ok(not any("aparência" in x for x in antes) and any("aparência" in x for x in depois), f"sem arquivo: a troca conta como não salva ({antes} → {depois})")
finally:
    if ctl0:
        api("editor/controle", {"controle": ctl0})
    api("editor/abrir", {"arq": PWM, "modo": "descartar"})
    for d in (Path.home() / ".cache/maisim_teste/rodadas").glob("*_destino_api"):
        import shutil; shutil.rmtree(d, ignore_errors=True)
    for f in CIRC.glob(SALVO.stem + ".*"):                   # a cópia salva e os arquivos de ao lado
        f.unlink(missing_ok=True)
print(f"\n{'tudo certo' if not falhas else f'{falhas} falha(s)'}")
raise SystemExit(1 if falhas else 0)
