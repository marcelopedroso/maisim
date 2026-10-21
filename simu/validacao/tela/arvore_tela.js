// a árvore dos arquivos pelos imports e a busca (instância de teste 5010 → 8768), pedido de Marcelo em 19/10 ("a lista já
// está ficando cheia… busca e hierarquia"): o caso dele — controle.py chama leitura → pll → modulacao_smap_1 →
// modulacao_sman_1 → escrita, as duas modulações importam pwm.py, e sobrou um modulacao.py que ninguém importa. Confere a
// ordem do fluxo (a do passo(), não a dos imports), o aninhamento, a repetição "(acima)", o "sem uso", recolher (fica ao
// recarregar), a busca por nome e por texto no código (clique leva à linha) e os botões da barra do mesmo tamanho
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const MOD = (extra = "") => `${extra}def iniciar(p):\n    return {}\n\n\ndef passo(x, p, estado):\n    return x\n`;
// imports numa ordem e chamadas noutra: vale a do passo()
const ORQ = 'import escrita\nimport modulacao_sman_1\nimport leitura\nimport modulacao_smap_1\nimport pll\n\n\ndef iniciar(p, e):\n    pass\n\n\n' +
  'def passo(t, m, p, e):\n    x = leitura.passo(m, p, {})\n    th = pll.passo(x, p, {})   # theta do PLL\n    a = modulacao_smap_1.passo(th, p, {})\n    b = modulacao_sman_1.passo(th, p, {})\n    return escrita.passo({}, p, {})\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("ja")) { localStorage.setItem("pew-simu-ctl-vista", "arq"); localStorage.removeItem("pew-simu-ctl-recolhidos"); localStorage.removeItem("pew-simu-ctl-tabelas"); sessionStorage.setItem("ja", "1"); } } catch (e) { /* ok */ } });
    const pg = await ctx.newPage(); const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    const entra = async () => { await pg.goto("http://localhost:5010/pew/simu/");
      for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); } };
    await entra();
    const monta = async () => { await pg.evaluate(async ([orq, m1, m2]) => {
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: [], parametros: [], acionamentos: [], controladores: [], codigo: orq,
        arquivos: { "leitura.py": m1, "escrita.py": m1, "pll.py": m1, "pwm.py": m1, "modulacao.py": m1, "modulacao_smap_1.py": m2, "modulacao_sman_1.py": m2 } } });
      await recarregaControle(); mostraDoca("controle"); }, [ORQ, MOD(), MOD("import pwm\n\n\n")]);
      await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 }); await pg.waitForTimeout(600); };
    await monta();
    const arvore = () => pg.evaluate(() => [...document.querySelectorAll("#ctl-ctls .ctl-no")].filter((x) => x.getClientRects().length).map((x) => {
      let n = 0, e = x.parentElement; while (e && e.id !== "ctl-ctls") { if (e.classList.contains("ctl-ramo")) n++; e = e.parentElement; }
      return `${"  ".repeat(n)}${x.classList.contains("compartilhado") ? "⇄ " : ""}${x.dataset.abre}${x.classList.contains("repetido") ? " (acima)" : ""}${x.closest(".ctl-soltos") ? " [sem uso]" : ""}${x.closest(".ctl-comp") ? " [compartilhado]" : ""}`; }).join("\n"));
    // o pwm.py, que as duas modulações importam, é compartilhado (19/10): ⇄ nas duas, uma vez na seção (antes: o 1º com
    // os filhos e o 2º "(acima)")
    const esperada = "controle.py\n  leitura.py\n  pll.py\n  modulacao_smap_1.py\n    ⇄ pwm.py\n  modulacao_sman_1.py\n    ⇄ pwm.py\n  escrita.py\npwm.py [compartilhado]\nmodulacao.py [sem uso]";
    let a = await arvore();
    ok(a === esperada, `a árvore na ordem do passo() (não a dos imports):\n${a}`);
    // recolher a modulacao_smap_1 (o pwm some daquele ramo); fica ao recarregar
    await pg.click('#ctl-ctls [data-seta="controle.py/modulacao_smap_1.py"]'); await pg.waitForTimeout(300);
    a = await arvore();
    ok(!/modulacao_smap_1\.py\n    ⇄ pwm\.py\n/.test(a) && /modulacao_smap_1\.py\n  modulacao_sman_1\.py/.test(a), "▾ na modulacao_smap_1: o pwm.py daquele ramo some");
    await entra(); await monta();          // recarregar descarta o circuito novo não salvo da instância de teste: o mesmo controle de novo
    const ar = await arvore();
    ok(/modulacao_smap_1\.py\n  modulacao_sman_1\.py/.test(ar), `recarregado: continua recolhido\n${ar}`);
    await pg.click('#ctl-ctls [data-seta="controle.py/modulacao_smap_1.py"]'); await pg.waitForTimeout(300);
    ok(await arvore() === esperada, "▾ de novo: abre");
    // a seção diz quem usa; clicar num ⇄ realça todas as aparições; o aviso de "importado por dois" sai da lista de avisos
    const usa = await pg.evaluate(() => [...document.querySelectorAll("#ctl-ctls .ctl-usa")].map((x) => x.textContent));
    await pg.click('#ctl-ctls .ctl-ramo .ctl-no.compartilhado[data-abre="pwm.py"] .nome'); await pg.waitForTimeout(300);
    const at = await pg.evaluate(() => ({ n: document.querySelectorAll('#ctl-ctls .ctl-no.ativo[data-abre="pwm.py"]').length, arq: ctl.arq, av: $("ctl-avisos").innerText }));
    ok(JSON.stringify(usa) === '["usado por modulacao_smap_1, modulacao_sman_1"]' && at.arq === "pwm.py" && at.n === 3 && !/cada controlador tem a sua cópia/.test(at.av),
      `compartilhado: "${usa}"; clicar abre o pwm.py e realça as ${at.n} aparições; sem o aviso de "importado por dois" (o de sem uso continua)`);
    // clicar abre o arquivo
    await pg.click('#ctl-ctls .ctl-no[data-abre="pll.py"] .nome'); await pg.waitForTimeout(300);
    ok(await pg.evaluate(() => ctl.arq) === "pll.py", "clicar no pll.py: abre no editor");
    // busca: por nome e por texto no código
    await pg.fill("#ctl-arq-busca", "pwm"); await pg.waitForTimeout(300);
    const r = await pg.evaluate(() => ({ arv: !$("ctl-ctls").hidden, arqs: [...document.querySelectorAll("#ctl-busca-res .ctl-no")].map((x) => x.dataset.abre),
      linhas: [...document.querySelectorAll("#ctl-busca-res [data-vai]")].map((x) => x.dataset.vai) }));
    ok(!r.arv && r.arqs.join() === "pwm.py" && r.linhas.sort().join() === "modulacao_sman_1.py:1,modulacao_smap_1.py:1", `busca "pwm": arquivo ${r.arqs}; no código ${r.linhas.join(", ")}; a árvore some`);
    await pg.fill("#ctl-arq-busca", "theta do pll"); await pg.waitForTimeout(300);
    await pg.click('#ctl-busca-res [data-vai="controle.py:14"]'); await pg.waitForTimeout(400);
    const pos = await pg.evaluate(() => ({ arq: ctl.arq, linha: ctl.editor.getPosition().lineNumber }));
    ok(pos.arq === "controle.py" && pos.linha === 14, `busca "theta do pll" (maiúscula ou não): clicar leva a controle.py, linha ${pos.linha}`);
    await pg.press("#ctl-arq-busca", "Escape"); await pg.waitForTimeout(200);
    ok(await arvore() === esperada && await pg.evaluate(() => $("ctl-busca-res").hidden), "Esc na busca: a árvore volta");
    // os botões da barra do código: a mesma altura, numa linha só
    const bt = await pg.evaluate(() => [...document.querySelectorAll("#ctl-barra > button")].filter((x) => x.offsetParent).map((x) => Math.round(x.getBoundingClientRect().height)));
    ok(bt.length >= 5 && bt.every((h) => h === 26), `botões da barra: ${bt.join(", ")} px de altura`);
    // controladores + "sem uso" (o caso do Marcelo, 19/10): o redesenho quebrava ("Cannot read properties of null (reading
    // 'dataset')": o "sem uso" é um <details> aberto sem cartão) — e o guardar dizia que falhou, e a árvore ficava velha
    const ORQ2 = 'import leitura\nimport pll\n\n\ndef iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    x = leitura.passo(m, p, {})\n    th = pll.passo(x, p, {})\n    return {}\n';
    const CTL = (imp) => `import ${imp}\n\n\ndef iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    return {}\n`;
    await pg.evaluate(async ([orq, m1, b, c]) => {
      await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: [], parametros: [], acionamentos: [], codigo: orq,
        controladores: [{ nome: "controle", arquivo: "controle.py", todas: true, medidas: [], atuacoes: [], subcircuitos: [] },
                        { nome: "dsp_b", arquivo: "dsp_b.py", todas: false, medidas: [], atuacoes: [], subcircuitos: [] }],
        arquivos: { "leitura.py": m1, "pll.py": m1, "pwm.py": m1, "solto.py": m1, "dsp_b.py": b, "dsp_c.py": c } } });
      await recarregaControle(); }, [ORQ2, MOD(), CTL("pwm"), CTL("leitura")]);
    await pg.waitForTimeout(600);
    const g = await pg.evaluate(async () => { let quebrou = ""; try { desenhaLigacoes(); desenhaLigacoes(); } catch (e) { quebrou = e.message; }
      return { quebrou, ok: await guardaControle(), estado: $("ctl-estado").textContent }; });
    a = await arvore();
    ok(!g.quebrou && g.ok && a === "controle.py\n  leitura.py\n  pll.py\ndsp_b.py\n  pwm.py\ndsp_c.py [sem uso]\n  leitura.py (acima) [sem uso]\nsolto.py [sem uso]",
      `com controladores e "sem uso": redesenha sem quebrar (${g.quebrou || "ok"}), guarda (${g.estado}) e a árvore:\n${a}`);
    // o +/− do cartão (19/10): esconde e mostra só o cartão; a seta continua recolhendo os códigos; não abre o arquivo
    const arq0 = await pg.evaluate(() => ctl.arq);
    const cartao = () => pg.evaluate(() => { const c = document.querySelector('#ctl-ctls .ctl-ctl[data-nome="dsp_b"]');
      return { visivel: !!c && c.getClientRects().length > 0, bt: document.querySelector('#ctl-ctls [data-card="dsp_b.py"]').textContent,
        pwm: [...document.querySelectorAll('#ctl-ctls .ctl-ramo .ctl-no[data-abre="pwm.py"]')].some((x) => x.getClientRects().length > 0) }; });
    const c0 = await cartao();
    await pg.click('#ctl-ctls [data-card="dsp_b.py"]'); await pg.waitForTimeout(300);
    const c1 = await cartao();
    await pg.evaluate(() => desenhaLigacoes()); await pg.waitForTimeout(200);
    const c2 = await cartao();
    await pg.click('#ctl-ctls [data-card="dsp_b.py"]'); await pg.waitForTimeout(300);
    const c3 = await cartao();
    ok(c0.visivel && c0.bt === "−" && !c1.visivel && c1.bt === "+" && c1.pwm && !c2.visivel && c3.visivel && c3.bt === "−" && await pg.evaluate(() => ctl.arq) === arq0,
      `+/− do cartão: − esconde (o pwm.py embaixo continua), fica escondido ao redesenhar, + mostra; não abre o arquivo`);
    await pg.evaluate(async () => { localStorage.removeItem("pew-simu-ctl-cartoes"); await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
