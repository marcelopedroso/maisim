// o transformador ideal na tela (servidor de teste 7201): montado pela API (fonte → transformador 2:1 → R), aberto na página:
// o símbolo com as duas bobinas, os dois pontos da polaridade e "2:1" embaixo; os fios chegam aos 4 bornes; selecionado, o
// painel mostra n1, n2, a relação e a polaridade com os nomes no idioma da página (antes ele aparecia sem bornes)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const B = "http://localhost:7201/maisim/simu/";
const api = (rota, corpo) => fetch(B + rota, corpo === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then((r) => r.json());
const cmd = (op, ...args) => api("editor/cmd", { op, args });
(async () => {
  let b;
  try {
    await api("editor/novo", { descartar: true });
    await cmd("CREATE", "U.1", 4, 10, "U"); await cmd("CREATE", "Trans.1", 10, 10, "Trans"); await cmd("CREATE", "R.1", 16, 10, "R");
    await cmd("SETP", "Trans.1", "n1", 2); await cmd("SETP", "Trans.1", "n2", 1);
    for (const [r, pts] of [["p", [[4, 8], [4, 6], [8, 6], [8, 8], [9, 8]]], ["gp", [[4, 12], [4, 14], [8, 14], [8, 12], [9, 12]]],
      ["s", [[11, 8], [16, 8]]], ["gs", [[11, 12], [16, 12]]]]) await api("editor/fio", { acao: "novo", cantos: pts, dom: "LK", rotulo: r });
    const salvo = (await api("editor/salvar", { nome: "trafo_tela", pasta: "circuitos", sobrescrever: true })).salvo;
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.addInitScript(() => { try { localStorage.removeItem("maisim-simu-travado"); } catch (e) { /* ok */ } });
    await pg.goto(B + "?modelo=" + encodeURIComponent(salvo)); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await pg.waitForTimeout(1000);
    for (let i = 0; i < 5 && await pg.$(".modal-fundo"); i++) { await pg.click(".modal .m-extra, .modal .m-ok, .modal .m-fechar"); await pg.waitForTimeout(600); }
    const d = await pg.evaluate(() => { const e = dados.folhas[folhaAtual].elementos.find((x) => x.nome === "Trans.1");
      const g = [...document.querySelectorAll("#svg g.el")].find((x) => [...x.querySelectorAll("text")].some((t) => t.textContent === "Trans.1"));
      return { bornes: e.terminais.length, pontos: g ? g.querySelectorAll(":scope > g circle").length : 0, bobinas: g ? g.querySelectorAll(":scope > g path").length : 0,
        relacao: g ? [...g.querySelectorAll("text")].some((t) => t.textContent === "2:1") : false, soltas: (dados.encaixe || {}).soltas || [] }; });
    ok(d.bornes === 4 && d.pontos === 2 && d.bobinas === 2 && d.relacao, `o símbolo: 4 bornes, 2 bobinas, 2 pontos da polaridade e "2:1" (${JSON.stringify(d)})`);
    await pg.evaluate(() => seleciona(dados.folhas[folhaAtual].elementos.find((x) => x.nome === "Trans.1"))); await pg.waitForTimeout(1500);
    const rot = await pg.evaluate(() => [...document.querySelectorAll("#props label span")].map((s) => s.textContent.trim()));
    ok(rot.some((t) => t.startsWith("n1 (espiras do primário)")) && rot.some((t) => t.startsWith("n2 (espiras do secundário)")) && rot.some((t) => t.startsWith("polaridade")),
      `o painel com os nomes em português: ${rot.filter((t) => /n1|n2|rela|polar/.test(t)).join(" · ")}`);
    ok(!erros.length, `sem erros na página${erros.length ? ": " + erros.join(" | ") : ""}`);
    await pg.screenshot({ path: "trafo.png" });
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); await api("editor/novo", { descartar: true }).catch(() => {}); }
  process.exit(falhas ? 1 : 0);
})();
