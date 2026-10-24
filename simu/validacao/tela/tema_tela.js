// tema do MaiSim (página de teste 7200 → 7201): o botão do trilho alterna sistema → claro → escuro; o simu e o desenho seguem
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, colorScheme: "light" }); const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(require("os").homedir() + "/.cache/maisim_teste/circuitos/exemplo_controle_pwm.ipes"));
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && document.getElementById("maisim-nav"), null, { timeout: 30000 });
  await pg.evaluate(() => { try { localStorage.removeItem("maisim-tema"); } catch (e) {} window.maisimNav.aplicaTema(); });
  const t0 = await pg.evaluate(() => ({ tema: document.documentElement.dataset.tema, rot: document.querySelector("#maisim-nav .tema").dataset.rotulo }));
  ok(t0.tema === "claro" && /como o sistema/.test(t0.rot), `sistema (o navegador claro): ${t0.tema} · "${t0.rot}"`);
  await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-extra, .modal .m-ok"); await pg.waitForTimeout(800); }
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
  await pg.screenshot({ path: "tema_claro.png" });
  // toda variável do tema tem valor no tema atual (uma que aponta para si mesma fica vazia: a cor some) e todo var(--x) sem
  // valor de reserva usado no CSS da página está declarado
  const variaveis = () => pg.evaluate(() => {
    const decl = new Set(), usadas = new Set(), vazias = [];
    for (const f of document.styleSheets) { if (!f.ownerNode || !/--acento:/.test(f.ownerNode.textContent || "")) continue;   // só a folha do simu (não a do Monaco)
      let rs; try { rs = f.cssRules; } catch (e) { continue; }
      for (const r of rs) { if (!r.style) continue;
        if (/^:root/.test(r.selectorText || "")) for (const n of r.style) if (n.startsWith("--")) decl.add(n);
        for (const m of r.cssText.matchAll(/var\((--[\w-]+)\s*\)/g)) usadas.add(m[1]); } }
    const cs = getComputedStyle(document.documentElement);
    for (const n of decl) if (!cs.getPropertyValue(n).trim()) vazias.push(n);
    const soltas = [...usadas].filter((n) => !decl.has(n) && n !== "--c");   // --c: a cor do canal, posta no próprio elemento
    return { n: decl.size, vazias, soltas };
  });
  const vc = await variaveis();
  ok(vc.n >= 20 && !vc.vazias.length && !vc.soltas.length, `claro: ${vc.n} variáveis de tema, todas com valor${vc.vazias.length ? " — vazias: " + vc.vazias.join(", ") : ""}${vc.soltas.length ? " — usadas sem declarar: " + vc.soltas.join(", ") : ""}`);
  const cl = await pg.evaluate(() => { const est = $("ctl-estado"), c0 = est.className; est.className = "ok"; const ok = getComputedStyle(est).color; est.className = "erro"; const er = getComputedStyle(est).color; est.className = c0;
    const tr = $("ctl-trava"), d0 = tr.style.display; tr.style.display = ""; const av = getComputedStyle(tr).backgroundColor; tr.style.display = d0; return { ok, er, av }; });
  ok(cl.ok === "rgb(27, 127, 42)" && cl.er === "rgb(180, 35, 24)" && cl.av === "rgb(255, 247, 230)", `claro: estado ok ${cl.ok}, erro ${cl.er}, faixa da trava ${cl.av}`);
  let eventos = 0; await pg.exposeFunction("contaTema", () => { eventos++; }); await pg.evaluate(() => addEventListener("maisim-tema", () => window.contaTema()));
  await pg.click("#maisim-nav .tema"); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => document.documentElement.dataset.tema) === "claro" && await pg.evaluate(() => localStorage.getItem("maisim-tema")) === "claro", "1º clique: claro (escolhido)");
  await pg.click("#maisim-nav .tema"); await pg.waitForTimeout(800);
  const e = await pg.evaluate(() => ({ tema: document.documentElement.dataset.tema, fundo: getComputedStyle(document.body).backgroundColor, svg: getComputedStyle($("svg")).backgroundColor,
    corpo: [...document.querySelectorAll("#svg .corpo")].map((x) => x.getAttribute("stroke"))[0], monaco: document.querySelector(".monaco-editor").classList.contains("vs-dark"),
    cab: getComputedStyle(document.querySelector("header")).backgroundColor }));
  ok(e.tema === "escuro" && e.fundo === "rgb(15, 17, 21)" && e.svg === "rgb(18, 21, 27)" && e.cab === "rgb(23, 26, 33)", `2º clique: escuro · fundo ${e.fundo}, desenho ${e.svg}, cabeçalho ${e.cab}`);
  ok(e.corpo === "#8fa2ff" && e.monaco && eventos >= 1, `o desenho redesenhou (traço ${e.corpo}) e o editor de código ficou escuro (evento maisim-tema: ${eventos})`);
  // no escuro: o roxo da faixa do SM, os ícones da paleta (cor própria; brancos no item selecionado) e a etiqueta ⚙ do atuador
  const pe = await pg.evaluate(() => {
    const lab = document.createElement("label"); $("faixa-sm").appendChild(lab); const faixa = getComputedStyle(lab).color; lab.remove();
    const box = document.createElement("div"); box.innerHTML = `<div class="item">${icone({ lib: true })}</div><div class="item ativo">${icone({ lib: true })}</div><div class="item">${icone({ id: "PI", dom: "CONTROL" })}</div>`;
    $("itens").appendChild(box); const sv = [...box.querySelectorAll("svg")].map((x) => getComputedStyle(x).color); box.remove();
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); $("svg").appendChild(g); tagAtuador(g, 0, 0, "g");
    const tag = g.querySelector("rect").getAttribute("fill"); g.remove();
    return { faixa, sv, tag };
  });
  ok(pe.faixa === "rgb(179, 157, 255)" && pe.sv[0] === "rgb(179, 157, 255)" && pe.sv[1] === "rgb(255, 255, 255)" && pe.sv[2] === "rgb(79, 197, 108)" && pe.tag === "#33280f",
    `escuro: faixa do SM ${pe.faixa}; ícone do SM ${pe.sv[0]}, selecionado ${pe.sv[1]}; bloco de controle ${pe.sv[2]}; etiqueta ⚙ ${pe.tag}`);
  const ve = await variaveis();
  ok(!ve.vazias.length, `escuro: ${ve.n} variáveis, todas com valor${ve.vazias.length ? " — vazias: " + ve.vazias.join(", ") : ""}`);
  await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "VOLT.1"))); await pg.waitForTimeout(300);
  await pg.screenshot({ path: "tema_escuro.png" });
  await pg.click("#bt-param"); await pg.waitForSelector(".modal"); await pg.screenshot({ path: "tema_escuro_modal.png", clip: { x: 300, y: 0, width: 1000, height: 450 } }); await pg.keyboard.press("Escape");
  await pg.click("#maisim-nav .tema"); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => localStorage.getItem("maisim-tema")) === "sistema" && await pg.evaluate(() => document.documentElement.dataset.tema) === "claro", "3º clique: volta a seguir o sistema");
  // o sistema escuro: com "sistema", segue
  const ctx2 = await b.newContext({ viewport: { width: 1200, height: 700 }, colorScheme: "dark" }); const p2 = await ctx2.newPage(); await p2.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  await p2.goto("http://localhost:7200/maisim/simu/"); await p2.waitForTimeout(2500);
  ok(await p2.evaluate(() => document.documentElement.dataset.tema) === "escuro", "navegador escuro + 'sistema': o simu abre escuro (sem piscar: o tema vem antes de pintar)");
  // a barra da janela do app (meta theme-color) segue o tema: escura já na carga; clara de volta ao claro
  const barra = (p) => p.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
  const bEsc = await barra(p2), bCl = await barra(pg);
  ok(bEsc === "#171a21" && bCl === "#ffffff" && await p2.evaluate(() => document.title) === "MaiSim",
    `a barra da janela acompanha o tema (escuro ${bEsc}, claro ${bCl}); o título é só "MaiSim"`);
  // o trilho também: claro no tema claro (com a linha fina), escuro no escuro
  const trilho = (p) => p.evaluate(() => { const c = getComputedStyle(document.getElementById("maisim-nav")); return c.backgroundColor + " " + c.borderRightColor; });
  const tEsc = await trilho(p2), tCl = await trilho(pg);
  ok(tEsc.startsWith("rgb(21, 24, 29)") && tCl === "rgb(255, 255, 255) rgb(217, 221, 227)", `o trilho acompanha o tema (escuro ${tEsc}, claro ${tCl}, com a linha fina)`);
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
