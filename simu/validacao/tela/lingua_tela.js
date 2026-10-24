// o MaiSim em português e inglês (24/10/2026), pela tela (instância de teste 7200): o botão PT/EN no pé do trilho troca o
// idioma, e as outras janelas acompanham (a do simu aberta antes, a janela à parte do scope); a escolha fica (recarregar);
// voltar ao português devolve os mesmos textos de antes. A varredura com o pseudo-idioma (?lingua=xx: todo texto traduzido
// aparece como ⟦…⟧) conta o que ainda escapa da tradução em cada página pronta (o simu com a aba Controle, uma tabela e a
// janela da IA abertas) — tem que dar zero. A 1ª vez, sem nada escolhido, segue o navegador (e o servidor também).
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const B = "http://localhost:7200";
// o que não é texto do MaiSim (dados do usuário, números, nomes próprios): fora da varredura
const DADO = [".rodada .info", "#so-circ > span", "#maisim-nav .marca", "#maisim-nav .pct", '[lang="en"]',   // [lang=en]: inglês de propósito (o slogan)
  // o simu: o circuito (nomes, rótulos, sinais), o código, os nomes da paleta, o histórico, a conversa, o nome do arquivo
  "#svg", "#ctl-editor", "#ctl-diag-svg", "#itens .item", "#hist li", "#cc-msgs", "#trilha", "#titulo-pagina", "#sel-modelo", "#info"];
const LIVRE = /^[\s\d.,:;%·\-−+×…/()°ΩµkMGBVAHzs→]*$|^(MaiSim|PT|EN|OK|Scope|Layout ▾|\?)$/;   // iguais nos dois idiomas

// o simu: o exemplo com controle aberto (um "descartar?" da instância de teste: aceita), a aba Controle, a 1ª tabela; depois a IA
async function preparaSimu(pg) {
  for (let k = 0; k < 40 && !(await pg.evaluate(() => typeof dados !== "undefined" && !!dados && !!dados.editor).catch(() => false)); k++) {
    if (await pg.$(".modal .m-ok")) await pg.click(".modal .m-ok").catch(() => {}); await pg.waitForTimeout(500); }
  if (!(await pg.evaluate(() => document.querySelector("#bt-ctl").classList.contains("ativo")))) await pg.click("#bt-ctl");
  await pg.waitForTimeout(800);
  await pg.click("#ctl-var-lista [data-tabela]", { timeout: 3000 }).catch(() => {}); await pg.waitForTimeout(600);
}
async function abreIA(pg) { await pg.click("#bt-claude", { timeout: 3000 }).catch(() => {}); await pg.waitForTimeout(1500); }
// as páginas prontas (cada PR de tradução põe a sua aqui): [nome, endereço, [[o que abrir antes de varrer, função]…]]
const PRONTAS = [["página inicial", "/"], ["scope", "/maisim/scope/"],
  ["simu", "/maisim/simu/?modelo=exemplos/exemplo_controle_pi.ipes", [["a aba Controle e uma tabela", preparaSimu], ["a janela da IA", abreIA]]]];
// a casca do simu (o HTML traduzido) e os títulos que o código troca: ida ao inglês e volta devolvem o mesmo português
const fotoCasca = () => [...document.querySelectorAll("[data-tr],[data-tr-html],[data-tr-title],[data-tr-ph],[data-tr-aria],[data-tr-msg],#ctl-lado-bt,th[data-col]")]
  .map((e) => [e.id || e.className, e.getAttribute("title"), e.getAttribute("placeholder"), e.getAttribute("aria-label"), e.getAttribute("data-msg"), e.textContent].join("|"));

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
    await simu.waitForTimeout(1500); const cascaAntes = await simu.evaluate(fotoCasca);
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
    const s2 = await simu.evaluate(() => ({ l: maisimI18n.lingua(), rot: document.querySelector('#maisim-nav a[href="/maisim/simu/"]').dataset.rotulo, bt: document.querySelector("#maisim-nav .lingua").textContent,
      vz: document.querySelector("#vz-novo").textContent, novo: document.querySelector("#bt-novo").getAttribute("title"), ph: document.querySelector("#busca").placeholder,
      ctl: document.querySelector('#abas-doca [data-aba="controle"]').textContent, msg: document.querySelector("#painel-controle").dataset.msg.slice(0, 15) }));
    ok(s2.l === "en" && s2.rot === "Simu · build and simulate" && s2.bt === "PT" && s2.vz === "+ New circuit" && s2.novo === "new circuit (blank sheet)"
       && s2.ph === "search component…" && s2.ctl === "Control" && s2.msg === "no circuit open", `a outra janela (o simu) acompanha na hora, com a casca: ${JSON.stringify(s2)}`);
    // a janela à parte (o scope, janela=1) abre já em inglês; recarregar mantém
    const sj = await ctx.newPage(); await sj.goto(B + "/maisim/scope/?janela=1"); await sj.waitForTimeout(800);
    await inicio.reload(); await inicio.waitForSelector("#maisim-nav .lingua");
    const fica = await inicio.evaluate(() => document.querySelector("#cartao-novo h2").textContent);
    ok(await sj.evaluate(() => maisimI18n.lingua()) === "en" && fica === "+ New circuit", `a janela à parte em inglês; recarregada, a escolha fica ("${fica}")`);
    // a 1ª carga do maisim-i18n.js falha (a conexão caiu): a reserva segura o português e, quando o de verdade chega, a página
    // e o trilho passam ao inglês escolhido, com o botão PT/EN
    let cargas = 0; const I18N = /\/maisim-i18n\.js(\?.*)?$/;
    await ctx.route(I18N, (r) => (cargas++ ? r.continue() : r.abort()));
    const rp = await ctx.newPage(); await rp.goto(B + "/");
    let rr = null;
    for (let i = 0; i < 25 && !(rr && rr.h2 === "+ New circuit" && rr.bt === "PT" && rr.rot === "Home"); i++) { await rp.waitForTimeout(400);
      rr = await rp.evaluate(() => ({ h2: document.querySelector("#cartao-novo h2")?.textContent, rot: document.querySelector('#maisim-nav a.item[href="/"]')?.dataset.rotulo,
        bt: document.querySelector("#maisim-nav .lingua:not([hidden])")?.textContent, reserva: !!window.maisimI18n?.reserva })).catch(() => null); }
    ok(cargas >= 2 && rr && rr.h2 === "+ New circuit" && rr.rot === "Home" && rr.bt === "PT" && !rr.reserva,
      `sem o maisim-i18n.js na 1ª carga: a reserva e depois o de verdade, em inglês (${cargas} cargas, ${JSON.stringify(rr)})`);
    await ctx.unroute(I18N); await rp.close();
    // uma página só com o trilho, sem o motor (a do Gecko): os rótulos em português, nenhuma chave crua
    await ctx.route(B + "/teste-sem-i18n", (r) => r.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/maisim-nav.js"></script></body></html>' }));
    const sem = await ctx.newPage(); await sem.goto(B + "/teste-sem-i18n"); await sem.waitForSelector("#maisim-nav .tema");
    const rs = await sem.evaluate(() => [...document.querySelectorAll("#maisim-nav .item")].map((e) => e.dataset.rotulo || e.getAttribute("aria-label") || ""));
    ok(rs.includes("Início") && !rs.some((x) => /\bnav\./.test(x)) && !(await sem.$("#maisim-nav .lingua:not([hidden])")),
      `sem o motor, o trilho em português e sem o botão PT/EN (${rs.filter(Boolean).slice(0, 4).join(" | ")}…)`);
    await sem.close();
    // a varredura (pseudo-idioma) nas páginas prontas e no trilho: nada escapa
    const vp = await ctx.newPage();
    for (const [nome, url, passos] of PRONTAS) {
      await vp.goto(B + url + (url.includes("?") ? "&" : "?") + "lingua=xx"); await vp.waitForTimeout(1500);
      if (url === "/") { await vp.click("#cartao-exemplos", { timeout: 2000 }).catch(() => {}); await vp.click("#bt-todas", { timeout: 2000 }).catch(() => {}); await vp.waitForTimeout(400); }
      for (const [rotulo, f] of passos || [["", null]]) {
        if (f) await f(vp);
        const fora = await varre(vp);
        ok(fora.length === 0, `varredura de ${nome}${rotulo ? " (" + rotulo + ")" : ""} (em inglês, com o pseudo-idioma): ${fora.length} texto(s) fora da tradução${fora.length ? " — " + fora.slice(0, 6).join(" | ") : ""}`);
      }
    }
    // de volta ao português: os mesmos textos de antes
    await Promise.all([inicio.waitForNavigation(), inicio.click("#maisim-nav .lingua")]); await inicio.waitForSelector("#maisim-nav .lingua");
    const volta = await inicio.evaluate(() => ({ bt: document.querySelector("#maisim-nav .lingua").textContent, h2: document.querySelector("#cartao-novo h2").textContent,
      rot: document.querySelector('#maisim-nav a.item[href="/"]').dataset.rotulo, lang: document.documentElement.lang }));
    ok(JSON.stringify(volta) === JSON.stringify(antes), `de volta ao português: os mesmos textos (${JSON.stringify(volta)})`);
    await simu.waitForTimeout(500); const cascaVolta = await simu.evaluate(fotoCasca);
    const difs = cascaVolta.filter((x, i) => x !== cascaAntes[i]);
    ok(cascaAntes.length > 100 && cascaVolta.length === cascaAntes.length && !difs.length,
      `o simu de volta ao português: a casca igual (${cascaAntes.length} elementos${difs.length ? "; diferentes: " + difs.slice(0, 3).join(" ; ") : ""})`);
    // a 1ª vez, sem nada escolhido: o idioma do navegador (perfis novos, fora do _lingua.js que fixa o português nos testes); o
    // cookie leva a marca de detectado (maisim-lingua-auto) e o servidor responde no mesmo idioma (um erro de propósito: um
    // arquivo do simu que não existe — sem mudar nada)
    for (const [locale, espera, erroApi] of [["en-US", "+ New circuit", "not found"], ["pt-PT", "+ Novo circuito", "não achei"], ["pt-BR", "+ Novo circuito", "não achei"]]) {
      let dir = null, pc = null;
      try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "maisim-lingua-"));
        pc = await chromium.launchPersistentContext(dir, { locale });
        const pg = pc.pages()[0] || await pc.newPage(); pg.on("pageerror", (e) => erros.push(`${locale}: ${e.message}`));
        await pg.goto(B + "/"); await pg.waitForSelector("#maisim-nav .lingua");
        const r = await pg.evaluate(async () => {
          const api = await fetch("/maisim/simu/static/lingua_nao_existe.js").then(async (q) => ({ st: q.status, erro: (await q.json().catch(() => ({}))).erro }))
            .catch((e) => ({ st: 0, erro: e.message }));
          return { h2: document.querySelector("#cartao-novo h2").textContent, l: maisimI18n.lingua(), ck: document.cookie.match(/maisim-lingua=\w+/)?.[0],
            auto: /(?:^|;\s*)maisim-lingua-auto=1\b/.test(document.cookie), api };
        });
        ok(r.h2 === espera && r.ck === `maisim-lingua=${r.l}` && r.auto && r.api.st === 404 && r.api.erro === erroApi,
          `a 1ª vez com o navegador em ${locale}: "${r.h2}" (${r.l}, ${r.ck}${r.auto ? " + a marca auto" : ", SEM a marca auto"}); o servidor: ${r.api.st} "${r.api.erro}"`);
      } catch (e) { ok(false, `a 1ª vez com o navegador em ${locale}: caiu (${e.message.split("\n")[0]})`); }
      finally { if (pc) await pc.close().catch(() => {}); if (dir) fs.rmSync(dir, { recursive: true, force: true }); }
    }
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
