"""O login pelo terminal de uma IA (o Gemini CLI, o Antigravity CLI): o MaiSim abre a ferramenta interativa num terminal (pty),
responde aos menus conhecidos, mostra na tela o link que ela imprime e repassa o código que a pessoa colar. A credencial é
gravada pela própria ferramenta; o MaiSim só acompanha o terminal e fecha a ferramenta quando o login termina.

Cada peça diz: o comando e o ambiente do login (login_argv, login_env), o link (LOGIN_URL), as respostas automáticas
(LOGIN_RESPOSTAS: [(expressão, teclas)], cada uma uma vez), os erros (LOGIN_ERROS), a forma do código (LOGIN_CODIGO), e
quando terminou (login_terminou(texto) → (ok, conta) ou None para continuar esperando)."""
import os
import re
import select
import signal
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

import fcntl
import termios

for _p in (Path(__file__).resolve().parents[2] / "config", Path(__file__).resolve().parents[1]):   # lingua e textos (o servidor já os põe)
    if str(_p) not in sys.path:
        sys.path.append(str(_p))
import lingua  # noqa: E402                    as mensagens no idioma do pedido
import textos  # noqa: E402,F401

ANSI = re.compile(r"\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[=>()][0-9A-Za-z]?")


class LoginPorTerminal:
    LOGIN_URL = None
    LOGIN_RESPOSTAS = ()
    LOGIN_ERROS = None
    LOGIN_CODIGO = re.compile(r"[A-Za-z0-9/_.~\-]{8,512}")
    LOGIN_ESPERA_LINK = 30                                # s, até a ferramenta mostrar o link

    def _login_init(self):
        self._login = {}
        self._trava = threading.Lock()

    # ---- o que cada peça define
    def login_argv(self):
        raise NotImplementedError

    def login_env(self):
        return self.ambiente(TERM="xterm-256color")

    def login_terminou(self, texto):
        """(ok, conta) quando o login acabou bem; None enquanto não."""
        return None

    def ao_entrar(self, conta):
        """Depois de um login bom (a peça guarda o que precisar, nunca a credencial)."""

    # ---- o estado do login em andamento
    def login_estado(self):
        with self._trava:
            return {k: self._login.get(k) for k in ("andamento", "url", "erro", "mensagem", "desde")} if self._login else None

    def entra(self):
        if not self.instalado():
            raise ValueError(lingua.tr("ia_login.nao_instalada", nome=self.nome))
        if self.logado():
            return self.estado()
        with self._trava:
            p = self._login.get("proc")
            em_andamento = p is not None and p.poll() is None
            if not em_andamento:
                self._prepara_login()
                vazio = self.pasta / "maisim" / "login"           # o cwd do login: uma pasta vazia (nada a ler ali)
                vazio.mkdir(mode=0o700, parents=True, exist_ok=True)
                mestre, escravo = os.openpty()
                fcntl.ioctl(escravo, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 2000, 0, 0))   # largo: o link numa linha só
                try:
                    proc = subprocess.Popen(self.login_argv(), stdin=escravo, stdout=escravo, stderr=escravo, cwd=str(vazio),
                                            start_new_session=True, env=self.login_env())
                finally:
                    os.close(escravo)
                self._login.clear()
                self._login.update(proc=proc, fd=mestre, andamento=True, desde=time.time(), url=None, erro=None, mensagem=None)
                lingua.thread(self._le_login, proc, mestre).start()   # as mensagens no idioma de quem pediu o login
        if not em_andamento:
            for _ in range(self.LOGIN_ESPERA_LINK * 10):
                with self._trava:
                    if self._login.get("url") or not self._login.get("andamento"):
                        break
                time.sleep(0.1)
        return self.estado()

    def _prepara_login(self):
        self.pasta.mkdir(mode=0o700, parents=True, exist_ok=True)

    def _le_login(self, proc, fd):
        """Lê o terminal do login: as respostas aos menus, o link e, no fim, o resultado. Guarda só o link, a conta e as
        mensagens de erro (o código colado, que o terminal ecoa, não sai daqui)."""
        texto, respondidas, fim = "", set(), None
        while True:
            try:
                r, _, _ = select.select([fd], [], [], 0.3)
                bloco = os.read(fd, 65536) if r else b""
            except OSError:
                bloco = None
            if bloco is None or (not bloco and proc.poll() is not None):
                break
            if bloco:
                texto = (texto + bloco.decode(errors="replace"))[-60000:]
            limpo = ANSI.sub("", texto)
            for k, (pad, teclas) in enumerate(self.LOGIN_RESPOSTAS):   # os menus conhecidos (uma vez cada)
                if k not in respondidas and re.search(pad, limpo):
                    respondidas.add(k)
                    time.sleep(0.4)
                    try:
                        os.write(fd, teclas)
                    except OSError:
                        pass
            m = self.LOGIN_URL.search(limpo) if self.LOGIN_URL else None
            erro = self.LOGIN_ERROS.search(limpo) if self.LOGIN_ERROS else None
            fim = self.login_terminou(limpo)
            with self._trava:
                if self._login.get("proc") is not proc:
                    break
                if m and not self._login.get("url"):
                    self._login["url"] = m.group(0)
                if erro and not fim:
                    txt = erro.group(1).strip() if erro.groups() else erro.group(0).strip()
                    if re.search(r"failed, reason:\s*$", txt):         # o Node não disse o motivo: foi a rede
                        txt = lingua.tr("ia_login.sem_rede", txt=txt)
                    if "invalid_grant" in txt:                          # o código não valeu (errado, incompleto ou velho)
                        txt = lingua.tr("ia_login.invalid_grant")
                    self._login["erro"] = txt[:300]
            if fim or erro:
                break
        try:
            os.killpg(proc.pid, signal.SIGTERM)              # a ferramenta interativa continuaria aberta: o MaiSim fecha
        except OSError:
            pass
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except OSError:
                pass
        try:
            os.close(fd)
        except OSError:
            pass
        ok, conta = (fim or (False, None))
        if ok:
            self.ao_entrar(conta)
        with self._trava:
            if self._login.get("proc") is not proc:
                return
            self._login.update(andamento=False, proc=None, fd=None)
            if ok:
                self._login.update(mensagem=lingua.tr("ia_login.feito"), erro=None)
            elif not self._login.get("erro"):
                self._login["erro"] = lingua.tr("ia_login.sem_entrar", codigo=proc.returncode)

    def codigo(self, codigo):
        codigo = re.sub(r"\s+", "", str(codigo or ""))
        if not self.LOGIN_CODIGO.fullmatch(codigo):
            raise ValueError(lingua.tr("ia_login.cole_codigo"))
        with self._trava:
            p, fd = self._login.get("proc"), self._login.get("fd")
            if p is None or p.poll() is not None or fd is None:
                raise ValueError(lingua.tr("ia_login.sem_andamento", nome=self.nome))
            if not self._login.get("url"):
                raise ValueError(lingua.tr("ia_login.sem_link", nome=self.nome))
            os.write(fd, codigo.encode() + b"\r")
        for _ in range(450):                                 # a troca do código leva uns segundos
            with self._trava:
                if self._login.get("proc") is not p:
                    break
            time.sleep(0.1)
        return self.estado()

    def cancela(self, motivo=None):
        motivo = lingua.tr("ia_login.cancelado") if motivo is None else motivo
        with self._trava:
            p = self._login.get("proc")
            if p is None:
                return
            self._login.update(proc=None, andamento=False, erro=motivo)
        try:
            os.killpg(p.pid, signal.SIGTERM)
        except OSError:
            pass
