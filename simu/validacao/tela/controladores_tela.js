// vários controladores pela tela (instância de teste 5010 → 8768), com o PI do exemplo (congelado em validacao/dados).
// Arquivo novo é um módulo (19/10); "virar controlador" o põe a rodar à parte (o nome é o do arquivo) e o controle.py entra
// na lista; na coluna "arquivos", embaixo de cada arquivo, o
// que ele lê (ou todas) e o que escreve (um dono só por atuação); rede; medidas do arquivo aberto; erro na aba certa;
// "testar" com os dois; a proposta do Claude vai para o controle.py; uma rodada; renomear e apagar (levam o controlador).
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const PI = require("os").homedir() + "/.cache/pew_simu_teste/pew/exemplo_controle_pi.ipes";
const AQ = 'def passo(t, m, p, e):\n    envia("controle", {"i": m["i_L"]})\n';
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:5010/pew/simu/?modelo=" + encodeURIComponent(PI));
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-extra, .modal .m-ok"); await pg.waitForTimeout(800); }
    await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
    await pg.evaluate(async (pi) => { novoEstado(await api("editor/abrir", { arq: pi, modo: "descartar" }));   // o exemplo como está no arquivo (não o de trabalho)
      await recarregaControle(); sim.par.dt = "1e-6"; sim.par.tfim = "0.01"; sim.par.nome = "controladores_tela"; sim.par.amostras = "4000"; }, PI);
    await pg.click("#bt-ctl");
    await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    const abas = () => pg.evaluate(() => [...document.querySelectorAll("#ctl-abas .aba[data-arq]")].map((x) => x.dataset.arq + (x.classList.contains("ativa") ? "*" : "")));
    const cfg = async () => (await pg.evaluate(() => api("editor/controle"))).controle;
    const vis = () => pg.evaluate(() => [$("ctl-v-var").hidden, $("ctl-v-arq").hidden]);
    ok(JSON.stringify(await abas()) === '["controle.py*"]' && await pg.$("#ctl-arq-novo") && JSON.stringify(await vis()) === "[false,true]",
      `abas: ${await abas()} e o +; a coluna começa em variáveis`);
    await pg.click('#ctl-vistas [data-vista="arq"]'); await pg.waitForTimeout(300);
    ok(/lê todas as medidas e escreve as atuações marcadas/.test(await pg.textContent("#ctl-ctls")), "só o controle.py: \"lê todas as medidas e escreve as atuações marcadas (o de sempre)\"");
    // + (novo arquivo) nasce MÓDULO (19/10); "virar controlador" o põe a rodar à parte, e o controle.py de sempre entra na lista lendo todas
    await pg.click("#ctl-arq-novo2"); await pg.waitForSelector(".modal input[name=nome]"); await pg.fill(".modal input[name=nome]", "aquisicao"); await pg.click(".modal .m-ok");
    await pg.waitForTimeout(1500);
    let c = await cfg();
    const mod = await pg.evaluate(() => (document.querySelector('#ctl-ctls [data-liga="aquisicao.py"]') || {}).closest && document.querySelector('#ctl-ctls [data-liga="aquisicao.py"]').closest(".ctl-no").title);   // a linha do módulo na árvore (19/10)
    ok(!c.controladores.length && /módulo · import aquisicao/.test(mod || ""), `+ arquivo aquisicao.py nasce módulo ("${(mod || "").trim().slice(0, 40)}…"), sem controladores`);
    await pg.click('#ctl-ctls [data-liga="aquisicao.py"]'); await pg.waitForTimeout(1500);
    c = await cfg();
    ok(JSON.stringify(await abas()) === '["controle.py","aquisicao.py*"]' && JSON.stringify(c.controladores.map((q) => [q.nome, q.arquivo, q.todas, q.atuacoes.join()]))
      === '[["controle","controle.py",true,"u_ctrl"],["aquisicao","aquisicao.py",false,""]]',
      `virar controlador: aba aberta e controladores ${c.controladores.map((q) => `${q.nome} (lê ${q.todas ? "todas" : q.medidas}; escreve ${q.atuacoes})`).join(" · ")}`);
    await pg.evaluate((t) => ctl.modelos["aquisicao.py"].setValue(t), AQ); await pg.waitForTimeout(1500);
    ok((await cfg()).arquivos["aquisicao.py"] === AQ, "o código da aba nova foi guardado no servidor");
    const arv = await pg.evaluate(() => [...document.querySelectorAll("#ctl-ctls .ctl-no")].map((x) => x.dataset.abre + (x.classList.contains("ativo") ? "*" : "")));
    ok(JSON.stringify(arv) === '["controle.py","aquisicao.py*"]' && await pg.$$eval("#ctl-ctls .ctl-ctl", (r) => r.length) === 2, `a árvore: ${arv}, um cartão embaixo de cada`);
    // aquisicao lê i_L; o controle deixa de ler "todas" (começa com todas marcadas); o i_L dele fica travado enquanto o código
    // dele lê m["i_L"] (o cartão segue o código, 19/10) — sai depois, quando ele passa a receber pela rede
    const card = (n) => `#ctl-ctls .ctl-ctl[data-nome="${n}"]`;
    const abre = (s) => pg.evaluate((s) => document.querySelectorAll(s).forEach((d) => { d.open = true; }), s);
    await abre(`${card("aquisicao")} details[data-g="le"], ${card("controle")} details[data-g="le"]`);
    await pg.check(`${card("aquisicao")} [data-med="i_L"]`); await pg.waitForTimeout(1200);
    await pg.uncheck(`${card("controle")} [data-todas]`); await pg.waitForTimeout(1200);
    const marcadas = await pg.evaluate((s) => [...document.querySelectorAll(`${s} [data-med]`)].filter((x) => x.checked).map((x) => x.dataset.med), card("controle"));
    const caixa = (s, sel) => pg.evaluate(([s, sel]) => { const x = document.querySelector(`${s} ${sel}`); return x && { dis: x.disabled, on: x.checked, dica: x.parentElement.title }; }, [s, sel]);
    const travaIL = await caixa(card("controle"), '[data-med="i_L"]');
    c = await cfg();
    const aberto = await pg.evaluate((s) => document.querySelector(`${s} details[data-g="le"]`).open, card("controle"));
    ok(c.controladores[1].medidas.join() === "i_L" && !c.controladores[0].todas && c.controladores[0].medidas.includes("i_L") && marcadas.includes("i_L") && aberto
       && travaIL.dis && travaIL.on && /o código do controle lê i_L/.test(travaIL.dica),
      `aquisicao lê ${c.controladores[1].medidas}; controle: tirar "todas" marca todas (${marcadas}); o i_L dele travado ("${travaIL.dica}"); a lista fica aberta`);
    // escreve: o código do controle devolve u_ctrl → no controle, marcado e travado; na aquisicao, travado fora (um dono só)
    await abre(`${card("aquisicao")} details[data-g="esc"], ${card("controle")} details[data-g="esc"]`);
    const uc = await caixa(card("controle"), '[data-atu-ctl="u_ctrl"]'), ua = await caixa(card("aquisicao"), '[data-atu-ctl="u_ctrl"]');
    ok(uc.dis && uc.on && ua.dis && !ua.on && /o código do controle escreve u_ctrl \(cada atuação tem um dono só\)/.test(ua.dica),
      `escreve u_ctrl: no controle, marcado e travado (o código escreve); na aquisicao, travado fora ("${ua.dica}")`);
    const rede = await pg.evaluate(() => $("ctl-rede-i").getAttribute("title") || $("ctl-rede-i").dataset.dica);
    ok(await pg.isVisible("#ctl-rede") && /amostra seguinte/.test(rede), `rede (na dica do i): ${rede}`);
    // o controle.py recebe pela rede
    await pg.click('#ctl-abas .aba[data-arq="controle.py"]'); await pg.waitForTimeout(300);
    await pg.evaluate(() => ctl.modelos["controle.py"].setValue(ctl.modelos["controle.py"].getValue().replace('e["integral"] = 0.0', 'e["integral"] = 0.0\n    e["i"] = 0.0')
      .replace('    erro = p["i_ref"] - m["i_L"]', '    for msg in recebe():\n        e["i"] = msg["dados"]["i"]\n    erro = p["i_ref"] - e["i"]')));
    await pg.waitForTimeout(1500);
    const pn = await pg.evaluate(() => api("editor/controle"));
    ok(!pn.conferencia.length && !pn.erros.length, `controle.py sem avisos (não lê mais m["i_L"]): ${JSON.stringify(pn.conferencia.map((x) => x.msg))}`);
    // sem m["i_L"] no código do controle, o i_L dele destrava: desmarcar tira; a tabela das medidas diz quem lê: i_L só a aquisicao
    await abre(`${card("controle")} details[data-g="le"]`);
    const livre = await caixa(card("controle"), '[data-med="i_L"]');
    await pg.uncheck(`${card("controle")} [data-med="i_L"]`); await pg.waitForTimeout(1500);
    c = await cfg();
    const ent = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll("#ctl-ent tr")].filter((r) => r.querySelector("code"))
      .map((r) => [r.querySelector("code").textContent, r.cells[1].textContent.trim()])));
    ok(!livre.dis && livre.on && !c.controladores[0].medidas.includes("i_L") && ent.i_L === "aquisicao",
      `sem m["i_L"] no código do controle: o i_L destrava, desmarcar tira (${c.controladores[0].medidas}); medidas e quem lê: ${JSON.stringify(ent)}`);
    // erro de sintaxe na aquisição: a aba dela fica vermelha e o marcador vai no modelo dela
    await pg.evaluate(() => ctl.modelos["aquisicao.py"].setValue('def passo(t, m, p, e)\n    pass\n')); await pg.waitForTimeout(1500);
    const er = await pg.evaluate(() => ({ aba: document.querySelector('#ctl-abas .aba[data-arq="aquisicao.py"]').classList.contains("com-erro"),
      marcas: ctl.monaco.editor.getModelMarkers({ resource: ctl.modelos["aquisicao.py"].uri }).length, marcasCtl: ctl.monaco.editor.getModelMarkers({ resource: ctl.modelos["controle.py"].uri }).length,
      estado: $("ctl-estado").textContent }));
    ok(er.aba && er.marcas === 1 && er.marcasCtl === 0 && /aquisicao\.py, linha 1/.test(er.estado), `erro na aquisicao.py: aba vermelha, marcador no arquivo dele (${er.estado})`);
    await pg.evaluate((t) => ctl.modelos["aquisicao.py"].setValue(t), AQ); await pg.waitForTimeout(1500);
    // testar: os dois juntos
    await pg.click("#ctl-testar"); await pg.waitForFunction(() => /teste/.test($("ctl-saida").textContent) && !/testando/.test($("ctl-saida").textContent), null, { timeout: 30000 });
    const sai = await pg.textContent("#ctl-saida");
    ok(/controladores, juntos: controle, aquisicao/.test(sai), `testar: ${sai.split("\n")[0]}`);
    // clique na árvore abre o arquivo no editor
    await pg.click('#ctl-ctls .ctl-no[data-abre="aquisicao.py"]'); await pg.waitForTimeout(300);
    ok((await abas()).includes("aquisicao.py*"), "clique no arquivo da árvore: abre a aba dele");
    // a proposta do Claude vai para o controle.py mesmo com outra aba aberta
    const r = await pg.evaluate(() => { const x = Object.assign({}, ctl.dados.controle, { codigo: codigoAtual() + "\n# do Claude\n" }); poeControle(x);
      return { ativa: ctl.arq, ctlpy: /# do Claude/.test(textoDe("controle.py")), aq: /# do Claude/.test(textoDe("aquisicao.py")) }; });
    ok(r.ctlpy && !r.aq && r.ativa === "controle.py", "aplicar a proposta do Claude com a aba aquisicao.py aberta: vai para o controle.py (e a aba troca para ele)");
    await pg.evaluate(() => { ctl.editor.trigger("t", "undo"); }); await pg.waitForTimeout(1500);
    // uma rodada com os dois (pela tela)
    await pg.evaluate(() => iniciaSim()); await pg.waitForTimeout(1500);
    await pg.waitForFunction(() => !document.body.classList.contains("sim-rodando"), null, { timeout: 120000 });
    const rod = await pg.evaluate(() => api("editor/rodada"));
    ok(rod.estado === "fim", `rodada com aquisição + controle pela tela: ${rod.estado} ${rod.erro || ""} (${rod.amostras} amostras)`);
    // renomear (o controlador acompanha: o nome é o do arquivo) e apagar (leva o controlador); a rodada leva a doca ao scope
    await pg.evaluate(() => mostraDoca("controle")); await pg.waitForTimeout(400);
    await pg.dblclick('#ctl-abas .aba[data-arq="aquisicao.py"]'); await pg.waitForSelector(".modal input[name=nome]");
    await pg.fill(".modal input[name=nome]", "adc.py"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1500);
    c = await cfg();
    ok(JSON.stringify(Object.keys(c.arquivos)) === '["adc.py"]' && c.controladores[1].arquivo === "adc.py" && c.controladores[1].nome === "adc" && c.arquivos["adc.py"] === AQ,
      `renomeado aquisicao.py → adc.py: o controlador vira "adc" (${await abas()})`);
    await pg.click('#ctl-vistas [data-vista="arq"]'); await pg.waitForTimeout(200);
    await pg.click('#ctl-ctls [data-fecha="adc.py"]'); await pg.waitForSelector(".modal .m-ok");   /* apagar: o × da lista (o da aba só fecha) */
    ok(/e o controlador dele/.test(await pg.textContent(".modal")), "apagar adc.py pergunta (leva o controlador junto)");
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(1500);
    c = await cfg();
    ok(!Object.keys(c.arquivos).length && !c.controladores.length && /o de sempre/.test(await pg.textContent("#ctl-ctls")),
      `apagado: o controle.py sozinho volta a ser o de sempre (lista vazia: lê todas, escreve as marcadas)`);
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
