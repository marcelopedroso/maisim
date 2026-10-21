// cabeçalho só de ícones (pedido de Marcelo): Arquivo | topo | Ver (ajustar, olho, camadas) | Simulação (⚙ $x ▶ ⏸ ⏹) | Scope/Controle | IA;
// quebra em linhas quando não cabe, com a tela acompanhando; dicas no padrão do PEW (instância de teste)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } }); const pg = await ctx.newPage(); await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  // começa limpo: o que um teste anterior deixou sem salvar faria a página perguntar antes de trocar de circuito
  await fetch("http://localhost:8768/pew/simu/editor/abrir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arq: "exemplos/exemplo_cascata_hb.ipes", modo: "descartar" }) }).then((r) => r.text());
  await pg.goto("http://localhost:8768/pew/simu/?modelo=exemplos%2Fexemplo_cascata_hb.ipes");
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  const c = await pg.evaluate(() => ({ menus: document.querySelectorAll(".menu-sup").length,
    grupos: [...document.querySelectorAll("header > *")].filter((x) => x.offsetParent !== null || x.id === "trilha").map((x) => x.id || x.tagName).join(" "),
    arquivo: [...document.querySelectorAll("#g-arquivo button")].map((x) => x.id).join(" "), ver: [...document.querySelectorAll("#g-ver button")].map((x) => x.id).join(" "),
    sim: [...document.querySelectorAll("#g-sim button")].map((x) => x.id).join(" "),
    texto: [...document.querySelectorAll("header button")].filter((x) => x.id !== "bt-modelo" && x.id !== "bt-globais" && x.textContent.trim()).map((x) => x.id) }));
  ok(c.menus === 0 && c.arquivo === "bt-modelo bt-novo bt-salvar bt-salvar-como bt-editar" && c.ver === "bt-ajustar bt-tudo bt-controle bt-rotulos bt-medicoes bt-corrente"
     && c.sim === "bt-param bt-globais bt-play bt-pausa bt-parar" && !c.texto.length, `grupos: ${c.grupos} · botões com texto: ${c.texto.join(",") || "nenhum"}`);
  const t = await pg.evaluate(() => ({ svg: !!document.querySelector("#trilha .topo svg"), title: document.querySelector("#trilha .topo").getAttribute("title") }));
  ok(t.svg && /folha principal/.test(t.title), `Main virou o ícone de topo ("${t.title}")`);
  // ⚙, $x, novo, salvar como abrem os diálogos
  for (const [id, re] of [["bt-param", /Parâmetros da simulação/], ["bt-globais", /Parâmetros da simulação/], ["bt-novo", /Novo circuito/], ["bt-salvar-como", /Salvar como|salvar/i]]) {
    await pg.click(`#${id}`); await pg.waitForSelector(".modal h3", { timeout: 60000 }); await pg.waitForTimeout(200);
    const h = await pg.textContent(".modal h3"); ok(re.test(h), `${id} abre "${h}"`);
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(300);
  }
  // olho: esconde tudo, mostra tudo; uma camada fora deixa misto
  await pg.click("#bt-tudo");
  let v = await pg.evaluate(() => ({ m: { ...mostrar }, f: $("bt-tudo").classList.contains("fechado"), a: [...document.querySelectorAll("#g-ver .ativo")].length }));
  ok(Object.values(v.m).every((x) => !x) && v.f && v.a === 0, "olho: esconde as 4 camadas (olho fechado)");
  await pg.click("#bt-tudo");
  v = await pg.evaluate(() => ({ m: { ...mostrar }, at: $("bt-tudo").classList.contains("ativo") }));
  ok(Object.values(v.m).every((x) => x) && v.at, "olho de novo: mostra as 4");
  await pg.click("#bt-rotulos");
  v = await pg.evaluate(() => ({ r: mostrar.rotulos, misto: $("bt-tudo").classList.contains("misto"), title: $("bt-tudo").title }));
  ok(!v.r && v.misto && /mostrar tudo/.test(v.title), `uma camada fora: olho "misto", dica "${v.title}"`);
  await pg.click("#bt-tudo"); ok(await pg.evaluate(() => Object.values(mostrar).every((x) => x)), "misto + olho: mostra tudo");
  // dicas
  await pg.mouse.move(5, 500); await pg.hover("#bt-ajustar"); await pg.waitForTimeout(600);
  ok(await pg.evaluate(() => $("dica-ui").innerHTML) === "ajustar: ver a folha inteira <kbd>0</kbd>", "dica do ajustar: tecla [0]");
  await pg.mouse.move(5, 500); await pg.hover("#bt-pausa", { force: true }); await pg.waitForTimeout(600);
  ok(await pg.evaluate(() => $("dica-ui").innerHTML) === "pausar <kbd>Espaço</kbd>", "dica no botão desabilitado (pausa)");
  await pg.mouse.move(5, 500); await pg.waitForTimeout(200);
  // larguras: uma linha quando cabe; duas quando não, sem botão fora da tela, e a tela embaixo acompanha
  for (const w of [1500, 1150, 1000, 800]) {
    await pg.setViewportSize({ width: w, height: 800 }); await pg.waitForTimeout(400);
    const r = await pg.evaluate(() => { const h = document.querySelector("header"), bs = [...h.querySelectorAll("button")].filter((x) => x.offsetParent);
      return { alt: h.offsetHeight, top: parseFloat(getComputedStyle($("tela")).top), fora: bs.filter((x) => x.getBoundingClientRect().right > innerWidth + 0.5).map((x) => x.id),
        linhas: new Set(bs.map((x) => Math.round(x.getBoundingClientRect().top / 10))).size }; });
    ok(!r.fora.length && Math.abs(r.top - r.alt) < 1.5, `${w} px: cabeçalho de ${r.alt} px em ${r.linhas} linha(s), a tela começa em ${r.top} px, botões fora: ${r.fora.join(",") || "nenhum"}`);
    await pg.screenshot({ path: `cab_${w}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(r.alt + 10, 200) } });
  }
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
