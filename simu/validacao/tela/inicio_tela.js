// a página inicial (instância de teste 7200): as últimas simulações, com os atalhos — "ver no scope" abre a rodada no
// scope, "abrir o circuito" abre o circuito de origem no simu (Marcelo, 21/10: "a tela inicial pode trazer as últimas
// simulações, com atalho"). Faz uma rodada curta do exemplo PI no simulador de teste para a lista ter o que mostrar.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const api = (rota, corpo) => fetch("http://localhost:7201/maisim/simu/" + rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo) } : {}).then((r) => r.json());
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let b;
  try {
    const PI = "exemplos/exemplo_controle_pi.ipes";
    await api("editor/abrir", { arq: PI, modo: "descartar" });
    let j = await api("editor/rodar", { dt: "1e-6", tfim: "0.002", nome: "inicio_teste", amostras: "100" });
    while (["rodando", "pausada", "preparando"].includes(j.estado)) { await espera(300); j = await api("editor/rodada"); }
    ok(j.estado === "fim", `a rodada de teste (o exemplo PI, 2 ms): ${j.estado}`);
    b = await chromium.launch();
    const pg = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#recentes:not([hidden]) .rodada", { timeout: 20000 });
    const lin = await pg.evaluate(() => [...document.querySelectorAll("#recentes .rodada")].map((d) => ({ nome: d.querySelector("b").textContent,
      det: d.querySelector(".det").textContent, links: [...d.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]) })));
    const r0 = lin[0] || { links: [] };
    ok(lin.length >= 1 && lin.length <= 6 && r0.nome === "inicio_teste" && /^exemplo_controle_pi · hoje, /.test(r0.det),
      `a mais nova primeiro: ${r0.nome} (${r0.det}); ${lin.length} na lista (até 6)`);
    ok(r0.links.length === 2 && r0.links[0][0] === "ver no scope" && /^\/maisim\/scope\/\?a=.+scope_inicio_teste\.npz$/.test(r0.links[0][1])
      && r0.links[1][0] === "abrir o circuito" && r0.links[1][1] === "/maisim/simu/?modelo=" + encodeURIComponent(PI), `atalhos: ${JSON.stringify(r0.links)}`);
    await pg.click("#recentes .rodada:first-child a:first-of-type"); await pg.waitForURL(/\/maisim\/scope\/\?a=/);
    await pg.waitForFunction(() => typeof A !== "undefined" && A && A.meta, null, { timeout: 20000 });
    ok(await pg.evaluate(() => A.meta.rotulo) === "inicio_teste", "ver no scope: a rodada aberta no scope");
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#recentes:not([hidden]) .rodada", { timeout: 20000 });
    await pg.click("#recentes .rodada:first-child a:nth-of-type(2)"); await pg.waitForURL(/\/maisim\/simu\/\?modelo=/);
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.arq, null, { timeout: 30000 });
    ok(await pg.evaluate(() => dados.arq) === PI, `abrir o circuito: o simu com ${await pg.evaluate(() => dados.arq)}`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
