// o MaiSim em português e inglês (24/10/2026), pela tela (instância de teste 7200): o botão PT/EN no pé do trilho troca o
// idioma, e as outras janelas acompanham (a do simu aberta antes, a janela à parte do scope); a escolha fica (recarregar);
// voltar ao português devolve os mesmos textos de antes. A varredura com o pseudo-idioma (?lingua=xx: todo texto traduzido
// aparece como ⟦…⟧) conta o que ainda escapa da tradução em cada página pronta — tem que dar zero.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const B = "http://localhost:7200";
// o que não é texto do MaiSim (dados do usuário, números, nomes próprios): fora da varredura
const DADO = [".rodada .info", "#so-circ > span", "#maisim-nav .marca", "#maisim-nav .pct", '[lang="en"]'];   // [lang=en]: inglês de propósito (o slogan)
const LIVRE = /^[\s\d.,:;%·\-−+×…/()°ΩµkMGBVAHzs→]*$|^(MaiSim|PT|EN|OK)$/;

// as páginas prontas (cada PR de tradução põe a sua aqui)
const PRONTAS = [["página inicial", "/"]];

async function varre(pg) {
  return pg.evaluate(([dado, livreSrc]) => {
    const livre = new RegExp(livreSrc), fora = [];
    const visivel = (el) => !!(el && el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";
    const dadoDe = (el) => dado.some((s) => el.closest(s));
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.nodeValue.trim(), el = n.parentElement;
      if (!t || livre.test(t) || !visivel(el) || dadoDe(el) || el.closest("script,style")) continue;
      if (!(el.textContent.includes("⟦") || (el.closest("[data-tr-html]") || {}).textContent?.includes("⟦"))) fora.push(t.slice(0, 60));
    }
    for (const el of document.querySelectorAll("[title],[placeholder],[aria-label],[data-rotulo]")) {
      if (dadoDe(el) || !(visivel(el) || el.closest("#maisim-nav"))) continue;
      for (const a of ["title", "placeholder", "aria-label", "data-rotulo"]) { const v = el.getAttribute(a);
        if (v && !livre.test(v.trim()) && !v.includes("⟦") && !(a === "title" && el.id === "so-circ")) fora.push(`${a}="${v.slice(0, 50)}"`); }
    }
    return fora;
  }, [DADO, LIVRE.source]);
}

(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1300, height: 850 } });
    const erros = []; ctx.on("page", (p) => p.on("pageerror", (e) => erros.push(e.message)));
    const inicio = await ctx.newPage(); inicio.on("pageerror", (e) => erros.push(e.message));
    await inicio.goto(B + "/"); await inicio.waitForSelector("#maisim-nav .lingua");
    const simu = await ctx.newPage(); await simu.goto(B + "/maisim/simu/"); await simu.waitForSelector("#maisim-nav .lingua");
    const antes = await inicio.evaluate(() => ({ bt: document.querySelector("#maisim-nav .lingua").textContent, h2: document.querySelector("#cartao-novo h2").textContent,
      rot: document.querySelector('#maisim-nav a.item[href="/"]').dataset.rotulo, lang: document.documentElement.lang }));
    ok(antes.bt === "EN" && antes.h2 === "+ Novo circuito" && antes.rot === "Início" && antes.lang === "pt-BR",
      `em português: o botão mostra "${antes.bt}" (o outro idioma), "${antes.h2}", o trilho "${antes.rot}", <html lang=${antes.lang}>`);
    // trocar no trilho da página inicial: ela recarrega em inglês; o simu (outra janela) acompanha sem recarregar
    await Promise.all([inicio.waitForNavigation(), inicio.click("#maisim-nav .lingua")]);
    await inicio.waitForSelector("#maisim-nav .lingua"); await inicio.waitForTimeout(300);
    const en = await inicio.evaluate(() => ({ bt: document.querySelector("#maisim-nav .lingua").textContent, h2: document.querySelector("#cartao-novo h2").textContent,
      p: document.querySelector("header p[data-tr]").textContent, rot: document.querySelector('#maisim-nav a.item[href="/"]').dataset.rotulo,
      tema: document.querySelector("#maisim-nav .tema").dataset.rotulo, lang: document.documentElement.lang, ck: document.cookie.match(/maisim-lingua=\w+/)?.[0] }));
    ok(en.bt === "PT" && en.h2 === "+ New circuit" && /^Build circuits/.test(en.p) && en.rot === "Home" && /^Theme:/.test(en.tema) && en.lang === "en-US" && en.ck === "maisim-lingua=en",
      `PT/EN: a página inicial em inglês ("${en.h2}", "${en.p.slice(0, 40)}…", o trilho "${en.rot}", "${en.tema}"), <html lang=${en.lang}>, ${en.ck}`);
    await simu.waitForTimeout(500);
    const s2 = await simu.evaluate(() => ({ l: maisimI18n.lingua(), rot: document.querySelector('#maisim-nav a[href="/maisim/simu/"]').dataset.rotulo, bt: document.querySelector("#maisim-nav .lingua").textContent }));
    ok(s2.l === "en" && s2.rot === "Simu · build and simulate" && s2.bt === "PT", `a outra janela (o simu) acompanha na hora: ${JSON.stringify(s2)}`);
    // a janela à parte (o scope, janela=1) abre já em inglês; recarregar mantém
    const sj = await ctx.newPage(); await sj.goto(B + "/maisim/scope/?janela=1"); await sj.waitForTimeout(800);
    await inicio.reload(); await inicio.waitForSelector("#maisim-nav .lingua");
    const fica = await inicio.evaluate(() => document.querySelector("#cartao-novo h2").textContent);
    ok(await sj.evaluate(() => maisimI18n.lingua()) === "en" && fica === "+ New circuit", `a janela à parte em inglês; recarregada, a escolha fica ("${fica}")`);
    // a varredura (pseudo-idioma) nas páginas prontas e no trilho: nada escapa
    const vp = await ctx.newPage();
    for (const [nome, url] of PRONTAS) {
      await vp.goto(B + url + (url.includes("?") ? "&" : "?") + "lingua=xx"); await vp.waitForTimeout(1500);
      if (url === "/") { await vp.click("#cartao-exemplos").catch(() => {}); await vp.click("#bt-todas").catch(() => {}); await vp.waitForTimeout(400); }
      const fora = await varre(vp);
      ok(fora.length === 0, `varredura de ${nome} (em inglês, com o pseudo-idioma): ${fora.length} texto(s) fora da tradução${fora.length ? " — " + fora.slice(0, 6).join(" | ") : ""}`);
    }
    // de volta ao português: os mesmos textos de antes
    await Promise.all([inicio.waitForNavigation(), inicio.click("#maisim-nav .lingua")]); await inicio.waitForSelector("#maisim-nav .lingua");
    const volta = await inicio.evaluate(() => ({ bt: document.querySelector("#maisim-nav .lingua").textContent, h2: document.querySelector("#cartao-novo h2").textContent,
      rot: document.querySelector('#maisim-nav a.item[href="/"]').dataset.rotulo, lang: document.documentElement.lang }));
    ok(JSON.stringify(volta) === JSON.stringify(antes), `de volta ao português: os mesmos textos (${JSON.stringify(volta)})`);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
