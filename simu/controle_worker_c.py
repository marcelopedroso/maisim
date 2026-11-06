"""Processo de UM controlador em C (o SIL: o .c dele rodando dentro da simulação, no lugar do .py). Fala o mesmo protocolo
do controle_worker.py (o servidor não sabe a diferença: os atrasos, os eventos, a rede entre os controladores e o passo a
passo do Gecko ficam iguais): {"op": "carrega"} gera o maisim_sinais.h com os sinais deste controlador, compila o .c dele
e os módulos (com o calço controle_c/maisim_sil.c) numa biblioteca na pasta da rodada (com vários, na subpasta c_<nome>)
e chama maisim_iniciar; {"op": "passo"} entrega as mensagens que chegaram (maisim_recebeu), chama maisim_passo e devolve
as atuações, o que foi ao scope (com o nome da instância na frente, como no Python) e o que ele mandou (maisim_envia);
{"op": "parametros"} troca p[...]. Um erro de compilação volta com o arquivo e a linha, como o erro do Python. O
contrato está em controle_c/maisim_controle.h.

O compilador: MAISIM_CC, o TinyCC que vem com o MaiSim (tcc/ na raiz), o tcc do sistema, o gcc ou o cc — o que houver.
Com gcc/cc, -ffp-contract=off e sem o sincos() do gcc: as contas na mesma ordem dão o mesmo double do Python (sem FMA nem
sincos trocando o arredondamento).
"""
import ctypes
import json
import math
import os
import shutil
import subprocess
import sys
import traceback

_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(os.path.dirname(_AQUI), "config"), _AQUI]
import lingua  # noqa: E402
import textos  # noqa: E402,F401
import sinais_c  # noqa: E402
del sys.path[:2]
LINGUA = os.environ.get("MAISIM_LINGUA") or "pt"
DIR_C = sinais_c.DIR_C

# o protocolo (no modo pipe: o stdout) fica num descritor só dele, e o fd 1 passa a ser o log (o stderr): um printf() do
# controle.c, que escreve direto no fd 1, vai para o controle.log em vez de virar uma "resposta" (Codex, #225)
saida = os.fdopen(os.dup(1), "w", buffering=1)
os.dup2(2, 1)
sys.stdout = sys.stderr
cfg = {"nome": "controle", "arquivo": "controle.c", "atuacoes": None, "nomes": [], "prefixar": False, "varios": False}
lib = estado = p_arr = None
nomes = {"m": [], "p": [], "u": []}
real = ctypes.c_double


class ErroC(Exception):
    def __init__(self, msg, arquivo=None, linha=None):
        super().__init__(msg)
        self.arquivo, self.linha = arquivo or cfg["arquivo"], linha


def gera_sinais_h(sinais):
    try:
        return sinais_c.gera_sinais_h(sinais)
    except sinais_c.NomeRepetido as e:
        raise ErroC(lingua.tr("worker_c.nome_repetido", macro=e.macro, a=e.a, b=e.b), "maisim_sinais.h")


def compila(fontes, sinais, precisao):
    """Grava os fontes na pasta da rodada (o cwd), gera o .h e compila a biblioteca; devolve o ctypes.CDLL."""
    for arq, cod in fontes.items():
        with open(arq, "w", encoding="utf-8") as f:
            f.write(cod)
    with open("maisim_sinais.h", "w", encoding="utf-8") as f:
        f.write(gera_sinais_h(sinais))
    shutil.copy(os.path.join(DIR_C, "maisim_controle.h"), "maisim_controle.h")
    shutil.copy(os.path.join(DIR_C, "maisim_sil.c"), "maisim_sil.c")
    cc = sinais_c.compilador()
    if not cc:
        raise ErroC(lingua.tr("worker_c.sem_compilador"))
    cc, e_tcc = cc
    saida_lib = os.path.abspath("controle_c.dll" if os.name == "nt" else "controle_c.so")
    if os.path.exists(saida_lib):
        os.remove(saida_lib)
    cs = sorted(a for a in fontes if a.endswith(".c")) + ["maisim_sil.c"]
    opts = ["-shared", *sinais_c.opcoes(e_tcc, precisao), "-o", saida_lib] + ([] if e_tcc else ["-fPIC"])
    r = subprocess.run([cc, *opts, *cs, "-lm"] if os.name != "nt" else [cc, *opts, *cs], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        msg = (r.stderr or r.stdout).strip()
        e = sinais_c.primeiro_erro(msg)
        if e:
            raise ErroC(lingua.tr("worker_c.compilacao", msg=e[3]), e[0], e[1])
        raise ErroC(lingua.tr("worker_c.compilacao", msg=msg[-800:] or f"rc={r.returncode}"))
    try:
        dll = ctypes.CDLL(saida_lib)
    except OSError as e:                          # uma função usada e não definida (o tcc só acusa ao carregar)
        raise ErroC(lingua.tr("worker_c.carregar", msg=str(e)[-400:]))
    for f in ("maisim_tamanho_estado", "maisim_iniciar", "maisim_passo"):
        if not hasattr(dll, f):
            raise ErroC(lingua.tr("worker_c.falta_funcao", f=f))
    vet = ctypes.POINTER(real)
    dll.maisim_tamanho_estado.restype = ctypes.c_size_t
    dll.maisim_tamanho_estado.argtypes = []
    dll.maisim_iniciar.restype = None
    dll.maisim_iniciar.argtypes = [vet, ctypes.c_void_p]
    dll.maisim_passo.restype = None
    dll.maisim_passo.argtypes = [real, vet, vet, ctypes.c_void_p, vet]
    dll.maisim_sil_n.restype = ctypes.c_int
    dll.maisim_sil_nome.restype = ctypes.c_char_p
    dll.maisim_sil_nome.argtypes = [ctypes.c_int]
    dll.maisim_sil_valor.restype = ctypes.c_double
    dll.maisim_sil_valor.argtypes = [ctypes.c_int]
    for f in ("maisim_sil_env_para", "maisim_sil_env_chave"):
        getattr(dll, f).restype = ctypes.c_char_p
        getattr(dll, f).argtypes = [ctypes.c_int]
    dll.maisim_sil_env_valor.restype = ctypes.c_double
    dll.maisim_sil_env_valor.argtypes = [ctypes.c_int]
    dll.maisim_sil_recebida.restype = None
    dll.maisim_sil_recebida.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_double]
    return dll


def recebidas(msgs):
    """As mensagens que chegaram nesta amostra, para o maisim_recebeu: (de, chave, valor), na ordem; None fica de fora (sem
    valor ainda); o C só recebe números."""
    n = 0
    for msg in msgs:
        for chave, v in (msg.get("dados") or {}).items():
            if v is None:
                continue
            if isinstance(v, (list, tuple)):
                raise ErroC(lingua.tr("worker_c.msg_lista", de=msg.get("de"), k=chave))
            n += 1
            if n > 256:
                raise ErroC(lingua.tr("worker_c.msgs_demais"))
            lib.maisim_sil_recebida(str(msg.get("de")).encode(), str(chave).encode(), float(v))


def enviadas():
    """O que o controle mandou com maisim_envia nesta amostra: uma mensagem por destino, {"para", "dados": {chave: valor}}."""
    if lib.maisim_sil_env_estouro():
        raise ErroC(lingua.tr("worker_c.msgs_demais"))
    por = {}
    for i in range(lib.maisim_sil_env_n()):
        para = lib.maisim_sil_env_para(i).decode("utf-8", "replace")
        if para not in cfg["nomes"] or para == cfg["nome"]:
            raise ErroC(lingua.tr("worker.envia_sem_controlador", d=repr(para),
                                  outros=", ".join(x for x in cfg["nomes"] if x != cfg["nome"]) or lingua.tr("worker.nenhum")))
        por.setdefault(para, {})[lib.maisim_sil_env_chave(i).decode("utf-8", "replace")] = lib.maisim_sil_env_valor(i)
    return [{"para": p_, "dados": d} for p_, d in por.items()]


def vetor(n):
    return (real * max(1, n))()


def poe_parametros(p):
    for k, nome in enumerate(nomes["p"]):
        p_arr[k] = float(p.get(nome, 0.0))


def responde(obj):
    if _conexao is not None:
        _conexao.send_bytes(json.dumps(obj).encode())
        return
    saida.write(json.dumps(obj) + "\n")
    saida.flush()


def pedidos():
    if _conexao is None:
        yield from sys.stdin
        return
    while True:
        try:
            yield _conexao.recv_bytes().decode()
        except (EOFError, OSError):
            return


def erro(exc):
    arq, linha = (exc.arquivo, exc.linha) if isinstance(exc, ErroC) else (cfg["arquivo"], None)
    responde({"ok": False, "erro": str(exc) if isinstance(exc, ErroC) else f"{type(exc).__name__}: {exc}", "arquivo": arq,
              "linha": linha, "instancia": cfg["nome"] if cfg["varios"] else None,
              "traceback": "" if isinstance(exc, ErroC) else traceback.format_exc()[-1500:]})


_ENDERECO = os.environ.pop("MAISIM_CTL_ENDERECO", None)
_CHAVE = os.environ.pop("MAISIM_CTL_CHAVE", "")
_conexao = None
if _ENDERECO:
    from multiprocessing.connection import Client
    _conexao = Client(_ENDERECO, authkey=bytes.fromhex(_CHAVE))

with lingua.com(LINGUA):
    m_arr = u_arr = None
    for pedido_txt in pedidos():
        try:
            pedido = json.loads(pedido_txt)
            if pedido["op"] == "carrega":
                cfg.update({k: pedido[k] for k in ("nome", "arquivo", "atuacoes", "nomes", "prefixar", "varios") if k in pedido})
                nomes = {k: list(pedido["sinais"][k]) for k in ("m", "p", "u")}
                precisao = "float" if pedido.get("precisao") == "float" else "double"
                real = ctypes.c_float if precisao == "float" else ctypes.c_double
                fontes = dict(pedido.get("arquivos_c") or {})
                if cfg["arquivo"] not in fontes:
                    raise ErroC(lingua.tr("worker_c.sem_controle_c", arq=cfg["arquivo"]))
                if cfg["varios"]:                    # vários controladores na mesma pasta da rodada: cada um compila na sua
                    os.makedirs(f"c_{cfg['nome']}", exist_ok=True)   # (o maisim_sinais.h de cada um tem só os sinais dele)
                    os.chdir(f"c_{cfg['nome']}")
                lib = compila(fontes, nomes, precisao)
                n = int(lib.maisim_tamanho_estado())
                if n > 64 * 1024 * 1024:
                    raise ErroC(lingua.tr("worker_c.estado_grande", n=n))
                estado = (ctypes.c_double * (n // 8 + 2))()   # zerado e alinhado a 8 bytes
                p_arr, m_arr, u_arr = vetor(len(nomes["p"])), vetor(len(nomes["m"])), vetor(len(nomes["u"]))
                poe_parametros(pedido["p"])
                lib.maisim_iniciar(p_arr, estado)
                responde({"ok": True})
            elif pedido["op"] == "passo":
                m = pedido["m"]
                for k, nome in enumerate(nomes["m"]):
                    m_arr[k] = float(m.get(nome, math.nan))
                for k in range(len(nomes["u"])):
                    u_arr[k] = math.nan
                lib.maisim_sil_limpa()
                recebidas(pedido.get("msgs") or [])
                lib.maisim_passo(float(pedido["t"]), m_arr, p_arr, estado, u_arr)
                out, mapa = {}, cfg["atuacoes"]
                for k, nome in enumerate(nomes["u"]):
                    v = float(u_arr[k])
                    if math.isnan(v):                 # não escrita nesta amostra: fica como estava
                        continue
                    if not math.isfinite(v):
                        raise ErroC(lingua.tr("worker.nao_finito", k=nome, v=v))
                    out[mapa.get(nome, nome) if mapa is not None else nome] = v
                pre = f"{cfg['nome']}_" if cfg["prefixar"] else ""   # o nome da instância na frente, como no Python
                sc = {pre + lib.maisim_sil_nome(i).decode("utf-8", "replace"): lib.maisim_sil_valor(i) for i in range(lib.maisim_sil_n())}
                responde({"ok": True, "a": out, "s": sc, "env": enviadas()})
            elif pedido["op"] == "parametros":
                poe_parametros({**{n: p_arr[k] for k, n in enumerate(nomes["p"])}, **pedido["p"]})
                responde({"ok": True})
            else:
                responde({"ok": False, "erro": lingua.tr("worker.pedido_desconhecido", op=pedido.get("op"))})
        except Exception as exc:
            erro(exc)
