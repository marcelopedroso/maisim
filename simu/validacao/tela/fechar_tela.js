// fechar o circuito (instância de teste 7200 → 7201), pedido de Marcelo em 22/10 ("fechar o circuito, para não ficar sempre
// um aberto"): o botão fecha (o Gecko vazio, nada na lista, o aviso "Nenhum circuito aberto", sem a paleta); simular é
// recusado; recarregar a página continua fechado; com mudanças não salvas, pergunta como ao abrir outro; "+ Novo circuito"
// do aviso sai do fechado; ?modelo= abre o circuito pedido
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const B = "http://localhost:7200/maisim/simu/";
const api = (rota, corpo) => fetch("http://localhost:7201/maisim/simu/" + rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo) } : {}).then(async (r) => ({ st: r.status, ...(await r.json()) }));
(async () => {
  let b;
  try {
    const mods = await api("modelos"), pi = (Object.values(mods).find((m) => m && m.arq && m.arq.endsWith("circuitos/exemplo_controle_pi.ipes")) || {}).arq;
    await api("editor/abrir", { arq: pi, modo: "descartar" });
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    const pronto = () => pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.editor !== undefined || document.body.classList.contains("sem-circuito"), null, { timeout: 30000 });
    const est = () => pg.evaluate(() => ({ sem: document.body.classList.contains("sem-circuito"), vazio: getComputedStyle(document.getElementById("vazio")).display,
      bt: document.querySelector("#bt-modelo span").textContent, paleta: getComputedStyle(document.querySelector("#paleta > *")).visibility, url: location.search }));
    await pg.goto(B + "?modelo=" + encodeURIComponent(pi)); await pronto(); await pg.waitForTimeout(1500);
    const antes = await est();
    // 1. fechar: sem mudanças, sem pergunta
    await pg.click("#bt-fechar"); await pg.waitForTimeout(1500);
    const f1 = await est(), srv = await api("editor/aberto"), rod = await api("editor/rodar", { dt: "1e-6", tfim: "0.001", nome: "fechar_teste", amostras: "10" });
    ok(!antes.sem && f1.sem && f1.vazio === "flex" && f1.bt === "nenhum circuito aberto" && f1.paleta === "hidden" && !/modelo=/.test(f1.url) && srv.fechado && !srv.aberto,
      `fechar: o aviso "Nenhum circuito aberto", a lista sem nada ("${f1.bt}"), sem a paleta, o endereço sem ?modelo; o servidor: fechado`);
    ok(rod.st === 409 && /nenhum circuito aberto/.test(rod.erro || ""), `simular fechado é recusado (${rod.erro})`);
    // 2. recarregar: continua fechado (não abre o último deste navegador)
    await pg.goto(B); await pg.waitForTimeout(3000);
    const f2 = await est();
    ok(f2.sem && f2.bt === "nenhum circuito aberto" && (await api("editor/aberto")).fechado, "recarregar a página: continua fechado");
    // 3. "+ Novo circuito" do aviso: pergunta o nome e sai do fechado
    await pg.click("#vz-novo"); await pg.waitForSelector(".modal .m-ok"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(1500);
    const f3 = await est(), s3 = await api("editor/aberto");
    ok(!f3.sem && f3.vazio === "none" && !s3.fechado && /circuito_\d+/.test(f3.bt), `"+ Novo circuito" no aviso: folha em branco (${f3.bt}), não está mais fechado`);
    // 4. com mudanças não salvas: fechar pergunta (descartar e fechar)
    await pg.evaluate(async () => novoEstado(await api("editor/cmd", { op: "CREATE", args: ["R.1", 10, 10, "R"] }))); await pg.waitForTimeout(500);
    await pg.click("#bt-fechar"); await pg.waitForSelector(".modal .m-ok"); const perg = await pg.textContent(".modal");
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(1500);
    const f4 = await est();
    ok(/sem salvar/.test(perg) && /fechar descarta/.test(perg) && f4.sem && (await api("editor/aberto")).fechado, `com mudanças não salvas: pergunta ("${perg.slice(0, 70)}…") e fecha`);
    // 5. ?modelo= abre o pedido, e sai do fechado
    await pg.goto(B + "?modelo=" + encodeURIComponent(pi)); await pg.waitForTimeout(3500);
    const f5 = await est(), s5 = await api("editor/aberto");
    ok(!f5.sem && !s5.fechado && s5.aberto === pi && /exemplo_controle_pi/.test(f5.bt), `?modelo= abre o circuito (${f5.bt}) e sai do fechado`);
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
