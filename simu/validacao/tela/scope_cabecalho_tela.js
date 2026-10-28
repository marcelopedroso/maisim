// o cabeçalho do scope recolhido (página de teste 7200 → scope 7202), Marcelo em 28/10: "depois de carregar, recolher
// tudo isso ... e quando recolher, ter os botões mais importantes": o ▴ no fim do cabeçalho o deixa numa linha só, com a
// rodada e ☰ Índice, + Painel, + Painel XY, + Seção e Por linha; o resto (Ao vivo / Comparar, A e B, Carregar, Fixar eixos,
// Pausar, Layout, exportar, importar, salvar figura, apagar, ?) some até o ▾; fica guardado ao recarregar; a dica no idioma
const { chromium } = require("playwright");
const B = "http://localhost:7200";
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const PRINCIPAIS = ["bt-indice", "bt-painel", "bt-painel-xy", "bt-secao", "bt-porlinha", "status", "bt-cab"];
const RESTO = ["bt-vivo", "bt-comparar", "sel-a", "bt-carregar", "ck-fixar", "ck-pausar", "bt-layout", "bt-exportar", "bt-importar", "bt-salvar", "bt-apagar", "bt-ajuda"];
const olha = (pg) => pg.evaluate(([P, Rr]) => {
  const vis = (id) => { const e = document.getElementById(id); return !!(e && e.getClientRects().length); };
  const cab = document.querySelector("header"), bt = document.getElementById("bt-cab");
  const topos = P.map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top));
  return { recolhido: cab.classList.contains("recolhido"), alt: cab.offsetHeight, principais: P.filter(vis), resto: Rr.filter(vis),
    umaLinha: Math.max(...topos) - Math.min(...topos) < 12, seta: bt.textContent, aria: bt.getAttribute("aria-expanded"), dica: bt.title,
    cabH: getComputedStyle(document.documentElement).getPropertyValue("--cab-h").trim() };
}, [PRINCIPAIS, RESTO]);
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1300, height: 800 }, locale: "pt-BR" });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("teste-cab")) { localStorage.removeItem("maisim-scope-cab"); sessionStorage.setItem("teste-cab", "1"); } } catch (e) { /* ok */ } });
    const pg = await ctx.newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto(B + "/maisim/scope/"); await pg.waitForSelector("#bt-cab"); await pg.waitForTimeout(500);
    const a = await olha(pg);
    ok(!a.recolhido && a.resto.length === RESTO.length && a.principais.length === PRINCIPAIS.length && a.seta === "▴" && a.aria === "true",
       `aberto (o padrão): tudo à vista, ${a.alt} px; o ▴ "${a.dica.slice(0, 40)}…"`);
    await pg.click("#bt-cab"); await pg.waitForTimeout(300);
    const r = await olha(pg);
    ok(r.recolhido && !r.resto.length && r.principais.length === PRINCIPAIS.length && r.umaLinha && r.seta === "▾" && r.aria === "false",
       `recolhido: numa linha (${r.alt} px), só ${r.principais.join(", ")}; escondidos: ${r.resto.join(", ") || "todos os outros"}`);
    ok(r.alt < a.alt * 0.75 && r.cabH === `${r.alt}px` && /mostrar o cabeçalho inteiro/.test(r.dica),
       `mais baixo (${a.alt} → ${r.alt} px), o --cab-h do índice acompanha (${r.cabH}); a dica: "${r.dica.slice(0, 40)}…"`);
    // na largura da doca do simu (46% de uma tela de ~1350 px; Codex, #173): ainda numa linha só
    await pg.setViewportSize({ width: 620, height: 800 }); await pg.waitForTimeout(300);
    const d = await olha(pg);
    ok(d.umaLinha && d.principais.length === PRINCIPAIS.length && d.alt <= r.alt + 2, `na largura da doca (620 px): numa linha (${d.alt} px), com ${d.principais.length} itens à vista`);
    await pg.setViewportSize({ width: 1300, height: 800 }); await pg.waitForTimeout(300);
    await pg.click("#bt-painel"); await pg.waitForTimeout(300);
    ok(await pg.evaluate(() => document.querySelector("header").classList.contains("recolhido")), "+ Painel funciona com o cabeçalho recolhido (e ele continua recolhido)");
    await pg.reload(); await pg.waitForSelector("#bt-cab"); await pg.waitForTimeout(500);
    const g = await olha(pg);
    ok(g.recolhido && !g.resto.length, "recarregado: continua recolhido (guardado neste navegador)");
    await pg.evaluate(() => window.maisimI18n.muda("en")); await pg.waitForTimeout(400);
    const en = await olha(pg);
    ok(/show the whole header/.test(en.dica), `em inglês: "${en.dica.slice(0, 40)}…"`);
    await pg.evaluate(() => window.maisimI18n.muda("pt")); await pg.waitForTimeout(300);
    await pg.click("#bt-cab"); await pg.waitForTimeout(300);
    const v = await olha(pg);
    ok(!v.recolhido && v.resto.length === RESTO.length && v.alt > r.alt * 1.5, `▾ mostra tudo de novo (${v.alt} px; a linha de estado mudou com o painel novo)`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message.split("\n")[0]); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
