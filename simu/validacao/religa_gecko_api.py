"""O lançador religa o Gecko e o motor do editor quando eles caem (Marcelo, 10/11: no celular o Gecko caiu, não voltou, e o
app ficou "sem o motor do editor" até ele desinstalar). Um MaiSim inteiro pelo lançador (app/lancador.py --abrir, sem
navegador), nas portas 7480–7486 e numa pasta temporária; nunca o MaiSim de uso. Os processos caem com SIGKILL, como o
Android os mata quando falta memória.
- o motor cai: em segundos ele volta e uma rodada funciona;
- o Gecko cai: enquanto religa, o erro diz que está religando (não "sem o motor"); ele volta com o mesmo circuito aberto e
  uma rodada funciona;
- "pela metade" na partida (antes, o lançador desistia e pedia o --parar): o Gecko vivo sem o motor (adotado, sobe só o
  motor) e o motor vivo sem o Gecko (o motor que sobrou sai e tudo sobe);
- o limite: religa 3 vezes em 10 min e desiste (o log diz);
- no fim, o --parar (com a porta e a pasta do teste) e as portas livres. ~4 min."""
import json, os, shutil, signal, socket, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
R = Path(__file__).resolve().parents[2]
B = 7480
falhas = 0


def ok(c, t):
    global falhas; print(("OK   " if c else "FALHA"), t, flush=True); falhas += (not c)


def no_ar(p):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", p)) == 0


def api(rota, corpo=None, timeout=120):
    req = urllib.request.Request(f"http://localhost:{B + 1}/maisim/simu/{rota}", data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={"Content-Type": "application/json", "Accept-Language": "pt-BR", **({"X-MaiSim": "1"} if corpo is not None else {})})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=timeout).read())
    except urllib.error.HTTPError as e:
        return {"ERRO": e.code, **json.loads(e.read() or b"{}")}


def ate(cond, s, passo=0.5):
    fim = time.time() + s
    while time.time() < fim:
        try:
            if cond():
                return True
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(passo)
    return False


T = Path(tempfile.mkdtemp(prefix="maisim-religa-"))
EST, LOGS = T / "c" / "lancador.json", T / "c" / "logs"
env = {k: v for k, v in os.environ.items() if not k.startswith("MAISIM_")}     # sem o perfil de teste do ci.sh
env.update({"MAISIM_PORTA": str(B), "MAISIM_TELA_X": ":84", "MAISIM_DADOS": f"{T}/d", "MAISIM_CACHE": f"{T}/c", "MAISIM_NAVEGADOR": "nenhum",
            "MAISIM_CLAUDE_DIR": f"{T}/claude", "MAISIM_CURSOR_DIR": f"{T}/cursor", "MAISIM_DEEPSEEK_DIR": f"{T}/deepseek",
            "MAISIM_EXEMPLOS_GECKO": "0", "MAISIM_PUBLICA_SCOPE": "http://127.0.0.1:9", "LANG": "pt_BR.UTF-8"})
for k, nome in enumerate(("PAGINA", "SIMU", "SCOPE", "GECKO", "MOTOR", "TELA", "VNC")):
    env[f"MAISIM_PORTA_{nome}"] = str(B + k)
lancadores = []


def lanca():
    """Um lançador (o --abrir do atalho, sem navegador); espera ficar pronto. Devolve o log dele."""
    antes = None
    try:
        antes = json.loads(EST.read_text()).get("lancador")
    except (OSError, ValueError):
        pass
    log = T / f"lancador{len(lancadores) + 1}.log"
    p = subprocess.Popen([sys.executable, "app/lancador.py", "--abrir"], cwd=R, env=env, stdout=open(log, "w"), stderr=subprocess.STDOUT, start_new_session=True)
    threading.Thread(target=p.wait, daemon=True).start()   # recolhido assim que sair (um zumbi pareceria vivo ao --parar)
    lancadores.append(p)
    ate(lambda: (e := json.loads(EST.read_text())).get("lancador") not in (None, antes) and e.get("pronto") and no_ar(B + 3) and no_ar(B + 4), 240)
    return log


def pids():
    return json.loads(EST.read_text()).get("processos", {})


def mata(pid):
    if not pid:
        return
    try:
        os.kill(pid, signal.SIGKILL)
    except OSError:
        pass


def roda(nome):
    """Uma rodada curta do circuito aberto; True se acabou com as ondas."""
    j = api("editor/rodar", {"dt": "1e-06", "tfim": "2e-03", "nome": nome, "amostras": "1000"})
    if "ERRO" in j:
        return False, j
    ate(lambda: api("editor/rodada").get("estado") not in ("rodando", "pausada", "preparando"), 120)
    j = api("editor/rodada")
    return j.get("estado") == "fim" and bool(j.get("arquivo")), j


def elementos():
    r = api("editor/estado")
    return sorted(e["nome"] for e in r.get("folhas", {}).get("0", {}).get("elementos", [])), r.get("arq")


def parar(forcar=False):
    subprocess.run([sys.executable, "app/lancador.py", "--parar"] + (["--forcar"] if forcar else []), cwd=R, env=env, capture_output=True, timeout=120)


for i in range(7):
    if no_ar(B + i):
        print(f"FALHA a porta {B + i} já está em uso (sobra de uma vez anterior?)"); sys.exit(1)
try:
    # 1. no ar, com o buck dos exemplos aberto e uma rodada
    log1 = lanca()
    ok(json.loads(EST.read_text()).get("pronto") and no_ar(B + 3) and no_ar(B + 4), f"o MaiSim no ar pelo lançador (portas {B}–{B + 4})")
    c = lambda op, *a: api("editor/cmd", {"op": op, "args": list(a)})
    r = api("editor/abrir", {"arq": "exemplos/exemplo_buck.ipes", "modo": "descartar"})
    antes, arq = elementos()
    ok("ERRO" not in r and len(antes) > 3 and str(arq).endswith("exemplo_buck.ipes"), f"o buck aberto: {arq} {antes}")
    um = next(n for n in antes if n.startswith("R."))      # o que a mudança sem salvar move
    rodou, j = roda("religa_0")
    ok(rodou, f"uma rodada antes de cair: {j.get('estado')}")

    # 2. o motor cai: volta em segundos
    m0 = pids()["motor"]
    mata(m0)
    t0 = time.time()
    voltou = ate(lambda: pids().get("motor") not in (None, m0) and no_ar(B + 4), 30)
    ok(voltou, f"o motor caiu (SIGKILL {m0}) e voltou em {round(time.time() - t0)} s (pid {pids().get('motor')})")
    ok(elementos()[0] == antes, f"o editor segue com o circuito ({elementos()[0]})")
    rodou, j = roda("religa_1")
    ok(rodou, f"uma rodada depois do motor novo: {j.get('estado')}")

    # 3. o Gecko cai: enquanto religa, o erro diz isso; volta com o mesmo circuito
    g0 = pids()["gecko"]
    mata(g0)
    t0 = time.time()
    religando = ate(lambda: (T / "c" / "lancador.religando").exists(), 20, 0.2)
    erro = ""
    if religando:
        ate(lambda: not no_ar(B + 4), 20, 0.2)
        erro = api("editor/estado").get("erro", "")
    ok(religando and "sendo religado" in erro, f"enquanto religa: {erro!r}")
    voltou = ate(lambda: pids().get("gecko") not in (None, g0) and no_ar(B + 3) and no_ar(B + 4) and not (T / "c" / "lancador.religando").exists(), 180)
    ok(voltou, f"o Gecko caiu (SIGKILL {g0}) e voltou em {round(time.time() - t0)} s (pid {pids().get('gecko')})")
    ate(lambda: elementos()[0] == antes, 60)
    depois, arq2 = elementos()
    ok(depois == antes and str(arq2).endswith("exemplo_buck.ipes"), f"o mesmo circuito no Gecko novo: {arq2} {depois}")
    rodou, j = roda("religa_2")
    ok(rodou, f"uma rodada depois do Gecko novo: {j.get('estado')}")
    ok("o Gecko caiu: religando" in log1.read_text() and "o motor do editor caiu: religando" in log1.read_text(), "o log do lançador conta as religadas")

    # 4. "pela metade" na partida: o Gecko vivo sem o motor (uma mudança sem salvar segura o Gecko no --parar)
    c("MOVE", um, 3, 3)
    parar()
    p = pids()
    ok(lancadores[-1].poll() is not None and no_ar(B + 3) and not no_ar(B + 1), f"o lançador saiu e o Gecko ficou (circuito sem salvar): {p}")
    g1 = p.get("gecko")
    mata(p.get("motor"))
    ate(lambda: not no_ar(B + 4), 10)
    log2 = lanca()
    t2 = log2.read_text()
    ok(no_ar(B + 4) and "subindo só o motor" in t2 and pids().get("gecko") == g1, f"o Gecko sem o motor: adotado (pid {pids().get('gecko')}), sobe só o motor")

    # 5. "pela metade" ao contrário: o motor vivo sem o Gecko
    c("MOVE", um, 5, 5)
    parar()
    p = pids()
    m2 = p.get("motor")
    mata(p.get("gecko"))
    ate(lambda: not no_ar(B + 3), 10)
    ok(no_ar(B + 4) and not no_ar(B + 3), f"o motor ({m2}) ficou sem o Gecko")
    log3 = lanca()
    t3 = log3.read_text()
    ok(no_ar(B + 3) and no_ar(B + 4) and "religando os dois" in t3 and pids().get("motor") != m2, f"o motor que sobrou saiu e tudo subiu (gecko {pids().get('gecko')}, motor {pids().get('motor')})")
    ate(lambda: str(elementos()[1]).endswith("exemplo_buck.ipes"), 60)
    rodou, j = roda("religa_3")
    ok(rodou, f"uma rodada depois da partida pela metade: {j.get('estado')}")

    # 6. o limite: 3 religadas em 10 min; a 4ª queda fica
    for k in range(1, 5):
        m = pids()["motor"]
        mata(m)
        if k <= 3:
            ok(ate(lambda: pids().get("motor") not in (None, m) and no_ar(B + 4), 30), f"queda {k} do motor: religado")
        else:
            ok(ate(lambda: "a vigia parou" in log3.read_text(), 20) and not ate(lambda: no_ar(B + 4), 12),
               "queda 4: a vigia parou (3 religadas em 10 min) e o log diz")
except Exception as x:                                   # noqa: BLE001
    ok(False, f"o teste caiu: {type(x).__name__}: {x}")
finally:
    parar()
    if any(no_ar(B + i) for i in range(7)):
        parar(forcar=True)                               # o Gecko que ficou (sem o motor, não dá para perguntar se há o que salvar)
    livres = ate(lambda: not any(no_ar(B + i) for i in range(7)), 30)
    ok(livres, f"o --parar: as portas {B}–{B + 6} livres")
    for p in lancadores:
        if p.poll() is None:
            p.kill()
    if livres and not falhas:
        shutil.rmtree(T, ignore_errors=True)
    else:
        print(f"(a pasta {T} ficou para olhar: {T}/lancador*.log, {LOGS})")
sys.exit(1 if falhas else 0)
