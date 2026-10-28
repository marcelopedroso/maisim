"""O Atualizar da versão de programador, pelo git, de ponta a ponta (Marcelo, 28/10: "até pela tela um botãozinho"), num
clone descartável (nada no código daqui): um remoto de mentira (um repositório bare numa pasta temporária, com o main deste
commit), o clone do MaiSim aberto pelo lançador (--abrir, sem navegador) nas portas 7400–7406, com o jar do Gecko daqui
(os mesmos patches: o construir.sh não monta de novo).
- em dia: a versão do VERSION, o commit, 0 commits depois da tag v<versão>, nenhuma novidade;
- um commit novo no main do remoto: no canal estável (a última tag) nada; no teste (o main), "<versão> +1", com o título
  do commit nas notas;
- um arquivo do código mudado à mão: o Atualizar recusa (git status) e nada muda;
- Atualizar (o main local avança): o MaiSim cai e volta sozinho (o lançador de novo, ainda com --abrir), já no commit novo (+1), sem novidade;
- no fim, o lançador --parar (com a pasta do clone) e as portas livres."""
import json, os, shutil, socket, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
R = Path(__file__).resolve().parents[2]
B = 7400
falhas = 0


def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t); falhas += (not c)


def git(*a, cwd):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def no_ar(p):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", p)) == 0


def api(rota, corpo=None):
    req = urllib.request.Request(f"http://localhost:{B + 1}/maisim/simu/{rota}", data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", **({"X-MaiSim": "1"} if corpo is not None else {})})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=60).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


def ate(cond, s):
    fim = time.time() + s
    while time.time() < fim:
        try:
            if cond():
                return True
        except (OSError, ValueError):                  # o MaiSim reiniciando; o lancador.json sendo escrito
            pass
        time.sleep(1)
    return False


for i in range(7):
    if no_ar(B + i):
        print(f"FALHA a porta {B + i} já está em uso (sobra de uma vez anterior?)"); sys.exit(1)
T = Path(tempfile.mkdtemp(prefix="maisim-atugit-"))
C, REM = T / "clone", T / "remoto.git"
V = (R / "VERSION").read_text().strip()
env = {k: v for k, v in os.environ.items() if not k.startswith("MAISIM_")}     # sem o perfil de teste do ci.sh
env.update({"MAISIM_PORTA": str(B), "MAISIM_TELA_X": ":74", "MAISIM_DADOS": f"{T}/d", "MAISIM_CACHE": f"{T}/c", "MAISIM_NAVEGADOR": "nenhum",
            "MAISIM_CLAUDE_DIR": f"{T}/claude", "MAISIM_CURSOR_DIR": f"{T}/cursor", "MAISIM_DEEPSEEK_DIR": f"{T}/deepseek",
            "MAISIM_EXEMPLOS_GECKO": "0", "MAISIM_ATUALIZA_GIT": str(REM), "MAISIM_ATUALIZA_ESPERA": "1", "MAISIM_PUBLICA_SCOPE": "http://127.0.0.1:9"})
for k, nome in enumerate(("PAGINA", "SIMU", "SCOPE", "GECKO", "MOTOR", "TELA", "VNC")):
    env[f"MAISIM_PORTA_{nome}"] = str(B + k)                                     # nem um .env da raiz muda
lanc = None
try:
    # o remoto (o main = o commit daqui) e o clone, com a tag da versão no commit (0 depois dela) e o jar do Gecko daqui
    git("clone", "-q", "--no-hardlinks", str(R), str(C), cwd=T)
    git("config", "user.email", "teste@maisim", cwd=C); git("config", "user.name", "teste", cwd=C)
    git("checkout", "-q", "-B", "main", cwd=C)              # no main local (o caso de quem clonou): o Atualizar o avança
    for t in git("tag", "-l", cwd=C).split():           # as tags daqui não valem: a v<versão> neste commit
        git("tag", "-d", t, cwd=C)
    git("tag", f"v{V}", cwd=C)
    # o remoto: um clone bare do clone (o main e a tag), não um push — no CI o checkout é raso, e um push dele para um
    # repositório vazio é recusado ("shallow update not allowed")
    git("clone", "-q", "--bare", "--no-hardlinks", str(C), str(REM), cwd=T)
    (C / "gecko" / "build").mkdir(parents=True, exist_ok=True)
    for f in ("gecko-lote.jar", ".patches"):
        shutil.copy2(R / "gecko" / "build" / f, C / "gecko" / "build" / f)
    antes = git("rev-parse", "--short", "HEAD", cwd=C)
    log = open(T / "lancador.log", "w")
    lanc = subprocess.Popen([sys.executable, "app/lancador.py", "--abrir"], cwd=C, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    threading.Thread(target=lanc.wait, daemon=True).start()   # recolhido assim que sair (um zumbi pareceria vivo ao --parar)
    subiu = ate(lambda: json.loads((T / "c" / "lancador.json").read_text()).get("pronto") and no_ar(B + 1), 240)
    ok(subiu, f"o clone no ar pelo lançador (portas {B}–{B + 4})")
    e = api("atualizacao/verificar", {})
    ok(e.get("tipo") == "fonte" and e.get("git") and e.get("versao") == V and e.get("commit") == antes and e.get("depois") == 0 and not e.get("nova"),
       f"em dia: {e.get('versao')} ({e.get('commit')}), {e.get('depois')} depois da v{V}, git {e.get('git')}, novidade {e.get('nova')}")
    # um commit novo no main do remoto (outro clone)
    C2 = T / "outro"
    git("clone", "-q", str(REM), str(C2), cwd=T)
    git("config", "user.email", "teste@maisim", cwd=C2); git("config", "user.name", "teste", cwd=C2)
    (C2 / "novidade_teste.txt").write_text("um commit novo no main\n")
    git("add", "novidade_teste.txt", cwd=C2); git("commit", "-q", "-m", "Novidade de teste no main", cwd=C2); git("push", "-q", "origin", "main", cwd=C2)
    novo = git("rev-parse", "--short", "HEAD", cwd=C2)
    e = api("atualizacao/verificar", {})
    ok(not e.get("nova"), f"no canal estável (a última tag, v{V}): nada novo ({e.get('nova')})")
    e = api("atualizacao/canal", {"canal": "teste"})
    n = e.get("nova") or {}
    ok(n.get("versao") == f"{V} +1" and n.get("commits") == 1 and n.get("commit") == novo and "Novidade de teste no main" in n.get("notas", "") and "alvo" not in n,
       f"no canal teste (o main): {n.get('versao')}, {n.get('commits')} commit ({n.get('commit')}): {n.get('notas')!r}")
    # mudado à mão: recusa
    leia = C / "README.md"
    original = leia.read_bytes()
    leia.write_bytes(original + b"\nmudado a mao\n")
    e = api("atualizacao/aplicar", {})
    ok(e.get("ERRO") == 400 and "git status" in e.get("erro", "") and git("rev-parse", "--short", "HEAD", cwd=C) == antes, f"com um arquivo mudado à mão: recusado ({e.get('erro')})")
    leia.write_bytes(original)
    # Atualizar: cai e volta no commit novo
    pid1 = json.loads((T / "c" / "lancador.json").read_text())["lancador"]
    e = api("atualizacao/aplicar", {})
    ok("ERRO" not in e and (e.get("aplicando") or {}).get("fase") in ("atualizando", "construindo", "reiniciando"), f"Atualizar: {e.get('erro') or e.get('aplicando')}")
    t0 = time.time()
    voltou = ate(lambda: api("atualizacao").get("commit") == novo, 240)
    e = api("atualizacao") if voltou else {}
    est = json.loads((T / "c" / "lancador.json").read_text())
    ok(voltou and git("rev-parse", "--short", "HEAD", cwd=C) == novo and (C / "novidade_teste.txt").is_file(), f"de volta em {round(time.time() - t0)} s, no commit novo ({e.get('commit')})")
    ok(e.get("depois") == 1 and not e.get("nova") and not e.get("aplicando") and est.get("lancador") != pid1 and est.get("abrir") and not est.get("sem_gecko"),
       f"a versão {e.get('versao')} +{e.get('depois')}, sem novidade; outro lançador ({pid1} → {est.get('lancador')}), ainda com --abrir")
    ok(ate(lambda: json.loads((T / "c" / "lancador.json").read_text()).get("pronto") and no_ar(B + 3) and no_ar(B + 4), 120), "o Gecko e o motor no ar de novo")
except Exception as x:                                   # noqa: BLE001
    ok(False, f"o teste caiu: {type(x).__name__}: {x}")
finally:
    if (C / "app" / "lancador.py").is_file():
        subprocess.run([sys.executable, "app/lancador.py", "--parar"], cwd=C, env=env, capture_output=True, timeout=120)
    livres = ate(lambda: not any(no_ar(B + i) for i in range(7)), 30)
    ok(livres, f"o --parar do clone: as portas {B}–{B + 6} livres")
    if lanc and lanc.poll() is None:
        lanc.kill()
    if livres:
        shutil.rmtree(T, ignore_errors=True)
    else:
        print(f"(a pasta {T} ficou para olhar: {T}/lancador.log, {T}/c/logs)")
sys.exit(1 if falhas else 0)
