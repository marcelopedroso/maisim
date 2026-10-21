"""As portas e as pastas do MaiSim, de um lugar só.

Ordem (o de baixo vale mais): config/padrao.env → o perfil (MAISIM_PERFIL=teste: config/teste.env) → o .env da raiz (o da
sua máquina, fora do git; não vale no perfil de teste) → o que já estiver no ambiente. Formato: NOME=valor por linha;
" #" começa um comentário; ~ ou $HOME no começo do valor viram a pasta pessoal, e $RAIZ a raiz do projeto.

Nos servidores: `import ler_config; ler_config.aplica()` antes de ler qualquer MAISIM_* (põe no os.environ o que faltar).
No shell: eval "$(python3 config/ler_config.py --shell [perfil])". No Vite: python3 config/ler_config.py --json."""
import json
import os
import re
import shlex
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def _le(arq):
    v = {}
    try:
        linhas = arq.read_text(encoding="utf-8").splitlines()
    except OSError:
        return v
    for n, linha in enumerate(linhas, 1):
        s = linha.split(" #", 1)[0].strip()
        if not s or s.startswith("#"):
            continue
        if "=" not in s:
            raise ValueError(f"{arq}:{n}: esperava NOME=valor")
        k, x = (p.strip() for p in s.split("=", 1))
        if len(x) >= 2 and x[0] == x[-1] and x[0] in "\"'":
            x = x[1:-1]
        v[k] = x
    return v


def _expande(x):
    """~, $HOME e $RAIZ no começo de cada caminho: no início do valor, depois de ":" (listas) e depois de "=" (nome=pasta)."""
    for ini, por in ((r"~", str(Path.home())), (r"\$HOME", str(Path.home())), (r"\$RAIZ", str(RAIZ))):
        x = re.sub(r"(^|[:=])" + ini + r"(?=/|$|:)", lambda m: m.group(1) + por, x)
    return x


def carrega(perfil=None):
    """{NOME: valor} já com o ambiente por cima."""
    perfil = os.environ.get("MAISIM_PERFIL", "") if perfil is None else perfil
    arqs = [RAIZ / "config" / "padrao.env"] + ([RAIZ / "config" / f"{perfil}.env"] if perfil else [RAIZ / ".env"])
    if perfil and not arqs[1].is_file():
        raise FileNotFoundError(f"perfil {perfil!r}: falta {arqs[1]}")
    v = {}
    for a in arqs:
        v.update({k: _expande(x) for k, x in _le(a).items()})
    v.update({k: x for k, x in os.environ.items() if k.startswith("MAISIM_")})
    if perfil:
        v["MAISIM_PERFIL"] = perfil
    return v


def aplica(perfil=None):
    """Põe no os.environ os MAISIM_* que ainda não estão lá; devolve o dicionário inteiro."""
    v = carrega(perfil)
    for k, x in v.items():
        os.environ.setdefault(k, x)
    return v


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    v = carrega(args[0] if args else None)
    if "--json" in sys.argv:
        print(json.dumps(v, ensure_ascii=False))
    else:
        print("\n".join(f"export {k}={shlex.quote(x)}" for k, x in sorted(v.items())))
