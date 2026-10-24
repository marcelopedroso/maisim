// um bloco com várias saídas no painel de propriedades (instância de teste 7200 → 7201), a revisão do #76 em 24/10: a cor do
// canal e a seção/painéis do scope só tratavam a 1ª saída. Agora, em cima da caixa do scope, uma escolha da saída (pelo nome
// do canal, em notação, com a cor de cada um), e a cor, a seção e os painéis valem para a escolhida (que fica ao refazer o
// painel). Num circuito novo: abc>>dq (a d com rótulo v_d, a q sem: ABCDQ_1_q), DEMUX de 5 saídas (só 4 têm nome no Gecko)
// e um CONST (uma saída só: o painel fica como antes, sem a escolha). Fora do scope e do controle, o bloco continua com os
// nomes de cada saída no estado (canais_saidas), em vez do nome do bloco (o que mudava com as caixinhas).
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const PAGINA = "http://localhost:7200/maisim/simu/";
// o circuito do teste, montado pela página (na instância de teste)
const monta = async (pg) => {
  await pg.goto(PAGINA);
  for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) {   // abre editando
    if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
  return pg.evaluate(async () => {
    let j = await api("editor/novo", { modo: "descartar" });
    const cmds = [["CREATE", "ABCDQ.1", 20, 10, "ABCDQ"], ["OUTNODE", "ABCDQ.1", 0, "v_d"], ["CREATE", "DEMUX.1", 20, 22, "DEMUX"],
      ["SETP", "DEMUX.1", "numberOutputTerminals", 5], ["CREATE", "CONST.1", 6, 6, "CONST"], ["OUTNODE", "CONST.1", 0, "u1"]];
    for (const [op, ...args] of cmds) { j = await api("editor/cmd", { op, args }); }
    novoEstado(j); ajusta();
    return { demux: dados.folhas["0"].elementos.find((e) => e.nome === "DEMUX.1").saidas.length };
  });
};
const UMA = "u1";                                          // o canal do CONST (uma saída)
const fim = (pg) => pg.evaluate(() => api("editor/novo", { modo: "descartar" }));
(async () => {
  let b, pg;
  try {
    b = await chromium.launch(); pg = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    const m = await monta(pg);
    ok(m.demux === 5, `circuito: abc>>dq, DEMUX de 5 saídas (${m.demux}) e um CONST`);
    const sel = async (nome) => { await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((e) => e.nome === n)), nome); await pg.waitForTimeout(600); };
    // o que a caixa do scope mostra: as saídas (canal, escolhida, notação), o canal da cor e o dos painéis, a amostra ativa
    const caixa = () => pg.evaluate(() => {
      const bs = [...document.querySelectorAll("#props .saida-canal button[data-k]")];
      const cc = document.querySelector("#props .cor-canal"), np = document.querySelector("#props .no-painel");
      return { saidas: bs.map((x) => x.dataset.canal), ativa: bs.filter((x) => x.classList.contains("ativo") && x.getAttribute("aria-pressed") === "true").map((x) => x.dataset.canal),
        notacao: bs.map((x) => { const l = x.querySelector(".mat-l, .mat-b"), s = x.querySelector("sub"); return l && s ? `${l.textContent}|${s.textContent}` : x.textContent; }),
        cor: cc && cc.dataset.canal, painel: np && np.dataset.canal, amostra: ((cc && cc.querySelector(".amostra.ativo")) || {}).dataset?.cor || "",
        secao: !!document.querySelector("#props #p-secao"), paineis: [...document.querySelectorAll("#props #p-paineis input:checked")].map((i) => i.dataset.titulo) };
    });
    const escolhe = async (canal) => { await pg.click(`#props .saida-canal button[data-canal="${canal}"]`); await pg.waitForTimeout(400); };
    const layout = () => pg.evaluate(() => leLayoutCircuito());
    const sinaisDe = (L, t) => { const x = L.itens.find((y) => y.titulo === t); return x ? x.sinais : null; };

    // o bloco de uma saída: como antes (sem a escolha; a cor e os painéis do canal dele)
    await sel("CONST.1");
    let c = await caixa();
    ok(!c.saidas.length && c.cor === UMA && c.painel === UMA && c.secao, `uma saída só (CONST.1): sem a escolha da saída, a cor e os painéis de ${c.cor}`);

    // abc>>dq: as duas saídas, em notação; a 1ª escolhida
    await sel("ABCDQ.1");
    await pg.waitForSelector("#props .saida-canal");
    c = await caixa();
    ok(c.saidas.join() === "v_d,ABCDQ_1_q" && c.ativa.join() === "v_d" && c.cor === "v_d" && c.painel === "v_d",
      `abc>>dq: a escolha das saídas (${c.saidas.join(", ")}), a 1ª escolhida: cor e painéis de ${c.cor}`);
    ok(c.notacao[0] === "v|d", `os nomes em notação, como no desenho e no scope (v_d → v itálico com d subscrito: ${c.notacao.join(" · ")})`);
    // a 2ª saída: a cor vale para ela (e só para ela) e a escolha fica quando o painel se refaz com o estado novo
    await escolhe("ABCDQ_1_q");
    c = await caixa();
    ok(c.ativa.join() === "ABCDQ_1_q" && c.cor === "ABCDQ_1_q" && c.painel === "ABCDQ_1_q" && c.secao, `escolhida a 2ª: a cor e os painéis de ${c.cor}`);
    await pg.click('#props .cor-canal .amostra[data-cor="#d946ef"]'); await pg.waitForTimeout(1500);
    c = await caixa();
    const cores = await pg.evaluate(() => ({ circ: dados.cores_escolhidas || {}, scope: JSON.parse(localStorage.getItem("maisim-scope-cores") || "{}"),
      tag: [...document.querySelectorAll("#svg .tag-scope")].filter((g) => /ABCDQ_1_q/.test((g.querySelector("title") || {}).textContent || "")).map((g) => g.querySelector("rect").getAttribute("stroke")),
      bolinha: (document.querySelector('#props .saida-canal button[data-canal="ABCDQ_1_q"] i') || {}).style?.getPropertyValue("--c") }));
    ok(cores.circ.ABCDQ_1_q === "#d946ef" && !cores.circ.v_d && cores.scope.ABCDQ_1_q === "#d946ef" && !cores.scope.v_d,
      `a cor vai para ABCDQ_1_q (no circuito e no scope), não para v_d (${JSON.stringify(cores.circ)})`);
    ok(c.ativa.join() === "ABCDQ_1_q" && c.cor === "ABCDQ_1_q" && c.amostra === "#d946ef" && cores.tag.join() === "#d946ef" && /d946ef/i.test(cores.bolinha || ""),
      `o painel refeito continua na 2ª saída, com a amostra ativa; a etiqueta dela no desenho e a bolinha da escolha com a cor (${cores.tag.join()}, ${cores.bolinha})`);
    // os painéis: desmarcar "Sinais da rodada" na 2ª tira só ela; a 1ª continua marcada
    ok(c.paineis.join() === "Sinais da rodada", `a 2ª no painel do automático (${c.paineis.join()})`);
    await pg.uncheck('#props #p-paineis input[data-titulo="Sinais da rodada"]'); await pg.waitForTimeout(1200);
    let L = await layout(), s = sinaisDe(L, "Sinais da rodada") || [];
    c = await caixa();
    ok(!s.includes("ABCDQ_1_q") && s.includes("v_d") && !c.paineis.length && c.ativa.join() === "ABCDQ_1_q",
      `desmarcado na 2ª: ABCDQ_1_q sai de "Sinais da rodada", v_d fica (${s.join(", ")})`);
    await escolhe("v_d");
    c = await caixa();
    ok(c.ativa.join() === "v_d" && c.cor === "v_d" && c.paineis.join() === "Sinais da rodada" && !c.amostra,
      `de volta à 1ª: v_d marcado em "Sinais da rodada", sem cor escolhida (amostra ativa: "${c.amostra}")`);
    await escolhe("ABCDQ_1_q");                             // fora de todo painel: escolher a seção (a 1ª) mostra os painéis dela
    await pg.selectOption("#props #p-secao", { index: 1 }); await pg.waitForTimeout(300);
    await pg.check('#props #p-paineis input[data-titulo="Sinais da rodada"]'); await pg.waitForTimeout(1200);
    L = await layout(); s = sinaisDe(L, "Sinais da rodada") || [];
    ok(s.includes("ABCDQ_1_q") && s.includes("v_d"), `marcado de novo na 2ª: as duas no painel (${s.join(", ")})`);

    // DEMUX de 5 saídas: só as 4 que o Gecko nomeia
    await sel("DEMUX.1");
    c = await caixa();
    ok(c.saidas.join() === "DEMUX_1_0,DEMUX_1_1,DEMUX_1_2,DEMUX_1_3" && c.ativa.join() === "DEMUX_1_0", `DEMUX: as 4 saídas que o Gecko nomeia (${c.saidas.join(", ")})`);

    // fora do scope e do controle: o estado continua com os canais de cada saída (o nome não muda com as caixinhas)
    const fora = await pg.evaluate(async () => {
      const u = dados.folhas["0"].elementos.find((e) => e.nome === "ABCDQ.1").uid;
      const j = await api("editor/destino", { uid: u, scope: false, controle: false }); novoEstado(j);
      const r = { fora: (j.canais_saidas || {})["ABCDQ.1"], canal: canalScope(dados.folhas["0"].elementos.find((e) => e.nome === "ABCDQ.1"), "0") };
      novoEstado(await api("editor/destino", { uid: u, scope: true, controle: true }));
      return r;
    });
    ok((fora.fora || []).join() === "v_d,ABCDQ_1_q" && fora.canal === "v_d", `fora do scope e do controle: canais_saidas ainda ${JSON.stringify(fora.fora)}, o canal do bloco ${fora.canal}`);
    ok(!erros.length, `sem erros na página (${erros.join(" | ")})`);
  } catch (e) { ok(false, "exceção: " + e.message); }
  finally {
    if (pg) await fim(pg).catch(() => {});
    if (b) await b.close();
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
})();
