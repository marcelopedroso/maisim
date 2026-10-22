// apagar gravações no scope (instância isolada: Vite 7210 → scope 7211; ../sobe_fila.sh), pedido de Marcelo em 22/10: o
// filtro e "marcar todas (as filtradas)"; de uma rodada do simu sai a pasta inteira (os dados e a cópia do circuito daquela
// rodada), de outra pasta só o .npz; a guardada pede confirmação a mais (e o servidor a recusa sem o pedido explícito); as
// pastas de rodada sem gravação saem à parte; o texto da lista entra escapado. Rodadas falsas nas pastas da instância de teste
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const RODADAS = path.join(os.homedir(), ".cache/maisim_teste/rodadas"), FORA = path.join(__dirname, "..", "tmp_scope_apagar");
const P = (n) => path.join(RODADAS, `2026-01-01_00000${n}_ap_teste_${n}`);
const npz = (arq, rotulo) => execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.01, 1e-4)
meta = {"planta": "gecko-maisim", "rotulo": ${JSON.stringify(rotulo)}, "modelo": "x/circuito_ap.ipes", "dt": 1e-4, "Ts": 1e-4, "tfim": 0.01,
        "sinais": [{"canal": "v", "elemento": "VOLT.1"}], "acionamentos": []}
np.savez(${JSON.stringify(arq)}, meta=np.array(json.dumps(meta)), t=t, v=np.sin(t))`]);
const rodada = (n, rotulo, guardada) => { const d = P(n); fs.mkdirSync(path.join(d, "serie"), { recursive: true });
  npz(path.join(d, `scope_ap_teste_${n}.npz`), rotulo); fs.writeFileSync(path.join(d, `ap_teste_${n}.ipes`), "x".repeat(2000)); fs.writeFileSync(path.join(d, "serie", "v.csv"), "t,v\n");
  if (guardada) fs.writeFileSync(path.join(d, ".guardada"), ""); return d; };
const ORFA = path.join(RODADAS, "2026-01-01_000009_ap_orfa");
(async () => {
  let b;
  try {
    const a = rodada(1, "ap_teste_<i>um</i>"), g = rodada(2, "ap_teste_dois", true), g2 = rodada(3, "ap_teste_tres", true);
    fs.mkdirSync(ORFA, { recursive: true }); fs.writeFileSync(path.join(ORFA, "controle.log"), "x".repeat(1000));
    const velho = new Date(Date.now() - 3600e3); fs.utimesSync(ORFA, velho, velho); fs.utimesSync(path.join(ORFA, "controle.log"), velho, velho);
    fs.mkdirSync(FORA, { recursive: true }); npz(path.join(FORA, "scope_ap_teste_fora.npz"), "ap_teste_fora"); fs.writeFileSync(path.join(FORA, "outro.txt"), "fica");
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
    const erros = [], dialogos = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo do navegador: " + d.message()); d.dismiss(); });
    // as perguntas do MaiSim (pergunta(), no lugar do confirm() — que agora seria erro): aceita cada uma e guarda o texto em
    // dialogos (em toda carga da página: o teste recarrega no meio)
    await pg.exposeFunction("__pergunta", (t) => { dialogos.push(t); });
    await pg.addInitScript(() => { new MutationObserver(() => { const m = document.querySelector(".sc-modal");
      if (m && !m.dataset.visto) { m.dataset.visto = 1; window.__pergunta(m.querySelector("p").textContent); setTimeout(() => m.querySelector(".sc-ok").click(), 50); } })
      .observe(document, { childList: true, subtree: true }); });
    await pg.goto("http://localhost:7210/maisim/scope/"); await pg.waitForSelector("#bt-apagar");
    // o servidor: a guardada só com o pedido explícito
    const rel3 = path.relative(path.resolve(__dirname, "../../.."), path.join(g2, "scope_ap_teste_3.npz"));
    const lista = await pg.evaluate(() => fetch("rodadas").then((r) => r.json()));
    const it3 = lista.find((x) => x.nome === "ap_teste_tres") || {};
    const r3 = await pg.evaluate((arq) => fetch("apagar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arqs: [arq] }) }).then((r) => r.json()), it3.arq || rel3);
    ok(it3.pasta && it3.guardada && it3.pasta_tam > 2000 && r3.recusados.length === 1 && r3.recusados[0].por === "guardada" && fs.existsSync(g2),
      `a lista diz pasta, guardada e o tamanho da pasta (${it3.pasta_tam} B); sem o pedido explícito, a guardada é recusada (${JSON.stringify(r3.recusados)})`);
    fs.rmSync(path.join(g2, ".guardada"));             // agora ela é uma rodada comum (fica de fora do filtro abaixo pelo nome)
    // a janela: o filtro, o escape, o selo, "marcar todas (as filtradas)", as pastas sem gravação
    await pg.click("#bt-apagar"); await pg.waitForSelector("#janela-apagar.aberta");
    await pg.fill("#ap-filtro", "ap_teste_"); await pg.waitForTimeout(200);
    const v1 = await pg.evaluate(() => ({ vis: [...document.querySelectorAll("#ap-lista label:not([hidden])")].map((l) => l.querySelector("span").textContent),
      italico: !!document.querySelector("#ap-lista label:not([hidden]) i"), selos: document.querySelectorAll("#ap-lista label:not([hidden]) .selo").length,
      orfas: !document.getElementById("ap-orfas-l").hidden && document.getElementById("ap-orfas-t").textContent }));
    const filtra = (q) => pg.evaluate((q) => { const f = document.getElementById("ap-filtro"); f.value = q; f.dispatchEvent(new Event("input")); }, q);
    await filtra(""); const total = await pg.evaluate(() => document.querySelectorAll("#ap-lista label:not([hidden])").length);
    await filtra("ap_teste_");
    // tira a "tres" do conjunto (desmarca depois do "marcar todas"): fica para conferir que o não marcado não sai
    await pg.check("#ap-todas"); await pg.waitForTimeout(100);
    const tres = await pg.$('#ap-lista label:not([hidden]) input[data-arq*="ap_teste_3"]'); await tres.uncheck(); await pg.waitForTimeout(100);
    const m = await pg.evaluate(() => ({ txt: document.getElementById("ap-marcadas").textContent, ind: document.getElementById("ap-todas").indeterminate,
      escondidasMarcadas: [...document.querySelectorAll("#ap-lista label[hidden] input:checked")].length, vis: document.getElementById("ap-vis").textContent,
      bt: document.getElementById("ap-ok").textContent }));
    await pg.check("#ap-orfas");
    await pg.click("#ap-ok"); await pg.waitForTimeout(1200);
    const depois = await pg.evaluate(() => ({ filtro: document.getElementById("ap-filtro").value, aberta: document.getElementById("janela-apagar").classList.contains("aberta"),
      vis: [...document.querySelectorAll("#ap-lista label:not([hidden])")].map((l) => l.querySelector("span").textContent) }));
    ok(v1.vis.length === 4 && v1.vis.some((t) => t.includes("ap_teste_<i>um</i>")) && !v1.italico && v1.selos === 1 && /pastas de rodada sem gravação/.test(v1.orfas || ""),
      `filtro "ap_teste_": ${v1.vis.length} de ${total} (o rótulo com <i> aparece como texto: escapado), 1 selo "guardada", a linha das pastas sem gravação`);
    ok(/^3 marcadas/.test(m.txt) && /^Apagar 3 marcadas \(/.test(m.bt) && m.ind && m.escondidasMarcadas === 0 && /filtradas/.test(m.vis),
      `"marcar todas" marca só as filtradas (nenhuma escondida marcada) e fica no meio quando uma sai: "${m.txt}" ${m.vis}; o botão: "${m.bt}"`);
    ok(dialogos.length === 2 && /pasta inteira/.test(dialogos[0]) && /guardada/.test(dialogos[1]),
      `apagar: a confirmação diz que sai a pasta inteira, e a guardada pede outra (${dialogos.length} perguntas)`);
    ok(!fs.existsSync(a) && !fs.existsSync(g) && fs.existsSync(g2) && !fs.existsSync(ORFA) && !fs.existsSync(path.join(FORA, "scope_ap_teste_fora.npz")) && fs.existsSync(path.join(FORA, "outro.txt")),
      "saíram as pastas inteiras das rodadas marcadas (a guardada também, confirmada) e a pasta sem gravação; a não marcada ficou; de fora das rodadas, só o .npz");
    ok(depois.aberta && depois.filtro === "ap_teste_" && depois.vis.length === 1 && /ap_teste_tres/.test(depois.vis[0]),
      `depois de apagar, a lista é refeita com o mesmo filtro: ${depois.vis.join(" | ")}`);
    // com o zoom do MaiSim (125 %) numa janela baixa, o rodapé (o botão de apagar) continua à vista (Marcelo, 22/10: sumia)
    await pg.setViewportSize({ width: 1300, height: 640 }); await pg.evaluate(() => { document.documentElement.style.zoom = 1.25; }); await pg.waitForTimeout(300);
    const dentro = await pg.$eval("#ap-ok", (e) => { const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return document.elementFromPoint(x, y) === e; });
    await pg.evaluate(() => { document.documentElement.style.zoom = ""; }); await pg.setViewportSize({ width: 1500, height: 950 });
    ok(dentro, `zoom 125 %, janela de 640 px: o botão de apagar à vista (e clicável)`);
    // a lixeira da linha: só aquela, sem desmarcar as outras
    await pg.fill("#ap-filtro", ""); await pg.waitForTimeout(100);
    const outra = await pg.$('#ap-lista label:not([hidden]) input:not([data-arq*="ap_teste_3"])'); const outraArq = outra ? await outra.getAttribute("data-arq") : null;
    if (outra) await outra.check();
    const nAntes = dialogos.length;
    await pg.click('#ap-lista label:has(input[data-arq*="ap_teste_3"]) button.lixo'); await pg.waitForTimeout(1200);
    const fica = await pg.evaluate((a) => { const c = [...document.querySelectorAll("#ap-lista input")].find((x) => x.dataset.arq === a); return c ? c.checked : null; }, outraArq);
    ok(!fs.existsSync(g2) && dialogos.length === nAntes + 1 && /ap_teste_tres/.test(dialogos[nAntes]) && (outraArq === null || fica === true),
      `a lixeira da linha apaga só aquela (pergunta: "${(dialogos[nAntes] || "").slice(0, 60)}…"); a outra marcada continua marcada (${fica})`);
    // dois pedidos de apagar ao mesmo tempo (Marcelo, 22/10: um 2º clique durante o 1º derrubou um pedido e deu ~95
    // "não é uma gravação do scope"): um por vez; o 2º diz que já tinham saído; nenhum cai. E o aviso é curto (sem caminhos)
    const d4 = rodada(4, "ap_teste_quatro"), d5 = rodada(5, "ap_teste_cinco");
    await pg.evaluate(() => fetch("rodadas").then((r) => r.json()));     // o scope as vê
    const arqs = await pg.evaluate(() => fetch("rodadas").then((r) => r.json()).then((l) => l.filter((x) => /ap_teste_(quatro|cinco)/.test(x.nome)).map((x) => x.arq)));
    const [x1, x2] = await pg.evaluate((arqs) => Promise.all([0, 1].map(() => fetch("apagar", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arqs }) }).then(async (r) => ({ st: r.status, j: await r.json().catch(() => null) })))), arqs);
    const soma = [x1, x2].map((x) => x.j ? `${x.j.apagados.length} apagadas, ${(x.j.ja || []).length} já, ${x.j.recusados.length} recusadas` : `HTTP ${x.st}`);
    const resumo = await pg.evaluate((j) => resumoApagar(j), x2.j || { apagados: [], recusados: [] });
    ok(arqs.length === 2 && x1.st === 200 && x2.st === 200 && x1.j.apagados.length + x2.j.apagados.length === 2 && (x1.j.ja || []).length + (x2.j.ja || []).length === 2
       && !x1.j.recusados.length && !x2.j.recusados.length && !fs.existsSync(d4) && !fs.existsSync(d5) && resumo === "nada apagado; 2 já tinham saído",
      `dois pedidos juntos: ${soma.join(" | ")}; o aviso: "${resumo}"`);
    const curto = await pg.evaluate(() => resumoApagar({ apagados: [{ tamanho: 1e6 }], ja: ["a", "b"], recusados: [{ arq: "/x/y/scope_a.npz", por: "guardada" }, { arq: "/x/z/scope_b.npz", por: "guardada" }, { arq: "/x/w/scope_c.npz", por: "está rodando" }] }));
    ok(curto === "apagada 1 gravação (1.0 MB); 2 já tinham saído; ficaram 3: 2 guardada, 1 está rodando", `o aviso conta por motivo, sem os caminhos: "${curto}"`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally {
    for (const d of [P(1), P(2), P(3), P(4), P(5), ORFA, FORA]) fs.rmSync(d, { recursive: true, force: true });
    if (b) await b.close();
  }
  process.exit(falhas ? 1 : 0);
})();
