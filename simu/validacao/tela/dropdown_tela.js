// a lista aberta dos seletores no padrão do MaiSim (app/public/maisim-dica.js; Marcelo, 25/10: o solver do ⚙ abria "o quadrado
// azul" do sistema), na instância de teste (7200 → simu 7201, scope 7202): no ⚙ (a Integração) e no cabeçalho do scope (A e B).
// O clique abre a lista do MaiSim (cantos redondos, as cores da página, ✓ na escolhida) embaixo do seletor e dentro da tela; o
// teclado abre (Espaço, Alt+↓) e anda (setas, Home/End, letras), Enter escolhe e dispara input e change, Esc fecha sem fechar o
// diálogo; o clique fora fecha; o select de verdade continua com o valor (selectOption e .value valem). As opções postas depois
// aparecem, as desligadas não se escolhem; data-nativo, multiple e o desligado ficam com o sistema. No tamanho 125 % e no tema
// escuro, junto do seletor
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const ARQ = "exemplos/exemplo_buck.ipes", S = "http://localhost:7201/maisim/simu/";
const abreArq = () => fetch(S + "editor/abrir", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ arq: ARQ, modo: "descartar" }) }).then((r) => r.text());
// a lista à vista: as opções, a marcada, a ativa, o estilo e a posição (em relação ao seletor sel)
const estado = (pg, sel) => pg.evaluate((s) => {
  const l = document.getElementById("maisim-lista"), e = document.querySelector(s);
  if (!l || !l.isConnected) return null;
  const r = l.getBoundingClientRect(), q = e.getBoundingClientRect(), cs = getComputedStyle(l), m = l.querySelector(".ml-op.marcada");
  return { ops: [...l.querySelectorAll(".ml-op")].map((d) => d.textContent), marcada: m ? m.textContent : null, ativa: (l.querySelector(".ml-op.ativa") || {}).textContent,
    check: m ? getComputedStyle(m, "::before").content : "", corMarcada: m ? getComputedStyle(m).color : "", raio: cs.borderTopLeftRadius, fundo: cs.backgroundColor,
    desligadas: [...l.querySelectorAll(".ml-op.desligada")].map((d) => d.textContent), expandido: e.getAttribute("aria-expanded"),
    junto: Math.abs(r.top - q.bottom) < 12 || Math.abs(r.bottom - q.top) < 12, largo: r.width >= q.width - 1, dentro: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
}, sel);
const lum = (rgb) => { const [r, g, b] = (rgb.match(/\d+/g) || [0, 0, 0]).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b; };
(async () => {
  let b;
  try {
    await abreArq();
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 860 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
    const pg = await ctx.newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    const liga = async () => {
      await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(ARQ));
      for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor && ed.ligado)); k++) {
        if (await pg.$(".modal .m-ok")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    };
    const engrenagem = async () => { await pg.evaluate(() => { parametrosSim(); }); await pg.waitForSelector(".modal .m-solver", { timeout: 20000 }); await pg.waitForTimeout(300); };
    await liga(); await engrenagem();
    const M = ".modal .m-solver";
    await pg.evaluate((s) => { const e = document.querySelector(s); window.__ev = []; for (const t of ["change", "input"]) e.addEventListener(t, () => window.__ev.push(t)); }, M);
    const v0 = await pg.$eval(M, (e) => e.value);

    // 1. o clique abre a lista do MaiSim (não a do sistema), embaixo do seletor, com a escolhida marcada
    await pg.click(M); await pg.waitForTimeout(250);
    let e = await estado(pg, M);
    const cartao = await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--cartao").trim());
    ok(e && e.ops.join("|") === "Euler implícito|trapézio|Gear (BDF2)" && e.marcada === "Euler implícito" && e.check === '"✓"' && e.expandido === "true",
      `⚙ Integração: o clique abre a lista do MaiSim com as três opções e ✓ na escolhida (${e && e.ops.join("|")}; marcada ${e && e.marcada}, ${e && e.check})`);
    ok(e && e.raio === "10px" && e.junto && e.largo && e.dentro && lum(e.fundo) > 200 && e.corMarcada !== "rgb(0, 0, 0)",
      `⚙: no estilo do MaiSim (cantos ${e && e.raio}, fundo ${e && e.fundo}, --cartao ${cartao}, a marcada em ${e && e.corMarcada}), junto do seletor e dentro da tela`);
    await pg.hover("#maisim-lista .ml-op:nth-child(2)"); await pg.waitForTimeout(150);
    ok((await estado(pg, M)).ativa === "trapézio", "⚙: o mouse em cima acende a opção");
    await pg.screenshot({ path: "dropdown_solver.png" });
    // 2. o teclado: ↓ e Enter escolhem a seguinte; change e input disparam; o select de verdade com o valor
    await pg.keyboard.press("Home"); await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("Enter"); await pg.waitForTimeout(150);
    let v = await pg.evaluate((s) => ({ v: document.querySelector(s).value, ev: window.__ev.join(","), lista: !!document.getElementById("maisim-lista"),
      foco: document.activeElement === document.querySelector(s) }), M);
    ok(v.v === "1" && v.ev === "input,change" && !v.lista && v.foco, `⚙: ↓ e Enter escolhem o trapézio (${v0} → ${v.v}), disparam ${v.ev}, fecham a lista e o foco fica no seletor`);
    // 3. pelo teclado também abre (Espaço); as letras procuram; Esc fecha só a lista (o ⚙ continua aberto)
    await pg.keyboard.press(" "); await pg.waitForTimeout(150);
    e = await estado(pg, M);
    ok(e && e.marcada === "trapézio" && e.ativa === "trapézio", `⚙: o Espaço abre a lista, na escolhida (${e && e.ativa})`);
    await pg.keyboard.type("g"); await pg.waitForTimeout(80);
    ok((await estado(pg, M)).ativa === "Gear (BDF2)", "⚙: a letra G leva ao Gear");
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(150);
    v = await pg.evaluate((s) => ({ v: document.querySelector(s).value, lista: !!document.getElementById("maisim-lista"), modal: !!document.querySelector(".modal .m-solver") }), M);
    ok(v.v === "1" && !v.lista && v.modal, `⚙: Esc fecha a lista sem escolher (${v.v}) e sem fechar o ⚙`);
    // 4. o clique numa opção escolhe; o clique fora fecha
    await pg.click(M); await pg.waitForTimeout(150); await pg.click("#maisim-lista .ml-op:nth-child(3)"); await pg.waitForTimeout(150);
    v = await pg.evaluate((s) => ({ v: document.querySelector(s).value, ev: window.__ev.join(",") }), M);
    ok(v.v === "2" && v.ev === "input,change,input,change", `⚙: o clique no Gear escolhe (${v.v}; ${v.ev})`);
    await pg.click(M); await pg.waitForTimeout(150); await pg.mouse.click(30, 830); await pg.waitForTimeout(150);
    ok(!(await estado(pg, M)) && !!(await pg.$(".modal .m-solver")), "⚙: o clique fora fecha a lista");
    // 5. o select de verdade continua: selectOption e .value (sem lista)
    await pg.selectOption(M, "0"); await pg.waitForTimeout(100);
    v = await pg.evaluate((s) => ({ v: document.querySelector(s).value, ev: window.__ev.slice(-1)[0], lista: !!document.getElementById("maisim-lista") }), M);
    ok(v.v === "0" && v.ev === "change" && !v.lista, "⚙: selectOption continua valendo (o select de verdade no DOM)");
    await pg.click(".modal .m-cancela"); await pg.waitForTimeout(200);

    // 6. um seletor posto pelo código, com opções depois (uma desligada e um grupo); os que ficam com o sistema
    await pg.evaluate(() => {
      const d = document.createElement("div"); d.id = "dd-teste"; d.style.cssText = "position:fixed;left:400px;top:300px;z-index:9;display:flex;gap:8px";
      d.innerHTML = `<select id="dd1"><option>um</option><option>dois</option></select><select id="dd2" data-nativo><option>a</option></select>
        <select id="dd3" multiple><option>m</option></select><select id="dd4" disabled><option>x</option></select>`;
      document.body.appendChild(d);
      const s = document.getElementById("dd1"); const o = new Option("três (desligada)"); o.disabled = true; s.add(o);
      const g = document.createElement("optgroup"); g.label = "grupo"; g.appendChild(new Option("quatro")); s.appendChild(g);
    });
    await pg.click("#dd1"); await pg.waitForTimeout(150);
    e = await estado(pg, "#dd1");
    ok(e && e.ops.join("|") === "um|dois|três (desligada)|quatro" && e.desligadas.join() === "três (desligada)" && await pg.$("#maisim-lista .ml-grupo"),
      `posto pelo código: as opções de agora, a desligada apagada, o grupo (${e && e.ops.join("|")})`);
    await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("ArrowDown"); await pg.waitForTimeout(80);
    ok((await estado(pg, "#dd1")).ativa === "quatro", "a seta pula a desligada");
    const aria = await pg.$eval("#dd1", (s) => { const d = document.getElementById(s.getAttribute("aria-activedescendant") || "-");
      return { ctl: s.getAttribute("aria-controls"), ativa: d && d.textContent, papel: d && d.getAttribute("role") }; });
    ok(aria.ctl === "maisim-lista" && aria.ativa === "quatro" && aria.papel === "option", `o leitor de tela: aria-controls ${aria.ctl}, aria-activedescendant na "${aria.ativa}"`);
    await pg.evaluate(() => document.getElementById("dd1").add(new Option("cinco"))); await pg.waitForTimeout(150);
    ok((await estado(pg, "#dd1")).ops.slice(-1)[0] === "cinco", "uma opção posta com a lista aberta aparece nela");
    await pg.keyboard.press("End"); await pg.keyboard.press("Enter"); await pg.waitForTimeout(80);
    ok(await pg.$eval("#dd1", (s) => s.value) === "cinco", "End e Enter escolhem a última");
    ok(await pg.$eval("#dd1", (s) => ["aria-expanded", "aria-controls", "aria-activedescendant"].every((k) => !s.hasAttribute(k))), "fechada: sem aria-expanded, aria-controls e aria-activedescendant");
    for (const [s, nome] of [["#dd2", "data-nativo"], ["#dd3", "multiple"]]) {
      await pg.click(s, { force: true }); await pg.waitForTimeout(120);
      ok(!(await estado(pg, s)), `${nome}: fica com o sistema (sem a lista do MaiSim)`);
      await pg.keyboard.press("Escape");
    }
    await pg.evaluate(() => document.getElementById("dd4").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))); await pg.waitForTimeout(100);
    ok(!(await estado(pg, "#dd4")), "desligado: não abre");
    await pg.evaluate(() => document.getElementById("dd-teste").remove());

    // 7. no tamanho 125 % e no tema escuro: junto do seletor, com o fundo escuro
    await pg.evaluate(() => { localStorage.setItem("maisim-escala", "1.25"); localStorage.setItem("maisim-tema", "escuro"); });
    await liga(); await engrenagem();
    await pg.click(M); await pg.waitForTimeout(250);
    e = await estado(pg, M);
    ok(e && e.junto && e.largo && e.dentro && lum(e.fundo) < 80, `125 % e escuro: a lista junto do seletor, dentro da tela, no fundo escuro (${e && e.fundo})`);
    await pg.screenshot({ path: "dropdown_solver_escuro.png" });
    await pg.keyboard.press("Escape"); await pg.click(".modal .m-cancela");
    await pg.evaluate(() => { localStorage.removeItem("maisim-escala"); localStorage.removeItem("maisim-tema"); });

    // 8. o cabeçalho do scope: A e B
    const sc = await ctx.newPage(); sc.on("pageerror", (x) => erros.push("scope: " + x.message));
    await sc.goto("http://localhost:7200/maisim/scope/");
    await sc.waitForFunction(() => document.querySelectorAll("#sel-a option").length >= 2, null, { timeout: 30000 });
    await sc.waitForTimeout(1500);
    const n = await sc.$$eval("#sel-a option", (o) => o.length);
    await sc.click("#sel-a"); await sc.waitForTimeout(250);
    e = await estado(sc, "#sel-a");
    ok(e && e.ops.length === n && e.junto && e.largo && e.dentro && e.raio === "10px", `scope A: a lista do MaiSim com as ${n} opções, junto do seletor, da largura dele`);
    await sc.screenshot({ path: "dropdown_scope_a.png" });
    await sc.keyboard.press("Escape"); await sc.waitForTimeout(100);
    await sc.evaluate(() => { window.__evb = []; document.getElementById("sel-b").addEventListener("change", () => window.__evb.push(document.getElementById("sel-b").value)); });
    await sc.focus("#sel-b"); await sc.keyboard.press("Alt+ArrowDown"); await sc.waitForTimeout(200);
    e = await estado(sc, "#sel-b");
    ok(e && e.marcada === e.ops[0] && e.junto, `scope B: Alt+↓ abre a lista (${e && e.ops.length} opções, marcada "${e && e.marcada}")`);
    await sc.screenshot({ path: "dropdown_scope_b.png" });
    await sc.keyboard.press("ArrowDown"); await sc.keyboard.press("Enter"); await sc.waitForTimeout(300);
    v = await sc.evaluate(() => ({ v: document.getElementById("sel-b").value, i: document.getElementById("sel-b").selectedIndex, ev: window.__evb }));
    ok(v.i === 1 && v.v && v.ev.length === 1 && v.ev[0] === v.v, `scope B: ↓ e Enter escolhem a segunda (${v.v}); o change com o valor`);
    ok(!erros.length, `sem erros nas páginas (${erros.join(" | ")})`);
  } catch (x) {
    ok(false, "erro: " + x.message);
  } finally {
    if (b) await b.close();
    await abreArq().catch(() => {});
  }
  process.exit(falhas ? 1 : 0);
})();
