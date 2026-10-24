"""Cliente do motor do editor (motor/src/maisim/MaiSimMotor.java, 127.0.0.1:6120): uma conexão, um pedido de cada vez."""
import re
import socket
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "config"))   # quem importa só o motor (um teste) acha o lingua
import lingua  # noqa: E402                    o idioma do pedido
AQUI = Path(__file__).resolve().parent
if Path(getattr(sys.modules.get("textos"), "__file__", "") or "/").resolve().parent != AQUI:   # o catálogo do simu, pelo caminho
    import importlib.util                                                                      # (nunca um outro "textos")
    _spec = importlib.util.spec_from_file_location("textos", AQUI / "textos.py")
    _textos = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_textos)                     # registra o catálogo (lingua.registra)
    if "textos" not in sys.modules:
        sys.modules["textos"] = _textos


# os erros do próprio motor (MaiSimMotor.java) vêm em inglês, como as exceções do Gecko e do Java; os dele passam pelo
# dicionário (o texto do Gecko não: é dele, e vai como veio)
ERROS_MOTOR = ((re.compile(r"SETM expects name:parameter:value, got (\S*)"), "motor.setm_formato"),
               (re.compile(r"unknown command: (\S*)"), "motor.comando_desconhecido"))


def traduz_erro(texto):
    for padrao, chave in ERROS_MOTOR:
        m = padrao.search(texto)
        if m:
            return lingua.tr(chave, x=m.group(1))
    return texto


class ErroMotor(Exception):
    """Um erro para a página. codigo: o que a página confere (nunca o texto, que muda com o idioma); extra: mais campos na resposta."""
    def __init__(self, msg="", codigo=None, **extra):
        super().__init__(msg)
        self.extra = dict(extra, **({"codigo": codigo} if codigo else {}))


class Motor:
    def __init__(self, porta):
        self.porta, self.f, self.trava = porta, None, threading.RLock()   # RLock: o ao_conectar manda pedidos de dentro do cmd
        self.vigia, self.janelas, self._desde, self._olho = None, [], None, None
        # ao_conectar: chamada na 1ª conexão com cada motor (um motor novo pode ter um Gecko novo) e de novo, a cada pedido,
        # enquanto conferir for True (quem é chamado o desliga quando conferiu); pode recusar o pedido (ErroMotor)
        self.ao_conectar, self.conferir, self._conferindo = None, False, False

    def _olha(self):
        """Enquanto um pedido demora (mais de 2 s), a vigia olha a tela do Gecko a cada segundo: uma janela de erro aberta no
        meio do pedido o deixaria parado para sempre (o Gecko espera o OK; ninguém vê a tela dele). O que ela fecha fica em
        self.janelas, para o servidor dizer à página."""
        while True:
            time.sleep(1)
            desde = self._desde
            if desde is not None and self.vigia and time.monotonic() - desde > 2:
                try:
                    self.janelas += self.vigia()
                except Exception:                    # sem a tela, sem a libXtst: o pedido segue como antes
                    pass

    def cmd(self, linha):
        """Manda uma linha e devolve o que vem depois de "OK "; "ERR …" vira ErroMotor."""
        if "\n" in linha or "\r" in linha:
            raise ErroMotor(lingua.tr("motor.quebra_de_linha"))
        if self.vigia and self._olho is None:
            self._olho = lingua.thread(self._olha)
            self._olho.start()
        with self.trava:
            for tentativa in (1, 2):
                try:
                    if self.f is None:
                        s = socket.create_connection(("127.0.0.1", self.porta), timeout=60)
                        self.f = s.makefile("rw", encoding="utf-8")
                        self.conferir = True
                    if self.conferir and self.ao_conectar and not self._conferindo:   # antes do pedido: o servidor confere o Gecko
                        self._conferindo = True
                        try:
                            self.ao_conectar()
                        finally:
                            self._conferindo = False
                        if self.f is None:                     # a conexão caiu durante a conferência
                            raise ConnectionError(lingua.tr("motor.fechou_conexao"))
                    self.f.write(linha + "\n")
                    self.f.flush()
                    self._desde = time.monotonic()
                    try:
                        r = self.f.readline()
                    finally:
                        self._desde = None
                    if not r:
                        raise ConnectionError(lingua.tr("motor.fechou_conexao"))
                    break
                except (OSError, ConnectionError) as e:
                    self.f = None
                    if tentativa == 2:
                        raise ErroMotor(lingua.tr("motor.sem_motor", erro=e))
        r = r.rstrip("\n")
        if r.startswith("OK"):
            return r[3:]
        raise ErroMotor(traduz_erro(r[4:] if r.startswith("ERR ") else r))
