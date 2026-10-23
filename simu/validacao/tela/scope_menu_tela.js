// o menu "Sinais ▾" e o apagar no scope (instância de teste 7200 → scope 7202), pedido de Marcelo em 23/10: o menu abre
// embaixo do botão (não no canto, sobre o ✕ do painel), com a busca baixa e um × que fecha (e o Esc); apagar um painel com
// sinais ou uma seção com painéis pede confirmação (cancelar não apaga); um painel vazio sai direto; o traço da linha
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const PASTA = path.join(__dirname, "..", "tmp_scope_menu"), RAIZ = path.resolve(__dirname, "../../..");
fs.mkdirSync(PASTA, { recursive: true });
const NPZ = path.join(PASTA, "scope_menu.npz");
require("child_process").execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.01, 1e-4)
meta = {"planta": "gecko-maisim", "rotulo": "menu", "modelo": "x/circuito_menu.ipes", "dt": 1e-4, "Ts": 1e-4, "tfim": 0.01, "sinais": [], "acionamentos": []}
np.savez(${JSON.stringify(NPZ)}, meta=np.array(json.dumps(meta)), t=t, v_o=np.sin(t), i_L=np.cos(t))`]);
const URL = "http://localhost:7200/maisim/scope/?a=" + encodeURIComponent(path.relative(RAIZ, NPZ));
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1300, height: 850 } });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem("ja")) { sessionStorage.setItem("ja", "1");
      localStorage.setItem("maisim-scope-layout-v5:x/circuito_menu.ipes", JSON.stringify({ itens: [{ secao: "S1" }, { titulo: "Tensão", sinais: ["v_o"] },
        { secao: "S2" }, { titulo: "Corrente", sinais: ["i_L"] }, { titulo: "Vazio", sinais: [] }] })); } });
    const pg = await ctx.newPage(); const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto(URL); await pg.waitForFunction(() => typeof A !== "undefined" && A && A.dados && paineis().some((p) => p.u), null, { timeout: 20000 }); await pg.waitForTimeout(300);
    const nomes = () => pg.evaluate(() => itens.map((x) => (x.tipo === "secao" ? "S:" : "P:") + x.titulo).join(" "));
    const cartao = (t) => `.cartao:has(input.titulo[title="${t}"])`;
    // 1. o menu: embaixo do botão, sem cobrir o ✕; a busca baixa; o × e o Esc fecham
    await pg.click(`${cartao("Tensão")} .b-sinais`); await pg.waitForSelector(".menu");
    const m = await pg.evaluate(() => { const menu = document.querySelector(".menu"), c = menu.parentElement, r = menu.getBoundingClientRect(), x = c.querySelector(".b-rem").getBoundingClientRect(),
      bt = c.querySelector(".b-sinais").getBoundingClientRect(), q = menu.querySelector("input.busca");
      const cobre = !(r.right < x.left || r.left > x.right || r.bottom < x.top || r.top > x.bottom);
      return { cobre, alinhado: Math.abs(r.left - bt.left) < 8, foco: document.activeElement === q, altura: Math.round(q.getBoundingClientRect().height), fecha: !!menu.querySelector(".menu-fecha") }; });
    await pg.click(".menu .menu-fecha"); await pg.waitForTimeout(100); const fechouX = !(await pg.$(".menu"));
    await pg.click(`${cartao("Tensão")} .b-sinais`); await pg.waitForSelector(".menu"); await pg.keyboard.press("Escape"); await pg.waitForTimeout(100); const fechouEsc = !(await pg.$(".menu"));
    ok(!m.cobre && m.alinhado && m.foco && m.altura <= 26 && m.fecha && fechouX && fechouEsc,
      `menu Sinais: embaixo do botão, sem cobrir o ✕; a busca (${m.altura} px) já em foco; o × e o Esc fecham`);
    // o traço da linha (Marcelo, 23/10): na paleta do sinal, ao lado da espessura — contínua, tracejada, pontilhada
    // a setinha ao lado da bolinha abre e recolhe a paleta (e gira)
    await pg.click(`${cartao("Tensão")} .b-sinais`); await pg.waitForSelector(".menu");
    const seta0 = await pg.evaluate(() => { const b = document.querySelector(".menu button.abre-paleta"); return b && !b.classList.contains("aberta") && !document.querySelector(".menu .paleta"); });
    await pg.click(".menu button.abre-paleta"); await pg.waitForSelector(".menu button.traco");
    const seta1 = await pg.evaluate(() => document.querySelector(".menu button.abre-paleta").classList.contains("aberta"));
    await pg.click(".menu button.abre-paleta"); await pg.waitForTimeout(100);
    const seta2 = await pg.evaluate(() => !document.querySelector(".menu .paleta") && !document.querySelector(".menu button.abre-paleta").classList.contains("aberta"));
    ok(seta0 && seta1 && seta2, "a setinha ao lado da cor abre a paleta (e gira) e recolhe");
    await pg.click(".menu button.abre-paleta"); await pg.waitForSelector(".menu button.traco");
    const nTracos = await pg.$$eval(".menu button.traco", (bs) => bs.map((x) => x.dataset.t).join(","));
    await pg.click('.menu button.traco[data-t="tracejada"]'); await pg.waitForTimeout(200);
    const tr = await pg.evaluate(() => ({ dash: JSON.stringify(paineis().find((p) => p.titulo === "Tensão").u.series[1].dash), guardado: localStorage.getItem("maisim-scope-tracos"),
      atual: document.querySelector(".menu button.traco.atual") && document.querySelector(".menu button.traco.atual").dataset.t }));
    await pg.keyboard.press("Escape");
    ok(nTracos === "continua,tracejada,pontilhada" && tr.dash === "[8,5]" && tr.guardado === '{"v_o":"tracejada"}', `o traço: ${nTracos}; tracejada vale na curva (${tr.dash}) e fica guardada (${tr.guardado})`);
    // 2. apagar um painel com sinais: pergunta; cancelar não apaga; confirmar apaga
    const n0 = await nomes();
    await pg.click(`${cartao("Corrente")} .b-rem`); await pg.waitForSelector(".sc-modal"); const txt = await pg.textContent(".sc-modal");
    await pg.click(".sc-modal .sc-cancela"); await pg.waitForTimeout(150); const n1 = await nomes();
    await pg.click(`${cartao("Corrente")} .b-rem`); await pg.waitForSelector(".sc-modal"); await pg.click(".sc-modal .sc-ok"); await pg.waitForTimeout(150); const n2 = await nomes();
    ok(/Apagar o painel “Corrente”/.test(txt) && n1 === n0 && !/P:Corrente/.test(n2), `painel com sinais: pergunta ("${txt.slice(0, 40)}…"); cancelar fica, confirmar apaga (${n2})`);
    // 3. um painel vazio sai direto
    await pg.click(`${cartao("Vazio")} .b-rem`); await pg.waitForTimeout(150);
    ok(!(await pg.$(".sc-modal")) && !/P:Vazio/.test(await nomes()), "painel vazio: sai sem perguntar");
    // 4. uma seção com painéis: pergunta (os painéis passam para a de cima)
    await pg.evaluate(() => { const s = itens.find((x) => x.tipo === "secao" && x.titulo === "S1"); s.el.querySelector(".b-rem").click(); });
    await pg.waitForSelector(".sc-modal"); const ts = await pg.textContent(".sc-modal"); await pg.click(".sc-modal .sc-ok"); await pg.waitForTimeout(150);
    const n4 = await nomes();
    ok(/Apagar a seção “S1”/.test(ts) && /passa para a seção de cima/.test(ts) && !/S:S1/.test(n4) && /P:Tensão/.test(n4), `seção com painel: pergunta; sai só a seção, o painel fica (${n4})`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
