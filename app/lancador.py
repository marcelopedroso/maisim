"""O lançador do MaiSim, igual no Linux e no Windows (o que os pacotes usam: o instalador do Windows e o AppImage; a versão
de programador segue com o npm run maisim / app/scripts/maisim.sh). Sobe, nesta ordem, o que ainda não estiver no ar:
a página (app/pagina.py), o scope e o simulador (Python), o Gecko (Java; no Linux numa tela virtual, Xvfb) e o motor do
editor (Java). Espera ficar pronto, abre o navegador como app (--abrir) e fica no ar; Ctrl+C (ou --parar, de outro lugar)
derruba o que ele subiu — o Gecko só se não houver circuito sem salvar (a pergunta ao simulador, como no maisim.sh).

uso: python3 app/lancador.py [--produto] [--abrir] [--sem-gecko]     |     python3 app/lancador.py [--produto] --parar
  --produto  o perfil da versão "só usar" (config/produto.env: os dados à vista em ~/MaiSim ou Documentos\\MaiSim)
  MAISIM_JAVA (o java dos pacotes; senão o do sistema), MAISIM_GECKO_JAR (senão gecko/build/gecko-lote.jar)"""
import argparse
import json
import locale
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
WIN = os.name == "nt"
sys.path.insert(0, str(RAIZ / "config"))


def portugues():
    """As mensagens no idioma do sistema: português se o idioma começa com "pt" (como o config/fala.sh dos scripts)."""
    for k in ("LC_ALL", "LC_MESSAGES", "LANG"):
        if os.environ.get(k):
            return os.environ[k].lower().startswith("pt")
    try:
        return (locale.getlocale()[0] or "").lower().startswith(("pt", "portuguese"))
    except ValueError:
        return False


PT = portugues()


def t(pt, en):
    return pt if PT else en


def fala(pt, en):
    print(f"maisim: {pt if PT else en}", flush=True)


def no_ar(porta):
    try:
        with socket.create_connection(("127.0.0.1", int(porta)), timeout=0.5):
            return True
    except OSError:
        return False


def espera(cond, segundos):
    fim = time.monotonic() + segundos
    while time.monotonic() < fim:
        if cond():
            return True
        time.sleep(0.5)
    return False


def no_log(arq, texto):
    try:
        return texto in Path(arq).read_text(errors="replace")
    except OSError:
        return False


class Lancador:
    def __init__(self, sem_gecko=False):
        import ler_config
        ler_config.aplica()
        self.cfg = os.environ
        self.cache = Path(self.cfg["MAISIM_CACHE"])
        self.logs = self.cache / "logs"
        self.logs.mkdir(parents=True, exist_ok=True)
        self.estado = self.cache / "lancador.json"
        self.subiu = {}                                  # nome → Popen (só o que este lançador subiu)
        self.sem_gecko = sem_gecko
        # o Java: o do pacote (a pasta jre ao lado do código, no instalador do Windows), o de MAISIM_JAVA (o AppRun do
        # AppImage) ou o do sistema (a versão de programador)
        junto = RAIZ.parent / "jre" / "bin" / ("java.exe" if WIN else "java")
        self.java = self.cfg.get("MAISIM_JAVA") or (str(junto) if junto.is_file() else None) or shutil.which("java") or "java"
        self.jar = Path(self.cfg.get("MAISIM_GECKO_JAR") or RAIZ / "gecko" / "build" / "gecko-lote.jar")

    def porta(self, k):
        return int(self.cfg[f"MAISIM_PORTA_{k}"])

    def sobe(self, nome, args, log, env=None):
        """Um processo em segundo plano, com o registro dele; no Linux numa sessão própria (o grupo cai junto no fim)."""
        f = open(self.logs / log, "a")
        extra = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW} if WIN else {"start_new_session": True}
        p = subprocess.Popen(args, stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, cwd=str(RAIZ),
                             env={**os.environ, **(env or {})}, **extra)
        self.subiu[nome] = p
        self.grava()
        return p

    def grava(self):
        try:
            self.estado.write_text(json.dumps({"lancador": os.getpid(), "processos": {n: p.pid for n, p in self.subiu.items()}}))
        except OSError:
            pass

    def servidores(self):
        for nome, k, arq in (("pagina", "PAGINA", "app/pagina.py"), ("scope", "SCOPE", "scope/servidor.py"), ("simu", "SIMU", "simu/servidor.py")):
            if no_ar(self.porta(k)):
                fala(f"{nome} já estava no ar (porta {self.porta(k)})", f"{nome} was already running (port {self.porta(k)})")
                continue
            self.sobe(nome, [sys.executable, str(RAIZ / arq), "--porta", str(self.porta(k))], f"{nome}.log")
        ok = espera(lambda: all(no_ar(self.porta(k)) for k in ("PAGINA", "SCOPE", "SIMU")), 30)
        if not ok:
            fala(f"a página, o scope ou o simulador não subiu (veja {self.logs})", f"the page, scope or simulator did not start (see {self.logs})")
        return ok

    def gecko(self):
        """O Gecko e o motor do editor (o gecko/sobe.sh, em Python). No Linux, numa tela virtual (Xvfb) e, se houver o
        x11vnc e o websockify, com a tela no navegador (/maisim/gecko); no Windows, direto (a janela escondida vem com o
        patch do Gecko)."""
        pg, pm = self.porta("GECKO"), self.porta("MOTOR")
        if no_ar(pg) and no_ar(pm):
            fala(f"o Gecko já estava no ar (portas {pg} e {pm})", f"Gecko was already running (ports {pg} and {pm})")
            return True
        if no_ar(pg) or no_ar(pm):
            fala(f"o Gecko está pela metade (portas {pg}/{pm}): pare com --parar e abra de novo",
                 f"Gecko is half up (ports {pg}/{pm}): stop it with --parar and start again")
            return False
        if not self.jar.is_file():
            fala(f"falta o Gecko ({self.jar}); na versão de programador: gecko/construir.sh", f"Gecko is missing ({self.jar}); for developers: gecko/construir.sh")
            return False
        c = self.cache / "gecko"
        (c / "home").mkdir(parents=True, exist_ok=True)
        modelo = c / "exemplo_copia.ipes"
        if not modelo.is_file():
            shutil.copy2(RAIZ / "exemplos" / "exemplo_controle_pwm.ipes", modelo)
        ab = c / "home" / ".GeckoCIRCUITS" / "autoBackup.ipes"     # o de uma sessão anterior: guardado, sem o diálogo
        if ab.is_file():
            (c / "backups").mkdir(exist_ok=True)
            ab.rename(c / "backups" / f"autoBackup_{time.strftime('%Y%m%d-%H%M%S')}.ipes")
        env = {}
        if not WIN:
            tela = self.cfg["MAISIM_TELA_X"]
            if not shutil.which("Xvfb"):
                fala("falta a tela virtual: sudo apt install -y xvfb x11-utils libxtst6", "the virtual display is missing: sudo apt install -y xvfb x11-utils libxtst6")
                return False
            self.sobe("xvfb", ["Xvfb", tela, "-screen", "0", "1600x1000x24", "-nolisten", "tcp"], "xvfb.log")
            time.sleep(1)
            env["DISPLAY"] = tela
            vnc, web = self.porta("VNC"), self.porta("TELA")
            if shutil.which("x11vnc") and shutil.which("websockify") and Path("/usr/share/novnc").is_dir():   # a tela no navegador (opcional)
                self.sobe("x11vnc", ["x11vnc", "-display", tela, "-rfbport", str(vnc), "-localhost", "-nopw", "-forever", "-shared", "-quiet"],
                          "x11vnc.log", {"WAYLAND_DISPLAY": "", "XDG_SESSION_TYPE": ""})
                (c / "web").mkdir(exist_ok=True)
                shutil.copy2(RAIZ / "gecko" / "index.html", c / "web" / "index.html")
                if not (c / "web" / "novnc").exists():
                    os.symlink("/usr/share/novnc", c / "web" / "novnc")
                self.sobe("websockify", ["websockify", "--web", str(c / "web"), f"127.0.0.1:{web}", f"127.0.0.1:{vnc}"], "websockify.log")
        log = self.logs / "gecko.log"
        log.write_text("")
        self.sobe("gecko", [self.java, f"-Duser.home={c / 'home'}", "-Dpolyglot.js.nashorn-compat=true", "-jar", str(self.jar), str(modelo), "-p", str(pg)],
                  "gecko.log", env)
        fala("subindo o Gecko (até ~1 min)…", "starting Gecko (up to ~1 min)…")
        if not espera(lambda: no_log(log, "GeckoCIRCUITS is ready"), 120):
            fala(f"o Gecko não ficou pronto (veja {log})", f"Gecko did not get ready (see {log})")
            return False
        m = RAIZ / "simu" / "motor"
        cls, src = m / "bin" / "maisim" / "MaiSimMotor.class", m / "src" / "maisim" / "MaiSimMotor.java"
        javac = shutil.which("javac")
        if javac and (not cls.is_file() or src.stat().st_mtime > cls.stat().st_mtime):   # os pacotes já levam o motor compilado
            subprocess.run([javac, "-nowarn", "-encoding", "UTF-8", "-cp", str(self.jar), "-d", str(m / "bin"), str(src)],
                           stdout=subprocess.DEVNULL, stderr=open(self.logs / "motor_javac.log", "w"))
        mlog = self.logs / "motor.log"
        mlog.write_text("")
        self.sobe("motor", [self.java, "-cp", os.pathsep.join([str(self.jar), str(m / "bin")]), "maisim.MaiSimMotor",
                            "--gecko-port", str(pg), "--porta", str(pm)], "motor.log")
        if not espera(lambda: no_log(mlog, "ouvindo"), 30):     # "ouvindo": o que o motor escreve ao subir
            fala(f"o motor do editor não subiu (veja {mlog})", f"the editor engine did not start (see {mlog})")
            return False
        self.folha_em_branco()
        fala("Gecko e motor do editor prontos", "Gecko and the editor engine are ready")
        return True

    def folha_em_branco(self):
        """Sem nenhum arquivo aberto no editor, o Gecko novo começa com a folha em branco, e não com o modelo de partida
        dele: senão o modelo contaria como "circuito sem salvar" e o Gecko ficaria no ar a cada vez que se fecha o MaiSim.
        Com um arquivo aberto, o simulador mesmo o reabre no Gecko novo (o Gecko novo é reconhecido; ver refaz_gecko)."""
        try:
            r = urllib.request.urlopen(f"http://127.0.0.1:{self.porta('SIMU')}/maisim/simu/editor/aberto", timeout=10)
            if json.loads(r.read()).get("aberto"):
                return
            # o "Novo circuito" do simulador (a folha, o controle e as cores juntos); antes, uma cópia do controle de trabalho
            # (o código de um circuito novo que não foi salvo) na pasta das cópias do Gecko novo: nada se perde
            simu = Path(os.environ.get("MAISIM_SIMU_CACHE") or self.cache / "simu")
            if (simu / "controle.json").is_file():
                (simu / "gecko_reiniciado").mkdir(parents=True, exist_ok=True)
                shutil.copy2(simu / "controle.json", simu / "gecko_reiniciado" / f"controle_{time.strftime('%Y%m%d-%H%M%S')}.json")
            q = urllib.request.Request(f"http://127.0.0.1:{self.porta('SIMU')}/maisim/simu/editor/novo", data=b'{"modo": "descartar"}',
                                       headers={"Content-Type": "application/json", "Origin": f"http://localhost:{self.porta('PAGINA')}"})
            urllib.request.urlopen(q, timeout=60).read()
        except (OSError, ValueError):
            pass

    def abre(self):
        """O navegador como app (uma janela só do MaiSim, sem abas): Edge, Chrome ou Chromium; senão o navegador padrão."""
        url = f"http://localhost:{self.porta('PAGINA')}/"
        nomes = ["msedge", "chrome", "google-chrome", "chromium", "chromium-browser"]
        achados = [shutil.which(n) for n in nomes]
        if WIN:
            for base in (os.environ.get("ProgramFiles(x86)", ""), os.environ.get("ProgramFiles", ""), os.environ.get("LOCALAPPDATA", "")):
                for rel in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"):
                    achados.append(str(Path(base) / rel) if base and (Path(base) / rel).is_file() else None)
        nav = next((a for a in achados if a), None)
        if nav:
            subprocess.Popen([nav, f"--app={url}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            import webbrowser
            webbrowser.open(url)
        fala(f"aberto: {url}", f"opened: {url}")

    def para(self, motivo=""):
        """Derruba o que este lançador subiu; o Gecko (e a tela dele) só sem circuito por salvar."""
        pendente = None
        try:
            r = urllib.request.urlopen(f"http://127.0.0.1:{self.porta('SIMU')}/maisim/simu/editor/pendente", timeout=30)
            pendente = json.loads(r.read()).get("pendente")
        except (OSError, ValueError):
            pass
        gecko = ("gecko", "motor", "xvfb", "x11vnc", "websockify")
        fica = pendente is not False and any(n in self.subiu for n in gecko)   # na dúvida (o simulador fora), o Gecko fica
        for nome in ["pagina", "simu", "scope"] + ([] if fica else ["motor", "gecko", "websockify", "x11vnc", "xvfb"]):
            p = self.subiu.pop(nome, None)
            if p and p.poll() is None:
                termina(p.pid)
        if fica and pendente:
            fala("o Gecko FICOU NO AR: há circuito sem salvar (salve no MaiSim e rode --parar; ou --parar --forcar)",
                 "Gecko was LEFT RUNNING: there is an unsaved circuit (save it in MaiSim and run --parar; or --parar --forcar)")
        elif fica:
            fala("o Gecko FICOU NO AR: sem o simulador, não dá para saber se há circuito sem salvar (--parar --forcar derruba)",
                 "Gecko was LEFT RUNNING: without the simulator there is no telling whether a circuit is unsaved (--parar --forcar stops it)")
        self.grava()
        fala("parado" + motivo, "stopped" + motivo)


def vivo(pid):
    if not pid:
        return False
    if WIN:
        r = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True)
        return str(pid) in r.stdout
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


class Morto:
    """Um processo de um lançador que já saiu (só o pid, como os Popen do que ele subiu)."""
    def __init__(self, pid):
        self.pid = pid

    def poll(self):
        return None if vivo(self.pid) else 0


def termina(pid):
    try:
        if WIN:
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            os.killpg(pid, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        pass


def main():
    ap = argparse.ArgumentParser(description=t("MaiSim: sobe, abre e para (Linux e Windows).", "MaiSim: start, open and stop (Linux and Windows)."))
    ap.add_argument("--produto", action="store_true", help=t("o perfil da versão \"só usar\" (config/produto.env)", "the \"just use it\" profile (config/produto.env)"))
    ap.add_argument("--abrir", action="store_true", help=t("abre o navegador como app quando estiver pronto", "opens the browser as an app when ready"))
    ap.add_argument("--parar", action="store_true", help=t("para um lançador que está no ar", "stops a running launcher"))
    ap.add_argument("--sem-gecko", action="store_true", help=t("sem o Gecko (só a página, o scope e o simulador)", "without Gecko (only the page, scope and simulator)"))
    ap.add_argument("--forcar", action="store_true", help=t("com --parar: derruba o Gecko mesmo com circuito sem salvar", "with --parar: stops Gecko even with an unsaved circuit"))
    a = ap.parse_args()
    if a.produto:
        os.environ["MAISIM_PERFIL"] = "produto"
    if a.parar:
        import ler_config
        ler_config.aplica()
        est = Path(os.environ["MAISIM_CACHE"]) / "lancador.json"
        try:
            e = json.loads(est.read_text())
        except (OSError, ValueError):
            fala("nenhum lançador no ar", "no launcher running"); return 0
        pedido = est.with_name("lancador.parar")
        if vivo(e.get("lancador")) and not a.forcar:     # o lançador no ar: ele mesmo derruba (e pergunta do Gecko)
            pedido.write_text("parar")                    # o pedido que ele confere a cada segundo (no Windows não há SIGTERM)
            if espera(lambda: not vivo(e["lancador"]), 60):
                return 0
            fala("o lançador não respondeu; tente --parar --forcar", "the launcher did not respond; try --parar --forcar")
            return 1
        # o lançador já saiu (ou --forcar): o que ficou no ar dele (o Gecko que ficou por um circuito sem salvar)
        lc = Lancador()
        lc.subiu = {n: Morto(pid) for n, pid in e.get("processos", {}).items() if vivo(pid)}
        if a.forcar:
            for p in lc.subiu.values():
                termina(p.pid)
            lc.subiu = {}
            if vivo(e.get("lancador")):                  # e o próprio lançador (só ele: os filhos já foram)
                if WIN:
                    subprocess.run(["taskkill", "/PID", str(e["lancador"]), "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    os.kill(e["lancador"], signal.SIGKILL)
            lc.grava()
            fala("parado (forçado)", "stopped (forced)")
        else:
            lc.para()
        return 0
    lc = Lancador(a.sem_gecko)
    parar = {"ja": False}

    def fim(*_):
        if not parar["ja"]:
            parar["ja"] = True
            lc.para()
        sys.exit(0)
    signal.signal(signal.SIGINT, fim)
    signal.signal(signal.SIGTERM, fim)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, fim)
    fala(f"subindo o MaiSim (registros em {lc.logs})", f"starting MaiSim (logs in {lc.logs})")
    if not lc.servidores():
        fim()
    if a.abrir:
        lc.abre()                                        # a página já funciona; o Gecko sobe enquanto isso
    if not a.sem_gecko:
        lc.gecko()
    fala(f"no ar em http://localhost:{lc.porta('PAGINA')}/ — Ctrl+C (ou --parar) derruba o que subiu",
         f"running at http://localhost:{lc.porta('PAGINA')}/ — Ctrl+C (or --parar) stops what it started")
    pedido = lc.estado.with_name("lancador.parar")
    pedido.unlink(missing_ok=True)
    while True:                                          # o --parar (de outro terminal, ou o atalho "Desligar o MaiSim") pede aqui
        time.sleep(1)
        if pedido.exists():
            pedido.unlink(missing_ok=True)
            fim()


if __name__ == "__main__":
    sys.exit(main() or 0)
