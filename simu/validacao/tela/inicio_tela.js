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
    // uma cópia com o nome que começa igual (exemplo_controle_pi_copia), rodada antes: o "N rodadas" do PI não a leva junto
    await api("editor/abrir", { arq: PI, modo: "descartar" });
    await api("editor/salvar", { nome: "exemplo_controle_pi_copia", pasta: "circuitos", sobrescrever: true });
    let j = await api("editor/rodar", { dt: "1e-6", tfim: "0.002", nome: "inicio_copia", amostras: "100" });
    while (["rodando", "pausada", "preparando"].includes(j.estado)) { await espera(300); j = await api("editor/rodada"); }
    await api("editor/abrir", { arq: PI, modo: "descartar" });
    j = await api("editor/rodar", { dt: "1e-6", tfim: "0.002", nome: "inicio_teste", amostras: "100" });
    while (["rodando", "pausada", "preparando"].includes(j.estado)) { await espera(300); j = await api("editor/rodada"); }
    ok(j.estado === "fim", `a rodada de teste (o exemplo PI, 2 ms): ${j.estado}`);
    b = await chromium.launch();
    const pg = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#recentes:not([hidden]) .rodada", { timeout: 20000 });
    const lin = await pg.evaluate(() => [...document.querySelectorAll("#recentes .rodada")].map((d) => ({ nome: d.querySelector("b").textContent,
      det: d.querySelector(".det").textContent, links: [...d.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]) })));
    const r0 = lin[0] || { links: [] };
    ok(lin.length >= 1 && lin.length <= 6 && r0.nome === "inicio_teste" && /^exemplo_controle_pi( \(exemplos\))? · hoje, /.test(r0.det),
      `a mais nova primeiro: ${r0.nome} (${r0.det}); ${lin.length} na lista (até 6)`);
    ok(r0.links.length === 2 && r0.links[0][0] === "ver no scope" && /^\/maisim\/scope\/\?a=.+scope_inicio_teste\.npz$/.test(r0.links[0][1])
      && r0.links[1][0] === "abrir o circuito" && r0.links[1][1] === "/maisim/simu/?modelo=" + encodeURIComponent(PI), `atalhos: ${JSON.stringify(r0.links)}`);
    // os modelos de exemplo (Marcelo, 22/10): o cartão "Exemplos" ao lado do Scope abre a lista (um cartão por exemplo, que abre no simu)
    const fechada = await pg.evaluate(() => document.getElementById("exemplos").hidden && !document.getElementById("cartao-exemplos").hidden);
    await pg.click("#cartao-exemplos"); await pg.waitForTimeout(150);
    const ex = await pg.evaluate(() => ({ vis: !document.getElementById("exemplos").hidden, cart: [...document.querySelectorAll("#exemplos .ex")].map((a) => [a.querySelector("b").textContent, a.getAttribute("href")]) }));
    await pg.click("#cartao-exemplos"); await pg.waitForTimeout(150);
    const fechou = await pg.evaluate(() => document.getElementById("exemplos").hidden);
    ok(fechada && fechou && ex.vis && ex.cart.length >= 8 && ex.cart[0][0] === "Buck" && ex.cart[0][1] === "/maisim/simu/?modelo=" + encodeURIComponent("exemplos/exemplo_buck.ipes")
       && ex.cart.some((c) => c[0] === "Inversor em ponte completa") && ex.cart.some((c) => c[0] === "Retificador trifásico"),
      `o cartão Exemplos abre e fecha a lista: ${ex.cart.length} modelos (${ex.cart.map((c) => c[0]).join(", ")})`);
    // as ferramentas saem dos cartões e ficam em "Sobre e créditos", no rodapé (Marcelo, 22/10)
    const semFerr = await pg.evaluate(() => !/GeckoCIRCUITS|Python/.test([...document.querySelectorAll(".cartoes, #exemplos")].map((x) => x.textContent).join(" ")));
    await pg.click("#bt-creditos"); await pg.waitForTimeout(150);
    const cred = await pg.evaluate(() => ({ vis: !document.getElementById("creditos").hidden, txt: document.getElementById("creditos").textContent }));
    ok(semFerr && cred.vis && /GeckoCIRCUITS/.test(cred.txt) && /Python/.test(cred.txt) && /GPL v3/.test(cred.txt) && /não é afiliado/.test(cred.txt),
      "os cartões não citam ferramentas; \"Sobre e créditos\" abre com o GeckoCIRCUITS, o Python, as bibliotecas e a IA");
    // todas as simulações (Marcelo, 22/10): a lista inteira com filtro, as guardadas com selo, guardar e desguardar
    const fs = require("fs"), path = require("path");
    const total = await pg.evaluate(() => fetch("/maisim/scope/rodadas").then((r) => r.json()).then((l) => l.length));
    await pg.click("#bt-todas"); await pg.waitForSelector("#todas:not([hidden]) .rodada");
    const t1 = await pg.evaluate(() => ({ n: document.querySelectorAll("#lista-todas .rodada").length, nr: document.querySelectorAll("#lista-todas button.n-rodadas").length, ult: document.getElementById("ultimas").hidden, bt: document.getElementById("bt-todas").textContent }));
    await pg.fill("#filtro-todas", "inicio_teste"); await pg.waitForTimeout(200);
    const t2 = await pg.evaluate(() => [...document.querySelectorAll("#lista-todas .rodada b")].map((x) => x.textContent));
    const arq0 = decodeURIComponent(r0.links[0][1].replace(/^.*\?a=/, "")), dir0 = path.dirname(path.isAbsolute(arq0) ? arq0 : path.resolve(__dirname, "../../..", arq0));
    await pg.click("#lista-todas .rodada:first-child button.guardar"); await pg.waitForTimeout(600);
    const g1 = await pg.evaluate(() => ({ selo: !!document.querySelector("#lista-todas .rodada:first-child .selo"), bt: document.querySelector("#lista-todas .rodada:first-child button.guardar").textContent }));
    const marcada = fs.existsSync(path.join(dir0, ".guardada"));
    await pg.click("#lista-todas .rodada:first-child button.guardar"); await pg.waitForTimeout(600);
    const desmarcada = !fs.existsSync(path.join(dir0, ".guardada"));
    await pg.click("#bt-todas"); await pg.waitForTimeout(200);
    const t3 = await pg.evaluate(() => ({ todas: document.getElementById("todas").hidden, ult: !document.getElementById("ultimas").hidden }));
    ok(t1.n === total && t1.nr === 0 && t1.ult && t1.bt === "só as últimas" && t2.length >= 1 && t2.every((x) => x.startsWith("inicio_teste")) && g1.selo && g1.bt === "desguardar" && marcada && desmarcada && t3.todas && t3.ult,
      `todas as simulações: ${t1.n} de ${total} (sem "N rodadas" na lista: cada linha é uma rodada); o filtro "inicio_teste" deixa ${t2.length}; guardar marca a pasta e mostra o selo, desguardar tira; "só as últimas" volta`);
    // as últimas: uma por circuito, com "N rodadas" (abre a lista filtrada pelo circuito) — Marcelo, 22/10
    const ult = await pg.evaluate(() => { const ls = [...document.querySelectorAll("#ultimas .rodada .det")].map((d) => d.textContent.split(" · ")[0]); return { ls, unicos: new Set(ls).size }; });
    const nr = await pg.$("#ultimas .rodada:first-child button.n-rodadas");
    let filtrou = null;
    if (nr) { await nr.click(); await pg.waitForTimeout(200);
      const circs = () => pg.$$eval("#lista-todas .rodada .det", (ds) => [...new Set(ds.map((d) => d.textContent.split(" · ")[0]))]);
      filtrou = await pg.evaluate(() => ({ aberta: !document.getElementById("todas").hidden, filtro: document.getElementById("filtro-todas").value,
        chip: document.getElementById("so-circ").hidden ? "" : document.querySelector("#so-circ span").textContent }));
      filtrou.circs = await circs();
      await pg.click("#so-circ button"); await pg.waitForTimeout(150);
      filtrou.depois = { chip: await pg.evaluate(() => !document.getElementById("so-circ").hidden), circs: await circs() };
      await pg.click("#bt-todas"); await pg.waitForTimeout(150); }
    ok(ult.ls.length === ult.unicos && ult.ls.includes("exemplo_controle_pi_copia") && nr && filtrou && filtrou.aberta && filtrou.filtro === ""
       && filtrou.chip === "circuito: " + ult.ls[0] && filtrou.circs.join() === ult.ls[0] && /^exemplo_controle_pi( \(exemplos\))?$/.test(ult.ls[0])
       && !filtrou.depois.chip && filtrou.depois.circs.includes("exemplo_controle_pi_copia"),
      `as últimas, uma por circuito (${ult.ls.join(", ")}); "N rodadas" abre só as do circuito exato, sem a _copia; o × tira o filtro (${JSON.stringify(filtrou)})`);
    await pg.click("#recentes .rodada:first-child a:first-of-type"); await pg.waitForURL(/\/maisim\/scope\/\?a=/);
    await pg.waitForFunction(() => typeof A !== "undefined" && A && A.meta, null, { timeout: 20000 });
    ok(await pg.evaluate(() => A.meta.rotulo) === "inicio_teste", "ver no scope: a rodada aberta no scope");
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#recentes:not([hidden]) .rodada", { timeout: 20000 });
    await pg.click("#recentes .rodada:first-child a:nth-of-type(2)"); await pg.waitForURL(/\/maisim\/simu\/\?modelo=/);
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.arq, null, { timeout: 30000 });
    ok(await pg.evaluate(() => dados.arq) === PI, `abrir o circuito: o simu com ${await pg.evaluate(() => dados.arq)}`);
    // apagar pela página inicial (Marcelo, 22/10): a lixeira de uma linha (cancelar não apaga; apagar tira a pasta) e "apagar as
    // da lista" com o filtro, sem as guardadas. Três rodadas próprias (criar outra, não por cima)
    await api("editor/abrir", { arq: PI, modo: "descartar" });
    for (let k = 0; k < 3; k++) { let r = await api("editor/rodar", { dt: "1e-6", tfim: "0.001", nome: "inicio_apaga", amostras: "50", por_cima: "0" });
      while (["rodando", "pausada", "preparando"].includes(r.estado)) { await espera(300); r = await api("editor/rodada"); } await espera(1100); }
    const pastasAp = () => fs.readdirSync(path.join(require("os").homedir(), ".cache/maisim_teste/rodadas")).filter((d) => d.endsWith("_inicio_apaga"));
    const ap0 = pastasAp();
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#recentes:not([hidden]) .rodada", { timeout: 20000 });
    await pg.click("#bt-todas"); await pg.fill("#filtro-todas", "inicio_apaga"); await pg.waitForTimeout(200);
    const nAp = () => pg.evaluate(() => document.querySelectorAll("#lista-todas .rodada").length);
    const n0 = await nAp();
    await pg.click("#lista-todas .rodada:first-child button.apagar"); await pg.waitForSelector(".modal");
    const txtM = await pg.textContent(".modal"); await pg.click(".modal .m-nao"); await pg.waitForTimeout(300);
    const n1 = await nAp(), ap1 = pastasAp();
    await pg.click("#lista-todas .rodada:first-child button.apagar"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(800);
    const n2 = await nAp(), ap2 = pastasAp();
    ok(ap0.length === 3 && n0 === 3 && /Apagar a rodada inicio_apaga\?/.test(txtM) && /cópia do circuito/.test(txtM) && n1 === 3 && ap1.length === 3 && n2 === 2 && ap2.length === 2,
      `a lixeira: pergunta ("${txtM.slice(0, 50)}…"); cancelar não apaga (${n1}); apagar tira a linha e a pasta (${ap0.length} → ${ap2.length})`);
    await pg.click("#lista-todas .rodada:first-child button.guardar"); await pg.waitForTimeout(600);
    const btL = await pg.textContent("#bt-apagar-lista");
    await pg.click("#bt-apagar-lista"); await pg.waitForSelector(".modal"); const txtL = await pg.textContent(".modal");
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(800);
    const n3 = await nAp(), ap3 = pastasAp(), guardadaFica = ap3.length === 1 && fs.existsSync(path.join(require("os").homedir(), ".cache/maisim_teste/rodadas", ap3[0], ".guardada"));
    ok(/apagar 1 da lista/.test(btL) && /1 guardada fica/.test(txtL) && /“inicio_apaga”/.test(txtL) && n3 === 1 && guardadaFica,
      `"apagar as da lista": só as filtradas e não guardadas ("${btL}"; "${txtL.slice(0, 60)}…"); a guardada fica (${ap3.length} pasta)`);
    for (const d of pastasAp()) fs.rmSync(path.join(require("os").homedir(), ".cache/maisim_teste/rodadas", d), { recursive: true, force: true });
    // "+ Novo circuito" (no lugar do cartão do Simu): o simu abre e já pergunta o nome da folha em branco
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#cartao-novo");
    const hrefNovo = await pg.getAttribute("#cartao-novo", "href");
    await pg.click("#cartao-novo"); await pg.waitForURL(/\/maisim\/simu\//);
    const tit = await pg.waitForSelector(".modal h3", { timeout: 30000 }).then((h) => h.textContent()).catch(() => "");
    if (await pg.$(".modal .m-cancela")) await pg.click(".modal .m-cancela");
    ok(hrefNovo === "/maisim/simu/?novo=1" && tit === "Novo circuito" && !/novo=/.test(pg.url()), `+ Novo circuito: o simu abre com "${tit}" (e o endereço sem o ?novo)`);
    // com mudanças não salvas no servidor e outro circuito como o último deste navegador: pergunta uma vez só (no novo)
    await api("editor/abrir", { arq: PI, modo: "descartar" }); await api("editor/cor", { canal: "x", cor: "#123456" });
    await pg.evaluate(() => localStorage.setItem("maisim-simu-modelo", "exemplos/exemplo_buck.ipes"));
    await pg.goto("http://localhost:7200/maisim/simu/?novo=1");
    const titulos = [];
    for (let k = 0; k < 3; k++) {
      const h = await pg.waitForSelector(".modal h3", { timeout: k ? 3000 : 30000 }).then((x) => x.textContent()).catch(() => ""); if (!h) break;
      titulos.push(h); await pg.click(h === "Novo circuito" ? ".modal .m-ok" : ".modal .m-cancela"); await pg.waitForTimeout(300); }
    const est = await api("editor/estado");
    ok(titulos.join(" | ") === "Novo circuito | Há mudanças não salvas" && est.arq === PI,
      `?novo=1 com mudanças não salvas: uma pergunta só (${titulos.join(" | ")}); cancelar deixa o ${est.arq}`);
    // o mesmo com um circuito novo sem nome aberto no servidor: uma pergunta só; cancelar mostra aquele circuito
    await api("editor/novo", { modo: "descartar" }); await api("editor/cmd", { op: "CREATE", args: ["R.1", 10, 10, "R"] });
    await pg.goto("http://localhost:7200/maisim/simu/?novo=1");
    const tit2 = [];
    for (let k = 0; k < 3; k++) {
      const h = await pg.waitForSelector(".modal h3", { timeout: k ? 3000 : 30000 }).then((x) => x.textContent()).catch(() => ""); if (!h) break;
      tit2.push(h); await pg.click(h === "Novo circuito" ? ".modal .m-ok" : ".modal .m-cancela"); await pg.waitForTimeout(300); }
    await pg.waitForTimeout(500);
    const mostra = await pg.evaluate(() => ({ novo: ed.novo, r: !!dados.folhas["0"].elementos.find((e) => e.nome === "R.1"), bt: $("bt-modelo").textContent.trim() }));
    ok(tit2.join(" | ") === "Novo circuito | Há mudanças não salvas" && mostra.novo === "circuito_sem_nome" && mostra.r,
      `?novo=1 com um circuito sem nome no servidor: uma pergunta só (${tit2.join(" | ")}); cancelar mostra aquele circuito (${mostra.bt})`);
    await api("editor/abrir", { arq: PI, modo: "descartar" });
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
