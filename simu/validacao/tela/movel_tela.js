// o MaiSim no celular (/movel.html), na instância de teste 7200, num celular de toque (412 × 915): o Início com os circuitos do
// servidor; abrir um exemplo mostra o próprio editor em tela cheia (?movel=1, sem cabeçalho nem painéis); tocar numa peça sobe o
// painel dela de baixo SEM dar foco a campo nenhum (o teclado não pode subir sozinho); dois dedos dão zoom; o ▶ roda com o
// andamento em cima e leva ao scope (o próprio scope, ?movel=1); Controle e IA são o mesmo editor noutra vista; a ⚙ abre sem foco
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, locale: "pt-BR" });
    await ctx.addInitScript(() => { try { localStorage.setItem("maisim-lingua", "pt"); } catch (e) { /* ok */ } });
    const pg = await ctx.newPage(), erros = [];
    pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto("http://localhost:7200/movel.html", { waitUntil: "load" }); await pg.waitForTimeout(1500);
    const exemplos = await pg.locator("#l-exemplos .linha").count();
    ok(exemplos >= 5, `Início: ${exemplos} exemplos do servidor na lista`);
    ok(await pg.locator('.aba[data-tab="circuito"]').isDisabled(), "sem circuito aberto, a aba Circuito fica apagada");
    // a versão e o Atualizar no Início (o mesmo do trilho do PC); no Android, a pasta do ARM, com o botão Atualizar
    await pg.waitForFunction(() => /MaiSim \d/.test(document.getElementById("atu-v").textContent), null, { timeout: 8000 }).catch(() => {});
    ok(/MaiSim \d/.test(await pg.locator("#atu-v").textContent()) && await pg.locator("#atu-bt").isVisible(), `Início: a versão (${await pg.locator("#atu-v").textContent()} · ${await pg.locator("#atu-s").textContent()}) e o botão`);
    await pg.route("**/maisim/simu/atualizacao", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ versao: "0.3.8-rc4", tipo: "pasta", canal: "teste", verificado: 1, sem_rede: false, nova: { versao: "0.3.8-rc5", notas: "", pagina: "", pre: true }, aplicando: null, git: false }) }));
    await pg.locator('.aba[data-tab="scope"]').tap(); await pg.waitForTimeout(300); await pg.locator('.aba[data-tab="inicio"]').tap(); await pg.waitForTimeout(800);
    ok(/Android/.test(await pg.locator("#atu-s").textContent()) && /0\.3\.8-rc5/.test(await pg.locator("#atu-s").textContent()) && await pg.locator("#atu-bt").textContent() === "Atualizar",
      `no Android, com versão nova: "${await pg.locator("#atu-s").textContent()}" e o botão "${await pg.locator("#atu-bt").textContent()}"`);
    await pg.unroute("**/maisim/simu/atualizacao");
    // o manifesto do app do celular (instalável: abre direto no /movel.html)
    const cdp = await ctx.newCDPSession(pg), man = await cdp.send("Page.getAppManifest"), m = man.data ? JSON.parse(man.data) : {};
    ok(m.start_url && /\/movel\.html$/.test(m.start_url) && m.display === "standalone", `manifesto do celular: start_url ${m.start_url}, ${m.display}`);

    // abrir o exemplo_buck: o editor do simu no iframe, em tela cheia
    await pg.locator("#l-exemplos .linha", { hasText: "exemplo_buck" }).first().tap();
    let simu = null;
    for (let k = 0; k < 60 && !simu; k++) { await pg.waitForTimeout(500); simu = pg.frames().find((f) => /\/maisim\/simu\/\?movel=1/.test(f.url())); }
    const descarta = pg.frameLocator("#f-simu").locator(".modal button", { hasText: "Descartar" });
    await pg.waitForTimeout(2500); if (await descarta.count()) { await descarta.first().tap(); await pg.waitForTimeout(3000); }
    for (let k = 0; k < 40; k++) { if (/elementos/.test(await pg.locator("#sub").textContent())) break; await pg.waitForTimeout(500); }
    ok(/editando · \d+ elementos/.test(await pg.locator("#sub").textContent()), `aberto: "${await pg.locator("#sub").textContent()}"`);
    const vista = await simu.evaluate(() => ({ cls: document.body.className, cab: getComputedStyle(document.querySelector("header")).display,
      paleta: getComputedStyle(document.getElementById("paleta")).display, els: document.querySelectorAll("#svg g.el").length, h: document.getElementById("svg").getBoundingClientRect().height }));
    ok(/\bmovel\b/.test(vista.cls) && /vm-circuito/.test(vista.cls) && vista.cab === "none" && vista.paleta === "none" && vista.els > 5 && vista.h > 500,
      `o editor em tela cheia: ${vista.els} peças, sem cabeçalho (${vista.cab}) nem paleta (${vista.paleta}), desenho com ${Math.round(vista.h)} px`);

    // tocar numa peça: o painel sobe de baixo e nenhum campo ganha foco
    await pg.frameLocator("#f-simu").locator('#svg g.el[data-i="0"]').tap({ force: true }); await pg.waitForTimeout(1200);
    const painel = await simu.evaluate(() => { const p = document.getElementById("props"), r = p.getBoundingClientRect(), a = document.activeElement;
      return { cls: document.body.className, vis: getComputedStyle(p).display, base: Math.round(innerHeight - r.bottom), alto: Math.round(r.height), foco: a ? a.tagName + (a.type ? ":" + a.type : "") : "", campos: p.querySelectorAll("input").length }; });
    ok(/mv-props/.test(painel.cls) && painel.vis === "block" && painel.base <= 1 && painel.alto > 150 && painel.campos > 1, `o painel da peça sobe de baixo, colado no pé (${painel.alto} px, ${painel.campos} campos)`);
    ok(!/^(INPUT|TEXTAREA|SELECT)/.test(painel.foco), `tocar na peça não dá foco a campo (o teclado não sobe): foco em ${painel.foco || "nada"}`);
    ok(await pg.locator("#paleta").isHidden(), "com o painel aberto, o + sai da frente");
    await pg.frameLocator("#f-simu").locator("#props .mv-alca button").tap(); await pg.waitForTimeout(600);
    ok(!/mv-props/.test(await simu.evaluate(() => document.body.className)), "o × fecha o painel");

    // dois dedos: zoom (a viewBox do desenho encolhe)
    const vb0 = await simu.evaluate(() => +document.getElementById("svg").getAttribute("viewBox").split(" ")[2]);
    await simu.evaluate(async () => {
      const el = document.getElementById("svg"), r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ev = (t, id, x) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: cy, bubbles: true, pointerType: "touch", isPrimary: id === 1 }));
      ev("pointerdown", 1, cx - 40); ev("pointerdown", 2, cx + 40);
      for (let k = 1; k <= 10; k++) { ev("pointermove", 1, cx - 40 - 8 * k); ev("pointermove", 2, cx + 40 + 8 * k); await new Promise((ok) => setTimeout(ok, 16)); }
      ev("pointerup", 1, cx - 120); ev("pointerup", 2, cx + 120);
    });
    const vb1 = await simu.evaluate(() => +document.getElementById("svg").getAttribute("viewBox").split(" ")[2]);
    ok(vb1 < vb0 * 0.6, `dois dedos dão zoom: a largura vista foi de ${Math.round(vb0)} para ${Math.round(vb1)}`);

    // o Mover: toca na peça, no Mover do painel, e o próximo toque na folha é onde ela fica (o Desfazer volta); arrastar o
    // dedo a partir de uma peça move a folha, não a peça
    const pos = () => simu.evaluate(() => { const e = dados.folhas[folhaAtual].elementos.find((x) => x.nome === "R.1"); return e.x; });
    const centroR1 = () => simu.evaluate(() => { const i = dados.folhas[folhaAtual].elementos.findIndex((x) => x.nome === "R.1");
      const g = document.querySelector(`#svg g.el[data-i="${i}"] .corpo`) || document.querySelector(`#svg g.el[data-i="${i}"]`); const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await simu.evaluate(() => ajusta()); await pg.waitForTimeout(300);
    const x0 = await pos();
    let [cx, cy] = await centroR1();
    await simu.evaluate(async ([cx, cy]) => {                 // arrastar o dedo a partir da peça
      const el = document.elementFromPoint(cx, cy), ev = (t, x) => el.dispatchEvent(new PointerEvent(t, { pointerId: 9, clientX: x, clientY: cy, bubbles: true, pointerType: "touch", isPrimary: true }));
      ev("pointerdown", cx); for (let k = 1; k <= 10; k++) { ev("pointermove", cx + 9 * k); await new Promise((ok) => setTimeout(ok, 20)); } ev("pointerup", cx + 90);
    }, [cx, cy]); await pg.waitForTimeout(600);
    ok(await pos() === x0, "arrastar o dedo a partir de uma peça move a folha, não a peça");
    await simu.evaluate(() => ajusta()); await pg.waitForTimeout(300); [cx, cy] = await centroR1();
    const quadro = await pg.locator("#f-simu").boundingBox();
    await pg.touchscreen.tap(quadro.x + cx, quadro.y + cy); await pg.waitForTimeout(1200);
    const bt = pg.frameLocator("#f-simu").locator("#mv-mover");
    ok(await bt.count() === 1, "o painel da peça tem o Mover");
    await bt.tap(); await pg.waitForTimeout(500);
    const faixa = await simu.evaluate(() => { const f = document.getElementById("mv-faixa"); return !f.hidden && getComputedStyle(f).display !== "none" ? f.textContent : ""; });
    ok(/R\.1/.test(faixa) && !/mv-props/.test(await simu.evaluate(() => document.body.className)), `Mover fecha o painel e a faixa diz o que fazer: "${faixa}"`);
    await pg.touchscreen.tap(quadro.x + cx + 64, quadro.y + cy); await pg.waitForTimeout(1500);
    const x1 = await pos();
    ok(x1 > x0 && await simu.evaluate(() => document.getElementById("mv-faixa").hidden), `o toque seguinte é onde a peça fica: R.1 x ${x0} → ${x1}, a faixa some`);
    await simu.evaluate(() => desfazer()); await pg.waitForTimeout(1200);
    ok(await pos() === x0, `o Desfazer volta a peça (x ${await pos()})`);
    // o Mover começado e outra aba (ou outra folha) no meio: cancela (o toque seguinte não move nada)
    await simu.evaluate(() => ajusta()); await pg.waitForTimeout(300); [cx, cy] = await centroR1();
    await pg.touchscreen.tap(quadro.x + cx, quadro.y + cy); await pg.waitForTimeout(1200);
    await pg.frameLocator("#f-simu").locator("#mv-mover").tap(); await pg.waitForTimeout(400);
    await pg.locator('.aba[data-tab="controle"]').tap(); await pg.waitForTimeout(800); await pg.locator('.aba[data-tab="circuito"]').tap(); await pg.waitForTimeout(1200);
    const faixa2 = await simu.evaluate(() => document.getElementById("mv-faixa").hidden);
    await simu.evaluate(() => ajusta()); await pg.waitForTimeout(300); [cx, cy] = await centroR1();
    await pg.touchscreen.tap(quadro.x + cx + 64, quadro.y + cy + 40); await pg.waitForTimeout(1200);
    ok(faixa2 && await pos() === x0, `trocar de aba no meio do Mover o cancela: a faixa some e a peça fica (x ${await pos()})`);
    await simu.evaluate(() => seleciona(null)); await pg.waitForTimeout(300);

    // ▶: o andamento em cima, o aviso de pronta e o scope (o próprio, ?movel=1)
    await pg.locator("#rodar").tap();
    let sub = ""; for (let k = 0; k < 240; k++) { await pg.waitForTimeout(500); sub = await pg.locator("#sub").textContent(); if (/pronta/.test(sub)) break; }
    ok(/rodada pronta · \d+ amostras/.test(sub), `▶ rodou: "${sub}"`);
    ok(await pg.locator("#aviso.on").count() === 1 && /Ver scope/.test(await pg.locator("#aviso-bt").textContent()), "o aviso de rodada pronta com o atalho para o scope");
    await pg.locator("#aviso-bt").tap(); await pg.waitForTimeout(4000);
    const sc = pg.frames().find((f) => /\/maisim\/scope\/.*movel=1/.test(f.url()));
    const grafs = sc ? await sc.evaluate(() => ({ cls: document.body.className, u: document.querySelectorAll(".u-over").length })) : null;
    ok(grafs && /movel/.test(grafs.cls) && grafs.u > 0, `a aba Scope mostra a rodada: ${grafs ? grafs.u : 0} gráfico(s), modo celular`);

    // Controle e IA: o mesmo editor, noutra vista (sem foco automático)
    await pg.locator('.aba[data-tab="controle"]').tap(); await pg.waitForTimeout(1500);
    const ctl = await simu.evaluate(() => ({ cls: document.body.className, vis: getComputedStyle(document.getElementById("painel-controle")).display, tela: getComputedStyle(document.getElementById("tela")).display }));
    ok(/vm-controle/.test(ctl.cls) && ctl.vis !== "none" && ctl.tela === "none", "Controle: o painel do controle em tela cheia");
    await pg.frameLocator("#f-simu").locator("#ctl-editor .view-lines, #ctl-editor textarea").first().tap({ position: { x: 120, y: 40 } }); await pg.waitForTimeout(600);
    const focoCod = await simu.evaluate(() => document.activeElement && document.activeElement.tagName);
    ok(focoCod === "TEXTAREA", `tocar no código deixa digitar (o foco que a pessoa pediu passa): foco em ${focoCod}`);
    await simu.evaluate(() => document.activeElement && document.activeElement.blur());
    await pg.locator('.aba[data-tab="ia"]').tap(); await pg.waitForTimeout(1500);
    const ia = await simu.evaluate(() => { const a = document.activeElement; return { cls: document.body.className, vis: getComputedStyle(document.getElementById("ctl-claude")).display, foco: a ? a.tagName : "" }; });
    ok(/vm-ia/.test(ia.cls) && ia.vis !== "none", "IA: a conversa em tela cheia");
    ok(ia.foco !== "TEXTAREA" && ia.foco !== "INPUT", `abrir a IA não dá foco à caixa de texto: foco em ${ia.foco}`);

    // o arquivo muda no editor (Salvar como…): a casca acompanha (o título e o Exportar .msd usam o de agora)
    await simu.evaluate(() => { const s = document.getElementById("sel-modelo"), o = new Option("copia_movel.ipes", "circuitos/copia_movel.ipes"); s.add(o); s.value = o.value; });
    await pg.locator('.aba[data-tab="circuito"]').tap(); await pg.waitForTimeout(1500);
    ok(/copia_movel/.test(await pg.locator("#titulo").textContent()), `depois de Salvar como…, a casca usa o arquivo novo: "${await pg.locator("#titulo").textContent()}"`);
    // o ⋯: a ⚙ (os parâmetros da simulação) abre no editor, sem foco (e o + sai da frente dela; abrir outro circuito com
    // ela aberta: o editor novo começa sem janela, e o + volta)
    await pg.locator('.aba[data-tab="circuito"]').tap(); await pg.waitForTimeout(800);
    await pg.locator("#mais").tap(); await pg.waitForTimeout(500);
    await pg.locator("#g-corpo .menu-lista button").first().tap(); await pg.waitForTimeout(1200);
    const ps = await simu.evaluate(() => { const a = document.activeElement; return { modal: !!document.querySelector(".modal"), foco: a ? a.tagName : "" }; });
    ok(ps.modal && ps.foco !== "INPUT", `⋯ → Simulação abre a ⚙ do editor, sem foco (foco em ${ps.foco})`);
    ok(await pg.locator("#paleta").isHidden(), "com uma janela do editor aberta, o + sai da frente");
    await pg.locator('.aba[data-tab="inicio"]').tap(); await pg.waitForTimeout(500);
    await pg.locator("#l-exemplos .linha", { hasText: "exemplo_boost" }).first().tap(); await pg.waitForTimeout(4000);
    const desc2 = pg.frameLocator("#f-simu").locator(".modal button", { hasText: "Descartar" }); if (await desc2.count()) { await desc2.first().tap(); await pg.waitForTimeout(3000); }
    ok(await pg.locator("#paleta").isVisible(), "abrir outro circuito com uma janela aberta: o + volta (o editor novo começa sem janela)");
    ok(!erros.length, `sem erros na casca${erros.length ? ": " + erros.join(" · ") : ""}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
