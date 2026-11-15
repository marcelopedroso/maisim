"""A ligação do MaiSim com a placa do HIL (o controle em C rodando numa placa de verdade, um Raspberry Pi ou outro Linux, e o
Gecko no PC: o processador no laço). É a mesma multiprocessing.connection que o servidor já usa com os controladores (um
pedido e uma resposta em JSON, send_bytes/recv_bytes, com a chave conferida por HMAC nos dois sentidos), só que por TCP e
com o TCP_NODELAY (o laço é um pedido e uma resposta por Ts: o Nagle seguraria a resposta pequena).

Depois da chave, o PC manda um "olá" ({"worker": "c" | "py" | "info", "versao": 1}): com "c" ou "py", a placa sobe o
controle_worker dela com esta conexão (MAISIM_CTL_FD) e, dali em diante, é o protocolo de sempre (carrega, passo,
parametros); com "info", ela responde o que é (modelo, gcc, núcleos) e fecha.

A placa é da máquina, não do circuito: o endereço e a chave ficam no .env da raiz (MAISIM_HIL=host:porta,
MAISIM_HIL_CHAVE=<hex>); o circuito só diz se o controle em C dele roda na placa (o "c.placa" do controle).
"""
import json
import os
import socket
from multiprocessing.connection import Connection, answer_challenge, deliver_challenge

VERSAO = 1
PORTA = 7190


def endereco(txt=None):
    """MAISIM_HIL ("host:porta" ou só "host") → (host, porta), ou None se não houver placa configurada."""
    txt = (txt if txt is not None else os.environ.get("MAISIM_HIL", "")).strip()
    if not txt:
        return None
    if ":" in txt:
        host, porta = txt.rsplit(":", 1)
        return host, int(porta)
    return txt, PORTA


def chave(txt=None):
    txt = (txt if txt is not None else os.environ.get("MAISIM_HIL_CHAVE", "")).strip()
    if not txt:
        raise ValueError("MAISIM_HIL_CHAVE")  # i18n-ok (o nome da variável)
    return bytes.fromhex(txt)


def _sem_nagle(s):
    s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)


def conecta(worker, ende=None, key=None, prazo=10):
    """O lado do PC: liga à placa, confere a chave e manda o olá ("c", "py" ou "info"); devolve a Connection."""
    host, porta = ende or endereco()
    s = socket.create_connection((host, porta), timeout=prazo)
    _sem_nagle(s)
    s.settimeout(None)
    c = Connection(s.detach())
    try:
        k = key if key is not None else chave()
        answer_challenge(c, k)                      # na ordem do Client do multiprocessing
        deliver_challenge(c, k)
        c.send_bytes(json.dumps({"worker": worker, "versao": VERSAO}).encode())
    except BaseException:
        c.close()
        raise
    return c


def info(ende=None, key=None, prazo=3):
    """O que a placa diz de si: {"modelo", "gcc", "python", "nucleos", "isolados", "versao"}. Prazo curto: o painel pergunta
    (uma placa desligada, sem resposta nenhuma da rede, não pode prender o pedido)."""
    c = conecta("info", ende, key, prazo)
    try:
        if not c.poll(prazo):
            raise TimeoutError
        return json.loads(c.recv_bytes(65536).decode())
    finally:
        c.close()


class Ouvinte:
    """O lado da placa: escuta em (host, porta) e aceita só quem tem a chave."""
    def __init__(self, host, porta, key):
        self.key = key
        self.s = socket.create_server((host, porta))

    def aceita(self):
        """(Connection, endereço do PC), sem conferir nada ainda: a chave e o olá vêm no autentica(), na thread de cada
        conexão (quem conecta e não fala não prende as outras)."""
        s, de = self.s.accept()
        _sem_nagle(s)
        return Connection(s.detach()), de

    def autentica(self, c):
        """O olá de quem tem a chave; a chave errada levanta AuthenticationError (e a conexão é fechada)."""
        try:
            deliver_challenge(c, self.key)
            answer_challenge(c, self.key)
            if not c.poll(10):
                raise TimeoutError
            ola = json.loads(c.recv_bytes(4096).decode())
        except BaseException:
            c.close()
            raise
        return ola

    def fecha(self):
        self.s.close()
