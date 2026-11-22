"""(Re)sobe só o simulador da instância de teste, no Linux e no Windows: o mesmo que o reinicia_servidor_teste.sh (que
continua sendo o do Linux: este o chama lá). No Windows: derruba o processo que escuta na porta do simulador do perfil de
teste, prepara a pasta de teste (os circuitos congelados, a língua do zero) e sobe o simu/servidor.py com o perfil de
teste, como o lançador o subiu. O Gecko e o motor ficam.
uso: python reinicia.py"""
import os, re, shutil, socket, subprocess, sys, time
from pathlib import Path

V = Path(__file__).resolve().parent
RAIZ = V.parents[1]


def no_ar(porta):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", porta)) == 0


def pid_na_porta(porta):
    r = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True).stdout
    for l in r.splitlines():
        c = l.split()
        if len(c) >= 5 and c[3].upper() == "LISTENING" and re.search(rf"[:.]{porta}$", c[1]):
            return int(c[4])
    return None


def main():
    if os.name != "nt":
        return subprocess.run(["bash", str(V / "reinicia_servidor_teste.sh")]).returncode
    sys.path.insert(0, str(RAIZ / "config"))
    import ler_config
    cfg = ler_config.carrega("teste")
    porta = int(cfg["MAISIM_PORTA_SIMU"])
    pid = pid_na_porta(porta)
    if pid:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
    for _ in range(40):
        if not no_ar(porta):
            break
        time.sleep(0.3)
    dados = Path(cfg["MAISIM_DADOS"])
    (dados / "lingua.txt").unlink(missing_ok=True)
    circ = Path(cfg.get("MAISIM_SALVOS") or dados / "circuitos")
    circ.mkdir(parents=True, exist_ok=True)
    Path(cfg["MAISIM_CLAUDE_DIR"]).mkdir(parents=True, exist_ok=True)
    for f in [*(V / "dados").glob("exemplo_controle_*.*"), V / "dados" / "exemplo_cascata_hb.ipes"]:
        shutil.copy(f, circ / f.name)
    amb = {k: x for k, x in os.environ.items() if not k.startswith("MAISIM_")}
    amb.update(cfg)
    log = open(dados / "simu.log", "ab")
    subprocess.Popen([sys.executable, str(RAIZ / "simu" / "servidor.py")], cwd=RAIZ, env=amb, stdin=subprocess.DEVNULL,
                     stdout=log, stderr=subprocess.STDOUT,
                     creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS)
    for _ in range(60):
        if no_ar(porta):
            return 0
        time.sleep(0.5)
    print(f"reinicia: o simulador de teste não voltou na porta {porta} (veja {dados / 'simu.log'})")
    return 1


if __name__ == "__main__":
    sys.exit(main())
