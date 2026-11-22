"""Os testes do MaiSim em Python, para rodar onde não há bash (o Windows): o mesmo que o ci.sh, com as mesmas listas (lidas
dele: uma fonte só) e o mesmo critério. Um teste falha se sair com código diferente de 0, escrever uma linha FALHA (ou
"· FALHA"), um Traceback, ou nenhum OK. Escreve o resumo em <MAISIM_DADOS do perfil de teste>/bateria/resumo.txt.

  python ci.py rapido | completo | <teste>…   [--sobe [--maisim <pasta>]]

--sobe: sobe a instância de teste antes (o lançador, com MAISIM_PERFIL=teste; no Windows o Gecko sobe sem tela virtual)
e a derruba no fim. --maisim: a pasta do MaiSim a subir (padrão: este repositório; no CI do Windows, a pasta instalada
pelo MaiSim-Setup, com este simu/validacao copiado para dentro). Sem --sobe, a instância já tem de estar no ar (como o
ci.sh, depois do sobe_teste.sh).

SO_LINUX: os testes que não fazem sentido fora do Linux, cada um com o motivo; aparecem no resumo como "só no Linux"
(nunca pulados em silêncio). No Linux eles rodam normalmente."""
import os, re, shutil, subprocess, sys, time
from pathlib import Path

V = Path(__file__).resolve().parent
RAIZ = V.parent.parent
WIN = os.name == "nt"
for saida in (sys.stdout, sys.stderr):
    saida.reconfigure(encoding="utf-8", errors="replace")

SO_LINUX = {
    # (a instância isolada do scope ao vivo, ISOLADOS, entra aqui no main(): sobe por bash, sobe_fila.sh)
    "gecko_novo_api": "derruba e sobe o Gecko da instância de teste pelo reinicia_gecko_teste.sh",
    "lancador_app_offline": "confere como o lançador abre o navegador no Linux (no Windows, o teste do instalador sobe o lançador de verdade)",
    "tcc_offline": "monta o TinyCC do Linux (pacote/tcc.sh); o do Windows vai no instalador e o teste do instalador o usa",
    "config_offline": "confere as pastas do perfil produto do Linux (~/MaiSim, ~/.cache/maisim); as do Windows o teste do instalador confere",
}


def listas():
    """As listas do ci.sh (OFFLINE, TELA, API, ISOLADOS, RAPIDO, SO_NA_MAQUINA), com as $VARIÁVEIS expandidas."""
    txt = (V / "ci.sh").read_text(encoding="utf-8")
    v = {}
    for nome, corpo in re.findall(r'^([A-Z_]+)="(.*?)"', txt, re.S | re.M):
        v[nome] = re.sub(r"\$([A-Z_]+)", lambda m: " ".join(v.get(m.group(1), [])), corpo).split()
    return v


def perfil_teste():
    sys.path.insert(0, str(RAIZ / "config"))
    import ler_config
    return ler_config.carrega("teste")


def prepara(cfg):
    """Como o reinicia_servidor_teste.sh: os circuitos congelados dos testes na pasta de teste, a língua do zero."""
    dados = Path(cfg["MAISIM_DADOS"])
    (dados / "lingua.txt").unlink(missing_ok=True)
    circ = Path(cfg.get("MAISIM_SALVOS") or dados / "circuitos")
    circ.mkdir(parents=True, exist_ok=True)
    Path(cfg["MAISIM_CLAUDE_DIR"]).mkdir(parents=True, exist_ok=True)
    for f in [*(V / "dados").glob("exemplo_controle_*.*"), V / "dados" / "exemplo_cascata_hb.ipes"]:
        shutil.copy(f, circ / f.name)


def sobe(maisim, cfg, log):
    """O lançador da pasta maisim com o perfil de teste; espera ele dizer que está no ar."""
    amb = {k: x for k, x in os.environ.items() if not k.startswith("MAISIM_")}
    amb.update(MAISIM_PERFIL="teste", MAISIM_NAVEGADOR="nenhum", PYTHONUNBUFFERED="1", PYTHONUTF8="1")
    cmd = [sys.executable, str(Path(maisim) / "app" / "lancador.py")]
    f = open(log, "wb")
    proc = subprocess.Popen(cmd, cwd=maisim, stdin=subprocess.DEVNULL, stdout=f, stderr=subprocess.STDOUT, env=amb,
                            **({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if WIN else {"start_new_session": True}))
    t0 = time.time()
    while time.time() - t0 < 420 and proc.poll() is None:
        txt = Path(log).read_text(encoding="utf-8", errors="replace")
        if re.search(r"(?:no ar em|running at) http://localhost:\d+/", txt):
            print(f"maisim: a instância de teste subiu em {time.time() - t0:.0f} s ({maisim})", flush=True)
            return cmd, amb, proc
        if re.search(r"Traceback|não ficou pronto|did not get ready", txt):
            break
        time.sleep(2)
    print(Path(log).read_text(encoding="utf-8", errors="replace")[-3000:], flush=True)
    raise SystemExit("maisim: a instância de teste não subiu")


def desce(cmd, amb, proc):
    subprocess.run(cmd + ["--parar", "--forcar"], env=amb, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        proc.wait(timeout=60)
    except subprocess.TimeoutExpired:
        proc.kill()


def roda(t, pasta_log, resumo, so_na_maquina):
    log = pasta_log / f"{t}.log"
    def linha(txt):
        print(txt, flush=True)
        with open(resumo, "a", encoding="utf-8") as r:
            r.write(txt + "\n")
    if os.environ.get("CI") == "true" and t in so_na_maquina:
        return linha(f"{t:28s} pulado (só na máquina: depende do login de verdade do Claude)") or "pulado"
    if WIN and t in SO_LINUX:
        return linha(f"{t:28s} só no Linux ({SO_LINUX[t]})") or "linux"
    ini = time.time()
    amb = dict(os.environ)
    if t.endswith("_tela"):
        # o caminho com "/" (no NODE_OPTIONS a "\\" do Windows é escape e some)
        amb["NODE_OPTIONS"] = f'--require "{(V / "tela" / "_lingua.js").as_posix()}"' + (" " + amb["NODE_OPTIONS"] if amb.get("NODE_OPTIONS") else "")
        cmd, cwd, prazo = [shutil.which("node") or "node", f"{t}.js"], V / "tela", 600
    else:
        # pelo runpy, com esta pasta no sys.path: o Python embutido do MaiSim instalado (o ._pth) não põe a pasta do script
        # no caminho dos imports, nem lê o PYTHONPATH; os testes importam os vizinhos (_servidor, maisim…)
        boot = f"import runpy, sys; sys.path.insert(0, {str(V)!r}); sys.argv[0] = {t + '.py'!r}; runpy.run_path({t + '.py'!r}, run_name='__main__')"
        cmd, cwd, prazo = [sys.executable, "-X", "utf8", "-c", boot], V, 900
    amb.setdefault("PYTHONIOENCODING", "utf-8")
    amb["PYTHONUTF8"] = "1"                                # os Python que os testes sobem em UTF-8, como o lançador faz com os do MaiSim
    amb["MAISIM_PYTHON"] = sys.executable                  # o Python que os testes de tela usam para ler o ambiente do servidor (tela/_servidor.js)
    with open(log, "wb") as f:
        try:
            cod = subprocess.run(cmd, cwd=cwd, stdout=f, stderr=subprocess.STDOUT, env=amb, timeout=prazo).returncode
        except subprocess.TimeoutExpired:
            cod = 124
        except FileNotFoundError as e:
            f.write(f"Traceback: {e}\n".encode())
            cod = 127
    txt = log.read_text(encoding="utf-8", errors="replace")
    ok = len(re.findall(r"^OK|· OK", txt, re.M))
    fa = len(re.findall(r"^FALHA|· FALHA|Traceback", txt, re.M))
    r = "FALHOU" if cod != 0 or fa > 0 or ok == 0 else "ok"
    linha(f"{t:28s} {r:7s} OK {ok:3d} · falhas {fa:2d} · saída {cod:3d} · {time.time() - ini:4.0f}s")
    if r == "FALHOU":
        for l in [l for l in txt.splitlines() if re.search(r"^FALHA|· FALHA|Error|Traceback", l)][:3]:
            linha("    " + l[:240])
    for png in (V / "tela").glob("*.png"):                 # as fotos dos testes de tela: com os registros
        shutil.move(str(png), pasta_log / png.name)
    return r


def main():
    args = [a for a in sys.argv[1:]]
    sobe_inst = "--sobe" in args
    maisim = str(RAIZ)
    if "--maisim" in args:
        i = args.index("--maisim"); maisim = args[i + 1]; del args[i:i + 2]
    args = [a for a in args if a != "--sobe"]
    if not args:
        raise SystemExit(__doc__)
    L = listas()
    if args[0] == "rapido":
        lista = L["RAPIDO"]
    elif args[0] == "completo":
        lista = L["TELA"] + L["API"] + L["OFFLINE"] + L["ISOLADOS"]
        for t in L["ISOLADOS"]:                            # (no Linux o ci.sh as roda; este runner ainda não sobe a instância isolada)
            SO_LINUX.setdefault(t, "a instância isolada do scope ao vivo sobe por bash (sobe_fila.sh)")
    else:
        lista = args
    cfg = perfil_teste()
    pasta_log = Path(cfg["MAISIM_DADOS"]) / "bateria"
    pasta_log.mkdir(parents=True, exist_ok=True)
    resumo = pasta_log / "resumo.txt"
    resumo.write_text("", encoding="utf-8")
    os.environ.setdefault("NODE_PATH", str(Path.home() / "ns-test" / "node_modules"))
    prepara(cfg)
    inst = sobe(maisim, cfg, pasta_log / "lancador.log") if sobe_inst else None
    print(f"maisim: testes ({args[0]}) na instância de teste — registros em {pasta_log}", flush=True)
    try:
        res = [roda(t, pasta_log, resumo, L.get("SO_NA_MAQUINA", [])) for t in lista]
    finally:
        if inst:
            desce(*inst)
    feitos = [r for r in res if r in ("ok", "FALHOU")]
    falhos = [t for t, r in zip(lista, res) if r == "FALHOU"]
    outros = [t for t, r in zip(lista, res) if r not in ("ok", "FALHOU")]
    msg = f"maisim: {len(feitos) - len(falhos)} de {len(feitos)} passaram" + (f"; FALHARAM: {' '.join(falhos)}" if falhos else "") \
        + (f"; não rodados aqui: {len(outros)} (ver o resumo)" if outros else "")
    print(msg, flush=True)
    with open(resumo, "a", encoding="utf-8") as r:
        r.write(msg + "\n")
    return 1 if falhos else 0


if __name__ == "__main__":
    sys.exit(main())
