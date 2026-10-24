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
PORTAS = (("MAISIM_PORTA_PAGINA", 0), ("MAISIM_PORTA_SIMU", 1), ("MAISIM_PORTA_SCOPE", 2), ("MAISIM_PORTA_GECKO", 3),
          ("MAISIM_PORTA_MOTOR", 4), ("MAISIM_PORTA_TELA", 5), ("MAISIM_PORTA_VNC", 6))   # a partir de MAISIM_PORTA
# as portas que os navegadores recusam abrir (ERR_UNSAFE_PORT: a lista do Chrome e do Firefox, só as de 1024 para cima);
# o pacote/windows/MaiSim.iss tem a mesma lista
PORTAS_BLOQUEADAS = frozenset((1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
                               6669, 6679, 6697, 10080))


def porta_bloqueada(base):
    """A primeira das sete portas do MaiSim (base…base+6) que os navegadores recusam, ou None."""
    return next((p for p in range(base, base + len(PORTAS)) if p in PORTAS_BLOQUEADAS), None)


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


def pasta_documentos():
    """Onde ficam os dados de quem usa a versão "só usar" (perfil produto): no Windows, a pasta Documentos do sistema (a de
    verdade, mesmo levada para o OneDrive ou outro disco); no Linux, a pasta pessoal (~/MaiSim, à vista)."""
    if os.name == "nt":
        try:
            import ctypes
            buf = ctypes.create_unicode_buffer(260)
            if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf) == 0 and buf.value:   # CSIDL_PERSONAL
                return Path(buf.value)
        except (AttributeError, OSError):
            pass
        return Path.home() / "Documents"
    return Path.home()


def pasta_cache():
    """O cache e os registros do MaiSim: %LOCALAPPDATA%\\MaiSim\\Cache no Windows (uma pasta só dele: o desinstalar apaga
    só ela, nunca o que mais houver em %LOCALAPPDATA%\\MaiSim); $XDG_CACHE_HOME/maisim ou ~/.cache/maisim no Linux."""
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "MaiSim" / "Cache"
    return Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "maisim"


def arquivo_pessoal():
    """A config de quem usa a versão "só usar" (a porta e as pastas que o instalador pergunta; sobrevive às atualizações):
    %APPDATA%\MaiSim\maisim.env no Windows; $XDG_CONFIG_HOME/maisim/maisim.env (~/.config/maisim/maisim.env) no Linux."""
    if os.name == "nt":
        return Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming") / "MaiSim" / "maisim.env"
    return Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "maisim" / "maisim.env"


def _expande(x):
    """~, $HOME e $RAIZ no começo de cada caminho: no início do valor, depois de ":" (listas) e depois de "=" (nome=pasta);
    e, para o perfil produto, $DOCUMENTOS (pasta_documentos) e $CACHE_SISTEMA (pasta_cache)."""
    for ini, por in ((r"~", str(Path.home())), (r"\$HOME", str(Path.home())), (r"\$RAIZ", str(RAIZ)),
                     (r"\$DOCUMENTOS", str(pasta_documentos())), (r"\$CACHE_SISTEMA", str(pasta_cache()))):
        x = re.sub(r"(^|[:=])" + ini + r"(?=/|$|:)", lambda m: m.group(1) + por, x)
    return x


def carrega(perfil=None):
    """{NOME: valor} já com o ambiente por cima."""
    perfil = os.environ.get("MAISIM_PERFIL", "") if perfil is None else perfil
    arqs = [RAIZ / "config" / "padrao.env"] + ([RAIZ / "config" / f"{perfil}.env"] if perfil else [RAIZ / ".env"])
    if perfil and not arqs[1].is_file():
        raise FileNotFoundError(f"perfil {perfil!r}: falta {arqs[1]}")
    if perfil == "produto":                          # a versão "só usar": por cima, a config de quem usa (arquivo_pessoal)
        arqs.append(arquivo_pessoal())
    v, proprios = {}, {}
    for k, a in enumerate(arqs):
        lido = {n: _expande(x) for n, x in _le(a).items()}
        v.update(lido)
        if k:                                        # o .env (ou o perfil): o que a pessoa escreveu, não o padrão
            proprios.update(lido)
    amb = {k: x for k, x in os.environ.items() if k.startswith("MAISIM_")}
    proprios.update(amb)
    # MAISIM_PORTA=8100 (no .env ou no ambiente): uma linha só muda as sete portas, como o -p do npm run maisim (8100 a
    # página, 8101 o simu… 8106 o VNC; a tela virtual :81); uma porta escrita à parte vale mais
    base = proprios.get("MAISIM_PORTA", "").strip()
    if base:
        if not base.isdigit() or not 1024 <= int(base) <= 65000:
            raise ValueError(f"MAISIM_PORTA={base!r}: esperava um número de porta entre 1024 e 65000")
        b = int(base)
        if porta_bloqueada(b):
            raise ValueError(f"MAISIM_PORTA={b}: a porta {porta_bloqueada(b)} é recusada pelos navegadores / port {porta_bloqueada(b)} "
                             "is refused by browsers (ERR_UNSAFE_PORT)")
        for nome, d in PORTAS:
            v[nome] = proprios.get(nome) or str(b + d)
        v["MAISIM_TELA_X"] = proprios.get("MAISIM_TELA_X") or f":{b // 100}"
    v.update(amb)
    if perfil:
        v["MAISIM_PERFIL"] = perfil
    if perfil == "produto":
        v.setdefault("MAISIM_CONFIG_PESSOAL", str(arquivo_pessoal()))   # onde o instalador e o lançador gravam a porta
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
