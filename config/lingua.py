"""O idioma de cada pedido (Marcelo, 24/10/2026: o MaiSim em português e inglês). A página manda o cookie maisim-lingua
("pt" ou "en", gravado pelo maisim-i18n.js: o idioma escolhido no botão PT/EN ou, antes de escolher, o do navegador — o
maisim-lingua-auto que vai junto é só da página); sem cookie, português (os testes de API em Python ficam como sempre). Os textos ficam nos catálogos de cada módulo (simu/textos.py, scope/textos_scope.py), os dois idiomas lado a lado:

    T = {"motor.nao_achei": {"pt": "não achei {ref}", "en": "could not find {ref}"},
         "rodadas.n": {"pt": {"one": "{n} rodada", "other": "{n} rodadas"}, "en": {"one": "{n} run", "other": "{n} runs"}}}

tr(chave, **params) escolhe pelo idioma do pedido. As threads de fundo (a rodada, o pedido da IA) levam o idioma de quem as
começou: thread(alvo, ...) no lugar de threading.Thread(target=alvo, ...)."""
import ast
import contextvars
import re
import threading
from pathlib import Path

LINGUAS = ("pt", "en")
PADRAO = "pt"
_atual = contextvars.ContextVar("maisim_lingua", default=None)
_catalogo = {}
_ultima = {"l": None, "arq": None}                      # a última vista num pedido (as threads do boot usam esta)
_COOKIE = re.compile(r"(?:^|;\s*)maisim-lingua=(pt|en)\b")
_PARAM = re.compile(r"\{(\w+)\}")


def valida(l):
    l = str(l or "").strip().lower()[:2]
    return l if l in LINGUAS else None


def registra(T):
    """Junta um catálogo ({chave: {"pt": …, "en": …}}) aos de antes (cada módulo registra o seu)."""
    _catalogo.update(T)


def guarda_ultima_em(arq):
    """Onde guardar a última língua vista (para as threads que sobem com o servidor, sem pedido)."""
    _ultima["arq"] = Path(arq)
    try:
        _ultima["l"] = valida(_ultima["arq"].read_text())
    except OSError:
        pass


def do_pedido(headers):
    """Lê o cookie do pedido e vale para o resto dele (cada pedido tem a sua thread: ThreadingHTTPServer)."""
    # só o nosso cookie (o SimpleCookie desiste do cabeçalho inteiro num cookie malformado de outro programa do localhost)
    m = _COOKIE.search(headers.get("Cookie") or "")
    l = m.group(1) if m else None
    _atual.set(l or PADRAO)
    if l and l != _ultima["l"]:
        _ultima["l"] = l
        if _ultima["arq"]:
            try:
                _ultima["arq"].write_text(l)
            except OSError:
                pass
    return l or PADRAO


def atual():
    """O idioma deste pedido (ou da thread que ele começou); fora de pedido, português."""
    return _atual.get() or PADRAO


def ultima():
    """A última língua vista num pedido da página (para o que sobe com o servidor, sem pedido: with com(ultima()): …)."""
    return _ultima["l"] or PADRAO


def com(l):
    """with lingua.com("en"): … — um trecho num idioma dado."""
    class _Com:
        def __enter__(self):
            self.tok = _atual.set(valida(l) or PADRAO)

        def __exit__(self, *a):
            _atual.reset(self.tok)
    return _Com()


def tr(chave, **p):
    """O texto da chave no idioma do pedido; {x} trocados por p; plural por p["n"] ({"one", "other"}: n == 1 é one)."""
    e = _catalogo.get(chave)
    if e is None:
        return chave
    v = e.get(atual()) or e.get(PADRAO) or chave
    if isinstance(v, dict):
        v = v.get("one" if p.get("n") == 1 else "other") or v.get("other") or chave
    # como no JS: só {nome} conhecido troca (chaves soltas no texto — JSON, código — ficam)
    return _PARAM.sub(lambda m: str(p[m.group(1)]) if m.group(1) in p else m.group(0), v) if p else v


def thread(alvo, *args, daemon=True, nome=None, **kw):
    """threading.Thread que leva o idioma de agora (o Python 3.10 não copia os contextvars para a thread nova)."""
    ctx = contextvars.copy_context()
    return threading.Thread(target=lambda: ctx.run(alvo, *args, **kw), daemon=daemon, name=nome)


t = tr                                                    # o mesmo, com o nome curto


def codigo_sem_comentarios(src):
    """O código Python sem os comentários (o ast não os guarda) e sem as docstrings: o que tem de ser igual nas duas versões
    de um código traduzido (os modelos *_modelo.py / *_modelo.en.py, o código dos exemplos). None se não compila."""
    try:
        arv = ast.parse(src)
    except (SyntaxError, ValueError, TypeError):
        return None
    for n in ast.walk(arv):
        if isinstance(n, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.body and \
                isinstance(n.body[0], ast.Expr) and isinstance(n.body[0].value, ast.Constant) and isinstance(n.body[0].value.value, str):
            n.body = n.body[1:] or [ast.Pass()]
    return ast.dump(arv)


def mesmo_codigo(a, b):
    """As duas versões são o mesmo código (só os comentários e as docstrings mudam)."""
    x = codigo_sem_comentarios(a)
    return x is not None and x == codigo_sem_comentarios(b)
