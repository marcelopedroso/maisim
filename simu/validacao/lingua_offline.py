"""A trava do idioma (o MaiSim em português e inglês, Marcelo 24/10/2026: "dali pra frente tudo ser assim"). Roda em todo PR
(grupo OFFLINE do ci.sh), sem servidor:

1. os dicionários: toda chave com pt e en não vazios, os mesmos {parâmetros}, o plural ({one, other}) nos dois, e as chaves
   _html com as mesmas tags nos dois;
2. o uso: todo tr("k") (JS e Python) e todo data-tr*="k" (HTML) existe num dicionário;
3. a trava estrita do português solto: nas páginas e nos servidores (ARQ_JS, ARQ_HTML, ARQ_PY), nenhum texto com cara de
   português fora dos dicionários (literais do JS, do Python e do HTML: um acento, ou duas palavras portuguesas comuns numa
   frase) — zero, em todo arquivo; texto novo vai para o dicionário. Exceção pontual: i18n-ok na linha; no HTML, data-tr-js
   no elemento cujo texto ou dica o JS escreve (pelo tr());
4. os pares de arquivos traduzidos (o guia, as regras da IA, os modelos de código): mesmos títulos (com os números), o mesmo
   código (os comentários traduzidos; os blocos que não são Python, byte a byte), as mesmas tabelas (célula a célula) e os
   mesmos itens de lista (o par do guia tem de existir);
5. as threads do servidor levam o idioma (lingua.thread): o threading.Thread solto também entra na trava (exceção pontual:
   i18n-ok na linha, como o publica.py, que o run.py de fora importa sem o config/);
6. os dois motores (maisim-i18n.js, no node; config/lingua.py): parâmetros, plural, de onde vem o idioma.

    python3 lingua_offline.py              confere (OK / FALHA por linha, como os outros testes)
    python3 lingua_offline.py --lista ARQ  mostra os textos achados num arquivo"""
import ast
import json
import re
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
falhas = 0


def ok(c, txt):
    global falhas
    print(("OK   " if c else "FALHA") + " " + txt)
    if not c:
        falhas += 1


# ---------------------------------------------------------------- os dicionários
DIC_JS = [RAIZ / "app/public/maisim-nav.js", *sorted((RAIZ / "app/public").glob("textos_*.js")),
          *sorted((RAIZ / "simu/static").glob("textos_*.js")), *sorted((RAIZ / "scope/static").glob("textos_*.js"))]
DIC_HTML = [RAIZ / "gecko/index.html"]                    # o dicionário na própria página (a do Gecko, servida também sozinha)
DIC_PY = [p for p in (RAIZ / "simu/textos.py", RAIZ / "scope/textos_scope.py") if p.exists()]

CARREGA_JS = r"""
const vm = require("vm"), fs = require("fs"), dic = {}, dup = [];
for (const f of process.argv.slice(1)) {
  const sb = { window: {}, document: { readyState: "complete", querySelectorAll: () => [], addEventListener() {}, documentElement: {} },
    localStorage: { getItem: () => null, setItem() {} }, location: { search: "" }, navigator: { language: "pt-BR" }, console,
    addEventListener() {}, setTimeout() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), CustomEvent: function () {} };
  sb.window = sb; sb.maisimI18n = { add: (d) => { for (const k of Object.keys(d)) { if (k in dic) dup.push(k); dic[k] = d[k]; } } };
  let src = fs.readFileSync(f, "utf8");
  if (f.endsWith(".html")) src = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((x) => x.includes("maisimI18n.add(")).join("\n;\n");
  try { vm.runInNewContext(src, sb, { filename: f }); } catch (e) { /* páginas: só o add interessa */ }
}
process.stdout.write(JSON.stringify({ dic, dup }));
"""


def dicionarios():
    d, dup = {}, []
    arqs = [str(p) for p in DIC_JS + DIC_HTML if p.exists()]
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


# ---------------------------------------------------------------- o uso das chaves e a trava do português solto
ARQ_JS = [RAIZ / "app/public/maisim-nav.js", *[p for p in sorted((RAIZ / "simu/static").glob("*.js")) if not p.name.startswith("textos_")],
          *[p for p in sorted((RAIZ / "scope/static").glob("*.js")) if not p.name.startswith(("textos_", "uPlot"))]]
ARQ_HTML = [RAIZ / "app/index.html", *sorted((RAIZ / "simu/static").glob("*.html")), RAIZ / "scope/static/index.html",
            RAIZ / "gecko/index.html"]
ARQ_PY = [p for p in [*sorted((RAIZ / "simu").glob("*.py")), *sorted((RAIZ / "simu/ia").glob("*.py")), *sorted((RAIZ / "scope").glob("*.py"))]
          if p.name not in ("textos.py", "textos_scope.py")]

ACENTO = re.compile(r"[ãõçáàâêéíóôúÃÕÇÁÀÂÊÉÍÓÔÚ]")
PALAVRAS = re.compile(r"\b(não|nao|você|voce|clique|salvar|salve|abrir|abra|arquivo|rodada|rodadas|nenhum|nenhuma|circuito|"
                      r"circuitos|sinal|sinais|painel|seção|apagar|escolha|mudar|aqui|também|está|então|para|com|sem|uma|os|as|"
                      r"do|da|dos|das|no|na|ou|que|de|"
                      # sem acento também (24/10): nenhuma acusa um texto dos dicionários em inglês nem o código; "nome",
                      # "novo" e "valor" ficam de fora (são chaves e valores do protocolo, citados nos textos em inglês)
                      r"por|pelo|pela|pelos|pelas|ao|aos|em|nos|nas|este|esta|isso|quando|cada|pode|tem|foi|ser|ele|ela|"
                      r"nova|erro|linha|filtrar|modelo|enviar|fechar)\b", re.I)
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
    s = re.sub(r"\{\w+\}", " ", s)                    # os {parâmetros} ({nome}, {erro}) não são palavras do texto
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


VAZIOS = {"input", "br", "img", "hr", "meta", "link", "source", "wbr", "col", "area", "base", "embed", "param", "track"}


def textos_html(src):
    out = []
    for bloco in re.findall(r"<script\b[^>]*>(.*?)</script>", src, re.S):
        out += textos_js(bloco)
    src = "\n".join("" if "i18n-ok" in l else l for l in src.split("\n"))   # antes de tirar os comentários (a marca pode estar num)
    corpo = re.sub(r"<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->", " ", src, flags=re.S)
    corpo = re.sub(r"<(\w+)\b[^>]*\bdata-tr-html=\"[^\"]*\"[^>]*>.*?</\1>", " ", corpo, flags=re.S)   # o conteúdo é o do dicionário
    corpo = "\n".join(l for l in corpo.split("\n") if "i18n-ok" not in l)
    # cada pedaço de texto é do elemento aberto em volta dele (o texto depois de um <input> ou de um </small> é do pai); o
    # data-tr de um elemento traduz só o 1º pedaço de texto dele (como o aplica() do maisim-i18n.js), e o data-tr-js (o JS
    # escreve o texto e as dicas) vale para tudo dentro
    pilha = []                                            # [nome, atributos, o 1º texto já visto]
    for m in re.finditer(r"<(/?)([a-zA-Z][\w-]*)\b([^>]*)>([^<]*)", corpo):
        fecha, nome, atrs, texto = m.group(1), m.group(2).lower(), m.group(3), m.group(4)
        if fecha:
            if any(x[0] == nome for x in pilha):
                while pilha and pilha.pop()[0] != nome:
                    pass
        else:
            if "data-tr-js" not in atrs and not any("data-tr-js" in x[1] for x in pilha):
                for a, chave in (("title", "data-tr-title"), ("placeholder", "data-tr-ph"), ("aria-label", "data-tr-aria")):
                    v = re.search(rf'\b{a}="([^"]*)"', atrs)
                    if v and portugues(v.group(1)) and chave not in atrs:
                        out.append(v.group(1))
            if nome not in VAZIOS and not atrs.rstrip().endswith("/"):
                pilha.append([nome, atrs, False])
        if not texto.strip():
            continue
        dono = pilha[-1] if pilha else None
        livre = any("data-tr-js" in x[1] for x in pilha) or (dono and "data-tr=" in dono[1] and not dono[2])
        if dono:
            dono[2] = True
        if not livre and portugues(texto):
            out.append(texto.strip())
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
    return sum(len(re.findall(r"\bthreading\.Thread\(", l)) for l in src.split("\n") if "i18n-ok" not in l)   # a linha marcada não conta


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
    soltos = sorted((k, v) for k, v in c.items() if v)
    ok(not soltos, f"trava estrita: nenhum texto em português fora dos dicionários, em nenhum dos {len(c)} arquivos"
       + ("" if not soltos else " — " + "; ".join(f"{k}: {v}" for k, v in soltos[:8])
          + ". Ponha o texto no dicionário (tr(\"chave\")); exceção pontual: i18n-ok na linha; o que o JS escreve: data-tr-js"
          + " (python3 lingua_offline.py --lista ARQ)"))
    confere_pares()
    confere_motores()
    return 1 if falhas else 0


# ---------------------------------------------------------------- os motores (o da página e o do servidor)
MOTOR_JS = r"""
const vm = require("vm"), fs = require("fs"), sai = {}, cfg = JSON.parse(process.argv[2]);
const ls = cfg.ls ? { "maisim-lingua": cfg.ls } : {};
const jar = {};                                       // os cookies (nome=valor; max-age=0 apaga), como o navegador
for (const p of (cfg.ck || "").split(/;\s*/)) { const k = p.indexOf("="); if (k > 0) jar[p.slice(0, k)] = p.slice(k + 1); }
const document = { readyState: "complete", querySelectorAll: () => [], addEventListener() {}, documentElement: {},
  get cookie() { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "); },
  set cookie(s) { const [nv, ...at] = s.split(/;\s*/), k = nv.indexOf("="); if (k <= 0) return;
    if (at.some((a) => /^max-age=0$/i.test(a))) delete jar[nv.slice(0, k)]; else jar[nv.slice(0, k)] = nv.slice(k + 1); } };
const sb = { localStorage: { getItem: (k) => ls[k] ?? null, setItem: (k, v) => { ls[k] = v; } }, location: { search: "" },
  navigator: { language: cfg.nav || "en-US" }, console, setTimeout() {}, CustomEvent: function (n, o) { this.detail = o && o.detail; }, document };
const ev = []; sb.addEventListener = () => {}; sb.dispatchEvent = (e) => ev.push(e.detail); sb.window = sb;
vm.runInNewContext(fs.readFileSync(process.argv[1], "utf8"), sb);
const I = sb.maisimI18n;
I.add({ "x.salvo": { pt: "salvo em {arq}", en: "saved to {arq}" }, "x.n": { pt: { one: "{n} rodada", other: "{n} rodadas" }, en: { one: "{n} run", other: "{n} runs" } },
  "x.b_html": { pt: "o <b>{nome}</b>", en: "the <b>{nome}</b>" }, "x.so_pt": { pt: "só pt", en: "" } });
sai.lingua = I.lingua(); sai.salvo = I.tr("x.salvo", { arq: "a.ipes" }); sai.n0 = I.tr("x.n", { n: 0 }); sai.n1 = I.tr("x.n", { n: 1 });
sai.html = I.tr("x.b_html", { nome: "<i>" }); sai.falta = I.tr("x.nao_existe"); sai.lang = sb.document.documentElement.lang;
sai.cookie = jar["maisim-lingua"] || null; sai.auto = jar["maisim-lingua-auto"] || null; sai.guardado0 = ls["maisim-lingua"] || null;
I.muda(sai.lingua === "pt" ? "en" : "pt"); sai.depois = I.lingua(); sai.evento = ev[ev.length - 1]; sai.guardado = ls["maisim-lingua"];
sai.cookie2 = jar["maisim-lingua"] || null; sai.auto2 = jar["maisim-lingua-auto"] || null;
process.stdout.write(JSON.stringify(sai));
"""


def confere_motores():
    arq = RAIZ / "app/public/maisim-i18n.js"

    def roda(**cfg):
        x = subprocess.run(["node", "-e", MOTOR_JS, str(arq), json.dumps(cfg)], capture_output=True, text=True, timeout=60)
        return json.loads(x.stdout) if x.returncode == 0 and x.stdout else {"erro": x.stderr[:200]}
    p, e = roda(ls="pt"), roda(ls="en")
    ok(p.get("salvo") == "salvo em a.ipes" and p.get("n0") == "0 rodadas" and p.get("n1") == "1 rodada" and p.get("html") == "o <b>&lt;i&gt;</b>"
       and p.get("falta") == "x.nao_existe" and p.get("lang") == "pt-BR" and p.get("cookie") == "pt" and not p.get("auto")
       and e.get("salvo") == "saved to a.ipes" and e.get("n1") == "1 run" and e.get("lang") == "en-US" and e.get("cookie") == "en"
       and p.get("depois") == "en" and p.get("evento") == "en" and p.get("guardado") == "en" and p.get("cookie2") == "en",
       f"o motor da página: parâmetros, plural (0 → plural, como hoje), _html escapa, a chave que falta aparece, o cookie e o <html lang>, muda() avisa e guarda ({p.get('erro') or ''}{e.get('erro') or ''})")
    # de onde vem o idioma: o cookie escolhido → o localStorage desta porta → o navegador (o detectado leva a marca auto)
    casos = [("nada guardado, navegador en-US → en (o cookie com a marca auto; nada no localStorage)", dict(nav="en-US"),
              lambda r: r.get("lingua") == "en" and r.get("cookie") == "en" and r.get("auto") == "1" and not r.get("guardado0")),
             ("nada guardado, navegador pt-PT → pt", dict(nav="pt-PT"),
              lambda r: r.get("lingua") == "pt" and r.get("cookie") == "pt" and r.get("auto") == "1"),
             ("o cookie en escolhido + localStorage pt → en (a escolha mais nova, de outra porta)", dict(ls="pt", ck="maisim-lingua=en", nav="pt-BR"),
              lambda r: r.get("lingua") == "en" and r.get("cookie") == "en" and not r.get("auto")),
             ("o cookie en detectado (auto) + localStorage pt → pt (a escolha vale mais; o cookie volta a pt, sem a marca)",
              dict(ls="pt", ck="maisim-lingua=en; maisim-lingua-auto=1", nav="en-US"),
              lambda r: r.get("lingua") == "pt" and r.get("cookie") == "pt" and not r.get("auto")),
             ("detectado e depois trocado no botão → muda() tira a marca", dict(nav="en-US"),
              lambda r: r.get("depois") == "pt" and r.get("cookie2") == "pt" and not r.get("auto2") and r.get("guardado") == "pt")]
    for txt, cfg, conf in casos:
        r = roda(**cfg)
        ok(conf(r), f"o idioma da página: {txt}" + (f" — {json.dumps({k: r.get(k) for k in ('lingua', 'cookie', 'auto', 'guardado0', 'erro')})}" if not conf(r) else ""))
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
def sem_blocos(md):
    """O texto fora dos blocos de código (o # de um comentário Python dentro de um bloco não é título)."""
    return re.sub(r"```.*?```", "", md, flags=re.S)


def titulos(md):
    """(nível, número) de cada título, na ordem: "### 3.0.1 Módulos" → (3, "3.0.1"); sem número, "" (o texto muda, o número não)."""
    return [(len(m.group(1)), m.group(2) or "") for m in re.finditer(r"^(#{1,6})\s+(\d+(?:\.\d+)*\.?)?", sem_blocos(md), re.M)]


def blocos(md):
    return re.findall(r"```.*?```", md, re.S)


def tabelas(md):
    """As tabelas, na ordem: em cada uma, quantas células tem cada linha (linhas seguidas que começam por |; a célula se
    separa no | que não vem depois de \\)."""
    out, t = [], []
    for l in sem_blocos(md).split("\n") + [""]:
        if l.lstrip().startswith("|"):
            t.append(len(re.split(r"(?<!\\)\|", l.strip().strip("|"))))
        elif t:
            out.append(t); t = []
    return out


def itens(md):
    """Os itens de lista fora dos blocos (* ou - e 1.), contados por tipo."""
    fora = sem_blocos(md)
    return (len(re.findall(r"^\s*[*-]\s", fora, re.M)), len(re.findall(r"^\s*\d+\.\s", fora, re.M)))


def sem_comentarios_py(src):
    """O código sem os comentários e sem as docstrings (o mesmo critério do servidor: lingua.codigo_sem_comentarios)."""
    sys.path.insert(0, str(RAIZ / "config"))
    import lingua
    return lingua.codigo_sem_comentarios(src)


# o exemplo de automação do guia em inglês manda o cookie do idioma (o servidor responde em inglês); o português não precisa
# (sem cookie, português): a única diferença de código aceita entre os dois
COOKIE_EN = re.compile(r',\s*"Cookie":\s*"maisim-lingua=en"')


def mesmos_blocos(ca, cb):
    """Os blocos de código dos dois idiomas: os ```python, o mesmo código (os comentários e as docstrings traduzidos:
    lingua.mesmo_codigo); os outros (os diagramas em ASCII, os comandos), byte a byte."""
    if len(ca) != len(cb):
        return False
    for x, y in zip(ca, cb):
        if x.startswith("```python\n"):
            sys.path.insert(0, str(RAIZ / "config"))
            import lingua
            if not y.startswith("```python\n") or not lingua.mesmo_codigo(x[10:-3], COOKIE_EN.sub("", y[10:-3])):
                return False
        elif x != y:
            return False
    return True


TRAD_EXEMPLO = {".controle": {"codigo"}, ".scope": {"titulos"}}   # <nome>.controle.en.json e <nome>.scope.en.json


def confere_exemplos():
    """As traduções dos exemplos (exemplos/<nome>.controle.en.json, <nome>.scope.en.json): ao lado de um arquivo que existe,
    só as chaves conhecidas, o código traduzido é o mesmo do original (só os comentários mudam) e todo título do layout tem
    a tradução (e só os que existem nele)."""
    for f in sorted((RAIZ / "exemplos").glob("*.*.*.json")):
        tipo, l = Path(f.stem).with_suffix("").suffix, Path(f.stem).suffix[1:]
        orig = f.with_name(f.name[:-len(f".{l}.json")] + ".json")
        nome, ruins = f.relative_to(RAIZ), []
        try:
            t, d = json.loads(f.read_text()), json.loads(orig.read_text())
        except (OSError, ValueError) as e:
            ok(False, f"{nome}: a tradução ou o original ({orig.name}) não lê ({e.__class__.__name__})"); continue
        if l not in ("en",) or tipo not in TRAD_EXEMPLO or not isinstance(t, dict) or set(t) - TRAD_EXEMPLO[tipo]:
            ok(False, f"{nome}: tradução desconhecida (só <nome>.controle.en.json com codigo e <nome>.scope.en.json com titulos)"); continue
        for arq, cod in (t.get("codigo") or {}).items():
            o = d.get("codigo") if arq == "controle.py" else (d.get("arquivos") or {}).get(arq)
            if not isinstance(o, str) or not isinstance(cod, str) or sem_comentarios_py(o) is None or sem_comentarios_py(o) != sem_comentarios_py(cod):
                ruins.append(f"o {arq} não é o mesmo código de {orig.name} (o servidor fica com o original)")
        if tipo == ".scope":
            tit = t.get("titulos") if isinstance(t.get("titulos"), dict) else {}
            nomes = {x.get(k) for x in d.get("itens") or [] if isinstance(x, dict) for k in ("secao", "titulo")} - {None, ""}
            ruins += [f"sem tradução: \"{x}\"" for x in sorted(nomes - set(tit))]
            ruins += [f"\"{x}\" não está no layout" for x in sorted(set(tit) - nomes)]
            ruins += [f"tradução vazia: \"{x}\"" for x, v in tit.items() if not isinstance(v, str) or not v.strip()]
        ok(not ruins, f"{nome}: a tradução de {orig.name} (o mesmo código, todos os títulos do layout)"
           + ("" if not ruins else " — " + "; ".join(ruins[:5])))


def confere_pares():
    pares = [(RAIZ / "simu/GUIA_CONTROLE.md", RAIZ / "simu/GUIA_CONTROLE.en.md", "md", True),   # o guia: o par já existe (PR 12)
             (RAIZ / "simu/ia/regras.pt.md", RAIZ / "simu/ia/regras.en.md", "md", False)]
    pares += [(p, p.with_name(p.stem + ".en.py"), "py", False) for p in sorted((RAIZ / "simu").glob("*_modelo.py"))]
    for a, b, tipo, obrigatorio in pares:
        if obrigatorio and not (a.exists() and b.exists()):
            ok(False, f"{b.relative_to(RAIZ)}: falta o par ({a.name} e {b.name} precisam existir os dois)")
            continue
        if not b.exists():
            if tipo == "py":                             # o servidor lê os dois (modelo_codigo): o modelo sem o par não sobe
                ok(False, f"{a.relative_to(RAIZ)}: falta o par em inglês ({b.name})")
            continue
        ta, tb = a.read_text(), b.read_text()
        if tipo == "md":
            ha, hb, ca, cb, la, lb = titulos(ta), titulos(tb), blocos(ta), blocos(tb), tabelas(ta), tabelas(tb)
            dif = [x for x, c in (("títulos (nível, número e ordem)", ha == hb),
                                  ("blocos de código (o mesmo código Python, os outros byte a byte)", mesmos_blocos(ca, cb)),
                                  ("tabelas (as células de cada linha)", la == lb), ("itens de lista", itens(ta) == itens(tb))) if not c]
            ok(not dif, f"{b.relative_to(RAIZ)}: os mesmos títulos ({len(ha)}, com os números), o mesmo código ({len(ca)} blocos), "
               f"as mesmas tabelas ({sum(len(x) for x in la)} linhas em {len(la)}, as mesmas células) e os mesmos itens de lista "
               f"{itens(ta)} de {a.name}" + (f" — diferem: {', '.join(dif)}" if dif else ""))
        else:
            ok(sem_comentarios_py(ta) is not None and sem_comentarios_py(ta) == sem_comentarios_py(tb),
               f"{b.relative_to(RAIZ)}: o mesmo código de {a.name} (só os comentários e as docstrings mudam)")
    orfaos = [p.relative_to(RAIZ) for p in sorted((RAIZ / "simu").glob("*.en.py")) if not p.with_name(p.name[:-len(".en.py")] + ".py").exists()]
    ok(not orfaos, "os .en.py têm o original em português" + (f" — sem: {', '.join(map(str, orfaos))}" if orfaos else ""))
    confere_exemplos()


if __name__ == "__main__":
    sys.exit(main())
