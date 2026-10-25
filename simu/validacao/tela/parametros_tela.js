// os campos dos parâmetros no painel da direita (instância de teste 7200 → 7201), pedido de Marcelo em 24/10: a forma da
// fonte de sinal (SIGNAL, a portadora do PWM) aparecia como o número que o Gecko grava (404); agora é uma lista com os nomes
// (o Gecko grava 402–406: Senoidal, Triangular, Retangular, Aleatória, Importada), e escolher grava o código certo (Ctrl+Z
// volta); os sim/não do Gecko (useExternal, display) são caixinhas; num parâmetro que aceita variável, o $ abre a lista das
// variáveis globais do circuito ("$Vin = 10"), filtrada pelo que vem depois do $ (↑/↓ e Enter, Tab, Esc, clique).
// useExternal (24/10): amplitude, f, offset, fase e d vêm das 5 entradas (a ordem do Gecko): os campos ficam cinza, com a
// nota da entrada; o bloco desenha as entradas onde o Gecko as põe, o ∿ à vista e a etiqueta da saída fora da caixa. O mesmo
// no LIMIT (min e max nas entradas 2 e 3) e no HYS (h na entrada 2; a caixinha dele se chama "external"), criados pelo teste.
// O circuito: exemplos/exemplo_buck.ipes (o SIGNAL.1 é a portadora triangular, typQuelle 403).
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const ARQ = "exemplos/exemplo_buck.ipes";
const abre = () => fetch("http://localhost:7201/maisim/simu/editor/abrir", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ arq: ARQ, modo: "descartar" }) }).then((r) => r.text());
(async () => {
  let b, pg, g0 = null;
  try {
    await abre();
    b = await chromium.launch(); pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(ARQ));
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor && ed.ligado)); k++) {
      if (await pg.$(".modal .m-ok")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    g0 = await pg.evaluate(() => Object.keys(dados.globais || {}));
    const espera = async (f, arg, ms = 30000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await pg.evaluate(f, arg)) return true; await pg.waitForTimeout(300); } return false; };
    const escolhe = async (n, par = "type") => { await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === n)), n);
      await pg.waitForSelector(`#p-params [data-p="${par}"]`, { timeout: 30000 }); };
    const params = () => pg.evaluate(async () => api("editor/params?nome=SIGNAL.1&dom=CONTROL&typ=4"));
    const valor = async (p) => ((await params()).find((q) => q.nome === p) || {}).valor;
    const lista = () => pg.evaluate(() => { const s = document.querySelector('#p-params select[data-p="type"]');
      return s && { v: s.value, txt: s.selectedOptions[0].textContent, ops: [...s.options].map((o) => `${o.value}:${o.textContent}`) }; });

    // 1. a forma do SIGNAL: uma lista, na opção do valor guardado (403 = Triangular); o Gecko diz o tipo e que não aceita $
    await escolhe("SIGNAL.1");
    const lst = await params(), tq = lst.find((q) => q.nome === "type");
    let s = await lista();
    ok(tq && tq.valor === 403 && tq.tipo === "ControlSourceType" && !tq.pode_var, `SIGNAL.1 type: o Gecko guarda ${tq && tq.valor} (${tq && tq.tipo}, variável $: ${tq && tq.pode_var})`);
    ok(s && s.v === "403" && s.txt === "Triangular" && s.ops.join("|") === "402:Senoidal|403:Triangular|404:Retangular|405:Aleatória (ruído)",
      `a lista mostra "${s && s.txt}" (${s && s.ops.join(" · ")})`);
    const caixas = await pg.evaluate(() => ["useExternal", "display"].map((p) => { const i = document.querySelector(`#p-params input[data-p="${p}"]`); return i && `${p}:${i.type}:${i.checked}`; }));
    ok(caixas.join() === "useExternal:checkbox:false,display:checkbox:false", `os sim/não do Gecko são caixinhas: ${caixas.join(", ")}`);
    // 2. escolher Retangular grava 404 (o código que o Gecko guarda); Ctrl+Z volta a 403
    await pg.selectOption('#p-params select[data-p="type"]', "404");
    ok(await espera(async () => ((await api("editor/params?nome=SIGNAL.1&dom=CONTROL&typ=4")).find((q) => q.nome === "type") || {}).valor === 404),
      `Retangular: o Gecko guarda ${await valor("type")}`);
    await pg.waitForFunction(() => { const s = document.querySelector('#p-params select[data-p="type"]'); return s && s.value === "404"; }, null, { timeout: 20000 }).catch(() => {});
    s = await lista();
    const h = await pg.evaluate(() => historico.map((x) => x.t).find((t) => /SIGNAL\.1: type =/.test(t)) || "");
    ok(s && s.txt === "Retangular" && /SIGNAL\.1: type = Retangular/.test(h), `o painel refeito mostra "${s && s.txt}"; no histórico: "${h}"`);
    await pg.evaluate(() => desfazer());
    ok(await espera(async () => ((await api("editor/params?nome=SIGNAL.1&dom=CONTROL&typ=4")).find((q) => q.nome === "type") || {}).valor === 403, null, 60000),
      `Ctrl+Z: volta a ${await valor("type")} (Triangular)`);
    await escolhe("SIGNAL.1"); s = await lista();
    ok(s && s.txt === "Triangular", `e a lista mostra "${s && s.txt}" de novo`);
    // a caixinha grava 1 e 0
    await pg.check('#p-params input[data-p="display"]');
    ok(await espera(async () => ((await api("editor/params?nome=SIGNAL.1&dom=CONTROL&typ=4")).find((q) => q.nome === "display") || {}).valor === 1),
      `marcar display: o Gecko fica com ${await valor("display")}`);
    await pg.waitForSelector('#p-params input[data-p="display"]:checked', { timeout: 20000 }).catch(() => {});
    await pg.uncheck('#p-params input[data-p="display"]');
    ok(await espera(async () => ((await api("editor/params?nome=SIGNAL.1&dom=CONTROL&typ=4")).find((q) => q.nome === "display") || {}).valor === 0),
      `desmarcar: ${await valor("display")}`);

    // 2b. useExternal (Marcelo, 24/10): o Gecko tira amplitude, f, offset, fase e d das 5 entradas (nessa ordem) e ignora os
    // parâmetros: os campos ficam cinza, com a nota da entrada; o bloco ganha as entradas (Gecko: x − 1, y + 2 … y + 6), o ∿
    // continua à vista e a etiqueta da saída fica fora da caixa; nos rótulos dos terminais, "entrada 1 · amplitude"…
    const EXT = ["amplMAX", "f", "offset", "phase", "d"];
    const painelExt = () => pg.evaluate((EXT) => EXT.map((p) => { const i = document.querySelector(`#p-params [data-p="${p}"]`), l = i && i.closest("label");
      return i ? `${p}:${i.disabled ? "cinza" : "livre"}:${((l.querySelector(".nota-ext") || {}).textContent || "")}` : `${p}:?`; }), EXT);
    const desenhoExt = () => pg.evaluate(() => {
      const f = dados.folhas["0"], i = f.elementos.findIndex((x) => x.nome === "SIGNAL.1"), e = f.elementos[i], g = document.querySelector(`#svg g.el[data-i="${i}"]`);
      if (!g) return null;
      const bb = (n) => n.getBoundingClientRect(), cruza = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const caixa = bb(g.querySelector(".corpo")), simb = g.querySelector(".simbolo"), sb = simb && bb(simb), nome = e.saidas[0];
      // a etiqueta da saída: o rótulo e a etiqueta do scope com o nome do sinal (fora da caixa)
      const etq = [...document.querySelectorAll("#svg text, #svg .tag-scope")].filter((n) => !n.closest(".tag-scope") || n.matches(".tag-scope"))
        .filter((n) => (n.textContent || "").trim().endsWith(nome));
      return { entradas: e.entradas.length, bornes: e.terminais.filter((t) => t.lado === "e").map((t) => `${t.x - e.x},${t.y - e.y}`).join(" "),
        simb: simb ? simb.textContent : "", simbDentro: !!sb && sb.left >= caixa.left && sb.right <= caixa.right && sb.top >= caixa.top && sb.bottom <= caixa.bottom,
        simbLivre: !!sb && ![...g.querySelectorAll(".borne, .pino-ext")].some((n) => cruza(bb(n), sb)),
        pinos: [...g.querySelectorAll(".pino-ext")].map((n) => n.textContent).join(" "),
        saida: etq.length, saidaFora: etq.length > 0 && etq.every((n) => !cruza(bb(n), caixa)),
        rotulos: [...document.querySelectorAll("#props [data-in]")].map((n) => n.closest("label").querySelector("span").textContent) };
    });
    await escolhe("SIGNAL.1");
    let ex = await painelExt();
    ok(ex.join() === "amplMAX:livre:,f:livre:,offset:livre:,phase:livre:,d:livre:", `sem useExternal: os cinco campos livres (${ex.join(" ")})`);
    await pg.check('#p-params input[data-p="useExternal"]');
    ok(await espera(async () => ((await api("editor/params?nome=SIGNAL.1&dom=CONTROL&typ=4")).find((q) => q.nome === "useExternal") || {}).valor === 1),
      `marcar useExternal: o Gecko fica com ${await valor("useExternal")}`);
    await espera(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "SIGNAL.1"); return e && e.entradas.length === 5
      && document.querySelector('#p-params input[data-p="useExternal"]:checked') && document.querySelectorAll("#p-params .nota-ext").length === 5; });
    ex = await painelExt();
    ok(ex.join() === "amplMAX:cinza:vem da entrada externa 1,f:cinza:vem da entrada externa 2,offset:cinza:vem da entrada externa 3,phase:cinza:vem da entrada externa 4,d:cinza:vem da entrada externa 5",
      `com useExternal: cinza, com a entrada (${ex.join(" · ")})`);
    let dx = await desenhoExt();
    ok(dx && dx.entradas === 5 && dx.bornes === "-1,2 -1,3 -1,4 -1,5 -1,6", `o bloco ganha as 5 entradas onde o Gecko as põe (${dx && dx.bornes})`);
    ok(dx && dx.simb === "∿" && dx.simbDentro && dx.simbLivre, `o ∿ continua na caixa, sem borne nem nome por cima (${dx && JSON.stringify([dx.simb, dx.simbDentro, dx.simbLivre])})`);
    ok(dx && dx.pinos === "Â f off φ d", `os nomes das entradas junto dos bornes: ${dx && dx.pinos}`);
    ok(dx && dx.saida > 0 && dx.saidaFora, `a etiqueta da saída fica fora da caixa (${dx && dx.saida} etiqueta(s))`);
    ok(dx && dx.rotulos.join("|") === "entrada 1 · amplitude|entrada 2 · frequência|entrada 3 · offset|entrada 4 · fase (°)|entrada 5 · razão cíclica",
      `rótulos dos terminais: ${dx && dx.rotulos.join(" · ")}`);
    // desmarcar volta tudo (e deixa o exemplo como estava)
    await pg.uncheck('#p-params input[data-p="useExternal"]');
    ok(await espera(async () => ((await api("editor/params?nome=SIGNAL.1&dom=CONTROL&typ=4")).find((q) => q.nome === "useExternal") || {}).valor === 0),
      `desmarcar useExternal: o Gecko fica com ${await valor("useExternal")}`);
    await espera(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "SIGNAL.1"); return e && !e.entradas.length
      && document.querySelector('#p-params input[data-p="useExternal"]:not(:checked)') && !document.querySelector("#p-params .nota-ext"); });
    ex = await painelExt(); dx = await desenhoExt();
    ok(ex.join() === "amplMAX:livre:,f:livre:,offset:livre:,phase:livre:,d:livre:" && dx && dx.entradas === 0 && dx.simbDentro && dx.saidaFora && !dx.pinos,
      `sem useExternal de novo: campos livres, sem entradas (${ex.join(" ")}; ${dx && dx.entradas} entradas)`);

    // 2c. o LIMIT e o HYS com useExternal (Marcelo, 24/10): o Gecko tira min e max das entradas 2 e 3 (LimitCalculatorExternal;
    // a 1 é o sinal) e o h da entrada 2 (HysteresisCalculatorExternal); os campos ficam cinza com o número da entrada, as entradas
    // vão para (x − 1, y + 2 …) (setExpanded), com os nomes do Gecko junto do borne (min, max, h) dentro da caixa e sem cobrir o
    // símbolo, e os rótulos dos terminais dizem o que cada uma dá; desmarcar volta tudo. Os blocos são criados aqui e apagados no fim.
    const cmd = (op, ...args) => pg.evaluate(async ([op, args]) => { novoEstado(await api("editor/cmd", { op, args })); }, [op, args]);
    for (const [nome, typ, cx, pars, bornes, pinos, rotulos, x, y] of [
      ["LIMIT.1", 27, "useExternal", ["min", "max"], "-2,0 -1,2 -1,3", "min max", "entrada 1|entrada 2 · mínimo|entrada 3 · máximo", 40, 20],
      ["HYS.1", 11, "external", ["h"], "-2,0 -1,2", "h", "entrada 1|entrada 2 · limiar h", 40, 28]]) {
      const ger = (p) => pg.evaluate(async ([nome, typ, p]) => ((await api(`editor/params?nome=${nome}&dom=CONTROL&typ=${typ}`)).find((q) => q.nome === p) || {}).valor, [nome, typ, p]);
      const painel = () => pg.evaluate((pars) => pars.map((p) => { const i = document.querySelector(`#p-params [data-p="${p}"]`), l = i && i.closest("label");
        return i ? `${p}:${i.disabled ? "cinza" : "livre"}:${((l.querySelector(".nota-ext") || {}).textContent || "")}` : `${p}:?`; }), pars);
      const desenho = () => pg.evaluate((nome) => {
        const f = dados.folhas["0"], i = f.elementos.findIndex((x) => x.nome === nome), e = f.elementos[i], g = document.querySelector(`#svg g.el[data-i="${i}"]`);
        if (!g) return null;
        const bb = (n) => n.getBoundingClientRect(), cruza = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const caixa = bb(g.querySelector(".corpo")), simb = g.querySelector(".simbolo"), pn = [...g.querySelectorAll(".pino-ext")];
        return { entradas: e.entradas.length, bornes: e.terminais.filter((t) => t.lado === "e").map((t) => `${t.x - e.x},${t.y - e.y}`).join(" "),
          pinos: pn.map((n) => n.textContent).join(" "),
          pinosDentro: pn.every((n) => { const r = bb(n); return r.left >= caixa.left && r.right <= caixa.right && r.top >= caixa.top && r.bottom <= caixa.bottom; }),
          simbLivre: !!simb && !pn.some((n) => cruza(bb(n), bb(simb))),
          rotulos: [...document.querySelectorAll("#props [data-in]")].map((n) => n.closest("label").querySelector("span").textContent) };
      }, nome);
      const livre = pars.map((p) => `${p}:livre:`).join(), cinza = pars.map((p, k) => `${p}:cinza:vem da entrada externa ${k + 2}`).join();
      await cmd("CREATE", nome, x, y, nome.split(".")[0]);
      await escolhe(nome, cx);
      let pa = await painel();
      ok(pa.join() === livre, `${nome} sem ${cx}: ${pars.join(", ")} livres (${pa.join(" ")})`);
      await pg.check(`#p-params input[data-p="${cx}"]`);
      ok(await espera(async ([nome, typ, cx]) => ((await api(`editor/params?nome=${nome}&dom=CONTROL&typ=${typ}`)).find((q) => q.nome === cx) || {}).valor === 1, [nome, typ, cx]),
        `${nome}: marcar ${cx}, o Gecko fica com ${await ger(cx)}`);
      await espera(([nome, n, cx]) => { const e = dados.folhas["0"].elementos.find((x) => x.nome === nome); return e && e.entradas.length === n + 1
        && document.querySelector(`#p-params input[data-p="${cx}"]:checked`) && document.querySelectorAll("#p-params .nota-ext").length === n; }, [nome, pars.length, cx]);
      pa = await painel(); let de = await desenho();
      ok(pa.join() === cinza, `${nome} com ${cx}: cinza, com a entrada (${pa.join(" · ")})`);
      ok(de && de.entradas === pars.length + 1 && de.bornes === bornes, `${nome}: as entradas onde o Gecko as põe (${de && de.bornes})`);
      ok(de && de.pinos === pinos && de.pinosDentro && de.simbLivre, `${nome}: "${de && de.pinos}" junto dos bornes, na caixa, sem cobrir o símbolo (${de && JSON.stringify([de.pinosDentro, de.simbLivre])})`);
      ok(de && de.rotulos.join("|") === rotulos, `${nome}: rótulos dos terminais: ${de && de.rotulos.join(" · ")}`);
      await pg.uncheck(`#p-params input[data-p="${cx}"]`);
      ok(await espera(async ([nome, typ, cx]) => ((await api(`editor/params?nome=${nome}&dom=CONTROL&typ=${typ}`)).find((q) => q.nome === cx) || {}).valor === 0, [nome, typ, cx]),
        `${nome}: desmarcar ${cx}, o Gecko fica com ${await ger(cx)}`);
      await espera(([nome, cx]) => { const e = dados.folhas["0"].elementos.find((x) => x.nome === nome); return e && e.entradas.length === 1
        && document.querySelector(`#p-params input[data-p="${cx}"]:not(:checked)`) && !document.querySelector("#p-params .nota-ext"); }, [nome, cx]);
      pa = await painel(); de = await desenho();
      ok(pa.join() === livre && de && de.entradas === 1 && !de.pinos, `${nome} sem ${cx} de novo: livres, uma entrada (${pa.join(" ")}; ${de && de.entradas} entrada(s))`);
      await cmd("DELETE", nome);
    }

    // 3. o $ num parâmetro que aceita variável (f, a frequência): sem variáveis, a dica de criar no $x
    await escolhe("SIGNAL.1");
    const F = '#p-params input[data-p="f"]', A = '#p-params input[data-p="amplMAX"]', CX = (sel) => pg.evaluate((sel) => {
      const c = document.querySelector(sel).closest("label").querySelector(".sug-vars");
      return c && { aberta: c.style.display !== "none", itens: [...c.querySelectorAll(".sug")].map((d) => d.textContent), atual: (c.querySelector(".sug.atual") || {}).textContent || "", dica: (c.querySelector(".mais") || {}).textContent || "" }; }, sel);
    const f0 = await pg.inputValue(F);
    if (!g0.length) {
      await pg.click(F); await pg.keyboard.press("Control+a"); await pg.keyboard.type("$");
      const c = await CX(F);
      ok(c && c.aberta && !c.itens.length && c.dica === "nenhuma variável global ainda — crie no $x", `sem variáveis, o $ mostra: "${c && c.dica}"`);
      await pg.keyboard.press("Escape"); await pg.fill(F, f0);
    } else ok(true, `(o circuito já tem variáveis: ${g0.join(", ")}; a dica de "nenhuma" fica para outra vez)`);
    // duas variáveis, pela API de sempre (o $x)
    await pg.evaluate(async () => { for (const [nome, valor] of [["$Vtela_a", 12], ["$Vtela_b", 3]]) novoEstado(await api("editor/variavel", { acao: "nova", nome, valor, descr: nome })); });
    await escolhe("SIGNAL.1");
    await pg.click(F); await pg.keyboard.press("Control+a"); await pg.keyboard.type("$");
    let c = await CX(F);
    ok(c && c.aberta && c.itens.includes("$Vtela_a= 12") && c.itens.includes("$Vtela_b= 3"), `"$": a lista abre com as variáveis e o valor (${c && c.itens.join(" · ")})`);
    await pg.keyboard.press("Escape"); c = await CX(F);
    ok(c && !c.aberta && (await pg.inputValue(F)) === "$", "Esc fecha a lista (o campo fica com o $)");
    await pg.keyboard.type("Vtela_b"); c = await CX(F);
    ok(c && c.aberta && c.itens.join() === "$Vtela_b= 3", `"$Vtela_b": filtra (${c && c.itens.join(" · ")})`);
    await pg.keyboard.press("Backspace"); await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("ArrowDown"); c = await CX(F);
    ok(c && c.itens.length === 2 && c.atual === "$Vtela_b= 3", `"$Vtela_": as duas; ↓↓ marca "${c && c.atual}"`);
    await pg.keyboard.press("Enter");
    await pg.waitForSelector('#p-params .com-var input.var[data-p="f"]', { timeout: 30000 }).catch(() => {});
    let e = await pg.evaluate(() => { const x = dados.folhas["0"].elementos.find((y) => y.nome === "SIGNAL.1"), i = document.querySelector('#p-params input[data-p="f"]');
      return { var: x.par.frequenz_var, campo: i && i.value, mostra: (i && i.parentElement.querySelector("small") || {}).textContent || "" }; });
    ok(e.var === "$Vtela_b" && e.campo === "$Vtela_b" && /^= 3/.test(e.mostra), `Enter: f ← $Vtela_b (o campo "${e.campo}", ${e.mostra})`);
    // o clique escolhe (amplMAX ← $Vtela_a)
    await pg.click(A); await pg.keyboard.press("Control+a"); await pg.keyboard.type("$Vt");
    c = await CX(A);
    ok(c && c.aberta && c.itens.length === 2, `"$Vt" no amplMAX: ${c && c.itens.join(" · ")}`);
    await pg.locator(A).locator("xpath=ancestor::label").locator(".sug-vars .sug", { hasText: "$Vtela_a" }).click();
    await pg.waitForSelector('#p-params .com-var input.var[data-p="amplMAX"]', { timeout: 30000 }).catch(() => {});
    e = await pg.evaluate(() => dados.folhas["0"].elementos.find((y) => y.nome === "SIGNAL.1").par.amplitudeAC_var);
    ok(e === "$Vtela_a", `clique na lista: amplMAX ← ${e}`);
    // a lista não aparece onde não cabe variável (a forma é uma lista; a caixinha não tem $)
    ok(await pg.evaluate(() => !document.querySelector('#p-params [data-p="type"]').closest("label").querySelector(".sug-vars")
      && !document.querySelector('#p-params [data-p="display"]').closest("label").querySelector(".sug-vars")), "type e display: sem a lista do $");
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally {
    // limpa: o exemplo como estava (sem salvar) e as variáveis que o teste criou
    try {
      await abre();
      if (pg && g0) { const gs = await pg.evaluate(async () => Object.keys((await api("editor/estado")).globais || {}));
        for (const k of gs.filter((k) => !g0.includes(k))) await pg.evaluate(async (k) => api("editor/variavel", { acao: "apaga", nome: k }), k); }
      await abre();
    } catch (e) { console.log("(limpeza: " + e.message + ")"); }
    if (b) await b.close();
  }
  process.exit(falhas ? 1 : 0);
})();
