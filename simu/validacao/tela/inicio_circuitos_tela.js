// a página inicial (instância de teste 7200): a seção "Circuitos" (Marcelo, 24/10: "falta uma árvore para abrir os
// circuitos salvos, os últimos vistos"). Abre dois circuitos dos seus pelo simulador de teste (o simu anota em
// recentes.json) e confere: "Recentes" com o último aberto em cima e "aberto …"; "Todos os circuitos" por grupo, com busca;
// o "Abrir" leva ao simu com ?modelo=; o caminho da pasta embaixo; em inglês, os textos do dicionário.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const api = (rota, corpo) => fetch("http://localhost:7201/maisim/simu/" + rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo) } : {}).then((r) => r.json());
(async () => {
  let b;
  try {
    const meus = (await api("modelos")).filter((m) => m.id_grupo === "circuitos");
    if (meus.length < 2) throw new Error(`a instância de teste precisa de 2 circuitos seus (tem ${meus.length})`);
    const [a1, a2] = meus.slice(0, 2);
    for (const m of [a1, a2]) await api("editor/abrir", { arq: m.arq, modo: "descartar" });   // a2 é o último aberto
    const pastas = await api("modelos/pastas");
    b = await chromium.launch();
    const pg = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto("http://localhost:7200/"); await pg.waitForSelector("#circuitos:not([hidden])", { timeout: 20000 });
    const rec = await pg.$$eval("#lista-circ .rodada", (rs) => rs.map((r) => [r.querySelector("b").textContent, r.querySelector(".det").textContent, r.querySelector("a").getAttribute("href")]));
    const n2 = a2.nome.replace(/\.ipes$/, "");
    ok(rec.length >= 2 && rec[0][0] === n2 && /aberto/.test(rec[0][1]) && rec[0][2] === `/maisim/simu/?modelo=${encodeURIComponent(a2.arq)}`,
       `Recentes: o último aberto em cima, com "aberto …" e o Abrir no simu (${JSON.stringify(rec[0])})`);
    ok(await pg.$eval("#filtro-circ", (x) => x.hidden), "Recentes: sem a busca");
    await pg.click('.abas-circ button[data-aba="todos"]');
    const grupos = await pg.$$eval("#lista-circ .grupo", (g) => g.map((x) => x.textContent));
    const todos = await pg.$$eval("#lista-circ .rodada b", (bs) => bs.map((x) => x.textContent));
    ok(grupos.some((g) => /^meus circuitos \(\d+\)$/i.test(g)) && todos.length >= meus.length && !(await pg.$eval("#filtro-circ", (x) => x.hidden)),
       `Todos: por grupo (${grupos.join(" · ")}), ${todos.length} circuitos, com a busca`);
    await pg.fill("#filtro-circ", n2.slice(0, 6));
    const filtrados = await pg.$$eval("#lista-circ .rodada b", (bs) => bs.map((x) => x.textContent));
    ok(filtrados.length >= 1 && filtrados.every((x) => x.toLowerCase().includes(n2.slice(0, 6).toLowerCase())), `a busca filtra: "${n2.slice(0, 6)}" → ${filtrados.join(", ")}`);
    await pg.fill("#filtro-circ", "zzz_nada_assim");
    ok(/nenhum circuito/.test(await pg.textContent("#lista-circ")), "nada achado: o aviso");
    ok((await pg.textContent("#pasta-circ")).includes(pastas.meus), `o caminho da pasta: ${await pg.textContent("#pasta-circ")}`);
    await pg.evaluate(() => maisimI18n.muda("en")); await pg.waitForSelector("#circuitos:not([hidden])");
    ok((await pg.textContent("#circuitos h2")) === "Circuits" && (await pg.textContent('.abas-circ button[data-aba="todos"]')) === "All circuits"
       && /opened/.test(await pg.textContent("#lista-circ .rodada .det")), "em inglês: Circuits, All circuits, opened …");
    await pg.evaluate(() => maisimI18n.muda("pt"));
    // um exemplo aberto também entra em Recentes (Codex no #85); em "Todos" não (a grade dos exemplos já está acima)
    const ex = (await api("modelos")).find((m) => m.id_grupo === "exemplos");
    await api("editor/abrir", { arq: ex.arq, modo: "descartar" });
    await pg.reload(); await pg.waitForSelector("#circuitos:not([hidden])");
    const topo = await pg.$eval("#lista-circ .rodada b", (x) => x.textContent);
    await pg.click('.abas-circ button[data-aba="todos"]');
    const nosTodos = await pg.$$eval("#lista-circ .rodada b", (bs) => bs.map((x) => x.textContent));
    ok(topo === ex.nome.replace(/\.ipes$/, "") && !nosTodos.includes(topo), `um exemplo aberto fica em cima nos Recentes (${topo}) e fora de Todos`);
    // apagar pela tela inicial (Marcelo, 24/10: "deletar por aqui, sem achar a pasta"): um circuito descartável; o aberto no
    // editor não tem lixeira; confirmar apaga de vez (a .lixeira fica numa pasta que a pessoa nem acha) e o tira da lista
    await api("editor/novo", { modo: "descartar" }); await api("editor/cmd", { op: "CREATE", args: ["R.1", 10, 10, "R"] });
    const sv = await api("editor/salvar", { nome: "inicio_apagar_t", pasta: "circuitos", sobrescrever: true });
    await api("editor/abrir", { arq: a1.arq, modo: "descartar" });                       // aberto: a1
    await pg.reload(); await pg.waitForSelector("#circuitos:not([hidden])");
    await pg.click('.abas-circ button[data-aba="todos"]');
    const semLixo = await pg.$$eval("#lista-circ .rodada", (rs, n) => rs.filter((r) => r.querySelector("b").textContent === n).map((r) => !!r.querySelector("button.apagar")), a1.nome.replace(/\.ipes$/, ""));
    ok(semLixo.length === 1 && semLixo[0] === false, "o circuito aberto no editor não tem lixeira");
    const recusa = await fetch("http://localhost:7201/maisim/simu/editor/apagar_arquivo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arq: a1.arq, de_vez: true }) });
    ok(recusa.status >= 400 && require("fs").existsSync(a1.arq), `e o servidor recusa apagar de vez o aberto (${recusa.status}), o arquivo fica`);
    await pg.fill("#filtro-circ", "inicio_apagar_t");
    await pg.click("#lista-circ button.apagar"); await pg.waitForSelector(".modal .m-ok");
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(800);
    const fs = require("fs"), path = require("path"), arqT = sv.salvo || path.join(pastas.meus, "inicio_apagar_t.ipes");
    const lx = path.join(pastas.meus, ".lixeira"), naLixeira = fs.existsSync(lx) ? fs.readdirSync(lx).filter((f) => f.startsWith("inicio_apagar_t_")) : [];
    ok(!fs.existsSync(arqT) && !naLixeira.length && !(await pg.textContent("#lista-circ")).includes("inicio_apagar_t") && !(await api("modelos")).some((m) => m.nome === "inicio_apagar_t.ipes"),
       "apagar de vez: some da lista e do disco (nada na .lixeira)");
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  if (b) await b.close();
  process.exit(falhas ? 1 : 0);
})();
