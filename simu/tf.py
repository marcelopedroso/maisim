"""A função de transferência H(s) do bloco TF do Gecko (ReglerTransferFunction): o numerador e o denominador em potências
crescentes de s (índice 0 = s⁰), 20 coeficientes cada no .ipes (nominatorPolynom / denominatorPolynom). Só os polinômios
valem na simulação (StateSpaceCalculator); os polos e zeros do arquivo são só do diálogo do Gecko — o modo "polos e zeros"
do MaiSim faz a conta aqui (numpy.poly) e grava só os polinômios.

Escrita aceita (o painel e a API):
- polinômio legível: "1", "1 + 1e-3 s", "1 + 2*0.5/1000 s + 1e-6 s^2", "(1 + s/100)(1 + s/1000)", "s^2 + 2 s + 1",
  com +, −, *, /, ^ ou ** (expoente inteiro), parênteses e a multiplicação implícita ("2 s", "1e-3s", "(1+s)(1+2s)");
- lista de coeficientes, de s⁰ para cima: "1, 1e-3" ou "[1, 1e-3]" (ou a lista JSON pela API).
Erros: ErroTF(chave, **args), com as chaves editor.tf_* do textos.py (a mensagem em pt/en vem do lingua.tr)."""
import math
import re

N = 20                                   # coeficientes por polinômio no .ipes (ReglerTransferFunction.MAX_ARRAY_SIZE)
GRAU_MAX = N - 1
FOLGA = 2                                # o numerador pode ter até 2 graus a mais (StateSpaceCalculator: derivadas)


class ErroTF(ValueError):
    def __init__(self, chave, **args):
        super().__init__(chave)
        self.chave, self.args_tr = chave, args


def _apara(p):
    """Sem os zeros do fim (o grau de verdade); o polinômio nulo fica [0.0]."""
    p = [float(c) + 0.0 for c in p]              # (+ 0.0: sem o −0.0 de "-s")
    while len(p) > 1 and p[-1] == 0:
        p.pop()
    return p or [0.0]


def _soma(a, b, sinal=1.0):
    n = max(len(a), len(b))
    return [(a[i] if i < len(a) else 0.0) + sinal * (b[i] if i < len(b) else 0.0) for i in range(n)]


def _vezes(a, b):
    out = [0.0] * (len(a) + len(b) - 1)
    for i, x in enumerate(a):
        for j, y in enumerate(b):
            out[i + j] += x * y
    return out


TOKEN = re.compile(r"\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|(\*\*|[-+*/^()s·×]))")


def _tokens(txt, quem):
    out, pos = [], 0
    txt = txt.strip()
    while pos < len(txt):
        m = TOKEN.match(txt, pos)
        if not m or m.end() == pos:
            raise ErroTF("editor.tf_sintaxe", quem=quem, onde=txt[pos:pos + 12] or txt)
        out.append(("n", float(m.group(1))) if m.group(1) else ("o", {"·": "*", "×": "*", "**": "^"}.get(m.group(2), m.group(2))))
        pos = m.end()
        while pos < len(txt) and txt[pos].isspace():
            pos += 1
    return out


def _analisa(txt, quem):
    """Um polinômio legível → coeficientes crescentes (descida recursiva: soma, produto, potência, átomo)."""
    toks, k = _tokens(txt, quem), [0]

    def olha():
        return toks[k[0]] if k[0] < len(toks) else ("fim", None)

    def come(v=None):
        t = olha()
        if v is not None and t != ("o", v):
            raise ErroTF("editor.tf_sintaxe", quem=quem, onde=txt)
        k[0] += 1
        return t

    def soma():
        r = produto()
        while olha() in (("o", "+"), ("o", "-")):
            s = 1.0 if come()[1] == "+" else -1.0
            r = _soma(r, produto(), s)
        return r

    def produto():
        r = unario()
        while True:
            t = olha()
            if t in (("o", "*"), ("o", "/")):
                come()
                d = unario()
                if t[1] == "*":
                    r = _vezes(r, d)
                else:                            # só por constante (H(s) racional vai em numerador e denominador)
                    d = _apara(d)
                    if len(d) != 1:
                        raise ErroTF("editor.tf_divide_s", quem=quem)
                    if d[0] == 0:
                        raise ErroTF("editor.tf_divide_zero", quem=quem)
                    r = [c / d[0] for c in r]
            elif t[0] == "n" or t in (("o", "s"), ("o", "(")):   # multiplicação implícita: "2 s", "(1+s)(1+2s)"
                r = _vezes(r, potencia())
            else:
                return r

    def potencia():                              # a potência antes do sinal: −s^2 = −(s²), como na matemática
        b = atomo()
        if olha() == ("o", "^"):
            come()
            t = come()
            if t[0] != "n" or t[1] != int(t[1]) or not 0 <= t[1] <= GRAU_MAX:
                raise ErroTF("editor.tf_expoente", quem=quem)
            r = [1.0]
            for _ in range(int(t[1])):
                r = _vezes(r, b)
                if len(r) > 4 * N:
                    raise ErroTF("editor.tf_grau", quem=quem, grau=len(r) - 1, max=GRAU_MAX)
            return r
        return b

    def unario():
        if olha() == ("o", "-"):
            come()
            return [-c for c in unario()]
        if olha() == ("o", "+"):
            come()
            return unario()
        return potencia()

    def atomo():
        t = come()
        if t[0] == "n":
            return [t[1]]
        if t == ("o", "s"):
            return [0.0, 1.0]
        if t == ("o", "("):
            r = soma()
            come(")")
            return r
        raise ErroTF("editor.tf_sintaxe", quem=quem, onde=txt)

    r = soma()
    if olha()[0] != "fim":
        raise ErroTF("editor.tf_sintaxe", quem=quem, onde=txt)
    return r


def polinomio(v, quem="num"):
    """Texto (legível ou lista "1, 1e-3") ou lista de números → coeficientes crescentes, aparados."""
    if isinstance(v, (list, tuple)):
        try:
            p = [float(c) for c in v]
        except (TypeError, ValueError):
            raise ErroTF("editor.tf_numeros", quem=quem)
    elif isinstance(v, (int, float)) and not isinstance(v, bool):
        p = [float(v)]
    elif isinstance(v, str):
        t = v.strip()
        if not t:
            raise ErroTF("editor.tf_vazio", quem=quem)
        if t.startswith("[") and t.endswith("]"):
            t = t[1:-1]
        if re.search(r"[,;]", t):                # lista de coeficientes (cada um pode ser uma conta sem s: "2*0.5/1000")
            p = []
            for item in re.split(r"[,;]", t):
                c = _analisa(item, quem) if item.strip() else None
                if c is None or len(_apara(c)) != 1:
                    raise ErroTF("editor.tf_lista", quem=quem)
                p.append(c[0])
        else:
            p = _analisa(t, quem)
    else:
        raise ErroTF("editor.tf_numeros", quem=quem)
    if not p or not all(math.isfinite(c) for c in p):
        raise ErroTF("editor.tf_finitos", quem=quem)
    return _apara(p)


def raizes(v, quem):
    """"−1000, −50 ± 300j" ou lista → raízes complexas, cada complexa com o conjugado (acrescentado se faltar)."""
    if isinstance(v, str):
        itens = [x.strip() for x in re.split(r"[,;]", v.strip().strip("[]")) if x.strip()]
    elif isinstance(v, (list, tuple)):
        itens = list(v)
    else:
        raise ErroTF("editor.tf_raizes", quem=quem)
    out = []
    for x in itens:
        try:
            if isinstance(x, str):
                s = x.replace(" ", "").replace("i", "j").replace("−", "-")
                if "±" in s:                         # "a ± bj": o par
                    a, b = s.split("±", 1)
                    zs = [complex(a or "0") + complex(b), complex(a or "0") - complex(b)]
                else:
                    zs = [complex(s)]
            elif isinstance(x, (list, tuple)) and len(x) == 2:
                zs = [complex(float(x[0]), float(x[1]))]
            else:
                zs = [complex(float(x))]
        except (TypeError, ValueError):
            raise ErroTF("editor.tf_raizes", quem=quem)
        for z in zs:
            if not (math.isfinite(z.real) and math.isfinite(z.imag)):
                raise ErroTF("editor.tf_finitos", quem=quem)
            out.append(z)
    falta = []
    for z in out:                                    # os conjugados que faltam (como o diálogo do Gecko faz)
        if z.imag != 0 and not any(abs(w - z.conjugate()) <= 1e-12 * max(1.0, abs(z)) for w in out + falta):
            falta.append(z.conjugate())
    return out + falta


def de_polos_zeros(zeros, polos, ganho):
    """H(s) = k·Π(s − zᵢ)/Π(s − pᵢ) → (num, den) crescentes (numpy.poly dá os decrescentes, mônicos)."""
    import numpy as np
    try:
        k = float(ganho)
    except (TypeError, ValueError):
        raise ErroTF("editor.tf_ganho")
    if not math.isfinite(k):
        raise ErroTF("editor.tf_ganho")
    zs, ps = raizes(zeros or [], "zeros"), raizes(polos or [], "polos")
    if len(zs) > GRAU_MAX or len(ps) > GRAU_MAX:
        raise ErroTF("editor.tf_grau", quem="zeros" if len(zs) > GRAU_MAX else "polos", grau=max(len(zs), len(ps)), max=GRAU_MAX)
    num = (k * np.real(np.poly(zs))).tolist()[::-1] if zs else [k]
    den = np.real(np.poly(ps)).tolist()[::-1] if ps else [1.0]
    return _apara(num), _apara(den)


def valida(num, den):
    """As regras do Gecko antes de gravar: números finitos, denominador não nulo, grau ≤ 19 (20 coeficientes) e o grau do
    numerador ≤ grau do denominador + 2. → (num, den) aparados."""
    num, den = _apara(num), _apara(den)
    for p, quem in ((num, "num"), (den, "den")):
        if not all(math.isfinite(c) for c in p):
            raise ErroTF("editor.tf_finitos", quem=quem)
        if len(p) - 1 > GRAU_MAX:
            raise ErroTF("editor.tf_grau", quem=quem, grau=len(p) - 1, max=GRAU_MAX)
    if den == [0.0]:
        raise ErroTF("editor.tf_den_nulo")
    if len(num) - 1 > len(den) - 1 + FOLGA:
        raise ErroTF("editor.tf_impropria", gn=len(num) - 1, gd=len(den) - 1)
    return num, den


def linha(p):
    """Os 20 valores da linha do .ipes (crescentes, completados com zeros), no formato que o Gecko lê (Double.parseDouble)."""
    return " ".join(repr(float(c)) for c in list(p) + [0.0] * (N - len(p))) + " "

