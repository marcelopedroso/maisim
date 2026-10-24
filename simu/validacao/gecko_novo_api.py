"""Um Gecko novo com o editor no ar (instância de teste 7201), o caso de Marcelo em 24/10: o Gecko foi parado (para.sh -f) e o
MaiSim reiniciado; o servidor voltou com o arquivo dele no editor, mas o Gecko novo tinha o modelo da partida — o editor
mostrava outro circuito com o nome do arquivo, "sem salvar", e Salvar gravaria o modelo da partida por cima. Agora o
servidor reconhece o Gecko novo (o processo na porta dele: boot, pid e partida) e o põe como o editor o tinha. Confere:
(1) arquivo aberto com uma mudança não salva + Gecko reiniciado: o editor mostra os componentes do arquivo (não os do modelo
da partida), com o que estava salvo, nada pendente, o arquivo intocado (hash), a cópia do que não estava salvo guardada e o
aviso; (2) só o servidor reiniciado (o Gecko é o mesmo): a mudança não salva fica; (3) servidor e Gecko juntos, o servidor
antes (como no maisim.sh): ele refaz sozinho assim que o motor responde, sem esperar um pedido; (4) circuito novo sem arquivo
+ Gecko reiniciado: a folha fica vazia; (5) sem o registro do Gecko conhecido (a 1ª partida com esta conferência), um Gecko
que subiu depois da última leitura do editor também é novo. Reinicia o Gecko e o motor de teste (reinicia_gecko_teste.sh) e
o simulador de teste (reinicia_servidor_teste.sh); nunca os do MaiSim de uso. ~45 s."""
import hashlib, json, os, re, signal, subprocess, time, urllib.request
from pathlib import Path
B = "http://localhost:7201/maisim/simu/"
AQUI = Path(__file__).resolve().parent
T = Path.home() / ".cache/maisim_teste"
SALVOS, LOG, COPIAS = T / "circuitos", T / "simu.log", T / "gecko_reiniciado"
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
def gecko_novo():
    """O Gecko e o motor de teste de novo (o modelo da partida); devolve quanto levou."""
    t0 = time.monotonic(); subprocess.run([str(AQUI / "reinicia_gecko_teste.sh")], check=True); return time.monotonic() - t0
def para_gecko():
    """Só o Gecko e o motor de teste caem (pelos PIDs das portas de teste, 7203 e 7204)."""
    for porta in (7204, 7203):
        s = subprocess.run(["ss", "-ltnpH", f"sport = :{porta}"], capture_output=True, text=True).stdout
        for pid in set(re.findall(r"pid=(\d+)", s)): os.kill(int(pid), signal.SIGTERM)
    for _ in range(30):
        if not subprocess.run(["ss", "-ltnH", "sport = :7203 or sport = :7204"], capture_output=True, text=True).stdout.strip(): break
        time.sleep(0.3)
def estado_depois():
    """O editor/estado depois do Gecko novo: o 1º pedido abre a conexão nova com o motor (é nela que o servidor confere)."""
    for _ in range(30):
        r = api("editor/estado")
        if "ERRO" not in r: return r
        time.sleep(1)
    return r
def linhas_log(): return LOG.read_text(errors="replace").count("Gecko novo:") if LOG.exists() else 0

# 1. o arquivo aberto, com uma mudança não salva, e um Gecko novo
api("editor/novo", {"modo": "descartar"})
for a in (("U.1", 4, 10, "U"), ("R.1", 10, 10, "R")): c("CREATE", *a)
for n, i, o in (("U.1", "a", "gnd"), ("R.1", "a", "gnd")): c("INNODE", n, 0, i); c("OUTNODE", n, 0, o)
r = api("editor/salvar", {"nome": "gecko_novo_a", "pasta": "circuitos", "sobrescrever": True})
A = SALVOS / "gecko_novo_a.ipes"
ok("ERRO" not in r and A.is_file(), f"salvo em {A.name}")
api("editor/abrir", {"arq": str(A), "modo": "descartar"})
antes = hash_arq(A); c("MOVE", "R.1", 14, 10)       # a mudança que só o Gecko de agora tem
ok(api("editor/pendente").get("pendente") is True, "a mudança não salva: pendente")
copias0 = set(COPIAS.glob("*.ipes")) if COPIAS.exists() else set()
print(f"     Gecko de teste reiniciado em {gecko_novo():.1f} s")
r = estado_depois()
ok(nomes(r) == ["R.1", "U.1"], f"o editor mostra os componentes do arquivo, não os do modelo da partida: {nomes(r)}")
ok(str(r.get("arq", "")).endswith("gecko_novo_a.ipes"), f"com o nome do arquivo: {r.get('arq')}")
ok(x_de(r, "R.1") == 10, f"reaberto do arquivo salvo (R.1 em x = {x_de(r, 'R.1')}, salvo em 10)")
p = api("editor/pendente"); ok(p.get("pendente") is False, f"nada pendente depois do Gecko novo: {p.get('itens')}")
ok(hash_arq(A) == antes, "o arquivo no disco não mudou (hash)")
novas = sorted(set(COPIAS.glob("*.ipes")) - copias0) if COPIAS.exists() else []
import sys; sys.path.insert(0, str(AQUI.parent)); import ipes   # noqa: E402
xc = x_de(ipes.monta(novas[-1]), "R.1") if novas else None
ok(len(novas) == 1 and xc == 14, f"a cópia do que não estava salvo guardada ({novas[-1].name if novas else '—'}, R.1 em x = {xc})")
av = str(r.get("aviso_gecko", ""))
ok("gecko_novo_a.ipes" in av and "gecko_reiniciado" in av, f"a página avisa (aviso_gecko): {av[:150]!r}")
ok(not api("editor/estado").get("aviso_gecko"), "o aviso vem uma vez só")

# 2. só o servidor reiniciado (o Gecko é o mesmo): a mudança não salva fica
c("MOVE", "R.1", 16, 10)
subprocess.run([str(AQUI / "reinicia_servidor_teste.sh")], check=True)
n0 = linhas_log(); r = estado_depois()
ok(x_de(r, "R.1") == 16 and not r.get("aviso_gecko") and linhas_log() == n0 == 0,
   f"servidor reiniciado, o mesmo Gecko: a mudança fica (R.1 em x = {x_de(r, 'R.1')}) e nada é reaberto")

# 3. servidor e Gecko juntos, o servidor primeiro, com o Gecko ainda fora (como no maisim.sh): refaz sozinho assim que o motor
# responde, sem esperar um pedido
api("editor/abrir", {"arq": str(A), "modo": "descartar"})
para_gecko(); subprocess.run([str(AQUI / "reinicia_servidor_teste.sh")], check=True)
t0 = time.monotonic(); gecko_novo()
while linhas_log() == 0 and time.monotonic() - t0 < 120: time.sleep(0.5)
ok(linhas_log() == 1, f"sem pedido nenhum, o servidor refez o editor no Gecko novo ({time.monotonic() - t0:.1f} s depois de reiniciar o Gecko)")
r = estado_depois()
ok(nomes(r) == ["R.1", "U.1"] and api("editor/pendente").get("pendente") is False, f"e o editor está com o arquivo: {nomes(r)}, nada pendente")
ok(hash_arq(A) == antes, "o arquivo continua intocado (hash)")

# 4. circuito novo sem arquivo + Gecko novo: a folha fica vazia
api("editor/novo", {"modo": "descartar"}); c("CREATE", "R.1", 10, 10, "R")
gecko_novo(); r = estado_depois()
ok(nomes(r) == [] and api("editor/aberto").get("aberto") is None, f"circuito novo + Gecko novo: a folha vazia ({nomes(r)})")
ok("vazio" in str(r.get("aviso_gecko", "")), f"e o aviso: {str(r.get('aviso_gecko', ''))[:150]!r}")

# 5. sem o registro do Gecko conhecido (a 1ª partida com esta conferência): um Gecko que subiu depois da última leitura é novo
api("editor/abrir", {"arq": str(A), "modo": "descartar"}); c("MOVE", "R.1", 18, 10)
time.sleep(1.5); (T / "gecko_visto.txt").unlink(missing_ok=True)
gecko_novo(); r = estado_depois()
ok(x_de(r, "R.1") == 10 and hash_arq(A) == antes, f"sem registro, Gecko novo: reaberto do arquivo (R.1 em x = {x_de(r, 'R.1')}), o arquivo intocado")

api("editor/novo", {"modo": "descartar"})
for f in [A, *sorted(set(COPIAS.glob("*.ipes")) - copias0)] if COPIAS.exists() else [A]:
    f.unlink(missing_ok=True)
print(f"\n{17 - falhas}/17")
raise SystemExit(1 if falhas else 0)
