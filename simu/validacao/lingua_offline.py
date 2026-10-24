"""A trava do idioma (o MaiSim em português e inglês, Marcelo 24/10/2026: "dali pra frente tudo ser assim"). Roda em todo PR
(grupo OFFLINE do ci.sh), sem servidor:

1. os dicionários: toda chave com pt e en não vazios, os mesmos {parâmetros}, o plural ({one, other}) nos dois, e as chaves
   _html com as mesmas tags nos dois;
2. o uso: todo tr("k") (JS e Python) e todo data-tr*="k" (HTML) existe num dicionário;
3. a catraca do português solto: em cada arquivo, os textos com cara de português fora dos dicionários (literais do JS, do
   Python e do HTML) são contados; a contagem não pode subir (texto novo vai para o dicionário) e, quando cai, a base é
   atualizada no mesmo PR (python3 lingua_offline.py --atualiza), para ela só descer. Exceção pontual: i18n-ok na linha;
4. os pares de arquivos traduzidos (o guia, as regras da IA, os modelos de código): mesmos títulos e o mesmo código;
5. as threads do servidor levam o idioma (lingua.thread): o threading.Thread solto também entra na catraca.

    python3 lingua_offline.py              confere (OK / FALHA por linha, como os outros testes)
    python3 lingua_offline.py --atualiza   grava a base da catraca (lingua_pendentes.json) com as contagens de agora (só desce;
                                           --forca deixa subir, com o motivo no PR)
    python3 lingua_offline.py --lista ARQ  mostra os textos contados num arquivo"""
import ast
import json
import re
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
BASE = AQUI / "lingua_pendentes.json"
falhas = 0


def ok(c, txt):
    global falhas
    print(("OK   " if c else "FALHA") + " " + txt)
    if not c:
        falhas += 1


# ---------------------------------------------------------------- os dicionários
DIC_JS = [RAIZ / "app/public/maisim-nav.js", *sorted((RAIZ / "app/public").glob("textos_*.js")),
          *sorted((RAIZ / "simu/static").glob("textos_*.js")), *sorted((RAIZ / "scope/static").glob("textos_*.js"))]
DIC_PY = [p for p in (RAIZ / "simu/textos.py", RAIZ / "scope/textos_scope.py") if p.exists()]

CARREGA_JS = r"""
const vm = require("vm"), fs = require("fs"), dic = {}, dup = [];
for (const f of process.argv.slice(1)) {
  const sb = { window: {}, document: { readyState: "complete", querySelectorAll: () => [], addEventListener() {}, documentElement: {} },
    localStorage: { getItem: () => null, setItem() {} }, location: { search: "" }, navigator: { language: "pt-BR" }, console,
    addEventListener() {}, setTimeout() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), CustomEvent: function () {} };
  sb.window = sb; sb.maisimI18n = { add: (d) => { for (const k of Object.keys(d)) { if (k in dic) dup.push(k); dic[k] = d[k]; } } };
  try { vm.runInNewContext(fs.readFileSync(f, "utf8"), sb, { filename: f }); } catch (e) { /* páginas: só o add interessa */ }
}
process.stdout.write(JSON.stringify({ dic, dup }));
"""


def dicionarios():
    d, dup = {}, []
    arqs = [str(p) for p in DIC_JS if p.exists()]
    if arqs:
        r = subprocess.run(["node", "-e", CARREGA_JS, *arqs], capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            ok(False, f"dicionários JS: o node não leu ({r.stderr.strip()[:200]})")
        else:
            j = json.loads(r.stdout or "{}")
            d.update(j.get("dic", {}))
            dup += j.get("dup", [])
    for p in DIC_PY:
        arv = ast.parse(p.read_text())
        for n in ast.walk(arv):
            if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "T" for t in n.targets):
                try:
                    for k, v in ast.literal_eval(n.value).items():
                        if k in d:
                            dup.append(k)
                        d[k] = v
                except ValueError:
                    ok(False, f"{p.relative_to(RAIZ)}: o T não é um literal simples")
    return d, dup


PARAM = re.compile(r"\{(\w+)\}")
TAG = re.compile(r"</?([a-zA-Z][a-zA-Z0-9]*)")


def formas(v):
    return [v] if isinstance(v, str) else [v.get("one"), v.get("other")] if isinstance(v, dict) else [None]


def confere_dicionario(d, dup):
    ruins = []
    for k, e in d.items():
        if not isinstance(e, dict) or set(e) - {"pt", "en"} or not e.get("pt") or not e.get("en"):
            ruins.append(f"{k}: sem pt ou en"); continue
        fp, fe = formas(e["pt"]), formas(e["en"])
        if any(not x or not isinstance(x, str) for x in fp + fe):
            ruins.append(f"{k}: forma vazia (o plural precisa de one e other nos dois)"); continue
        if isinstance(e["pt"], dict) != isinstance(e["en"], dict):
            ruins.append(f"{k}: plural num idioma só")
        if {p for x in fp for p in PARAM.findall(x)} != {p for x in fe for p in PARAM.findall(x)}:
            ruins.append(f"{k}: parâmetros diferentes")
        if k.endswith("_html") and sorted(t for x in fp for t in TAG.findall(x)) != sorted(t for x in fe for t in TAG.findall(x)):
            ruins.append(f"{k}: tags diferentes")
    ok(not ruins and not dup, f"dicionários: {len(d)} chaves, pt e en em todas, mesmos parâmetros e tags"
       + ("" if not ruins and not dup else f" — {'; '.join(ruins[:8])}{' …' if len(ruins) > 8 else ''}{' repetidas: ' + ', '.join(dup[:5]) if dup else ''}"))


# ---------------------------------------------------------------- o uso das chaves e a catraca
ARQ_JS = [RAIZ / "app/public/maisim-nav.js", *[p for p in sorted((RAIZ / "simu/static").glob("*.js")) if not p.name.startswith("textos_")],
          *[p for p in sorted((RAIZ / "scope/static").glob("*.js")) if not p.name.startswith(("textos_", "uPlot"))]]
ARQ_HTML = [RAIZ / "app/index.html", *sorted((RAIZ / "simu/static").glob("*.html")), RAIZ / "scope/static/index.html"]
ARQ_PY = [p for p in [*sorted((RAIZ / "simu").glob("*.py")), *sorted((RAIZ / "simu/ia").glob("*.py")), *sorted((RAIZ / "scope").glob("*.py"))]
          if p.name not in ("textos.py", "textos_scope.py")]

ACENTO = re.compile(r"[ãõçáàâêéíóôúÃÕÇÁÀÂÊÉÍÓÔÚ]")
PALAVRAS = re.compile(r"\b(não|nao|você|voce|clique|salvar|salve|abrir|abra|arquivo|rodada|rodadas|nenhum|nenhuma|circuito|"
                      r"circuitos|sinal|sinais|painel|seção|apagar|escolha|mudar|aqui|também|está|então|para|com|sem|uma|os|as|"
                      r"do|da|dos|das|no|na|ou|que|de)\b", re.I)
USO_TR_JS = re.compile(r"\btr\(\s*[\"'`]([\w.]+)[\"'`](?!\s*\+)")   # tr("a." + x): montada na hora, não conta
USO_DATA = re.compile(r"data-tr(?:-html|-title|-ph|-aria|-msg)?=\\?\"([\w.]+)\\?\"")
USO_HTML = re.compile(r"data-tr-html=\\?\"([\w.]+)\\?\"")
USO_TR_PY = re.compile(r"\b(?:lingua\.)?t(?:r)?\(\s*[\"']([\w.]+)[\"']")


def portugues(s):
    s = re.sub(r"<[^>]*$|^[^<]*?=\"[^>]*>|^[^<]*>", "", s).strip()   # pedaços de tag (o template cortado no ${…}) não são texto
    if len(s) < 2 or not re.search(r"[A-Za-zÀ-ú]", s):
        return False
    if ACENTO.search(s):
        return True
    return len(PALAVRAS.findall(s)) >= 2 and " " in s   # duas palavras portuguesas comuns numa frase


def lexa_js(src, guarda=False):
    """Lê o JS: devolve (o código sem comentários, os textos dos literais). Acompanha strings, templates com ${…} aninhados
    (o código dentro e os templates dentro dele) e regex (/'/ não abre string) — o suficiente para contar os textos. guarda:
    as strings comuns ficam no código (para achar as chaves de tr("…"))."""
    out, textos, i, n = [], [], 0, len(src)
    pilha = []                                            # "`": dentro de um template; "{": dentro de um ${…} (a profundidade)
    buf = []

    def regex_aqui():
        k = len(out) - 1
        while k >= 0 and out[k] in " \t\n":
            k -= 1
        if k < 0 or out[k] in "(,=:[!&|?{};+-*%~^":
            return True
        return bool(re.search(r"\b(return|typeof|case|in|of)$", "".join(out[max(0, k - 6):k + 1])))

    while i < n:
        c = src[i]
        if pilha and pilha[-1] == "`":                    # texto de template
            if c == "\\":
                buf.append(src[i:i + 2]); i += 2; continue
            if c == "`":
                textos.append("".join(buf)); buf = []; pilha.pop(); out.append(c); i += 1; continue
            if src.startswith("${", i):
                textos.append("".join(buf)); buf = []; pilha.append("{"); out.append("${"); i += 2; continue
            buf.append(c); i += 1; continue
        if c in "\"'":                                     # string comum
            j, b = i + 1, []
            while j < n and src[j] != c and src[j] != "\n":
                if src[j] == "\\":
                    b.append(src[j:j + 2]); j += 2; continue
                b.append(src[j]); j += 1
            textos.append("".join(b)); out.append(src[i:j + 1] if guarda else c + " " * max(0, j - i - 1) + c); i = j + 1; continue
        if c == "`":
            pilha.append("`"); out.append(c); i += 1; continue
        if src.startswith("//", i):
            j = src.find("\n", i); i = n if j < 0 else j; continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2); i = n if j < 0 else j + 2; continue
        if c == "/" and regex_aqui():                      # um literal de regex: até a / que fecha (fora de [...])
            j, classe = i + 1, False
            while j < n and src[j] != "\n":
                if src[j] == "\\":
                    j += 2; continue
                if src[j] == "[":
                    classe = True
                elif src[j] == "]":
                    classe = False
                elif src[j] == "/" and not classe:
                    break
                j += 1
            out.append(" " * (j + 1 - i)); i = j + 1; continue
        if pilha and pilha[-1] != "`":                    # dentro de ${…}: as chaves contam até fechar
            if c == "{":
                pilha.append("{")
            elif c == "}":
                pilha.pop()
                if pilha and pilha[-1] == "`":
                    out.append(c); i += 1; continue
        out.append(c); i += 1
    return "".join(out), textos


def sem_comentarios_js(src):
    return lexa_js(src, guarda=True)[0]


def sem_dicionarios(src):
    """Tira os blocos de dicionário (….add({ … }), ou const TXT = { … } passado ao add): o português de dentro deles é o
    lugar certo, não conta como solto."""
    out, i = [], 0
    while True:
        m = re.compile(r"\.add\(\{|\bconst TXT = \{").search(src, i)
        if not m:
            return "".join(out) + src[i:]
        k = m.start()
        out.append(src[i:k])
        j, prof, est = m.end() - 1, 0, None
        while j < len(src):
            c = src[j]
            if est:
                if c == "\\":
                    j += 2; continue
                if c == est:
                    est = None
            elif src.startswith("//", j):           # comentários: um ' ou ` dentro (// don't) não abre string
                j = src.find("\n", j); j = len(src) if j < 0 else j; continue
            elif src.startswith("/*", j):
                j = src.find("*/", j); j = len(src) if j < 0 else j + 2; continue
            elif c in "\"'`":
                est = c
            elif c == "{":
                prof += 1
            elif c == "}":
                prof -= 1
                if prof == 0:
                    break
            j += 1
        i = j + 1


def textos_js(src):
    """Os textos dos literais do JS (das linhas sem i18n-ok) que têm cara de português (o HTML dentro, em pedaços)."""
    limpo = "\n".join("" if "i18n-ok" in l else l for l in sem_dicionarios(src).split("\n"))
    return [p for s in lexa_js(limpo)[1] for p in re.split(r"<[^>]+>", s) if portugues(p)]


def textos_html(src):
    out = []
    for bloco in re.findall(r"<script\b[^>]*>(.*?)</script>", src, re.S):
        out += textos_js(bloco)
    src = "\n".join("" if "i18n-ok" in l else l for l in src.split("\n"))   # antes de tirar os comentários (a marca pode estar num)
    corpo = re.sub(r"<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->", " ", src, flags=re.S)
    corpo = re.sub(r"<(\w+)\b[^>]*\bdata-tr-html=\"[^\"]*\"[^>]*>.*?</\1>", " ", corpo, flags=re.S)   # o conteúdo é o do dicionário
    corpo = "\n".join(l for l in corpo.split("\n") if "i18n-ok" not in l)
    for m in re.finditer(r"<([a-zA-Z][\w-]*)\b([^>]*)>([^<]*)", corpo):
        atrs, texto = m.group(2), m.group(3)
        if texto.strip() and portugues(texto) and "data-tr=" not in atrs and "data-tr-html=" not in atrs:
            out.append(texto.strip())
        for a, chave in (("title", "data-tr-title"), ("placeholder", "data-tr-ph"), ("aria-label", "data-tr-aria")):
            v = re.search(rf'\b{a}="([^"]*)"', atrs)
            if v and portugues(v.group(1)) and chave not in atrs:
                out.append(v.group(1))
    return out


def textos_py(src):
    arv = ast.parse(src)
    docs = set()
    for n in ast.walk(arv):
        if isinstance(n, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.body and \
                isinstance(n.body[0], ast.Expr) and isinstance(getattr(n.body[0], "value", None), ast.Constant):
            docs.add(id(n.body[0].value))
    ok_linhas = {i + 1 for i, l in enumerate(src.split("\n")) if "i18n-ok" in l}
    out = []
    for n in ast.walk(arv):
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docs and n.lineno not in ok_linhas:
            if portugues(n.value):
                out.append(n.value)
    return out


def threads_soltas(src):
    return len(re.findall(r"\bthreading\.Thread\(", src))


def contagens():
    c, usos = {}, {}
    for p in ARQ_JS:
        s = p.read_text()
        c[str(p.relative_to(RAIZ))] = len(textos_js(s))
        usos.update({k: str(p.relative_to(RAIZ)) for k in USO_TR_JS.findall(sem_comentarios_js(s)) + USO_DATA.findall(s)})
    for p in ARQ_HTML:
        s = p.read_text()
        c[str(p.relative_to(RAIZ))] = len(textos_html(s))
        usos.update({k: str(p.relative_to(RAIZ)) for k in USO_DATA.findall(s) + USO_TR_JS.findall(s)})
    for p in ARQ_PY:
        s = p.read_text()
        c[str(p.relative_to(RAIZ))] = len(textos_py(s))
        n = threads_soltas(s)
        if n:
            c[str(p.relative_to(RAIZ)) + " (threading.Thread sem o idioma)"] = n
        usos.update({k: str(p.relative_to(RAIZ)) for k in USO_TR_PY.findall(s) if "." in k})
    return c, usos


def main():
    args = sys.argv[1:]
    if args[:1] == ["--lista"]:
        alvo = RAIZ / args[1]
        s = alvo.read_text()
        f = textos_py if alvo.suffix == ".py" else textos_html if alvo.suffix == ".html" else textos_js
        for x in f(s):
            print("  ", x.strip()[:140].replace("\n", " "))
        return 0
    d, dup = dicionarios()
    confere_dicionario(d, dup)
    c, usos = contagens()
    faltam = sorted(k for k in usos if k not in d)
    todos = "".join(p.read_text() for p in ARQ_JS + ARQ_HTML)
    sem_html = sorted({k for k in USO_HTML.findall(todos) if not k.endswith("_html")})
    ok(not sem_html, "data-tr-html usa chaves _html (os parâmetros escapados, as tags conferidas)" + (f" — sem _html: {', '.join(sem_html[:8])}" if sem_html else ""))
    ok(not faltam, f"chaves usadas ({len(usos)}) existem nos dicionários" + (f" — faltam: {', '.join(faltam[:10])}" if faltam else ""))
    sem_uso = sorted(k for k in d if k not in usos)
    if sem_uso:
        print(f"      (sem uso à vista: {len(sem_uso)} chave(s), ex.: {', '.join(sem_uso[:5])} — talvez montadas na hora)")
    if args[:1] == ["--atualiza"]:
        antiga = json.loads(BASE.read_text()) if BASE.exists() else {}
        subiu = [k for k, v in c.items() if v > antiga.get(k, 0)] if antiga else []
        if subiu and "--forca" not in args:              # a base só desce: texto novo vai para o dicionário
            print(f"a base não sobe: {', '.join(subiu[:8])} — ponha os textos novos no dicionário (ou --forca, com motivo no PR)")
            return 1
        BASE.write_text(json.dumps(dict(sorted(c.items())), ensure_ascii=False, indent=1) + "\n")
        print(f"base da catraca gravada: {sum(c.values())} textos em português fora dos dicionários ({BASE.name})")
        return 0
    base = json.loads(BASE.read_text()) if BASE.exists() else {}
    subiu = [(k, base.get(k, 0), v) for k, v in c.items() if v > base.get(k, 0)]
    caiu = [(k, base.get(k, 0), v) for k, v in c.items() if v < base.get(k, 0)] + [(k, n, 0) for k, n in base.items() if k not in c and n]
    ok(not subiu, f"catraca: nenhum texto novo em português fora dos dicionários (total {sum(c.values())}, base {sum(base.values())})"
       + ("" if not subiu else " — subiu: " + "; ".join(f"{k} {a} → {b}" for k, a, b in subiu[:8])
          + ". Ponha o texto no dicionário (tr(\"chave\")); exceção pontual: i18n-ok na linha"))
    ok(not caiu, "catraca: a base acompanha o que já foi traduzido" + ("" if not caiu else
       " — caiu (bom!): " + "; ".join(f"{k} {a} → {b}" for k, a, b in caiu[:8]) + ". Atualize: python3 lingua_offline.py --atualiza"))
    confere_pares()
    confere_motores()
    return 1 if falhas else 0


# ---------------------------------------------------------------- os motores (o da página e o do servidor)
MOTOR_JS = r"""
const vm = require("vm"), fs = require("fs"), sai = {};
const ls = { "maisim-lingua": process.argv[2] };
const sb = { localStorage: { getItem: (k) => ls[k] ?? null, setItem: (k, v) => { ls[k] = v; } }, location: { search: "" },
  navigator: { language: "en-US" }, console, setTimeout() {}, CustomEvent: function (n, o) { this.detail = o && o.detail; },
  document: { readyState: "complete", querySelectorAll: () => [], addEventListener() {}, documentElement: {}, cookie: "" } };
const ev = []; sb.addEventListener = () => {}; sb.dispatchEvent = (e) => ev.push(e.detail); sb.window = sb;
vm.runInNewContext(fs.readFileSync(process.argv[1], "utf8"), sb);
const I = sb.maisimI18n;
I.add({ "x.salvo": { pt: "salvo em {arq}", en: "saved to {arq}" }, "x.n": { pt: { one: "{n} rodada", other: "{n} rodadas" }, en: { one: "{n} run", other: "{n} runs" } },
  "x.b_html": { pt: "o <b>{nome}</b>", en: "the <b>{nome}</b>" }, "x.so_pt": { pt: "só pt", en: "" } });
sai.lingua = I.lingua(); sai.salvo = I.tr("x.salvo", { arq: "a.ipes" }); sai.n0 = I.tr("x.n", { n: 0 }); sai.n1 = I.tr("x.n", { n: 1 });
sai.html = I.tr("x.b_html", { nome: "<i>" }); sai.falta = I.tr("x.nao_existe"); sai.cookie = sb.document.cookie; sai.lang = sb.document.documentElement.lang;
I.muda(sai.lingua === "pt" ? "en" : "pt"); sai.depois = I.lingua(); sai.evento = ev[ev.length - 1]; sai.guardado = ls["maisim-lingua"];
process.stdout.write(JSON.stringify(sai));
"""


def confere_motores():
    arq = RAIZ / "app/public/maisim-i18n.js"
    r = {}
    for l in ("pt", "en"):
        x = subprocess.run(["node", "-e", MOTOR_JS, str(arq), l], capture_output=True, text=True, timeout=60)
        r[l] = json.loads(x.stdout) if x.returncode == 0 and x.stdout else {"erro": x.stderr[:200]}
    p, e = r["pt"], r["en"]
    ok(p.get("salvo") == "salvo em a.ipes" and p.get("n0") == "0 rodadas" and p.get("n1") == "1 rodada" and p.get("html") == "o <b>&lt;i&gt;</b>"
       and p.get("falta") == "x.nao_existe" and p.get("lang") == "pt-BR" and "maisim-lingua=pt" in p.get("cookie", "")
       and e.get("salvo") == "saved to a.ipes" and e.get("n1") == "1 run" and e.get("lang") == "en-US" and "maisim-lingua=en" in e.get("cookie", "")
       and p.get("depois") == "en" and p.get("evento") == "en" and p.get("guardado") == "en",
       f"o motor da página: parâmetros, plural (0 → plural, como hoje), _html escapa, a chave que falta aparece, o cookie e o <html lang>, muda() avisa e guarda ({p.get('erro') or ''}{e.get('erro') or ''})")
    sys.path.insert(0, str(RAIZ / "config"))
    import lingua
    lingua.registra({"x.salvo": {"pt": "salvo em {arq}", "en": "saved to {arq}"}, "x.n": {"pt": {"one": "{n} rodada", "other": "{n} rodadas"}, "en": {"one": "{n} run", "other": "{n} runs"}}})
    sem = lingua.do_pedido({})
    a = (sem, lingua.tr("x.salvo", arq="a"), lingua.tr("x.n", n=0))
    lingua.do_pedido({"Cookie": "outro=1; maisim-lingua=en"})
    b = (lingua.tr("x.salvo", arq="a"), lingua.tr("x.n", n=1))
    na_thread = []
    th = lingua.thread(lambda: na_thread.append(lingua.tr("x.n", n=2)))
    th.start(); th.join()
    ok(a == ("pt", "salvo em a", "0 rodadas") and b == ("saved to a", "1 run") and na_thread == ["2 runs"],
       f"o motor do servidor: sem cookie, português {a}; com o cookie en {b}; a thread leva o idioma {na_thread}")


# ---------------------------------------------------------------- os pares de arquivos traduzidos
def titulos(md):
    return [len(m.group(1)) for m in re.finditer(r"^(#{1,6})\s", md, re.M)]


def blocos(md):
    return re.findall(r"```.*?```", md, re.S)


def sem_comentarios_py(src):
    try:
        return ast.dump(ast.parse(src))
    except SyntaxError:
        return None


def confere_pares():
    pares = [(RAIZ / "simu/GUIA_CONTROLE.md", RAIZ / "simu/GUIA_CONTROLE.en.md", "md"),
             (RAIZ / "simu/ia/regras.pt.md", RAIZ / "simu/ia/regras.en.md", "md")]
    pares += [(p, p.with_name(p.stem + ".en.py"), "py") for p in sorted((RAIZ / "simu").glob("*_modelo.py"))]
    for a, b, tipo in pares:
        if not b.exists():
            continue
        ta, tb = a.read_text(), b.read_text()
        if tipo == "md":
            ok(titulos(ta) == titulos(tb) and blocos(ta) == blocos(tb), f"{b.relative_to(RAIZ)}: os mesmos títulos e o mesmo código de {a.name}")
        else:
            ok(sem_comentarios_py(ta) == sem_comentarios_py(tb), f"{b.relative_to(RAIZ)}: o mesmo código de {a.name} (só os comentários mudam)")


if __name__ == "__main__":
    sys.exit(main())
