"""Processo de UM controlador do /maisim/simu (painel "Controle"): o servidor manda pedidos em JSON, um por linha, e lê uma
resposta por linha. Cada controlador (cada instância) roda no seu processo: isolado (sem memória comum com os outros) e em
paralelo com eles (o servidor manda a amostra a todos e depois recolhe). Um erro ou um laço infinito no código do usuário
não derruba o servidor (que mata o processo se ele não responder no prazo). O print() do usuário vai para a saída de erro
(o log da rodada, com o nome da instância na frente quando há mais de uma), não para o protocolo.

Pedidos: {"op": "carrega", "codigo", "arquivo", "nome", "p": {parâmetros}, "atuacoes": {local: do circuito} | null (todas),
"nomes": [os controladores da rodada], "prefixar": bool, "modulos": {"x.py": código}, "outros": [arquivos de outros
controladores]} → executa o código, confere passo() e chama iniciar(p, e). Os módulos (os .py que não são controladores)
são importados da memória (import x), neste processo: rodam na mesma amostra de quem os chama, sem atraso;
{"op": "passo", "t": t, "m": {medidas DESTE controlador}, "msgs": [mensagens que chegaram]} → chama passo(t, m, p, e) e
devolve as atuações {"a": {nome no circuito: valor}}, o que foi para o scope {"s": {nome: valor}} e as mensagens enviadas
{"env": [{"para", "dados"}]}; {"op": "parametros", "p": {…}} → acionamento de p[...].
Erro: {"ok": false, "erro": "...", "arquivo": "x.py", "linha": n, "instancia": nome, "traceback": "..."}.
"""
import importlib.abc
import importlib.util
import json
import math
import sys
import traceback
import os


def Path_ok(d):
    return os.path.abspath(d) == os.path.dirname(os.path.abspath(__file__))

saida = sys.stdout


class Saida:
    """print() do usuário: para o log, com o nome da instância na frente de cada linha (quando há mais de uma)."""
    def __init__(self):
        self.quem, self.inicio = "", True

    def write(self, s):
        for parte in s.splitlines(keepends=True):
            sys.stderr.write((f"[{self.quem}] " if self.inicio and self.quem else "") + parte)
            self.inicio = parte.endswith("\n")
        return len(s)

    def flush(self):
        sys.stderr.flush()


log = sys.stdout = Saida()
cfg = {"nome": "controle", "arquivo": "controle.py", "atuacoes": None, "nomes": [], "prefixar": False, "varios": False}
ns, p, e, reg, linhas, caixa, enviadas = {}, {}, {}, {}, {}, [], []    # linhas: {arquivo: [linhas]} (o controlador e os módulos)


def scope(nome, valor):
    """Manda uma variável do controle para o scope (vale para esta amostra)."""
    reg[(f"{cfg['nome']}_{nome}" if cfg["prefixar"] else str(nome))] = float(valor)


def _valor_msg(k, v):
    """Um valor de mensagem: número, None ("sem valor ainda") ou uma lista curta de números — um fasor (re, im), um vetor
    (Marcelo, 19/10: a estratégia de controle manda fasores do central às células, e o envia só aceitava número)."""
    if v is None:
        return None
    if isinstance(v, (list, tuple)):
        if len(v) > 64:
            raise ValueError(f"envia(): {k!r} tem {len(v)} números (até 64 numa lista)")
        try:
            return [float(x) for x in v]
        except (TypeError, ValueError):
            raise TypeError(f"envia(): {k!r} = {v!r}: numa lista, só números") from None
    try:
        return float(v)
    except (TypeError, ValueError):
        raise TypeError(f"envia(): {k!r} = {v!r}: cada valor é um número, None ou uma lista de números (ex.: um fasor (re, im))") from None


def envia(para, dados):
    """Manda uma mensagem a outro controlador (ou a uma lista deles): dados = {nome: valor}, com valor um número, None ou
    uma lista de números (um fasor (re, im) chega como [re, im]). Os controladores calculam
    juntos; a mensagem chega na 1ª amostra depois desta com t ≥ agora + a latência da rede (nunca na mesma amostra)."""
    destinos = [para] if isinstance(para, str) else list(para)
    for d in destinos:
        if d not in cfg["nomes"] or d == cfg["nome"]:
            raise NameError(f"envia(): não há o controlador {d!r} (os outros: {', '.join(x for x in cfg['nomes'] if x != cfg['nome']) or 'nenhum'})")
    if not isinstance(dados, dict):
        raise TypeError("envia(para, dados): dados é um dicionário {nome: valor}")
    msg = {str(k): _valor_msg(k, v) for k, v in dados.items()}
    enviadas.extend({"para": d, "dados": dict(msg)} for d in destinos)


def recebe():
    """As mensagens que chegaram desde a última chamada, na ordem: [{"de", "t" (instante do envio), "dados"}]."""
    out = list(caixa)
    caixa.clear()
    return out


class Modulos(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    """Os módulos do controle: `import aquisicao` acha o aquisicao.py que veio no carrega (da memória, sem disco). Rodam
    neste processo, quando o controlador chama: na mesma amostra, sem atraso. Um .py que é de outro controlador (processo
    à parte) não se importa: o erro diz isso."""
    def __init__(self):
        self.fontes, self.outros = {}, set()

    def find_spec(self, nome, caminho=None, alvo=None):
        if nome in self.fontes:
            return importlib.util.spec_from_loader(nome, self, origin=f"{nome}.py")
        if nome in self.outros:
            raise ImportError(f"{nome}.py é de outro controlador (roda à parte, com atraso): não dá para importar. "
                              "Para chamar na mesma amostra, faça dele um módulo (na árvore de arquivos)")
        return None

    def create_module(self, spec):
        return None

    def exec_module(self, mod):
        mod.__dict__.update(scope=scope, envia=envia, recebe=recebe, math=math, __file__=f"{mod.__name__}.py")
        exec(compile(self.fontes[mod.__name__], f"{mod.__name__}.py", "exec"), mod.__dict__)


modulos = Modulos()
sys.meta_path.insert(0, modulos)
if sys.path and sys.path[0] and Path_ok(sys.path[0]):           # a pasta do MaiSim (a deste arquivo) não é importável pelo usuário
    sys.path.pop(0)


def responde(obj):
    saida.write(json.dumps(obj) + "\n")
    saida.flush()


def erro(exc):
    quadros = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename in linhas]   # só o código do usuário (e os módulos)
    if isinstance(exc, SyntaxError) and exc.filename in linhas:     # sintaxe de um módulo (ao importar): o arquivo e a linha dele
        arq, linha = exc.filename, exc.lineno
    else:
        arq = quadros[-1].filename if quadros else cfg["arquivo"]
        linha = quadros[-1].lineno if quadros else getattr(exc, "lineno", None)
    texto = "".join(f"  {f.filename} linha {f.lineno}, em {f.name}(): {linhas[f.filename][f.lineno - 1].strip() if 0 < f.lineno <= len(linhas[f.filename]) else ''}\n"
                    for f in quadros)
    responde({"ok": False, "erro": f"{type(exc).__name__}: {exc}", "arquivo": arq, "linha": linha,
              "instancia": cfg["nome"] if cfg["varios"] else None,
              "traceback": (f"onde (do mais externo ao mais interno):\n{texto}" if texto else "")[-3000:]})


class Medidas(dict):
    """O m deste controlador: só as medidas dele; pedir outra diz quais existem (em vez de um KeyError seco)."""
    def __missing__(self, k):
        raise KeyError(f"{k!r} não é medida deste controlador (medidas dele: {', '.join(sorted(self)) or 'nenhuma'})")


for pedido_txt in sys.stdin:
    try:
        pedido = json.loads(pedido_txt)
        if pedido["op"] == "carrega":
            cfg.update({k: pedido[k] for k in ("nome", "arquivo", "atuacoes", "nomes", "prefixar", "varios") if k in pedido})
            log.quem = cfg["nome"] if cfg["varios"] else ""
            ns = {"__name__": cfg["nome"], "scope": scope, "envia": envia, "recebe": recebe, "math": math}
            for nome in list(modulos.fontes):            # os módulos de antes saem (cada carrega importa de novo)
                sys.modules.pop(nome, None)
            modulos.fontes = {k[:-3]: v for k, v in (pedido.get("modulos") or {}).items()}
            modulos.outros = {k[:-3] for k in (pedido.get("outros") or [])}
            linhas = {cfg["arquivo"]: pedido["codigo"].split("\n"), **{k: v.split("\n") for k, v in (pedido.get("modulos") or {}).items()}}
            exec(compile(pedido["codigo"], cfg["arquivo"], "exec"), ns)
            if not callable(ns.get("passo")):
                raise NameError(f"{cfg['arquivo']} precisa definir passo(t, m, p, e)")
            p, e = dict(pedido["p"]), {}
            if callable(ns.get("iniciar")):
                ns["iniciar"](p, e)
            responde({"ok": True})
        elif pedido["op"] == "passo":
            reg.clear(); enviadas.clear()
            caixa.extend(pedido.get("msgs") or [])
            a = ns["passo"](pedido["t"], Medidas(pedido["m"]), p, e)
            if a is None:
                a = {}
            if not isinstance(a, dict):
                raise TypeError(f"passo() deve devolver um dicionário {{atuação: valor}}, devolveu {type(a).__name__}")
            out, mapa = {}, cfg["atuacoes"]
            for k, v in a.items():
                k = str(k)
                if mapa is not None and k not in mapa:
                    raise KeyError(f"passo() devolveu {k!r}, que não é atuação deste controlador (atuações dele: "
                                   f"{', '.join(sorted(mapa)) or 'nenhuma'})")
                if isinstance(v, (list, tuple)) or getattr(v, "ndim", 0) == 1:
                    # o padrão dentro da amostra: um valor por Δt do Gecko (o timer de PWM do SM, que compara a portadora
                    # a cada Δt com m fixo na amostra — Marcelo, 20/10: rodar no MaiSim o controle do artigo)
                    v = [float(x) for x in v]
                    if not v or not all(math.isfinite(x) for x in v):
                        raise ValueError(f"a atuação {k} (padrão dentro da amostra) veio vazia ou com valor não finito")
                else:
                    v = float(v)
                    if not math.isfinite(v):
                        raise ValueError(f"a atuação {k} ficou {v}")
                out[mapa[k] if mapa is not None else k] = v
            responde({"ok": True, "a": out, "s": dict(reg), "env": list(enviadas)})
        elif pedido["op"] == "parametros":           # acionamento de p[...] durante a rodada
            p.update(pedido["p"])
            responde({"ok": True})
        else:
            responde({"ok": False, "erro": f"pedido desconhecido: {pedido.get('op')}"})
    except Exception as exc:                      # erro no código do usuário: arquivo, linha e traceback para a tela
        erro(exc)
