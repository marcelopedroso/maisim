"""O lançador do MaiSim, igual no Linux e no Windows (o que os pacotes usam: o instalador do Windows e o AppImage; a versão
de programador também, com app/scripts/maisim.sh --abrir; sem --abrir, o maisim.sh fica no ar até o Ctrl+C). Sobe, nesta
ordem, o que ainda não estiver no ar: a página (app/pagina.py), o scope e o simulador (Python), o Gecko (Java; no Linux
numa tela virtual, Xvfb) e o motor do editor (Java). Espera ficar pronto, abre o navegador como app (--abrir) e fica no ar; Ctrl+C (ou --parar, de outro lugar)
derruba o que ele subiu — o Gecko só se não houver circuito sem salvar (a pergunta ao simulador, como no maisim.sh).
Com --abrir (o atalho do "só usar"), fechar a janela do MaiSim também desliga: as páginas dão sinal de vida à página
(app/pagina.py, /maisim/vivo) e, sem nenhuma aberta (nem rodada em andamento), ele para como o --parar. O ícone de novo,
com o lançador ainda no ar, só abre a janela nele.

uso: python3 app/lancador.py [--produto] [--abrir] [--sem-gecko]     |     python3 app/lancador.py [--produto] --parar
  --produto  o perfil da versão "só usar" (config/produto.env: os dados à vista em ~/MaiSim ou Documentos\\MaiSim)
  MAISIM_JAVA (o java dos pacotes; senão o do sistema), MAISIM_GECKO_JAR (senão gecko/build/gecko-lote.jar),
  MAISIM_NAVEGADOR (o navegador do --abrir, com opções se quiser; "nenhum": não abre — os testes; no WSL, sem ele, o
  Chrome ou o Edge do Windows)"""
import argparse
import json
import locale
import os
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
WIN = os.name == "nt"
sys.path.insert(0, str(RAIZ / "config"))
sys.path.insert(1, str(RAIZ / "simu"))
import processos  # noqa: E402,F401   no Windows: o tasklist/taskkill e o javac sem janela de prompt piscando
# no Windows, o padrão dos arquivos e do texto é o cp1252 (um "≈" no resumo da rodada derrubava a gravação): os servidores
# Python em UTF-8 (PYTHONUTF8) e os Java também (-Dfile.encoding), como no Linux
UTF8_JAVA = ["-Dfile.encoding=UTF-8"] if WIN else []
if WIN:
    os.environ.setdefault("PYTHONUTF8", "1")


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


def avisa(pt, en):
    """Um erro que quem abriu pelo atalho precisa ver: no terminal e, no Windows (o pythonw não tem terminal), numa janela."""
    fala(pt, en)
    if WIN:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, pt if PT else en, "MaiSim", 0x10)


# a janela do navegador como app no Windows: o Edge/Chrome dá a ela um AppUserModelID dele ("MSEdge.localhost_/.UserData.Profile1",
# do endereço e do perfil) e, sem um app instalado, a barra de tarefas usa o favicon de 16 px esticado (borrado). Com o nosso
# ID e o ícone de relançamento (o maisim.ico, com 16 a 256 px) na janela, a barra mostra o ícone nítido e o nome MaiSim, e fixar
# a janela na barra abre o MaiSim pelo lançador. Os atalhos do instalador têm o mesmo ID (MaiSim.iss): janela e atalho são um só.
AUMID = "MaiSim.MaiSim"


def _propriedades_janela(hwnd, novos=None):
    """Lê o AppUserModelID da janela (de qualquer processo) e, com novos ({pid da PKEY_AppUserModel_*: texto}), grava-os."""
    import ctypes
    import uuid
    from ctypes import wintypes

    class Chave(ctypes.Structure):
        _fields_ = [("fmtid", ctypes.c_ubyte * 16), ("pid", wintypes.DWORD)]

    class Valor(ctypes.Structure):           # PROPVARIANT: vt, três reservados e a união (24 bytes no Windows de 64 bits)
        _fields_ = [("vt", ctypes.c_ushort), ("r1", ctypes.c_ushort), ("r2", ctypes.c_ushort), ("r3", ctypes.c_ushort),
                    ("p", ctypes.c_void_p), ("p2", ctypes.c_void_p)]

    def chave(pid):                          # PKEY_AppUserModel_*: 2 comando, 3 ícone, 4 nome, 5 o ID
        return Chave((ctypes.c_ubyte * 16).from_buffer_copy(uuid.UUID("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3").bytes_le), pid)

    iid = (ctypes.c_ubyte * 16).from_buffer_copy(uuid.UUID("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99").bytes_le)  # IPropertyStore
    ps = ctypes.c_void_p()
    if ctypes.windll.shell32.SHGetPropertyStoreForWindow(wintypes.HWND(hwnd), ctypes.byref(iid), ctypes.byref(ps)) != 0 or not ps:
        return None
    tabela = ctypes.cast(ps, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents

    def metodo(i, *args):
        return ctypes.WINFUNCTYPE(ctypes.HRESULT, ctypes.c_void_p, *args)(tabela[i])
    try:
        v = Valor()
        k = chave(5)
        metodo(5, ctypes.POINTER(Chave), ctypes.POINTER(Valor))(ps, ctypes.byref(k), ctypes.byref(v))   # GetValue
        atual = ctypes.wstring_at(v.p) if v.vt == 31 and v.p else ""                                      # VT_LPWSTR
        ctypes.windll.ole32.PropVariantClear(ctypes.byref(v))
        if novos:
            textos = []
            for pid, texto in novos.items():
                textos.append(ctypes.create_unicode_buffer(texto))       # o SetValue copia; o texto vive até lá
                k, v = chave(pid), Valor(vt=31, p=ctypes.addressof(textos[-1]))
                metodo(6, ctypes.POINTER(Chave), ctypes.POINTER(Valor))(ps, ctypes.byref(k), ctypes.byref(v))  # SetValue
            metodo(7)(ps)                                                                                  # Commit
        return atual
    finally:
        ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(tabela[2])(ps)                                # Release


def marca_janela(icone, comando, segundos=60):
    """Espera a janela do MaiSim no navegador (a que o Edge/Chrome abriu com --app=http://localhost:…, cujo ID tem
    ".localhost_") e põe nela o nosso AppUserModelID, o ícone, o comando e o nome de relançamento. Numa linha à parte: a
    janela leva alguns segundos para aparecer e o lançador segue subindo o Gecko."""
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    ctypes.windll.ole32.CoInitialize(None)
    novos = {5: AUMID, 3: f"{icone},0", 2: comando, 4: "MaiSim"}
    fim = time.time() + segundos
    while time.time() < fim:
        achadas = []

        def cada(hwnd, _):
            nome = ctypes.create_unicode_buffer(64)
            user32.GetClassNameW(wintypes.HWND(hwnd), nome, 64)
            if nome.value == "Chrome_WidgetWin_1" and user32.IsWindowVisible(wintypes.HWND(hwnd)):
                achadas.append(hwnd)
            return True
        user32.EnumWindows(ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)(cada), 0)
        marcou = False
        for hwnd in achadas:
            try:
                if ".localhost_" in (_propriedades_janela(hwnd) or ""):
                    _propriedades_janela(hwnd, novos)
                    marcou = True
            except OSError:
                pass
        if marcou:
            return
        time.sleep(0.5)


def migra_cache_antigo():
    """No Windows, até a 0.3.0-rc2 o cache ficava solto em %LOCALAPPDATA%\\MaiSim (junto do que mais houver lá); agora é
    %LOCALAPPDATA%\\MaiSim\\Cache. Na primeira vez, traz para lá só o que é do MaiSim (a recuperação do editor, as conversas,
    o lancador.json do que estiver no ar): o resto da pasta não é nosso e fica. O que estiver em uso fica onde está."""
    if not WIN or os.environ.get("MAISIM_PERFIL") != "produto":
        return
    import ler_config
    novo = ler_config.pasta_cache()
    if Path(os.environ.get("MAISIM_CACHE", "")) != novo or novo.exists():
        return
    novo.mkdir(parents=True, exist_ok=True)
    for nome in ("simu", "gecko", "logs", "lancador.json"):
        try:
            if (novo.parent / nome).exists():
                shutil.move(str(novo.parent / nome), str(novo / nome))
        except OSError:
            pass


def wsl():
    """Linux dentro do Windows (WSL): o kernel diz "microsoft" no osrelease."""
    try:
        return not WIN and "microsoft" in Path("/proc/sys/kernel/osrelease").read_text().lower()
    except OSError:
        return False


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
        self.parando = False                             # já derrubando: o ícone de novo espera e sobe outro
        self.pronto = False                              # o Gecko e o motor no ar: a página "Abrindo o MaiSim…" segue (/maisim/pronto)
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
            self.estado.write_text(json.dumps({"lancador": os.getpid(), "parando": self.parando, "pronto": self.pronto, "processos": {n: p.pid for n, p in self.subiu.items()}}))
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
        # a vigia do próprio Gecko (patch 0003) fecha os diálogos e anota em gecko/dialogos.txt (o simu lê); no Windows, sem
        # a tela virtual, a janela principal fica escondida (o MaiSim é a tela)
        extra = [f"-Dmaisim.dialogos={c / 'dialogos.txt'}"] + (["-Dmaisim.oculto=true"] if WIN else [])
        self.sobe("gecko", [self.java, *UTF8_JAVA, f"-Duser.home={c / 'home'}", "-Dpolyglot.js.nashorn-compat=true", *extra, "-jar", str(self.jar), str(modelo), "-p", str(pg)],
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
        self.sobe("motor", [self.java, *UTF8_JAVA, "-cp", os.pathsep.join([str(self.jar), str(m / "bin")]), "maisim.MaiSimMotor",
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

    def adota(self, anterior):
        """O que ficou no ar de um lançador que já saiu (o Gecko que ficou por um circuito sem salvar): passa a ser deste
        (Morto: só o pid), e o fim deste o derruba com a mesma regra. Só com o Gecko e o motor no ar (pids de outro dia, depois
        de reiniciar o computador, podem ser de outros programas)."""
        if vivo(anterior.get("lancador")) or not (no_ar(self.porta("GECKO")) and no_ar(self.porta("MOTOR"))):
            return
        self.subiu.update({n: Morto(pid) for n, pid in anterior.get("processos", {}).items()
                           if n in ("gecko", "motor", "xvfb", "x11vnc", "websockify") and vivo(pid)})

    def vida(self):
        """O sinal de vida das páginas (app/pagina.py): {"ultimo", "fechou", "abas"}; None sem a página."""
        try:
            return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{self.porta('PAGINA')}/maisim/vivo/ultimo", timeout=5).read())
        except (OSError, ValueError):
            return None

    def segura(self):
        """Um sinal de vida em nome da janela que vai abrir (conta 45 s, como uma página): o lançador no ar não desliga
        enquanto ela carrega."""
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{self.porta('PAGINA')}/maisim/vivo?id=lancador{os.getpid()}", timeout=5).read()
            return True
        except OSError:
            return False

    def sem_janela(self):
        """Fechou a janela do MaiSim? Depois de algum sinal de vida, nenhuma página aberta e 20 s desde o último sinal ou
        aviso de fechar (o recarregar e as trocas de página do MaiSim fecham uma e abrem outra na hora). Uma página à vista
        sem sinal sai em 45 s (app/pagina.py). Com uma rodada em andamento, não: espera ela acabar (a pausada não segura:
        parada, ela esperaria para sempre)."""
        v = self.vida()
        if not v or not v.get("ultimo") or v.get("abas"):
            return False
        if time.time() - max(v["ultimo"], v.get("fechou") or 0) < 20:
            return False
        try:
            r = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{self.porta('SIMU')}/maisim/simu/editor/rodada", timeout=10).read())
            if r.get("estado") in ("preparando", "rodando"):
                return False
        except (OSError, ValueError):
            pass
        return True

    def abre(self, pagina=""):
        """O navegador como app (uma janela só do MaiSim, sem abas): Edge, Chrome ou Chromium; senão o navegador padrão.
        pagina: "abrindo.html" na partida (a animação até o Gecko ficar pronto; antes, a tela inicial pedia o circuito ao
        motor que ainda subia e ficava com o erro "sem o motor do editor")."""
        url = f"http://localhost:{self.porta('PAGINA')}/{pagina}"
        escolhido = os.environ.get("MAISIM_NAVEGADOR")
        if escolhido == "nenhum":
            fala(f"no ar (sem abrir o navegador): {url}", f"running (browser not opened): {url}")
            return
        nomes = ["msedge", "chrome", "google-chrome", "chromium", "chromium-browser"]
        achados = [shutil.which(n) for n in nomes]
        if WIN:
            for base in (os.environ.get("ProgramFiles(x86)", ""), os.environ.get("ProgramFiles", ""), os.environ.get("LOCALAPPDATA", "")):
                for rel in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"):
                    achados.append(str(Path(base) / rel) if base and (Path(base) / rel).is_file() else None)
        elif wsl():                                  # no WSL, o navegador é o do Windows (o localhost do WSL2 chega nele)
            for rel in ("Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe"):
                for base in ("/mnt/c/Program Files", "/mnt/c/Program Files (x86)"):
                    achados.append(f"{base}/{rel}" if Path(base, rel).is_file() else None)
        nav = escolhido or next((a for a in achados if a), None)
        # no Linux, MAISIM_NAVEGADOR pode trazer opções depois do programa ('"/mnt/c/…/chrome.exe" --profile-directory="Profile 1"');
        # no Windows, é só o caminho (com espaços e barras invertidas, como antes)
        cmd = [nav] if nav and (not escolhido or WIN or Path(escolhido).is_file()) else shlex.split(nav or "")
        if cmd:
            subprocess.Popen(cmd + [f"--app={url}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            import webbrowser
            webbrowser.open(url)
        fala(f"aberto: {url}", f"opened: {url}")
        icone = RAIZ.parent / "maisim.ico"           # o do instalador ({app}\maisim.ico); sem ele (em desenvolvimento), nada muda
        if WIN and nav and icone.is_file():
            exe = Path(sys.executable).with_name("pythonw.exe")
            perfil = " --produto" if os.environ.get("MAISIM_PERFIL") == "produto" else ""
            comando = f'"{exe if exe.is_file() else sys.executable}" "{Path(__file__).resolve()}"{perfil} --abrir'
            threading.Thread(target=marca_janela, args=(icone, comando), daemon=True).start()

    def para(self, motivo=""):
        """Derruba o que este lançador subiu; o Gecko (e a tela dele) só sem circuito por salvar."""
        self.parando = True
        self.grava()
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
        r = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True, encoding="oem", errors="replace")
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
    import ler_config
    try:
        ler_config.aplica()
    except (ValueError, FileNotFoundError) as e:     # a porta da config pessoal que não serve, um perfil que falta
        arq = os.environ.get("MAISIM_CONFIG_PESSOAL") or (ler_config.arquivo_pessoal() if a.produto else ler_config.RAIZ / ".env")
        avisa(f"O MaiSim não abriu: {e}.\nAcerte em {arq} (MAISIM_PORTA=8100, por exemplo) e abra de novo.",
              f"MaiSim did not start: {e}.\nFix it in {arq} (MAISIM_PORTA=8100, for instance) and open it again.")
        return 1
    migra_cache_antigo()
    if a.parar:
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
    est = Path(os.environ["MAISIM_CACHE"]) / "lancador.json"
    try:
        anterior = json.loads(est.read_text())
    except (OSError, ValueError):
        anterior = {}
    lc = Lancador(a.sem_gecko)
    if a.abrir and vivo(anterior.get("lancador")) and no_ar(lc.porta("PAGINA")):
        if not anterior.get("parando") and lc.segura():   # o ícone de novo, com o MaiSim no ar: só a janela
            lc.abre()
            return 0
        fala("o MaiSim anterior está desligando; espero e abro de novo", "the previous MaiSim is shutting down; waiting to start again")
        espera(lambda: not vivo(anterior["lancador"]), 90)
    lc.adota(anterior)
    lc.grava()
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
        lc.abre("" if a.sem_gecko else "abrindo.html")   # a janela já abre; a tela inicial vem quando o Gecko estiver no ar
    if not a.sem_gecko:
        lc.gecko()
    lc.pronto = True                                     # (também se o Gecko falhou: a tela inicial mostra o erro)
    lc.grava()
    fala(f"no ar em http://localhost:{lc.porta('PAGINA')}/ — Ctrl+C (ou --parar) derruba o que subiu",
         f"running at http://localhost:{lc.porta('PAGINA')}/ — Ctrl+C (or --parar) stops what it started")
    pedido = lc.estado.with_name("lancador.parar")
    pedido.unlink(missing_ok=True)
    n = 0
    while True:                                          # o --parar (de outro terminal, ou o atalho "Desligar o MaiSim") pede aqui
        time.sleep(1)
        if pedido.exists():
            pedido.unlink(missing_ok=True)
            fim()
        n += 1
        if a.abrir and n % 5 == 0 and lc.sem_janela():   # a janela do MaiSim fechou (e nenhuma outra página dele aberta)
            fala("a janela do MaiSim fechou: desligando", "the MaiSim window was closed: shutting down")
            if not parar["ja"]:
                parar["ja"] = True
                lc.para(t(" (janela fechada)", " (window closed)"))
            return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
