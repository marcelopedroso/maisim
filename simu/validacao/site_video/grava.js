// grava o vídeo do site maisim.org (instância de teste 7200; rode pelo grava.sh, que sobe o simu de teste publicando no
// scope para as curvas nascerem ao vivo): o buck, simular, mudar a razão cíclica, simular de novo. Os quadros vêm do
// screencast do Chromium (JPEG, com o horário de cada um); as marcas (o que acontece quando) em marcas.json; monta.py faz o vídeo
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = path.join(require("os").homedir(), ".cache/maisim_teste/site_video");   // os quadros e as marcas (fora do repositório)
const DIR = path.join(BASE, "quadros");
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
const LAYOUT = { colunas: 1, indice: { aberto: false, unica: false, secao: -1 }, itens: [
  { secao: "Buck" },
  { titulo: "v_o (V) e i_L (A)", sinais: ["v_o", "i_L"], altura: 330, largura: 1, yFixo: [-2, 40] }] };   // a escala vertical fixa: a curva não "pula"
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1, colorScheme: "light" });
  await ctx.addInitScript((lay) => { try {
    localStorage.setItem("maisim-tema", "claro"); localStorage.setItem("maisim-simu-paineis", JSON.stringify({ paleta: true, props: true }));
    localStorage.setItem("maisim-scope-layout-v3", JSON.stringify(lay)); localStorage.setItem("maisim-simu-sim", JSON.stringify({ nome: "buck" }));
    localStorage.setItem("maisim-escala", "1"); } catch (e) {} }, LAYOUT);
  const pg = await ctx.newPage(); pg.on("pageerror", (e) => console.log("erro:", e.message));
  await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent("exemplos/exemplo_buck.ipes"));
  for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal .m-ok")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
  await pg.evaluate(() => { mostraScope(true, urlScope(null)); });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { ajusta(); });
  // o cursor desenhado (o headless não mostra o do sistema) e o "clique" (um anel)
  await pg.evaluate(() => {
    const c = document.createElement("div"); c.id = "cursor-video";
    c.innerHTML = '<svg width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16.5 L10.5 24 L13.5 22.6 L10 15.3 L16.5 15.3 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0px", top: "0px", zIndex: 99999, pointerEvents: "none", transform: "translate(-2px,-2px)" });
    document.body.appendChild(c);
    window.__cursor = (x, y) => { c.style.left = x + "px"; c.style.top = y + "px"; };
    window.__clique = (x, y) => { const a = document.createElement("div");
      Object.assign(a.style, { position: "fixed", left: x - 14 + "px", top: y - 14 + "px", width: "28px", height: "28px", borderRadius: "50%", border: "3px solid #6d28d9",
        zIndex: 99998, pointerEvents: "none", transition: "transform .45s ease-out, opacity .45s ease-out" });
      document.body.appendChild(a); requestAnimationFrame(() => { a.style.transform = "scale(1.8)"; a.style.opacity = "0"; }); setTimeout(() => a.remove(), 600); };
    window.__cursor(720, 420);
  });
  await pg.waitForTimeout(800);
  // o screencast
  const cdp = await ctx.newCDPSession(pg); let n = 0;
  cdp.on("Page.screencastFrame", async (f) => {
    fs.writeFileSync(path.join(DIR, `${String(n++).padStart(5, "0")}_${f.metadata.timestamp.toFixed(3)}.jpg`), Buffer.from(f.data, "base64"));
    try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch (e) { /* fim */ }
  });
  const marcas = {}; const marca = (k) => { marcas[k] = Date.now() / 1000; };
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  // o cursor anda devagar até o ponto (e o mouse de verdade junto)
  let cx = 720, cy = 420;
  const vai = async (x, y, ms = 700) => { const passos = Math.max(8, Math.round(ms / 25));
    for (let k = 1; k <= passos; k++) { const t = k / passos, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const px = cx + (x - cx) * e, py = cy + (y - cy) * e; await pg.mouse.move(px, py); await pg.evaluate(([a, b2]) => window.__cursor(a, b2), [px, py]); await pg.waitForTimeout(18); }
    cx = x; cy = y; };
  const clica = async () => { await pg.evaluate(([a, b2]) => window.__clique(a, b2), [cx, cy]); await pg.mouse.down(); await pg.mouse.up(); };
  const centro = async (sel) => { const r = await (await pg.$(sel)).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const tela = (gx, gy) => pg.evaluate(([x, y]) => { const s = $("svg"), m = s.getScreenCTM(), pt = s.createSVGPoint(); pt.x = x * G; pt.y = y * G; const q = pt.matrixTransform(m); return [q.x, q.y]; }, [gx, gy]);
  const fimRodada = () => pg.waitForFunction(() => sim.estado === "fim" || sim.estado === "parada" || sim.estado === "erro", null, { timeout: 180000 });
  // ao vivo, o tempo fixo de 0 a 20 ms (a curva cresce da esquerda para a direita, sem a escala se refazer a cada lote)
  const tempoFixo = setInterval(async () => { for (const f of pg.frames()) if (f.url().includes("/maisim/scope/")) {
    try { await f.evaluate(() => { if (typeof xFaixa !== "undefined" && !xFaixa && typeof A !== "undefined" && A) { xFaixa = [0, 20]; redesenha(); } }); } catch (e) { /* recarregando */ } } }, 100);
  await pg.evaluate(() => { sim.par.dt = "1e-7"; });   // a rodada mais devagar (e mais fina): o começo da curva nasce em ~5 s, ao vivo
  marca("inicio");
  await pg.waitForTimeout(1500);
  // 1. simular
  await vai(...(await centro("#bt-play")), 1100); await pg.waitForTimeout(250); marca("play1"); await clica();
  await pg.waitForFunction(() => sim.estado === "rodando" || sim.estado === "preparando", null, { timeout: 30000 }).catch(() => {});
  marca("rodando1"); await fimRodada(); marca("fim1");
  await pg.waitForTimeout(3500); marca("visto1");
  // 2. o bloco da razão cíclica: um clique seleciona, outro abre o painel; 0,5 → 0,3
  const cst = await pg.evaluate(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "CONST.1"); return [e.x, e.y]; });
  const [kx, ky] = await tela(cst[0], cst[1]);
  await vai(kx, ky, 1100); await pg.waitForTimeout(200); await clica(); await pg.waitForTimeout(700); await clica(); marca("painel");
  await pg.waitForSelector('#props input[data-p="const"]'); await pg.waitForTimeout(900);
  await vai(...(await centro('#props input[data-p="const"]')), 800); await pg.waitForTimeout(200);
  await pg.evaluate(([a, b2]) => window.__clique(a, b2), [cx, cy]); await pg.click('#props input[data-p="const"]', { clickCount: 3 });
  await pg.waitForTimeout(300); await pg.keyboard.type("0.3", { delay: 160 }); await pg.waitForTimeout(400); await pg.keyboard.press("Enter");
  await pg.waitForTimeout(700); marca("mudou");
  await vai(...(await centro("#aba-props")), 700); await pg.waitForTimeout(150); await clica(); await pg.waitForTimeout(700);   // recolhe o painel
  // 3. simular de novo
  await vai(...(await centro("#bt-play")), 1000); await pg.waitForTimeout(250); marca("play2"); await clica();
  await pg.waitForFunction(() => sim.estado === "rodando" || sim.estado === "preparando", null, { timeout: 30000 }).catch(() => {});
  marca("rodando2"); await fimRodada(); marca("fim2");
  await pg.waitForTimeout(4000); marca("fim");
  clearInterval(tempoFixo);
  await cdp.send("Page.stopScreencast");
  await pg.waitForTimeout(500);
  fs.writeFileSync(path.join(BASE, "marcas.json"), JSON.stringify(marcas, null, 1));
  console.log("quadros:", n, "marcas:", JSON.stringify(Object.fromEntries(Object.entries(marcas).map(([k, v]) => [k, +(v - marcas.inicio).toFixed(2)]))));
  // o exemplo volta como era (a mudança do d ficou só no Gecko de teste)
  await pg.evaluate(() => api("editor/abrir", { arq: "exemplos/exemplo_buck.ipes", modo: "descartar" }));
  await b.close();
})();
