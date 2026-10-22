#!/usr/bin/env python3
"""MaiSim / simu: o circuito dos modelos do GeckoCIRCUITS desenhado no navegador, a partir do .ipes (ipes.py).
Só biblioteca padrão. Tudo sob /maisim/simu/ (página, static/, modelos, circuito?arq=…); / redireciona.
A página do MaiSim (MAISIM_PORTA_PAGINA, 7100) encaminha /maisim/simu para cá.
uso (da raiz do projeto): python3 simu/servidor.py [--porta 7101]  →  http://localhost:7101/maisim/simu/"""
import argparse
import atexit
import base64
import gzip
import hashlib
import json
import math
import sys
import time
import os
import uuid
import random
import shutil
import signal
import re
import queue
import subprocess
import threading
from collections import OrderedDict, defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "config"))
import ler_config  # noqa: E402
ler_config.aplica()                          # as portas e as pastas (config/padrao.env, o perfil, o .env), antes de ler o ambiente

from ipes import monta
from motor import ErroMotor, Motor
import contextos
import ia as ias_maisim
import janelas_gecko
import resumo_rodada

sys.path.insert(0, str(Path(__file__).parents[1] / "scope"))
from publica import PublicadorScope  # noqa: E402  (o mesmo publicador do run.py)

AQUI = Path(__file__).parent
RAIZ = AQUI.parent                           # a raiz do projeto
MODELOS = RAIZ / "exemplos"                  # os circuitos de exemplo (no repositório)
DADOS = Path(os.environ["MAISIM_DADOS"])     # os dados de quem usa (fora do repositório)
PREFIXO = "/maisim/simu"
TIPOS = {".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
         ".woff2": "font/woff2"}
SALVOS = Path(os.environ.get("MAISIM_SALVOS") or DADOS / "circuitos")   # onde o editor salva (aparece na lista de modelos)
# MAISIM_SIMU_CACHE, MAISIM_PORTA_MOTOR e MAISIM_TELA_X: outra instância (de teste) com o seu Gecko, sem mexer no do MaiSim
ESTADO = Path(os.environ.get("MAISIM_SIMU_CACHE") or Path(os.environ["MAISIM_CACHE"]) / "simu") / "estado.ipes"   # o Gecko salva aqui o que está aberto
ESTADO.parent.mkdir(parents=True, exist_ok=True)   # numa instalação nova a pasta não existe, e o Gecko não a cria ao salvar
MOTOR = Motor(int(os.environ["MAISIM_PORTA_MOTOR"]))
TELA = os.environ["MAISIM_TELA_X"]
editor = {"aberto": None}                    # o modelo que o editor abriu no Gecko do MaiSim (guardado em ABERTO: sobrevive a reiniciar)
ABERTO = ESTADO.with_name("aberto.txt")
try:
    editor["aberto"] = ABERTO.read_text().strip() or None
except OSError:
    pass


def marca_aberto(rel):
    editor["aberto"] = rel
    try:
        ABERTO.parent.mkdir(parents=True, exist_ok=True)
        ABERTO.write_text(rel or "")
    except OSError:
        pass


NOME = re.compile(r"^[A-Za-z0-9_.#$+\-]+$")   # nome de componente / variável (sem espaço)
ROTULO = re.compile(r"^[A-Za-z0-9_.$+\-]*$")


def assinatura(r):
    """O que importa de um modelo lido: cada elemento inteiro (todas as linhas do bloco menos as que o Gecko muda sozinho:
    ipes._bruto), fios e variáveis globais. Antes eram só alguns campos, e edições como a tensão inicial do capacitor, a
    queda do diodo ou o que o medidor mede passavam despercebidas (e eram descartadas sem pergunta)."""
    els = sorted((fid, e["nome"], e.get("bruto") or (e["tipo"], e["x"], e["y"], e["dir"], tuple(e["entradas"]), tuple(e["saidas"]),
                  tuple(e["mede"]), tuple(sorted((k, v) for k, v in e["par"].items() if isinstance(v, float) and not k.endswith("_guardado")))))
                 for fid, fl in r["folhas"].items() for e in fl["elementos"])
    fios = sorted((f["folha"], f["dom"], f["rotulo"], tuple(map(tuple, f["pts"]))) for fl in r["folhas"].values() for f in fl["fios"])
    return els, fios, sorted(r.get("globais", {}).items())


VISTO = ESTADO.with_name("visto.txt")
BASE = ESTADO.with_name("base.txt")       # o circuito como o Gecko o tem logo depois de abrir/salvar/novo (a referência do "não salvo")


def marca_base():
    """Depois de abrir, salvar ou começar um novo: o estado atual do Gecko (o último estado()) é a referência do "não salvo".
    Compara-se com ele, e não com o texto do arquivo: o Gecko normaliza campos ao carregar (ex.: a fonte U criada pela
    interface remota tem lowerLimit 4.9E-324, que vira −1.79E308 ao reabrir) e o arquivo recém-aberto parecia mudado."""
    editor["base"] = hash_assinatura(editor["assinatura"])
    try:
        BASE.write_text(editor["base"])
    except OSError:
        pass


def base_conhecida():
    if editor.get("base"):
        return editor["base"]
    try:
        return BASE.read_text().strip() or None
    except OSError:
        return None


def hash_assinatura(a):
    import hashlib
    return hashlib.sha1(repr(a).encode()).hexdigest()


def ja_visto(agora):
    """O editor já viu este estado do Gecko? (na memória; depois de reiniciar o servidor, pelo arquivo VISTO)"""
    if editor.get("assinatura") is not None:
        return editor["assinatura"] == agora
    try:
        return VISTO.read_text().strip() == hash_assinatura(agora)
    except OSError:
        return False


def salva_conferencia():
    """O que está no Gecko agora, num arquivo (conferencia.ipes) para comparar; se o Gecko não conseguiu gravar (ele abre
    uma janela de aviso e deixa o arquivo vazio ou nem o cria), um erro que a tela mostra, em vez de derrubar o pedido."""
    tmp = ESTADO.with_name("conferencia.ipes")
    tmp.unlink(missing_ok=True)
    MOTOR.cmd(f"SAVEAS {tmp}")
    if not tmp.is_file() or tmp.stat().st_size < 200:
        raise ErroMotor(f"o Gecko não conseguiu gravar {tmp} para conferir o circuito (veja a janela de aviso dele)")
    return tmp


def mudou_fora():
    """True se o Gecko do MaiSim tem algo que o editor não viu: compara com o último estado visto; sem estado visto (o servidor
    reiniciou), com o arquivo aberto, no disco — o "*" do título não serve (a interface remota deixa o "*" mesmo depois de
    salvar, e o aviso saía falso a cada reinício). Sem arquivo, o "*" é o que sobra."""
    agora = assinatura(monta(salva_conferencia()))
    if editor.get("assinatura") is not None or VISTO.exists():
        return not ja_visto(agora)
    arq = (RAIZ / editor["aberto"]) if editor.get("aberto") else None
    if arq is not None and arq.is_file():
        return agora != assinatura(monta(arq))
    return gecko_alterado()


class ErroConflito(ErroMotor):
    """Mudança no Gecko que o editor não viu: a tela pergunta o que fazer (com os dados para montar as opções)."""
    def __init__(self, msg, **extra):
        super().__init__(msg)
        self.extra = extra


def situacao_gecko():
    """O que não está salvo, em relação ao arquivo aberto: o circuito (o Gecko difere do arquivo no disco; sem arquivo, tem
    algum elemento), o controle de trabalho (difere do <nome>.controle.json; sem arquivo, está em uso) e as cores dos canais
    (diferem do <nome>.cores.json; sem arquivo, alguma escolhida). E se o editor já viu o circuito como está (visto)."""
    r = monta(salva_conferencia())
    agora = assinatura(r)
    arq = (RAIZ / editor["aberto"]) if editor.get("aberto") else None
    if arq is not None and arq.is_file():
        base = base_conhecida()
        circuito = (hash_assinatura(agora) != base) if base else (agora != assinatura(monta(arq)))
        salvo = controle_padrao()
        try:                                         # o mesmo que a abertura carrega (completa_controle: um controle de
            salvo = completa_controle(json.loads(arquivo_controle(arq).read_text()))   # antes dos módulos fica como era)
        except (OSError, ValueError):
            pass
        controle = le_controle() != salvo
        a = le_aparencia()
        cores = a != aparencia_do_arquivo(arq)
    else:
        circuito = any(fl["elementos"] for fl in r["folhas"].values())
        a = le_aparencia()
        controle, cores = controle_em_uso(le_controle()), bool(a["cores"] or a["pontas"])
    itens = [n for n, v in (("o circuito", circuito), ("o controle", controle), ("a aparência (cores e pontas)", cores)) if v]
    return {"pendente": bool(itens), "circuito": circuito, "controle": controle, "cores": cores, "itens": itens, "visto": ja_visto(agora)}


def salva_aberto():
    """Grava o que está no Gecko (e o controle e as cores) no arquivo aberto — só arquivo da pasta do MaiSim."""
    if not aberto_salvavel():
        raise ErroMotor("o modelo aberto não está na pasta do MaiSim: use Salvar como")
    dest = RAIZ / editor["aberto"]
    MOTOR.cmd(f"SAVEAS {dest}")
    salva_controle_junto(dest)
    salva_aparencia_junto(dest)
    estado()
    marca_base()


def nome_aberto():
    return Path(editor["aberto"]).name if editor.get("aberto") else "o circuito novo (sem arquivo)"


def lista_itens(itens):
    return itens[0] if len(itens) == 1 else ", ".join(itens[:-1]) + " e " + itens[-1]


def aberto_salvavel():
    """O arquivo aberto pode ser regravado pelo MaiSim? (só os da pasta do MaiSim: os modelos originais nunca)"""
    if not editor.get("aberto"):
        return False
    try:
        return (RAIZ / editor["aberto"]).resolve().parent == SALVOS.resolve()
    except OSError:
        return False


def gecko_alterado():
    """True se o modelo aberto no Gecko do MaiSim tem alteração não salva (título com "*")."""
    try:
        r = subprocess.run(["xwininfo", "-root", "-tree"], env=dict(os.environ, DISPLAY=TELA), capture_output=True, text=True, timeout=5)
        return bool(re.search(r"\.ipes\*", r.stdout))
    except (OSError, subprocess.SubprocessError):
        return False


# ---------------------------------------------------------------- o Gecko não pode ficar esperando um OK que ninguém vê
# (Marcelo, 19/10: colou a perna do MMC abaixo da beira da folha principal, de 160 × 100, e o MaiSim travou). Ao abrir um arquivo,
# o Gecko confere se tudo da folha principal cabe no tamanho gravado (worksheetSizeX/Y, no fim do arquivo); se não cabe, abre
# uma janela de erro e espera o OK — na tela escondida do Gecko do MaiSim. O pedido fica parado, e o MaiSim inteiro com ele; e,
# como o tamanho não muda, todo reabrir seguinte (mover em grupo, apagar, desfazer, colar) cai na mesma janela.
# Duas camadas: (1) abre(): antes de qualquer reabrir, a folha principal cresce para caber tudo (com folga); (2) a vigia do
# motor: se um pedido demora, ela olha a tela do Gecko e fecha com OK uma janela de erro (a foto fica em janelas_gecko/), e
# a página diz o que houve, em vez de travar.
FOLGA_FOLHA = 6                                      # quadrados além do componente mais longe (o Gecko conta o desenho todo)


def cabe_na_folha(t, arq):
    """O texto do arquivo com a folha principal grande o bastante para tudo o que está nela (o mesmo texto, se já cabe)."""
    m = None
    for m in re.finditer(r"\nworksheetSizeX (\d+)[ \t]*\nworksheetSizeY (\d+)", t):
        pass
    if m is None or m.start() < t.rfind("<\\Element"):    # o do fim do arquivo (o da folha principal), não o de um SM
        return t
    try:
        f0 = monta(arq)["folhas"].get("0") or {"elementos": [], "fios": []}
    except Exception:                                # não deu para ler: abre como está (a vigia cuida, se o Gecko reclamar)
        return t
    xs, ys = [0], [0]
    for e in f0["elementos"]:
        bx, by = (e.get("tamanho") or [0, 0]) if e["tipo"] == "SUBCIRCUIT" else (0, 0)
        xs.append(e["x"] + bx)
        ys.append(e["y"] + by)
    for w in f0["fios"]:
        xs += [q[0] for q in w["pts"]]
        ys += [q[1] for q in w["pts"]]
    sx, sy = int(m.group(1)), int(m.group(2))
    nx, ny = max(xs) + FOLGA_FOLHA, max(ys) + FOLGA_FOLHA
    if nx <= sx and ny <= sy:
        return t
    nx, ny = max(sx, -(-nx // 10) * 10), max(sy, -(-ny // 10) * 10)
    return t[:m.start()] + f"\nworksheetSizeX {nx}\nworksheetSizeY {ny}" + t[m.end():]


def abre(arq):
    """O Gecko reabre um arquivo (o editado aqui, um passo do desfazer, um modelo), com a folha principal grande o bastante:
    se o arquivo precisa crescer, abre uma cópia ajustada (o modelo do Marcelo em disco não muda)."""
    arq = Path(arq)
    t, gz = _texto(arq)
    t2 = cabe_na_folha(t, arq)
    if t2 is not t:
        arq = ESTADO.with_name("ajustado.ipes")
        arq.write_bytes(gzip.compress(t2.encode()) if gz else t2.encode())
    MOTOR.cmd(f"OPEN {arq}")


def vigia_gecko():
    """Chamada pelo motor quando um pedido demora: fecha as janelas de erro do Gecko (a foto fica para depois)."""
    fechadas = janelas_gecko.fecha(TELA, ESTADO.parent / "janelas_gecko")
    for tit, foto in fechadas:
        print(f"{time.strftime('%H:%M:%S')} janela de erro do Gecko fechada com OK: {tit} (foto: {foto})", flush=True)
    return [tit for tit, _ in fechadas]


MOTOR.vigia = vigia_gecko


def aviso_janelas():
    """O que a vigia fechou durante o pedido, para a página dizer (e zera)."""
    js, MOTOR.janelas = MOTOR.janelas, []
    if not js:
        return ""
    return (f"o Gecko abriu {'uma janela' if len(js) == 1 else f'{len(js)} janelas'} de erro ({', '.join(sorted(set(js)))}) na tela "
            "dele, que você não vê, e ficou esperando o OK; o MaiSim fechou. Confira o desenho (Ctrl+Z volta)")


def estado():
    """O que está aberto no Gecko agora: ele salva em ESTADO e o ipes.py lê (o Gecko é a fonte da verdade)."""
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    r = monta(ESTADO)
    r["desfazer"] = {"n": min(len(pilha), DESFAZER_N), "ultimo": pilha[-1][1] if pilha else ""}   # a pilha é aparada depois
    editor["ultimo"] = r
    editor["assinatura"] = assinatura(r)
    try:                                             # o que o editor viu, também em disco: depois de reiniciar o servidor, abrir
        VISTO.write_text(hash_assinatura(editor["assinatura"]))   # o mesmo modelo não pergunta à toa
    except OSError:
        pass
    r["arq"] = editor["aberto"] or "(o que estava aberto no Gecko do MaiSim)"
    aberto = (RAIZ / editor["aberto"]).resolve() if editor["aberto"] else None       # arquivo do MaiSim? (Salvar grava por cima)
    pasta = next((k for k, d in (("circuitos", SALVOS), ("subcircuitos", LIB)) if aberto and aberto.parent == d.resolve()), None)
    r["dono"] = {"pasta": pasta, "nome": aberto.stem} if pasta else None
    r["editor"] = True
    r["cores"] = cores_efetivas(r)                   # {canal: cor} (escolhida ou padrão)
    r["cores_escolhidas"] = le_cores()
    r["pontas"] = le_pontas()                        # {canal: {"+": componente, "-": componente}}
    r["fora"] = le_aparencia()["fora"]               # identificadores fora do scope e do controle
    r["nos_medidos"] = nos_medidos(r)                # {folha: {rótulo: [{nome, x, y}]}}
    return r


# ---------------------------------------------------------------- desfazer (Ctrl+Z): antes de cada mudança, o Gecko salva o
# estado de agora; desfazer = ele reabre esse arquivo. Até DESFAZER_N passos; abrir outro modelo zera a pilha.
DESFAZER_N = 20
pilha = []                                   # (arquivo com o estado de antes, descrição da mudança); a mais recente no fim


def guarda(descr):
    pasta = ESTADO.parent / "desfazer"
    pasta.mkdir(parents=True, exist_ok=True)
    arq = pasta / f"{time.time_ns()}.ipes"
    MOTOR.cmd(f"SAVEAS {arq}")
    pilha.append((arq, str(descr)[:200]))


def apara():
    """Até DESFAZER_N passos (só depois que a mudança vale: uma que falha sem mexer não leva o passo mais antigo)."""
    while len(pilha) > DESFAZER_N:
        pilha.pop(0)[0].unlink(missing_ok=True)


def esquece(tudo=False):
    while pilha:
        pilha.pop()[0].unlink(missing_ok=True)
        if not tudo:
            break


def com_desfazer(f, descr, manter_se_falhar=False):
    """A mudança f com o estado de antes guardado; se ela falhar sem mexer no circuito, a pilha volta como estava."""
    def g():
        guarda(descr)
        try:
            r = f()
        except Exception:
            if not manter_se_falhar:
                esquece()
            apara()
            raise
        apara()
        return r
    return g


def _texto(arq):
    b = Path(arq).read_bytes()
    return (gzip.decompress(b).decode("utf-8", "replace") if b[:2] == b"\x1f\x8b" else b.decode("utf-8", "replace")), b[:2] == b"\x1f\x8b"


def blocos_elementos(t):
    """Cada bloco <Element…> do arquivo: (match, nome, uniqueObjectIdentifier, folha)."""
    for m in re.finditer(r"<Element(\w+)>\n(.*?)<\\Element\1>", t, re.S):
        d = dict(l.split(" ", 1) for l in m.group(2).split("\n") if " " in l)
        yield m, d.get("idStringDialog", "").strip(), d.get("uniqueObjectIdentifier", "").strip(), d.get("parentSheetIdentifier", "0").strip()


def acopla(nome, campos, ref=None, folhas=None, dominio="CONTROL"):
    """Medidor (VOLT/AMP): o que ele mede, na folha principal ou dentro de subcircuitos (folhas = "0" ou o identificador do
    subcircuito; vários de uma vez para os SMs iguais). A interface remota do Gecko não tem isso; o Gecko salva o estado,
    escrevemos o acoplamento no bloco do medidor (parameterString e, para corrente, a referência ao componente DA MESMA
    folha: os nomes se repetem de um SM para outro) e o Gecko reabre o arquivo: quem valida é ele."""
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, gz = _texto(ESTADO)
    folhas = folhas_ok(folhas, t)
    blocos = list(blocos_elementos(t))
    partes, fim, feitas = [], 0, set()
    for m, n, uid, fo in blocos:
        if n != nome or fo not in folhas or fo in feitas or m.group(1) != dominio:
            continue
        b = re.sub(r"parameterString\[\] [^\n]*", "parameterString[] /" + "/".join(campos), m.group(0))
        if ref is not None:
            alvo = next((u for _, n2, u, f2 in blocos if n2 == ref and f2 == fo), None)
            if not alvo:
                raise ErroMotor(f"não achei o componente {ref}" + ("" if fo == "0" else " num dos subcircuitos"))
            b = re.sub(r"\ncoupledReferenceID\[\] [^\n]*", f"\ncoupledReferenceID[] {alvo} ", b)
            b = re.sub(r"\ncopyCoupledReferenceID\[\] [^\n]*", f"\ncopyCoupledReferenceID[] {alvo} ", b)
        partes += [t[fim:m.start()], b]
        fim = m.end()
        feitas.add(fo)
    faltam = [f for f in folhas if f not in feitas]
    if faltam:
        raise ErroMotor(f"não achei {nome}" + (" na folha principal" if faltam == ["0"] else f" em {len(faltam)} subcircuito(s)"))
    arq = ESTADO.with_name("acoplado.ipes")
    t2 = "".join(partes) + t[fim:]
    arq.write_bytes(gzip.compress(t2.encode()) if gz else t2.encode())
    abre(arq)
    r = estado()
    esperado = [c if c != "NIX_NIX_NIX" else "" for c in campos[:2]]
    for fo in folhas:
        e = next((x for x in r["folhas"].get(fo, {"elementos": []})["elementos"] if x["nome"] == nome), None)
        if e is None or [x or "" for x in e["mede"][:len(esperado)]] != esperado:
            raise ErroMotor(f"o Gecko não aceitou o acoplamento de {nome} (ficou {e and e['mede']})")
    return r


# ---------------------------------------------------------------- fios
# A interface remota do Gecko cria fio sem tipo e sem rótulo (createConnector incompleto); então, como nos medidores, o
# Gecko salva o estado, escrevemos o fio no arquivo (o mesmo bloco que ele grava) e ele reabre: quem valida é ele.
# O fio guarda um ponto por passo da grade; a ligação é pelos pontos que coincidem com terminais e outros fios.
TIPO_FIO = {"LK": 0, "CONTROL": 1, "THERM": 4}       # ConnectorType.ordinal() do Gecko
BLOCO_FIO = re.compile(r"\nverbindung(\w+)\s+\(\d+\)\n<Verbindung>\n(.*?)<\\Verbindung>", re.S)   # sem a quebra do fim: o Gecko às vezes cola o bloco seguinte


def expande(cantos):
    """Os cantos do fio → um ponto por passo da grade (como o Gecko grava); só trechos na horizontal ou na vertical."""
    pts = [tuple(map(int, cantos[0]))]
    for (x0, y0), (x1, y1) in zip(cantos, cantos[1:]):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        if x0 != x1 and y0 != y1:
            raise ErroMotor("a conexão anda só na horizontal ou na vertical entre dois cantos")
        sx, sy = (x1 > x0) - (x1 < x0), (y1 > y0) - (y1 < y0)
        pts += [(x0 + sx * k, y0 + sy * k) for k in range(1, abs(x1 - x0) + abs(y1 - y0) + 1)]
    if len(pts) < 2 or len(pts) > 2000 or any(abs(c) > 100000 for p in pts for c in p):
        raise ErroMotor("conexão inválida")
    return pts


def acha_fio(t, pts, folha="0"):
    """O bloco do fio com estes pontos (em qualquer sentido) na folha."""
    alvo = [tuple(p) for p in pts]
    for m in BLOCO_FIO.finditer(t):
        d = dict(l.split(" ", 1) for l in m.group(2).split("\n") if " " in l)
        xy = list(zip(map(int, d.get("x[]", "").split()), map(int, d.get("y[]", "").split())))
        if d.get("parentSheetIdentifier", "0").strip() == folha and (xy == alvo or xy[::-1] == alvo):
            return m
    return None


def reabre(t, gz):
    arq = ESTADO.with_name("fios.ipes")
    arq.write_bytes(gzip.compress(t.encode()) if gz else t.encode())
    abre(arq)
    return estado()


FOLHA = re.compile(r"^(0|-?\d+)$")                   # 0 = folha principal; senão, o uniqueObjectIdentifier do subcircuito


def folhas_ok(folhas, t):
    """As folhas pedidas: "0" ou subcircuitos que existem no arquivo."""
    folhas = [str(f) for f in (folhas or ["0"])]
    if not folhas or len(folhas) > 200 or len(set(folhas)) != len(folhas):
        raise ErroMotor("folhas inválidas")
    for f in folhas:
        if not FOLHA.match(f) or (f != "0" and f"\nuniqueObjectIdentifier {f}\n" not in t):
            raise ErroMotor(f"folha desconhecida: {f}")
    return folhas


def tem_fio(r, pts, folha="0"):
    alvo = [tuple(p) for p in pts]
    fl = r["folhas"].get(folha)
    return bool(fl) and any([tuple(p) for p in f["pts"]] in (alvo, alvo[::-1]) for f in fl["fios"])


def fio_novo(cantos, dom, rotulo="", folhas=None):
    if dom not in TIPO_FIO:
        raise ErroMotor(f"domínio da conexão: {', '.join(TIPO_FIO)}")
    if not ROTULO.match(rotulo):
        raise ErroMotor("rótulo sem espaço")
    pts = expande(cantos)
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, gz = _texto(ESTADO)
    folhas = folhas_ok(folhas, t)
    k = len(re.findall(r"\nverbindung" + dom + r"\s+\(", t))
    blocos = "".join(f"\nverbindung{dom}  ({k + i})\n<Verbindung>\nlabel {rotulo or 'NIX_NIX_NIX'}\n"
                     f"x[] {' '.join(str(x) for x, _ in pts)} \ny[] {' '.join(str(y) for _, y in pts)} \n"
                     f"enabledShorted 1\nparentSheetIdentifier {f}\nconnectorType {TIPO_FIO[dom]}\n<\\Verbindung>\n"
                     for i, f in enumerate(folhas))
    r = reabre(blocos + t, gz)
    faltam = [f for f in folhas if not tem_fio(r, pts, f)]
    if faltam:
        raise ErroMotor(f"o Gecko não aceitou a conexão ({len(faltam)} de {len(folhas)} folhas)")
    return r


def fio_muda(cantos, apagar=False, rotulo=None, folhas=None):
    pts = expande(cantos)
    if not apagar and not ROTULO.match(rotulo or ""):
        raise ErroMotor("rótulo sem espaço")
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, gz = _texto(ESTADO)
    folhas = folhas_ok(folhas, t)
    for f in folhas:
        m = acha_fio(t, pts, f)
        if m is None:
            raise ErroMotor("não achei essa conexão" + ("" if f == "0" else " num dos subcircuitos"))
        if apagar:
            t = t[:m.start()] + t[m.end():]
        else:
            t = t[:m.start()] + re.sub(r"\nlabel [^\n]*", "\nlabel " + (rotulo or "NIX_NIX_NIX"), m.group(0), count=1) + t[m.end():]
    r = reabre(t, gz)
    alvo = [tuple(p) for p in pts]
    for f in folhas:
        fl = r["folhas"].get(f, {"fios": []})["fios"]
        mesmos = [w for w in fl if [tuple(p) for p in w["pts"]] in (alvo, alvo[::-1])]
        if apagar and mesmos:
            raise ErroMotor("o Gecko manteve a conexão")
        if not apagar and not any(w["rotulo"] == (rotulo or "") for w in mesmos):
            raise ErroMotor("o Gecko não aceitou o rótulo da conexão")
    return r


# ---------------------------------------------------------------- biblioteca de subcircuitos (simu/gecko/subcircuitos/<nome>.ipes)
# O Gecko não exporta nem importa subcircuito: ele só existe dentro do .ipes. Salvar = um .ipes só com o bloco (na folha
# principal) e tudo o que está dentro dele (subcircuitos dentro de subcircuitos também) e as variáveis $; o próprio Gecko
# abre e regrava esse arquivo. Usar = copiar o bloco e o conteúdo para o circuito aberto com identificadores novos e um
# nome novo, juntando as variáveis $ que faltarem; o Gecko reabre e confere.
LIB = Path(os.environ.get("MAISIM_BIBLIOTECA") or DADOS / "subcircuitos")   # a instância de teste usa outra pasta
if not LIB.exists():                                   # a 1ª vez: a biblioteca começa com os subcircuitos de exemplo
    try:
        LIB.mkdir(parents=True)
        for f in (MODELOS / "subcircuitos").glob("*.ipes"):
            shutil.copyfile(f, LIB / f.name)
    except OSError:
        pass
NOME_ARQ = re.compile(r"^[A-Za-z0-9_\-]{1,40}$")
BLOCO_EL = re.compile(r"\n(\w+)\s+\(\d+\)\n<Element(\w+)>\n(.*?)<\\Element\2>", re.S)          # idem (3 blocos colados no modelo 03)


def _campos(corpo):
    return dict(l.split(" ", 1) for l in corpo.split("\n") if " " in l)


def subarvore(t, uid):
    """O identificador do subcircuito e os dos subcircuitos dentro dele (as folhas que vão junto)."""
    pais = {}
    for m in BLOCO_EL.finditer(t):
        d = _campos(m.group(3))
        pais[d.get("uniqueObjectIdentifier", "").strip()] = d.get("parentSheetIdentifier", "0").strip()
    usadas = set(pais.values()) | {_campos(m.group(2)).get("parentSheetIdentifier", "0").strip() for m in BLOCO_FIO.finditer(t)}
    folhas, mudou = {uid}, True
    while mudou:
        novas = {u for u, pai in pais.items() if pai in folhas and u in usadas} - folhas
        folhas |= novas
        mudou = bool(novas)
    return folhas


def _globais(t):
    nomes = re.search(r"\noptimizerName\[\] ([^\n]*)", t)
    vals = re.search(r"\noptimizerValue\[\] ([^\n]*)", t)
    if not nomes or not vals:
        return None
    n = [x for x in nomes.group(1).strip().split("/") if x]
    return n, vals.group(1).split()[:len(n)]


# ---------------------------------------------------------------- variáveis globais ($) — Tools > Parameters do Gecko
# A interface remota só muda o valor de uma variável que existe (SETG). Criar, apagar e ligar um parâmetro a uma variável
# é no arquivo, como o Gecko grava: a lista "optimizerName[] /$a/$b" + "optimizerValue[] 1.0 2.0"; no componente, a linha
# "<identificador>$ParameterName $a" (antes da "<identificador> valor"; o Gecko só lê a primeira se a segunda existir) e o
# nameOpt[] antigo, pelo índice. O nome que a tela mostra (o da interface remota: uMAX, f) → o identificador do arquivo
# (amplitude, frequency) vem do próprio Gecko (motor/src/maisim/MaiSimParametros.java → parametros_gecko.json).
PARAMETROS = {}
try:
    PARAMETROS = {g["id"]: g["parametros"] for g in json.loads((Path(__file__).parent / "parametros_gecko.json").read_text()) if "erro" not in g}
except (OSError, ValueError, KeyError):
    pass
VARIAVEL = re.compile(r"^\$[A-Za-z_][A-Za-z0-9_]{0,39}$")


def parametro_gecko(dom, typ, curto):
    """O parâmetro (dict do parametros_gecko.json) pelo nome que a tela mostra, ou None."""
    import ipes
    idg = ipes.CATALOGO.get((ipes.FAMILIA.get(dom, dom), int(typ)), (None,))[0]
    c, ps = str(curto).lower(), PARAMETROS.get(idg, [])
    # na ordem do Gecko (setAccessibleParameter): o nome curto de agora primeiro, os alternativos por último — o alternativo
    # do uDC da fonte é "uMAX", o nome do parâmetro da amplitude (achado pela tela: o uMAX aparecia ligado com o uDC)
    for campo in ("curto", "curtos", "alternativos"):
        p = next((p for p in ps if c in [x.lower() for x in ([p[campo]] if campo == "curto" else p[campo])]), None)
        if p:
            return p
    return None


def _num_gecko(v):
    """Como o Gecko grava um double (repr do Python: o Java lê 1e-07 e 325.0)."""
    return repr(float(v))


def _poe_globais(t, nomes, valores):
    # como o Gecko grava: "optimizerName[] /$a/$b" SEM espaço no fim — ele separa só pela "/", e um espaço depois do último
    # nome entra no nome ("$b "): o parâmetro ligado a $b não acharia a variável e valeria NaN (achado no teste)
    corpo_n = "/" + "/".join(n.strip() for n in nomes) if nomes else ""
    corpo_v = (" ".join(valores) + " ") if valores else " "
    if not re.search(r"\noptimizerName\[\][^\n]*", t) or not re.search(r"\noptimizerValue\[\][^\n]*", t):
        raise ErroMotor("o circuito aberto não tem a lista de variáveis globais")
    t = re.sub(r"\noptimizerName\[\][^\n]*", lambda m: "\noptimizerName[] " + corpo_n, t, count=1)
    return re.sub(r"\noptimizerValue\[\][^\n]*", lambda m: "\noptimizerValue[] " + corpo_v, t, count=1)


def _liga_no_bloco(corpo, p, var, valor):
    """O bloco do componente com o parâmetro p ligado à variável var (ou desligado, var vazia), com o valor escrito."""
    ident = re.escape(p["id"])
    corpo = re.sub(rf"\n{ident}\$ParameterName [^\n]*", "", corpo)
    num = str(int(round(valor))) if p["valor"] == "Integer" else _num_gecko(valor)
    linha = (f"\n{p['id']}$ParameterName {var}" if var else "") + f"\n{p['id']} {num}"
    if re.search(rf"\n{ident} [^\n]*", corpo):
        corpo = re.sub(rf"\n{ident} [^\n]*", lambda m: linha, corpo, count=1)
    else:                                              # sem a linha do valor o Gecko não lê o nome: escreve as duas
        corpo = corpo.rstrip("\n") + linha + "\n"
    if p["indice"] >= 0:                               # o nameOpt[] antigo, pelo índice (o Gecko lê os dois)
        def opt(m):
            v = m.group(1).split("/")[1:] if m.group(1).startswith("/") else []
            v += ["NIX_NIX_NIX"] * (p["indice"] + 1 - len(v))
            v[p["indice"]] = var or "NIX_NIX_NIX"
            return "\nnameOpt[] /" + "/".join(v)
        corpo = re.sub(r"\nnameOpt\[\] ([^\n]*)", opt, corpo, count=1)
    return corpo


def variavel(corpo):
    """acao: nova (nome, valor) | apaga (nome, ou nomes: os parâmetros ligados a ela ficam com o valor dela) | liga (componente,
    parametro, nome; folhas — a variável que não existe é criada com valor, ou com o valor do parâmetro) | desliga
    (componente, parametro, valor; folhas). O Gecko reabre o arquivo e confere."""
    acao, var = str(corpo.get("acao", "")), str(corpo.get("nome", "")).strip()
    if acao not in ("nova", "apaga", "liga", "desliga"):
        raise ErroMotor("ação: nova, apaga, liga ou desliga")
    lista = [str(x).strip() for x in corpo["nomes"]] if acao == "apaga" and isinstance(corpo.get("nomes"), list) else [var]
    if acao != "desliga" and (not lista or len(lista) > 500 or not all(VARIAVEL.match(x) for x in lista)):
        raise ErroMotor("nome da variável: $ seguido de letras, números ou _ (ex.: $Vp, $f_rede)")
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, gz = _texto(ESTADO)
    g = _globais(t)
    if g is None:
        raise ErroMotor("o circuito aberto não tem a lista de variáveis globais")
    nomes, valores = list(g[0]), list(g[1])
    def valor_de(v, padrao=None):
        try:
            x = float(v)
        except (TypeError, ValueError):
            x = None
        if x is None or not math.isfinite(x):
            if padrao is not None:
                return padrao
            raise ErroMotor("valor: um número (ex.: 325, 50, 1e-3)")
        return x
    if acao == "nova":
        if var in nomes:
            raise ErroMotor(f"{var} já existe")
        nomes.append(var); valores.append(_num_gecko(valor_de(corpo.get("valor"))))
        t = _poe_globais(t, nomes, valores)
    elif acao == "apaga":
        for var in lista:
            if var not in nomes:
                raise ErroMotor(f"não há a variável {var}")
            val = float(valores[nomes.index(var)])
            partes, fim = [], 0
            for m in BLOCO_EL.finditer(t):             # quem a usa fica com o valor dela, sem a ligação
                b = m.group(3)
                usos = re.findall(rf"\n(\w+)\$ParameterName {re.escape(var)}[ \t]*(?=\n)", "\n" + b)
                if not usos:
                    continue
                d = _campos(b)
                for ident in usos:
                    p = next((x for x in PARAMETROS.get(_id_gecko(m.group(2), d), []) if x["id"] == ident), None) or \
                        dict(id=ident, indice=-1, valor="Double")
                    b = _liga_no_bloco("\n" + b, p, "", val)[1:]
                partes += [t[fim:m.start(3)], b]
                fim = m.end(3)
            t = "".join(partes) + t[fim:]
            i = nomes.index(var); nomes.pop(i); valores.pop(i)
        t = _poe_globais(t, nomes, valores)
    else:
        comp, curto = str(corpo.get("componente", "")), str(corpo.get("parametro", ""))
        if not NOME.match(comp) or "#" in comp:
            raise ErroMotor(f"componente inválido: {comp!r}")
        folhas = folhas_ok(corpo.get("folhas"), t)
        if acao == "liga" and var not in nomes:        # nova: com o valor pedido (ou o do parâmetro)
            nomes.append(var); valores.append(_num_gecko(valor_de(corpo.get("valor"))))
            t = _poe_globais(t, nomes, valores)
        partes, fim, feitas = [], 0, set()
        for m in BLOCO_EL.finditer(t):
            d = _campos(m.group(3))
            fo = d.get("parentSheetIdentifier", "0").strip()
            if d.get("idStringDialog", "").strip() != comp or fo not in folhas or fo in feitas:
                continue
            p = parametro_gecko(m.group(2), d.get("typ", -1), curto)
            if p is None:
                raise ErroMotor(f"{comp} não tem o parâmetro {curto}")
            if p["valor"] not in ("Double", "Integer"):
                raise ErroMotor(f"{curto} não é um número: não pode vir de uma variável")
            val = float(valores[nomes.index(var)]) if acao == "liga" else valor_de(corpo.get("valor"))
            partes += [t[fim:m.start(3)], _liga_no_bloco("\n" + m.group(3), p, var if acao == "liga" else "", val)[1:]]
            fim = m.end(3)
            feitas.add(fo)
        faltam = [f for f in folhas if f not in feitas]
        if faltam:
            raise ErroMotor(f"não achei {comp}" + (" na folha principal" if faltam == ["0"] else f" em {len(faltam)} subcircuito(s)"))
        t = "".join(partes) + t[fim:]
    r = reabre(t, gz)
    # conferência: o Gecko releu o que escrevemos
    if acao == "nova" and var not in r["globais"]:
        raise ErroMotor(f"o Gecko não aceitou a variável {var}")
    if acao == "apaga" and (set(lista) & set(r["globais"]) or any(v in lista for f in r["folhas"].values() for e in f["elementos"]
                                                                   for k, v in e["par"].items() if k.endswith("_var"))):
        raise ErroMotor("o Gecko manteve a variável")
    if acao in ("liga", "desliga"):
        for fo in folhas:
            e = next((x for x in r["folhas"].get(fo, {"elementos": []})["elementos"] if x["nome"] == comp), None)
            p = e and parametro_gecko(e["dom"], e["typ"], curto)
            ligada = e and p and e["par"].get(p["id"] + "_var", "")
            if not e or (acao == "liga" and ligada != var) or (acao == "desliga" and ligada):
                raise ErroMotor(f"o Gecko não aceitou a ligação de {comp}.{curto}" + (f" a {var}" if acao == "liga" else ""))
    return r


def _id_gecko(dom, d):
    import ipes
    try:
        return ipes.CATALOGO.get((ipes.FAMILIA.get(dom, dom), int(d.get("typ", -1))), (None,))[0]
    except ValueError:
        return None


def _tira_rotulos(b, campo):
    return re.sub(r"\n" + campo + r"\[\] ([^\n]*)", lambda m: f"\n{campo}[] " + "".join("/NIX_NIX_NIX" for x in m.group(1).split("/")[1:]), b)


TERMINAIS_SUB = {("LK", "29"), ("THERM", "49"), ("CONTROL", "78"), ("REL", "30"), ("RELUCTANCE", "30")}   # os de subcircuito (não os globais)


def _sem_rotulos_de_fora(t, uid):
    """O subcircuito uid sem os rótulos de nó de FORA: os do bloco e os dos terminais da folha dele. O Gecko guarda o nome
    de fora nos dois (no terminal de dentro, em labelEndKnoten) e, ao abrir, refaz o do bloco pelos terminais: limpar só o
    bloco não basta. Na biblioteca e no colar, o bloco novo não liga por rótulo a nós do circuito de onde veio (achado de
    Marcelo, 19/10: o SM-HB da biblioteca chegava com vap, EXT_S3 e VC_SM3 do MMC)."""
    def troca(m):
        d = _campos(m.group(3))
        if d.get("uniqueObjectIdentifier", "").strip() == uid:
            return _tira_rotulos(_tira_rotulos(m.group(0), "labelAnfangsKnoten"), "labelEndKnoten")
        if d.get("parentSheetIdentifier", "0").strip() == uid and (m.group(2), d.get("typ", "").strip()) in TERMINAIS_SUB:
            return _tira_rotulos(m.group(0), "labelEndKnoten")
        return m.group(0)
    return BLOCO_EL.sub(troca, t)


def salva_sub(nome, folha, nome_lib, sobrescrever=False):
    if not NOME_ARQ.match(nome_lib):
        raise ErroMotor("nome na biblioteca: letras, números, _ e -, até 40")
    destino = LIB / f"{nome_lib}.ipes"
    if destino.exists() and not sobrescrever:
        raise ErroMotor(f"já existe {nome_lib} na biblioteca; confirme para sobrescrever")
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, gz = _texto(ESTADO)
    folha = folhas_ok([folha], t)[0]
    alvo = next((m for m in BLOCO_EL.finditer(t) if _campos(m.group(3)).get("idStringDialog", "").strip() == nome
                 and _campos(m.group(3)).get("parentSheetIdentifier", "0").strip() == folha), None)
    if alvo is None:
        raise ErroMotor(f"não achei o subcircuito {nome}")
    uid = _campos(alvo.group(3)).get("uniqueObjectIdentifier", "").strip()
    folhas = subarvore(t, uid)
    if folhas == {uid} and f"\nparentSheetIdentifier {uid}\n" not in t:
        raise ErroMotor(f"{nome} não é um subcircuito (ou está vazio)")

    def fica(m, corpo):                              # o bloco do subcircuito e tudo o que está dentro dele
        d = _campos(corpo)
        return d.get("uniqueObjectIdentifier", "").strip() == uid or d.get("parentSheetIdentifier", "0").strip() in folhas

    def troca_el(m):
        if not fica(m, m.group(3)):
            return ""
        b = m.group(0)
        if _campos(m.group(3)).get("uniqueObjectIdentifier", "").strip() == uid:   # vai para a folha principal, sem rótulos de fora
            b = re.sub(r"\nparentSheetIdentifier [^\n]*", "\nparentSheetIdentifier 0", b)
            b = re.sub(r"\nx [^\n]*", "\nx 10", b, count=1)
            b = re.sub(r"\ny [^\n]*", "\ny 10", b, count=1)
            b = _tira_rotulos(_tira_rotulos(b, "labelAnfangsKnoten"), "labelEndKnoten")
        return b
    t2 = _sem_rotulos_de_fora(BLOCO_EL.sub(troca_el, t), uid)    # o bloco e os terminais de dentro: sem os nomes de fora
    t2 = BLOCO_FIO.sub(lambda m: m.group(0) if _campos(m.group(2)).get("parentSheetIdentifier", "0").strip() in folhas else "", t2)
    bruto = ESTADO.with_name("biblioteca_bruto.ipes")
    bruto.write_bytes(gzip.compress(t2.encode()) if gz else t2.encode())
    LIB.mkdir(parents=True, exist_ok=True)
    try:                                             # o Gecko abre o recorte e regrava; depois volta ao circuito de antes
        abre(bruto)
        MOTOR.cmd(f"SAVEAS {destino}")
    finally:
        abre(ESTADO)
    r = monta(destino)
    sub = [e for e in r["folhas"]["0"]["elementos"] if e["tipo"] == "SUBCIRCUIT"]
    if len(sub) != 1 or len(r["folhas"]) < 2:
        destino.unlink(missing_ok=True)
        raise ErroMotor("o Gecko não regravou o subcircuito como esperado")
    return dict(estado(), biblioteca=lista_biblioteca(), salvo=relativo(destino))


def lista_biblioteca():
    out = []
    for f in sorted(LIB.glob("*.ipes")):
        try:
            r = monta(f)
            sub = next(e for e in r["folhas"]["0"]["elementos"] if e["tipo"] == "SUBCIRCUIT")
            dentro = r["folhas"].get(sub["uid"], {"elementos": []})["elementos"]
            out.append(dict(nome=f.stem, arq=relativo(f), elementos=len(dentro), tamanho=sub.get("tamanho"),
                            terminais=[t.get("interno", "") for t in sub["terminais"]]))
        except Exception as e:                       # arquivo que o leitor não entende: aparece com o erro, não derruba a lista
            out.append(dict(nome=f.stem, arq=relativo(f), erro=str(e)))
    return out


def insere_sub(nome_lib, x, y, folha="0"):
    if not NOME_ARQ.match(nome_lib) or not (LIB / f"{nome_lib}.ipes").is_file():
        raise ErroMotor(f"não há {nome_lib} na biblioteca")
    L, _ = _texto(LIB / f"{nome_lib}.ipes")
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, gz = _texto(ESTADO)
    folha = folhas_ok([folha], t)[0]
    bloco = next((m for m in BLOCO_EL.finditer(L) if _campos(m.group(3)).get("parentSheetIdentifier", "0").strip() == "0"
                  and f"\nparentSheetIdentifier {_campos(m.group(3)).get('uniqueObjectIdentifier', '').strip()}\n" in L), None)
    if bloco is None:
        raise ErroMotor(f"{nome_lib} não tem um subcircuito na folha principal")
    uid = _campos(bloco.group(3)).get("uniqueObjectIdentifier", "").strip()
    L = _sem_rotulos_de_fora(L, uid)                     # um arquivo da biblioteca de antes ainda traz os nomes de fora
    bloco = next(m for m in BLOCO_EL.finditer(L) if _campos(m.group(3)).get("uniqueObjectIdentifier", "").strip() == uid)
    folhas = subarvore(L, uid)
    els = [bloco.group(0)] + [m.group(0) for m in BLOCO_EL.finditer(L) if _campos(m.group(3)).get("parentSheetIdentifier", "0").strip() in folhas]
    fios = [m.group(0) for m in BLOCO_FIO.finditer(L) if _campos(m.group(2)).get("parentSheetIdentifier", "0").strip() in folhas]
    novo = "".join(els)
    novos_fios = "".join(fios)
    # identificadores novos (os de antes podem existir no circuito aberto), em tudo o que os cita
    velhos = set(re.findall(r"\nuniqueObjectIdentifier (\S+)", novo))
    usados = set(re.findall(r"\nuniqueObjectIdentifier (\S+)", t))
    for v in velhos:
        n = str(random.randint(-2**62, 2**62))
        while n in usados:
            n = str(random.randint(-2**62, 2**62))
        usados.add(n)
        troca = lambda txt: re.sub(r"(?<![\d-])" + re.escape(v) + r"(?!\d)", n, txt)
        novo, novos_fios = troca(novo), troca(novos_fios)
    # o bloco: nome novo (SUBCIRCUIT.k, como o Gecko nomeia), posição e folha de destino
    ks = [int(k) for k in re.findall(r"\nidStringDialog SUBCIRCUIT\.(\d+)\n", t)]
    nome = f"SUBCIRCUIT.{max(ks, default=0) + 1}"
    cab, resto = novo[:len(els[0])], novo[len(els[0]):]
    cab = re.sub(r"\nidStringDialog [^\n]*", f"\nidStringDialog {nome}", cab, count=1)
    cab = re.sub(r"\nx [^\n]*", f"\nx {int(x)}", cab, count=1)
    cab = re.sub(r"\ny [^\n]*", f"\ny {int(y)}", cab, count=1)
    cab = re.sub(r"\nparentSheetIdentifier [^\n]*", f"\nparentSheetIdentifier {folha}", cab, count=1)
    # junto ao fim dos blocos do circuito aberto; as conexões, no começo (como o Gecko lê: por nome do bloco)
    ultimo = max((m.end() for m in BLOCO_EL.finditer(t)), default=None)
    if ultimo is None:
        t2 = novos_fios + t + cab + resto
    else:
        t2 = novos_fios + t[:ultimo] + cab + resto + t[ultimo:]
    # variáveis $ do subcircuito que o circuito aberto não tem
    gl, gt = _globais(L), _globais(t2)
    faltam = [(k, v) for k, v in zip(*gl) if k not in gt[0]] if gl and gt else []
    if faltam:
        t2 = re.sub(r"\noptimizerName\[\] ([^\n]*)", lambda m: "\noptimizerName[] " + m.group(1).rstrip() + "".join("/" + k for k, _ in faltam), t2, count=1)
        t2 = re.sub(r"\noptimizerValue\[\] ([^\n]*)", lambda m: "\noptimizerValue[] " + m.group(1).rstrip() + " " + " ".join(v for _, v in faltam) + " ", t2, count=1)
    elif gl and not gt and gl[0]:
        raise ErroMotor("o circuito aberto não tem a lista de variáveis globais para receber as do subcircuito")
    arq = ESTADO.with_name("biblioteca_inserido.ipes")
    arq.write_bytes(gzip.compress(t2.encode()) if gz else t2.encode())
    abre(arq)
    r = estado()
    e = next((x for x in r["folhas"].get(folha, {"elementos": []})["elementos"] if x["nome"] == nome), None)
    if e is None or e["uid"] not in r["folhas"]:
        raise ErroMotor("o Gecko não aceitou o subcircuito")
    r["inserido"] = nome
    r["globais_novas"] = [k for k, _ in faltam]
    return r


# ---------------------------------------------------------------- copiar, recortar e colar (Ctrl+C, Ctrl+X, Ctrl+V na tela)
# O Gecko não copia pela interface remota: como na biblioteca, o servidor guarda o bloco do componente (de um subcircuito,
# o bloco e tudo o que está dentro, com as conexões de dentro) e colar o insere com nome e identificadores novos, na folha
# e no ponto pedidos; o Gecko reabre e confere. A cópia não leva os rótulos de nó de fora (ligaria por rótulo, sem fio à
# vista, aos nós do original); colada noutra folha, um GATE ou amperímetro perde o acoplamento (a chave ou o componente
# dele são da folha de origem). A área de transferência fica no servidor: vale entre as janelas e entre circuitos.
COPIA = ESTADO.with_name("copia.json")


def _pts_fio(corpo):
    d = _campos(corpo)
    return list(zip(map(int, d.get("x[]", "").split()), map(int, d.get("y[]", "").split())))


def _blocos_grupo(t, nomes, fios, folha):
    """Os blocos dos componentes (pelo nome, na folha) e das conexões (pelos pontos) de uma seleção."""
    els = {}
    for m in BLOCO_EL.finditer(t):
        d = _campos(m.group(3))
        n = d.get("idStringDialog", "").strip()
        if n in nomes and d.get("parentSheetIdentifier", "0").strip() == folha:
            els[n] = m
    faltam = [n for n in nomes if n not in els]
    if faltam:
        raise ErroMotor(f"não achei {', '.join(faltam)} nesta folha")
    alvo = {tuple(map(tuple, p)) for p in fios}
    fs = [m for m in BLOCO_FIO.finditer(t) if _campos(m.group(2)).get("parentSheetIdentifier", "0").strip() == folha
          and (tuple(_pts_fio(m.group(2))) in alvo or tuple(_pts_fio(m.group(2))[::-1]) in alvo)]
    if len(fs) < len(alvo):
        raise ErroMotor("não achei todas as conexões da seleção nesta folha")
    return [els[n] for n in nomes], fs


def _desloca_fio(bloco, dx, dy, folha=None):
    """Uma conexão andando (dx, dy) (e, se pedido, para outra folha)."""
    b = re.sub(r"\nx\[\] ([^\n]*)", lambda m: "\nx[] " + " ".join(str(int(v) + dx) for v in m.group(1).split()) + " ", bloco, count=1)
    b = re.sub(r"\ny\[\] ([^\n]*)", lambda m: "\ny[] " + " ".join(str(int(v) + dy) for v in m.group(1).split()) + " ", b, count=1)
    return re.sub(r"\nparentSheetIdentifier [^\n]*", f"\nparentSheetIdentifier {folha}", b, count=1) if folha is not None else b


def copia_grupo(nomes, fios, folha):
    """Guarda a cópia de componentes (de um subcircuito, com o que tem dentro) e das conexões selecionadas."""
    if not nomes and not fios:
        raise ErroMotor("nada selecionado para copiar")
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, _ = _texto(ESTADO)
    folha = folhas_ok([folha], t)[0]
    els, fs = _blocos_grupo(t, nomes, fios, folha)
    itens = []
    for nome, alvo in zip(nomes, els):
        uid = _campos(alvo.group(3)).get("uniqueObjectIdentifier", "").strip()
        eh_sub = alvo.group(2) == "SPECIAL" and _campos(alvo.group(3)).get("typ", "").strip() == "27"
        folhas = subarvore(t, uid) if eh_sub else set()   # um subcircuito leva a folha dele (e as de dentro dela)
        itens.append(dict(nome=nome, bloco=alvo.group(0), folhas=sorted(folhas),
                          dentro=[m.group(0) for m in BLOCO_EL.finditer(t) if _campos(m.group(3)).get("parentSheetIdentifier", "0").strip() in folhas],
                          fios=[m.group(0) for m in BLOCO_FIO.finditer(t) if _campos(m.group(2)).get("parentSheetIdentifier", "0").strip() in folhas],
                          x=int(_campos(alvo.group(3)).get("x", "0")), y=int(_campos(alvo.group(3)).get("y", "0"))))
    pts = [(it["x"], it["y"]) for it in itens] + [p for m in fs for p in _pts_fio(m.group(2))]
    COPIA.write_text(json.dumps(dict(itens=itens, fios=[m.group(0) for m in fs], folha=folha, globais=_globais(t),
                                     ref=[min(p[0] for p in pts), min(p[1] for p in pts)])))
    return dict(copiado=nomes, fios=len(fs), dentro=sum(len(it["dentro"]) for it in itens))


def cola_grupo(x, y, folha, folhas=None):
    """Insere a cópia guardada com o canto de cima à esquerda em (x, y): nomes e identificadores novos (as referências de
    dentro do grupo, como o GATE e a chave dele, acompanham), sem os rótulos de nó de fora; as conexões copiadas andam junto.
    folhas: colar em vários subcircuitos iguais de uma vez (o "mudar os N juntos" dentro de um SM; Marcelo, 19/10: o Ctrl+V
    só ia para o SM aberto e ele deixava de ser igual aos outros): a mesma posição e o MESMO nome em todos (livre em cada um),
    para continuarem iguais; um passo do desfazer."""
    try:
        c = json.loads(COPIA.read_text())
    except (OSError, ValueError):
        raise ErroMotor("nada copiado ainda (selecione e Ctrl+C)")
    if "itens" not in c:                               # cópia da versão anterior (um componente só)
        c = dict(itens=[dict(nome=c["nome"], bloco=c["bloco"], dentro=c.get("dentro", []), fios=c.get("fios", []), folhas=c.get("folhas", []),
                             x=c["x"], y=c["y"])], fios=[], folha=c["folha"], globais=c.get("globais"), ref=[c["x"], c["y"]])
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, gz = _texto(ESTADO)
    alvos = folhas_ok(list(folhas) if folhas else [folha], t)
    if folha not in alvos:
        alvos = [str(folha)] + alvos
    for f_ in alvos:
        if any(f_ in it["folhas"] for it in c["itens"]):
            raise ErroMotor("um subcircuito não vai dentro dele mesmo: cole noutra folha")
    dx, dy = int(x) - c["ref"][0], int(y) - c["ref"][1]
    usados = set(re.findall(r"\nuniqueObjectIdentifier (\S+)", t))
    # nomes: um componente só numa folha, o de antes se livre (recortar e colar não muda o nome), senão o próximo da série
    # (R.3 → R.k) em todo o circuito; em vários subcircuitos, o mesmo nome em todos, livre em cada um
    if len(alvos) == 1:
        tomados = [set(re.findall(r"\nidStringDialog ([^\n]*)", t))]
    else:
        tomados = [{_campos(m_.group(3)).get("idStringDialog", "").strip() for m_ in BLOCO_EL.finditer(t)
                    if _campos(m_.group(3)).get("parentSheetIdentifier", "0").strip() == f_} for f_ in alvos]
    livre = lambda n_: all(n_ not in tm for tm in tomados)
    mapa = {}
    for it in c["itens"]:
        velho = it["nome"]
        m = re.match(r"^(.*)\.(\d+)$", velho)
        if livre(velho):
            novo = velho
        elif m:
            k = max([int(x_.group(1)) for tm in tomados for x_ in (re.match(re.escape(m.group(1)) + r"\.(\d+)$", n_) for n_ in tm) if x_] + [0]) + 1
            while not livre(f"{m.group(1)}.{k}"):
                k += 1
            novo = f"{m.group(1)}.{k}"
        else:
            k = 2
            while not livre(f"{velho}_{k}"):
                k += 1
            novo = f"{velho}_{k}"
        for tm in tomados:
            tm.add(novo)
        mapa[velho] = novo
    todos_blocos, todos_fios = "", ""
    for folha_ in alvos:                               # uma cópia em cada folha, com identificadores novos em cada uma
        cabs = [it["bloco"] for it in c["itens"]]
        restos = ["".join(it["dentro"]) for it in c["itens"]]
        fios_dentro = ["".join(it["fios"]) for it in c["itens"]]
        fios_sel = [_desloca_fio(f, dx, dy, folha_) for f in c["fios"]]
        novos = set()
        for v in set(re.findall(r"\nuniqueObjectIdentifier (\S+)", "".join(cabs + restos))):
            n = str(random.randint(-2**62, 2**62))
            while n in usados:
                n = str(random.randint(-2**62, 2**62))
            usados.add(n)
            novos.add(n)
            troca = lambda txt, v=v, n=n: re.sub(r"(?<![\d-])" + re.escape(v) + r"(?!\d)", n, txt)
            cabs, restos, fios_dentro, fios_sel = [troca(x_) for x_ in cabs], [troca(x_) for x_ in restos], [troca(x_) for x_ in fios_dentro], [troca(x_) for x_ in fios_sel]
        for i, it in enumerate(c["itens"]):
            cab = cabs[i]
            cab = re.sub(r"\nidStringDialog [^\n]*", f"\nidStringDialog {mapa[it['nome']]}", cab, count=1)
            cab = re.sub(r"\nx [^\n]*", f"\nx {it['x'] + dx}", cab, count=1)
            cab = re.sub(r"\ny [^\n]*", f"\ny {it['y'] + dy}", cab, count=1)
            cab = re.sub(r"\nparentSheetIdentifier [^\n]*", f"\nparentSheetIdentifier {folha_}", cab, count=1)
            cab = _tira_rotulos(_tira_rotulos(cab, "labelAnfangsKnoten"), "labelEndKnoten")   # sem ligar por rótulo aos nós do original
            ref = re.search(r"\ncoupledReferenceID\[\] (\S+)", cab)
            if ref and ref.group(1) in novos:          # acoplado a outro membro do grupo: o nome dele no texto também muda
                cab = re.sub(r"\nparameterString\[\] ([^\n]*)", lambda m_: "\nparameterString[] " + "/".join(mapa.get(p_, p_) for p_ in m_.group(1).split("/")), cab, count=1)
            elif ref and ref.group(1) != "0" and folha_ != c["folha"]:   # acoplado a um componente da folha de origem: lá ele não existe
                cab = re.sub(r"\ncoupledReferenceID\[\] [^\n]*", "\ncoupledReferenceID[] 0 ", cab)
                cab = re.sub(r"\ncopyCoupledReferenceID\[\] [^\n]*", "\ncopyCoupledReferenceID[] 0 ", cab)
                cab = re.sub(r"\nparameterString\[\] /[^/\n]*", "\nparameterString[] /NIX_NIX_NIX", cab, count=1)
            cabs[i] = cab
        blocos = "".join(cabs) + "".join(restos)
        for cab in cabs:                                 # um subcircuito colado: os terminais de dentro também sem os nomes de fora
            if "<ElementSPECIAL>" in cab and re.search(r"\ntyp 27\s*\n", cab):
                blocos = _sem_rotulos_de_fora(blocos, re.search(r"\nuniqueObjectIdentifier (\S+)", cab).group(1))
        todos_blocos += blocos
        todos_fios += "".join(fios_dentro) + "".join(fios_sel)
    ultimo = max((m_.end() for m_ in BLOCO_EL.finditer(t)), default=None)
    t2 = todos_fios + (t + todos_blocos if ultimo is None else t[:ultimo] + todos_blocos + t[ultimo:])
    gl, gt = c.get("globais"), _globais(t2)                  # variáveis $ que o circuito de destino não tem (veio de outro)
    faltam = [(k_, v) for k_, v in zip(*gl) if k_ not in gt[0]] if gl and gt else []
    if faltam:
        t2 = re.sub(r"\noptimizerName\[\] ([^\n]*)", lambda m_: "\noptimizerName[] " + m_.group(1).rstrip() + "".join("/" + k_ for k_, _ in faltam), t2, count=1)
        t2 = re.sub(r"\noptimizerValue\[\] ([^\n]*)", lambda m_: "\noptimizerValue[] " + m_.group(1).rstrip() + " " + " ".join(v for _, v in faltam) + " ", t2, count=1)
    arq = ESTADO.with_name("colado.ipes")
    arq.write_bytes(gzip.compress(t2.encode()) if gz else t2.encode())
    abre(arq)
    r = estado()
    for folha_ in alvos:
        presentes = {e["nome"] for e in r["folhas"].get(folha_, {"elementos": []})["elementos"]}
        if not all(n in presentes for n in mapa.values()):
            raise ErroMotor("o Gecko não aceitou o que foi colado")
    r["colado"] = [mapa[it["nome"]] for it in c["itens"]]
    r["colado_em"] = alvos
    r["fios_colados"] = [[[a + dx, b + dy] for a, b in _pts_fio(re.search(r"<Verbindung>\n(.*?)<\\Verbindung>", f_, re.S).group(1))] for f_ in c["fios"]]
    r["globais_novas"] = [k_ for k_, _ in faltam]
    return r


def move_grupo(nomes, fios, dx, dy, folha, para=None):
    """Componentes e conexões selecionados andando juntos (dx, dy): as conexões de dentro do grupo vão junto, nada se solta.
    para=(x, y): um componente só, para esse ponto. O Gecko não aceita x nem y menor que 1 (põe em 1, sem avisar:
    getCheckedSheetPosition) — o caso do Marcelo (18/10): as fontes em x = 1, arrastadas para a esquerda, voltavam. Na
    folha principal, o que passar da beira de cima ou da esquerda abre espaço: o circuito todo anda para a direita e para
    baixo o que faltar (r["deslocado"] = [sx, sy]; a tela anda a vista junto e nada pula)."""
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, gz = _texto(ESTADO)
    folha = folhas_ok([folha], t)[0]
    els, fs = _blocos_grupo(t, nomes, fios, folha)
    if para is not None:
        d = _campos(els[0].group(3))
        dx, dy = para[0] - int(d.get("x", "0")), para[1] - int(d.get("y", "0"))
    sx = sy = 0
    if folha == "0" and els:
        sx = max(0, 1 - min(int(_campos(m.group(3)).get("x", "0")) + dx for m in els))
        sy = max(0, 1 - min(int(_campos(m.group(3)).get("y", "0")) + dy for m in els))
    no_grupo = {m.start() for m in els} | {m.start() for m in fs}
    outros_els = [m for m in BLOCO_EL.finditer(t) if (sx or sy) and m.start() not in no_grupo
                  and _campos(m.group(3)).get("parentSheetIdentifier", "0").strip() == "0"]
    outros_fs = [m for m in BLOCO_FIO.finditer(t) if (sx or sy) and m.start() not in no_grupo
                 and _campos(m.group(2)).get("parentSheetIdentifier", "0").strip() == "0"]
    trocas = []
    for m, ex, ey in [(m, dx + sx, dy + sy) for m in els] + [(m, sx, sy) for m in outros_els]:
        d = _campos(m.group(3))
        b = re.sub(r"\nx [^\n]*", f"\nx {int(d.get('x', '0')) + ex}", m.group(0), count=1)
        trocas.append((m.start(), m.end(), re.sub(r"\ny [^\n]*", f"\ny {int(d.get('y', '0')) + ey}", b, count=1)))
    trocas += [(m.start(), m.end(), _desloca_fio(m.group(0), dx + sx, dy + sy)) for m in fs]
    trocas += [(m.start(), m.end(), _desloca_fio(m.group(0), sx, sy)) for m in outros_fs]
    t2, fim = [], 0
    for a, b, novo in sorted(trocas):
        t2 += [t[fim:a], novo]
        fim = b
    arq = ESTADO.with_name("grupo.ipes")
    txt = "".join(t2) + t[fim:]
    arq.write_bytes(gzip.compress(txt.encode()) if gz else txt.encode())
    abre(arq)
    r = estado()
    if sx or sy:
        r["deslocado"] = [sx, sy]
    return r


def apaga_grupo(nomes, fios, folha):
    """Apaga a seleção: as conexões pelo arquivo (o Gecko reabre) e os componentes pelo Gecko (um subcircuito leva o que
    tem dentro; um terminal de SM leva o borne do bloco)."""
    MOTOR.cmd(f"SAVEAS {ESTADO}")
    t, gz = _texto(ESTADO)
    folha = folhas_ok([folha], t)[0]
    _, fs = _blocos_grupo(t, [], fios, folha)
    if fs:
        t2, fim = [], 0
        for m in sorted(fs, key=lambda m_: m_.start()):
            t2 += [t[fim:m.start()]]
            fim = m.end()
        arq = ESTADO.with_name("grupo.ipes")
        txt = "".join(t2) + t[fim:]
        arq.write_bytes(gzip.compress(txt.encode()) if gz else txt.encode())
        abre(arq)
    sm = None if folha == "0" else next((f["nome"] for k, f in (editor.get("ultimo") or estado())["folhas"].items() if k == folha), None)
    for n in nomes:
        MOTOR.cmd(f"DELETE {n if sm is None else sm + '#' + n}")
    return estado()


def apaga_arquivo(rel):
    """Circuito salvo pelo MaiSim ou subcircuito da biblioteca: vai para a .lixeira da pasta dele (não some)."""
    arq = (RAIZ / str(rel)).resolve()
    pastas = [SALVOS.resolve(), LIB.resolve()]
    if arq.suffix != ".ipes" or not arq.is_file() or arq.parent not in pastas:
        raise ErroMotor("só dá para apagar circuitos salvos pelo MaiSim e subcircuitos da biblioteca")
    lixo = arq.parent / ".lixeira"
    lixo.mkdir(exist_ok=True)
    dest = lixo / f"{arq.stem}_{time.strftime('%Y%m%d-%H%M%S')}.ipes"
    arq.rename(dest)
    return dict(apagado=relativo(arq), lixeira=relativo(dest), biblioteca=lista_biblioteca())


def pastas_extras():
    """[(nome do grupo, pasta)]: as de MAISIM_PASTAS_CIRCUITOS ("nome=pasta" ou só a pasta, separadas por ":"; sem nome, o
    da pasta) e, se o GeckoCIRCUITS original foi baixado (gecko/construir.sh), os exemplos que vêm com ele."""
    r = []
    for x in os.environ.get("MAISIM_PASTAS_CIRCUITOS", "").split(os.pathsep):
        nome, _, p = x.strip().rpartition("=")
        p = Path(p).expanduser() if p else None
        if p and p.is_dir():
            r.append((nome.strip() or p.name, p.resolve()))
    g = RAIZ / "gecko" / "build" / "GeckoCIRCUITS" / "resources"
    if g.is_dir():
        r.append(("exemplos do GeckoCIRCUITS", g.resolve()))
    return r


def lista_modelos():
    """Os circuitos que dá para abrir, em grupos: os exemplos (do repositório), os seus (salvos pelo editor), a biblioteca
    de subcircuitos, as pastas extras. Cada um: arq (a chave: relativo à raiz, ou absoluto fora dela), nome (dentro da
    pasta do grupo), grupo, apagavel (só os seus e os da biblioteca: vão para a .lixeira) e a pasta de gravação deles."""
    itens, vistos = [], set()
    def poe(grupo, pasta, arqs, gravacao=None):
        for f in sorted(arqs):
            if f.resolve() in vistos or any(s.startswith(".") for s in f.relative_to(pasta).parts):
                continue
            vistos.add(f.resolve())
            itens.append(dict(arq=relativo(f), nome=str(f.relative_to(pasta)), grupo=grupo, apagavel=bool(gravacao), pasta=gravacao))
    poe("exemplos", MODELOS, MODELOS.glob("*.ipes"))
    poe("meus circuitos", SALVOS, SALVOS.glob("*.ipes"), "circuitos")
    poe("biblioteca de subcircuitos", LIB, LIB.glob("*.ipes"), "subcircuitos")
    for nome, p in pastas_extras():                  # até três níveis de subpastas (ex.: a pasta de cada circuito)
        poe(nome, p, [f for f in p.rglob("*.ipes") if len(f.relative_to(p).parts) <= 4])
    return itens


def modelo_ok(arq):
    """Um .ipes que o MaiSim pode abrir: nos exemplos, nos seus circuitos, na biblioteca ou numa das pastas extras."""
    return any(p.resolve() in arq.parents for p in (MODELOS, SALVOS, LIB, *(d for _, d in pastas_extras())))


def relativo(arq):
    """Caminho relativo à raiz do projeto (os exemplos); fora dela (as pastas de dados), o absoluto."""
    try:
        return str(Path(arq).relative_to(RAIZ))
    except ValueError:
        return str(arq)


def fonte_sinal(nome, sinal, folhas=None):
    """Fonte (U ou I) controlada por sinal (tipo 400): o valor vem do sinal de controle com este rótulo, na mesma folha
    (SimulationsKern.definiereInteraktion_SignalgesteuerteQuelle_Regler: parameterString[0]). A interface remota não
    escreve esse campo: tipo pela interface, rótulo pelo arquivo (como nos medidores); o Gecko reabre e confere."""
    if not sinal or not ROTULO.match(sinal):
        raise ErroMotor("o sinal de controle é um rótulo (letras, números, _ . $ + -)")
    folhas = [str(f) for f in (folhas or ["0"])]
    ult = editor.get("ultimo") or estado()
    for f in folhas:
        fl = ult["folhas"].get(f)
        if fl is None:
            raise ErroMotor(f"folha desconhecida: {f}")
        MOTOR.cmd(f"SETP {nome if f == '0' else fl['nome'] + '#' + nome} type 400")
    return acopla(nome, [sinal, "NIX_NIX_NIX", "0"], folhas=folhas, dominio="LK")


# ---------------------------------------------------------------- controle (painel "Controle" do /maisim/simu)
# O código Python do usuário roda num processo à parte (controle_worker.py). A cada Ts o laço da rodada lê as medidas
# (GETM), chama passo(t, m, p, e), escreve as atuações nos blocos CONST marcados (SETM, parâmetro "const") e anda Ts no
# Gecko. A configuração fica numa cópia de trabalho (cache) e, ao salvar o circuito, ao lado do .ipes
# (<nome>.controle.json); ao abrir um modelo, vem a dele (ou a padrão). A rodada guarda controle.py/.json/.log.
# Atraso: o circuito sente a atuação em t + d·Δt (d do painel) em todo destino que der — o servidor segue cada CONST até a
# chave ou a fonte (destinos_controle) e desconta o atraso próprio do Gecko no instante da escrita. Guia: GUIA_CONTROLE.md.
CONTROLE = ESTADO.with_name("controle.json")
MODELO_CONTROLE = (Path(__file__).parent / "controle_modelo.py").read_text()
# o circuito novo vem com o caminho de um DSP: leitura (ADC) → controle → escrita (PWM/DAC); os módulos (todo .py que não é
# controlador) rodam no processo de quem os importa, na mesma amostra (pedido de Marcelo, 19/10)
MODELO_LEITURA = (Path(__file__).parent / "leitura_modelo.py").read_text()
MODELO_ESCRITA = (Path(__file__).parent / "escrita_modelo.py").read_text()
MODELO_MODULO = (Path(__file__).parent / "modulo_modelo.py").read_text()
IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class ErroControle(ErroMotor):
    def __init__(self, msg, linha=None, rastro="", arquivo=None, instancia=None):
        arquivo = arquivo or "controle.py"
        super().__init__(f"{arquivo}{f' linha {linha}' if linha else ''}{f' ({instancia})' if instancia else ''}: {msg}")
        self.linha, self.rastro, self.arquivo, self.instancia = linha, rastro, arquivo, instancia


ATRASOS = ("logo", "amostra", "tempo")       # atuação em t + Δt (logo), em t + Ts (amostra seguinte) ou em t + τ


def controle_padrao():
    return {"ativo": False, "Ts": 1e-4, "atuacoes": [], "parametros": [], "codigo": MODELO_CONTROLE,
            "atraso": {"modo": "logo", "tempo": 0.0}, "acionamentos": [],
            "arquivos": {"leitura.py": MODELO_LEITURA, "escrita.py": MODELO_ESCRITA}, "controladores": [],
            "rede": {"latencia": 0.0}}


def completa_controle(salvo):
    """Uma configuração guardada: o que faltar vem do padrão, menos os arquivos — um controle de antes dos módulos continua
    como era (sem ganhar o leitura.py e o escrita.py do circuito novo, que o código dele não importa)."""
    if not isinstance(salvo, dict) or "codigo" not in salvo:
        return controle_padrao()
    return {**controle_padrao(), "arquivos": {}, **salvo}


# Vários controladores (passo 1 do controle distribuído): além do controle.py, outros arquivos .py ("arquivos"); cada
# controlador da lista ("controladores") tem um arquivo, as medidas que lê e as atuações que escreve — ou vale em
# subcircuitos: uma instância por subcircuito, com a visão dele sem o prefixo (o mesmo código para todos). Eles conversam
# por mensagens (envia/recebe) com a latência da rede ("rede"). Sem controladores na lista: controle.py vê tudo (o de sempre).
ARQ_PY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,40}\.py$")
NOME_SINAL = re.compile(r"^[A-Za-z0-9_]{1,80}$")


def enxuga_controladores(c):
    """Só o controle.py na lista ("controle", sem subcircuitos): é o de sempre — lê todas as medidas e escreve as atuações
    marcadas. A lista volta vazia: um controlador só não tem por que ler menos (e uma página desatualizada que grave a lista
    com ele lendo nada não quebra o controle)."""
    cs = c.get("controladores") or []
    if len(cs) == 1 and cs[0]["nome"] == "controle" and cs[0]["arquivo"] == "controle.py" and not cs[0]["subcircuitos"]:
        c["controladores"] = []
    return c


def arquivos_de(c):
    """Os arquivos do controle: {nome.py: código}, o controle.py primeiro."""
    return {"controle.py": c["codigo"], **{k: v for k, v in (c.get("arquivos") or {}).items() if k != "controle.py"}}


def arquivos_controladores(c):
    """Os .py que rodam como controlador (um processo cada): os da lista; sem lista, só o controle.py (o de sempre)."""
    return {q["arquivo"] for q in c.get("controladores") or []} or {"controle.py"}


def modulos_de(c):
    """Os módulos: todo .py da árvore que não é código de controlador (nem o controle.py). Quem importa chama, no processo
    dele e na mesma amostra (sem atraso); cada controlador tem a sua cópia (sem memória comum)."""
    ctl = arquivos_controladores(c)
    return {k: v for k, v in arquivos_de(c).items() if k not in ctl and k != "controle.py"}


# os riscos do fluxo de arquivos (pedido de Marcelo: "vamos só alertar aos riscos"): erros impedem rodar (o import falharia
# ou o nome esconde um módulo do Python); avisos ficam na tela (módulo que ninguém importa, ciclo, módulo com cara de
# controlador, o mesmo módulo em dois controladores)
NOMES_RESERVADOS = set(sys.stdlib_module_names) | {"numpy", "scipy", "controle", "controle_worker", "scope", "envia", "recebe"}


def _importavel(nome):
    """Um módulo do Python ou instalado (fora a pasta do MaiSim, que o processo do controle não enxerga)."""
    if nome in sys.stdlib_module_names:
        return True
    import importlib.util
    try:
        spec = importlib.util.find_spec(nome)
    except (ImportError, ValueError):
        return False
    return bool(spec) and not (spec.origin and Path(spec.origin).resolve().parent == AQUI.resolve())


def ordem_do_fluxo(arqs, mods, ctl, imports):
    """A ordem de uma amostra, como num DSP (pedido de Marcelo, 19/10: "um padrão de como cada .py conversa, na ordem
    certa; o Claude manjar disso e sempre corrigir"): no passo() de cada controlador, leitura.passo() é a 1ª chamada de
    módulo e escrita.passo() a última, e o return devolve o que o escrita devolveu; todo módulo chamado no passo() é
    iniciado no iniciar(). Avisos (a tela e o CONTEXTO.md do Claude mostram)."""
    import ast
    avisos = []
    for arq in sorted(ctl & set(arqs)):
        try:
            arv = ast.parse(arqs[arq])
        except SyntaxError:
            continue
        nomes_mod = {n for n, _ in imports.get(arq, []) if n + ".py" in mods}
        funcs = {f.name: f for f in arv.body if isinstance(f, ast.FunctionDef)}
        def chamadas(fn, metodo):
            out = []
            for n in ast.walk(fn):
                if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == metodo \
                        and isinstance(n.func.value, ast.Name) and n.func.value.id in nomes_mod:
                    out.append((n.lineno, n.col_offset, n.func.value.id, n))
            return sorted(out, key=lambda x: (x[0], x[1]))
        passo = funcs.get("passo")
        if not passo:
            continue
        cs = chamadas(passo, "passo")
        ordem = [x[2] for x in cs]
        if "leitura" in ordem and ordem[0] != "leitura":
            avisos.append(f"{arq} linha {cs[0][0]}: leitura.passo() deve ser a 1ª chamada do passo() (ler antes de calcular; aqui vem {ordem[0]}.passo() antes)")
        if "escrita" in ordem:
            if ordem[-1] != "escrita":
                avisos.append(f"{arq} linha {cs[-1][0]}: escrita.passo() deve ser a última chamada do passo() (escrever depois de calcular; aqui vem {ordem[-1]}.passo() depois)")
            chamada = next(x[3] for x in reversed(cs) if x[2] == "escrita")
            ligados = {t.id for n in ast.walk(passo) if isinstance(n, ast.Assign) and n.value is chamada for t in n.targets if isinstance(t, ast.Name)}
            rets = [n for n in ast.walk(passo) if isinstance(n, ast.Return) and n.value is not None]
            if not rets or not all(r.value is chamada or (isinstance(r.value, ast.Name) and r.value.id in ligados) for r in rets):
                avisos.append(f"{arq}: o return de passo() não é o que o escrita.passo() devolve — os limites do atuador (saturação, resolução) ficam de fora")
        ini = funcs.get("iniciar")
        iniciados = {x[2] for x in chamadas(ini, "iniciar")} if ini else set()
        for m in sorted(set(ordem)):
            tem_iniciar = any(isinstance(f, ast.FunctionDef) and f.name == "iniciar" for f in (ast.parse(mods[m + ".py"]).body if _sintaxe_ok(mods[m + ".py"]) else []))
            if tem_iniciar and m not in iniciados:
                avisos.append(f"{arq}: {m}.iniciar() não é chamado no iniciar() — o estado do {m} não começa (e[\"{m}\"] = {m}.iniciar(p))")
    return avisos


def _sintaxe_ok(cod):
    try:
        compile(cod, "x", "exec", flags=0x400, dont_inherit=True)
        return True
    except SyntaxError:
        return False


def analisa_modulos(c):
    import ast
    arqs, mods, ctl = arquivos_de(c), modulos_de(c), arquivos_controladores(c)
    erros, avisos, imports = [], [], {}
    for k in mods:
        if k[:-3] in NOMES_RESERVADOS:
            erros.append({"arquivo": k, "linha": 1, "coluna": 1, "msg": f"o nome {k[:-3]} é de um módulo do Python (ou do MaiSim): renomeie o arquivo"})
    for arq, cod in arqs.items():
        try:
            arv = ast.parse(cod)
        except SyntaxError:
            continue
        im = []
        for n in ast.walk(arv):
            if isinstance(n, ast.Import):
                im += [(a.name.split(".")[0], n.lineno) for a in n.names]
            elif isinstance(n, ast.ImportFrom) and n.module and not n.level:
                im.append((n.module.split(".")[0], n.lineno))
        imports[arq] = im
        for nome, lin in im:
            if nome + ".py" in ctl and nome + ".py" != arq:
                erros.append({"arquivo": arq, "linha": lin, "coluna": 1, "msg": f"import {nome}: {nome}.py é um controlador (roda à parte, com atraso); "
                              "para chamar na mesma amostra, faça dele um módulo"})
            elif nome + ".py" not in mods and not _importavel(nome):
                erros.append({"arquivo": arq, "linha": lin, "coluna": 1, "msg": f"import {nome}: não há {nome}.py na árvore (nem é um módulo do Python)"})
        if arq in mods:
            f = next((n for n in arv.body if isinstance(n, ast.FunctionDef) and n.name == "passo"), None)
            if f and [a.arg for a in f.args.args] == ["t", "m", "p", "e"]:
                avisos.append(f"{arq}: passo(t, m, p, e) é a assinatura de um controlador; um módulo é chamado por quem o importa "
                              "(passo(entrada, p, estado)) — se ele deve rodar sozinho, faça dele um controlador na árvore")
    avisos += ordem_do_fluxo(arqs, mods, ctl, imports)
    filhos = {a: [n + ".py" for n, _ in imports.get(a, []) if n + ".py" in mods] for a in arqs}
    alcance, fila = set(), [a for a in ctl if a in arqs]
    while fila:
        for m in filhos.get(fila.pop(), []):
            if m not in alcance:
                alcance.add(m); fila.append(m)
    avisos += [f"{k} (módulo) não é importado por nenhum controlador: não roda" for k in mods if k not in alcance]
    ciclos, cor = set(), {}
    def anda(a, pilha):
        cor[a] = 1
        for m in filhos.get(a, []):
            if cor.get(m) == 1:
                ciclos.add(" → ".join(pilha[pilha.index(m):] + [m]))
            elif not cor.get(m):
                anda(m, pilha + [m])
        cor[a] = 2
    for k in mods:
        if not cor.get(k):
            anda(k, [k])
    avisos += [f"import em ciclo: {x} (o Python importa pela metade: evite)" for x in sorted(ciclos)]
    if len(ctl) > 1:
        for m in mods:
            quem = sorted(a for a in ctl if m in filhos.get(a, []))
            if len(quem) > 1:
                avisos.append(f"{m} é importado por {', '.join(quem)}: cada controlador tem a sua cópia, sem memória comum")
    return erros, avisos


def instancias_controle(c, r):
    """Os controladores como instâncias para o processo do controle: (instâncias, erros, avisos). Sem controladores na
    lista, um só: controle.py, com todas as medidas e as atuações marcadas (o de sempre). Num controlador que vale em
    subcircuitos, uma instância por subcircuito ("<controlador>_<prefixo>"), que lê as medidas e escreve as atuações
    marcadas de dentro dele com o nome sem o prefixo; as medidas e atuações da lista dele valem com o nome do circuito."""
    if not c.get("controladores"):
        return [{"nome": "controle", "arquivo": "controle.py", "codigo": c["codigo"], "medidas": None, "atuacoes": None,
                 "modulos": modulos_de(c), "outros": []}], [], []
    arqs, erros, avisos, out, dono = arquivos_de(c), [], [], [], {}
    entradas = [k for _, k in sinais_da_rodada(r)] if r else None
    atu = atuadores_disponiveis(r) if r else []
    marcadas = set(c["atuacoes"])
    for q in c["controladores"]:
        visoes = []
        for sub in q["subcircuitos"]:
            if r is None:
                erros.append(f"o controlador {q['nome']} vale em subcircuitos: abra a edição (lápis) para o MaiSim conhecê-los")
                break
            fids = [k for k, f in r["folhas"].items() if k != "0" and f["nome"] == sub]
            if not fids:
                erros.append(f"o controlador {q['nome']}: não há o subcircuito {sub}")
                continue
            pref = prefixo_sub(sub) + "_"
            med = {k[len(pref):]: k for k in entradas if k.startswith(pref)}
            at = {a["nome"][len(pref):]: a["nome"] for a in atu if a["folha"] == fids[0] and a["nome"] in marcadas and a["nome"].startswith(pref)}
            visoes.append((f"{q['nome']}_{prefixo_sub(sub)}", med, at, {"controlador": q["nome"], "subcircuito": sub}))
        if not q["subcircuitos"]:
            visoes.append((q["nome"], {}, {}, {"controlador": q["nome"]}))
        for nome, med, at, extra in visoes:
            if q.get("todas"):                           # lê todas as medidas do circuito, com o nome dele (como o de sempre)
                med = None
            for k in ([] if med is None else q["medidas"]):
                if entradas is not None and k not in entradas:
                    erros.append(f"o controlador {q['nome']} lê {k}, que não é medida do circuito")
                med[k] = k
            for k in q["atuacoes"]:
                if k not in marcadas:
                    erros.append(f"o controlador {q['nome']} escreve {k}: marque {k} em atuações")
                at[k] = k
            for k in at.values():
                if k in dono and dono[k] != nome:
                    erros.append(f"a atuação {k} é escrita por dois controladores ({dono[k]} e {nome}): cada atuação tem um dono só")
                dono.setdefault(k, nome)
            out.append({"nome": nome, "arquivo": q["arquivo"], "codigo": arqs.get(q["arquivo"], ""), "medidas": med, "atuacoes": at, "p": extra,
                        "modulos": modulos_de(c), "outros": sorted(arquivos_controladores(c) - {q["arquivo"]})})
    nomes = [i["nome"] for i in out]
    erros += [f"dois controladores com o nome {n}" for n in sorted({x for x in nomes if nomes.count(x) > 1})]
    avisos += [f"a atuação {k} está marcada, mas nenhum controlador a escreve" for k in sorted(marcadas - set(dono))]
    return out, erros, avisos


def verifica_arquivos(c, usados):
    """verifica_codigo de cada arquivo usado (os controladores: sintaxe e passo()) e dos módulos (sintaxe), e os erros do fluxo
    de imports (analisa_modulos): erros ({arquivo, linha, coluna, msg}) impedem rodar; avisos também (sem passo())."""
    erros, avisos, mods = [], [], modulos_de(c)
    for arq, cod in arquivos_de(c).items():
        if arq not in usados and arq not in mods:
            continue
        e_, a_ = verifica_codigo(cod)
        erros += [dict(x, arquivo=arq) for x in e_]
        if arq in usados:
            avisos += [x if arq == "controle.py" else f"{arq}: {x}" for x in a_]
    erros += analisa_modulos(c)[0]
    return erros, avisos


def le_controle():
    try:
        return enxuga_controladores(completa_controle(json.loads(CONTROLE.read_text())))
    except (OSError, ValueError):
        return controle_padrao()


def grava_controle(c):
    CONTROLE.parent.mkdir(parents=True, exist_ok=True)
    CONTROLE.write_text(json.dumps(c, ensure_ascii=False, indent=1))


def arquivo_controle(arq_ipes):
    arq_ipes = Path(arq_ipes)
    return arq_ipes.with_name(arq_ipes.stem + ".controle.json")


def controle_em_uso(c):
    return bool(c["ativo"] or c["atuacoes"] or c["parametros"] or c.get("acionamentos") or c["codigo"].strip() != MODELO_CONTROLE.strip()
                or c.get("arquivos") or c.get("controladores"))


def arred(x):
    """Arredonda como o Math.round da tela (meio para cima): o painel e a rodada contam os mesmos passos."""
    return int(math.floor(x + 0.5))


def passos_de_atraso(atraso, nTs, dt):
    """d, em passos de Δt, entre a amostra e o instante em que o circuito sente a atuação: 1 ≤ d ≤ n (até uma amostra).
    A escrita de cada atuação acontece antes do passo k·n + d − (atraso do Gecko até o destino dela: 0 para chave direto
    no GATE, 1 para fonte, + 1 com bloco no meio; ver destinos_controle)."""
    modo = atraso.get("modo", "logo")
    if modo == "amostra":
        return nTs
    if modo == "tempo":
        return min(nTs, max(1, arred(float(atraso.get("tempo", 0.0)) / dt)))
    return 1


# aparência dos medidores, ao lado do .ipes (<nome>.aparencia.json, como o controle): {"cores": {canal: "#rrggbb"},
# "pontas": {canal: {"+": componente, "-": componente}}} — a cor do canal (borda das marcas e meta da rodada) e em que
# componente ficam as pontas de prova do voltímetro, como se põe a ponteira no terminal de verdade (sem ponta escolhida, a
# marca vai no primeiro ponto do nó). Lê também o <nome>.cores.json antigo.
APARENCIA = ESTADO.with_name("aparencia.json")
trava_aparencia = threading.Lock()                       # cor e ponta: ler-mudar-gravar sem dois pedidos se atropelarem
COR = re.compile(r"^#[0-9a-fA-F]{6}$")


def limpa_aparencia(a):
    a = a if isinstance(a, dict) else {}
    cores = a.get("cores") if isinstance(a.get("cores"), dict) else {}
    pontas = a.get("pontas") if isinstance(a.get("pontas"), dict) else {}
    fora = a.get("fora") if isinstance(a.get("fora"), list) else []
    return {"cores": {str(k): v for k, v in cores.items() if isinstance(v, str) and COR.match(v)},
            "pontas": {str(k): {s_: c for s_, c in v.items() if s_ in ("+", "-") and isinstance(c, str) and NOME.match(c)}
                       for k, v in pontas.items() if isinstance(v, dict)},
            "fora": sorted({str(u) for u in fora if re.match(r"^-?\d+$", str(u))})}   # fora do scope e do controle (identificadores)


def le_aparencia():
    try:
        return limpa_aparencia(json.loads(APARENCIA.read_text()))
    except (OSError, ValueError):
        return limpa_aparencia({})


def grava_aparencia(a):
    APARENCIA.parent.mkdir(parents=True, exist_ok=True)
    a = limpa_aparencia(a)
    a["pontas"] = {k: v for k, v in a["pontas"].items() if v}
    APARENCIA.write_text(json.dumps(a, ensure_ascii=False, indent=1))


def le_cores():
    return le_aparencia()["cores"]


def grava_cores(c):
    a = le_aparencia(); a["cores"] = c; grava_aparencia(a)


def le_pontas():
    return le_aparencia()["pontas"]


def arquivo_aparencia(arq_ipes):
    arq_ipes = Path(arq_ipes)
    return arq_ipes.with_name(arq_ipes.stem + ".aparencia.json")


def arquivo_cores(arq_ipes):                             # o formato antigo (só cores)
    arq_ipes = Path(arq_ipes)
    return arq_ipes.with_name(arq_ipes.stem + ".cores.json")


def aparencia_do_arquivo(arq_ipes):
    """A aparência guardada ao lado do .ipes (ou a do .cores.json antigo, ou vazia)."""
    try:
        return limpa_aparencia(json.loads(arquivo_aparencia(arq_ipes).read_text()))
    except (OSError, ValueError):
        pass
    try:
        return limpa_aparencia({"cores": json.loads(arquivo_cores(arq_ipes).read_text())})
    except (OSError, ValueError):
        return limpa_aparencia({})


CANAIS_V = ("#eab308", "#06b6d4", "#d946ef", "#22c55e")   # como os canais de um osciloscópio: amarelo, ciano, magenta, verde
COR_HALL = "#0ea5e9"                                       # corrente: o azul de um sensor Hall


def cores_efetivas(r):
    """A cor de cada canal de medidor (o escolhido, ou o padrão: voltímetros na ordem dos canais do osciloscópio, amperímetros
    no azul Hall): {canal no scope: cor}. Uma fonte só para o desenho e para o meta da rodada."""
    escolhidas, out, nv = le_cores(), {}, 0
    tipos = {(e["nome"] if fid == "0" else f"{fl['nome']}#{e['nome']}"): e["tipo"] for fid, fl in r["folhas"].items() for e in fl["elementos"]}
    for el, canal in sinais_da_rodada(r):
        t = tipos.get(el)
        if t == "VOLT":
            out[canal] = escolhidas.get(canal, CANAIS_V[nv % len(CANAIS_V)]); nv += 1
        elif t == "AMP":
            out[canal] = escolhidas.get(canal, COR_HALL)
    return out


def carrega_aparencia_de(arq_ipes):
    grava_aparencia(aparencia_do_arquivo(arq_ipes))


def salva_aparencia_junto(dest):
    """Grava a aparência (cores e pontas escolhidas) ao lado do .ipes; sem nada escolhido, apaga o arquivo antigo (senão ele
    voltaria ao reabrir). O .cores.json antigo sai: agora vai tudo no .aparencia.json."""
    a = le_aparencia()
    if a["cores"] or a["pontas"] or a["fora"]:
        arquivo_aparencia(dest).write_text(json.dumps(a, ensure_ascii=False, indent=1))
    else:
        arquivo_aparencia(dest).unlink(missing_ok=True)
    arquivo_cores(dest).unlink(missing_ok=True)


def salva_controle_junto(dest):
    """Grava o controle ao lado do .ipes; sem controle em uso, apaga o arquivo antigo (senão ele voltaria ao reabrir)."""
    if controle_em_uso(le_controle()):
        arquivo_controle(dest).write_text(json.dumps(le_controle(), ensure_ascii=False, indent=1))
    else:
        arquivo_controle(dest).unlink(missing_ok=True)


def carrega_controle_de(arq_ipes):
    c = controle_padrao()
    try:
        c = completa_controle(json.loads(arquivo_controle(arq_ipes).read_text()))
    except (OSError, ValueError):
        pass
    grava_controle(c)


def verifica_codigo(codigo):
    """Erros de sintaxe (linha, coluna) e avisos (sem passo())."""
    try:
        arvore = compile(codigo, "controle.py", "exec", flags=0x400, dont_inherit=True)   # 0x400 = PyCF_ONLY_AST
    except SyntaxError as e:
        return [{"linha": e.lineno or 1, "coluna": e.offset or 1, "msg": e.msg}], []
    funcs = {n.name for n in arvore.body if n.__class__.__name__ == "FunctionDef"}
    return [], ([] if "passo" in funcs else ["o código não define passo(t, m, p, e)"])


def confere_codigo(codigo, parametros, atuacoes, entradas=None, atuadores=None, extras=()):
    """O validador do painel: o que o código pede e o painel não tem, com linha e coluna (sublinhado no editor, como aviso:
    não impede guardar nem rodar). Confere, pelo nome que o código dá aos argumentos (passo(t, m, p, e), iniciar(p, e)):
    p["x"] lido sem o parâmetro x no painel (nem Ts, nem criado no próprio código com p["x"] = …); m["x"] que não é medida do
    circuito (só com o circuito conhecido: entradas); as chaves do dicionário literal devolvido por passo() que não são
    atuação marcada (e, se o circuito é conhecido, se existem); e passo() sem os 4 argumentos."""
    try:
        arvore = compile(codigo, "controle.py", "exec", flags=0x400, dont_inherit=True)
    except SyntaxError:
        return []
    import ast
    funcs = {n.name: n for n in arvore.body if isinstance(n, ast.FunctionDef)}
    pars = {q["nome"] for q in parametros} | {"Ts"} | set(extras)
    out, linhas_cod = [], codigo.split("\n")
    def col(lin, off):                                   # o ast dá a coluna em bytes UTF-8; o editor conta caracteres
        t = linhas_cod[lin - 1] if 0 < lin <= len(linhas_cod) else ""
        return len(t.encode()[:off].decode(errors="ignore")) + 1
    def marca(no, msg):
        fim = no.end_col_offset if getattr(no, "end_lineno", no.lineno) == no.lineno and no.end_col_offset else None
        out.append({"linha": no.lineno, "coluna": col(no.lineno, no.col_offset), "fim": col(no.lineno, fim) if fim else 1000, "msg": msg})
    def anda(fn):                                        # o corpo da função, sem descer em funções, lambdas e classes de dentro
        pilha = list(ast.iter_child_nodes(fn))
        while pilha:
            no = pilha.pop()
            yield no
            if not isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
                pilha.extend(ast.iter_child_nodes(no))
    def chave(no):                                       # p["x"] → "x" (só índice literal de texto)
        sl = no.slice
        return sl.value if isinstance(sl, ast.Constant) and isinstance(sl.value, str) else None
    def nomes_args(fn):
        return [a.arg for a in fn.args.posonlyargs + fn.args.args]
    # chaves de p criadas ou conferidas no próprio código (p["x"] = …, p.setdefault("x", …), p.update(x=…) ou ({"x": …}),
    # "x" in p): não são erro
    criadas = set()
    for fn, pos in ((funcs.get("passo"), 2), (funcs.get("iniciar"), 0)):
        if fn and len(nomes_args(fn)) > pos:
            pn = nomes_args(fn)[pos]
            eh_p = lambda x: isinstance(x, ast.Name) and x.id == pn
            for no in anda(fn):
                if isinstance(no, ast.Subscript) and eh_p(no.value) and isinstance(no.ctx, ast.Store) and chave(no):
                    criadas.add(chave(no))
                elif isinstance(no, ast.Call) and isinstance(no.func, ast.Attribute) and eh_p(no.func.value):
                    if no.func.attr == "setdefault" and no.args and isinstance(no.args[0], ast.Constant) and isinstance(no.args[0].value, str):
                        criadas.add(no.args[0].value)
                    elif no.func.attr == "update":
                        criadas.update(k.arg for k in no.keywords if k.arg)
                        for a in no.args:
                            if isinstance(a, ast.Dict):
                                criadas.update(k.value for k in a.keys if isinstance(k, ast.Constant) and isinstance(k.value, str))
                elif isinstance(no, ast.Compare) and isinstance(no.left, ast.Constant) and isinstance(no.left.value, str) \
                        and any(isinstance(o, (ast.In, ast.NotIn)) for o in no.ops) and any(eh_p(c) for c in no.comparators):
                    criadas.add(no.left.value)
    passo = funcs.get("passo")
    if passo and not passo.args.vararg:
        n_arg, n_pad = len(nomes_args(passo)), len(passo.args.defaults)
        if not (n_arg - n_pad <= 4 <= n_arg):
            marca(passo, f"passo() é chamado com 4 argumentos (t, m, p, e); este recebe {n_arg}")
    for fn, pos_p, pos_m in ((passo, 2, 1), (funcs.get("iniciar"), 0, None)):
        if not fn:
            continue
        args = nomes_args(fn)
        pn = args[pos_p] if len(args) > pos_p else None
        mn = args[pos_m] if pos_m is not None and len(args) > pos_m else None
        for no in anda(fn):
            if not (isinstance(no, ast.Subscript) and isinstance(no.value, ast.Name) and isinstance(no.ctx, ast.Load)):
                continue
            k = chave(no)
            if k is None:
                continue
            if no.value.id == pn and k not in pars and k not in criadas:
                marca(no, f'p["{k}"] não existe no painel: crie o parâmetro {k} (+ parâmetro)')
            elif no.value.id == mn and entradas is not None and k not in entradas:
                marca(no, f'm["{k}"] não é medida ' + ("deste controlador" if extras else "do circuito") + (f" (medidas: {', '.join(entradas[:12])}{'…' if len(entradas) > 12 else ''})" if entradas else ""))
    if passo:
        disp = {a["nome"] for a in atuadores} if atuadores is not None else None
        for no in anda(passo):
            if isinstance(no, ast.Return) and isinstance(no.value, ast.Dict):
                for kn in no.value.keys:
                    if not (isinstance(kn, ast.Constant) and isinstance(kn.value, str)):
                        continue
                    k = kn.value
                    if k in atuacoes and (disp is None or k in disp):
                        continue
                    if disp is not None and k not in disp and extras:
                        marca(kn, f'"{k}" não é atuação deste controlador' + (f" (atuações dele: {', '.join(sorted(disp)[:12])})" if disp else " (ele não escreve nenhuma)"))
                    elif disp is not None and k not in disp:
                        marca(kn, f'"{k}" não é atuador do circuito' + (f" (atuadores: {', '.join(sorted(disp)[:12])})" if disp else " (ponha um bloco CONST)"))
                    else:
                        marca(kn, f'"{k}" não está marcado em atuações: marque no painel (senão a rodada para com erro)')
        # o fluxo com escrita.py: u = {"g": …} e return escrita.passo(u, …) — um dicionário fora do return com a chave de um
        # atuador do circuito que não está marcado (só atuadores: um dicionário qualquer não é saída)
        if disp:
            nos_ret = {id(no.value) for no in anda(passo) if isinstance(no, ast.Return) and isinstance(no.value, ast.Dict)}
            for no in anda(passo):
                if isinstance(no, ast.Dict) and id(no) not in nos_ret:
                    for kn in no.keys:
                        if isinstance(kn, ast.Constant) and isinstance(kn.value, str) and kn.value in disp and kn.value not in atuacoes:
                            marca(kn, f'"{kn.value}" não está marcado em atuações: marque no painel (senão a rodada para com erro)')
    return sorted(out, key=lambda c: (c["linha"], c["coluna"]))      # de cima para baixo (a linha de estado mostra o primeiro)


def prefixo_sub(nome):
    """O prefixo dos nomes de dentro de um subcircuito (canais do scope, atuações): o nome dele — subcircuito é qualquer
    coisa, não só um submódulo; o padrão do Gecko, SUBCIRCUIT.k, fica Sub_k; renomeado (filtro, SM1…), vale o nome —
    só com letras, números e _."""
    return re.sub(r"[^A-Za-z0-9_]", "_", re.sub(r"^SUBCIRCUIT\.(\d+)$", r"Sub.\1", nome))


def eh_tag(e):
    """A tag do MaiSim (scope e controle): um ganho 1 chamado TAG.k — a saída dela é um sinal no scope e no m[...] do controle."""
    return e["tipo"] == "GAIN" and bool(re.match(r"^TAG\.\d+$", e["nome"]))


def sinais_da_rodada(r):
    """(elemento para o GETM, canal no scope): saídas dos blocos de controle da folha principal e medidores dos subcircuitos
    — menos os marcados "fora do scope e do controle" (uma medida que só alimenta blocos, ou que sai por um terminal)."""
    sinais, fora = [], set(le_aparencia()["fora"])
    for fid, fl in r["folhas"].items():
        for e in fl["elementos"]:
            if e.get("uid") in fora:
                continue
            if fid == "0":
                if e["dom"] != "CONTROL" or e["tipo"] in ("TERM", "GATE", "SCOPE") or not e["saidas"]:
                    continue
                el, canal = e["nome"], re.sub(r"[^A-Za-z0-9_]", "_", e["saidas"][0] or e["nome"])
            else:                                   # dentro de um subcircuito: os medidores e as tags (regra: medidor vai para o scope)
                if (e["tipo"] not in ("VOLT", "AMP") and not eh_tag(e)) or not e["saidas"]:
                    continue
                sm = prefixo_sub(fl["nome"])
                el, canal = f"{fl['nome']}#{e['nome']}", f"{sm}_" + re.sub(r"[^A-Za-z0-9_]", "_", e["saidas"][0] or e["nome"])
            while canal in [s_[1] for s_ in sinais] or canal == "t":
                canal += "_"
            sinais.append((el, canal))
    return sinais


def canais_por_uid(r):
    """{identificador do medidor: canal no scope} (sinais_da_rodada, pelo identificador: sobrevive a renomear o medidor ou
    o subcircuito)."""
    uid = {(e["nome"] if fid == "0" else f"{fl['nome']}#{e['nome']}"): e["uid"] for fid, fl in r["folhas"].items() for e in fl["elementos"]}
    return {uid[el]: canal for el, canal in sinais_da_rodada(r) if el in uid}


def nomes_por_uid(r):
    """{(identificador, "med" | "atu"): nome no controle} — as medidas (o canal no scope, o m[...]) e as atuações (CONST,
    como em atuadores_disponiveis): o identificador sobrevive a renomear o componente ou o subcircuito."""
    out = {(u, "med"): n for u, n in canais_por_uid(r).items()}
    vistos = set()
    for fid, fl in r["folhas"].items():
        for e in fl["elementos"]:
            if e["tipo"] != "CONST":
                continue
            nome = re.sub(r"[^A-Za-z0-9_]", "_", e["saidas"][0] if e["saidas"] and e["saidas"][0] else e["nome"])
            if fid != "0":
                nome = prefixo_sub(fl["nome"]) + "_" + nome
            if nome[:1].isdigit():
                nome = "_" + nome
            while nome in vistos:
                nome += "_"
            vistos.add(nome)
            out[(e["uid"], "atu")] = nome
    return out


def renomeados(antes, depois):
    """[(nome de antes, nome novo)] dos sinais que mudaram de nome numa edição (o nome de antes não pode ter ficado com outro
    componente: aí o controle continua certo para ele)."""
    if not antes or not depois:
        return []
    a, d = nomes_por_uid(antes), nomes_por_uid(depois)
    agora = set(d.values())
    pares = {}
    for k, velho in a.items():
        if k in d and d[k] != velho and velho not in agora:
            pares.setdefault(velho, d[k])
    return sorted(pares.items())


def _literal(nomes):
    """O nome entre aspas no código ("x" ou 'x'), como em m["x"], return {"x": …}, MEDIDA = "x"."""
    return re.compile(r"([\"'])(" + "|".join(re.escape(n) for n in sorted(nomes, key=len, reverse=True)) + r")\1")


def arquivos_de_codigo(c):
    return {"controle.py": c.get("codigo") or "", **(c.get("arquivos") or {})}


def usos_no_controle(c, nomes):
    """{nome: [onde]} — no código (entre aspas, arquivo:linha), nos cartões dos controladores, nas atuações marcadas e nos
    acionamentos (Marcelo, 19/10: "quando a gente muda uma variável de nome e ela está sendo usada no código… mudar todos
    os lugares, ou pelo menos alertar num modal")."""
    usos = {n: [] for n in nomes}
    if not nomes:
        return usos
    rx = _literal(nomes)
    for arq, txt in arquivos_de_codigo(c).items():
        for i, linha in enumerate(txt.split("\n"), 1):
            for m in rx.finditer(linha):
                usos[m.group(2)].append({"onde": f"{arq}:{i}", "linha": linha.strip()[:140]})
    for q in c.get("controladores") or []:
        for n in nomes:
            if n in (q.get("medidas") or []):
                usos[n].append({"onde": f"cartão {q['nome']}", "linha": "lê"})
            if n in (q.get("atuacoes") or []):
                usos[n].append({"onde": f"cartão {q['nome']}", "linha": "escreve"})
    for n in nomes:
        if n in (c.get("atuacoes") or []):
            usos[n].append({"onde": "atuações", "linha": "marcada"})
        k = sum(1 for q in c.get("acionamentos") or [] if q.get("alvo") == f"CONST:{n}")
        if k:
            usos[n].append({"onde": "acionamentos", "linha": f"{k} acionamento{'s' if k > 1 else ''}"})
    return usos


def renomeia_no_controle(c, pares):
    """O controle com os nomes trocados (todos de uma vez: a → b e b → c não viram a → c). Devolve (controle, trocas)."""
    mapa = {str(a): str(b) for a, b in pares if a and b and a != b}
    if not mapa:
        return c, 0
    rx, n = _literal(mapa), [0]

    def troca_txt(txt):
        def f(m):
            n[0] += 1
            return m.group(1) + mapa[m.group(2)] + m.group(1)
        return rx.sub(f, txt or "")

    def troca_lista(lst):
        out = []
        for x in lst or []:
            if x in mapa:
                n[0] += 1
            y = mapa.get(x, x)
            if y not in out:
                out.append(y)
        return out
    c = json.loads(json.dumps(c))
    c["codigo"] = troca_txt(c.get("codigo"))
    c["arquivos"] = {a: troca_txt(t) for a, t in (c.get("arquivos") or {}).items()}
    for q in c.get("controladores") or []:
        q["medidas"], q["atuacoes"] = troca_lista(q.get("medidas")), troca_lista(q.get("atuacoes"))
    c["atuacoes"] = troca_lista(c.get("atuacoes"))
    for q in c.get("acionamentos") or []:            # o alvo é CONST:<atuador> (ou p:<parâmetro>, que não muda aqui)
        tipo, _, nome = str(q.get("alvo", "")).partition(":")
        if tipo == "CONST" and nome in mapa:
            q["alvo"] = f"CONST:{mapa[nome]}"
            n[0] += 1
    return c, n[0]


# ---------------------------------------------------------------- os cartões seguem o código (Marcelo, 19/10: os SMs mudaram
# de nome, o código foi acertado e os cartões ficaram com vc_smap_1 e sm_ap_1_s — "as variáveis nem existem mais"; escolheu
# "o cartão segue o código"): o que cada controlador lê e escreve é o que o código dele lê e escreve, mais o que foi posto à
# mão e existe no esquema; o que não existe no esquema sai sozinho. O aviso que fica é o do código: "a variável x do código
# não existe no esquema", e a página tem a lista para trocar por outra ("ter uma lista para tentar colocar outra").
def _sem_comentario(t):
    return "\n".join(l.split("#", 1)[0] for l in t.split("\n"))


def _alcancados(arq, arqs, outros_ctl):
    """O arquivo e os módulos que ele importa (de módulo em módulo), sem os arquivos dos outros controladores."""
    vistos, fila = [arq], [arq]
    while fila:
        for m in re.finditer(r"^[ \t]*(?:import[ \t]+([\w., \t]+)|from[ \t]+(\w+)[ \t]+import\b)", arqs.get(fila.pop(0), ""), re.M):
            for n in ([x.strip().split()[0].split(".")[0] for x in m.group(1).split(",") if x.strip()] if m.group(1) else [m.group(2)]):
                f = n + ".py"
                if f in arqs and f not in vistos and f not in outros_ctl:
                    vistos.append(f)
                    fila.append(f)
    return vistos


def _no_esquema(r):
    """(medidas, atuadores) do circuito: os nomes que o controle pode ler e escrever."""
    nomes = nomes_por_uid(r)
    return {n for (_, t), n in nomes.items() if t == "med"}, {n for (_, t), n in nomes.items() if t == "atu"}


def le_e_escreve_do_codigo(c, q, medidas, atuadores):
    """O que o código do controlador q lê (o nome de uma medida do esquema entre aspas, fora de comentário: m["x"],
    MEDIDA = "x", listas) e escreve (as chaves que o passo() escreve: chaves_devolvidas), nos arquivos dele."""
    arqs = arquivos_de(c)
    meus = _alcancados(q["arquivo"], arqs, arquivos_controladores(c) - {q["arquivo"]})
    txt = "\n".join(_sem_comentario(arqs[a]) for a in meus)
    lidas = {n for n in medidas if re.search(r"[\"']" + re.escape(n) + r"[\"'](?!\s*:)", txt)}
    escritas = chaves_devolvidas(arqs.get(q["arquivo"], ""), [arqs[a] for a in meus[1:]]) & set(atuadores)
    return lidas, escritas


def segue_codigo(c, r, derivados=None):
    """Os cartões dos controladores (sem instâncias em subcircuitos: lá os nomes são os de dentro) e as atuações marcadas
    seguem o código, com o circuito aberto (r). Muda c e devolve c; derivados (um dict) recebe, por controlador, o que veio
    do código ({medidas, atuacoes}: a página trava esses no cartão)."""
    if not r or not c.get("controladores"):
        return c
    tem_m, tem_a = _no_esquema(r)
    cod = {q["nome"]: le_e_escreve_do_codigo(c, q, tem_m, tem_a) for q in c["controladores"] if not q.get("subcircuitos")}
    for q in c["controladores"]:
        if q["nome"] not in cod:
            continue
        lidas, escritas = cod[q["nome"]]
        de_outro = {k for n, (_, e) in cod.items() if n != q["nome"] for k in e} - escritas   # quem escreve no código é o dono
        if derivados is not None:
            derivados[q["nome"]] = {"medidas": [] if q.get("todas") else sorted(lidas), "atuacoes": sorted(escritas)}
        if not q.get("todas"):
            q["medidas"] = [k for k in q["medidas"] if k in tem_m] + sorted(lidas - set(q["medidas"]))
        q["atuacoes"] = [k for k in q["atuacoes"] if k in tem_a and k not in de_outro] + sorted(escritas - set(q["atuacoes"]))
    escritas = [k for q in c["controladores"] for k in q["atuacoes"]]
    c["atuacoes"] = [k for k in c["atuacoes"] if k in tem_a] + [k for k in dict.fromkeys(escritas) if k not in c["atuacoes"]]
    return c


def variaveis_sem_esquema(c, r):
    """As variáveis do código que não existem no esquema (com o circuito aberto): m["x"] — ou m[NOME], com NOME = "x" no
    mesmo arquivo (a linha é a do "x") — que não é medida; e a chave que o passo() de um controlador devolve (return {"x": …}
    ou return f({"x": …}, …)) e que não é atuador. Sem os controladores com instâncias em subcircuitos (lá os nomes são os
    de dentro). [{nome, tipo: "medida" | "atuação", usos: [{arquivo, linha}]}]"""
    if not r:
        return []
    import ast
    tem_m, tem_a = _no_esquema(r)
    arqs, ctls = arquivos_de(c), arquivos_controladores(c)
    out, vistos = {}, set()

    def poe(nome, tipo, arq, lin):
        x = out.setdefault((nome, tipo), {"nome": nome, "tipo": tipo, "usos": []})
        if {"arquivo": arq, "linha": lin} not in x["usos"]:
            x["usos"].append({"arquivo": arq, "linha": lin})
    for q in c.get("controladores") or [{"arquivo": "controle.py"}]:
        if q.get("subcircuitos"):
            continue
        for a in _alcancados(q["arquivo"], arqs, ctls - {q["arquivo"]}):
            if a in vistos:
                continue
            vistos.add(a)
            linhas = [l.split("#", 1)[0] for l in arqs[a].split("\n")]
            consts = {}
            for i, l in enumerate(linhas, 1):
                m = re.match(r"^[ \t]*([A-Za-z_]\w*)[ \t]*=[ \t]*[\"']([A-Za-z_]\w*)[\"'][ \t]*$", l)
                if m:
                    consts[m.group(1)] = (m.group(2), i)
            for i, l in enumerate(linhas, 1):
                for m in re.finditer(r"\bm\s*\[\s*(?:[\"']([A-Za-z_]\w*)[\"']|([A-Za-z_]\w*))\s*\]", l):
                    nome, lin = (m.group(1), i) if m.group(1) else consts.get(m.group(2), (None, i))
                    if nome and nome not in tem_m:
                        poe(nome, "medida", a, lin)
        try:
            arv = ast.parse(arqs.get(q["arquivo"], ""))
        except SyntaxError:
            continue
        for fn in arv.body:
            if not (isinstance(fn, ast.FunctionDef) and fn.name == "passo"):
                continue
            pilha, nos = list(ast.iter_child_nodes(fn)), []     # o corpo do passo(), sem descer nas funções de dentro dele
            while pilha:                                         # (Marcelo, 20/10: o _msg() do central devolvia o dicionário da
                no = pilha.pop()                                 # mensagem, e as chaves dela saíam como "atuação que não existe")
                nos.append(no)
                if not isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
                    pilha.extend(ast.iter_child_nodes(no))
            for no in nos:
                if not (isinstance(no, ast.Return) and no.value is not None):
                    continue
                dics = [no.value] if isinstance(no.value, ast.Dict) else \
                    [x for x in no.value.args if isinstance(x, ast.Dict)] if isinstance(no.value, ast.Call) else []
                for d in dics:
                    for k in d.keys:
                        if isinstance(k, ast.Constant) and isinstance(k.value, str) and k.value not in tem_a:
                            poe(k.value, "atuação", q["arquivo"], k.lineno)
    return list(out.values())


NOME_TROCA = re.compile(r"^[A-Za-z0-9_]{1,120}$")              # os nomes de editor/controle/renomeia
ROTAS_EDICAO = {"/editor/cmd", "/editor/cmds", "/editor/mede", "/editor/grupo", "/editor/colar", "/editor/fonte_sinal",
                "/editor/fora", "/editor/desfazer", "/editor/biblioteca"}     # as que podem mudar o nome de um sinal


def renomes_com_uso(antes, depois):
    """Os sinais renomeados nesta edição que o controle usa: [{de, para, usos}] (vazio se nenhum)."""
    pares = renomeados(antes, depois)
    if not pares:
        return []
    usos = usos_no_controle(le_controle(), [a for a, _ in pares])
    return [{"de": a, "para": b, "usos": usos[a]} for a, b in pares if usos[a]]


def migra_aparencia(antes, depois):
    """Um medidor que mudou de nome no scope (renomeado, o nome automático acompanhando o que ele mede, ou o subcircuito
    renomeado): a ponta, a garra e a cor dele, guardadas pelo nome do canal, vão para o nome novo. True se mudou algo."""
    if not antes:
        return False
    a, d = canais_por_uid(antes), canais_por_uid(depois)
    pares = [(a[u], d[u]) for u in a if u in d and a[u] != d[u]]
    if not pares:
        return False
    mudou = False
    with trava_aparencia:
        ap = le_aparencia()
        for velho, novo in pares:
            for k in ("pontas", "cores"):
                if velho in ap[k] and novo not in ap[k]:
                    ap[k][novo] = ap[k].pop(velho)
                    mudou = True
        if mudou:
            grava_aparencia(ap)
    return mudou


def redes_basicas(fl, dominio):
    """As redes de um domínio ("CONTROL" ou "LK") numa folha, com a regra de ligação do Gecko (há ligação onde uma ponta, de
    conexão ou terminal, cai noutra conexão; cruzamento sem ponta não liga; o mesmo rótulo é a mesma rede): (rede de um
    terminal, rede de um rótulo, os terminais do domínio)."""
    pai = {}
    def acha(x):
        pai.setdefault(x, x)
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x
    une = lambda a, b: pai.__setitem__(acha(a), acha(b))
    dom = lambda e, t: t.get("dom") or (e["dom"] if e["dom"] in ("CONTROL", "THERM") else "LK")
    fios = [w for w in fl["fios"] if w["dom"] == dominio and w["pts"]]
    terms = [(e, i, t) for e in fl["elementos"] if e["tipo"] != "SCOPE" and e.get("ativo", True)   # desativado: fora da netlist
             for i, t in enumerate(e.get("terminais") or []) if dom(e, t) == dominio]
    rot = lambda e, t: (e["entradas"][0] if e["tipo"] == "TERM" and e["entradas"] else t.get("rotulo"))   # TERM: o rótulo de dentro
    pontas = {tuple(w["pts"][k]) for w in fios for k in (0, -1)} | {(t["x"], t["y"]) for _, _, t in terms}
    for wi, w in enumerate(fios):
        for k, p in enumerate(w["pts"]):
            if k in (0, len(w["pts"]) - 1) or tuple(p) in pontas:
                une(("w", wi), ("p",) + tuple(p))
        if w.get("rotulo"):
            une(("w", wi), ("r", w["rotulo"]))
    for e, i, t in terms:
        une(("t", e["nome"], i), ("p", t["x"], t["y"]))
        if rot(e, t):
            une(("t", e["nome"], i), ("r", rot(e, t)))
    return (lambda e, i: acha(("t", e["nome"], i))), (lambda r: acha(("r", r))), terms


def redes_controle(fl):
    """As redes de controle de uma folha (redes_basicas): (rede de um terminal, rede de um rótulo, leitores de cada rede —
    entradas de bloco, GATE, terminal de subcircuito —, fontes controladas por sinal da folha)."""
    rede, rot, terms = redes_basicas(fl, "CONTROL")
    leitores = defaultdict(list)
    for e, i, t in terms:
        if e["tipo"] in ("TERM", "SUBCIRCUIT") or t.get("lado") == "e":
            leitores[rede(e, i)].append((e, i))
    fontes = [e for e in fl["elementos"] if e["dom"] == "LK" and e["tipo"] in ("U", "I") and e.get("ativo", True)
              and int(e["par"].get("sourceType", 0)) == 400 and e["mede"] and e["mede"][0]]
    return rede, rot, leitores, fontes


def nos_medidos(r):
    """Os componentes ligados a cada nó medido por um voltímetro, com o terminal que está no nó: {folha: {rótulo: [{nome,
    x, y}]}} — onde a tela pode pôr a ponta de prova (escolhida pelo usuário, como no terminal de verdade)."""
    out = {}
    for fid, fl in r["folhas"].items():
        rotulos = {n for e in fl["elementos"] if e["tipo"] == "VOLT" for n in (e["mede"] or [])[:2] if n}
        if not rotulos:
            continue
        rede, rot, terms = redes_basicas(fl, "LK")
        d = {}
        for rotulo in sorted(rotulos):
            alvo, vistos = rot(rotulo), set()
            for e, i, t in terms:
                if e["tipo"] != "TERM" and e["nome"] not in vistos and rede(e, i) == alvo:
                    vistos.add(e["nome"])
                    d.setdefault(rotulo, []).append({"nome": e["nome"], "x": t["x"], "y": t["y"], "cx": e["x"], "cy": e["y"]})
        out[fid] = d
    return out


def destinos_controle(r):
    """Aonde chega cada bloco CONST pelas ligações de controle, atravessando os outros blocos de controle e os terminais de
    subcircuito (o Gecko liga o rótulo de fora ao de dentro: é a mesma rede, sem cálculo — o ReglerTERMINAL não leva o
    sinal): num GATE (a chave que ele comanda) ou numa fonte controlada por sinal. Para cada destino, o atraso próprio do
    Gecko entre escrever o CONST (antes do passo s) e o circuito sentir — a ordem de um passo do Gecko é chave lê o GATE →
    resolve o circuito → fontes leem o sinal (valem no passo seguinte) → blocos de controle calculam (todos, numa passada);
    medido: CONST → GATE, s; CONST → fonte, s + 1; com bloco(s) no meio, + 1 (no modelo 03, CONST_S1 → SM → AND → GATE: s + 1).
    Também atravessa o terminal global de controle (o Gecko junta os de mesmo nome, de qualquer folha). Fica de fora o que
    o Gecko ignora: elemento desativado, GATE sem chave. Uma fonte controlada só conta se a rede com o rótulo dela, na folha
    dela, é alimentada por um bloco da mesma folha (o Gecko procura o sinal pelo rótulo entre as saídas de blocos daquela
    folha; o terminal de subcircuito não é bloco).
    Devolve {(folha, nome do CONST): [{"tipo": "chave"|"fonte"|"subcircuito", "nome", "folha", "via", "atraso"}]}."""
    redes = {fid: redes_controle(fl) for fid, fl in r["folhas"].items()}
    globais = defaultdict(list)                          # nome → [(folha, terminal global)]
    for fid, fl in r["folhas"].items():
        for e in fl["elementos"]:
            if e["tipo"] == "GLOBAL_CONTROL" and e.get("ativo", True) and e.get("terminais"):
                globais[e["nome"]].append((fid, e))
    chaves = {fid: {e["nome"] for e in fl["elementos"] if e["tipo"] in CHAVES and e.get("ativo", True)} for fid, fl in r["folhas"].items()}
    nome_folha = {fid: fl["nome"] for fid, fl in r["folhas"].items()}
    subs = {e["uid"]: (fid, e) for fid, fl in r["folhas"].items() for e in fl["elementos"] if e["tipo"] == "SUBCIRCUIT"}
    out = {}
    for fid0, fl0 in r["folhas"].items():
        for c in fl0["elementos"]:
            if c["tipo"] != "CONST" or not c.get("ativo", True):
                continue
            saidas = [i for i, t in enumerate(c.get("terminais") or []) if t.get("lado") == "s"]
            dest = []
            if saidas:
                ini = (fid0, redes[fid0][0](c, saidas[0]))
                visto = {ini: ([], 0)}                   # (folha, rede) → (por onde passou, blocos que calculam no caminho)
                por_bloco = {ini}                        # redes alimentadas por um bloco da própria folha (podem acionar fonte)
                fila = [ini]
                while fila:
                    fid, r_ = fila.pop(0)
                    via, nb = visto[(fid, r_)]
                    rede, _, leitores, _ = redes[fid]
                    for e, i in leitores[r_]:
                        prox = []                        # (folha, rede, via, blocos) a seguir
                        if e["tipo"] == "SUBCIRCUIT":     # entra no SM: a rede do terminal de mesmo nome lá dentro
                            t = e["terminais"][i]
                            dentro = next((x for x in r["folhas"].get(e["uid"], {"elementos": []})["elementos"]
                                           if x["tipo"] == "TERM" and x["nome"] == t.get("interno")), None)
                            if dentro is None:
                                dest.append(dict(tipo="subcircuito", nome=e["nome"], folha=nome_folha[fid], via=via, atraso=None))
                            else:
                                prox.append((e["uid"], redes[e["uid"]][0](dentro, 0), via + [f"{e['nome']}:{t.get('interno')}"], nb))
                        elif e["tipo"] == "TERM":         # sai do SM: a rede do terminal do bloco SUBCIRCUIT na folha de cima
                            pai_ = subs.get(fid)
                            if pai_:
                                fp, sb = pai_
                                k = next((k for k, t in enumerate(sb["terminais"]) if t.get("interno") == e["nome"]), None)
                                if k is not None:
                                    prox.append((fp, redes[fp][0](sb, k), via + [f"{sb['nome']}:{e['nome']}"], nb))
                        elif e["tipo"] == "GLOBAL_CONTROL":  # o mesmo nome em qualquer folha: a mesma rede, sem cálculo
                            prox += [(fx, redes[fx][0](g, 0), via + [f"global {e['nome']}"], nb) for fx, g in globais[e["nome"]] if g is not e]
                        elif e["tipo"] == "GATE":            # só o que comanda uma chave desta folha (sem chave, o Gecko o ignora)
                            ch = (e["mede"] or [""])[0]
                            if ch in chaves[fid]:
                                dest.append(dict(tipo="chave", nome=ch, gate=e["nome"], folha=nome_folha[fid], via=via, atraso=1 if nb else 0))
                        elif e is not c:
                            prox += [(fid, rede(e, j), via + [e["nome"]], nb + 1, True) for j, t in enumerate(e["terminais"]) if t.get("lado") == "s"]
                        for fx, rx, vx, bx, *bloco in prox:
                            if bloco:
                                por_bloco.add((fx, rx))
                            if (fx, rx) not in visto:
                                visto[(fx, rx)] = (vx, bx)
                                fila.append((fx, rx))
                for fid, (_, rot, _, fontes) in redes.items():
                    for f in fontes:
                        q = visto.get((fid, rot(f["mede"][0])))
                        if q and (fid, rot(f["mede"][0])) in por_bloco:
                            dest.append(dict(tipo="fonte", nome=f["nome"], folha=nome_folha[fid], via=q[0], atraso=2 if q[1] else 1))
            out[(fid0, c["nome"])] = dest
    return out


def destinos_fora_do_passo(a, pedido, escrita):
    """Os destinos de um atuador que NÃO sentem no passo pedido, com a escrita no passo dado: [(destino, passo em que sente,
    motivo)]. Destino sem atraso conhecido: passo None."""
    out = []
    for q in a["destinos"]:
        alvo = f"{q['tipo']} {q['nome'] or q.get('gate', '')}" + (f" ({q['folha']})" if q.get("folha") not in (None, "principal") else "")
        if q["atraso"] is None:
            out.append((alvo, None, "o caminho sai por um subcircuito que o MaiSim não achou: o atraso do outro lado não é compensado"))
        elif escrita + q["atraso"] != pedido:
            out.append((alvo, escrita + q["atraso"], f"o Gecko leva no mínimo {q['atraso']} Δt por esse caminho" if q["atraso"] == a["atraso_gecko"]
                        else "o mesmo CONST chega a destinos com atrasos diferentes no Gecko; o que sente primeiro fica exato"))
    return out


def atraso_gecko(destinos):
    """O atraso próprio do Gecko que o agendamento compensa num atuador: o do destino que sente primeiro (nenhum destino
    se adianta ao pedido; um destino que sentiria depois é avisado). Sem chave nem fonte conhecida: 1 (o da fonte)."""
    conhecidos = [q["atraso"] for q in destinos if q["atraso"] is not None]
    return min(conhecidos) if conhecidos else 1


def atuadores_disponiveis(r):
    """Blocos CONST que o controle pode escrever: nome no código (o rótulo da saída, ou o nome do bloco; dentro de um
    subcircuito, com o prefixo dele na frente: prefixo_sub) → bloco para o SETM, e aonde ele chega (destinos_controle)."""
    out, vistos = [], set()
    destinos = destinos_controle(r)
    for fid, fl in r["folhas"].items():
        for e in fl["elementos"]:
            if e["tipo"] != "CONST":
                continue
            bloco = e["nome"] if fid == "0" else f"{fl['nome']}#{e['nome']}"
            nome = re.sub(r"[^A-Za-z0-9_]", "_", e["saidas"][0] if e["saidas"] and e["saidas"][0] else e["nome"])
            if fid != "0":
                nome = prefixo_sub(fl["nome"]) + "_" + nome
            if nome[:1].isdigit():                       # nome no código (e alvo de acionamento) é um identificador
                nome = "_" + nome
            while nome in vistos:
                nome += "_"
            vistos.add(nome)
            dest = destinos.get((fid, e["nome"]), [])
            out.append({"nome": nome, "bloco": bloco, "folha": fid, "elemento": e["nome"], "destinos": dest,
                        "atraso_gecko": atraso_gecko(dest)})
    return out


# o que foi de fato nas mensagens entre os controladores (Marcelo, 22/10: no diagrama, o rótulo dizia só "mensagem" quando
# o conteúdo era montado em outro arquivo — envia("controle", c["sobe"]), com o dicionário feito num laço no módulo): a cada
# "testar" e a cada rodada, as chaves de cada par de/para, por circuito, com a assinatura do código daquele momento (o diagrama
# diz quando o código mudou depois). Fica no cache (sobrevive a reiniciar); nada vai para o circuito do usuário
VISTAS = ESTADO.with_name("mensagens_vistas.json")


def assinatura_codigo(c):
    return hashlib.sha1(json.dumps(arquivos_de(c), sort_keys=True).encode()).hexdigest()[:16]


def guarda_vistas(trab, c, fonte):
    if not trab:                                         # sem controle: nada a dizer; com controle e nenhuma mensagem, fica
        return                                           # registrado que nada foi (o de antes não passa por atual)
    try:
        d = json.loads(VISTAS.read_text()) if VISTAS.exists() else {}
    except (OSError, ValueError):
        d = {}
    d[str(editor.get("aberto") or "")] = dict(fonte=fonte, quando=time.strftime("%Y-%m-%d %H:%M"), assinatura=assinatura_codigo(c),
                                              pares={k: list(v) for k, v in (trab.vistas or {}).items()})
    try:
        VISTAS.parent.mkdir(parents=True, exist_ok=True)
        tmp = VISTAS.with_suffix(".tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False))
        os.replace(tmp, VISTAS)
    except OSError:
        pass


def muda_chave_vistas(antiga, nova):
    """Salvar com nome: o registro segue o circuito. De um sem arquivo ("") ele passa para o nome; de outro arquivo (salvar
    como), copia (o arquivo antigo continua com o dele)."""
    try:
        d = json.loads(VISTAS.read_text()) if VISTAS.exists() else {}
        if antiga == nova or antiga not in d:
            return
        d[nova] = d.pop(antiga) if antiga == "" else d[antiga]
        VISTAS.write_text(json.dumps(d, ensure_ascii=False))
    except (OSError, ValueError):
        pass


def esquece_vistas(chave):
    try:
        d = json.loads(VISTAS.read_text()) if VISTAS.exists() else {}
        if d.pop(chave, None) is not None:
            VISTAS.write_text(json.dumps(d, ensure_ascii=False))
    except (OSError, ValueError):
        pass


def vistas_do_circuito(c):
    try:
        v = json.loads(VISTAS.read_text()).get(str(editor.get("aberto") or "")) if VISTAS.exists() else None
    except (OSError, ValueError):
        v = None
    return dict(v, atual=v.get("assinatura") == assinatura_codigo(c)) if v else None


def painel_controle(c=None):
    c = c or le_controle()
    ult = editor.get("ultimo")
    do_codigo = {}
    segue_codigo(c, ult, do_codigo)                    # os cartões seguem o código
    insts, erros_ctl, avisos_ctl = instancias_controle(c, ult)
    usados = {i["arquivo"] for i in insts}
    erros, avisos = verifica_arquivos(c, usados)
    entradas = [k for _, k in sinais_da_rodada(ult)] if ult else []
    atu = atuadores_disponiveis(ult) if ult else []
    nomes = {a["nome"] for a in atu}
    avisos += [f"o atuador {a} não existe no circuito aberto" for a in c["atuacoes"] if ult and a not in nomes]
    avisos += analisa_modulos(c)[1]                     # os riscos do fluxo de módulos (não impedem rodar)
    conferencia = []
    for arq in [a for a in arquivos_de(c) if a in usados and not any(x["arquivo"] == a for x in erros)]:
        cod = arquivos_de(c)[arq]
        if not c.get("controladores"):                  # um controlador só: o de sempre
            conferencia += [dict(x, arquivo=arq) for x in confere_codigo(cod, c["parametros"], c["atuacoes"], entradas if ult else None, atu if ult else None)]
            continue
        vis = [i for i in insts if i["arquivo"] == arq]
        locais_m = entradas if any(i["medidas"] is None for i in vis) else sorted({k for i in vis for k in i["medidas"]})   # "todas": as do circuito
        locais_a = sorted({k for i in vis for k in i["atuacoes"]})
        conferencia += [dict(x, arquivo=arq) for x in confere_codigo(cod, c["parametros"], locais_a, locais_m if ult else None,
                                                                    [{"nome": k} for k in locais_a], extras={"id", "controlador", "subcircuito"})]
    return dict(controle=c, erros=erros, avisos=erros_ctl + avisos + avisos_ctl, erros_controladores=erros_ctl, conferencia=conferencia,
                entradas=entradas, atuadores=atu, modelo=MODELO_CONTROLE, circuito=bool(ult),
                modelos={"leitura.py": MODELO_LEITURA, "escrita.py": MODELO_ESCRITA, "modulo": MODELO_MODULO},
                modulos=sorted(modulos_de(c)), sem_esquema=variaveis_sem_esquema(c, ult), do_codigo=do_codigo, mensagens_vistas=vistas_do_circuito(c),
                instancias=[{"nome": i["nome"], "arquivo": i["arquivo"], "controlador": (i.get("p") or {}).get("controlador"),
                             "subcircuito": (i.get("p") or {}).get("subcircuito"), "medidas": sorted(i["medidas"]) if i["medidas"] is not None else None,
                             "atuacoes": sorted(i["atuacoes"]) if i["atuacoes"] is not None else None} for i in insts])


def testa_controle(dt, n=3, c=None, pasta_nome="teste_controle"):
    """O botão "testar" do painel: roda iniciar() e n passo() do código guardado (ou de c: a proposta do Claude), no mesmo
    processo à parte da rodada, sem o Gecko: medidas zeradas, os parâmetros do painel e o Ts efetivo (com o Δt da tela).
    Devolve o que o código devolveria (e o que não é atuação marcada), o que mandou ao scope e o que imprimiu; um erro volta
    com a linha, como na rodada."""
    c = completa_controle(c or le_controle())
    pasta = ESTADO.with_name(pasta_nome)
    (pasta / "controle.log").unlink(missing_ok=True)     # a saída mostrada é só a deste teste
    ult = editor.get("ultimo")
    if not ult:
        raise ErroMotor("abra a edição (lápis): o teste usa as medidas e os atuadores do circuito")
    segue_codigo(c, ult)
    insts, erros_ctl, _ = instancias_controle(c, ult)
    if erros_ctl:
        raise ErroMotor(erros_ctl[0])
    erros, _ = verifica_arquivos(c, {i["arquivo"] for i in insts})
    if erros:
        raise ErroControle(erros[0]["msg"], erros[0]["linha"], arquivo=erros[0]["arquivo"])
    if not (dt > 0):
        raise ErroMotor("Δt inválido")
    entradas = [k for _, k in sinais_da_rodada(ult)]
    marcadas = set(c["atuacoes"]) & {a["nome"] for a in atuadores_disponiveis(ult)}
    Ts = max(1, arred(c["Ts"] / dt)) * dt
    params = {q["nome"]: q["valor"] for q in c["parametros"]}
    params["Ts"] = Ts
    pasta.mkdir(parents=True, exist_ok=True)
    log = open(pasta / "controle.log", "w")
    passos, trab = [], None
    try:
        trab = Controladores(insts, params, log, c["rede"]["latencia"])
        for k in range(n):
            res = trab.pede({"op": "passo", "t": k * Ts, "m": {x: 0.0 for x in entradas}})
            s_ = {x: (v if math.isfinite(v) else None) for x, v in res["s"].items()}   # NaN/infinito no scope(): null (JSON válido)
            passos.append({"t": k * Ts, "a": res["a"], "s": s_, "fora": sorted(x for x in res["a"] if x not in marcadas)})
        if pasta_nome == "teste_controle":               # o do painel (o da proposta da IA não é o código guardado)
            guarda_vistas(trab, c, "testar")
    finally:
        if trab:
            trab.fecha()
        log.close()
    return {"ok": True, "passos": passos, "medidas": entradas, "Ts": Ts, "saida": (pasta / "controle.log").read_text()[-3000:],
            "controladores": [i["nome"] for i in insts] if c.get("controladores") else []}


def confere_controle(c):
    """A configuração que veio da tela, conferida (o código é guardado mesmo com erro de sintaxe, para não se perder)."""
    if not isinstance(c, dict) or not isinstance(c.get("atraso", {}), dict) or \
            not all(isinstance(q, dict) for q in list(c.get("parametros") or []) + list(c.get("acionamentos") or [])):
        raise ErroMotor("configuração do controle malformada")
    out = controle_padrao()
    out["ativo"] = bool(c.get("ativo"))
    Ts = float(c.get("Ts", out["Ts"]))
    if not (1e-8 <= Ts <= 1.0):
        raise ErroMotor("Ts entre 10 ns e 1 s")
    out["Ts"] = Ts
    out["atuacoes"] = [str(a) for a in c.get("atuacoes", []) if IDENT.match(str(a))][:500]
    pars = []
    for q in c.get("parametros", [])[:200]:
        nome = str(q.get("nome", "")).strip()
        if not IDENT.match(nome) or nome == "Ts":
            raise ErroMotor(f"parâmetro inválido: {nome!r} (letras, números e _, sem começar por número; Ts já existe)")
        valor = float(q.get("valor", 0.0))
        if not math.isfinite(valor):
            raise ErroMotor(f"parâmetro {nome}: valor finito")
        pars.append({"nome": nome, "valor": valor, "unidade": str(q.get("unidade", ""))[:20]})
    if len({q["nome"] for q in pars}) != len(pars):
        raise ErroMotor("parâmetros com o mesmo nome")
    out["parametros"] = pars
    at = c.get("atraso") or {}
    modo = str(at.get("modo", "logo"))
    if modo not in ATRASOS:
        raise ErroMotor(f"atraso: {', '.join(ATRASOS)}")
    tau = float(at.get("tempo", 0.0))
    if not (0.0 <= tau <= 1.0):
        raise ErroMotor("latência entre 0 e 1 s")
    out["atraso"] = {"modo": modo, "tempo": tau}
    acs = []
    for q in (c.get("acionamentos") or [])[:500]:     # mudanças no tempo: um bloco CONST ou um parâmetro do controle
        alvo = str(q.get("alvo", ""))
        tipo, _, nome = alvo.partition(":")
        if tipo not in ("CONST", "p") or not IDENT.match(nome):
            raise ErroMotor(f"acionamento com alvo inválido: {alvo!r} (CONST:<atuador> ou p:<parâmetro>)")
        t_ac, v_ac = float(q.get("t", 0.0)), float(q.get("valor", 0.0))
        if not (0.0 <= t_ac < 1e3) or not math.isfinite(v_ac):
            raise ErroMotor(f"acionamento de {alvo}: tempo ≥ 0 e valor finito")
        acs.append({"t": t_ac, "alvo": alvo, "valor": v_ac})
    out["acionamentos"] = sorted(acs, key=lambda q: q["t"])
    codigo = str(c.get("codigo", ""))
    if len(codigo) > 200_000:
        raise ErroMotor("código grande demais (até 200 mil caracteres)")
    out["codigo"] = codigo
    arqs = {}
    for k, v in (c.get("arquivos") or {}).items():
        if not ARQ_PY.match(str(k)) or k == "controle.py":
            raise ErroMotor(f"arquivo do controle inválido: {k!r} (letras, números e _, terminando em .py)")
        if not isinstance(v, str) or len(v) > 200_000:
            raise ErroMotor(f"{k}: código grande demais (até 200 mil caracteres)")
        arqs[str(k)] = v
    # limites só contra um pedido desgovernado (Marcelo, 19/10: o MMC trifásico com 19 DSPs passou dos 30 arquivos de antes)
    if len(arqs) > 1000:
        raise ErroMotor("até 1000 arquivos no controle")
    if len(codigo) + sum(len(v) for v in arqs.values()) > 20_000_000:
        raise ErroMotor("o controle inteiro passa de 20 milhões de caracteres")
    out["arquivos"] = arqs
    ctls = []
    if len(c.get("controladores") or []) > 500:
        raise ErroMotor("até 500 controladores")
    for q in (c.get("controladores") or []):
        if not isinstance(q, dict):
            raise ErroMotor("controlador malformado")
        nome, arq = str(q.get("nome", "")).strip(), str(q.get("arquivo", "controle.py"))
        if not IDENT.match(nome):
            raise ErroMotor(f"nome de controlador inválido: {nome!r} (letras, números e _, sem começar por número)")
        if arq != "controle.py" and arq not in arqs:
            raise ErroMotor(f"o controlador {nome} usa {arq}, que não existe")
        lista = lambda k: [str(x) for x in (q.get(k) or []) if isinstance(x, str)][:500]
        meds, atus, subs = lista("medidas"), lista("atuacoes"), lista("subcircuitos")
        if not all(NOME_SINAL.match(x) for x in meds + atus) or not all(NOME.match(x) for x in subs):
            raise ErroMotor(f"controlador {nome}: medidas, atuações ou subcircuitos com nome inválido")
        todas = bool(q.get("todas"))
        if todas and subs:
            raise ErroMotor(f"controlador {nome}: 'lê todas' não combina com subcircuitos (cada instância lê as do seu subcircuito)")
        ctls.append({"nome": nome, "arquivo": arq, "todas": todas, "medidas": [] if todas else list(dict.fromkeys(meds)),
                     "atuacoes": list(dict.fromkeys(atus)), "subcircuitos": list(dict.fromkeys(subs))})
    if len({q["nome"] for q in ctls}) != len(ctls):
        raise ErroMotor("controladores com o mesmo nome")
    out["controladores"] = ctls
    enxuga_controladores(out)
    lat = float((c.get("rede") or {}).get("latencia", 0.0))
    if not (0.0 <= lat <= 1.0):
        raise ErroMotor("latência da rede entre 0 e 1 s")
    out["rede"] = {"latencia": lat}
    return out


class Trabalhador:
    """O processo de um controlador (controle_worker.py): manda um pedido e lê a resposta com prazo (separados, para os
    controladores calcularem juntos)."""
    def __init__(self, log):
        self.proc = subprocess.Popen([sys.executable, "-I", str(AQUI / "controle_worker.py")], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=log, text=True, bufsize=1, cwd=str(Path(log.name).parent))
        self.fila = queue.Queue()
        threading.Thread(target=self._le, daemon=True).start()

    def _le(self):
        for linha in self.proc.stdout:
            self.fila.put(linha)
        self.fila.put(None)

    def manda(self, pedido):
        try:
            self.proc.stdin.write(json.dumps(pedido) + "\n")
            self.proc.stdin.flush()
        except (BrokenPipeError, OSError):
            raise ErroControle("o processo do controle terminou (veja controle.log)")

    def resposta(self, prazo=5):
        try:
            linha = self.fila.get(timeout=prazo)
        except queue.Empty:
            self.fecha()
            raise ErroControle(f"o código não respondeu em {prazo} s (laço infinito?)")
        if linha is None:
            raise ErroControle("o processo do controle terminou (veja controle.log)")
        r = json.loads(linha)
        if not r.get("ok"):
            raise ErroControle(r.get("erro", "erro"), r.get("linha"), r.get("traceback", ""), r.get("arquivo"), r.get("instancia"))
        return r

    def pede(self, pedido, prazo=5):
        self.manda(pedido)
        return self.resposta(prazo)

    def fecha(self):
        try:
            self.proc.kill()
            self.proc.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            pass
        for f in (self.proc.stdin, self.proc.stdout):
            try:
                f.close()
            except OSError:
                pass


class Controladores:
    """Os controladores da rodada, cada um no seu processo (isolados: sem memória comum), calculando juntos a cada amostra:
    o servidor manda a amostra a todos e depois recolhe (em paralelo). Cada um recebe só as medidas dele (com o nome local).
    A rede entre eles leva as mensagens: enviada na amostra t, chega na 1ª amostra DEPOIS dela com t_k ≥ t + latência (com
    latência 0, na seguinte: eles calculam juntos, ninguém vê o que o outro mandou na mesma amostra).
    Sem lista de controladores, um só (o controle.py, com tudo): o de sempre."""
    def __init__(self, insts, params, log, latencia=0.0):
        if isinstance(insts, str):                       # só um código: o controle.py de sempre
            insts = [{"nome": "controle", "arquivo": "controle.py", "codigo": insts, "medidas": None, "atuacoes": None}]
        self.insts, self.latencia, self.fila, self.seq, self.trabs = insts, float(latencia), [], 0, []
        self.vistas = {}                                 # "de|para" → as chaves que foram nas mensagens, na ordem do código (mensagens_vistas)
        nomes, prefixar = [i["nome"] for i in insts], len(insts) > 1
        try:
            for i in insts:
                self.trabs.append(Trabalhador(log))
            for i, tb in zip(insts, self.trabs):        # carregam juntos
                # scope(): o nome da instância na frente quando há várias — menos o controle.py de sempre ("controle"), que
                # fica com os nomes de antes (as colunas das rodadas não mudam só por existir outro controlador)
                sempre = i["nome"] == "controle" and i["arquivo"] == "controle.py"
                tb.manda({"op": "carrega", "codigo": i["codigo"], "arquivo": i["arquivo"], "nome": i["nome"], "atuacoes": i["atuacoes"],
                          "p": dict(params, **({"id": i["nome"], **i["p"]} if i.get("p") is not None else {})), "nomes": nomes,
                          "prefixar": prefixar and not sempre, "varios": prefixar,
                          "modulos": i.get("modulos") or {}, "outros": i.get("outros") or []})
            for tb in self.trabs:
                tb.resposta(20)
        except BaseException:
            self.fecha()
            raise

    def pede(self, pedido, prazo=5):
        if pedido["op"] != "passo":                      # parâmetros (acionamento de p[...]): para todos
            for tb in self.trabs:
                tb.manda(pedido)
            for tb in self.trabs:
                tb.resposta(prazo)
            return {"ok": True}
        t, m = pedido["t"], pedido["m"]
        folga = 1e-12 * max(1.0, abs(t))
        for i, tb in zip(self.insts, self.trabs):        # a amostra para todos (e as mensagens que chegaram a cada um)
            chegou = sorted((x for x in self.fila if x[2] == i["nome"] and x[0] <= t + folga), key=lambda x: (x[0], x[1]))
            if chegou:
                self.fila = [x for x in self.fila if not (x[2] == i["nome"] and x[0] <= t + folga)]
            mi = m if i["medidas"] is None else {k: m[v] for k, v in i["medidas"].items() if v in m}
            tb.manda({"op": "passo", "t": t, "m": mi, "msgs": [x[3] for x in chegou]})
        a, sc, novas = {}, {}, []
        for i, tb in zip(self.insts, self.trabs):        # e recolhe (eles calcularam juntos)
            r = tb.resposta(prazo)
            a.update(r["a"])
            sc.update(r["s"])
            for env in r.get("env") or []:
                self.vistas.setdefault(f'{i["nome"]}|{env["para"]}', {}).update(dict.fromkeys(env["dados"]))
                self.seq += 1
                novas.append((t + self.latencia, self.seq, env["para"], {"de": i["nome"], "t": t, "dados": env["dados"]}))
        self.fila += novas                               # só depois de todos: nada chega na mesma amostra
        return {"ok": True, "a": a, "s": sc}

    def fecha(self):
        for tb in self.trabs:
            tb.fecha()


RODADAS = Path(os.environ.get("MAISIM_RODADAS") or DADOS / "rodadas")   # scope_*.npz das rodadas (o /maisim/scope lista tudo sob simu/)
SCOPE = os.environ.get("MAISIM_PUBLICA_SCOPE") or f"http://localhost:{os.environ['MAISIM_PORTA_SCOPE']}"   # onde as rodadas são publicadas ao vivo


rodada = {"estado": "parada"}                 # parada | rodando | pausada | fim | erro; t, tfim, progresso, arquivo …
controle_rodada = {"pausa": threading.Event(), "parar": threading.Event()}


CHAVES = {"S", "IGBT", "MOSFET", "THYR"}            # o que um GATE pode comandar
trava_rodada = threading.Lock()
DEVOLVER = ESTADO.with_name("devolver.json")           # CONST de uma rodada em andamento (servidor caiu no meio: devolve na partida)


def recupera_rodada_interrompida():
    """Partida do servidor: se uma rodada foi interrompida (servidor derrubado no meio), termina a simulação no Gecko e
    devolve os CONST que ela escrevia ao valor de antes."""
    if not DEVOLVER.exists():
        return
    try:
        valores = json.loads(DEVOLVER.read_text())
        try:
            MOTOR.cmd("END")
        except ErroMotor:
            pass
        if valores:
            MOTOR.cmd("SETM " + " ".join(f"{b}:const:{v}" for b, v in valores.items()))
        DEVOLVER.unlink(missing_ok=True)
        print(f"rodada interrompida: devolvi {len(valores)} CONST ao valor de antes", flush=True)
    except (ErroMotor, ValueError, OSError) as e:
        print(f"rodada interrompida: não consegui devolver os CONST ({e}); fica para a próxima partida", flush=True)
RODANDO = ("preparando", "rodando", "pausada")


def ocupado():
    if rodada.get("estado") in RODANDO:
        raise ErroMotor("a simulação está rodando: pare ou espere terminar antes de mudar o circuito")


def rodar(c, ctl_de_fora=None):
    """Uma rodada por vez: a preparação (ler o circuito, abrir o processo do controle, INIT) já conta como ocupado.
    ctl_de_fora: um controle que não é o guardado (a proposta do Claude, no modo autônomo) — só por chamada interna."""
    with trava_rodada:
        ocupado()
        anterior = dict(rodada)
        rodada.clear()
        rodada.update(estado="preparando")
    try:
        return _rodar(c, ctl_de_fora)
    except BaseException:
        if rodada.get("estado") == "preparando":
            rodada.clear()
            rodada.update(anterior)
        raise


def _rodar(c, ctl_de_fora=None):
    """Começa a simulação do circuito aberto (em segundo plano) e publica no /maisim/scope: ao vivo e scope_<nome>.npz
    (Comparar), com o .ipes exato ao lado. Sinais: a saída de cada bloco de controle da folha principal (medidores e o
    resto), com o nome do rótulo da saída, e os medidores de dentro dos subcircuitos (SM_1_<rótulo>). Pausar, continuar e parar entre um bloco de passos e outro."""
    dt, tfim = float(c.get("dt", 1e-6)), float(c.get("tfim", 0.04))
    nome = str(c.get("nome", "") or "rodada").strip()
    if not re.match(r"^[A-Za-z0-9_\-]{1,40}$", nome):
        raise ErroMotor("nome da rodada: letras, números, _ e -, até 40")
    if not (1e-9 <= dt <= 1e-2) or not (dt < tfim <= 10.0):
        raise ErroMotor("passo entre 1 ns e 10 ms e tempo final maior que o passo, até 10 s")
    n = arred(tfim / dt)
    if n > 5_000_000:
        raise ErroMotor(f"{n} passos é demais para uma rodada pela tela (até 5 milhões)")
    r = estado()
    sinais = sinais_da_rodada(r)
    if not sinais:
        raise ErroMotor("não há o que medir: ponha um voltímetro ou amperímetro (aba Measure) e diga o que ele mede")
    amostras = max(10, min(n, int(c.get("amostras", 4000))))
    m = max(1, math.ceil(n / amostras))
    por_cima = str(c.get("por_cima", "")).lower() in ("1", "true", "sim") and not ctl_de_fora   # o autônomo sempre cria nova
    ctl = completa_controle(confere_controle(dict(ctl_de_fora))) if ctl_de_fora else le_controle()
    todos_atu = atuadores_disponiveis(r)
    lag = {a["nome"]: a["atraso_gecko"] for a in todos_atu}     # o atraso do próprio Gecko, por atuador (destinos_controle)
    avisos_rodada = []
    if ctl["ativo"]:                                   # controle ligado: confere tudo antes de começar
        segue_codigo(ctl, r)
        insts, erros_ctl, avisos_ctl = instancias_controle(ctl, r)
        if erros_ctl:
            raise ErroMotor(erros_ctl[0])
        avisos_rodada += avisos_ctl
        erros, avisos = verifica_arquivos(ctl, {i["arquivo"] for i in insts})
        if erros:
            raise ErroControle(erros[0]["msg"], erros[0]["linha"], arquivo=erros[0]["arquivo"])
        if avisos:
            raise ErroControle(avisos[0])
        atu = {a["nome"]: a["bloco"] for a in todos_atu}
        faltam = [a for a in ctl["atuacoes"] if a not in atu]
        if faltam:
            raise ErroMotor(f"atuadores marcados que não existem no circuito: {', '.join(faltam)}")
        nTs = max(1, arred(ctl["Ts"] / dt))
        if abs(nTs * dt - ctl["Ts"]) > 1e-9 * ctl["Ts"]:
            avisos_rodada.append(f"Ts = {ctl['Ts']:g} s não é múltiplo de Δt = {dt:g} s: o controle roda com Ts = {nTs} × Δt = "
                                 f"{nTs * dt:g} s (é o p[\"Ts\"] que o código recebe)")
        d_atu = passos_de_atraso(ctl["atraso"], nTs, dt)
        # cada atuação é escrita antes do passo k·n + desl: o circuito sente em k·n + d em todos os destinos que der
        desl = {x: max(0, d_atu - lag[x]) for x in ctl["atuacoes"]}
        for a in todos_atu:
            if a["nome"] not in ctl["atuacoes"]:
                continue
            if not a["destinos"]:
                avisos_rodada.append(f"a atuação {a['nome']} não chega a chave nem a fonte controlada (pelo traçado do MaiSim): o atraso é "
                                     "tratado como o de uma fonte (1 Δt do Gecko), sem garantia")
            for alvo, passo_, motivo in destinos_fora_do_passo(a, d_atu, desl[a["nome"]]):
                avisos_rodada.append(f"atuação {a['nome']} → {alvo}: " + (motivo if passo_ is None else
                                     f"o circuito sente em t + {passo_} × Δt, não em t + {d_atu} × Δt ({motivo})"))
    # acionamentos: CONST valendo no circuito a partir do passo j = round(t/Δt) (escrita antes do passo j − atraso do Gecko:
    # j − 1 para fonte, j para chave direto no GATE); p[...] na 1ª amostra ≥ t
    blocos_const = {a["nome"]: a["bloco"] for a in todos_atu}
    escritas_ev, params_ev = {}, {}
    for q in ctl.get("acionamentos", []):
        tipo, _, alvo = q["alvo"].partition(":")
        j_ev = arred(q["t"] / dt)
        if j_ev >= n:
            avisos_rodada.append(f"acionamento de {alvo} em {q['t']} s fica depois do fim: não acontece"); continue
        if tipo == "CONST":
            if alvo not in blocos_const:
                raise ErroMotor(f"acionamento: não há bloco CONST {alvo} no circuito")
            escritas_ev.setdefault(max(0, j_ev - lag[alvo]), []).append(f"{blocos_const[alvo]}:const:{q['valor']!r}")
            a = next(x for x in todos_atu if x["nome"] == alvo)   # o que não dá para compensar, avisado (uma vez cada)
            fora = [] if a["destinos"] else [("", None, "o CONST não chega a chave nem a fonte controlada (pelo traçado do MaiSim): "
                                                          "o atraso é tratado como o de uma fonte, sem garantia")]
            for alvo2, passo_, motivo in fora + destinos_fora_do_passo(a, j_ev, max(0, j_ev - lag[alvo])):
                txt = f"acionamento de {alvo} em {q['t']} s" + (f" → {alvo2}" if alvo2 else "") + ": " + (
                    motivo if passo_ is None else f"o circuito sente em t = {passo_ * dt:g} s ({motivo})")
                if txt not in avisos_rodada:
                    avisos_rodada.append(txt)
        elif not ctl["ativo"]:
            avisos_rodada.append(f"acionamento de p[\"{alvo}\"] ignorado: o controle está desligado")
        elif alvo not in {x["nome"] for x in ctl["parametros"]}:
            raise ErroMotor(f"acionamento de p[\"{alvo}\"]: não há esse parâmetro no painel")
        elif -(-j_ev // nTs) * nTs >= n:
            avisos_rodada.append(f"acionamento de p[\"{alvo}\"] em {q['t']} s cai depois da última amostra: não acontece")
        else:
            params_ev.setdefault(-(-j_ev // nTs), {})[alvo] = q["valor"]   # k = ⌈j/n⌉: a 1ª amostra em t ≥ t do acionamento
    # quando cada acionamento de fato acontece (as marcas no scope): CONST no passo j (≥ o atraso do Gecko); p[...] na amostra k
    efetivos = {}                                   # (alvo, instante efetivo) → o último prevalece (como na escrita)
    for q in ctl.get("acionamentos", []):
        tipo, _, alvo = q["alvo"].partition(":")
        j_ev = arred(q["t"] / dt)
        if j_ev >= n or (tipo == "p" and (not ctl["ativo"] or -(-j_ev // nTs) * nTs >= n)):
            continue
        t_ef = max(lag.get(alvo, 1), j_ev) * dt if tipo == "CONST" else -(-j_ev // nTs) * nTs * dt
        chave = (q["alvo"], round(t_ef / dt))
        if chave in efetivos:
            avisos_rodada.append(f"acionamento de {alvo} em {efetivos[chave]['t_pedido']} s substituído pelo de {q['t']} s (mesmo instante)")
        efetivos[chave] = dict(q, t=t_ef, t_pedido=q["t"])
    acionamentos_efetivos = sorted(efetivos.values(), key=lambda q: q["t"])
    # os CONST que a rodada escreve voltam ao valor de antes no fim (senão a próxima rodada começa de outro estado)
    escritos = sorted({blocos_const[x] for x in (ctl["atuacoes"] if ctl["ativo"] else []) if x in blocos_const} |
                      {e.split(":")[0] for v in escritas_ev.values() for e in v})
    valores_antes = {b: MOTOR.cmd(f"GETP {b} const") for b in escritos}
    t0 = time.time()                                     # uma pasta só desta rodada: duas no mesmo segundo, a 2ª vai para o
    for k in range(120):                                 # segundo seguinte (o nome continua data_hora_nome; "por cima" a reconhece)
        pasta = RODADAS / f"{time.strftime('%Y-%m-%d_%H%M%S', time.localtime(t0 + k))}_{nome}"
        try:
            pasta.mkdir(parents=True)
            break
        except FileExistsError:
            continue
    else:
        raise ErroMotor(f"não consegui uma pasta nova para a rodada {nome}")
    trab = None
    if ctl["ativo"]:
        for arq_py, cod in arquivos_de(ctl).items():      # todos os arquivos do controle, como estavam
            (pasta / arq_py).write_text(cod)
        (pasta / "controle.json").write_text(json.dumps({k: v for k, v in ctl.items() if k != "codigo"}, ensure_ascii=False, indent=1))
        log = open(pasta / "controle.log", "w")
        params = {q["nome"]: q["valor"] for q in ctl["parametros"]}
        params["Ts"] = nTs * dt
        try:
            trab = Controladores(insts, params, log, ctl["rede"]["latencia"])
        except ErroControle:
            log.close()
            raise
    meta = dict(planta="gecko-maisim", rotulo=nome, modelo=circuito_aberto(), dt=dt * m, Ts=dt * m, n_fino=1,
                dt_gecko=dt, tfim=tfim, sinais=[{"canal": k, "elemento": el} for el, k in sinais],
                cores=cores_efetivas(r),
                acionamentos=acionamentos_efetivos)
    if trab:
        cada = max(1, math.ceil(math.ceil(n / nTs) / amostras))      # amostras publicadas: a cada "cada" períodos de controle
        meta.update(dt=dt * nTs * cada, Ts=dt * nTs * cada, controle=dict(Ts=nTs * dt, atuacoes=ctl["atuacoes"],
                    parametros={q["nome"]: q["valor"] for q in ctl["parametros"]}, atraso_passos=d_atu, atraso=d_atu * dt,
                    escrita_passos=desl, destinos={a["nome"]: a["destinos"] for a in todos_atu if a["nome"] in ctl["atuacoes"]},
                    **({"controladores": [{k: i[k] for k in ("nome", "arquivo", "medidas", "atuacoes")} for i in insts],
                        "rede": ctl["rede"]} if ctl["controladores"] else {})))
    try:
        MOTOR.cmd(f"SAVEAS {pasta / (nome + '.ipes')}")      # o circuito exato desta rodada, ao lado do resultado
        if valores_antes:                                # se o servidor cair no meio, a próxima partida devolve os CONST
            DEVOLVER.write_text(json.dumps(valores_antes))
        MOTOR.cmd(f"INIT {dt!r} {tfim!r}")
        # a amostra de t = 0: antes do 1º passo as saídas do Gecko valem 0 (nada foi calculado), e o controle recebia zeros
        # em passo(t = 0) e o scope mostrava 0 (achado de 20/10 no porte do controle do artigo: os SMs nasceriam com
        # v_C = 0 e o PLL leria 0). Um passo de prova lê o estado inicial que o Gecko calcula (o 1º passo, com os CONST
        # como estão) e a simulação recomeça do zero (INIT de novo): o tempo e o resto da rodada não mudam
        iniciais = None
        if sinais:
            MOTOR.cmd("STEP 1")
            prova = MOTOR.cmd("GETM " + " ".join(el for el, _ in sinais)).split()
            MOTOR.cmd(f"INIT {dt!r} {tfim!r}")
            iniciais = {canal: float(v) for (_, canal), v in zip(sinais, prova)}
    except BaseException:
        if trab:
            trab.fecha()
            log.close()
        DEVOLVER.unlink(missing_ok=True)
        raise
    controle_rodada["pausa"].clear(); controle_rodada["parar"].clear()
    arq = pasta / f"scope_{nome}.npz"
    rodada.clear()
    rodada.update(estado="rodando", nome=nome, t=0.0, tfim=tfim, dt=dt, passos=n, amostras=0, sinais=[k for _, k in sinais],
                  arquivo=relativo(arq), modelo=relativo(pasta / (nome + ".ipes")), inicio=time.time(), avisos=avisos_rodada)

    def anda(k0, npassos, escritas):
        """Anda npassos a partir do passo k0, escrevendo (SETM) antes do passo k0 + o cada lista de escritas[o]."""
        feito, tt = 0, None
        for o in sorted(x for x in escritas if 0 <= x < npassos):
            if o > feito:
                tt = float(MOTOR.cmd(f"STEP {o - feito}")); feito = o
            MOTOR.cmd("SETM " + " ".join(escritas[o]))
        if npassos > feito:
            tt = float(MOTOR.cmd(f"STEP {npassos - feito}"))
        return tt

    agenda = {}                                     # escritas do controle por passo absoluto (a de uma amostra pode cair no trecho seguinte)

    def escritas_do_trecho(k0, npassos):
        """As escritas que caem em [k0, k0 + npassos): as do controle (agenda) e as dos acionamentos de CONST."""
        esc = {w - k0: agenda.pop(w) for w in sorted(agenda) if k0 <= w < k0 + npassos}
        for w, v in escritas_ev.items():
            if k0 <= w < k0 + npassos:
                esc.setdefault(w - k0, []).extend(v)      # na mesma escrita, o acionamento vem depois (prevalece)
        return esc

    def laco_controle(pub, nomes):
        """A cada Ts: medidas → passo() do usuário → atuações nos CONST → Ts no Gecko. Publica a cada "cada" períodos."""
        le = lambda: {canal: float(v) for (_, canal), v in zip(sinais, MOTOR.cmd(f"GETM {nomes}").split())}
        k, j, tt, regs, avisados = 0, 0, 0.0, None, set()
        vals = dict(iniciais) if iniciais else le()       # t = 0: o estado inicial (o passo de prova), não os zeros
        while k < n and not controle_rodada["parar"].is_set():
            if controle_rodada["pausa"].is_set():
                rodada["estado"] = "pausada"; time.sleep(0.1); continue
            rodada["estado"] = "rodando"
            if j in params_ev:                           # acionamentos de p[...]: valem a partir desta amostra
                trab.pede({"op": "parametros", "p": params_ev[j]})
            res = trab.pede({"op": "passo", "t": tt, "m": vals})
            a, sreg = res["a"], res["s"]
            fora = [x for x in a if x not in atu or x not in ctl["atuacoes"]]
            if fora:
                raise ErroControle(f"passo() devolveu {', '.join(fora)}, que não é atuação marcada no painel")
            passo = min(nTs, n - k)
            for x, v in a.items():                       # vale no circuito em k + d (antes do passo k + desl, ver destinos_controle)
                if isinstance(v, list):                  # o padrão dentro da amostra: o valor o vale em k + d + o (escrito só onde muda)
                    if len(v) != nTs:
                        raise ErroControle(f"a atuação {x} veio com {len(v)} valores: o padrão dentro da amostra tem um valor "
                                           f"por Δt, Ts/Δt = {nTs}")
                    ant = None
                    for o, vo in enumerate(v):
                        if vo != ant:
                            agenda.setdefault(k + desl[x] + o, []).append(f"{atu[x]}:const:{vo!r}")
                            ant = vo
                else:
                    agenda.setdefault(k + desl[x], []).append(f"{atu[x]}:const:{v!r}")
            if regs is None:                             # as variáveis do scope() ficam fixas na 1ª amostra (colunas alinhadas)
                regs = {x: (x if x not in vals and x != "t" else "ctrl_" + x) for x in sorted(sreg) if IDENT.match(x)}
                avisados = set(regs)
            for x in sorted(set(sreg) - avisados):       # o que não vai para o scope: avisa uma vez (não some calado)
                avisados.add(x)
                if len(avisados) - len(regs) > 5:       # nome novo a cada amostra: não enche a lista de avisos
                    if len(avisados) - len(regs) == 6:
                        avisos_rodada.append("scope(): mais nomes novos depois da 1ª amostra (também não vão para o scope)")
                    continue
                avisos_rodada.append(f"scope(\"{x}\") " + ("não é um nome válido (letras, números e _)" if not IDENT.match(x) else
                                     f"apareceu só em t = {tt:g} s, depois da 1ª amostra") + ": não vai para o scope — chame "
                                     "scope() com os mesmos nomes desde a 1ª amostra (guarde o valor em e e mande sempre)")
            if j % cada == 0:
                pub.amostra(dict(t=tt, **vals, **{col: sreg.get(x, float("nan")) for x, col in regs.items()}))
            tt = anda(k, passo, escritas_do_trecho(k, passo)); k += passo; j += 1
            vals = le()
            rodada.update(t=tt, amostras=rodada["amostras"] + (1 if j % cada == 0 else 0))
        pub.amostra(dict(t=tt, **vals, **{col: float("nan") for col in (regs or {}).values()}))
        return k

    def laco_simples(pub, nomes):
        """Sem controle: anda m passos, lê e publica."""
        k = 0
        pub.amostra(dict(t=0.0, **(iniciais or {canal: float(v) for (_, canal), v in zip(sinais, MOTOR.cmd(f"GETM {nomes}").split())})))
        while k < n and not controle_rodada["parar"].is_set():
            if controle_rodada["pausa"].is_set():
                rodada["estado"] = "pausada"; time.sleep(0.1); continue
            rodada["estado"] = "rodando"
            passo = min(m, n - k)
            tt = anda(k, passo, escritas_do_trecho(k, passo)); k += passo
            pub.amostra(dict(t=tt, **{canal: float(v) for (_, canal), v in zip(sinais, MOTOR.cmd(f"GETM {nomes}").split())}))
            rodada.update(t=tt, amostras=rodada["amostras"] + 1)
        return k

    def laco():
        pub = PublicadorScope(SCOPE, meta)
        nomes = " ".join(el for el, _ in sinais)
        try:
            k = laco_controle(pub, nomes) if trab else laco_simples(pub, nomes)
            final = dict(estado="fim" if k >= n else "parada")
        except ErroControle as e:                                # erro no código do usuário: linha e rastro para o editor
            final = dict(estado="erro", erro=str(e), erro_controle=dict(linha=e.linha, rastro=e.rastro, arquivo=e.arquivo))
        except Exception as e:                                   # simulação que o Gecko recusa (ex.: circuito sem referência)
            final = dict(estado="erro", erro=str(e))
        finally:
            if trab:
                guarda_vistas(trab, ctl, "rodada")
                trab.fecha()
                log.close()
                try:
                    rodada["saida_controle"] = (pasta / "controle.log").read_text()[-4000:]
                except OSError:
                    pass
            try:
                MOTOR.cmd("END")
            except ErroMotor:
                pass
            try:                                         # os CONST escritos pela rodada voltam ao valor de antes
                if valores_antes:
                    MOTOR.cmd("SETM " + " ".join(f"{b}:const:{v}" for b, v in valores_antes.items()))
                DEVOLVER.unlink(missing_ok=True)
            except ErroMotor as e:
                rodada.setdefault("avisos", []).append(f"não consegui devolver os CONST ao valor de antes: {e}")
            pub.fecha(arq)                                       # grava o .npz antes de dizer "fim" (a tela abre o arquivo)
            rodada.update(segundos=round(time.time() - rodada["inicio"], 2), amostras=len(pub.tudo.get("t", [])))
            fim_ = locals().get("final") or dict(estado="erro", erro="a rodada terminou sem estado")
            try:                                         # os "olhos" do Claude do MaiSim: o resumo ao lado do .npz
                resumo_rodada.escreve(arq, pasta, estado=dict(fim_, segundos=rodada.get("segundos")),
                                      saida_controle=rodada.get("saida_controle") or "")
            except Exception as e:
                print(f"{time.strftime('%H:%M:%S')} resumo da rodada {nome}: {e}", flush=True)
            if por_cima and fim_.get("estado") in ("fim", "parada"):
                try:
                    fim_["substituidas"] = substitui_anteriores(nome, meta["modelo"], pasta)
                except OSError as e:
                    rodada.setdefault("avisos", []).append(f"não consegui tirar a rodada anterior de mesmo nome: {e}")
            rodada.update(fim_)
    threading.Thread(target=laco, daemon=True).start()
    return dict(rodada)


# a rodada "por cima" (Marcelo, 22/10: "não encher o disco"): a rodada nova continua numa pasta nova (sem misturar arquivos
# velhos nem ler o .npz pela metade) e, só depois de terminar bem (fim ou parada; com erro, a anterior fica), saem as pastas
# anteriores com o mesmo nome E do mesmo circuito que não estejam guardadas (.guardada). O modo autônomo da IA sempre cria
# nova; pela API, o padrão é criar nova (a tela manda por_cima)
GUARDADA = ".guardada"


def circuito_aberto():
    """O circuito como a rodada o grava no meta (e no resumo.md): o arquivo aberto ou "novo (sem arquivo)"."""
    return editor["aberto"] or "novo (sem arquivo)"


def substitui_anteriores(nome, modelo, pasta_nova):
    if modelo == "novo (sem arquivo)":                   # os circuitos sem arquivo são todos "novo": não dá para saber se é o mesmo
        return []
    import numpy as np                                   # só aqui: ler o meta das rodadas antigas
    padrao, out = re.compile(r"^\d{4}-\d\d-\d\d_\d{6}_" + re.escape(nome) + "$"), []
    for d in RODADAS.iterdir() if RODADAS.is_dir() else []:
        if not d.is_dir() or d == pasta_nova or not padrao.match(d.name) or (d / GUARDADA).exists():
            continue
        f = d / f"scope_{nome}.npz"
        try:
            meta = json.loads(str(np.load(f, allow_pickle=False)["meta"]))
        except Exception:
            continue                                     # sem gravação (ou ilegível): não é "a anterior" — fica
        if meta.get("modelo") != modelo:
            continue                                     # o mesmo nome, outro circuito: fica
        tam = sum(x.stat().st_size for x in d.rglob("*") if x.is_file())
        shutil.rmtree(d, ignore_errors=True)
        out.append({"pasta": d.name, "tamanho": tam})
    return out


def guarda_rodada(rel, guardar=True):
    """Guarda (ou não) a rodada: a pasta dela ganha .guardada — o "por cima" não a substitui; apagar pede confirmação."""
    arq = (RAIZ / rel if not Path(rel).is_absolute() else Path(rel)).resolve()
    d = arq.parent
    if d.parent.resolve() != RODADAS.resolve() or not arq.name.startswith("scope_") or not arq.is_file():
        raise ErroMotor("só uma rodada do simu (na pasta das rodadas) pode ser guardada")
    if guardar:
        (d / GUARDADA).write_text(time.strftime("%Y-%m-%d %H:%M") + "\n")
    else:
        (d / GUARDADA).unlink(missing_ok=True)
    return {"guardada": guardar, "pasta": d.name}


BLOCO_PAR = {"blocksizex": "blockSizeX", "blocksizey": "blockSizeY"}


def normaliza(op, a):
    """O tamanho do bloco pelo painel de parâmetros vem com o nome do Gecko (BlockSizeX): é o mesmo pedido que blockSizeX, e
    a conferência dos bornes e o reabrir (que recalcula as posições) valem para os dois."""
    if op == "SETP" and len(a) > 1 and str(a[1]).lower() in BLOCO_PAR:
        a[1] = BLOCO_PAR[str(a[1]).lower()]
    return a


def comando(op, a):
    """Um pedido de edição, com os argumentos conferidos, no protocolo do motor."""
    num = lambda v: repr(float(v))
    inteiro = lambda v: str(int(v))
    nome = lambda v: v if NOME.match(str(v)) else (_ for _ in ()).throw(ErroMotor(f"nome inválido: {v!r}"))
    rot = lambda v: v if ROTULO.match(str(v)) else (_ for _ in ()).throw(ErroMotor(f"rótulo inválido: {v!r}"))
    if op == "CREATE":
        if not re.match(r"^[A-Za-z0-9_ .\->]+$", str(a[3])):
            raise ErroMotor(f"tipo inválido: {a[3]!r}")
        return f"CREATE {nome(a[0])} {inteiro(a[1])} {inteiro(a[2])} {a[3]}"
    formas = {"DELETE": (nome,), "ROTATE": (nome,), "MOVE": (nome, inteiro, inteiro), "RENAME": (nome, nome),
              "SETP": (nome, nome, num), "SETG": (nome, num), "INNODE": (nome, inteiro, rot), "OUTNODE": (nome, inteiro, rot)}
    if op not in formas or len(a) != len(formas[op]):
        raise ErroMotor(f"pedido desconhecido: {op} {a}")
    return " ".join([op] + [f(v) for f, v in zip(formas[op], a)])


# ---------------------------------------------------------------- terminal de subcircuito (o borne do bloco)
# Regras do Gecko (TerminalToWrap, SubcircuitBlock): o terminal arrastado na folha de dentro encosta na borda mais próxima
# (as diagonais da folha dividem os quatro lados) e essa borda é o lado do borne no bloco; a posição no lado é proporcional
# (⌊blockSizeY · y / worksheetSizeY⌋ à esquerda e à direita, ⌊blockSizeX · x / worksheetSizeX⌋ em cima e embaixo). Dois
# terminais na mesma posição dão dois bornes no mesmo ponto (o aviso do Gecko para isso está desligado no código dele):
# aqui o terminal vai para a posição livre mais perto, na mesma borda. Pela interface remota, o Gecko só encosta ao mover
# (criar deixa o terminal onde está, com o lado padrão, esquerda) e ignora um passo com dx == dy (moveComponent).
TIPOS_TERMINAL = {"CIRCUIT_TERMINAL", "CONTROL_TERMINAL"}
LADO_NOME = {0: "em cima", 1: "à esquerda", 2: "à direita", 3: "embaixo"}


def borda_gecko(x, y, sx, sy):
    """(x, y, lado) onde o Gecko põe o terminal levado até (x, y) — TerminalToWrap.reCalculateLocation."""
    x, y = min(x, sx - 1), min(y, sy - 1)
    if y > x * 1.0 * sy / sx:
        return (1, y, 1) if y < sy - x * 1.0 * sy / sx else (x, sy - 1, 3)
    return (x, 2, 0) if y < sy - x * 1.0 * sy / sx else (sx - 1, y, 2)


def borne_relativo(lado, x, y, bx, by, sx, sy):
    """O borne no bloco (relativo ao bloco) de um terminal em (x, y) — SubcircuitBlock.recalculateTerminalPositions."""
    if lado in (0, 3):
        return (int(bx * 1.0 * x / sx), -1 if lado == 0 else by)
    return (-1 if lado == 1 else bx, int(by * 1.0 * y / sy))


def sm_da_folha(r, prefixo):
    """(bloco, folha) do subcircuito chamado prefixo (o nome antes do # nos pedidos)."""
    fids = [k for k, f in r["folhas"].items() if k != "0" and f["nome"] == prefixo]
    if len(fids) != 1:
        raise ErroMotor(f"não achei o subcircuito {prefixo}" if not fids else f"há {len(fids)} subcircuitos chamados {prefixo}")
    bloco = next((e for f in r["folhas"].values() for e in f["elementos"] if e["tipo"] == "SUBCIRCUIT" and e["uid"] == fids[0]), None)
    if bloco is None or "tamanho" not in r["folhas"][fids[0]]:
        raise ErroMotor(f"não achei o bloco do subcircuito {prefixo}")
    return bloco, r["folhas"][fids[0]]


def plano_terminal(op, a, r):
    """CREATE de terminal num subcircuito, ou MOVE de um: onde ele fica (na borda, num borne livre). None se não é o caso;
    ErroMotor (antes de mexer em nada) se não há borne livre naquele lado."""
    if op not in ("CREATE", "MOVE") or "#" not in str(a[0]):
        return None
    if op == "CREATE" and str(a[3]) not in TIPOS_TERMINAL:
        return None
    prefixo, nome = str(a[0]).rsplit("#", 1)
    bloco, folha = sm_da_folha(r, prefixo)
    if op == "MOVE" and not any(e["nome"] == nome and e["tipo"] == "TERM" for e in folha["elementos"]):
        return None
    (sx, sy), (bx, by) = folha["tamanho"], bloco["tamanho"]
    x, y = max(0, min(int(a[1]), sx - 1)), max(0, min(int(a[2]), sy - 1))
    px, py, lado = borda_gecko(x, y, sx, sy)
    ocupados = {(t["x"] - bloco["x"], t["y"] - bloco["y"]) for t in bloco["terminais"] if t.get("interno") != nome}
    # pontos da mesma borda que o Gecko mantém nela (encostar de novo não muda), do mais perto ao mais longe do pedido
    if lado in (1, 2):
        linha = [(px, v) for v in sorted(range(sy), key=lambda v: (abs(v - py), v))]
    else:
        linha = [(v, py) for v in sorted(range(sx), key=lambda v: (abs(v - px), v))]
    linha = [p for p in linha if borda_gecko(p[0], p[1], sx, sy) == (p[0], p[1], lado)]
    for p in linha:
        if borne_relativo(lado, p[0], p[1], bx, by, sx, sy) not in ocupados:
            vizinhos = sorted((q for q in linha if q != p), key=lambda q: abs(q[0] - p[0]) + abs(q[1] - p[1]))[:4]
            return dict(nome=str(a[0]), curto=nome, sm=prefixo, ponto=p, lado=lado, pedido=[int(a[1]), int(a[2])], vizinhos=vizinhos,
                        borne=borne_relativo(lado, p[0], p[1], bx, by, sx, sy), deslizou=p != (px, py), criado=op == "CREATE")
    n = by if lado in (1, 2) else bx
    raise ErroMotor(f"o bloco {prefixo} não tem borne livre {LADO_NOME[lado]} (cabem {n} desse lado, um por quadrado): aumente o "
                    f"tamanho do bloco (nas propriedades do subcircuito) ou leve o terminal para outra borda da folha")


def poe_terminal(p):
    """Leva o terminal ao ponto do plano. O Gecko decide o lado pelo ponto; um passo com dx == dy ele ignora, e o terminal
    recém-criado já está no ponto mas com o lado padrão (esquerda): nesses casos ele passa antes por um vizinho da borda."""
    nome, (tx, ty) = p["nome"], p["ponto"]
    pos = lambda: tuple(int(v) for v in MOTOR.cmd(f"POS {nome}").split())
    cx, cy = pos()
    if (cx, cy) == (tx, ty) and not (p["criado"] and p["lado"] != 1):
        return
    if (cx, cy) != (tx, ty) and tx - cx != ty - cy:
        MOTOR.cmd(f"MOVE {nome} {tx} {ty}")
        if pos() == (tx, ty):
            return
    for vx, vy in p["vizinhos"]:
        cx, cy = pos()
        if vx - cx == vy - cy:
            continue
        MOTOR.cmd(f"MOVE {nome} {vx} {vy}")
        MOTOR.cmd(f"MOVE {nome} {tx} {ty}")
        if pos() == (tx, ty):
            return
    raise ErroMotor(f"o Gecko não levou {nome} até ({tx}, {ty})")


def confere_terminal(r, p):
    """O borne ficou onde o plano disse? (o Gecko é quem decide; o desenho vem do que ele salvou)"""
    bloco, _ = sm_da_folha(r, p["sm"])
    t = next((t for t in bloco["terminais"] if t.get("interno") == p["curto"]), None)
    feito = t is not None and (t["x"] - bloco["x"], t["y"] - bloco["y"]) == tuple(p["borne"])
    return dict(nome=p["curto"], lado=LADO_NOME[p["lado"]], ponto=list(p["ponto"]), pedido=p["pedido"], deslizou=p["deslizou"],
                ok=feito, **({} if feito else {"aviso": p.get("falhou") or f"o borne de {p['curto']} não ficou onde devia: confira o bloco {p['sm']}"}))


def confere_tamanho(r, nome, par, valor, tam=None):
    """Mudar o tamanho do bloco não pode juntar dois bornes no mesmo ponto (a posição é proporcional ao tamanho).
    tam: o tamanho de partida (num lote, o que os pedidos de antes no mesmo bloco deixaram). Devolve o tamanho novo."""
    folha_pai = "0"
    if "#" in nome:
        prefixo, nome = nome.rsplit("#", 1)
        folha_pai = sm_da_folha(r, prefixo)[0]["uid"]
    bloco = next((e for e in r["folhas"].get(folha_pai, {"elementos": []})["elementos"] if e["nome"] == nome and e["tipo"] == "SUBCIRCUIT"), None)
    if bloco is None or bloco["uid"] not in r["folhas"]:
        return tam
    folha = r["folhas"][bloco["uid"]]
    (sx, sy), (bx, by) = folha["tamanho"], (tam or bloco["tamanho"])

    def pares(bx, by):                                  # pares de terminais que caem no mesmo borne
        onde = {}
        for t in folha["elementos"]:
            if t["tipo"] == "TERM":
                onde.setdefault(borne_relativo(int(t["par"].get("terminalLocation", 1)), t["x"], t["y"], bx, by, sx, sy), []).append(t["nome"])
        return {(a, b) for v in onde.values() for a in v for b in v if a < b}
    novos = pares(*((valor, by) if par == "blockSizeX" else (bx, valor))) - pares(bx, by)   # os que já estavam juntos não impedem
    if novos:
        raise ErroMotor(f"com {'largura' if par == 'blockSizeX' else 'altura'} {valor}, " + "; ".join(" e ".join(v) for v in sorted(novos))
                        + " ficariam no mesmo borne: afaste os terminais na folha de dentro antes, ou use um bloco maior")
    return [valor, by] if par == "blockSizeX" else [bx, valor]


def talvez_terminal(op, a):
    """Pode ser um terminal de subcircuito? (para não ler o estado do Gecko à toa a cada componente movido num SM)"""
    if op == "CREATE":
        return str(a[3]) in TIPOS_TERMINAL
    ult = editor.get("ultimo")
    if not ult:
        return True
    prefixo, nome = str(a[0]).rsplit("#", 1)
    tipos = {e["tipo"] for k, f in ult["folhas"].items() if k != "0" and f["nome"] == prefixo for e in f["elementos"] if e["nome"] == nome}
    return not tipos or "TERM" in tipos


def executa(op, a, r=None):
    """Um pedido de edição no motor, com as regras do terminal de subcircuito e do tamanho do bloco. Devolve o plano do
    terminal (ou None). r: o estado de agora (para o plano; lido do Gecko se não vier)."""
    a = normaliza(op, a)
    linha = comando(op, a)
    plano = None
    if op in ("CREATE", "MOVE") and "#" in str(a[0]) and talvez_terminal(op, a):
        plano = plano_terminal(op, a, r or estado())
    if op == "SETP" and str(a[1]) in ("blockSizeX", "blockSizeY"):
        if not (float(a[2]).is_integer() and 2 <= float(a[2]) <= 40):
            raise ErroMotor("tamanho do bloco: um número inteiro de 2 a 40 quadrados")
        confere_tamanho(r or estado(), str(a[0]), str(a[1]), int(float(a[2])))
    if plano and op == "CREATE":
        linha = comando(op, [a[0], plano["ponto"][0], plano["ponto"][1], a[3]])
    if not (plano and op == "MOVE"):
        MOTOR.cmd(linha)
    if plano:
        try:                                         # depois de mexer, não levanta erro: o desfazer fica com o passo
            poe_terminal(plano)
        except ErroMotor as e:
            plano["falhou"] = str(e)
    if op == "SETP" and str(a[1]) in ("blockSizeX", "blockSizeY"):
        # o Gecko só reposiciona os bornes de baixo e da direita ao mudar o tamanho; reabrir recalcula todos (como ao abrir
        # o arquivo), e o desenho e a simulação ficam iguais
        arq = ESTADO.with_name("bloco.ipes")
        MOTOR.cmd(f"SAVEAS {arq}")
        abre(arq)
    return plano



# ---------------------------------------------------------------- Claude do MaiSim (login; o "pedir ao Claude" vem depois)
# O MaiSim usa o CLI oficial (`claude`), sem modificação, com uma pasta de configuração só dele (CLAUDE_CONFIG_DIR =
# ~/.claude-maisim, fora do repositório: uma busca ou um zip da pasta da tese não levam a credencial): o login do MaiSim não
# mexe no ~/.claude do usuário. O login é o do próprio CLI (`claude auth
# login`, que imprime o link e lê o código colado pela entrada padrão, e ao mesmo tempo espera o retorno automático num
# localhost): a autenticação acontece na página da Anthropic; o servidor só mostra os links e, se o retorno automático não
# chegar, repassa ao CLI o código que o usuário colar. O servidor nunca lê nem guarda a credencial (quem grava
# .claude-maisim/.credentials.json é o CLI). O processo filho recebe um ambiente limpo (lista branca): variáveis de uma sessão
# do Claude Code (ANTHROPIC_BASE_URL, CLAUDE_CODE_*…) ou uma ANTHROPIC_API_KEY não vazam para ele. Conferido com o CLI 2.1.273.
# As IAs do MaiSim (ia/, etapa 2 do hub de IA): cada uma é uma peça com o seu comando, a sua pasta de configuração e a
# leitura da saída dela; o resto (a pasta de trabalho, o registro da conversa, os contextos) é igual para todas.
IAS = ias_maisim.registro()                                     # o Claude; na instância de teste (MAISIM_IA_TESTE=1), também o Eco
CLAUDE = IAS["claude"]
for _a in IAS.values():                                      # a lista de modelos do Antigravity etc. (em segundo plano)
    threading.Thread(target=_a.ao_iniciar, daemon=True).start()
CLAUDE_DIR, CLAUDE_BIN = CLAUDE.pasta, CLAUDE.bin           # MAISIM_CLAUDE_DIR / MAISIM_CLAUDE_BIN: testes
CLAUDE_URL_AUTO = ESTADO.with_name("claude_url_auto.txt")   # o claude_navegador.sh grava aqui a URL de retorno automático
claude_login = {}                                            # o login em andamento (um por vez): proc, andamento, urls, erro…
trava_claude = threading.Lock()
ESC = re.compile(r"\x1b\]8;;[^\x07]*\x07|\x1b\[[0-9;?]*[A-Za-z]")   # hiperlink OSC 8 e cores ANSI


def ambiente_claude(**extra):
    """O ambiente do `claude` filho, por lista branca, com a pasta de configuração do MaiSim (ia/claude.py)."""
    return CLAUDE.ambiente(**extra)


def claude_estado():
    """O login do Claude do MaiSim (`claude auth status --json` na pasta do MaiSim) e o login em andamento, se houver."""
    out = {"pasta": str(CLAUDE_DIR).replace(str(Path.home()), "~", 1), "instalado": Path(CLAUDE_BIN).exists(), "logado": False}
    if out["instalado"] and pedido_rodando() and estado_cache["v"]:    # um pedido rodando: o estado guardado (sem outro `claude`)
        out.update(estado_cache["v"])
    elif out["instalado"]:
        CLAUDE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            with trava_cli:
                r = subprocess.run(CLAUDE.comando_estado(), env=ambiente_claude(), capture_output=True,
                                   text=True, timeout=30, stdin=subprocess.DEVNULL)
            out.update(CLAUDE.le_estado(json.loads(r.stdout or "{}")))
            estado_cache["v"] = {k: out.get(k) for k in ("logado", "metodo", "email", "plano", "organizacao")}
        except (subprocess.TimeoutExpired, ValueError, OSError) as e:
            out["erro"] = f"claude auth status: {e}"
    with trava_claude:
        if claude_login:
            out["login"] = {k: claude_login.get(k) for k in ("andamento", "url_auto", "url_manual", "erro", "mensagem", "desde")}
    return out


def _le_login(proc):
    """Lê a saída do `claude auth login` (sem quebra de linha no "Paste code here if prompted > "): tira a URL manual e,
    no fim, o resultado. Só guarda a URL e as linhas de erro (o código colado não passa por aqui: o CLI não o ecoa)."""
    texto = ""
    while True:
        bloco = proc.stdout.read1(4096)
        if not bloco:
            break
        texto = (texto + bloco.decode(errors="replace"))[-20000:]
        limpo = ESC.sub("", texto)
        m = re.search(r"If the browser didn't open, visit: (https://\S+)", limpo)
        with trava_claude:
            if m and claude_login.get("proc") is proc:
                claude_login["url_manual"] = m.group(1)
    proc.wait()
    limpo = ESC.sub("", texto).replace("Paste code here if prompted > ", "\n")   # o resultado vem colado no prompt
    with trava_claude:
        if claude_login.get("proc") is not proc:
            return
        claude_login.update(andamento=False, proc=None)
        if proc.returncode == 0 and "Login successful" in limpo:
            claude_login.update(mensagem="login feito", erro=None)
        elif not claude_login.get("erro"):
            linhas = [x.strip() for x in limpo.splitlines() if re.search(r"(?i)error|failed|invalid|expired", x)]
            claude_login["erro"] = (linhas[-1] if linhas else f"o login terminou (saída {proc.returncode})")[:300]


def claude_login_inicia():
    """Começa o `claude auth login` (um por vez) e espera os links aparecerem."""
    with trava_claude:
        p = claude_login.get("proc")
        if p is not None and p.poll() is None:
            em_andamento = True
        else:
            em_andamento = False
            if not Path(CLAUDE_BIN).exists():
                raise ErroMotor("o Claude Code (claude) não está instalado neste computador")
            CLAUDE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
            CLAUDE_URL_AUTO.unlink(missing_ok=True)
            proc = subprocess.Popen([CLAUDE_BIN, "auth", "login", "--claudeai"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, cwd=str(CLAUDE_DIR), start_new_session=True,
                                    env=ambiente_claude(BROWSER=str(AQUI / "claude_navegador.sh"), MAISIM_CLAUDE_URL_ARQ=str(CLAUDE_URL_AUTO)))
            claude_login.clear()
            claude_login.update(proc=proc, andamento=True, desde=time.time(), url_auto=None, url_manual=None, erro=None, mensagem=None)
            threading.Thread(target=_le_login, args=(proc,), daemon=True).start()
            # sem prazo (pedido do Marcelo): o login espera a autorização o tempo que for, até ela chegar ou o cancelar
    if not em_andamento:
        for _ in range(200):                             # até 20 s pelos dois links (o automático vem logo depois do manual)
            with trava_claude:
                if claude_login.get("url_manual") and CLAUDE_URL_AUTO.exists() or not claude_login.get("andamento"):
                    break
            time.sleep(0.1)
    with trava_claude:
        if CLAUDE_URL_AUTO.exists() and claude_login.get("andamento") and not claude_login.get("url_auto"):
            u = CLAUDE_URL_AUTO.read_text().strip()
            claude_login["url_auto"] = u if u.startswith("https://") else None
    return claude_estado()


def claude_login_codigo(codigo):
    """O código que a página da Anthropic mostrou (forma xxxx#yyyy), repassado ao `claude auth login`."""
    codigo = re.sub(r"\s+", "", str(codigo))
    if not re.fullmatch(r"[A-Za-z0-9_.~\-]+#[A-Za-z0-9_.~\-]+", codigo) or len(codigo) > 2000:
        raise ErroMotor("o código tem a forma xxxx#yyyy: copie inteiro, da página da Anthropic")
    with trava_claude:
        p = claude_login.get("proc")
        if p is None or p.poll() is not None:
            raise ErroMotor("não há login em andamento: clique em entrar de novo")
        p.stdin.write((codigo + "\n").encode())
        p.stdin.flush()
    for _ in range(300):                                 # a troca do código leva uns segundos
        if p.poll() is not None:
            break
        time.sleep(0.1)
    time.sleep(0.3)                                      # o leitor fecha o resultado
    return claude_estado()


def claude_login_cancela(proc=None, motivo="cancelado"):
    with trava_claude:
        p = claude_login.get("proc")
        if p is None or (proc is not None and p is not proc):
            return
        claude_login.update(proc=None, andamento=False, erro=motivo)
    try:
        os.killpg(p.pid, 15)
    except OSError:
        pass
    CLAUDE_URL_AUTO.unlink(missing_ok=True)


def claude_sai():
    claude_login_cancela()
    try:
        r = subprocess.run([CLAUDE_BIN, "auth", "logout"], env=ambiente_claude(), capture_output=True, text=True, timeout=30,
                           stdin=subprocess.DEVNULL)
    except (subprocess.SubprocessError, OSError) as e:
        raise ErroMotor(f"claude auth logout: {e}")
    with trava_claude:
        claude_login.clear()
    out = claude_estado()
    if out["logado"]:
        raise ErroMotor(f"o logout não saiu: {(r.stdout + r.stderr).strip()[-200:]}")
    return out


# ---------------------------------------------------------------- as contas das outras IAs (etapa 3 do hub de IA)
# O login de uma IA que não é o Claude é da peça dela (ia/<nome>.py: o Gemini abre o CLI num terminal, mostra o link do
# Google e repassa o código colado). O servidor só escolhe a peça e passa os erros para a tela.
def ia_com_login(ia):
    a = IAS.get(str(ia or ""))
    if a is None or not a.tem_login:
        raise ErroMotor(f"IA desconhecida (ou sem login pelo MaiSim): {ia}")
    return a


def ia_logada(a):
    if a.tem_login and not a.estado().get("logado"):
        raise ErroMotor(f"entre com a conta do {a.nome} antes (o balão da IA no cabeçalho)")


def ia_conta(ia, acao, *args):
    a = ia_com_login(ia)
    if not hasattr(a, acao):
        raise ErroMotor(f"{a.nome}: não dá para {acao.replace('_', ' ')}")
    try:
        return getattr(a, acao)(*args) if acao != "cancela" else (a.cancela(), a.estado())[1]
    except ValueError as e:
        raise ErroMotor(str(e))


# ---------------------------------------------------------------- Claude do MaiSim: uso da conta e "pedir ao Claude" (passo 3b)
# O usuário monta o circuito; o Claude do MaiSim cuida só do controle. Cada conversa (uma por circuito, até "nova conversa")
# tem uma pasta própria, que é o cwd do `claude` (a retomada de uma sessão exige o mesmo cwd). A cada pedido o MaiSim reescreve
# nela o estado atual: controle.py, parametros.json, acionamentos.json, CONTEXTO.md (o circuito, as medidas, as atuações,
# Ts, Δt e tfim) e o GUIA_CONTROLE.md. Os anexos (PDF de artigo, foto) ficam em anexos/ e o Claude Code os lê direto.
# O `claude` roda restrito: --restricted (sem terminal nem internet; os arquivos ficam na pasta), só Read/Glob/Grep/Edit,
# Edit só nesses três arquivos, --permission-mode dontAsk + --permission-prompts none (o que pediria permissão é negado).
# No fim, o MaiSim lê os arquivos de volta, valida e testa a proposta (iniciar e 3 passo, sem simular) e a tela mostra a
# diferença: o usuário aplica ou descarta. A credencial continua só com o CLI (o servidor não a lê).
CLAUDE_CASA = ESTADO.with_name("claude")
CLAUDE_CONVERSAS = CLAUDE_CASA / "conversas"
CLAUDE_SESSOES = CLAUDE_CASA / "sessoes.json"
EDITAVEIS = ("controle.py", "parametros.json", "acionamentos.json", "controladores.json", "memoria.md")
CONTEXTOS = contextos.pasta_padrao()               # os contextos salvos (contextos.py): dados do MaiSim, fora do repositório
CLAUDE_MEMORIA = CLAUDE_CASA / "memoria.md"      # a memória do MaiSim: vale em todas as conversas (o usuário edita; o Claude propõe)
ANEXO_TIPOS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".md", ".csv"}
ANEXO_MAX = 25 * 1024 * 1024                      # por arquivo (um PDF de artigo cabe com folga)
ANEXOS_MAX = 12
CLAUDE_PRAZO = 40 * 60                            # uma chamada do Claude não passa disto (s)
CLAUDE_PASSOS = 100                               # passos (turnos) por chamada: a Etapa 3 do MMC (26 arquivos) estourou os 30 de antes
claude_pedido = {}                                # o pedido em andamento ou o último: proc, andamento, eventos, resposta, proposta…
uso_cache = {"t": 0.0, "v": None}
trava_uso = threading.Lock()
# os `claude` curtos (auth status, /usage) e a partida de um pedido não rodam juntos: dois processos renovando o login ao
# mesmo tempo dão "Failed to refresh OAuth token: another Claude Code process is refreshing it" (Marcelo, 21/10: o
# "gerar com a IA" logo depois do F5 caiu nisso — a página pediu o estado e o uso enquanto o pedido partia). Durante um
# pedido, o estado e o uso respondem com o que já tinham
trava_cli = threading.Lock()
estado_cache = {"v": None}
resumos_ativos = set()                               # os contextos com o resumo pela IA na fila ou rodando (contextos salvos)


def pedido_rodando():
    return bool(claude_pedido.get("andamento") or claude_pedido.get("proc") or resumos_ativos)


def limpa_trava_login(idade=5, ia=None):
    """A trava da renovação do login do CLI (CLAUDE_DIR/.oauth_refresh.lock, uma pasta) órfã: um `claude` saiu no meio da
    renovação e todo pedido seguinte dá "another Claude Code process is refreshing it" (Marcelo, 21/10: o login não renovava
    desde a noite anterior e a trava ficou sem dono). Tirada só se tem mais de `idade` s e NENHUM processo usa a pasta."""
    ia = ia or CLAUDE
    t = ia.trava_login()
    if t is None:
        return False
    try:
        if not t.exists() or time.time() - t.stat().st_mtime < idade:
            return False
    except OSError:
        return False
    alvo = f"{ia.variavel_pasta}={ia.pasta}".encode()
    for p in Path("/proc").iterdir():
        if p.name.isdigit():
            try:
                if alvo in (p / "environ").read_bytes().split(b"\0"):
                    return False
            except OSError:
                pass
    shutil.rmtree(t, ignore_errors=True)
    print(f"a trava de login órfã {t} foi tirada", flush=True)
    return True
trava_sessoes = threading.Lock()                  # sessoes.json: ler-mudar-gravar (ordem: trava_claude → trava_sessoes, nunca o contrário)
REGRAS_CLAUDE = """Você é o Claude do MaiSim, um simulador de eletrônica de potência em
que o GeckoCIRCUITS resolve o circuito. Quem monta o circuito é o usuário; você cuida só do CONTROLE dele, e ajuda a pensar
o conceito do controle (malhas, ganhos, modulação, lógica no tempo, controles combinados).

A pasta de trabalho tem:
- CONTEXTO.md: o circuito aberto (componentes, valores e nós), as medidas m["..."] que o código lê, as atuações (blocos
  CONST que o código escreve, e aonde chegam), Ts, Δt e o tempo final, os parâmetros, os acionamentos e o código atual.
  O MaiSim reescreve este arquivo a cada pedido com o estado atual: leia-o SEMPRE antes de responder.
- controle.py: o código. iniciar(p, e) roda uma vez; passo(t, m, p, e) roda a cada Ts e devolve {atuação: valor}.
  e é um dicionário de estado seu, p os parâmetros (p["Ts"] é o Ts efetivo), m as medidas no instante t.
  scope("nome", valor) manda uma variável para o scope (o mesmo conjunto de nomes em toda amostra).
  Os outros .py do controle (o CONTEXTO.md lista cada um com o papel) são MÓDULOS ou CONTROLADORES:
  * módulo (o padrão: leitura.py, escrita.py, pll.py…): quem importa (import pll) chama, no mesmo processo e na MESMA
    amostra, sem atraso. Contrato: iniciar(p) → o estado do módulo; passo(entrada, p, estado) → a saída. O controle.py é o
    orquestrador: ler (leitura.passo(m, p, …)) → calcular (os módulos de controle, na ordem das chamadas) → escrever
    (escrita.passo(u, p, …), que devolve as atuações). Para organizar o código, use módulos.
  * controlador: um processo à parte (emula outro DSP), que conversa por envia()/recebe() com ≥ 1 amostra de atraso. Só
    para controle distribuído de verdade; nunca para dividir um laço (o atraso entraria na malha).
  O tempo de cálculo é zero dentro da amostra: o atraso real (conversão, cálculo, atualização do PWM) é o do painel.
- parametros.json: os parâmetros p["..."], uma lista de {"nome", "valor", "unidade"}. Todo p["x"] do código precisa
  estar aqui (crie com valor e unidade); "Ts" não entra (vem do painel).
- acionamentos.json: mudanças no instante t, uma lista de {"t": segundos, "alvo": "p:<parâmetro>" ou
  "CONST:<atuação>", "valor"}. Servem, por exemplo, para trocar um ganho ou uma referência no meio da simulação sem
  lógica no código.
- controladores.json: quais arquivos rodam como CONTROLADOR (um DSP à parte) e a rede entre eles:
  {"controladores": [{"nome", "arquivo", "todas", "medidas", "atuacoes", "subcircuitos"}], "rede": {"latencia": s}}.
  Lista vazia = só o controle.py de sempre (lê todas as medidas, escreve as atuações marcadas). Com controladores, o
  controle.py entra também na lista. nome = o destino do envia() (sem .py; o padrão é o nome do arquivo); arquivo tem
  iniciar(p, e) e passo(t, m, p, e); "todas": true lê todas as medidas, senão só as de "medidas"; "atuacoes": as que ele
  escreve — cada atuação tem UM dono só; "subcircuitos": uma instância em cada um (nomes sem o prefixo). rede.latencia é
  o tempo de uma mensagem (fibra óptica, barramento) em s: a mensagem chega na 1ª amostra com t ≥ t_envio + latência,
  nunca na mesma amostra (latência 0 = a amostra seguinte). Quem roda à parte, o que cada um lê e escreve e a latência
  VOCÊ muda aqui, quando o pedido precisar (o usuário vê e aprova): não é "ação do painel".
- GUIA_CONTROLE.md: o guia completo (tempo e atraso, Ts × Δt, PWM no código, cuidados, exemplos). Consulte quando precisar.
- anexos/: arquivos que o usuário anexou (PDF de artigo, foto de um diagrama, texto). Leia os que o pedido citar e os
  marcados como novos.
- ULTIMA_RODADA.md e ULTIMA_RODADA/<canal>.csv: o resultado da rodada mais nova deste circuito (do usuário, ou uma
  das suas no modo autônomo: Claude_N); sem rodada deste circuito, não existem. Por canal: média, mín., máx., pico a pico, eficaz CA e o fasor de 50 Hz no regime (a última
  janela) e a evolução por janela; o estado final e a saída do controle; e as séries reduzidas (t, valor). Use para
  conferir o que o pedido e os critérios pedem, com números (diga o canal e a janela): não peça ao usuário números que
  estão aqui. Procure o canal com Grep (ex.: "| Vcc |") em vez de ler o arquivo inteiro.
- Modo autônomo (quando o usuário o liga no pedido): ao fim de cada resposta sua, o MaiSim simula a versão que está na pasta,
  sem aplicar no controle do usuário, e te chama de novo com o resumo; corrija e siga. Quando terminar — os critérios
  passaram, ou falta uma decisão do usuário —, explique e escreva [PRONTO] numa linha, no fim da resposta. Fora desse
  modo, não escreva [PRONTO].
- memoria.md: a memória do MaiSim, que vale em todas as conversas e circuitos: preferências e lições do usuário (como ele
  gosta dos controles, convenções, o que deu certo ou errado). Leia SEMPRE e siga. Quando o usuário pedir para lembrar
  algo, ou deixar clara uma preferência que valha para os próximos controles, acrescente uma linha curta e geral (sem
  os detalhes deste circuito); ele aprova junto com a proposta.
- Equação ou código (a conversa mostra LaTeX formatado pelo KaTeX: $…$ ou \\(…\\) na linha, $$…$$ ou \\[…\\] em destaque):
  · MODELAGEM e teoria — a planta, funções de transferência, leis de controle, fasores, projeto de ganhos, as contas e
    os números delas — em EQUAÇÃO (LaTeX), nunca em bloco de código nem entre crases, também numa célula de tabela;
    símbolos em LaTeX, não em Unicode: \\omega, \\int, \\sum, \\hat{I}, V^*_{dc}. Ex.: $$G(s) = k_p + \\frac{k_i}{s}$$, com
    $k_p = \\omega_c L$; numa tabela: | C2 | $V_{dc,cmd} = V^*_{dc} + \\omega_e \\int (V^*_{dc} - V_{dc})\\,dt$ |.
  · IMPLEMENTAÇÃO — o que está ou vai para os .py: nomes de variáveis e funções, linhas e trechos de código — em CÓDIGO
    (`m["Vcc"]` na linha, ou um bloco ```python); parâmetros do Gecko ($Ra, $La) também entre crases.
  · Ligando as duas: a equação primeiro e, logo abaixo, a linha do .py que a implementa, com o arquivo e a linha
    (ex.: $u = k_p e + k_i \\int e\\,dt$ → `u = kp * erro + e["integ"]`, em pi.py:12).

Escreva as atuações como chaves literais de um dicionário no passo() do controle.py — u = {"g": g} no fluxo com
escrita.py (return escrita.passo(u, …)), ou return {"g": g}: é assim que o MaiSim as reconhece e marca. Você pode editar controle.py, os outros .py da pasta (módulos e controladores), parametros.json, acionamentos.json e
memoria.md, e CRIAR módulos novos (nome.py: letras, números e _, sem nome de módulo do Python como math.py ou json.py): não
há terminal nem internet, e o circuito não muda por aqui. Um arquivo novo é sempre um módulo: um por função (pll.py,
pi_tensao.py…), no contrato iniciar(p) → estado e passo(entrada, p, estado) → saída, chamado pelo controle.py (ou por outro
módulo) na ordem do fluxo, com o estado dele guardado em e (e["pll"] = pll.iniciar(p)). Não dá para apagar arquivos: para
tirar um de uso, deixe de importá-lo e diga ao usuário. Controlador novo (outro DSP) só quando o usuário pedir controle
distribuído: crie o arquivo com iniciar(p, e) e passo(t, m, p, e), ponha-o em controladores.json (com o controle.py, o
que cada um lê e escreve, sem atuação com dois donos) e combine as mensagens: quem manda chama envia("nome", {...}), quem
recebe percorre recebe() e guarda o último valor no seu e (vale até a próxima mensagem).
A ORDEM de uma amostra é sempre a mesma, como num DSP, no passo() do controle.py: 1) x = leitura.passo(m, p, e["leitura"])
primeiro; 2) os módulos de controle, cada um recebendo o que o anterior devolveu (pll, depois o PI que usa o ângulo…);
3) return escrita.passo(u, p, e["escrita"]) por último, devolvendo as atuações. Todo módulo chamado no passo() é iniciado
no iniciar() (e["pll"] = pll.iniciar(p)). Se o código atual fugir disso — o CONTEXTO.md lista o que o MaiSim avisa —, corrija
junto com o pedido e diga o que corrigiu. Use só as medidas e as atuações do CONTEXTO.md, sem inventar outras. Se o pedido precisar de algo que o
circuito não tem (outra medida, outra chave, um bloco CONST), diga o que o usuário deve montar e faça o resto. Mantenha o
que já funciona no código, a menos que o pedido seja trocar. Se o pedido vier de um artigo, implemente o controle dele
adaptado a este circuito e diga o que foi adaptado.

O MaiSim valida e testa a sua proposta (iniciar e 3 passo, sem simular) e mostra a diferença ao usuário, que decide aplicar.
Você não roda nada. Responda em português, curto e direto: o que mudou, por quê, os valores escolhidos (e de onde vieram)
e o que conferir na simulação."""


def uso_texto(texto):
    """As linhas do /usage ("Current session: 39% used · resets Oct 18, 1:50pm (…)") em {rotulo, pct, renova}."""
    meses = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
    def renova(txt):
        m = re.match(r"(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)", (txt or "").strip(), re.I)
        if not m:
            return (txt or "").strip()
        mes, dia, h, mi, ap = m.groups()
        hora = f"{int(h) % 12 + (12 if ap.lower() == 'pm' else 0):02d}h{int(mi or 0):02d}"
        if not mes:
            return f"às {hora}"
        n_mes, hoje, amanha = meses.get(mes.lower()), time.localtime(), time.localtime(time.time() + 86400)
        if (n_mes, int(dia)) == (hoje.tm_mon, hoje.tm_mday):
            return f"hoje às {hora}"
        if (n_mes, int(dia)) == (amanha.tm_mon, amanha.tm_mday):
            return f"amanhã às {hora}"
        return f"{int(dia):02d}/{n_mes or 0:02d} às {hora}"
    def rotulo(r):
        r = r.strip()
        if re.match(r"current session", r, re.I):
            return "sessão (5 h)"
        m = re.match(r"current week\s*(?:\((.+)\))?", r, re.I)
        if m:
            return "semana" if not m.group(1) or m.group(1).lower() == "all models" else f"semana · {m.group(1)}"
        return r
    itens = []
    for m in re.finditer(r"^\s*([^:\n]+?):\s*(\d+(?:[.,]\d+)?)\s*%\s*used(?:\s*[·•|-]\s*resets\s+(.+?))?\s*$", texto or "", re.M | re.I):
        itens.append({"rotulo": rotulo(m.group(1)), "pct": float(m.group(2).replace(",", ".")), "renova": renova(m.group(3)) if m.group(3) else ""})
    return itens


def claude_uso(forca=False):
    """O uso da conta, o mesmo do /usage do Claude Code (sessão de 5 h e semana), por `claude -p "/usage"`: não chama o
    modelo (0 turnos, 0 tokens), só consulta o medidor da conta. NÃO é documentado (conferido no CLI 2.1.273): se o texto
    mudar, volta o texto como veio e a tela diz que não conseguiu ler. Guardado por 60 s."""
    with trava_uso:
        if not forca and uso_cache["v"] is not None and time.time() - uso_cache["t"] < 60:
            return uso_cache["v"]
        if pedido_rodando():                             # um pedido rodando: o guardado (sem outro `claude` renovando o login)
            return uso_cache["v"] or {"itens": [], "texto": "", "quando": time.time()}
        vazio = CLAUDE_CASA / "uso"
        vazio.mkdir(parents=True, exist_ok=True)
        try:
            with trava_cli:
                r = subprocess.run(CLAUDE.comando_uso(), env=ambiente_claude(), cwd=str(vazio), capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
            j = json.loads(r.stdout or "{}")
            texto = str(j.get("result") or "").strip()
            v = {"itens": uso_texto(texto), "texto": texto[:1000], "quando": time.time()}
            if j.get("is_error") or not texto:
                v["erro"] = (texto or r.stderr.strip() or f"saída {r.returncode}")[:300]
        except (subprocess.SubprocessError, OSError, ValueError) as e:
            v = {"itens": [], "texto": "", "quando": time.time(), "erro": f"não consegui ler o uso: {e}"}
        uso_cache.update(t=time.time(), v=v)
        return v


def le_memoria():
    try:
        return CLAUDE_MEMORIA.read_text()
    except OSError:
        return ""


def grava_memoria(texto):
    texto = str(texto or "")
    if len(texto) > 20_000:
        raise ErroMotor("memória grande demais (até 20 mil caracteres)")
    grava_atomico(CLAUDE_MEMORIA, texto)
    return {"texto": texto}


def le_sessoes():
    try:
        return json.loads(CLAUDE_SESSOES.read_text())
    except (OSError, ValueError):
        return {}


def grava_atomico(arq, texto):
    arq.parent.mkdir(parents=True, exist_ok=True)
    tmp = arq.with_name(arq.name + ".tmp")
    tmp.write_text(texto)
    os.replace(tmp, arq)


def grava_sessoes(d):
    grava_atomico(CLAUDE_SESSOES, json.dumps(d, ensure_ascii=False, indent=1))


def conversa_atual(nova=False):
    """A conversa do circuito aberto (uma por circuito): {id, iniciada, anexos_vistos} e a pasta dela."""
    chave = editor.get("aberto") or "(sem arquivo)"
    with trava_sessoes:
        d = le_sessoes()
        if nova or chave not in d or not re.fullmatch(r"[0-9a-f-]{36}", str(d[chave].get("id", ""))):
            d[chave] = {"id": str(uuid.uuid4()), "iniciada": False, "anexos_vistos": []}
            grava_sessoes(d)
        conv = dict(d[chave])
    pasta = CLAUDE_CONVERSAS / conv["id"]
    (pasta / "anexos").mkdir(parents=True, exist_ok=True)
    return chave, conv, pasta


def marca_iniciada(sid, anexos):
    """A conversa começou (o CLI gravou a sessão): os anexos já vistos não são mais novos."""
    with trava_sessoes:
        d = le_sessoes()
        for v in d.values():
            if v.get("id") == sid:
                v.update(iniciada=True, anexos_vistos=anexos)
        grava_sessoes(d)


def claude_muda_chave(antiga, nova):
    """Salvar como: a conversa (e o pedido dela) seguem o circuito com o nome novo."""
    if antiga == nova:
        return
    with trava_sessoes:
        d = le_sessoes()
        if antiga in d:
            d[nova] = d.pop(antiga)
            grava_sessoes(d)
    with trava_claude:
        if claude_pedido.get("circuito") == antiga:
            claude_pedido["circuito"] = nova


def claude_esquece(chave):
    """Circuito novo (folha em branco): a conversa de "(sem arquivo)" recomeça."""
    with trava_sessoes:
        d = le_sessoes()
        if d.pop(chave, None) is not None:
            grava_sessoes(d)


def historico(sid):
    """A conversa (o que se pediu, o que o Claude respondeu, o gasto, se foi aplicada), fora da pasta de trabalho."""
    try:
        return json.loads((CLAUDE_CASA / "historico" / f"{sid}.json").read_text())
    except (OSError, ValueError):
        return []


HISTORICO_MAX, MUDANCAS_MAX = 2000, 60     # entradas guardadas; as "mudança" (o código antes/depois, grande) só nas mais novas
# (Marcelo, 21/10: a conversa das 19 tentativas tinha passado das 60 entradas e o começo dela já tinha saído do histórico)


def grava_historico(sid, h):
    h = h[-HISTORICO_MAX:]
    for x in h[:-MUDANCAS_MAX]:
        x.pop("mudanca", None)
    grava_atomico(CLAUDE_CASA / "historico" / f"{sid}.json", json.dumps(h, ensure_ascii=False, indent=1))


def lista_anexos(pasta):
    a = pasta / "anexos"
    return [{"nome": f.name, "tamanho": f.stat().st_size} for f in sorted(a.iterdir()) if f.is_file()] if a.is_dir() else []


def claude_anexa(nome, dados_b64):
    """Guarda um anexo (PDF, imagem, texto) na pasta da conversa do circuito aberto."""
    nome = re.sub(r"[^\w.\- ]", "_", Path(str(nome)).name).strip() or "anexo"
    if Path(nome).suffix.lower() not in ANEXO_TIPOS:
        raise ErroMotor(f"anexo: PDF, imagem (png, jpg, webp, gif) ou texto (txt, md, csv); veio {Path(nome).suffix or 'sem extensão'}")
    try:
        dados = base64.b64decode(dados_b64 or "", validate=True)
    except ValueError:
        raise ErroMotor("anexo malformado")
    if not dados or len(dados) > ANEXO_MAX:
        raise ErroMotor(f"anexo vazio ou maior que {ANEXO_MAX // 2**20} MB")
    _, _, pasta = conversa_atual()
    if len(lista_anexos(pasta)) >= ANEXOS_MAX and not (pasta / "anexos" / nome).exists():
        raise ErroMotor(f"até {ANEXOS_MAX} anexos por conversa (tire algum ou comece uma conversa nova)")
    (pasta / "anexos" / nome).write_bytes(dados)
    return claude_pedido_estado()


def claude_tira_anexo(nome):
    _, _, pasta = conversa_atual()
    (pasta / "anexos" / Path(str(nome)).name).unlink(missing_ok=True)
    return claude_pedido_estado()


def claude_nova():
    claude_para()
    conversa_atual(nova=True)
    with trava_claude:
        claude_pedido.clear()
    return claude_pedido_estado()


# ---- contextos salvos (contextos.py; Marcelo, 21/10: "salvar isso na memória não volátil… usar em outras conversas")
# o resumo pela IA, opcional, DEPOIS de salvar (o salvar nunca depende dele) e invisível: um `claude` à parte, na pasta do
# contexto, só com leitura, lendo a conversa guardada pelo MaiSim (não a sessão de uma IA: qualquer IA poderá fazer igual no
# hub); não entra na conversa nem na sessão dela. Falhou: tenta de novo uma vez no erro passageiro do login; senão, fica
# "falhou" e a biblioteca oferece gerar de novo (Marcelo: "invisível… mas tem que ser SEM RISCO de falha")
RESUMO_IA_PEDIDO = ("Resuma a conversa do MaiSim guardada nesta pasta, para outra conversa (ou outra IA) continuar daqui. Leia conversa.md "
                    "(a conversa inteira) e, se ajudar, resumo.md (a nota de quem salvou), controle/ e rodada/resumo.md. Não escreva "
                    "arquivos. Responda só com o resumo, em markdown, nestas seções: ## Objetivo; ## O que foi feito; ## Resultado (com os "
                    "números: canal, janela e rodada); ## Decisões (e por quê); ## O que falta. Completo nos números e nas decisões, curto "
                    "no resto; equações em LaTeX.")
# a junção ("juntar com o contexto em uso"): um resumo só, do contexto anterior e da conversa que continuou dele
RESUMO_IA_JUNTA = ("Resuma a conversa do MaiSim guardada nesta pasta, para outra conversa (ou outra IA) continuar daqui. Ela continua "
                   "de um contexto anterior: leia anterior.md (aquele contexto: a nota e o resumo dele) e conversa.md (as conversas em "
                   "ordem: a daquele contexto e, depois, a que continuou dele) e, se ajudar, resumo.md (a nota de quem salvou), "
                   "controle/ e rodada/resumo.md (os de agora). Não escreva arquivos. Escreva UM resumo do todo, não dois: o que vale "
                   "agora — quando a conversa nova mudou um valor, uma decisão ou o controle, fica o novo, e diga o que ele "
                   "substituiu. Responda só com o resumo, em markdown, nestas seções: ## Objetivo; ## O que foi feito; ## Resultado "
                   "(com os números: canal, janela e rodada); ## Decisões (e por quê); ## O que falta. Completo nos números e nas "
                   "decisões, curto no resto; equações em LaTeX.")
trava_resumo = threading.Lock()                      # um resumo por vez


def _resumo_ia(cid, modelo, esforco, ia="claude"):
    a = IAS.get(ia) or CLAUDE
    try:
        with trava_resumo:
            for tentativa in (1, 2):
                try:
                    contextos.poe_resumo_ia(CONTEXTOS, cid, "gerando", modelo=modelo or None)
                except FileNotFoundError:
                    return                               # apagado antes de começar
                erro, texto, usado = None, None, modelo
                try:
                    pedido = RESUMO_IA_JUNTA if (CONTEXTOS / cid / "anterior.md").is_file() else RESUMO_IA_PEDIDO
                    cmd = a.comando_resumo(pedido, modelo, esforco, pasta=CONTEXTOS / cid)
                    with trava_cli:
                        limpa_trava_login(ia=a)
                        proc = subprocess.Popen(cmd, cwd=str(CONTEXTOS / cid), env=a.ambiente(), stdin=subprocess.DEVNULL,
                                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
                    try:
                        out, errs = proc.communicate(timeout=CLAUDE_PRAZO)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGTERM)
                        out, errs = proc.communicate()
                        erro = f"passou de {CLAUDE_PRAZO // 60} min"
                    if not erro:
                        j = _json_da_saida(out) or _json_da_saida(errs)
                        r = a.le_resultado_json(j) or {}
                        if r.get("texto") and not r.get("erro"):
                            texto, usado = str(r["texto"]).strip(), r.get("modelo") or modelo
                        else:
                            erro = str(r.get("texto") or "; ".join(r.get("erros") or []) or
                                       ((errs or "").strip().splitlines() or [f"saída {proc.returncode}"])[-1])[:400]
                except (OSError, ValueError) as e:
                    erro = str(e)
                try:
                    if texto:
                        contextos.poe_resumo_ia(CONTEXTOS, cid, "pronto", texto=texto, modelo=usado or None)
                        return
                    if tentativa == 1 and a.erro_passageiro(erro):
                        time.sleep(5)
                        continue
                    contextos.poe_resumo_ia(CONTEXTOS, cid, "falhou", erro=erro, modelo=modelo or None)
                    return
                except FileNotFoundError:
                    return                               # apagado no meio
    finally:
        resumos_ativos.discard(cid)


def _json_da_saida(texto):
    """O JSON de uma saída de chamada única: o texto inteiro (o Gemini escreve em várias linhas) ou a última linha (o Claude)."""
    texto = (texto or "").strip()
    for t in (texto, texto.splitlines()[-1] if texto else ""):
        try:
            j = json.loads(t)
            if isinstance(j, dict):
                return j
        except ValueError:
            pass
    return {}


def _confere_ia_resumo(ia, modelo, esforco):
    if ia not in IAS or modelo not in IAS[ia].modelos or esforco not in IAS[ia].esforcos:
        raise ErroMotor("IA, modelo ou esforço desconhecido")
    ia_logada(IAS[ia])


def claude_contexto_resumo_ia(cid, modelo="", esforco="", ia="claude"):
    """Pede (ou pede de novo) o resumo pela IA de um contexto salvo: em segundo plano, na fila, pela IA escolhida."""
    ia = str(ia or "claude")
    _confere_ia_resumo(ia, modelo, esforco)
    m = contextos.meta(CONTEXTOS, cid)
    if m is None:
        raise ErroMotor(f"não há o contexto {cid}")
    if cid in resumos_ativos:
        raise ErroMotor("o resumo deste contexto já está sendo feito")
    if not (CONTEXTOS / cid / "conversa.md").is_file():
        raise ErroMotor("este contexto não tem a conversa: não há o que resumir")
    resumos_ativos.add(cid)
    contextos.poe_resumo_ia(CONTEXTOS, cid, "gerando", modelo=modelo or None)
    threading.Thread(target=_resumo_ia, args=(cid, modelo, esforco, ia), daemon=True).start()
    return claude_contextos()
def _ctx(f):
    """Os erros do contextos.py viram a mensagem da tela."""
    try:
        return f()
    except (ValueError, FileNotFoundError) as e:
        raise ErroMotor(str(e))


def circuito_da_conversa(sid):
    return next((k for k, v in le_sessoes().items() if v.get("id") == sid), "")


def conversas_anteriores(atual):
    """As conversas que o "nova" deixou (o histórico continua em disco): para salvar como contexto."""
    out = []
    for f in (CLAUDE_CASA / "historico").glob("*.json"):
        if f.stem == atual or not re.fullmatch(r"[0-9a-f-]{36}", f.stem):
            continue
        h = historico(f.stem)
        if h:
            out.append({"id": f.stem, "pedidos": len(h), "primeiro": str(h[0].get("pedido", ""))[:140], "de": h[0].get("quando"),
                        "ate": h[-1].get("quando"), "circuito": circuito_da_conversa(f.stem)})
    return sorted(out, key=lambda x: x.get("ate") or 0, reverse=True)[:60]


def controle_aplicado(sid):
    """O controle de uma conversa antiga: o da última proposta aplicada nela (o histórico guarda a mudança)."""
    for h in reversed(historico(sid)):
        m = h.get("mudanca")
        if m and not h.get("desfeita") and isinstance(m.get("codigo"), str):
            return {k: m[k] for k in ("codigo", "parametros", "acionamentos", "arquivos", "controladores", "rede") if k in m}
    return None


def claude_contextos():
    _, conv, _ = conversa_atual()
    lst = contextos.lista(CONTEXTOS)
    for c in lst:
        r = c.get("resumo_ia") or {}
        if r.get("estado") == "gerando" and c["id"] not in resumos_ativos:
            c["resumo_ia"] = dict(r, estado="falhou", erro="interrompido (o MaiSim reiniciou no meio)")
    return {"contextos": lst, "usados": list(conv.get("contextos") or []),
            "anteriores": conversas_anteriores(conv["id"]), "conversa": conv["id"]}


def claude_contexto_salva(corpo):
    """Salva a conversa aberta (ou uma anterior: corpo["conversa"]) como contexto: o resumo, a conversa, o controle e a
    rodada daquele momento, e os anexos se pedido. corpo["juntar"]: o id de um contexto em uso nesta conversa — o contexto
    novo continua dele (as duas conversas em ordem, o anterior.md e um resumo só pela IA, sempre); ele fica como está."""
    chave, conv, _ = conversa_atual()
    sid = str(corpo.get("conversa") or conv["id"])
    if not re.fullmatch(r"[0-9a-f-]{36}", sid):
        raise ErroMotor("conversa inválida")
    atual, inc = sid == conv["id"], dict({"conversa": True, "controle": True, "rodada": True, "anexos": False}, **(corpo.get("incluir") or {}))
    hist = historico(sid)
    juntar = str(corpo.get("juntar") or "")
    if juntar:
        if not atual or juntar not in (conv.get("contextos") or []):
            raise ErroMotor("só dá para juntar com um contexto em uso nesta conversa")
        if (contextos.meta(CONTEXTOS, juntar) or {}).get("conversa") == sid:
            raise ErroMotor("esse contexto foi salvo desta mesma conversa (ela já está nele): salve sem juntar")
        if not hist:
            raise ErroMotor("esta conversa ainda não tem pedidos: não há o que juntar")
        inc["conversa"], corpo["resumo_ia"] = True, True     # a junção é o resumo único pela IA, da conversa inteira
    if not hist and not str(corpo.get("resumo") or "").strip():
        raise ErroMotor("a conversa está vazia: escreva uma nota ou converse antes")
    ia_resumo = str(corpo.get("ia") or "claude")
    if corpo.get("resumo_ia") and inc["conversa"] and hist:   # antes de salvar: sem login, nada fica salvo pela metade
        _confere_ia_resumo(ia_resumo, str(corpo.get("modelo") or ""), str(corpo.get("esforco") or ""))
    titulo = str(corpo.get("titulo") or "").strip() or f"{Path(chave).stem if atual else 'conversa'} {time.strftime('%d/%m %H:%M')}"
    c = (le_controle() if atual else controle_aplicado(sid)) if inc["controle"] else None
    rod = resumo_rodada.ultima(RODADAS, circuito_aberto()) if inc["rodada"] and atual else None
    anexos = CLAUDE_CONVERSAS / sid / "anexos" if inc["anexos"] else None
    modelo = next((h.get("modelo") for h in reversed(hist) if h.get("modelo")), "")
    ia_conv = next((h.get("ia") or "claude" for h in reversed(hist) if h.get("resposta") or h.get("fala")), "claude")   # a última que respondeu
    etiquetas = corpo.get("etiquetas") or []
    if isinstance(etiquetas, str):
        etiquetas = [e for e in re.split(r"[,;]", etiquetas)]
    conversa = None
    if inc["conversa"] and hist:
        conversa = _ctx(lambda: contextos.conversa_junta(CONTEXTOS, juntar, hist, titulo)) if juntar else contextos.conversa_md(hist, titulo)
    cid = _ctx(lambda: contextos.salva(CONTEXTOS, titulo, corpo.get("resumo", ""), etiquetas, conversa=conversa,
                                       controle=c, rodada=rod, anexos=anexos, anterior=juntar or None,
                                       extra=dict(circuito=chave if atual else circuito_da_conversa(sid), ia=ia_conv, modelo=modelo,
                                                  conversa=sid, pedidos=len(contextos.PEDIDO_MD.findall(conversa or "")) or len(hist))))
    if corpo.get("resumo_ia") and inc["conversa"] and hist:
        claude_contexto_resumo_ia(cid, str(corpo.get("modelo") or ""), str(corpo.get("esforco") or ""), ia_resumo)
    return dict(claude_contextos(), id=cid)


def claude_contexto_usa(cid, usar):
    """Usar (ou não) um contexto na conversa do circuito aberto: fica marcado nela e vai para contextos/<id>/ da pasta."""
    chave, conv, pasta = conversa_atual()
    if usar:
        _ctx(lambda: contextos.le(CONTEXTOS, cid))
    with trava_sessoes:
        d = le_sessoes()
        v = d.get(chave)
        if v and v.get("id") == conv["id"]:
            ids = [x for x in v.get("contextos") or [] if x != cid] + ([cid] if usar else [])
            v["contextos"] = ids[-8:]
            grava_sessoes(d)
            conv = dict(v)
    contextos.poe_na_conversa(CONTEXTOS, conv.get("contextos") or [], pasta)
    return dict(claude_pedido_estado(), **{"contextos_lista": claude_contextos()})


def claude_contexto_importa(dados_b64, nome):
    """Um .maisimctx de um colega na biblioteca (importa primeiro, depois a lista: a lista já o mostra)."""
    cid = _ctx(lambda: contextos.importa(CONTEXTOS, base64.b64decode(dados_b64 or "", validate=True), nome))
    return dict(claude_contextos(), id=cid)


def num_txt(x):
    return f"{x:.6g}" if isinstance(x, (int, float)) else str(x)


def claude_contexto(c, dt, tfim):
    """O CONTEXTO.md: o que o Claude precisa saber do circuito aberto e do controle, gerado do estado do MaiSim."""
    ult = editor.get("ultimo")
    L = ["# Contexto do MaiSim", "", "Gerado pelo MaiSim a cada pedido, com o estado atual. Só leitura.", ""]
    L += [f"- Circuito aberto: `{editor.get('aberto') or '(sem arquivo)'}`",
          f"- Passo do Gecko: Δt = {num_txt(dt)} s; tempo final da simulação: tfim = {num_txt(tfim)} s"]
    nTs = max(1, arred(c["Ts"] / dt)) if dt > 0 else 1
    at = c.get("atraso") or {}
    d_at = passos_de_atraso(at, nTs, dt) if dt > 0 else 1   # o atraso efetivo, em Δt (a latência fica entre Δt e Ts)
    L += [f"- Ts (período de amostragem do controle) = {num_txt(c['Ts'])} s → efetivo {num_txt(nTs * dt)} s ({nTs} × Δt); "
          f"passo() é chamado ≈ {int(tfim / (nTs * dt)) if dt > 0 and tfim > 0 else '?'} vezes",
          f"- Atraso da atuação: {at.get('modo', 'logo')} → o circuito sente a atuação calculada em t no instante t + {d_at} × Δt"
          + (f" (latência pedida τ = {num_txt(at.get('tempo'))} s, limitada a [Δt, Ts])" if at.get("modo") == "tempo" else "")
          + " (logo = t + Δt; amostra = t + Ts, como num DSP; tempo = t + τ)",
          "- Controle ligado na simulação: " + ("sim" if c["ativo"] else 'não (o MaiSim liga ao aplicar: "usar este controle ao simular")'), ""]
    if not ult:
        L += ["O circuito não está aberto na edição: as medidas e as atuações não são conhecidas agora.", ""]
    else:
        sinais = sinais_da_rodada(ult)
        atu = atuadores_disponiveis(ult)
        L += ["## Medidas (m[\"nome\"] no código)", ""]
        for el, canal in sinais:
            fid, _, nome_el = el.rpartition("#") if "#" in el else ("0", "", el)
            fl = next((f for k, f in ult["folhas"].items() if (k == "0" and fid == "0") or f.get("nome") == fid), None)
            e = next((x for x in (fl or {}).get("elementos", []) if x["nome"] == nome_el), None)
            if e and e["tipo"] == "VOLT":
                o = f"tensão entre os nós {e['mede'][0] or '?'} (+) e {e['mede'][1] or '?'} (−), em V"
            elif e and e["tipo"] == "AMP":
                o = f"corrente no componente {e['mede'][0] or '?'}, em A"
            elif e and e["tipo"] == "CONST":
                o = f"a saída do bloco {e['nome']} (o valor atual dessa atuação)"
            else:
                o = f"a saída do bloco {e['nome'] if e else el}" + (f" ({e['nome_tipo']})" if e else "")
            L.append(f"- `m[\"{canal}\"]`: {o}" + (f" — dentro de {fid}" if fid != "0" else ""))
        L += ["", "## Atuações (as chaves do dicionário que passo() devolve)", ""]
        marcadas = set(c["atuacoes"])
        for a in atu:
            principal = ult["folhas"]["0"]["nome"]
            onde = lambda q: f" em {q['folha']}" if q.get("folha") and q["folha"] != principal else ""
            dest = ", ".join((f"comanda a chave {q['nome']}{onde(q)} (pelo {q.get('gate')})" if q["tipo"] == "chave" else
                              f"é o sinal da fonte controlada {q['nome']}{onde(q)}" if q["tipo"] == "fonte" else f"sai pelo subcircuito {q['nome']}")
                             for q in a["destinos"]) or "não chega a uma chave nem a uma fonte"
            lag = a["atraso_gecko"]
            comp = (f"o Gecko leva {lag} Δt a mais até o circuito, e o MaiSim compensa" if lag <= d_at else
                    f"o Gecko leva {lag} Δt a mais e o MaiSim só compensa {d_at}: o circuito sente {lag - d_at} Δt depois do pedido")
            L.append(f"- `\"{a['nome']}\"` (bloco {a['bloco']}): {dest}; {comp}"
                     + ("" if a["nome"] in marcadas else " — AINDA NÃO MARCADA no painel: escreva-a como chave literal no dicionário de saída (u = {\"nome\": …} ou return {…}) e o MaiSim marca ao aplicar"))
        if not atu:
            L.append("- nenhuma: o circuito não tem bloco CONST (o usuário precisa pôr um, com a saída rotulada, ligado a um GATE ou a uma fonte controlada)")
        L += ["", "## Circuito (componentes de potência e os nós de cada terminal)", ""]
        for fid, fl in ult["folhas"].items():
            rede, rot, terms = redes_basicas(fl, "LK")
            nomes_rede, k = {}, 0
            for e, i, t in terms:
                rotulo = e["entradas"][0] if e["tipo"] == "TERM" and e["entradas"] else t.get("rotulo")
                if rotulo:
                    nomes_rede.setdefault(rede(e, i), rotulo)
            for w in fl.get("fios", []):
                if w.get("dom") == "LK" and w.get("rotulo"):
                    nomes_rede.setdefault(rot(w["rotulo"]), w["rotulo"])
            nos = defaultdict(list)
            for e, i, t in terms:
                r_ = rede(e, i)
                if r_ not in nomes_rede:
                    k += 1
                    nomes_rede[r_] = f"n{k}"
                nos[e["nome"]].append(nomes_rede[r_])
            if fid != "0":
                L.append(f"### dentro de {fl.get('nome')}")
            for e in fl["elementos"]:                    # os de potência e os subcircuitos (SMs), com os nós dos terminais
                if e["tipo"] != "TERM" and e["dom"] != "CONTROL" and (e["dom"] == "LK" or e["nome"] in nos):
                    par = ", ".join(f"{k_} = {num_txt(v)}" for k_, v in (e.get("par") or {}).items())
                    L.append(f"- {e['nome']} ({e.get('nome_tipo') or e['tipo']}){'' if e.get('ativo', True) else ' [desativado]'}: "
                             f"nós {', '.join(nos.get(e['nome'], [])) or '?'}" + (f"; {par}" if par else ""))
            outros = [e for e in fl["elementos"] if e["dom"] == "CONTROL" and e["tipo"] not in ("VOLT", "AMP", "CONST", "TERM", "SCOPE")]
            for e in outros:
                L.append(f"- bloco {e['nome']} ({e.get('nome_tipo') or e['tipo']})" + (f": comanda {e['mede'][0]}" if e["tipo"] == "GATE" and e["mede"] and e["mede"][0] else ""))
        L.append("")
    L += ["## Parâmetros atuais (parametros.json)", ""]
    L += [f"- `p[\"{q['nome']}\"]` = {num_txt(q['valor'])} {q.get('unidade', '')}".rstrip() for q in c["parametros"]] or ["- nenhum"]
    L += ["", "## Acionamentos atuais (acionamentos.json)", ""]
    L += [f"- t = {num_txt(q['t'])} s: {q['alvo']} = {num_txt(q['valor'])}" for q in c.get("acionamentos") or []] or ["- nenhum"]
    erros, avisos = verifica_codigo(c["codigo"])
    conf = [] if erros or not ult else confere_codigo(c["codigo"], c["parametros"], c["atuacoes"], [k for _, k in sinais_da_rodada(ult)], atuadores_disponiveis(ult))
    if erros or avisos or conf:
        L += ["", "## O que o MaiSim acusa no código atual", ""]
        L += [f"- linha {x.get('linha', '?')}: {x['msg']}" for x in list(erros) + list(conf)] + [f"- {a}" for a in avisos]
    if c.get("controladores"):                        # vários controladores: o Claude vê todos e muda pelo controladores.json
        L += ["", "## Controladores (controladores.json: cada um no seu processo, isolado; calculam juntos a cada amostra; o que cada um lê e escreve você muda lá)", ""]
        L += [f"- {q['nome']}: {q['arquivo']}; lê {', '.join(q['medidas']) or '—'}; escreve {', '.join(q['atuacoes']) or '—'}"
              + (f"; uma instância em cada subcircuito: {', '.join(q['subcircuitos'])}" if q["subcircuitos"] else "") for q in c["controladores"]]
        L += [f"- rede: latência {c.get('rede', {}).get('latencia', 0.0)} s; envia(para, dados) e recebe(); a mensagem chega na 1ª amostra "
              "depois do envio com t ≥ t_envio + latência (nunca na mesma amostra)"]
    mods = modulos_de(c)
    erros_m, avisos_m = analisa_modulos(c)
    if mods or erros_m or avisos_m:
        L += ["", "## Os arquivos do controle e o papel de cada um", "",
              "- controle.py: o controlador (o orquestrador: ler → calcular → escrever)"]
        L += [f"- {k}: {'controlador (processo à parte)' if k in arquivos_controladores(c) else 'módulo (roda no processo de quem importa, na mesma amostra)'}"
              for k in arquivos_de(c) if k != "controle.py"]
        L += [f"- o MaiSim acusa: {x['arquivo']} linha {x['linha']}: {x['msg']}" for x in erros_m] + [f"- o MaiSim avisa: {a}" for a in avisos_m]
    if c.get("arquivos"):
        L += ["", "Os arquivos estão na pasta: leia os que o pedido envolver."]
    L += ["", "## Código atual (controle.py)", "", "```python", c["codigo"].rstrip(), "```", ""]
    return "\n".join(L)


def claude_pedido_estado():
    """O que a tela vê do pedido (sem o processo), a conversa do circuito aberto e o uso guardado."""
    chave, conv, pasta = conversa_atual()
    with trava_claude:
        out = {k: v for k, v in claude_pedido.items() if k not in ("proc", "lancado")}   # lancado: os argumentos (para tentar de novo)
    hist = [dict({k: v for k, v in x.items() if k != "mudanca"}, i=i) for i, x in enumerate(historico(conv["id"]))][-30:]   # a mudança: à parte (/claude/mudanca)
    usados = []
    for cid in conv.get("contextos") or []:
        m = contextos.meta(CONTEXTOS, cid)
        if m:                                            # apagado da biblioteca: some da conversa
            usados.append({"id": cid, "titulo": m.get("titulo", cid), "desta": m.get("conversa") == conv["id"]})   # desta: salvo desta conversa (não junta)
    out["conversa"] = {"circuito": chave, "iniciada": conv["iniciada"], "anexos": lista_anexos(pasta), "historico": hist, "contextos": usados}
    out["outro_circuito"] = bool(out.get("circuito") and out["circuito"] != chave)
    if out.get("andamento") and out.get("desde"):        # o tempo do pedido medido aqui: o relógio do WSL e o do navegador (Windows)
        out["decorrido"] = round(time.time() - out["desde"], 1)   # podem diferir de minutos (o contador saía negativo: "-120 s")
    out["uso"] = uso_cache["v"]
    return out


# o modelo e o esforço escolhidos na tela (pedido de Marcelo, 19/10: "escolher o modelo antes de enviar, até para controle
# de consumo"): os apelidos do `claude --model` e os níveis de `--effort`; vazio = o padrão da conta
MODELOS_CLAUDE, ESFORCOS_CLAUDE = CLAUDE.modelos, CLAUDE.esforcos     # os de cada IA: IAS[id].modelos / .esforcos


AUTONOMO_MAX = 20                                       # voltas do modo autônomo por pedido

# o lembrete do formato, no fim de cada pedido (Marcelo, 20/10: numa conversa longa o Claude do MaiSim seguia o costume das
# respostas antigas — as leis do artigo numa tabela, em crases — mesmo com a regra no prompt de sistema)
LEMBRETE_FORMATO = ("Formato: modelagem e teoria em equação LaTeX ($…$ na linha, $$…$$ em destaque), também dentro de tabelas "
                    "— ω, ∫, Σ, θ, chapéus e índices em LaTeX (\\omega, \\int, \\sum, \\hat{I}, V_{dc}), nunca entre crases; "
                    "crases só para o que existe nos .py (nomes, linhas) e os parâmetros do Gecko.")


def claude_pede(texto, dt, tfim, modelo="", esforco="", autonomo=0, ia="claude"):
    """Começa um pedido (um por vez): reescreve a pasta da conversa com o estado atual e roda o `claude` restrito.
    autonomo = N > 0: o modo em que o MaiSim simula cada versão proposta (sem aplicar) e chama o Claude de novo com o resumo,
    até ele dizer [PRONTO] ou acabarem as N rodadas (Marcelo, 19/10: "ter os dois já pode ser vantagem")."""
    modelo, esforco = str(modelo or ""), str(esforco or "")
    try:
        autonomo = int(autonomo or 0)
    except (TypeError, ValueError):
        raise ErroMotor("modo autônomo: o número de rodadas")
    if not 0 <= autonomo <= AUTONOMO_MAX:
        raise ErroMotor(f"modo autônomo: de 0 a {AUTONOMO_MAX} rodadas")
    ia = str(ia or "claude")
    if ia not in IAS:
        raise ErroMotor(f"IA desconhecida: {ia} (há {', '.join(IAS)})")
    a = IAS[ia]
    if modelo not in a.modelos or esforco not in a.esforcos:
        raise ErroMotor(f"modelo ({', '.join(m for m in a.modelos if m)}) ou esforço ({', '.join(e for e in a.esforcos if e)}) inválido")
    texto = str(texto or "").strip()
    if not texto:
        raise ErroMotor("escreva o pedido")
    if len(texto) > 20_000:
        raise ErroMotor("pedido longo demais (até 20 mil caracteres; anexe um arquivo)")
    if not (dt > 0) or not (tfim > 0):
        raise ErroMotor("Δt e tempo final inválidos")
    if not a.instalado():
        raise ErroMotor("o Claude Code (claude) não está instalado neste computador" if ia == "claude" else f"{a.nome}: a ferramenta não está instalada")
    ia_logada(a)
    vez = uuid.uuid4().hex
    with trava_claude:                                   # reserva já: um segundo pedido junto é recusado aqui
        if claude_pedido.get("andamento"):
            raise ErroMotor(f"o {(IAS.get(claude_pedido.get('ia')) or a).nome} ainda está no pedido anterior (espere ou pare)")
        claude_pedido.clear()
        claude_pedido.update(proc=None, vez=vez, andamento=True, desde=time.time(), pedido=texto, eventos=[], fala="", resposta=None,
                             proposta=None, erro=None, gasto=None, negados=[], modelo=None, anexos=[], ia=ia,
                             auto={"max": autonomo, "feitas": 0, "dt": dt, "tfim": tfim, "modelo": modelo, "esforco": esforco, "ia": ia} if autonomo else None)
    try:
        return _claude_comeca(texto, dt, tfim, vez, modelo, esforco, ia)
    except Exception as e:
        with trava_claude:
            if claude_pedido.get("vez") == vez:
                claude_pedido.update(andamento=False, erro=f"não consegui começar: {e}")
        raise


def _claude_comeca(texto, dt, tfim, vez, modelo="", esforco="", ia="claude"):
    c = le_controle()
    chave, conv, pasta = conversa_atual()
    for f in pasta.iterdir():                            # o estado atual (os anexos ficam)
        if f.is_file():
            f.unlink()
    (pasta / "controle.py").write_text(c["codigo"])
    for arq_py, cod in (c.get("arquivos") or {}).items():   # os módulos e os outros controladores (etapa B: ele edita e cria)
        if ARQ_PY.match(arq_py):
            (pasta / arq_py).write_text(cod)
    (pasta / "parametros.json").write_text(json.dumps(c["parametros"], ensure_ascii=False, indent=1) + "\n")
    (pasta / "acionamentos.json").write_text(json.dumps(c.get("acionamentos") or [], ensure_ascii=False, indent=1) + "\n")
    (pasta / "controladores.json").write_text(json.dumps({"controladores": c.get("controladores") or [], "rede": c.get("rede") or {"latencia": 0.0}},
                                                         ensure_ascii=False, indent=1) + "\n")
    memoria = le_memoria()
    (pasta / "memoria.md").write_text(memoria)
    (pasta / "CONTEXTO.md").write_text(claude_contexto(c, dt, tfim))
    shutil.copyfile(AQUI / "GUIA_CONTROLE.md", pasta / "GUIA_CONTROLE.md")
    ult = resumo_rodada.ultima(RODADAS, circuito_aberto())   # os "olhos": o resumo da rodada mais nova deste circuito
    tem_rodada = bool(ult) and resumo_rodada.copia_para(ult, pasta)
    anexos = [a["nome"] for a in lista_anexos(pasta)]
    vistos = set(conv.get("anexos_vistos") or [])
    nota = "(MaiSim: os arquivos da pasta foram reescritos com o estado atual; leia o CONTEXTO.md antes."
    if tem_rodada:
        nota += f" ULTIMA_RODADA.md: o resumo da rodada mais nova ({ult.name}); as séries em ULTIMA_RODADA/<canal>.csv."
    else:
        resumo_rodada.copia_para(Path("/nao/existe"), pasta)   # tira o que houver de uma rodada velha
    if anexos:
        nota += " Anexos da conversa: " + ", ".join(f"anexos/{a}{' (novo)' if a not in vistos else ''}" for a in anexos) + "."
    usados = contextos.poe_na_conversa(CONTEXTOS, conv.get("contextos") or [], pasta)
    if usados:
        nota += (" Contextos salvos carregados nesta conversa (leia o contexto.md de cada um antes de responder; a conversa daquele "
                 "momento em conversa.md, o controle de então em controle/ — referência, o controle em uso é o desta pasta): "
                 + ", ".join(f"contextos/{u['id']}/contexto.md ({u['titulo']})" for u in usados) + ".")
    # a conversa até aqui no registro do MaiSim (de qualquer IA): CONVERSA.md, citado quando esta IA não a viu — trocou de IA
    # no meio da conversa, ou a sessão dela não existe (etapa 2 do hub de IA)
    hist = historico(conv["id"])
    if hist:
        (pasta / "CONVERSA.md").write_text(contextos.conversa_md(hist, "esta conversa"))
        ultima = next((h.get("ia") or "claude" for h in reversed(hist) if h.get("resposta") or h.get("fala")), ia)
        if ultima != ia or not IAS[ia].sessao_existe(sessao_da_ia(chave, conv, ia)):
            nota += (" A conversa até aqui (os pedidos e as respostas, também de outra IA) está em CONVERSA.md: leia antes de "
                     "responder, para continuar de onde ela parou.")
    prompt = f"Pedido do usuário:\n\n{texto}\n\n{nota} {LEMBRETE_FORMATO})"
    with trava_claude:
        if claude_pedido.get("auto") is not None:
            claude_pedido["auto"]["conv"] = conv["id"]
    return _claude_lanca(prompt, c, dt, vez, chave, conv, pasta, anexos, memoria, modelo, esforco, ia)


def sessao_da_ia(chave, conv, ia):
    """A sessão de cada IA na conversa: a do Claude é o próprio id da conversa (o nome da pasta, como sempre foi); a de
    outra IA fica em sessoes.json (conv["sessoes"][ia]), criada no 1º pedido dela — cada IA retoma a sua quando volta."""
    if ia == "claude":
        return conv["id"]
    with trava_sessoes:
        d = le_sessoes()
        v = d.get(chave)
        if not v or v.get("id") != conv["id"]:
            return str(uuid.uuid4())
        s = v.setdefault("sessoes", {})
        if not re.fullmatch(r"[0-9A-Za-z_-]{8,80}", str(s.get(ia, ""))):   # um uuid do MaiSim, ou o id que a IA deu (o agy)
            s[ia] = str(uuid.uuid4())
            grava_sessoes(d)
        return s[ia]


def guarda_sessao_da_ia(chave, conv_id, ia, sid):
    """A IA que dá ela mesma o id da sessão (o Antigravity: conversation_id): o MaiSim guarda o que ela devolveu, para retomar."""
    if ia == "claude" or not re.fullmatch(r"[0-9A-Za-z_-]{8,80}", str(sid or "")):
        return
    with trava_sessoes:
        d = le_sessoes()
        v = d.get(chave)
        if v and v.get("id") == conv_id and v.setdefault("sessoes", {}).get(ia) != sid:
            v["sessoes"][ia] = sid
            grava_sessoes(d)


def regras_da(a):
    """As regras do MaiSim para a IA (as mesmas para todas; só o nome dela no começo)."""
    return REGRAS_CLAUDE if a.id == "claude" else REGRAS_CLAUDE.replace("Você é o Claude do MaiSim", f"Você é a IA do MaiSim ({a.nome})", 1)


def _claude_lanca(prompt, c, dt, vez, chave, conv, pasta, anexos, memoria, modelo="", esforco="", ia="claude"):
    """Roda a IA (ia/) restrita na pasta da conversa (retomando a sessão dela se existe) e acompanha em segundo plano."""
    a = IAS[ia]
    sid = sessao_da_ia(chave, conv, ia)
    try:
        cmd = a.comando(prompt, sid, a.sessao_existe(sid), regras_da(a), modelo, esforco, CLAUDE_PASSOS, EDITAVEIS, pasta=pasta)
    except ValueError as e:                              # a IA não garante as restrições: não roda
        raise ErroMotor(str(e))
    with trava_cli:                                      # espera um `auth status` ou `/usage` que já esteja rodando
        limpa_trava_login(ia=a)
        proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                cwd=str(pasta), env=a.ambiente(), start_new_session=True)
    with trava_claude:
        nosso = claude_pedido.get("vez") == vez and claude_pedido.get("andamento")
        if nosso:
            claude_pedido.update(proc=proc, circuito=chave, pasta=pasta.name, anexos=anexos,
                                 lancado=(prompt, c, dt, vez, chave, conv, pasta, anexos, memoria, modelo, esforco, ia))
    if not nosso:                                        # parado enquanto preparava
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except OSError:
            pass
        return claude_pedido_estado()
    threading.Thread(target=_acompanha_claude, args=(proc, c, dt, chave, pasta, anexos, memoria, ia), daemon=True).start()
    return claude_pedido_estado()


def _linha_do_erro(txt):
    """A linha que diz o erro na saída de erro de uma ferramenta: não a última da pilha ("at …", Marcelo 21/10: o pedido ao
    Gemini mostrou só "at process.processTicksAndRejections…") nem as chaves de um objeto impresso."""
    linhas = [x.strip() for x in (txt or "").splitlines() if x.strip()]
    uteis = [x for x in linhas if not x.startswith("at ") and not re.fullmatch(r"[\[\]{}(),]+", x)]
    com_erro = [x for x in uteis if re.search(r"(?i)\berror\b|Error:|erro", x)]
    return ((com_erro or uteis or [""])[-1])[:400]


def _evento_ferramenta(nome, ent):
    arq = Path(str(ent.get("file_path") or ent.get("path") or ent.get("pattern") or "")).name
    return {"Read": f"lendo {arq}", "Edit": f"editando {arq}", "Write": f"escrevendo {arq}", "Glob": "procurando arquivos",
            "Grep": f"procurando “{ent.get('pattern', '')}”"}.get(nome, nome)


def _acompanha_claude(proc, antes, dt, chave, pasta, anexos, memoria="", ia="claude"):
    """Lê a saída da IA (traduzida pela peça dela em eventos comuns: o que ela está fazendo, a resposta, o gasto); no fim,
    monta a proposta."""
    a = IAS.get(ia) or CLAUDE
    prazo = threading.Timer(CLAUDE_PRAZO, lambda: (os.killpg(proc.pid, signal.SIGTERM) if proc.poll() is None else None))
    prazo.daemon = True
    prazo.start()
    resultado, erro_txt, est = None, "", {}             # est: o estado desta chamada, para a peça da IA (ia/)
    try:
        for linha in proc.stdout:
            try:
                ev = json.loads(linha)
            except ValueError:
                continue
            with trava_claude:
                if claude_pedido.get("proc") is not proc:
                    break
                for e in a.traduz(ev, est):
                    t = e["tipo"]
                    if t == "inicio":
                        claude_pedido["modelo"] = e.get("modelo")
                    elif t == "texto":
                        claude_pedido["fala"] = (claude_pedido["fala"] + "\n\n" + e["texto"]).strip()[-6000:]
                    elif t == "ferramenta":
                        claude_pedido["eventos"] = (claude_pedido["eventos"] + [_evento_ferramenta(e.get("nome"), e.get("entrada") or {})])[-40:]
                    elif t == "recusa":
                        claude_pedido["eventos"] = (claude_pedido["eventos"] + [f"recusado: {e['msg'][:160]}"])[-40:]
                    elif t == "resultado":
                        resultado = e
                        if e.get("modelo"):                  # o que respondeu de fato (o Gemini começa no "auto")
                            claude_pedido["modelo"] = e["modelo"]
        if resultado and resultado.get("sessao"):            # a sessão que a IA criou (o Antigravity): para retomar
            guarda_sessao_da_ia(chave, pasta.name, ia, resultado["sessao"])
        erro_txt = proc.stderr.read()[-2000:] if proc.stderr else ""
        proc.wait(timeout=30)
    except (OSError, subprocess.TimeoutExpired) as e:
        erro_txt = str(e)
    finally:
        prazo.cancel()
    proposta, erro = None, None
    if resultado is None:
        erro = a.erro_conhecido(erro_txt) or _linha_do_erro(erro_txt) or f"o {a.nome} parou (saída {proc.returncode})"
    elif not resultado["erro"] and not resultado.get("texto") and a.erro_conhecido(erro_txt):
        erro = a.erro_conhecido(erro_txt)               # terminou "bem" mas sem resposta: o agy parou numa permissão negada
    else:
        if resultado["erro"]:                          # erros de execução vêm em "erros" (sem texto); erro da API, no texto
            erro = str(resultado.get("texto") or "; ".join(resultado.get("erros") or []) or resultado.get("subtipo") or "erro")[:600]
            if resultado.get("limite_passos"):
                erro = f"o {a.nome} chegou ao limite de {CLAUDE_PASSOS} passos neste pedido (a proposta parcial, se houver, está abaixo)"
        try:
            proposta = claude_proposta(pasta, antes, dt, chave, memoria)
        except Exception as e:                         # a proposta é só leitura de arquivos e teste: não derruba o servidor
            proposta = {"erro": f"não consegui montar a proposta: {e}"}
        if resultado["erro"] and not proposta.get("mudou"):
            proposta = None                            # deu erro sem mexer em nada: não há proposta (com mudança parcial, há)
    if erro and a.erro_passageiro(erro):                 # passageiro: outro processo renovava o login — tenta de novo, uma vez
        with trava_claude:
            lanc = claude_pedido.get("lancado")
            if claude_pedido.get("proc") is proc and lanc and not claude_pedido.get("tentou_de_novo"):
                claude_pedido.update(proc=None, tentou_de_novo=True,
                                     eventos=(claude_pedido.get("eventos") or []) + ["o login estava sendo renovado por outro processo: tentando de novo"])
                threading.Thread(target=lambda: (time.sleep(5), _claude_lanca(*lanc)), daemon=True).start()
                return
    uso = (resultado or {}).get("uso") or {}
    gasto = None if resultado is None else {
        "turnos": resultado.get("turnos"), "segundos": round((resultado.get("ms") or 0) / 1000, 1),
        "entrada": int(uso.get("entrada") or 0), "saida": int(uso.get("saida") or 0), "custo_estimado": resultado.get("custo")}
    resposta = resultado.get("texto") if resultado and not resultado["erro"] else None
    with trava_claude:                                       # tudo gravado antes de a tela saber que terminou
        if claude_pedido.get("proc") is not proc:           # parado (ou outro pedido começou): não mexe
            return
        h = historico(pasta.name)                            # a conversa, para a tela
        h.append({"quando": time.time(), "pedido": claude_pedido.get("pedido"), "anexos": anexos, "resposta": resposta,
                  "fala": None if resposta else claude_pedido.get("fala"), "erro": erro, "gasto": gasto, "modelo": claude_pedido.get("modelo"),
                  "mudou": bool(proposta and proposta.get("mudou")), "aplicada": False, "ia": ia})
        grava_historico(pasta.name, h)
        if resultado is not None:                            # a conversa começou: os anexos de agora não são mais novos
            marca_iniciada(pasta.name, anexos)
        auto = claude_pedido.get("auto")                     # o modo autônomo: simula esta versão e chama de novo?
        motivo_fim = None
        segue = bool(auto) and bool(resultado) and bool(resultado.get("limite_passos")) and auto.get("seguidas", 0) < 3
        if auto and not segue:
            if erro or not proposta:
                motivo_fim = f"parou: o {a.nome} não deixou uma versão para simular" if not erro else None
            elif "[PRONTO]" in (resposta or ""):
                motivo_fim = f"o {a.nome} disse [PRONTO]"
            elif not proposta.get("mudou"):
                motivo_fim = f"o {a.nome} não mudou nada nesta volta"
            elif proposta.get("erro") or proposta.get("erros"):
                motivo_fim = "a versão tem erros: não dá para simular (veja a proposta)"
            elif auto["feitas"] >= auto["max"]:
                motivo_fim = f"as {auto['max']} rodadas acabaram"
            if motivo_fim:
                auto["fim"] = motivo_fim
        continua = bool(auto) and not motivo_fim and (segue or not erro)
        if continua and segue:                               # chegou ao limite de passos: continua de onde parou (sem simular)
            auto["seguidas"] = auto.get("seguidas", 0) + 1
            claude_pedido["eventos"] = (claude_pedido["eventos"] + [f"chegou ao limite de {CLAUDE_PASSOS} passos: continua de onde parou"])[-40:]
        elif continua:
            auto["feitas"] += 1
            auto["seguidas"] = 0
            claude_pedido["eventos"] = (claude_pedido["eventos"] + [f"simulando a proposta (rodada {auto['feitas']} de {auto['max']})"])[-40:]
        claude_pedido.update(proc=None, andamento=continua, resposta=resposta, proposta=proposta, erro=erro, gasto=gasto,
                             negados=[f"{d.get('nome')} {json.dumps(d.get('entrada') or {}, ensure_ascii=False)[:120]}"
                                      for d in (resultado or {}).get("negados") or []][:10])
        vez = claude_pedido.get("vez")
    if continua:
        threading.Thread(target=_claude_continua if segue else _claude_volta_autonoma, args=(antes, dt, chave, pasta, memoria, vez), daemon=True).start()
    try:
        claude_uso(forca=True)                               # o uso depois do pedido
    except Exception:
        pass


def _claude_continua(antes, dt, chave, pasta, memoria, vez):
    """Modo autônomo: a chamada chegou ao limite de passos no meio da versão — chama de novo, na mesma conversa, para
    terminar de onde parou (os arquivos da pasta estão como ele deixou); o MaiSim simula quando ele terminar."""
    with trava_claude:
        if claude_pedido.get("vez") != vez or not claude_pedido.get("andamento"):
            return
        auto = dict(claude_pedido.get("auto") or {})
        claude_pedido.update(pedido="(modo autônomo: continua depois do limite de passos)", fala="", resposta=None)
    prompt = (f"(MaiSim, modo autônomo) A chamada anterior chegou ao limite de {CLAUDE_PASSOS} passos. Os arquivos da pasta estão "
              "como você deixou. Continue de onde parou e termine a versão; quando você terminar, o MaiSim a simula e te devolve o resumo. "
              + LEMBRETE_FORMATO)
    _, conv, _ = conversa_atual()
    try:
        _claude_lanca(prompt, antes, dt, vez, chave, conv, pasta, [], memoria, auto.get("modelo", ""), auto.get("esforco", ""), auto.get("ia", "claude"))
    except Exception as e:
        with trava_claude:
            if claude_pedido.get("vez") == vez:
                claude_pedido.update(andamento=False, erro=f"modo autônomo parou: não consegui chamar a IA de novo ({e})")


def _claude_volta_autonoma(antes, dt, chave, pasta, memoria, vez):
    """Uma volta do modo autônomo: simula a versão proposta (sem aplicar: o controle do usuário não muda), põe o resumo na
    pasta do Claude e o chama de novo na mesma conversa. Quem roda o código é o MaiSim, no mesmo processo à parte do
    "testar"; o Claude continua só com Read/Edit/Write nos arquivos da pasta."""
    def vivo():
        with trava_claude:
            return claude_pedido.get("vez") == vez and claude_pedido.get("andamento")

    def fim(motivo, erro=None):
        with trava_claude:
            if claude_pedido.get("vez") != vez:
                return
            if claude_pedido.get("auto"):
                claude_pedido["auto"]["fim"] = motivo
            claude_pedido.update(andamento=False, **({"erro": erro} if erro else {}))
            claude_pedido["eventos"] = (claude_pedido["eventos"] + [motivo])[-40:]

    with trava_claude:
        auto = dict(claude_pedido.get("auto") or {})
        p = dict(claude_pedido.get("proposta") or {})
    i, nome = auto["feitas"], f"Claude_{auto['feitas']}"
    c = dict(le_controle(), ativo=True, codigo=p["codigo"], parametros=p["parametros"], acionamentos=p["acionamentos"],
             atuacoes=p.get("atuacoes") or [])
    if p.get("controladores") is not None:
        c.update(controladores=p["controladores"], rede=p.get("rede") or c.get("rede"))
    if p.get("arquivos") is not None:
        c["arquivos"] = p["arquivos"]
    try:
        rodar({"dt": auto["dt"], "tfim": auto["tfim"], "nome": nome, "amostras": 2500}, ctl_de_fora=c)
    except Exception as e:
        fim(f"modo autônomo parou: a rodada {i} não começou ({e})", erro=f"a rodada {i} não começou: {e}")
        return
    while rodada.get("estado") in ("preparando", "rodando", "pausada"):
        if not vivo() and rodada.get("nome") == nome:    # parado pelo usuário: para a rodada também
            controle_rodada["parar"].set()
        time.sleep(0.3)
    if not vivo():
        return
    est = rodada.get("estado")
    pasta_r = (RAIZ / rodada["arquivo"]).parent if rodada.get("arquivo") and rodada.get("nome") == nome else None
    tem = bool(pasta_r) and resumo_rodada.copia_para(pasta_r, pasta)
    with trava_claude:
        if claude_pedido.get("vez") != vez:
            return
        claude_pedido["eventos"] = (claude_pedido["eventos"] + [f"rodada {i}: {est}" + (f" ({rodada.get('erro')})" if rodada.get("erro") else "")])[-40:]
        claude_pedido.update(pedido=f"(modo autônomo: resultado da rodada {i} de {auto['max']})", fala="", resposta=None)
    estado_txt = est + (f" — erro: {rodada.get('erro')}" if rodada.get("erro") else "")
    prompt = (f"(MaiSim, modo autônomo) A rodada {i} de {auto['max']} da sua versão terminou: {estado_txt}. "
              + ("O resumo está em ULTIMA_RODADA.md e as séries em ULTIMA_RODADA/<canal>.csv. " if tem else "Não há resumo desta rodada. ")
              + "Os arquivos da pasta continuam com a sua versão (o controle do usuário não mudou). Confira os critérios com os "
              "números (diga de qual canal e janela), corrija e devolva a versão seguinte. Se terminou — os critérios passaram, "
              "ou falta uma decisão do usuário —, explique e escreva [PRONTO] numa linha, no fim da resposta. " + LEMBRETE_FORMATO)
    _, conv, _ = conversa_atual()
    try:
        _claude_lanca(prompt, antes, dt, vez, chave, conv, pasta, [], memoria, auto.get("modelo", ""), auto.get("esforco", ""), auto.get("ia", "claude"))
    except Exception as e:
        fim(f"modo autônomo parou: não consegui chamar a IA de novo ({e})", erro=str(e))


def chaves_devolvidas(codigo, modulos=()):
    """As chaves de texto que passo() escreve (leitura do código, sem executar): as dos dicionários literais ({"x": …}),
    de dict(x=…) e de u["x"] = …, no passo() do controle e no dos módulos. Com o fluxo leitura → controle → escrita, o
    controle monta u = {…} e devolve escrita.passo(u, …), sem dicionário literal no return — só o return {…} (como era
    até 19/10) não achava nada e as atuações ficavam sem marcar (achado de Marcelo: "não é atuação marcada" no testar).
    Quem chama cruza com os atuadores do circuito: uma chave que não é atuador não conta."""
    import ast
    out = set()
    for cod in (codigo, *modulos):
        try:
            arvore = ast.parse(cod)
        except SyntaxError:
            continue
        for fn in arvore.body:
            if not (isinstance(fn, ast.FunctionDef) and fn.name == "passo"):
                continue
            for no in ast.walk(fn):
                if isinstance(no, ast.Dict):
                    out.update(k.value for k in no.keys if isinstance(k, ast.Constant) and isinstance(k.value, str))
                elif isinstance(no, ast.Call) and isinstance(no.func, ast.Name) and no.func.id == "dict":
                    out.update(k.arg for k in no.keywords if k.arg)
                elif isinstance(no, ast.Subscript) and isinstance(no.ctx, ast.Store) and isinstance(no.slice, ast.Constant) \
                        and isinstance(no.slice.value, str):
                    out.add(no.slice.value)
    return out


def claude_proposta(pasta, antes, dt, chave=None, memoria=""):
    """Lê de volta o que o Claude deixou nos três arquivos e confere, SEM EXECUTAR o código (formato, sintaxe, medidas,
    parâmetros e atuações): o código proposto só roda quando o usuário pede o teste (claude_testa) ou aplica e simula — um
    anexo mal-intencionado poderia induzir código perigoso, e ele tem de ser visto antes. Marca as atuações que o código
    devolve e que existem no circuito, e liga o controle."""
    cod = (pasta / "controle.py").read_text(errors="replace")
    try:
        mem = (pasta / "memoria.md").read_text(errors="replace")[:20_000]
    except OSError:
        mem = memoria
    arqs_antes = dict(antes.get("arquivos") or {})
    arqs = {f.name: f.read_text(errors="replace") for f in sorted(pasta.glob("*.py")) if f.name != "controle.py"}   # os módulos (e os criados)
    out = {"codigo_antes": antes["codigo"], "codigo": cod, "parametros_antes": antes["parametros"],
           "acionamentos_antes": antes.get("acionamentos") or [], "memoria_antes": memoria, "memoria": mem,
           "arquivos_antes": arqs_antes, "arquivos": arqs}
    ctls_antes, rede_antes = antes.get("controladores") or [], antes.get("rede") or {"latencia": 0.0}
    out.update(controladores_antes=ctls_antes, rede_antes=rede_antes)
    try:
        pars = json.loads((pasta / "parametros.json").read_text())
        acs = json.loads((pasta / "acionamentos.json").read_text())
        if not isinstance(pars, list) or not isinstance(acs, list):
            raise ValueError("parametros.json e acionamentos.json são listas")
        try:                                             # os controladores (Marcelo, 19/10: "3 DSPs… uma trava no Claude")
            cj = json.loads((pasta / "controladores.json").read_text())
        except OSError:
            cj = {"controladores": ctls_antes, "rede": rede_antes}
        if not isinstance(cj, dict) or not isinstance(cj.get("controladores", []), list) or not isinstance(cj.get("rede", {}), dict):
            raise ValueError('controladores.json é {"controladores": [...], "rede": {"latencia": s}}')
    except (OSError, ValueError) as e:
        out.update(erro=f"a IA deixou um arquivo inválido: {e}", parametros=antes["parametros"], acionamentos=out["acionamentos_antes"],
                   controladores=ctls_antes, rede=rede_antes)
        return out
    ctls = cj.get("controladores", [])
    for q in ctls:                                       # o nome padrão é o do arquivo
        if isinstance(q, dict) and not q.get("nome") and isinstance(q.get("arquivo"), str):
            q["nome"] = q["arquivo"].removesuffix(".py")
    try:
        c2 = confere_controle(dict(antes, codigo=cod, parametros=pars, acionamentos=acs, arquivos=arqs, controladores=ctls,
                                   rede=cj.get("rede", rede_antes)))
    except (ErroMotor, ValueError, TypeError) as e:
        out.update(erro=f"proposta inválida: {e}", parametros=pars, acionamentos=acs, controladores=ctls_antes, rede=rede_antes)
        return out
    muda_ctl = c2.get("controladores", []) != ctls_antes or (c2.get("rede") or {}) != rede_antes
    out.update(parametros=c2["parametros"], acionamentos=c2["acionamentos"], controladores=c2.get("controladores", []), rede=c2.get("rede") or rede_antes,
               mudou=(cod != antes["codigo"] or c2["parametros"] != antes["parametros"] or c2["acionamentos"] != (antes.get("acionamentos") or [])
                      or mem.strip() != memoria.strip() or arqs != arqs_antes or muda_ctl))
    erros, avisos = verifica_codigo(cod)
    for arq_py, cod_py in arqs.items():                  # a sintaxe dos outros .py e os riscos do fluxo de módulos
        if cod_py != arqs_antes.get(arq_py):
            erros += [dict(x, arquivo=arq_py) for x in verifica_codigo(cod_py)[0]]
    erros_m, avisos_m = analisa_modulos(c2)
    erros += erros_m
    avisos += avisos_m
    ult = editor.get("ultimo")
    if chave is not None and (editor.get("aberto") or "(sem arquivo)") != chave:
        ult = None                                       # outro circuito aberto no meio: medidas e atuações não são as do pedido
    atu = atuadores_disponiveis(ult) if ult else []
    if not erros and ult:                                # marca o que o código (módulos e controladores) e os controladores escrevem
        escritas = chaves_devolvidas(cod, list(arqs.values())) | {k for q in c2.get("controladores", []) for k in q["atuacoes"]}
        novas = sorted((escritas & {a["nome"] for a in atu}) - set(c2["atuacoes"]))
        if novas:
            c2["atuacoes"] = sorted(set(c2["atuacoes"]) | set(novas))
        out["marcar"] = novas
    if c2.get("controladores"):                          # os controladores propostos: dono único de cada atuação, arquivos, medidas
        _, erros_ctl, avisos_ctl = instancias_controle(c2, ult)
        erros += [{"arquivo": "controladores.json", "linha": 1, "coluna": 1, "msg": x} for x in erros_ctl]
        avisos += [x for x in avisos_ctl if x not in avisos]
    out.update(erros=erros, avisos=avisos)
    out["conferencia"] = [] if erros or not ult else confere_codigo(cod, c2["parametros"], c2["atuacoes"], [k for _, k in sinais_da_rodada(ult)], atu)
    out["atuacoes"] = c2["atuacoes"]
    so_memoria = cod == antes["codigo"] and c2["parametros"] == antes["parametros"] and c2["acionamentos"] == (antes.get("acionamentos") or []) and arqs == arqs_antes and not muda_ctl
    out["ligar"] = bool(out.get("mudou")) and not so_memoria and not antes["ativo"] and not erros and bool(ult)
    return out


def claude_testa(dt):
    """O teste da proposta, a pedido do usuário (depois de ver a diferença): iniciar e 3 passo do código proposto, sem
    simular, com os parâmetros propostos (testa_controle, no processo à parte de sempre)."""
    with trava_claude:
        p = dict(claude_pedido.get("proposta") or {})
        if claude_pedido.get("andamento") or not p.get("mudou"):
            raise ErroMotor("não há proposta para testar")
    c = dict(le_controle(), codigo=p["codigo"], parametros=p["parametros"], acionamentos=p["acionamentos"], atuacoes=p.get("atuacoes") or [])
    if p.get("controladores") is not None:
        c.update(controladores=p["controladores"], rede=p.get("rede") or c.get("rede"))
    if p.get("arquivos") is not None:
        c["arquivos"] = p["arquivos"]
    try:
        t = testa_controle(dt, c=c, pasta_nome="teste_claude")
        teste = {"ok": True, "passos": t["passos"], "saida": t["saida"]}
    except ErroControle as e:
        teste = {"ok": False, "erro": str(e), "linha": e.linha, "arquivo": e.arquivo}
    with trava_claude:
        if claude_pedido.get("proposta") and claude_pedido["proposta"].get("codigo") == p["codigo"]:
            claude_pedido["proposta"]["teste"] = teste
    return claude_pedido_estado()


def claude_para():
    with trava_claude:
        if not claude_pedido.get("andamento"):
            return None
        p = claude_pedido.get("proc")
        claude_pedido.update(proc=None, andamento=False, erro="parado")
        pasta, pedido = claude_pedido.get("pasta"), claude_pedido.get("pedido")
    if pasta:
        h = historico(pasta)
        h.append({"quando": time.time(), "pedido": pedido, "anexos": [], "resposta": None, "fala": None, "erro": "parado", "gasto": None, "mudou": False, "aplicada": False})
        grava_historico(pasta, h)
    if p is not None and p.poll() is None:
        try:
            os.killpg(p.pid, signal.SIGTERM)
        except OSError:
            pass
    return None


def claude_descarta():
    with trava_claude:
        if not claude_pedido.get("andamento"):
            claude_pedido["proposta"] = None
            claude_pedido["aplicada"] = False
    return claude_pedido_estado()


def _resumo_mudanca(m):
    """Linhas que entram e saem do controle.py (como no git diff) e quantas outras coisas mudaram (parâmetros, acionamentos)."""
    import difflib
    mais = menos = 0
    antes = {"controle.py": m["codigo_antes"], **(m.get("arquivos_antes") or {})}
    depois = {"controle.py": m["codigo"], **(m.get("arquivos") or {})}
    arquivos = []
    for arq in sorted(set(antes) | set(depois), key=lambda a: (a != "controle.py", a)):
        if antes.get(arq) == depois.get(arq):
            continue
        n_mais = n_menos = 0
        for linha in difflib.unified_diff((antes.get(arq) or "").splitlines(), (depois.get(arq) or "").splitlines(), lineterm="", n=0):
            if linha.startswith("+") and not linha.startswith("+++"):
                n_mais += 1
            elif linha.startswith("-") and not linha.startswith("---"):
                n_menos += 1
        arquivos.append({"arquivo": arq, "mais": n_mais, "menos": n_menos, "novo": arq not in antes})
        mais, menos = mais + n_mais, menos + n_menos
    return {"mais": mais, "menos": menos, "arquivos": arquivos,
            "outros": int(m["parametros_antes"] != m["parametros"]) + int(m["acionamentos_antes"] != m["acionamentos"])
                      + int((m.get("controladores_antes") or []) != (m.get("controladores") or []) or (m.get("rede_antes") or {}) != (m.get("rede") or {}))}


def claude_aplicada(antes=None, aplicado=None, recusados=None):
    """A proposta aplicada (pela tela). O histórico da conversa guarda o que mudou — o código, os parâmetros e os acionamentos
    de antes (o que estava na tela ao aplicar, se a tela mandar; senão, o do pedido) e os da proposta —, para ver depois
    ("ver a mudança", pedido de Marcelo em 19/10: saber o que mudou depois de aprovar). Aplicada em parte (arquivos recusados,
    os parâmetros de fora), a tela manda o que foi de fato aplicado: é isso que fica (e o que controle_aplicado devolve)."""
    with trava_claude:
        p = claude_pedido.get("proposta")
        if p:
            claude_pedido["aplicada"] = True
    _, conv, _ = conversa_atual()
    h = historico(conv["id"])
    if h:
        h[-1]["aplicada"] = True
        if p and p.get("mudou"):
            a = antes if isinstance(antes, dict) else {}
            d = aplicado if isinstance(aplicado, dict) else {}
            m = {"codigo_antes": str(a.get("codigo", p.get("codigo_antes") or "")), "codigo": str(d.get("codigo", p.get("codigo") or "")),
                 "parametros_antes": a.get("parametros", p.get("parametros_antes") or []), "parametros": d.get("parametros", p.get("parametros") or []),
                 "acionamentos_antes": a.get("acionamentos", p.get("acionamentos_antes") or []), "acionamentos": d.get("acionamentos", p.get("acionamentos") or []),
                 "arquivos_antes": a.get("arquivos", p.get("arquivos_antes") or {}), "arquivos": d.get("arquivos", p.get("arquivos") or {}),
                 "controladores_antes": a.get("controladores", p.get("controladores_antes") or []), "controladores": d.get("controladores", p.get("controladores") or []),
                 "rede_antes": a.get("rede", p.get("rede_antes")), "rede": d.get("rede", p.get("rede")),
                 "quando": time.time()}
            if recusados:
                m["recusados"] = [str(x) for x in recusados][:50]
            if len(json.dumps(m, ensure_ascii=False)) < 400_000:
                h[-1]["mudanca"], h[-1]["mudanca_resumo"] = m, _resumo_mudanca(m)
        grava_historico(conv["id"], h)
    return claude_pedido_estado()


def claude_desfeita():
    """A proposta aplicada e desfeita ("voltar ao de antes"): fica marcado no histórico."""
    _, conv, _ = conversa_atual()
    h = historico(conv["id"])
    if h and h[-1].get("aplicada"):
        h[-1]["desfeita"] = True
        grava_historico(conv["id"], h)
    return claude_pedido_estado()


def claude_mudanca(i):
    """O que mudou numa proposta aplicada (o i-ésimo pedido da conversa do circuito aberto)."""
    _, conv, _ = conversa_atual()
    h = historico(conv["id"])
    if not (0 <= i < len(h)) or not h[i].get("mudanca"):
        raise ErroMotor("não há mudança guardada para esse pedido")
    return dict(h[i]["mudanca"], pedido=h[i].get("pedido") or "", desfeita=bool(h[i].get("desfeita")))


PORTAS_PAGINA = {int(os.environ["MAISIM_PORTA_PAGINA"])}  # a página do MaiSim (Vite) e, no main(), a porta deste servidor


def origens_maisim():
    return {f"http://{h}:{p}" for h in ("localhost", "127.0.0.1", "[::1]") for p in PORTAS_PAGINA}


def pedido_local(h, post):
    """Rotas do Claude: só a página do MaiSim, na própria máquina. Host local (barra DNS rebinding); Origin, se veio, igual a
    uma das origens do MaiSim, com a porta (outra página em localhost:N não serve: pelo Vite, o CORS dele deixaria passar);
    Sec-Fetch-Site, se veio, same-origin; e, nos POST, o cabeçalho X-MaiSim (sem CORS, um site não consegue mandá-lo)."""
    host = (h.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
    origem = h.headers.get("Origin")
    sitio = h.headers.get("Sec-Fetch-Site")
    if host not in ("localhost", "127.0.0.1", "::1") or (origem is not None and origem.lower() not in origens_maisim()) \
            or (sitio is not None and sitio not in ("same-origin", "none")):
        return False
    return not post or h.headers.get("X-MaiSim") == "1"


# os pedidos de mudança já atendidos (a etiqueta X-MaiSim-Pedido → a resposta), para a página repetir sem fazer duas vezes
pedidos_feitos = OrderedDict()
trava_pedidos = threading.Lock()


class Manipulador(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _resposta(self, codigo, corpo, tipo="application/json"):
        corpo = corpo if isinstance(corpo, bytes) else json.dumps(corpo, separators=(",", ":")).encode()
        pid = getattr(self, "_pedido_id", None)
        if pid:                                          # a resposta deste pedido fica guardada (a página pode repetir o pedido)
            with trava_pedidos:
                pedidos_feitos[pid] = (codigo, corpo, tipo)
                while len(pedidos_feitos) > 300:
                    pedidos_feitos.popitem(last=False)
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        u = urlparse(self.path)
        rota = u.path[len(PREFIXO):] if u.path.startswith(PREFIXO + "/") else u.path
        self._rota = None
        if u.path in ("/", PREFIXO):
            self.send_response(302)
            self.send_header("Location", PREFIXO + "/" + (("?" + u.query) if u.query else ""))
            self.end_headers()
            return
        if u.path == PREFIXO + "/":
            return self._resposta(200, (AQUI / "static" / "index.html").read_bytes(), TIPOS[".html"])
        if rota.startswith("/static/"):                # arquivos soltos; e os do KaTeX (as equações do chat), na pasta deles
            arq = AQUI / "static" / ("katex" if rota.startswith("/static/katex/") else "") / Path(rota).name
            if arq.is_file():
                return self._resposta(200, arq.read_bytes(), TIPOS.get(arq.suffix, "application/octet-stream"))
            return self._resposta(404, {"erro": "não achei"})
        if rota in ("/claude/estado", "/claude/uso", "/claude/pedido", "/claude/memoria", "/claude/mudanca", "/claude/contextos",
                    "/claude/contexto", "/claude/contexto/exportar", "/claude/ias", "/claude/ia/uso"):
            if not pedido_local(self, False):
                return self._resposta(403, {"erro": "só da própria máquina"})
            if rota == "/claude/ias":                  # as IAs do MaiSim (ia/): o seletor da conversa e as contas (o estado do
                return self._resposta(200, [{"id": a.id, "nome": a.nome, "instalado": a.instalado(), "modelos": list(a.modelos),   # login
                                             "esforcos": list(a.esforcos), "tem_login": a.tem_login, "rotulos": a.rotulos(),   # das outras IAs:
                                             **({"estado": a.estado()} if a.tem_login else {})} for a in IAS.values()])  # arquivos, rápido
            q = {k: v[0] for k, v in parse_qs(u.query).items()}
            if rota == "/claude/ia/uso":               # os limites da conta de uma outra IA (o Antigravity: o /usage dele)
                return self._editor(lambda: ia_com_login(q.get("ia")).uso("forca" in q) or {"itens": [], "erro": "esta IA não informa os limites"})
            if rota == "/claude/contextos":            # os contextos salvos, os usados nesta conversa e as conversas anteriores
                return self._editor(claude_contextos)
            if rota == "/claude/contexto":             # um contexto: meta, contexto.md, conversa.md e os arquivos
                return self._editor(lambda: _ctx(lambda: contextos.le(CONTEXTOS, q.get("id", ""))))
            if rota == "/claude/contexto/exportar":    # o .maisimctx (zip); anexos=0 deixa os anexos de fora
                try:
                    return self._resposta(200, contextos.exporta(CONTEXTOS, q.get("id", ""), q.get("anexos", "1") != "0"), "application/zip")
                except (ValueError, FileNotFoundError) as e:
                    return self._resposta(409, {"erro": str(e)})
            if rota == "/claude/uso":                  # o uso da conta (sessão de 5 h e semana): `claude -p "/usage"`, 0 tokens
                return self._resposta(200, claude_uso(forca="forca" in parse_qs(u.query)))
            if rota == "/claude/pedido":               # o pedido ao Claude em andamento (ou o último) e a conversa do circuito
                return self._editor(claude_pedido_estado)
            if rota == "/claude/memoria":              # a memória do MaiSim (todas as conversas)
                return self._resposta(200, {"texto": le_memoria()})
            if rota == "/claude/mudanca":              # o que mudou numa proposta aplicada (?i= o pedido na conversa)
                q = parse_qs(u.query).get("i", [""])[0]
                return self._editor(lambda: claude_mudanca(int(q)))
            return self._resposta(200, claude_estado())
        if rota == "/guia":                            # o guia do controle (o "?" do painel o mostra em static/guia.html)
            return self._resposta(200, (AQUI / "GUIA_CONTROLE.md").read_bytes(), "text/markdown; charset=utf-8")
        if rota == "/modelos":
            return self._resposta(200, lista_modelos())
        if rota == "/circuito":
            rel = parse_qs(u.query).get("arq", [""])[0]
            arq = (RAIZ / rel).resolve()
            if not modelo_ok(arq) or arq.suffix != ".ipes" or not arq.is_file():
                return self._resposta(400, {"erro": "modelo inválido"})
            try:
                r = monta(arq)
            except Exception as e:                   # arquivo que o leitor não entende: dizer, não derrubar
                return self._resposta(500, {"erro": f"não consegui ler {rel}: {e}"})
            r["arq"] = rel
            return self._resposta(200, r)
        if rota == "/editor/controle":
            return self._resposta(200, painel_controle())
        if rota == "/editor/pendente":               # o Gecko do MaiSim tem algo não salvo? (para quem vai derrubá-lo: npm run maisim)
            try:                                     # o circuito, o controle e as cores, contra o arquivo aberto (situacao_gecko)
                sit = situacao_gecko()
                return self._resposta(200, {"pendente": sit["pendente"], "arquivo": editor["aberto"], "itens": sit["itens"],
                                            "motivo": f"{lista_itens(sit['itens'])} sem salvar" if sit["itens"] else ""})
            except Exception as e:                   # sem motor (Gecko fora do ar) ou arquivo ilegível: não dá para saber
                return self._resposta(200, {"pendente": None, "motivo": str(e)})
        if rota == "/biblioteca":
            return self._resposta(200, lista_biblioteca())
        if rota == "/editor/rodada":
            r = dict(rodada)
            if not r.get("arquivo"):              # servidor recém-aberto: a última rodada gravada (o scope abre nela)
                ult = max(RODADAS.glob("*/scope_*.npz"), key=lambda f: f.stat().st_mtime, default=None)
                if ult is not None:
                    r["ultimo"] = relativo(ult)
            return self._resposta(200, r)
        if rota == "/editor/estado":
            if rodada.get("estado") in RODANDO and editor.get("ultimo"):
                return self._resposta(200, editor["ultimo"])
            return self._editor(estado)
        if rota == "/editor/params":
            q = parse_qs(u.query)
            nome, dom, typ = q.get("nome", [""])[0], q.get("dom", [""])[0], q.get("typ", [""])[0]
            def params():
                if not NOME.match(nome):
                    raise ErroMotor(f"nome inválido: {nome!r}")
                lst = []
                for ent in MOTOR.cmd(f"PARAMS {nome}").split("||"):
                    campos = ent.split("\t")
                    if not campos[0]:
                        continue
                    item = dict(nome=campos[0], unidade=campos[2] if len(campos) > 2 else "", descricao=campos[3] if len(campos) > 3 else "")
                    try:
                        item["valor"] = float(MOTOR.cmd(f"GETP {nome} {campos[0]}"))
                    except (ErroMotor, ValueError) as e:
                        item["erro"] = str(e)
                    p = parametro_gecko(dom, typ, campos[0]) if dom and typ.lstrip("-").isdigit() else None
                    if p:                                # o identificador no arquivo (o $ligado vem em par[id + "_var"])
                        item["id"], item["pode_var"] = p["id"], p["valor"] in ("Double", "Integer")
                    lst.append(item)
                return lst
            return self._editor(params)
        return self._resposta(404, {"erro": "rota desconhecida"})

    def _editor(self, f):
        try:
            antes = editor.get("ultimo") if getattr(self, "_rota", None) in ROTAS_EDICAO else None
            r = f()
            aviso = aviso_janelas()
            if aviso and isinstance(r, dict):
                r["aviso_gecko"] = aviso
            if antes is not None and isinstance(r, dict):
                try:                                     # um sinal que o controle usa mudou de nome: a página pergunta
                    ren = renomes_com_uso(antes, editor.get("ultimo"))
                    if ren:
                        r["renomeados"] = ren
                except Exception as e:                   # a conferência não pode estragar a edição que já foi feita
                    print(f"renomeados: {e}", flush=True)
            return self._resposta(200, r)
        except ErroMotor as e:
            aviso = aviso_janelas()
            return self._resposta(409, {"erro": str(e) + (f" ({aviso})" if aviso else ""), **getattr(e, "extra", {})})
        except (ValueError, TypeError, IndexError, AttributeError, KeyError) as e:
            return self._resposta(400, {"erro": f"pedido inválido: {e}"})

    def do_POST(self):
        """Um pedido de mudança pode chegar duas vezes: quando a conexão cai no caminho (a ponte Windows ↔ WSL), a página repete
        com a mesma etiqueta (X-MaiSim-Pedido). Se o primeiro chegou, volta a resposta dele — a mudança não é feita de novo; se
        ele ainda está em andamento, espera por ele."""
        self._pedido_id = None
        pid = str(self.headers.get("X-MaiSim-Pedido", ""))
        if not re.match(r"^[A-Za-z0-9-]{8,64}$", pid):
            return self._do_post()
        with trava_pedidos:
            feito = pedidos_feitos.get(pid)
            if feito is None:
                pedidos_feitos[pid] = ev = threading.Event()   # em andamento
        if feito is not None:
            if isinstance(feito, threading.Event):
                feito.wait(900)
                feito = pedidos_feitos.get(pid)
            if isinstance(feito, tuple):
                return self._resposta(*feito)
            return self._resposta(409, {"erro": "o pedido repetido não terminou: confira o desenho"})
        self._pedido_id = pid
        try:
            self._do_post()
        finally:
            self._pedido_id = None
            with trava_pedidos:
                if pedidos_feitos.get(pid) is ev:            # terminou sem resposta guardada
                    pedidos_feitos.pop(pid, None)
            ev.set()

    def _do_post(self):
        u = urlparse(self.path)
        rota = u.path[len(PREFIXO):] if u.path.startswith(PREFIXO + "/") else u.path
        self._rota = rota
        # todo POST (guardar e testar o controle, rodar, editar…): só a página do MaiSim, na própria máquina — sem isso, uma
        # página de fora mandaria um controle.py e o testaria (código rodando aqui); o X-MaiSim, só nas rotas do Claude
        if not pedido_local(self, rota.startswith("/claude/")):
            return self._resposta(403, {"erro": "só pela página do MaiSim, na própria máquina"})
        try:
            corpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except ValueError:
            return self._resposta(400, {"erro": "JSON inválido"})
        if rota.startswith("/claude/"):                # o login do Claude do MaiSim
            if not pedido_local(self, True):
                return self._resposta(403, {"erro": "só pela página do MaiSim, na própria máquina"})
            acoes = {"/claude/login": claude_login_inicia, "/claude/codigo": lambda: claude_login_codigo(corpo.get("codigo", "")),
                     "/claude/cancelar": lambda: (claude_login_cancela(), claude_estado())[1], "/claude/sair": claude_sai,
                     # as contas das outras IAs (o Gemini): {"ia": id}
                     "/claude/ia/entrar": lambda: ia_conta(corpo.get("ia"), "entra"),
                     "/claude/ia/codigo": lambda: ia_conta(corpo.get("ia"), "codigo", corpo.get("codigo", "")),
                     "/claude/ia/cancelar": lambda: ia_conta(corpo.get("ia"), "cancela"),
                     "/claude/ia/sair": lambda: ia_conta(corpo.get("ia"), "sai"),
                     # o "pedir ao Claude" (passo 3b): pedido, parar, conversa nova, anexos, proposta descartada ou aplicada
                     "/claude/pedir": lambda: claude_pede(corpo.get("texto", ""), float(corpo.get("dt", 0)), float(corpo.get("tfim", 0)),
                                                          corpo.get("modelo", ""), corpo.get("esforco", ""), corpo.get("autonomo", 0),
                                                          corpo.get("ia", "claude")),
                     "/claude/parar": lambda: (claude_para(), claude_pedido_estado())[1], "/claude/nova": claude_nova,
                     "/claude/anexo": lambda: claude_anexa(corpo.get("nome", ""), corpo.get("dados", "")),
                     "/claude/tira_anexo": lambda: claude_tira_anexo(corpo.get("nome", "")),
                     "/claude/descartar": claude_descarta, "/claude/aplicada": lambda: claude_aplicada(corpo.get("antes"), corpo.get("aplicado"),
                                                                                  corpo.get("recusados")),
                     "/claude/desfeita": claude_desfeita,
                     "/claude/testar": lambda: claude_testa(float(corpo.get("dt", 1e-6))),
                     "/claude/memoria": lambda: grava_memoria(corpo.get("texto", "")),
                     # os contextos salvos (contextos.py)
                     "/claude/contexto/salvar": lambda: claude_contexto_salva(corpo),
                     "/claude/contexto/mudar": lambda: dict(_ctx(lambda: contextos.muda(CONTEXTOS, corpo.get("id", ""), corpo.get("titulo"),
                                                                                    corpo.get("etiquetas"), corpo.get("resumo"))), lista=claude_contextos()),
                     "/claude/contexto/apagar": lambda: (_ctx(lambda: contextos.apaga(CONTEXTOS, corpo.get("id", ""))), claude_contextos())[1],
                     "/claude/contexto/usar": lambda: claude_contexto_usa(corpo.get("id", ""), bool(corpo.get("usar", True))),
                     "/claude/contexto/importar": lambda: claude_contexto_importa(corpo.get("dados"), corpo.get("nome", "")),
                     "/claude/contexto/resumo_ia": lambda: claude_contexto_resumo_ia(corpo.get("id", ""), corpo.get("modelo", ""), corpo.get("esforco", ""),
                                                                                     corpo.get("ia", "claude"))}
            if rota not in acoes:
                return self._resposta(404, {"erro": "não achei"})
            return self._editor(acoes[rota])
        # simulando, nada muda o circuito nem o que vai para o scope (22/10: a ponta, o "fora", a cor e apagar arquivo escapavam)
        if rota in ("/editor/abrir", "/editor/cmd", "/editor/cmds", "/editor/novo", "/editor/mede", "/editor/salvar", "/editor/fio", "/editor/desfazer",
                    "/editor/biblioteca", "/editor/fonte_sinal", "/editor/copiar", "/editor/colar", "/editor/grupo", "/editor/variavel",
                    "/editor/ponta", "/editor/fora", "/editor/cor", "/editor/apagar_arquivo"):
            try:
                ocupado()
            except ErroMotor as e:
                return self._resposta(409, {"erro": str(e)})
        if rota == "/editor/abrir":                    # modo: (nada) | descartar | manter (o mesmo modelo, com as mudanças do Gecko) | salvar
            def abrir():
                arq = (RAIZ / str(corpo.get("arq", ""))).resolve()
                if not modelo_ok(arq) or arq.suffix != ".ipes" or not arq.is_file():
                    raise ErroMotor("modelo inválido")
                modo = str(corpo.get("modo") or ("descartar" if corpo.get("descartar") else ""))
                if modo not in ("", "descartar", "manter", "salvar"):
                    raise ErroMotor("modo: descartar, manter ou salvar")
                mesmo = bool(editor.get("aberto")) and (RAIZ / editor["aberto"]).resolve() == arq
                if mesmo and modo in ("", "manter"):     # o mesmo arquivo: nunca reabre (só no descartar) — entrar de novo na edição
                    sit = situacao_gecko()              # não pode jogar fora nada; o controle e as cores de trabalho ficam
                    if modo == "" and sit["circuito"] and not sit["visto"]:
                        raise ErroConflito(f"{nome_aberto()} tem, no Gecko do MaiSim, mudanças que este editor não viu (pela janela do Gecko, "
                                           "ou de antes de o servidor reiniciar)", conflito=True, mesmo=True, aberto=editor.get("aberto"),
                                           salvavel=aberto_salvavel(), itens=sit["itens"])
                    r = estado()
                    r["mantido"] = sit["pendente"]
                    return r
                if modo == "manter":
                    raise ErroMotor("manter as mudanças só vale para o modelo que já está aberto no Gecko")
                if modo == "salvar":                    # grava o modelo do Gecko no arquivo dele e então abre o pedido
                    salva_aberto()
                elif modo == "":
                    sit = situacao_gecko()
                    if sit["pendente"]:
                        raise ErroConflito(f"{nome_aberto()} tem {lista_itens(sit['itens'])} sem salvar; abrir outro modelo descarta",
                                           conflito=True, mesmo=False, aberto=editor.get("aberto"), salvavel=aberto_salvavel(), itens=sit["itens"])
                abre(arq)
                marca_aberto(relativo(arq))
                carrega_controle_de(arq)                # o controle salvo junto (<nome>.controle.json), ou o padrão
                carrega_aparencia_de(arq)               # e a aparência (<nome>.aparencia.json)
                esquece(tudo=True)                      # outro modelo: o desfazer recomeça
                r = estado()
                marca_base()
                return r
            return self._editor(abrir)
        if rota == "/editor/cmd":
            def cmd():
                antes = editor.get("ultimo")
                op = str(corpo.get("op", ""))
                a = normaliza(op, list(corpo.get("args", [])))
                if op == "MOVE" and len(a) == 3 and "#" not in str(a[0]) and NOME.match(str(a[0])) and \
                        min(int(float(a[1])), int(float(a[2]))) < 1:      # além da beira da folha principal: abre espaço
                    return move_grupo([str(a[0])], [], None, None, "0", para=(int(float(a[1])), int(float(a[2]))))
                plano = executa(op, a)
                r = estado()
                if migra_aparencia(antes, r):             # a ponta, a garra e a cor seguem o medidor renomeado
                    r = estado()
                if plano:
                    r["terminal"] = confere_terminal(r, plano)
                return r
            return self._editor(com_desfazer(cmd, corpo.get("descr") or corpo.get("op")))
        if rota in ("/editor/copiar", "/editor/grupo"):  # a seleção: {nomes (ou nome), fios: [[[x, y], …], …], folha} (+ acao, dx, dy)
            nomes = [str(n) for n in (corpo.get("nomes") or ([corpo["nome"]] if corpo.get("nome") else []))]
            fios = corpo.get("fios") or []
            if not all(NOME.match(n) for n in nomes) or not isinstance(fios, list) or len(nomes) + len(fios) > 2000 or \
                    not all(isinstance(w, list) and all(isinstance(p, list) and len(p) == 2 for p in w) for w in fios):
                return self._resposta(400, {"erro": "seleção inválida"})
            folha, acao = str(corpo.get("folha", "0")), ("copiar" if rota == "/editor/copiar" else str(corpo.get("acao", "")))
            if acao == "copiar":
                return self._editor(lambda: copia_grupo(nomes, fios, folha))
            if acao == "mover":
                return self._editor(com_desfazer(lambda: move_grupo(nomes, fios, int(corpo.get("dx", 0)), int(corpo.get("dy", 0)), folha),
                                                 corpo.get("descr") or "grupo movido", manter_se_falhar=True))
            if acao == "apagar":
                return self._editor(com_desfazer(lambda: apaga_grupo(nomes, fios, folha), corpo.get("descr") or "grupo apagado", manter_se_falhar=True))
            return self._resposta(400, {"erro": "ação do grupo: copiar, mover ou apagar"})
        if rota == "/editor/colar":                     # {x, y, folha}: insere a cópia guardada (o canto de cima à esquerda em x, y)
            alvos_c = corpo.get("folhas") if isinstance(corpo.get("folhas"), list) else None     # vários SMs iguais de uma vez
            return self._editor(com_desfazer(lambda: cola_grupo(int(corpo.get("x", 0)), int(corpo.get("y", 0)), str(corpo.get("folha", "0")), alvos_c),
                                             corpo.get("descr") or "colado", manter_se_falhar=True))
        if rota == "/editor/biblioteca":                # acao: salvar (nome, folha, nome_lib, sobrescrever) | inserir (nome_lib, x, y, folha)
            acao = str(corpo.get("acao", ""))
            if acao == "salvar":
                return self._editor(lambda: salva_sub(str(corpo.get("nome", "")), str(corpo.get("folha", "0")), str(corpo.get("nome_lib", "")).strip(),
                                                      bool(corpo.get("sobrescrever"))))
            if acao == "inserir":
                return self._editor(com_desfazer(lambda: insere_sub(str(corpo.get("nome_lib", "")), int(corpo.get("x", 0)), int(corpo.get("y", 0)),
                                                                    str(corpo.get("folha", "0"))), corpo.get("descr") or "subcircuito da biblioteca",
                                                 manter_se_falhar=True))
            return self._resposta(400, {"erro": "ação: salvar ou inserir"})
        if rota == "/editor/ponta":                   # {canal, sinal "+"|"-", componente}: em que componente fica a ponta (vazio: automático)
            def ponta():
                canal, sinal, comp = str(corpo.get("canal", "")), str(corpo.get("sinal", "")), str(corpo.get("componente", ""))
                if not re.match(r"^[A-Za-z0-9_]{1,80}$", canal) or sinal not in ("+", "-") or (comp and not NOME.match(comp)):
                    raise ErroMotor("ponta: canal, sinal (+ ou -) e o componente")
                with trava_aparencia:
                    a = le_aparencia()
                    p = a["pontas"].setdefault(canal, {})
                    if comp:
                        p[sinal] = comp
                    else:
                        p.pop(sinal, None)
                    grava_aparencia(a)
                return estado()
            return self._editor(ponta)
        if rota == "/editor/fora":                    # {uid, fora}: o sinal deste componente fica fora do scope e do controle (ou volta)
            def fora():
                uid = str(corpo.get("uid", ""))
                if not re.match(r"^-?\d+$", uid):
                    raise ErroMotor("fora: o identificador do componente")
                with trava_aparencia:
                    a = le_aparencia()
                    a["fora"] = sorted(set(a["fora"]) - {uid} | ({uid} if corpo.get("fora") else set()))
                    grava_aparencia(a)
                return estado()
            return self._editor(fora)
        if rota == "/editor/cor":                     # {canal, cor}: a cor do canal (cor vazia volta ao padrão)
            def cor():
                canal, c = str(corpo.get("canal", "")), str(corpo.get("cor", ""))
                if not re.match(r"^[A-Za-z0-9_]{1,80}$", canal) or (c and not COR.match(c)):
                    raise ErroMotor("cor: canal (letras, números e _) e #rrggbb")
                with trava_aparencia:
                    cs = le_cores()
                    if c:
                        cs[canal] = c.lower()
                    else:
                        cs.pop(canal, None)
                    grava_cores(cs)
                return estado()
            return self._editor(cor)
        if rota == "/editor/controle/testar":          # roda iniciar() e alguns passo() sem simular (o validador do painel)
            try:
                return self._resposta(200, testa_controle(float(corpo.get("dt", 1e-6))))
            except ErroControle as e:
                saida = ESTADO.with_name("teste_controle") / "controle.log"
                return self._resposta(200, {"ok": False, "erro": str(e), "linha": e.linha, "rastro": e.rastro, "arquivo": e.arquivo,
                                            "saida": saida.read_text()[-3000:] if saida.exists() else ""})
            except ErroMotor as e:
                return self._resposta(409, {"erro": str(e)})
            except (ValueError, TypeError) as e:
                return self._resposta(400, {"erro": f"pedido inválido: {e}"})
        if rota == "/editor/controle/renomeia":        # pares [[de, para], …]: o código (entre aspas), os cartões, as atuações e os acionamentos
            if rodada.get("estado") in RODANDO:
                return self._resposta(409, {"erro": "a simulação está rodando: o controle fica travado até ela parar"})
            def renomeia():
                pares = corpo.get("pares")
                if not isinstance(pares, list) or not all(isinstance(q, list) and len(q) == 2 and all(isinstance(x, str) and NOME_TROCA.match(x) for x in q) for q in pares):
                    raise ErroMotor("pares inválidos: [[nome de antes, nome novo], …]")
                c, n = renomeia_no_controle(le_controle(), pares)
                c = confere_controle(c)
                grava_controle(c)
                r = painel_controle(c)
                r["trocas"] = n
                return r
            return self._editor(renomeia)
        if rota == "/editor/controle":                 # guarda a configuração do controle (sempre; erros de sintaxe voltam)
            if rodada.get("estado") in RODANDO:
                return self._resposta(409, {"erro": "a simulação está rodando: o controle fica travado até ela parar"})
            def guarda():
                c = segue_codigo(confere_controle(corpo.get("controle") or {}), editor.get("ultimo"))
                grava_controle(c)
                return painel_controle(c)
            return self._editor(guarda)
        if rota == "/editor/fonte_sinal":
            def fonte():
                nome = str(corpo.get("nome", ""))
                if not NOME.match(nome):
                    raise ErroMotor(f"nome inválido: {nome!r}")
                return fonte_sinal(nome, str(corpo.get("sinal", "")).strip(), corpo.get("folhas"))
            return self._editor(com_desfazer(fonte, corpo.get("descr") or "fonte controlada por sinal", manter_se_falhar=True))
        if rota == "/editor/apagar_arquivo":
            return self._editor(lambda: apaga_arquivo(corpo.get("arq", "")))
        if rota == "/editor/desfazer":
            def desfazer():
                if not pilha:
                    raise ErroMotor("nada para desfazer")
                arq, descr = pilha.pop()
                abre(arq)
                r = estado()
                r["desfeito"] = descr
                arq.unlink(missing_ok=True)
                return r
            return self._editor(desfazer)
        if rota == "/editor/cmds":                     # a mesma mudança em vários subcircuitos iguais (SUBCIRCUIT.k#nome)
            def cmds():
                lst = corpo.get("cmds")
                if not isinstance(lst, list) or not 1 <= len(lst) <= 400:
                    raise ErroMotor("lote: de 1 a 400 pedidos")
                ultimo0 = editor.get("ultimo")              # o estado de antes (a ponta e a cor seguem o medidor renomeado)
                pedidos = [(str(c.get("op", "")), normaliza(str(c.get("op", "")), list(c.get("args", [])))) for c in lst]
                for op, a in pedidos:                     # confere todos antes
                    comando(op, a)
                antes = estado() if any((op in ("CREATE", "MOVE") and "#" in str(a[0]) and talvez_terminal(op, a))
                                        or (op == "SETP" and str(a[1]) in ("blockSizeX", "blockSizeY")) for op, a in pedidos) else None
                if antes:                                 # terminal sem borne livre, bloco pequeno demais: antes de mexer
                    tams = {}                             # largura e altura do mesmo bloco no lote: confere com as duas
                    for op, a in pedidos:
                        if op in ("CREATE", "MOVE"):
                            plano_terminal(op, a, antes)
                        elif op == "SETP" and str(a[1]) in ("blockSizeX", "blockSizeY"):
                            tams[str(a[0])] = confere_tamanho(antes, str(a[0]), str(a[1]), int(float(a[2])), tams.get(str(a[0])))
                planos = []
                for k, (op, a) in enumerate(pedidos):     # cada pedido num subcircuito diferente: o estado de antes serve
                    try:
                        planos.append(executa(op, a, antes))
                    except ErroMotor as e:
                        raise ErroMotor(f"aplicado em {k} de {len(pedidos)}; falhou em {str(a[0]) if a else op}: {e}")
                    if op == "SETP" and str(a[1]) in ("blockSizeX", "blockSizeY") and k + 1 < len(pedidos):
                        antes = estado()                  # o bloco mudou (e o arquivo foi reaberto): o próximo confere com o novo
                r = estado()
                if migra_aparencia(ultimo0, r):
                    r = estado()
                if planos and planos[0]:
                    r["terminal"] = confere_terminal(r, planos[0])
                return r
            return self._editor(com_desfazer(cmds, corpo.get("descr") or "lote", manter_se_falhar=True))   # parte pode ter sido aplicada
        if rota == "/editor/novo":
            def novo():                                # modo: (nada) | descartar | salvar — como no abrir
                modo = str(corpo.get("modo") or ("descartar" if corpo.get("descartar") else ""))
                if modo == "salvar":
                    salva_aberto()
                elif modo != "descartar":
                    sit = situacao_gecko()
                    if sit["pendente"]:
                        raise ErroConflito(f"{nome_aberto()} tem {lista_itens(sit['itens'])} sem salvar; começar um circuito novo descarta",
                                           conflito=True, mesmo=False, novo=True, aberto=editor.get("aberto"), salvavel=aberto_salvavel(),
                                           itens=sit["itens"])
                MOTOR.cmd("CLEAR")
                marca_aberto(None)
                editor["novo_desde"] = time.time()   # as rodadas deste circuito novo (vão junto quando ele ganhar nome)
                claude_esquece("(sem arquivo)")      # folha nova: conversa nova com o Claude
                esquece_vistas("")                   # e sem o que foi nas mensagens da folha sem arquivo de antes
                grava_controle(controle_padrao())
                grava_aparencia({})
                r = estado()
                marca_base()
                return r
            return self._editor(com_desfazer(novo, "folha em branco"))
        if rota == "/editor/mede":
            def mede():
                nome, tipo = str(corpo.get("nome", "")), str(corpo.get("tipo", ""))
                if not NOME.match(nome):
                    raise ErroMotor(f"nome inválido: {nome!r}")
                if tipo == "V":
                    n1, n2 = str(corpo.get("no1", "")).strip(), str(corpo.get("no2", "")).strip()
                    if not (n1 and ROTULO.match(n1) and ROTULO.match(n2)):
                        raise ErroMotor("diga os nós: rótulos sem espaço")
                    return acopla(nome, [n1, n2 or "NIX_NIX_NIX", "0"], folhas=corpo.get("folhas"))
                if tipo == "I":
                    comp = str(corpo.get("componente", ""))
                    if not NOME.match(comp):
                        raise ErroMotor(f"componente inválido: {comp!r}")
                    return acopla(nome, [comp, "NIX_NIX_NIX", "0"], ref=comp, folhas=corpo.get("folhas"))
                if tipo == "G":                          # GATE: a chave que ele comanda (o mesmo acoplamento do amperímetro)
                    comp = str(corpo.get("componente", ""))
                    ult = editor.get("ultimo") or {"folhas": {}}
                    tipos = {e["tipo"] for f in (corpo.get("folhas") or ["0"]) for e in ult["folhas"].get(str(f), {"elementos": []})["elementos"]
                             if e["nome"] == comp}
                    if not NOME.match(comp) or (tipos and not tipos & CHAVES):
                        raise ErroMotor(f"{comp!r} não é uma chave (ideal, IGBT, MOSFET ou tiristor)")
                    return acopla(nome, [comp, "NIX_NIX_NIX", "0"], ref=comp, folhas=corpo.get("folhas"))
                raise ErroMotor("tipo: V, I ou G")
            return self._editor(com_desfazer(mede, corpo.get("descr") or "medidor", manter_se_falhar=True))
        if rota == "/editor/variavel":                 # acao: nova | apaga | liga | desliga (ver variavel())
            return self._editor(com_desfazer(lambda: variavel(corpo), corpo.get("descr") or "variável global", manter_se_falhar=True))
        if rota == "/editor/fio":                      # acao: novo (cantos, dom, rotulo) | apagar (cantos) | rotulo (cantos, rotulo)
            def fio():
                cantos, acao = corpo.get("cantos") or [], str(corpo.get("acao", "novo"))
                if not isinstance(cantos, list) or not all(isinstance(c, list) and len(c) == 2 for c in cantos) or len(cantos) < 2:
                    raise ErroMotor("cantos da conexão: [[x, y], …] com dois ou mais")
                folhas = corpo.get("folhas")
                if folhas is not None and not isinstance(folhas, list):
                    raise ErroMotor("folhas: lista")
                if acao == "novo":
                    return fio_novo(cantos, str(corpo.get("dom", "LK")), str(corpo.get("rotulo", "")).strip(), folhas)
                if acao in ("apagar", "rotulo"):
                    return fio_muda(cantos, apagar=acao == "apagar", rotulo=str(corpo.get("rotulo", "")).strip(), folhas=folhas)
                raise ErroMotor("ação da conexão: novo, apagar ou rotulo")
            return self._editor(com_desfazer(fio, corpo.get("descr") or "conexão", manter_se_falhar=True))
        if rota == "/editor/rodar":
            return self._editor(lambda: rodar(corpo))
        if rota == "/editor/rodada/guardar":          # {arq: o scope_*.npz, guardar: true|false}: "por cima" não a substitui
            return self._editor(lambda: guarda_rodada(str(corpo.get("arq", "")), corpo.get("guardar", True) is not False))
        if rota in ("/editor/pausar", "/editor/continuar", "/editor/parar"):
            def muda():
                if rodada.get("estado") not in ("rodando", "pausada"):
                    raise ErroMotor("não há simulação rodando")
                {"/editor/pausar": controle_rodada["pausa"].set, "/editor/continuar": controle_rodada["pausa"].clear,
                 "/editor/parar": controle_rodada["parar"].set}[rota]()
                return dict(rodada)
            return self._editor(muda)
        if rota == "/editor/salvar":
            def salvar():
                nome = str(corpo.get("nome", "")).strip()
                if not re.match(r"^[A-Za-z0-9_\-]{1,60}$", nome):
                    raise ErroMotor("nome do arquivo: letras, números, _ e -, até 60")
                pasta = {"circuitos": SALVOS, "subcircuitos": LIB}.get(str(corpo.get("pasta", "circuitos")))   # o MaiSim só grava nessas duas
                if pasta is None:
                    raise ErroMotor("pasta: circuitos ou subcircuitos")
                pasta.mkdir(parents=True, exist_ok=True)
                dest = pasta / f"{nome}.ipes"
                if dest.exists() and not corpo.get("sobrescrever"):
                    raise ErroMotor(f"já existe {relativo(dest)}; confirme para sobrescrever")
                MOTOR.cmd(f"SAVEAS {dest}")
                antiga = editor.get("aberto") or "(sem arquivo)"
                chave_vistas = str(editor.get("aberto") or "")
                marca_aberto(str(relativo(dest)))
                if not chave_vistas:                      # um circuito novo ganhou nome: as rodadas dele vão junto (a IA as acha)
                    resumo_rodada.muda_modelo(RODADAS, "novo (sem arquivo)", str(relativo(dest)), editor.get("novo_desde"))
                muda_chave_vistas(chave_vistas, str(relativo(dest)))   # o que foi nas mensagens também segue
                claude_muda_chave(antiga, str(relativo(dest)))   # a conversa com o Claude segue o circuito
                salva_controle_junto(dest)                # o controle e as cores dos canais vão junto, ao lado do .ipes
                salva_aparencia_junto(dest)
                r = estado()
                marca_base()
                r["salvo"] = editor["aberto"]
                return r
            return self._editor(salvar)
        return self._resposta(404, {"erro": "rota desconhecida"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=int(os.environ["MAISIM_PORTA_SIMU"]))
    a = ap.parse_args()
    PORTAS_PAGINA.add(a.porta)                       # a página aberta direto neste servidor também é do MaiSim
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))   # kill: sai pelo atexit (o login em andamento não fica órfão)
    atexit.register(claude_login_cancela)
    atexit.register(claude_para)
    srv = ThreadingHTTPServer(("127.0.0.1", a.porta), Manipulador)
    srv.daemon_threads = True
    print(f"maisim-simu em http://localhost:{a.porta}{PREFIXO}/", flush=True)
    threading.Thread(target=recupera_rodada_interrompida, daemon=True).start()
    srv.serve_forever()


if __name__ == "__main__":
    main()
