// O markdown leve das respostas da IA do MaiSim, com equações (KaTeX): o mesmo no circuito (claude_chat.js,
// claude_contextos.js) e nos scripts (script_ia.js). Carregar depois de static/katex/katex.min.js.
const escMd = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// uma equação em LaTeX, formatada pelo KaTeX (static/katex; Marcelo, 20/10: "o Claude do MaiSim apresentar as equações
// formatadas"); sem o KaTeX (não carregou), o TeX como código; TeX inválido sai em vermelho, sem quebrar a conversa
function tex(src, destaque) {
  if (typeof katex === "undefined") return `<code>${escMd(src)}</code>`;
  // letras acentuadas (v_{braço}, P_{média}) no modo de equação somem ou trocam de glifo no KaTeX ("\c" literal): a palavra
  // inteira vai como texto, em pé, como um índice em palavra deve ficar — \text{braço}
  const fonte = src.replace(/(?<![\\A-Za-z])[A-Za-z]*[\u00C0-\u024F][A-Za-z\u00C0-\u024F]*/g, (m) => `\\text{${m}}`);
  // sem as quebras de linha: o KaTeX desenha o √ (e chaves e setas largas) em SVG, com o caminho em várias linhas, e o
  // markdown leve troca cada quebra por <br> — o caminho quebrado não desenha nada e "3√3/π" aparecia "3 3/π"
  try { return katex.renderToString(fonte, { displayMode: destaque, throwOnError: false, output: "html", strict: "ignore", trust: false }).replace(/\n/g, " "); }
  catch (e) { return `<code>${escMd(src)}</code>`; }
}
// um markdown leve (o que o Claude costuma usar): blocos de código, `código`, **negrito**, listas e parágrafos; tudo escapado.
// Equações: $$…$$ e \[…\] em destaque, $…$ e \(…\) na linha — fora do código; "$Ra e $Rf" (parâmetros do Gecko) não é
// equação: o $ de abrir vem colado ao que segue, o de fechar colado ao que vem antes e sem letra ou número depois
function mdLeve(txt) {
  const partes = String(txt || "").split(/```[a-zA-Z]*\n?/);
  return partes.map((p, i) => {
    if (i % 2) return `<pre><code>${escMd(p.replace(/\n$/, ""))}</code></pre>`;
    const guard = [], poe = (html) => `\u0000${guard.push(html) - 1}\u0000`;
    p = p.replace(/`([^`\n]+)`/g, (_, c) => poe(`<code>${escMd(c)}</code>`))
      .replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, a, b) => poe(tex((a || b).trim(), true)))
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, a) => poe(tex(a.trim(), false)))
      .replace(/(^|[^\\$\w])\$(?=[^\s$])([^$\n]*?[^\s$\\])\$(?![\w$])/g, (_, ant, a) => ant + poe(tex(a, false)));
    const volta = (h) => h.replace(/\u0000(\d+)\u0000/g, (_, k) => guard[+k]);
    return blocosMd(p, (t) => volta(escMd(t).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")));
  }).join("");
}
// os blocos do markdown (Marcelo, 20/10: as respostas vinham com "## título" e tabelas "| a | b |" cruas): títulos, tabelas
// (com alinhamento), listas (- * + e 1.), citações (>), linha (---) e parágrafos (uma quebra = <br>); inl() faz a linha
function blocosMd(p, inl) {
  const L = p.split("\n"), out = [];
  const tabela = (l) => /^\s*\|.*\|\s*$/.test(l) || /^\s*[^|]+\|[^|]/.test(l) && /\|/.test(l);
  const separador = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && /-/.test(l);
  const celulas = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/, titulo = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/, linha = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
  let i = 0;
  const outroBloco = (l) => !l.trim() || titulo.test(l) || linha.test(l) || item.test(l) || /^\s*>/.test(l);
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(titulo))) { out.push(`<div class="md-h md-h${Math.min(m[1].length, 4)}">${inl(m[2])}</div>`); i++; continue; }
    if (linha.test(l)) { out.push("<hr>"); i++; continue; }
    if (tabela(l) && i + 1 < L.length && separador(L[i + 1])) {
      const cab = celulas(l), al = celulas(L[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : /^:/.test(c) ? "left" : ""));
      const st = (k) => (al[k] ? ` style="text-align:${al[k]}"` : "");
      let h = `<div class="md-tab"><table><thead><tr>${cab.map((c, k) => `<th${st(k)}>${inl(c)}</th>`).join("")}</tr></thead><tbody>`;
      i += 2;
      while (i < L.length && L[i].trim() && /\|/.test(L[i])) {
        const cs = celulas(L[i]); h += `<tr>${cab.map((_, k) => `<td${st(k)}>${inl(cs[k] || "")}</td>`).join("")}</tr>`; i++;
      }
      out.push(h + "</tbody></table></div>"); continue;
    }
    if ((m = l.match(item))) {
      const ord = /\d/.test(m[2]), base = m[1].length, itens = [];
      while (i < L.length && (m = L[i].match(item)) && /\d/.test(m[2]) === ord) {
        let txt = m[3], sub = m[1].length > base; i++;
        while (i < L.length && L[i].trim() && !outroBloco(L[i]) && /^\s+/.test(L[i])) { txt += "\n" + L[i].trim(); i++; }   // continuação
        itens.push(`<li${sub ? ' class="md-sub"' : ""}>${inl(txt).replace(/\n/g, "<br>")}</li>`);
      }
      out.push(ord ? `<ol>${itens.join("")}</ol>` : `<ul>${itens.join("")}</ul>`); continue;
    }
    if (/^\s*>/.test(l)) {
      const q = []; while (i < L.length && /^\s*>/.test(L[i])) { q.push(L[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(`<blockquote>${blocosMd(q.join("\n"), inl)}</blockquote>`); continue;
    }
    const par = [l]; i++;
    while (i < L.length && !outroBloco(L[i]) && !(tabela(L[i]) && i + 1 < L.length && separador(L[i + 1]))) { par.push(L[i]); i++; }
    out.push(`<p>${inl(par.map((x) => x.trim()).join("\n")).replace(/\n/g, "<br>")}</p>`);
  }
  return out.join("");
}
