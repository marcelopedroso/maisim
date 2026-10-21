// scope: recolher e expandir, arrastar seções (pedido de Marcelo, 19/10) — na instância isolada (Vite 7210 → scope de
// teste 7211; ../sobe_fila.sh). Um layout de três seções (S1: Va, S2: Vb, S3: theta) sobre uma gravação pequena só para o
// ensaio, apagada no fim. Confere: a seta da seção esconde os painéis dela e conta quantos são; a seta do painel deixa
// só o título; os dois ficam guardados ao recarregar; ⤢ expande o painel para a janela (Esc, o botão e o clique fora
// voltam ao tamanho de antes); a ⠿ da seção a leva inteira, com os painéis, para antes de outra seção ou para o fim; o
// nome da seção no índice também arrasta; e o arrastar de painel continua funcionando com o scope dentro de um iframe,
// como na doca do simu
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const SM = path.resolve(__dirname, "../../.."), PASTA = path.join(__dirname, "..", "tmp_scope_recolher"), ARQ = path.join(PASTA, "scope_recolher_teste.npz");
const LAYOUT = { colunas: 1, indice: { aberto: false, unica: false, secao: -1 }, itens: [
  { secao: "S1" }, { titulo: "P_Va", sinais: ["Va"], largura: 1 },
  { secao: "S2" }, { titulo: "P_Vb", sinais: ["Vb"], largura: 1 },
  { secao: "S3" }, { titulo: "P_theta", sinais: ["theta"], largura: 1 }] };
(async () => {
  let b;
  try {
    fs.mkdirSync(PASTA, { recursive: true });
    execFileSync("python3", ["-c", `import numpy as np, json
t = np.arange(0, 0.06, 1e-4); w = 2 * np.pi * 50
meta = {"planta": "gecko-maisim", "rotulo": "recolher_teste", "dt": 1e-4, "Ts": 1e-4, "n_fino": 1, "dt_gecko": 1e-6, "tfim": 0.06,
        "sinais": [{"canal": "Va", "elemento": "VOLT.1"}, {"canal": "Vb", "elemento": "VOLT.2"}], "acionamentos": []}
np.savez(${JSON.stringify(ARQ)}, meta=np.array(json.dumps(meta)), t=t, Va=180*np.cos(w*t), Vb=180*np.cos(w*t - 2*np.pi/3), theta=(w*t) % (2*np.pi))`]);
    const url = "http://localhost:7210/maisim/scope/?so=rodada&a=" + encodeURIComponent(path.relative(SM, ARQ));
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1300 } });
    await ctx.addInitScript((L) => { try { if (!sessionStorage.getItem("ja")) { localStorage.setItem("maisim-scope-layout-v3", L); sessionStorage.setItem("ja", "1"); } } catch (e) { /* ok */ } }, JSON.stringify(LAYOUT));
    const pg = await ctx.newPage(); const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    const abre = async () => { await pg.goto(url); await pg.waitForFunction(() => [...document.querySelectorAll(".cartao")].filter((c) => c._painel && c._painel.u).length === 3, null, { timeout: 30000 }); await pg.waitForTimeout(300); };
    await abre();
    const estado = () => pg.evaluate(() => ({
      ordem: [...document.querySelectorAll("#paineis > .secao, #paineis > .cartao")].map((e) => e.classList.contains("secao") ? e.querySelector(".titulo-secao").value : e._painel.titulo).join(" "),
      paineis: Object.fromEntries([...document.querySelectorAll(".cartao")].map((c) => { const r = c.getBoundingClientRect(), p = c._painel;
        return [p.titulo, { visivel: !c.classList.contains("oculto") && r.height > 0, w: Math.round(r.width), h: Math.round(r.height), gw: p.u ? Math.round(p.u.width) : 0, gh: p.u ? Math.round(p.u.height) : 0,
          area: c.querySelector(".area").offsetHeight, fixo: getComputedStyle(c).position === "fixed" }]; })),
      n: Object.fromEntries([...document.querySelectorAll(".secao")].map((s) => [s.querySelector(".titulo-secao").value, s.querySelector(".n-rec").textContent])),
      guardado: JSON.parse(localStorage.getItem("maisim-scope-layout-v3")) }));
    const secao = (t) => `.secao:has(.titulo-secao[value="${t}"])`;
    // arrastar como uma pessoa: desce o botão, anda em passos, solta (o dragAndDrop do Playwright não começa o arrasto se
    // precisar rolar a página; aqui a janela é alta o bastante para tudo ficar à vista)
    const arrasta = async (P, de, para) => { await P.mouse.move(de.x, de.y); await P.mouse.down();
      for (let k = 1; k <= 10; k++) await P.mouse.move(de.x + (para.x - de.x) * k / 10, de.y + (para.y - de.y) * k / 10); await P.mouse.up(); await pg.waitForTimeout(400); };
    const ponto = (F, sel, dx, dy) => F.evaluate(([s, dx, dy]) => { const r = document.querySelector(s).getBoundingClientRect();
      return { x: r.left + (dx == null ? r.width / 2 : dx), y: r.top + (dy == null ? r.height / 2 : dy) }; }, [sel, dx, dy]);
    await pg.evaluate(() => document.querySelectorAll(".titulo-secao").forEach((i) => i.setAttribute("value", i.value)));
    // 1. recolher a seção S2
    let e0 = await estado();
    ok(e0.ordem === "S1 P_Va S2 P_Vb S3 P_theta" && e0.paineis.P_Vb.visivel && e0.paineis.P_Vb.gw > 600, `layout de três seções carregado (${e0.ordem})`);
    await pg.click(`${secao("S2")} .b-rec`); await pg.waitForTimeout(400);
    let e = await estado();
    ok(!e.paineis.P_Vb.visivel && e.paineis.P_Va.visivel && e.paineis.P_theta.visivel && e.n.S2 === "1 painel",
      `seta da S2: o painel dela some, os outros ficam; o título mostra "${e.n.S2}"`);
    // 2. recolher o painel P_theta
    await pg.evaluate(() => [...document.querySelectorAll(".cartao")].find((c) => c._painel.titulo === "P_theta").querySelector(".cab .b-rec").click());
    await pg.waitForTimeout(400); e = await estado();
    ok(e.paineis.P_theta.visivel && e.paineis.P_theta.area === 0 && e.paineis.P_theta.h < 60, `seta do painel P_theta: fica só o título (${e.paineis.P_theta.h} px de altura, gráfico escondido)`);
    const g = e.guardado.itens;
    ok(g[2].recolhida === true && g[5].recolhido === true && !g[0].recolhida && !g[1].recolhido, "os dois recolhidos ficam no layout guardado");
    // 3. recarregar: continuam recolhidos; abrir de novo devolve o gráfico na largura certa
    await pg.reload(); await pg.waitForFunction(() => [...document.querySelectorAll(".cartao")].filter((c) => c._painel && c._painel.u).length === 3, null, { timeout: 30000 }); await pg.waitForTimeout(300);
    await pg.evaluate(() => document.querySelectorAll(".titulo-secao").forEach((i) => i.setAttribute("value", i.value)));
    e = await estado();
    ok(!e.paineis.P_Vb.visivel && e.paineis.P_theta.area === 0, "recarregado: a S2 e o P_theta continuam recolhidos");
    await pg.evaluate(() => { [...document.querySelectorAll(".secao")].find((s) => s.querySelector(".titulo-secao").value === "S2").querySelector(".b-rec").click();
      [...document.querySelectorAll(".cartao")].find((c) => c._painel.titulo === "P_theta").querySelector(".cab .b-rec").click(); });
    await pg.waitForTimeout(500); e = await estado();
    ok(e.paineis.P_Vb.visivel && e.paineis.P_Vb.gw > 600 && e.paineis.P_theta.area > 150 && e.paineis.P_theta.gw > 600,
      `abertos de novo: P_Vb e P_theta com gráfico (${e.paineis.P_Vb.gw} e ${e.paineis.P_theta.gw} px de largura)`);
    // 4. expandir o P_Va: ocupa a janela; Esc volta
    const antes = (await estado()).paineis.P_Va;
    const expandeVa = () => pg.evaluate(() => [...document.querySelectorAll(".cartao")].find((c) => c._painel.titulo === "P_Va").querySelector(".b-exp").click());
    await expandeVa(); await pg.waitForTimeout(400); e = await estado();
    const fundo = await pg.evaluate(() => !document.getElementById("fundo-exp").hidden);
    const remVisivel = await pg.evaluate(() => [...document.querySelectorAll(".cartao")].find((c) => c._painel.titulo === "P_Va").querySelector(".b-rem").offsetParent !== null);
    ok(e.paineis.P_Va.fixo && e.paineis.P_Va.w > 1300 && e.paineis.P_Va.gh > 650 && fundo && !remVisivel,
      `⤢: o P_Va ocupa a janela (${e.paineis.P_Va.w} × ${e.paineis.P_Va.h} px, gráfico de ${e.paineis.P_Va.gh} px de altura; antes ${antes.gh}); o ✕ de remover some enquanto expandido`);
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(400); e = await estado();
    ok(!e.paineis.P_Va.fixo && Math.abs(e.paineis.P_Va.gh - antes.gh) < 2 && Math.abs(e.paineis.P_Va.gw - antes.gw) < 3, `Esc: volta ao tamanho de antes (${e.paineis.P_Va.gw} × ${e.paineis.P_Va.gh})`);
    await expandeVa(); await pg.waitForTimeout(300); await pg.mouse.click(700, 4); await pg.waitForTimeout(400); e = await estado();
    ok(!e.paineis.P_Va.fixo && await pg.evaluate(() => document.getElementById("fundo-exp").hidden), "clique fora do painel expandido: volta");
    // 5. arrastar a S3 (com o P_theta) para antes da S1; depois a S1 para o fim
    await arrasta(pg, await ponto(pg, `${secao("S3")} .b-arrasta`), await ponto(pg, secao("S1"), 200, 2));
    e = await estado();
    ok(e.ordem === "S3 P_theta S1 P_Va S2 P_Vb", `⠿ da S3 solta em cima da S1: ${e.ordem}`);
    await arrasta(pg, await ponto(pg, `${secao("S1")} .b-arrasta`), await ponto(pg, ".cartao:last-child", 200, 200));
    e = await estado();
    ok(e.ordem === "S3 P_theta S2 P_Vb S1 P_Va", `⠿ da S1 solta no último painel: vai para o fim (${e.ordem})`);
    await pg.reload(); await pg.waitForFunction(() => [...document.querySelectorAll(".cartao")].filter((c) => c._painel && c._painel.u).length === 3, null, { timeout: 30000 });
    await pg.evaluate(() => document.querySelectorAll(".titulo-secao").forEach((i) => i.setAttribute("value", i.value)));
    e = await estado();
    ok(e.ordem === "S3 P_theta S2 P_Vb S1 P_Va", `recarregado: a ordem nova ficou guardada (${e.ordem})`);
    // 6. no índice: arrastar o nome da S1 para o topo
    await pg.click("#bt-indice"); await pg.waitForTimeout(300);
    const si = (t) => pg.evaluate((t) => { const r = [...document.querySelectorAll("#indice .s")].find((x) => x.textContent === t).getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; }, t);
    const s3 = await si("S3"); await arrasta(pg, await si("S1"), { x: s3.x, y: s3.y - 6 });
    await pg.evaluate(() => document.querySelectorAll(".titulo-secao").forEach((i) => i.setAttribute("value", i.value)));
    e = await estado();
    ok(e.ordem === "S1 P_Va S3 P_theta S2 P_Vb", `no índice: o nome da S1 solto em cima da S3 leva a seção para o topo (${e.ordem})`);
    await pg.click("#bt-indice");
    // 7. o painel pela ⠿ dentro de um iframe (como na doca do simu): P_Vb para antes do P_Va
    const pf = await ctx.newPage(); pf.on("pageerror", (x) => erros.push(x.message));
    await pf.goto("http://localhost:7210/");
    await pf.evaluate((u) => { document.body.innerHTML = `<iframe src="${u}" style="position:fixed;left:0;top:0;width:1100px;height:1250px;border:0"></iframe>`; }, url);
    const fr = await (await pf.waitForSelector("iframe")).contentFrame();
    await fr.waitForFunction(() => [...document.querySelectorAll(".cartao")].filter((c) => c._painel && c._painel.u).length === 3, null, { timeout: 30000 });
    await fr.evaluate(() => document.querySelectorAll("input.titulo").forEach((i) => i.setAttribute("value", i.value)));
    await arrasta(pf, await ponto(fr, `.cartao:has(input.titulo[value="P_theta"]) .b-arrasta`), await ponto(fr, `.cartao:has(input.titulo[value="P_Va"])`, 300, 10));
    const ordemF = await fr.evaluate(() => [...document.querySelectorAll("#paineis > .cartao")].map((c) => c._painel.titulo).join(" "));
    ok(ordemF.startsWith("P_theta P_Va"), `dentro de um iframe: a ⠿ do P_theta solta em cima do P_Va o põe antes dele (${ordemF})`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); fs.rmSync(PASTA, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
