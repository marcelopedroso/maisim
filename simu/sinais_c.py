"""O controle em C (o SIL), o que o servidor e o controle_worker_c.py usam igual: o maisim_sinais.h com os índices do painel
(M_<medida>, P_<parâmetro> com P_Ts, U_<atuação>), o compilador de C (MAISIM_CC, o TinyCC que vem com o MaiSim, tcc, gcc
ou cc) e a leitura do erro dele (arquivo e linha). O servidor compila a proposta da IA só para conferir (sem rodar); o
worker compila e roda."""
import os
import re
import shutil
import subprocess
import tempfile

DIR_C = os.path.join(os.path.dirname(os.path.abspath(__file__)), "controle_c")
GERADOS = ("maisim_sinais.h", "maisim_controle.h", "maisim_sil.c")     # do MaiSim: não são arquivos do usuário
# controle.c:12:5: error: … (gcc, clang) | controle.c:12: error: … (tcc)
ERRO_CC = re.compile(r"^(?:.*[/\\])?(?P<arq>[A-Za-z0-9_]+\.[ch]):(?P<linha>\d+):(?:(?P<col>\d+):)?\s*(?:fatal )?(?:error|erro)\s*:?\s*(?P<msg>.*)$", re.M)  # i18n-ok (a saída dos compiladores)


class NomeRepetido(ValueError):
    def __init__(self, macro, a, b):
        super().__init__(macro)
        self.macro, self.a, self.b = macro, a, b


def ident(nome):
    """O nome de um sinal como identificador de C (o índice M_<nome>, P_<nome>, U_<nome>)."""
    return re.sub(r"[^A-Za-z0-9_]", "_", str(nome))


def gera_sinais_h(sinais):
    """O maisim_sinais.h: os índices das medidas, dos parâmetros e das atuações, na ordem do painel."""
    linhas = ["/* gerado pelo MaiSim a partir do painel de Controle: não edite (muda quando o painel muda) */",  # i18n-ok (o .h gerado)
              "#ifndef MAISIM_SINAIS_H", "#define MAISIM_SINAIS_H", ""]
    vistos = {}
    for pref, chave in (("M", "m"), ("P", "p"), ("U", "u")):
        linhas.append(f"#define MAISIM_N_{chave.upper()} {max(1, len(sinais[chave]))}")
        for k, nome in enumerate(sinais[chave]):
            macro = f"{pref}_{ident(nome)}"
            if macro in vistos:
                raise NomeRepetido(macro, vistos[macro], nome)
            vistos[macro] = nome
            linhas.append(f"#define {macro} {k}")
        linhas.append("")
    linhas.append("#endif")
    return "\n".join(linhas) + "\n"


def compilador(raiz=None):
    """O compilador de C: (caminho, é_tcc) ou None."""
    if os.environ.get("MAISIM_CC"):
        cc = os.environ["MAISIM_CC"]
        return cc, "tcc" in os.path.basename(cc).lower()
    raiz = raiz or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    embutido = os.path.join(raiz, "tcc", "tcc.exe" if os.name == "nt" else "tcc")
    if os.path.isfile(embutido):
        return embutido, True
    for nome, e_tcc in (("tcc", True), ("gcc", False), ("cc", False)):
        c = shutil.which(nome)
        if c:
            return c, e_tcc
    return None


def opcoes(e_tcc, precisao="double"):
    """As opções de sempre: os .h na pasta, a precisão e, no gcc/cc, as contas como o Python (sem FMA)."""
    o = ["-I.", f"-DMAISIM_REAL={precisao}"]
    if not e_tcc:
        o += ["-O2", "-std=c99", "-ffp-contract=off", "-Werror=implicit-function-declaration"]
    return o


def primeiro_erro(saida):
    """O 1º erro do compilador: (arquivo, linha, coluna, mensagem) ou None."""
    e = ERRO_CC.search(saida or "")
    if not e:
        return None
    return e.group("arq"), int(e.group("linha")), int(e.group("col") or 1), e.group("msg").strip()


def confere(fontes, sinais, precisao="double"):
    """Compila os .c numa pasta temporária, só até o objeto (nada roda): [] ou [{arquivo, linha, coluna, msg}]. Sem
    compilador, [] (a conferência fica para a rodada)."""
    cc = compilador()
    if not cc:
        return []
    with tempfile.TemporaryDirectory() as d:
        for arq, cod in fontes.items():
            with open(os.path.join(d, arq), "w", encoding="utf-8") as f:
                f.write(cod)
        try:
            with open(os.path.join(d, "maisim_sinais.h"), "w", encoding="utf-8") as f:
                f.write(gera_sinais_h(sinais))
        except NomeRepetido as e:
            return [{"arquivo": "maisim_sinais.h", "linha": 1, "coluna": 1, "msg": f"{e.a} / {e.b} → {e.macro}"}]
        shutil.copy(os.path.join(DIR_C, "maisim_controle.h"), os.path.join(d, "maisim_controle.h"))
        erros = []
        for arq in sorted(a for a in fontes if a.endswith(".c")):
            r = subprocess.run([cc[0], *opcoes(cc[1], precisao), "-c", arq, "-o", arq + ".o"], cwd=d, capture_output=True, text=True, timeout=60)
            if r.returncode != 0:
                e = primeiro_erro(r.stderr or r.stdout)
                erros.append({"arquivo": e[0], "linha": e[1], "coluna": e[2], "msg": e[3]} if e else
                             {"arquivo": arq, "linha": 1, "coluna": 1, "msg": (r.stderr or r.stdout).strip()[-400:]})
        return erros
