"""Um Gecko novo com o editor no ar (instância de teste 7201), o caso de Marcelo em 24/10: o Gecko foi parado (para.sh -f) e o
MaiSim reiniciado; o servidor voltou com o arquivo dele no editor, mas o Gecko novo tinha o modelo da partida — o editor
mostrava outro circuito com o nome do arquivo, "sem salvar", e Salvar gravaria o modelo da partida por cima. Agora o
servidor reconhece o Gecko novo (o processo na porta dele: boot, pid e partida) e o põe como o editor o tinha. Confere:
(1) arquivo aberto com uma mudança não salva + Gecko reiniciado, 1º pedido uma leitura: os componentes do arquivo (não os do
modelo da partida), com o que estava salvo, nada pendente, o arquivo intocado (hash), as cópias (o que não estava salvo; o
que o Gecko novo tinha) e o aviso uma vez; (2) o 1º pedido depois do Gecko novo é Salvar como (nome novo; por cima de outro
arquivo) ou uma edição: recusado com o código gecko_novo, nada gravado, nada mudado; (3) só o servidor reiniciado (o Gecko é
o mesmo): a mudança não salva fica; (4) o servidor antes do Gecko (como no maisim.sh), com um devolver.json de uma rodada do
Gecko de antes: refeito sem pedido assim que o motor responde, os CONST de antes não caem no arquivo reaberto; (5) circuito
novo sem arquivo + Gecko novo: a folha vazia; (6) sem o registro do Gecko conhecido (a 1ª partida com esta conferência): o
mesmo Gecko não é tomado por novo (nem com o relógio adiantado: o que ele tem é o que o editor viu), e um que subiu bem
depois da última leitura, com outra coisa, é. Reinicia o Gecko e o motor de teste (reinicia_gecko_teste.sh) e o simulador de
teste (reinicia_servidor_teste.sh); nunca os do MaiSim de uso. ~1,5 min."""
import hashlib, json, os, re, signal, subprocess, sys, time, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
import ipes  # noqa: E402
T = Path.home() / ".cache/maisim_teste"
SALVOS, LOG, COPIAS, ESTADO = T / "circuitos", T / "simu.log", T / "gecko_reiniciado", T / "estado.ipes"
def api(rota, corpo=None, timeout=300):
    q = urllib.request.Request(B + rota, data=json.dumps(corpo).encode() if corpo is not None else None, headers={"Content-Type": "application/json"})
    try: return json.loads(urllib.request.urlopen(q, timeout=timeout).read())
    except urllib.error.HTTPError as e: return {"ERRO": e.code, **json.loads(e.read() or b"{}")}
falhas = 0
def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)
c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
nomes = lambda r: sorted(e["nome"] for e in r.get("folhas", {}).get("0", {}).get("elementos", []))
x_de = lambda r, n: next((e["x"] for e in r.get("folhas", {}).get("0", {}).get("elementos", []) if e["nome"] == n), None)
hash_arq = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
copias = lambda: set(COPIAS.glob("*.ipes")) if COPIAS.exists() else set()
def gecko_novo():
    """O Gecko e o motor de teste de novo (o modelo da partida)."""
    subprocess.run([str(AQUI / "reinicia_gecko_teste.sh")], check=True)
def para_gecko():
    """Só o Gecko e o motor de teste caem (pelos PIDs das portas de teste, 7203 e 7204)."""
    for porta in (7204, 7203):
        s = subprocess.run(["ss", "-ltnpH", f"sport = :{porta}"], capture_output=True, text=True).stdout
        for pid in set(re.findall(r"pid=(\d+)", s)): os.kill(int(pid), signal.SIGTERM)
    for _ in range(30):
        if not subprocess.run(["ss", "-ltnH", "sport = :7203 or sport = :7204"], capture_output=True, text=True).stdout.strip(): break
        time.sleep(0.3)
def estado_depois():
    """O editor/estado depois do Gecko novo (uma leitura: segue, já com o Gecko refeito)."""
    for _ in range(30):
        r = api("editor/estado")
        if "ERRO" not in r: return r
        time.sleep(1)
    return r
def linhas_log(): return LOG.read_text(errors="replace").count("Gecko novo: reaberto") if LOG.exists() else 0
c0 = copias()

# 0. dois arquivos da pasta do MaiSim: A (com um CONST) e B
for nome, extra in (("gecko_novo_b", ("R.7", 30, 10, "R")), ("gecko_novo_a", ("CONST.1", 10, 20, "CONST"))):
    api("editor/novo", {"modo": "descartar"})
    for a in (("U.1", 4, 10, "U"), ("R.1", 10, 10, "R"), extra): c("CREATE", *a)
    for n, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "gnd")): c("INNODE", n, 0, i); c("OUTNODE", n, 0, o)
    r = api("editor/salvar", {"nome": nome, "pasta": "circuitos", "sobrescrever": True})
A, Bq, C = SALVOS / "gecko_novo_a.ipes", SALVOS / "gecko_novo_b.ipes", SALVOS / "gecko_novo_c.ipes"
C.unlink(missing_ok=True)
ok("ERRO" not in r and A.is_file() and Bq.is_file(), f"salvos {A.name} e {Bq.name}")
hA, hB = hash_arq(A), hash_arq(Bq)

# 1. o arquivo aberto, com uma mudança não salva, e um Gecko novo; o 1º pedido, uma leitura
api("editor/abrir", {"arq": str(A), "modo": "descartar"}); c("MOVE", "R.1", 14, 10)
ok(api("editor/pendente").get("pendente") is True, "a mudança não salva: pendente")
gecko_novo(); r = estado_depois()
ok(nomes(r) == ["CONST.1", "R.1", "U.1"], f"o editor mostra os componentes do arquivo, não os do modelo da partida: {nomes(r)}")
ok(str(r.get("arq", "")).endswith("gecko_novo_a.ipes") and x_de(r, "R.1") == 10, f"{r.get('arq')}, reaberto do arquivo salvo (R.1 em x = {x_de(r, 'R.1')}, salvo em 10)")
p = api("editor/pendente"); ok(p.get("pendente") is False, f"nada pendente depois do Gecko novo: {p.get('itens')}")
ok(hash_arq(A) == hA, "o arquivo no disco não mudou (hash)")
novas = copias() - c0
nao_salvo = [f for f in novas if f.name.startswith("gecko_novo_a_")]
tinha = [f for f in novas if re.match(r"gecko_novo_\d", f.name)]
xc = x_de(ipes.monta(nao_salvo[0]), "R.1") if nao_salvo else None
ok(len(nao_salvo) == 1 and xc == 14, f"a cópia do que não estava salvo ({nao_salvo[0].name if nao_salvo else '—'}, R.1 em x = {xc})")
nt = sorted(e["nome"] for e in ipes.monta(tinha[0])["folhas"]["0"]["elementos"]) if tinha else []
ok(len(tinha) == 1 and "L.1" in nt, f"a cópia do que o Gecko novo tinha (o modelo da partida: {len(nt)} componentes)")
av = str(r.get("aviso_gecko", ""))
ok("gecko_novo_a.ipes" in av and "gecko_reiniciado" in av, f"a página avisa (aviso_gecko): {av[:150]!r}")
ok(not api("editor/estado").get("aviso_gecko") and not api("claude/pedido").get("aviso_gecko"), "o aviso vem uma vez só")

# 2. o 1º pedido depois do Gecko novo muda algo: recusado (salvar gravaria o arquivo reaberto por cima de outro)
gecko_novo(); r = api("editor/salvar", {"nome": "gecko_novo_c", "pasta": "circuitos"})
ok(r.get("ERRO") == 409 and r.get("codigo") == "gecko_novo" and not C.exists(), f"Salvar como (nome novo), 1º pedido: recusado, nada gravado ({r.get('erro', '')[:110]!r})")
gecko_novo(); r = api("editor/salvar", {"nome": "gecko_novo_b", "pasta": "circuitos", "sobrescrever": True})
ok(r.get("ERRO") == 409 and r.get("codigo") == "gecko_novo" and hash_arq(Bq) == hB, "Salvar como por cima de outro arquivo, 1º pedido: recusado, o outro intocado (hash)")
gecko_novo(); r = c("MOVE", "R.1", 20, 10); e = api("editor/estado")
ok(r.get("codigo") == "gecko_novo" and x_de(e, "R.1") == 10 and api("editor/pendente").get("pendente") is False,
   f"uma edição, 1º pedido: recusada, o circuito como no arquivo (R.1 em x = {x_de(e, 'R.1')})")
r = c("MOVE", "R.1", 20, 10); ok("ERRO" not in r and x_de(r, "R.1") == 20, "repetida, a edição vale")

# 3. só o servidor reiniciado (o Gecko é o mesmo): a mudança não salva fica
subprocess.run([str(AQUI / "reinicia_servidor_teste.sh")], check=True)
r = estado_depois()
ok(x_de(r, "R.1") == 20 and not r.get("aviso_gecko") and linhas_log() == 0,
   f"servidor reiniciado, o mesmo Gecko: a mudança fica (R.1 em x = {x_de(r, 'R.1')}) e nada é reaberto")

# 4. o servidor antes do Gecko (como no maisim.sh), com os CONST de uma rodada do Gecko de antes: refaz sozinho, sem os CONST
api("editor/abrir", {"arq": str(A), "modo": "descartar"})
para_gecko(); (T / "devolver.json").write_text(json.dumps({"CONST.1": 7.0}))
subprocess.run([str(AQUI / "reinicia_servidor_teste.sh")], check=True)
t0 = time.monotonic(); gecko_novo()
while linhas_log() == 0 and time.monotonic() - t0 < 120: time.sleep(0.5)
time.sleep(1)
ok(linhas_log() == 1, f"sem pedido nenhum, o servidor refez o editor no Gecko novo ({time.monotonic() - t0:.1f} s depois de reiniciar o Gecko)")
r = estado_depois(); p = api("editor/pendente")
ok(nomes(r) == ["CONST.1", "R.1", "U.1"] and p.get("pendente") is False and not (T / "devolver.json").exists(),
   f"o editor com o arquivo, nada pendente ({p.get('itens')}), o devolver.json do Gecko de antes descartado")
ok(hash_arq(A) == hA and hash_arq(Bq) == hB and not C.exists(), "os arquivos continuam intocados (hash)")

# 5. circuito novo sem arquivo + Gecko novo: a folha fica vazia
api("editor/novo", {"modo": "descartar"}); c("CREATE", "R.1", 10, 10, "R")
gecko_novo(); r = estado_depois()
ok(nomes(r) == [] and api("editor/aberto").get("aberto") is None and "vazio" in str(r.get("aviso_gecko", "")),
   f"circuito novo + Gecko novo: a folha vazia ({nomes(r)}), com o aviso")

# 6. sem o registro do Gecko conhecido (a 1ª partida com esta conferência)
api("editor/abrir", {"arq": str(A), "modo": "descartar"}); c("MOVE", "R.1", 18, 10); api("editor/estado")
(T / "gecko_visto.txt").unlink(missing_ok=True); subprocess.run([str(AQUI / "reinicia_servidor_teste.sh")], check=True)
ok(x_de(estado_depois(), "R.1") == 18, "sem registro, o mesmo Gecko, servidor reiniciado: a mudança fica")
(T / "gecko_visto.txt").unlink(missing_ok=True); os.utime(ESTADO, (time.time() - 3600,) * 2)   # o relógio "pulou" 1 h
subprocess.run([str(AQUI / "reinicia_servidor_teste.sh")], check=True)
ok(x_de(estado_depois(), "R.1") == 18, "sem registro, o mesmo Gecko e a última leitura de 1 h atrás: o que ele tem é o que o editor viu, fica")
(T / "gecko_visto.txt").unlink(missing_ok=True)
gecko_novo(); os.utime(ESTADO, (time.time() - 3600,) * 2)
r = estado_depois()
ok(x_de(r, "R.1") == 10 and hash_arq(A) == hA, f"sem registro, um Gecko que subiu bem depois, com outra coisa: reaberto do arquivo (R.1 em x = {x_de(r, 'R.1')})")

# só o Gecko cai e volta, o motor fica no ar (com a referência remota do Gecko de antes; Codex no #82): o motor procura o
# Gecko de novo e responde java.rmi; o servidor confere, refaz e recusa o pedido; o seguinte vale
gecko_novo()
api("editor/abrir", {"arq": str(A), "modo": "descartar"})
s7203 = subprocess.run(["ss", "-ltnpH", "sport = :7203"], capture_output=True, text=True).stdout
for pid in set(re.findall(r"pid=(\d+)", s7203)): os.kill(int(pid), signal.SIGTERM)
for _ in range(30):
    if not subprocess.run(["ss", "-ltnH", "sport = :7203"], capture_output=True, text=True).stdout.strip(): break
    time.sleep(0.3)
cfg = dict(re.findall(r"(MAISIM_\w+)='?([^'\n]*)'?", subprocess.run(["python3", str(AQUI.parents[1] / "config" / "ler_config.py"), "--shell", "teste"], capture_output=True, text=True).stdout))
T = Path(cfg["MAISIM_DADOS"]); jar = cfg.get("MAISIM_GECKO_JAR") or str(AQUI.parents[1] / "gecko" / "build" / "gecko-lote.jar")
(T / "gecko.log").write_text("")
subprocess.Popen(["setsid", "nohup", "java", f"-Duser.home={T}/home", "-Dpolyglot.js.nashorn-compat=true", "-jar", jar, str(T / "modelo.ipes"), "-p", cfg["MAISIM_PORTA_GECKO"]],
                 cwd=T, env=dict(os.environ, DISPLAY=cfg["MAISIM_TELA_X"]), stdout=open(T / "gecko.log", "w"), stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
for _ in range(60):
    if "GeckoCIRCUITS is ready" in (T / "gecko.log").read_text(errors="replace"): break
    time.sleep(1)
r = api("editor/cmd", {"op": "MOVE", "args": ["R.1", 30, 10]})
e = api("editor/estado")
ok(r.get("codigo") == "gecko_novo" and x_de(e, "R.1") == 10 and api("editor/pendente").get("pendente") is False and hash_arq(A) == hA,
   f"só o Gecko caiu (o motor no ar): reconhecido, pedido recusado, reaberto do arquivo ({r.get('codigo')}, R.1 em x = {x_de(e, 'R.1')})")
r = api("editor/cmd", {"op": "MOVE", "args": ["R.1", 30, 10]})
ok(not r.get("ERRO") and x_de(r, "R.1") == 30, f"e o pedido repetido vale ({r.get('erro', 'ok')})")
gecko_novo()                                         # o Gecko e o motor como os outros testes esperam

api("editor/novo", {"modo": "descartar"})
for f in [A, Bq, C, *(copias() - c0)]:
    f.unlink(missing_ok=True)
print(f"\n{24 - falhas}/24")
raise SystemExit(1 if falhas else 0)
