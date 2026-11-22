// Quanto a página do MaiSim pesa no navegador (instância de teste 7200 → 7201), pedido de Marcelo em 21/11 ("a gente não
// consumir muita memória RAM pra não travar o PC da turma"). Por enquanto só MEDE (não falha por número): o heap do
// JavaScript (o usado e o reservado), os nós do DOM e os documentos (a página e o Scope embutido), pelo DevTools do Chromium
// (Performance.getMetrics), em quatro momentos: o circuito aberto; com o painel de controle (o editor de código, Monaco);
// depois de uma rodada longa (20 001 amostras, o Scope embutido desenhado); e depois de uma coleta de lixo (o que fica).
// Grava em <dados de teste>/bateria/memoria_tela.json, ao lado do memoria.json dos processos (memoria_api.py).
const { chromium } = require("playwright");
const { entraNaEdicao } = require("./_edicao");
const fs = require("fs"), path = require("path"), os = require("os");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  const res = { momentos: {} };
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
    const erros = []; pg.on("pageerror", (e) => { if (!/Canceled/.test(e.message)) erros.push(e.message); });
    const cdp = await pg.context().newCDPSession(pg); await cdp.send("Performance.enable");
    const medida = async (nome) => {
      const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      const r = { heap_usado_mb: +(m.JSHeapUsedSize / 1048576).toFixed(1), heap_total_mb: +(m.JSHeapTotalSize / 1048576).toFixed(1),
        nos_dom: m.Nodes, documentos: m.Documents, ouvintes: m.JSEventListeners };
      res.momentos[nome] = r;
      ok(true, `${nome}: heap JS ${r.heap_usado_mb} MB usado (${r.heap_total_mb} MB reservado) · ${r.nos_dom} nós do DOM · ${r.documentos} documentos · ${r.ouvintes} ouvintes`);
      return r;
    };
    await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent("exemplos/exemplo_controle_pi.ipes"));
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 60000 });
    await entraNaEdicao(pg);
    await pg.waitForTimeout(1500); await medida("circuito aberto (o exemplo com controle em Python)");
    await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 60000 });
    await pg.waitForTimeout(1500); await medida("com o painel de controle (o editor de código)");
    await pg.evaluate(() => { sim.par.dt = "1e-6"; sim.par.tfim = "0.2"; sim.par.amostras = "20001"; sim.par.nome = "memoria_tela"; iniciaSim(); });
    await pg.waitForFunction(() => sim.estado === "fim" || sim.estado === "erro", null, { timeout: 300000 });
    const est = await pg.evaluate(() => sim.estado);
    ok(est === "fim", `a rodada longa terminou (${est})`);
    await pg.waitForTimeout(4000); await medida("depois da rodada longa (20 001 amostras, o Scope desenhado)");
    await cdp.send("HeapProfiler.enable"); await cdp.send("HeapProfiler.collectGarbage"); await pg.waitForTimeout(1000);
    await medida("depois de uma coleta de lixo (o que fica)");
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  try {
    const pasta = path.join(os.homedir(), ".cache", "maisim_teste", "bateria"); fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, "memoria_tela.json"), JSON.stringify(res, null, 1));
  } catch (e) { /* o registro já tem os números */ }
  if (b) await b.close();
  console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
  process.exit(falhas ? 1 : 0);
})();
