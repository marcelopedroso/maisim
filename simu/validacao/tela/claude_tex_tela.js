// as equações nas respostas do Claude do PEW (página de teste 5010 → 8768), Marcelo em 20/10 ("ter as libs de equação ou
// LaTeX para apresentar nas respostas as equações formatadas"): o KaTeX do próprio PEW (static/katex) no markdown leve da
// conversa — $$…$$ e \[…\] em destaque, $…$ e \(…\) na linha; código, "$Ra e $Rf" (parâmetros do Gecko) e "$5 e $10" não
// viram equação; TeX inválido não quebra; sem javascript: (trust desligado); as fontes do KaTeX carregam. Sem fotos.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:5010/pew/simu/");
    await pg.waitForFunction(() => typeof mdLeve === "function" && typeof katex !== "undefined", null, { timeout: 30000 });
    const md = (t) => pg.evaluate((x) => mdLeve(x), t);
    let h = await md("O PI de corrente:\n\n$$G(s) = k_p + \\frac{k_i}{s}$$\n\ncom $k_p = \\omega_c L$ e \\(k_i = k_p R / L\\); em destaque também \\[ \\hat I = \\frac{2P}{3\\hat V} \\]");
    ok((h.match(/katex-display/g) || []).length === 2 && /mfrac/.test(h) && (h.match(/class="katex"/g) || []).length === 4 && !/\$\$|\\frac/.test(h.replace(/<annotation[\s\S]*?<\/annotation>/g, "")),
       `destaque ($$…$$ e \\[…\\]) e na linha ($…$ e \\(…\\)): ${(h.match(/katex-display/g) || []).length} em destaque, ${(h.match(/class="katex"/g) || []).length} equações`);
    h = await md("mude `$Ra` e $Ra e $Rf para 0,15; custa $5 e $10; ```py\nx = '$a$'\n```");
    ok(!/class="katex/.test(h) && /\$Ra e \$Rf/.test(h) && /\$5 e \$10/.test(h) && /<code>\$Ra<\/code>/.test(h) && /<pre><code>x = '\$a\$'<\/code><\/pre>/.test(h),
       `parâmetros do Gecko, dinheiro e código não viram equação: ${h.slice(0, 160)}…`);
    h = await md("**negrito** com $x^2$ e <script>alert(1)</script>");
    ok(/<b>negrito<\/b>/.test(h) && /class="katex"/.test(h) && !/<script>/.test(h) && /&lt;script&gt;/.test(h), "negrito, equação e o resto escapado (sem <script>)");
    h = await md("inválido: $\\frac{1}{$ e $\\href{javascript:alert(1)}{x}$ fim");
    ok(/katex-error|class="katex"/.test(h) && !/href="javascript/.test(h) && /fim/.test(h), `TeX inválido e \\href: sem quebrar e sem javascript: (${(h.match(/katex-error/g) || []).length} em vermelho)`);
    // os blocos do markdown (Marcelo, 20/10: a resposta vinha com "## título" e a tabela crua) — o trecho da resposta dele
    const RESP = "## O ponto estrutural, com a conta\n\nHoje cada célula calcula `m = (v_braço/N)/v_c` — ou seja, a **mesma tensão**.\n\n" +
      "| | célula fraca | célula 2 | célula 3 | soma |\n|---|---|---|---|---|\n| v_c | 88 V | 206 V | 213 V | **507 V** |\n" +
      "| pedido hoje (fatia igual) | 100 V → m = **1,14** ❌ | 100 V → m = 0,49 | 100 V → m = 0,47 | 300 V |\n" +
      "| pedido certo (m igual) | 52 V → m = 0,59 ✅ | 122 V → m = 0,59 | 126 V → m = 0,59 | 300 V |\n\n" +
      "Com `m` igual nas três, ninguém satura.\n\n- (a) sem mexer na arquitetura\n- (b) liberar UMA mensagem\n  entre os vizinhos\n\n1. um\n2. dois\n\n" +
      "> para registro: o artigo usa a mesma lei\n\n---\n\n### E a decisão é sua\n\n*recomendo* (b), com $m_k = v_k / \\bar v_c$ e a coluna à direita:\n\n| a | b |\n|:--|--:|\n| 1 | $x^2$ |";
    h = await md(RESP);
    const r = await pg.evaluate((html) => { const d = document.createElement("div"); d.innerHTML = html;
      const tabs = [...d.querySelectorAll("table")];
      return { h2: (d.querySelector(".md-h2") || {}).textContent, h3: (d.querySelector(".md-h3") || {}).textContent,
        th: tabs[0] ? tabs[0].querySelectorAll("th").length : 0, tr: tabs[0] ? tabs[0].querySelectorAll("tbody tr").length : 0,
        cel: tabs[0] ? tabs[0].querySelector("tbody tr:nth-child(2) td:nth-child(2)").innerHTML : "",
        ul: [...d.querySelectorAll("ul li")].map((x) => x.innerHTML), ol: d.querySelectorAll("ol li").length, bq: (d.querySelector("blockquote") || {}).textContent,
        hr: d.querySelectorAll("hr").length, it: (d.querySelector("i") || {}).textContent, tex: d.querySelectorAll(".katex").length,
        alinha: tabs[1] ? [...tabs[1].querySelectorAll("td")].map((x) => x.style.textAlign) : [], cru: /\|---|##/.test(d.textContent) }; }, h);
    ok(r.h2 === "O ponto estrutural, com a conta" && r.h3 === "E a decisão é sua" && r.th === 5 && r.tr === 3 && /<b>1,14<\/b> ❌/.test(r.cel)
       && r.ul.length === 2 && /entre os vizinhos/.test(r.ul[1]) && r.ol === 2 && /artigo usa/.test(r.bq) && r.hr === 1 && r.it === "recomendo"
       && r.tex === 2 && r.alinha.join() === "left,right" && !r.cru,
       `markdown: títulos (${r.h2} | ${r.h3}), tabela ${r.th} colunas × ${r.tr} linhas (célula "${r.cel}"), listas ${r.ul.length} + ${r.ol}, citação, linha, itálico, ${r.tex} equações, alinhamento ${r.alinha.join("/")}; nada cru`);
    // letras acentuadas no índice (Marcelo, 20/10: Î_{braço} saía "brao"/"braϕo"): como texto dentro da equação
    h = await md("$\\hat I_{braço} = \\tfrac12(\\hat I_{fus,u} + \\hat I_{fus,l})$ e $P_{média}$");
    const ac = await pg.evaluate((html) => { const d = document.createElement("div"); d.innerHTML = html;
      const txt = [...d.querySelectorAll(".katex-html")].map((x) => x.textContent).join(" | ");
      return { txt, erro: d.querySelectorAll(".katex-error").length, barra: txt.includes("\\c"), texto: [...d.querySelectorAll(".katex-html .text")].map((x) => x.textContent.replace(/[\u200b]/g, "")) }; }, h);
    // o KaTeX desenha o ç do modo texto como c + cedilha posta por cima (o texto do DOM é "c¸"; na tela, ç). Antes, no modo de
    // equação, o acento saía como "\c" literal
    ok(!ac.barra && !ac.erro && ac.texto.some((x) => /^bra.+o$/.test(x)) && ac.texto.some((x) => /^m.+dia$/.test(x)),
       `acentos no índice como texto ("${ac.texto.join('", "')}"), sem o "\\c" literal de antes`);
    // na conversa: as fontes do KaTeX carregam (servidas de static/katex)
    const fontes = await pg.evaluate(async () => {
      const d = document.createElement("div"); d.id = "teste-tex"; d.innerHTML = mdLeve("$$\\sum_{k=1}^{N} v_{c,k} = V_{dc}$$");
      d.style.cssText = "position:fixed;left:200px;top:200px;z-index:9999;background:#fff;padding:8px"; document.body.appendChild(d);   // à vista (fonte de elemento escondido não carrega)
      try { await document.fonts.load("16px KaTeX_Main"); await document.fonts.load("16px KaTeX_Math"); } catch (e) { /* ok */ }
      await document.fonts.ready; await new Promise((r) => setTimeout(r, 300));
      const r = { main: document.fonts.check("16px KaTeX_Main"), math: document.fonts.check("16px KaTeX_Math"),
        carregadas: [...document.fonts].filter((f) => f.family.includes("KaTeX") && f.status === "loaded").map((f) => f.family) };
      d.remove(); return r; });
    ok(fontes.carregadas.length >= 1 && fontes.main, `fontes do KaTeX carregadas: ${[...new Set(fontes.carregadas)].join(", ")}`);
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
