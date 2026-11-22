// o cadeado fechado e o painel do controle (instância de teste 7200 → 7201), defeito visto por Marcelo em 21/11: com o
// cadeado fechado neste navegador, a página mostra o circuito sem abri-lo no editor; se o editor tem outro circuito (ou
// nenhum), o painel mostrava o controle errado e, ao mexer, "nenhum circuito aberto". Agora o painel fica coberto, com o
// botão "Abrir a edição"; com o mesmo circuito aberto no editor (travou depois de abrir), o painel continua à vista
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const EX = "exemplos/exemplo_controle_pwm.ipes", OUTRO = "exemplos/exemplo_buck.ipes";
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("t-cad")) { localStorage.setItem("maisim-simu-travado", "1"); sessionStorage.setItem("t-cad", "1"); } } catch (e) { /* ok */ } });
    const pg = await ctx.newPage();
    // "Canceled": o Monaco cancela o que estava calculando num arquivo quando o painel troca os arquivos pelos do circuito
    // aberto (a promessa cancelada dele, sem efeito na tela): não é um erro da página
    const erros = []; pg.on("pageerror", (e) => { if (e.message !== "Canceled") erros.push(e.message); }); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    // o editor fechado no servidor; a página abre o exemplo com o cadeado fechado
    await pg.goto("http://localhost:7200/maisim/simu/");
    await pg.waitForFunction(() => typeof api === "function" && typeof maisimI18n !== "undefined");
    await pg.evaluate(async () => { maisimI18n.lingua() !== "pt" && maisimI18n.muda("pt"); await api("editor/fechar", { modo: "descartar" }); });
    await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(EX));
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && dados.folhas["0"].elementos.length > 0, null, { timeout: 30000 });
    await pg.evaluate(() => mostraDoca("controle")); await pg.waitForTimeout(1500);
    const ve = () => pg.evaluate(async () => ({ coberto: getComputedStyle($("ctl-de-outro")).display !== "none", texto: $("ctl-de-outro").innerText.replace(/\s+/g, " ").trim(),
      ligado: ed.ligado, srv: await api("editor/aberto"), roda: $("ctl-roda").value, lista: ctl.lista || [] }));
    let v = await ve();
    ok(v.coberto && !v.ligado && v.srv.fechado && /cadeado está fechado/.test(v.texto) && /Abrir a edição/.test(v.texto),
      `cadeado fechado e o editor sem circuito: o painel coberto ("${v.texto}")`);
    // 2. o botão abre a edição: o editor passa a ter o circuito e o painel mostra o controle dele (C, com o pwm.c)
    await pg.click("#ctl-abrir-edicao");
    await pg.waitForFunction((a) => ed.ligado && dados && dados.editor && ctl.lista && ctl.lista.includes("pwm.c"), EX, { timeout: 60000 }); await pg.waitForTimeout(800);
    v = await ve();
    ok(!v.coberto && v.ligado && v.srv.aberto === EX && v.roda === "c" && v.lista.includes("controle.c"), `Abrir a edição: descoberto, o editor em ${v.srv.aberto}, roda ${v.roda}, ${v.lista.join(", ")}`);
    // 3. travar de novo com o mesmo circuito no editor: o painel continua à vista (é o controle deste circuito)
    await pg.click("#bt-editar"); await pg.waitForFunction(() => !ed.ligado, null, { timeout: 20000 }); await pg.waitForTimeout(1200);
    v = await ve();
    ok(!v.coberto && !v.ligado && v.srv.aberto === EX, `travado com o mesmo circuito no editor: o painel à vista (coberto ${v.coberto})`);
    // 4. o editor passa a outro circuito (outra janela) e esta página, travada, é recarregada: coberto de novo
    await pg.evaluate((a) => api("editor/abrir", { arq: a, modo: "descartar" }), OUTRO);
    await pg.reload();
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && dados.folhas["0"].elementos.length > 0, null, { timeout: 30000 });
    await pg.evaluate(() => mostraDoca("controle")); await pg.waitForTimeout(1500);
    v = await ve();
    ok(v.coberto && v.srv.aberto === OUTRO && !v.ligado, `travado com outro circuito no editor (${v.srv.aberto}): coberto`);
    // 4b. o cadeado ABERTO neste navegador e outro circuito no editor: a página abre a edição ao carregar; a conferência
    // (que responde depois) não pode cobrir o painel
    await pg.evaluate(() => localStorage.setItem("maisim-simu-travado", "0"));
    await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(EX));
    await pg.waitForFunction(() => typeof ed !== "undefined" && ed.ligado && dados && dados.editor, null, { timeout: 60000 });
    await pg.evaluate(() => mostraDoca("controle")); await pg.waitForTimeout(2000);
    v = await ve();
    ok(!v.coberto && v.ligado && v.srv.aberto === EX, `cadeado aberto, a página abre a edição ao carregar: o painel à vista (coberto ${v.coberto}, editor em ${v.srv.aberto})`);
    await pg.evaluate(async (a) => { await liga(false); await api("editor/abrir", { arq: a, modo: "descartar" }); await confereControleDoCircuito(); }, OUTRO); await pg.waitForTimeout(500);
    // 5. em inglês
    await pg.evaluate(() => maisimI18n.muda("en")); await pg.waitForTimeout(800);
    const en = await pg.evaluate(() => $("ctl-de-outro").innerText.replace(/\s+/g, " ").trim());
    ok(/padlock is closed/.test(en) && /Open editing/.test(en), `inglês: "${en}"`);
    await pg.evaluate(() => maisimI18n.muda("pt")); await pg.waitForTimeout(300);
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "o teste caiu: " + e.message); }
  if (b) await b.close();
  console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
  process.exit(falhas ? 1 : 0);
})();
