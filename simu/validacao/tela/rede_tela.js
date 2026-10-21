// conexão que cai no caminho (instância de teste 7200; a ponte Windows ↔ WSL faz isso): a leitura e a mudança são repetidas
// uma vez; a mudança vai com uma etiqueta (X-MaiSim-Pedido) e, se só a resposta se perdeu, o servidor devolve a mesma resposta
// sem fazer a mudança de novo; sem conexão, a faixa "sem conexão" aparece e some quando a conexão volta; e o Vite fecha a
// conexão depois de cada resposta do simu (sem conexão guardada para reusar, não sobra conexão morta)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext()).newPage();
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7200/maisim/simu/"); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    const cab = await pg.evaluate(async () => (await fetch("editor/rodada")).headers.get("connection"));
    ok(cab === "close", `o Vite fecha a conexão depois de cada resposta do simu (Connection: ${cab})`);
    // leitura: cai uma vez, repetida
    let n = 0; await pg.route("**/editor/rodada", (r) => { n++; if (n === 1) r.abort("connectionreset"); else r.continue(); });
    const lido = await pg.evaluate(async () => { try { return "ok: " + (await api("editor/rodada")).estado; } catch (e) { return "erro: " + e.message; } });
    ok(/^ok/.test(lido) && n === 2, `leitura com a conexão caindo uma vez: repetida e ${lido} (${n} tentativas)`);
    await pg.unroute("**/editor/rodada");
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    const conta = () => pg.evaluate(async () => (await api("editor/estado")).folhas["0"].elementos.length);
    // mudança: cai antes de chegar → repetida com a mesma etiqueta, feita uma vez
    let ids = []; n = 0;
    await pg.route("**/editor/cmd", (r) => { n++; ids.push(r.request().headers()["x-maisim-pedido"]); if (n === 1) r.abort("connectionreset"); else r.continue(); });
    let res = await pg.evaluate(async () => { try { await api("editor/cmd", { op: "CREATE", args: ["R.1", 10, 10, "R"] }); return "ok"; } catch (e) { return e.message; } });
    ok(res === "ok" && n === 2 && ids[0] && ids[0] === ids[1] && (await conta()) === 1, `mudança com a conexão caindo antes de chegar: repetida com a mesma etiqueta (${ids[0]}) e feita uma vez`);
    await pg.unroute("**/editor/cmd");
    // mudança: o servidor faz, a resposta se perde → a repetição recebe a mesma resposta, sem fazer de novo
    ids = []; n = 0;
    await pg.route("**/editor/cmd", async (r) => { n++; ids.push(r.request().headers()["x-maisim-pedido"]);
      if (n === 1) { await r.fetch(); r.abort("connectionreset"); } else r.continue(); });   // o 1º chega ao servidor; a resposta some
    res = await pg.evaluate(async () => { try { const j = await api("editor/cmd", { op: "CREATE", args: ["R.2", 20, 10, "R"] }); return "ok " + j.folhas["0"].elementos.length; } catch (e) { return e.message; } });
    ok(/^ok 2$/.test(res) && n === 2 && ids[0] === ids[1] && (await conta()) === 2, `mudança feita e a resposta perdida: a repetição recebe a resposta guardada e o R.2 não é criado duas vezes (${res}; ${await conta()} componentes)`);
    await pg.unroute("**/editor/cmd");
    // sem conexão nenhuma: o erro diz o que houve, a faixa aparece; com a conexão de volta, "testar de novo" a tira
    await pg.route("**/editor/cmd", (r) => r.abort("connectionreset"));
    const mud = await pg.evaluate(async () => { try { await api("editor/cmd", { op: "SETG", args: ["x", 1] }); return "sem erro"; } catch (e) { return e.message; } });
    const faixa = await pg.evaluate(() => { const f = document.getElementById("rede-aviso"); return f && getComputedStyle(f).display !== "none" && f.textContent; });
    ok(/caiu no caminho/.test(mud) && /sem conexão com o servidor do MaiSim/.test(faixa || ""), `sem conexão: "${mud.slice(0, 60)}…" e a faixa "sem conexão" com o testar de novo`);
    await pg.unroute("**/editor/cmd");
    await pg.click("#rede-aviso button"); await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => getComputedStyle(document.getElementById("rede-aviso")).display === "none" && /de volta/.test($("msg").textContent)), "testar de novo, com a conexão de volta: a faixa some e diz que voltou");
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
