"""O teste de fumaça do instalador do Windows, num Windows de verdade (o CI: o job "windows" do pacotes.yml). O instalador é
montado no Linux (pacote/windows/monta.sh); aqui ele roda onde vai ser usado:
  1. instala o MaiSim-Setup-<versão>.exe em silêncio, como uma instalação nova (a pasta do programa, a porta e a pasta dos
     circuitos padrão) e confere o que ficou: o Python, o Java, o TinyCC, o lançador, o atalho e o maisim.env com a porta;
  2. sobe o MaiSim instalado (o Python, o Java e o Gecko de dentro dele), sem navegador, e espera ele dizer que está no ar;
  3. faz o mesmo que o do Linux (pacote/fumaca_api.py): roda o buck, gera um PDF no Figuras e roda o controle em C;
  4. para (--parar) e confere as sete portas livres.
Não desinstala: o desinstalador pergunta dos circuitos numa caixa de mensagem, que ninguém responde no CI.
Precisa: um Python do sistema (só a biblioteca padrão). Só no Windows. Os registros ficam em fumaca-logs/ (o CI os guarda).
uso: python pacote\\windows\\fumaca.py <o instalador .exe, ou a pasta onde ele está>"""
import glob, os, re, shutil, socket, subprocess, sys, time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
LOGS = Path("fumaca-logs")
for saida in (sys.stdout, sys.stderr):
    saida.reconfigure(encoding="utf-8", errors="replace")


def fala(msg):
    print(f"fumaça: {msg}", flush=True)


def rabo(arq, n=30):
    try:
        linhas = Path(arq).read_text(encoding="utf-8", errors="replace").splitlines()[-n:]
    except OSError:
        return
    print(f"--- {arq}\n" + "\n".join(linhas), flush=True)


def falhou(msg, *arqs):
    fala(f"FALHOU — {msg}")
    cache = Path(os.environ.get("LOCALAPPDATA", "")) / "MaiSim" / "Cache" / "logs"
    for a in [*arqs, *sorted(cache.glob("*.log"))]:
        rabo(a)
        try:
            shutil.copy(a, LOGS / Path(a).name)
        except OSError:
            pass
    sys.exit(1)


def no_ar(porta):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", porta)) == 0


if os.name != "nt":
    sys.exit("fumaça: este teste é do Windows (no Linux: pacote/linux/fumaca.sh)")
LOGS.mkdir(exist_ok=True)
alvo = Path(sys.argv[1])
instalador = alvo if alvo.is_file() else Path((sorted(glob.glob(str(alvo / "MaiSim-Setup-*.exe"))) or [alvo / "MaiSim-Setup-?.exe"])[0])
if not instalador.is_file():
    sys.exit(f"fumaça: não achei o instalador em {alvo}")
programa = Path(os.environ["LOCALAPPDATA"]) / "Programs" / "MaiSim"
config = Path(os.environ["APPDATA"]) / "MaiSim" / "maisim.env"
fala(f"Windows {sys.getwindowsversion().major}.{sys.getwindowsversion().build}, Python {sys.version.split()[0]}; {instalador.name} ({instalador.stat().st_size >> 20} MB)")

# 1. a instalação silenciosa (uma instalação nova: sem maisim.env de antes)
log_inst = LOGS / "instalador.log"
t0 = time.time()
r = subprocess.run([str(instalador), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-", "/LANG=en", f"/LOG={log_inst.resolve()}"], timeout=900)
if r.returncode != 0:
    falhou(f"o instalador saiu com o código {r.returncode}", log_inst)
falta = [p for p in ("python/python.exe", "python/pythonw.exe", "jre/bin/java.exe", "maisim/app/lancador.py", "maisim/tcc/tcc.exe",
                     "maisim/gecko/build/gecko-lote.jar", "maisim.ico") if not (programa / p).exists()]
if falta:
    falhou(f"instalou, mas falta em {programa}: {falta}", log_inst)
atalho = Path(os.environ["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "MaiSim" / "MaiSim.lnk"
txt = config.read_text(encoding="utf-8", errors="replace") if config.exists() else ""
m = re.search(r"^MAISIM_PORTA=(\d+)\s*$", txt, re.M)
if not (m and re.search(r"^MAISIM_DADOS=.+$", txt, re.M)):
    falhou(f"o instalador não gravou a porta e a pasta dos circuitos em {config}: {txt!r}", log_inst)
if not atalho.exists():
    falhou(f"o instalador não criou o atalho do menu Iniciar ({atalho})", log_inst)
porta = int(m.group(1))
fala(f"instalou em {time.time() - t0:.0f} s em {programa}; porta {porta}; o atalho e o maisim.env no lugar")

# 2. o MaiSim instalado, sem navegador (o que o atalho roda, com o python.exe no lugar do pythonw.exe para ver a saída)
amb = {k: v for k, v in os.environ.items() if not k.startswith("MAISIM_")}
amb.update(MAISIM_NAVEGADOR="nenhum", PYTHONUNBUFFERED="1")
lanc = [str(programa / "python" / "python.exe"), str(programa / "maisim" / "app" / "lancador.py"), "--produto"]
log_lanc = LOGS / "lancador.log"
t0 = time.time()
with open(log_lanc, "wb") as f:
    proc = subprocess.Popen(lanc, cwd=programa, stdin=subprocess.DEVNULL, stdout=f, stderr=subprocess.STDOUT, env=amb,
                            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
subiu = None
while time.time() - t0 < 360 and proc.poll() is None:
    saida = log_lanc.read_text(encoding="utf-8", errors="replace")
    subiu = re.search(r"(?:no ar em|running at) http://localhost:(\d+)/", saida)
    if subiu or re.search(r"Traceback|não ficou pronto|did not get ready", saida):
        break
    time.sleep(2)
if not subiu:
    if proc.poll() is None:
        subprocess.run(lanc + ["--parar", "--forcar"], env=amb, timeout=120)
    falhou(f"o MaiSim instalado não subiu em {time.time() - t0:.0f} s", log_lanc, log_inst)
if int(subiu.group(1)) != porta:
    falhou(f"subiu na porta {subiu.group(1)}, e o instalador gravou a {porta}", log_lanc)
fala(f"o MaiSim instalado subiu em {time.time() - t0:.0f} s (http://localhost:{porta}/)")

# 3. o mesmo que o do Linux: o buck, o PDF do Figuras e o controle em C
ok = subprocess.run([sys.executable, "-X", "utf8", str(RAIZ / "pacote" / "fumaca_api.py"), str(porta), str(RAIZ)]).returncode

# 4. para e confere as sete portas livres
log_parar = LOGS / "parar.log"
with open(log_parar, "wb") as f:
    subprocess.run(lanc + ["--parar"], stdout=f, stderr=subprocess.STDOUT, env=amb, timeout=180)
fim = time.time() + 40
while time.time() < fim and (proc.poll() is None or any(no_ar(p) for p in range(porta, porta + 7))):
    time.sleep(1)
sobra = [p for p in range(porta, porta + 7) if no_ar(p)]
if ok != 0 or sobra or proc.poll() is None:
    if proc.poll() is None:
        subprocess.run(lanc + ["--parar", "--forcar"], env=amb, timeout=120)
    falhou(f"a API: {ok}; portas ainda no ar: {sobra}; o lançador {'ainda no ar' if proc.poll() is None else 'saiu'}", log_lanc, log_parar)
fala("ok — instalou, subiu, rodou o buck, gerou o PDF, rodou o controle em C e parou")
