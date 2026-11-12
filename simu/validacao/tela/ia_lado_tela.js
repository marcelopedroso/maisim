// as colunas da tela (Marcelo, 11/11: "circuito, scope, controle, IA… quatro botões; quando selecionar aparece na tela";
// "a IA abre por cima de tudo… perde um gráfico ou controle"), no servidor de teste 7201:
//   - cada combinação dos quatro botões: as colunas ligadas cobrem a largura, uma encostada na outra, sem nada por cima; as
//     desligadas somem; sem o circuito, a primeira coluna vai até o trilho; desligar a última não faz nada;
//   - o ⇔ da IA alterna entre a estreita (440 px) e a larga (metade da janela);
//   - arrastar a borda da IA e a divisória do Controle passando por cima do iframe do Scope chega à largura pedida (antes, o
//     iframe engolia o arraste da IA); recarregar guarda as larguras;
//   - ligar o Scope (o fim de uma rodada) não desliga o Controle.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const URL = "http://localhost:7201/maisim/simu/";
const BTS = { circuito: "#bt-circ", scope: "#bt-scope", controle: "#bt-ctl", ia: "#bt-ia" };
const medidas = (pg) => pg.evaluate(() => {
  const q = (id) => { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).display === "none") return null;
    const b = e.getBoundingClientRect(); return b.width > 0 ? { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) } : null; };
  const nav = parseFloat(getComputedStyle(document.body).getPropertyValue("--maisim-nav-w")) || 0;
  return { circuito: q("tela"), props: q("props"), scope: q("col-scope"), controle: q("col-ctl"), ia: q("gaveta-ia"), larg: document.documentElement.clientWidth, nav };
});
const ligadas = (pg) => pg.evaluate(() => ({ circuito: col.circuito, scope: col.scope, controle: col.controle, ia: document.body.classList.contains("com-ia") }));
async function poe(pg, quer) {                         // liga e desliga pelos botões até ficar como pedido
  for (let i = 0; i < 3; i++) {
    const at = await ligadas(pg);
    for (const k of ["scope", "controle", "ia", "circuito"]) if (at[k] !== quer[k]) { await pg.click(BTS[k]); await pg.waitForTimeout(250); }
  }
  await pg.waitForTimeout(400);
}
const semModal = async (pg) => { for (let i = 0; i < 5 && await pg.$(".modal-fundo"); i++) { await pg.click(".modal .m-extra, .modal .m-ok, .modal .m-fechar"); await pg.waitForTimeout(600); } };
const carrega = async (pg) => { await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 }); await pg.waitForTimeout(800); await semModal(pg); };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, colorScheme: "light" });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => { try { if (!sessionStorage.getItem("colunas")) { localStorage.removeItem("maisim-simu-tela"); localStorage.removeItem("maisim-simu-ia-w");
      localStorage.setItem("maisim-simu-travado", "1"); sessionStorage.setItem("colunas", "1"); } } catch (e) { /* ok */ } });
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    await pg.goto(URL); await carrega(pg);
    ok(await pg.evaluate(() => getComputedStyle($("bt-ia-flutua")).display === "none" && !$("bt-lado") && !$("bt-baixo")),
      "no cabeçalho, os quatro botões (sem o flutuante, sem \"ao lado\"/\"embaixo\")");
    // cada combinação (com pelo menos uma ligada)
    const ruins = [];
    for (let m = 1; m < 16; m++) {
      const quer = { circuito: !!(m & 1), scope: !!(m & 2), controle: !!(m & 4), ia: !!(m & 8) };
      await poe(pg, quer);
      const x = await medidas(pg), at = await ligadas(pg);
      const ordem = ["circuito", "scope", "controle", "ia"].filter((k) => quer[k]);
      const nome = ordem.join("+");
      if (JSON.stringify(at) !== JSON.stringify(quer)) { ruins.push(`${nome}: ligadas ${JSON.stringify(at)}`); continue; }
      for (const k of ["circuito", "scope", "controle", "ia"]) if (!quer[k] && x[k]) ruins.push(`${nome}: ${k} desligada mas à vista`);
      // o circuito (com a paleta e o painel, editando ou não) começa no trilho; cada coluna encosta na anterior; a última vai até a borda
      let borda = x.nav;
      for (const k of ordem) {
        const c = k === "circuito" ? (x.props ? { l: x.circuito.l, r: x.props.r } : x.circuito) : x[k];
        if (!c) { ruins.push(`${nome}: ${k} ligada mas sem largura`); break; }
        if (k !== "circuito" && Math.abs(c.l - borda) > 2) ruins.push(`${nome}: ${k} começa em ${c.l}, a anterior termina em ${borda}`);
        if (k === "circuito" && x.circuito.l > borda + 260) ruins.push(`${nome}: o circuito começa em ${x.circuito.l}`);
        borda = c.r;
      }
      if (Math.abs(borda - x.larg) > 2) ruins.push(`${nome}: a última termina em ${borda}, a janela em ${x.larg}`);
      if (!quer.circuito && quer.scope && x.scope && Math.abs(x.scope.l - x.nav) > 2) ruins.push(`${nome}: sem o circuito, o Scope não vai até o trilho`);
    }
    ok(!ruins.length, `as 15 combinações lado a lado, sem sobrepor${ruins.length ? ": " + ruins.join(" | ") : ""}`);
    // o circuito escondido não é "nenhum circuito aberto" (o aviso do Controle e o "+ Novo circuito" ficam de fora)
    await poe(pg, { circuito: false, scope: false, controle: true, ia: false });
    ok(await pg.evaluate(() => !document.body.classList.contains("sem-circuito") && getComputedStyle($("painel-controle"), "::after").content === "none"),
      "sem a coluna do circuito, o Controle não diz \"nenhum circuito aberto\"");
    // desligar a última não faz nada
    await poe(pg, { circuito: false, scope: false, controle: true, ia: false });
    await pg.click("#bt-ctl"); await pg.waitForTimeout(300);
    ok((await ligadas(pg)).controle, "desligar a última coluna não faz nada");
    // o ⇔: com o circuito e o Controle, a IA estreita; com espaço, a larga é metade da janela
    await poe(pg, { circuito: true, scope: false, controle: true, ia: true });
    let x = await medidas(pg);
    ok(Math.abs(x.ia.w - 440) <= 2, `a IA estreita (${x.ia.w} px)`);
    await poe(pg, { circuito: true, scope: false, controle: false, ia: true });
    await pg.click("#cc-largura"); await pg.waitForTimeout(400); x = await medidas(pg);
    const meia = Math.round((x.larg - x.nav) / 2);
    ok(Math.abs(x.ia.w - meia) <= 2, `⇔ expande: a IA com ${x.ia.w} px (metade: ${meia})`);
    ok(await pg.evaluate(() => /recolher/.test($("cc-largura").title)), "e o ⇔ passa a dizer \"recolher\"");
    // a IA larga com as quatro ligadas: o Controle e o Scope não ficam abaixo do mínimo (Marcelo, 11/11: "a IA ainda espreme o controle")
    await poe(pg, { circuito: true, scope: true, controle: true, ia: true }); x = await medidas(pg);
    ok(x.controle.w >= 558 && x.scope.w >= 358 && x.circuito.w >= 200, `as quatro com a IA larga: Controle ${x.controle.w} px (mín. 560), Scope ${x.scope.w} (mín. 360), IA ${x.ia.w}, circuito ${x.circuito.w}`);
    await pg.click("#cc-largura"); await pg.waitForTimeout(400);
    await poe(pg, { circuito: true, scope: false, controle: true, ia: true }); x = await medidas(pg);
    ok(Math.abs(x.ia.w - 440) <= 2, `⇔ de novo recolhe (${x.ia.w} px)`);
    // só o Scope e a IA (o Scope largo, para o arraste passar por cima dele)
    await poe(pg, { circuito: true, scope: true, controle: false, ia: true }); x = await medidas(pg);
    const ifr = await pg.evaluate(() => { const e = $("if-scope").getBoundingClientRect(); return { l: e.left, r: e.right, y: e.top + e.height / 2 }; });
    const x0 = x.ia.l + 1, alvo = x0 - 200;
    ok(alvo > ifr.l && alvo < ifr.r, `o arraste da IA passa por cima do Scope (iframe ${Math.round(ifr.l)}–${Math.round(ifr.r)}, até x = ${alvo})`);
    await pg.mouse.move(x0, ifr.y); await pg.mouse.down();
    for (let i = 1; i <= 20; i++) { await pg.mouse.move(x0 - 10 * i, ifr.y); await pg.waitForTimeout(15); }
    await pg.mouse.up(); await pg.waitForTimeout(400); x = await medidas(pg);
    ok(Math.abs(x.ia.w - 640) <= 4 && Math.abs(x.scope.r - x.ia.l) <= 2, `arrastando a IA por cima do Scope: ${x.ia.w} px (esperado 640), o Scope encosta nela`);
    ok(await pg.evaluate(() => !document.body.classList.contains("redimensionando")), "solto o mouse, o Scope volta a receber o mouse");
    // o Controle: a divisória dele, para a esquerda, por cima do Scope
    await poe(pg, { circuito: true, scope: true, controle: true, ia: false }); x = await medidas(pg);
    const c0 = x.controle.l + 1, w0 = x.controle.w, y = ifr.y;
    await pg.mouse.move(c0, y); await pg.mouse.down();
    for (let i = 1; i <= 10; i++) { await pg.mouse.move(c0 - 10 * i, y); await pg.waitForTimeout(15); }
    await pg.mouse.up(); await pg.waitForTimeout(400); x = await medidas(pg);
    ok(Math.abs(x.controle.w - (w0 + 100)) <= 4 && Math.abs(x.scope.r - x.controle.l) <= 2, `arrastando o Controle: ${w0} → ${x.controle.w} px (esperado ${w0 + 100})`);
    const wc = x.controle.w;
    // recarregar: as larguras ficam
    await pg.reload(); await carrega(pg);
    await poe(pg, { circuito: false, scope: false, controle: true, ia: true }); x = await medidas(pg);   // sem o circuito: o Controle fica com o resto
    const guardadas = await pg.evaluate(() => ({ wc: tela.wc, wi: tela.wi }));
    ok(Math.abs(x.ia.w - 640) <= 4 && Math.abs(guardadas.wc - wc) <= 4, `depois de recarregar, as mesmas larguras (IA ${x.ia.w}, Controle guardado ${guardadas.wc})`);
    // ligar o Scope (como no fim de uma rodada) não desliga o Controle
    await poe(pg, { circuito: true, scope: false, controle: true, ia: false });
    await pg.evaluate(() => mostraScope(true)); await pg.waitForTimeout(400);
    const at = await ligadas(pg);
    ok(at.scope && at.controle, "o Scope aberto pela rodada fica ao lado do Controle (não troca de aba)");
    ok(!erros.length, `sem erros na página${erros.length ? ": " + erros.join(" | ") : ""}`);
    await poe(pg, { circuito: true, scope: true, controle: true, ia: true });
    await pg.screenshot({ path: "ia_lado.png" });
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
