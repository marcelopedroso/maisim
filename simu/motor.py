"""Cliente do motor do editor (motor/src/maisim/MaiSimMotor.java, 127.0.0.1:6120): uma conexão, um pedido de cada vez."""
import socket
import threading
import time


class ErroMotor(Exception):
    pass


class Motor:
    def __init__(self, porta):
        self.porta, self.f, self.trava = porta, None, threading.Lock()
        self.vigia, self.janelas, self._desde, self._olho = None, [], None, None

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
            raise ErroMotor("comando com quebra de linha")
        if self.vigia and self._olho is None:
            self._olho = threading.Thread(target=self._olha, daemon=True)
            self._olho.start()
        with self.trava:
            for tentativa in (1, 2):
                try:
                    if self.f is None:
                        s = socket.create_connection(("127.0.0.1", self.porta), timeout=60)
                        self.f = s.makefile("rw", encoding="utf-8")
                    self.f.write(linha + "\n")
                    self.f.flush()
                    self._desde = time.monotonic()
                    try:
                        r = self.f.readline()
                    finally:
                        self._desde = None
                    if not r:
                        raise ConnectionError("o motor fechou a conexão")
                    break
                except (OSError, ConnectionError) as e:
                    self.f = None
                    if tentativa == 2:
                        raise ErroMotor(f"sem o motor do editor (o Gecko do MaiSim está no ar? gecko/sobe.sh): {e}")
        r = r.rstrip("\n")
        if r.startswith("OK"):
            return r[3:]
        raise ErroMotor(r[4:] if r.startswith("ERR ") else r)
