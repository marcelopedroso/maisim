"""O serviço da placa do HIL (roda na placa: um Raspberry Pi ou outro Linux com python3 e gcc). Escuta o MaiSim do PC pela
rede, confere a chave e, para cada controlador que chega, sobe o controle_worker_c.py daqui com a conexão já aberta
(MAISIM_CTL_FD): o controle.c é compilado pelo gcc da placa e roda nela, e o Gecko segue no PC, uma amostra por vez (o
processador no laço). O tempo de cada maisim_passo, medido na própria placa, vai ao Scope como pil_texec_us.

  python3 simu/hil/placa.py --gera-chave     a chave nova em ~/.config/maisim_hil/chave (mostra a linha do .env do PC)
  python3 simu/hil/placa.py [--host IP] [--porta 7190] [--nucleos 3,2,1] [--prio 80]

--host: o IP em que a placa escuta (o padrão: o do Tailscale, `tailscale ip -4`); nunca 0.0.0.0 sem querer — quem tem a
chave compila e roda C aqui. --nucleos: um núcleo por controlador, na ordem (o 0 fica para o sistema; com isolcpus no
cmdline.txt, os isolados). Com permissão (root ou CAP_SYS_NICE), o worker roda em SCHED_FIFO; sem ela, no escalonador
normal (o controle.log da rodada diz qual). Se o PC some no meio (fechou, caiu a rede), o worker é encerrado.
"""
import argparse
import datetime
import json
import os
import platform
import select
import shutil
import subprocess
import sys
import threading

AQUI = os.path.dirname(os.path.abspath(__file__))
SIMU = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)
import ligacao  # noqa: E402

ARQ_CHAVE = os.path.expanduser("~/.config/maisim_hil/chave")
RODADAS = os.path.expanduser("~/.cache/maisim_hil/rodadas")
WORKERS = {"c": "controle_worker_c.py", "py": "controle_worker.py"}


def log(msg):
    print(f"{datetime.datetime.now():%H:%M:%S} {msg}", flush=True)


def gera_chave(arq):
    os.makedirs(os.path.dirname(arq), exist_ok=True)
    k = os.urandom(32).hex()
    fd = os.open(arq, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(k + "\n")
    print(f"chave nova em {arq}\nno .env do MaiSim no PC:\nMAISIM_HIL_CHAVE={k}")  # i18n-ok (CLI da placa)


def ip_tailscale():
    try:
        return subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=5).stdout.split()[0]
    except (OSError, IndexError, subprocess.SubprocessError):
        return None


def descricao(nucleos):
    """O que a placa responde ao "info" (o painel do MaiSim mostra)."""
    def le(arq):
        try:
            with open(arq) as f:
                return f.read().strip("\x00\n ")
        except OSError:
            return ""
    gcc = ""
    if shutil.which("gcc"):
        gcc = subprocess.run(["gcc", "-dumpfullversion"], capture_output=True, text=True, timeout=10).stdout.strip()
    return {"ok": True, "modelo": le("/proc/device-tree/model") or f"{platform.system()} {platform.machine()}",
            "maquina": platform.machine(), "python": platform.python_version(), "gcc": gcc, "nucleos": nucleos,
            "isolados": le("/sys/devices/system/cpu/isolated"), "versao": le(os.path.join(os.path.dirname(SIMU), "VERSION"))}


class Nucleos:
    """Um núcleo por controlador: o primeiro da lista que ninguém está usando (todos ocupados: o último)."""
    def __init__(self, lista):
        self.lista, self.usados, self.trava = lista, set(), threading.Lock()

    def pega(self):
        with self.trava:
            for n in self.lista:
                if n not in self.usados:
                    self.usados.add(n)
                    return n
            return self.lista[-1] if self.lista else None

    def solta(self, n):
        with self.trava:
            self.usados.discard(n)


def prepara_tempo_real(nucleo, prio):
    """No filho, antes do exec: o núcleo e, se der, o SCHED_FIFO (o que não deu vai ao controle.log da rodada)."""
    def f():
        if nucleo is not None:
            try:
                os.sched_setaffinity(0, {nucleo})
            except OSError as e:
                os.write(2, f"placa: sem afinidade ao núcleo {nucleo}: {e}\n".encode())  # i18n-ok (log da placa)
        if prio:
            try:
                os.sched_setscheduler(0, os.SCHED_FIFO, os.sched_param(prio))
            except OSError as e:
                os.write(2, f"placa: sem SCHED_FIFO ({e}); segue no escalonador normal\n".encode())  # i18n-ok (log da placa)
    return f


def vigia(fd, proc, prazo=3.0):
    """O PC fechou a conexão (fim da rodada, MaiSim fechado, rede caída): o worker sai sozinho ao ler o fim; se não sair
    (um laço infinito no controle.c, em SCHED_FIFO), é encerrado aqui. POLLRDHUP: vê o fim sem ler os dados do worker."""
    p = select.poll()
    p.register(fd, select.POLLRDHUP | select.POLLHUP | select.POLLERR)
    while proc.poll() is None:
        if p.poll(500):
            try:
                proc.wait(prazo)
            except subprocess.TimeoutExpired:
                proc.kill()
                log(f"pid {proc.pid}: o PC fechou a conexão e o controle não terminou: encerrado")  # i18n-ok (log da placa)
            return


def atende(ouv, conn, de, nucleos, prio, rodadas):
    try:
        ola = ouv.autentica(conn)
    except Exception as e:                               # a chave errada, um olá que não veio
        log(f"{de[0]}: conexão recusada ({type(e).__name__})")  # i18n-ok (log da placa)
        return
    if ola.get("versao") != ligacao.VERSAO:
        conn.send_bytes(json.dumps({"ok": False, "erro": f"versao {ola.get('versao')} != {ligacao.VERSAO}"}).encode())  # i18n-ok (protocolo)
        conn.close()
        return
    if ola.get("worker") == "info":
        conn.send_bytes(json.dumps(descricao(nucleos.lista)).encode())
        conn.close()
        return
    worker = WORKERS.get(ola.get("worker"))
    if worker is None:
        log(f"{de[0]}: olá inválido {ola}")  # i18n-ok (log da placa)
        conn.close()
        return
    pasta = os.path.join(rodadas, f"{datetime.datetime.now():%Y%m%d_%H%M%S_%f}")
    os.makedirs(pasta, exist_ok=True)
    nucleo = nucleos.pega()
    fd = conn.fileno()
    env = {**os.environ, "MAISIM_CTL_FD": str(fd), "MAISIM_PIL": "1"}
    env.pop("MAISIM_CTL_ENDERECO", None)
    if "MAISIM_CC" not in env and shutil.which("gcc"):   # o gcc da placa, não um tcc do sistema (o do aarch64 não faz .so, e
        env["MAISIM_CC"] = shutil.which("gcc")           # o cronômetro do PIL precisa do clock_gettime da libc de verdade)
    try:
        with open(os.path.join(pasta, "controle.log"), "w") as lg:
            try:
                proc = subprocess.Popen([sys.executable, "-I", os.path.join(SIMU, worker)], stdin=subprocess.DEVNULL,
                                        stdout=lg, stderr=lg, cwd=pasta, env=env, pass_fds=(fd,),
                                        preexec_fn=prepara_tempo_real(nucleo, prio))
            except OSError as e:
                log(f"{de[0]}: não subiu o {worker}: {e}")  # i18n-ok (log da placa)
                return
            log(f"{de[0]}: {worker} pid {proc.pid} no núcleo {nucleo} ({pasta})")  # i18n-ok (log da placa)
            vigia(fd, proc)
            rc = proc.wait()
        log(f"{de[0]}: pid {proc.pid} terminou (rc={rc})")  # i18n-ok (log da placa)
    finally:
        conn.close()
        nucleos.solta(nucleo)


def main():
    ap = argparse.ArgumentParser(description="o serviço da placa do HIL do MaiSim")  # i18n-ok (CLI da placa)
    ap.add_argument("--gera-chave", action="store_true")
    ap.add_argument("--chave", default=ARQ_CHAVE, help="o arquivo da chave")  # i18n-ok
    ap.add_argument("--host", default=None)
    ap.add_argument("--porta", type=int, default=ligacao.PORTA)
    ap.add_argument("--nucleos", default="3,2,1")
    ap.add_argument("--prio", type=int, default=80, help="a prioridade SCHED_FIFO (0: não tenta)")  # i18n-ok
    ap.add_argument("--rodadas", default=RODADAS, help="onde fica a pasta de cada rodada (o controle.log)")  # i18n-ok
    a = ap.parse_args()
    if a.gera_chave:
        gera_chave(a.chave)
        return
    if not os.path.exists(a.chave):
        sys.exit(f"sem chave em {a.chave}: rode {sys.argv[0]} --gera-chave")  # i18n-ok
    key = ligacao.chave(open(a.chave).read())
    host = a.host or ip_tailscale()
    if not host:
        sys.exit("não achei o IP do Tailscale: passe --host")  # i18n-ok
    nucleos = Nucleos([int(x) for x in a.nucleos.split(",") if x.strip()])
    ouv = ligacao.Ouvinte(host, a.porta, key)
    log(f"placa do HIL em {host}:{a.porta} (núcleos {nucleos.lista}, SCHED_FIFO {a.prio or 'não'})")  # i18n-ok
    try:
        while True:
            conn, de = ouv.aceita()
            threading.Thread(target=atende, args=(ouv, conn, de, nucleos, a.prio, a.rodadas), daemon=True).start()
    except KeyboardInterrupt:
        pass
    finally:
        ouv.fecha()


if __name__ == "__main__":
    main()
