"""Publicador do scope: o run.py (com --scope URL) entrega uma amostra por passo de controle; uma thread envia em lotes
ao servidor (POST /publicar), para não atrasar a simulação; ao fim grava tudo em scope_<tag>.npz (modo Comparar).
Se o servidor não estiver de pé, a simulação segue e só o arquivo é gravado."""
import json
import threading
import time
import urllib.request

import numpy as np

TWO_PI = 2 * np.pi


def mascaras_pwm(m, ph, act, t0, fc, dt, n, fb=False):
    """Padrão de chaveamento comandado de cada SM numa janela de controle, na mesma conta da planta
    (plant_trifasico._sw_real): portadora própria comparada com m no meio de cada passo fino. Devolve, por SM, um
    inteiro cujo bit i é 1 se o SM está inserido (+1) no passo i, e outro para −1 (só no FB). m, ph, act: K × N."""
    i = np.arange(n)
    tm = t0 + (i + 0.5) * dt
    x = fc * tm[:, None, None] + np.asarray(ph)[None] / TWO_PI
    frac = x - np.floor(x)
    m = np.asarray(m)[None]
    if fb:
        c = 4.0 * np.abs(frac - 0.5) - 1.0
        s = (m > c).astype(int) - (-m > c).astype(int)
    else:
        s = (m > 2.0 * np.abs(frac - 0.5)).astype(int)
    s = s * np.asarray(act)[None]
    pesos = (1 << i)[:, None, None]
    return (pesos * (s == 1)).sum(axis=0), (pesos * (s == -1)).sum(axis=0)


class PublicadorScope:
    def __init__(self, url, meta, periodo=0.25):
        self.url = url.rstrip("/") + "/publicar"
        self.meta = meta
        self.periodo = periodo
        self.tudo = {}                     # para o .npz
        self.lote = {}
        self.trava = threading.Lock()
        self.vivo = True
        self.avisou = False
        self._post({"tipo": "inicio", "meta": meta})
        self.th = threading.Thread(target=self._laco, daemon=True)   # i18n-ok (sem texto; o run.py de fora importa este arquivo sem o config/)
        self.th.start()

    def _post(self, obj):
        try:
            req = urllib.request.Request(self.url, data=json.dumps(obj, separators=(",", ":")).encode(),
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=5).read()
        except Exception as e:             # o scope é opcional: avisa uma vez e segue
            if not self.avisou:
                print(f"scope: não consegui publicar em {self.url} ({e}); a rodada segue e o .npz é gravado no fim")   # i18n-ok (log)
                self.avisou = True

    def amostra(self, canais):
        """canais: {nome: valor} (escalares) — uma amostra por passo de controle."""
        with self.trava:
            for k, v in canais.items():
                v = float(v)
                self.lote.setdefault(k, []).append(v)
                self.tudo.setdefault(k, []).append(v)

    def amostra_fina(self, formas):
        """formas: {nome: vetor de amostras a cada passo fino, contíguas às anteriores} — guardadas como fino_<nome>."""
        with self.trava:
            for k, v in formas.items():
                v = [float(x) for x in v]
                self.lote.setdefault("fino_" + k, []).extend(v)
                self.tudo.setdefault("fino_" + k, []).extend(v)

    def _envia(self):
        with self.trava:
            lote, self.lote = self.lote, {}
        if lote:
            self._post({"tipo": "dados", "lote": {k: [None if x != x else round(x, 6) for x in v] for k, v in lote.items()}})

    def _laco(self):
        while self.vivo:
            time.sleep(self.periodo)
            self._envia()

    def fecha(self, arquivo=None):
        self.vivo = False
        self.th.join(timeout=5)
        self._envia()
        self._post({"tipo": "fim"})
        if arquivo is not None:
            np.savez_compressed(arquivo, meta=np.array(json.dumps(self.meta, ensure_ascii=False)),
                                **{k: np.array(v) for k, v in self.tudo.items()})
            print("scope gravado:", arquivo)
