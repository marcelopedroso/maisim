// o módulo Figuras (figuras para artigo; instância de teste 7200 → o scope 7202 serve o /maisim/figuras), sobre uma gravação
// feita aqui (simu/validacao/tmp_figuras_tela, apagada no fim):
//  - o item "Figuras" no trilho, ativo na página; a rodada escolhida pela URL (?a=); os gráficos por grandeza (as tensões, as
//    correntes e os sem unidade); a prévia (uma "folha" branca) e o tamanho da figura;
//  - a lista dos sinais com filtro (só os escolhidos aparecem, como etiquetas); o estilo de um sinal (a cor) muda só a figura;
//  - trocar o estilo (IEEE 2 colunas) muda a largura; 2 por linha; o PDF baixa com o nome figura_maisim_<circuito>_<data>.pdf;
//  - os cartões que recolhem (guardado ao recarregar); o "Abrir no Figuras" do scope chega com os painéis e o zoom;
//  - em inglês, os textos trocam e a figura sai com "Time"; no tema escuro, a página escura e a prévia continua branca
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const B = "http://localhost:7200", PASTA = path.join(__dirname, "..", "tmp_figuras_tela"), RAIZ = path.resolve(__dirname, "../../..");
fs.mkdirSync(PASTA, { recursive: true });
const ARQ = path.join(PASTA, "scope_figuras_tela.npz");
execFileSync("python3", ["-c", `
import json, numpy as np
t = np.arange(0, 0.01, 1e-6); car = (t * 20e3) % 1
np.savez(${JSON.stringify(ARQ)}, meta=json.dumps({"planta": "gecko", "modelo": "exemplos/exemplo_buck.ipes", "chave_layout": "teste_figuras_tela"}),
         t=t, v_o=24 + 0 * t, v_sw=48 * (car < .5), i_L=10 + car, g=(car < .5) * 1.0, portadora=car)`]);
const REL = path.relative(RAIZ, ARQ).split(path.sep).join("/");
const folha = (pg) => pg.evaluate(() => { const i = document.getElementById("previa"); return { vis: !i.hidden && i.naturalWidth > 0, w: i.naturalWidth, h: i.naturalHeight, fundo: getComputedStyle(i).backgroundColor }; });
const espera = (pg, f, arg) => pg.waitForFunction(f, arg ?? null, { timeout: 60000, polling: 250 }).then(() => true).catch(() => false);
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: "pt-BR", acceptDownloads: true });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("teste")) { localStorage.clear(); localStorage.setItem("maisim-lingua", "pt"); sessionStorage.setItem("teste", "1"); } } catch (e) { /* ok */ } });
    const pg = await ctx.newPage(); const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto(`${B}/maisim/figuras/?a=${encodeURIComponent(REL)}`);
    const pronta = await espera(pg, () => { const i = document.getElementById("previa"); return i && !i.hidden && i.naturalWidth > 0; });
    const trilho = await pg.evaluate(() => { const a = document.querySelector('#maisim-nav a.item[href="/maisim/figuras/"]'); return a ? { ativo: a.classList.contains("ativo"), rot: a.dataset.rotulo } : null; });
    ok(trilho && trilho.ativo && /Figuras/.test(trilho.rot), `o item no trilho, ativo: ${JSON.stringify(trilho)}`);
    const g = await pg.$$eval("#paineis .painel", (ps) => ps.map((p) => [...p.querySelectorAll(".chip")].map((c) => c.dataset.c).join(",")));
    ok(pronta && JSON.stringify(g) === JSON.stringify(["v_o,v_sw", "i_L", "g,portadora"]), `a rodada pela URL e os gráficos por grandeza: ${JSON.stringify(g)}`);
    let F = await folha(pg);
    ok(F.vis && Math.abs(F.w / 150 * 2.54 - 8.89) < 0.15 && F.fundo === "rgb(255, 255, 255)", `a prévia: ${F.w}×${F.h} px (8,9 cm a 150 dpi), na folha branca`);
    // a lista dos sinais: o filtro e o marcar
    await pg.click("#paineis .painel:nth-child(2) .mais-sinais"); await pg.fill("#lista-sinais .filtro", "por");
    const vis = await pg.$$eval("#lista-sinais .itens label", (ls) => ls.filter((l) => !l.hidden).map((l) => l.dataset.c));
    await pg.click('#lista-sinais label[data-c="portadora"] input'); await pg.keyboard.press("Escape");
    const g2 = await pg.$$eval("#paineis .painel:nth-child(2) .chip", (cs) => cs.map((c) => c.dataset.c));
    ok(JSON.stringify(vis) === '["portadora"]' && JSON.stringify(g2) === '["i_L","portadora"]' && !(await pg.$("#lista-sinais")),
       `a lista com filtro: "por" → ${JSON.stringify(vis)}; marcado, a etiqueta no gráfico 2 (${g2})`);
    // o estilo de um sinal (só a figura)
    await pg.click('#paineis .painel:nth-child(2) .chip[data-c="i_L"] .nome-sinal'); await pg.click('#estilo-sinal .cor[data-cor="#e41a1c"]');
    const cor = await pg.$eval('#paineis .painel:nth-child(2) .chip[data-c="i_L"]', (c) => c.style.getPropertyValue("--cor"));
    const scopeCor = await pg.evaluate(() => localStorage.getItem("maisim-scope-cores"));
    ok(cor === "#e41a1c" && !scopeCor, `a cor do sinal na figura (${cor}), sem mexer nas do scope (${scopeCor})`);
    await pg.keyboard.press("Escape");
    // o estilo e a grade
    const w1 = F.w;
    await pg.selectOption("#sel-estilo", "ieee2"); await espera(pg, (w) => document.getElementById("previa").naturalWidth > w * 1.8, w1);
    F = await folha(pg); ok(Math.abs(F.w / 150 * 2.54 - 18.2) < 0.2, `IEEE 2 colunas: ${(F.w / 150 * 2.54).toFixed(1)} cm de largura`);
    const h1 = F.h; await pg.selectOption("#sel-colunas", "2"); await espera(pg, (h) => document.getElementById("previa").naturalHeight < h * 0.8, h1);
    F = await folha(pg); ok(F.h < h1 * 0.8, `2 gráficos por linha: a figura mais baixa (${h1} → ${F.h} px)`);
    // o PDF
    const [dl] = await Promise.all([pg.waitForEvent("download", { timeout: 60000 }), pg.click('#exportar [data-formato="pdf"]')]);
    const p = await dl.path(), cab = fs.readFileSync(p).subarray(0, 5).toString();
    ok(/^figura_maisim_exemplo_buck_\d{8}-\d{4}\.pdf$/.test(dl.suggestedFilename()) && cab === "%PDF-", `o PDF baixado: ${dl.suggestedFilename()} (${cab})`);
    // os cartões que recolhem
    await pg.click('[data-sec="janela"] .dobra'); await pg.reload(); await espera(pg, () => document.querySelector("#previa") && !document.getElementById("previa").hidden);
    ok(await pg.$eval('[data-sec="janela"]', (e) => e.classList.contains("recolhida") && getComputedStyle(e.querySelector(".corpo")).display === "none"),
       "a janela de tempo recolhida, guardada ao recarregar");
    // em inglês e no tema escuro
    await pg.evaluate(() => { localStorage.setItem("maisim-tema", "escuro"); window.dispatchEvent(new Event("maisim-tema")); window.maisimI18n.muda("en"); });
    await pg.waitForTimeout(600);
    const en = await pg.evaluate(() => ({ h1: document.querySelector("header h1").textContent, g: document.querySelector('[data-sec="graficos"] .dobra').textContent.trim(),
      tema: document.documentElement.dataset.tema, fundo: getComputedStyle(document.body).backgroundColor, folha: getComputedStyle(document.getElementById("previa")).backgroundColor }));
    ok(en.h1 === "Figures" && /Plots/.test(en.g) && en.tema === "escuro" && en.fundo !== "rgb(247, 248, 250)" && en.folha === "rgb(255, 255, 255)",
       `em inglês e no tema escuro: ${JSON.stringify(en)}`);
    const time = await pg.evaluate(async (rel) => { const r = await fetch("figura", { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" },
      body: JSON.stringify({ arq: rel, paineis: [{ sinais: [{ canal: "v_o" }] }], estilo: { preset: "ieee1", lingua: "en" }, formato: "svg" }) }); return (await r.text()).includes("Time"); }, REL);
    ok(time, "a figura em inglês: \"Time (ms)\"");
    // o "Abrir no Figuras" do scope
    const sc = await ctx.newPage();
    await sc.goto(`${B}/maisim/scope/?a=${encodeURIComponent(REL)}`);
    await sc.waitForFunction(() => typeof A !== "undefined" && A && A.arq && paineis().some((p) => p.u), null, { timeout: 30000 });
    await sc.evaluate(() => { const p = paineis().find((q) => q.u); p.sinais = ["i_L"]; refazGrafico(p); guardaLayout(); xFaixa = [2, 3]; });
    const [fig] = await Promise.all([ctx.waitForEvent("page", { timeout: 15000 }), sc.evaluate(() => abreNoFiguras(paineis().find((q) => q.u)))]);
    await fig.waitForFunction(() => document.querySelectorAll("#paineis .painel").length && !document.getElementById("previa").hidden, null, { timeout: 60000 }).catch(() => {});
    const veio = await fig.evaluate(() => ({ g1: [...document.querySelectorAll("#paineis .painel:first-child .chip")].map((c) => c.dataset.c).join(","), t0: document.getElementById("t0").value, t1: document.getElementById("t1").value }));
    ok(veio.g1 === "i_L" && /^2 ms$/.test(veio.t0) && /^3 ms$/.test(veio.t1), `o "Abrir no Figuras" do scope: o painel e o zoom (${JSON.stringify(veio)})`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + (e.stack || e).toString().split("\n").slice(0, 3).join(" ")); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
