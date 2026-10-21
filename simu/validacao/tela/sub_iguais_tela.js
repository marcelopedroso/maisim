// o bloco do subcircuito na folha de cima (instância de teste 5010 → 8768), dois achados de Marcelo em 19/10:
// 1. "uma ligação +Vcc ficou presa no SM.ap.1: apaguei o fio mas não consigo tirar do borne" — era a ligação por rótulo, que
//    a tela não deixava mudar: agora o painel do bloco tem o rótulo de fora de cada borne (apagar solta; escrever liga), só
//    neste subcircuito (o igual a ele continua com o dele);
// 2. "se eles são iguais, tem que respeitar o tamanho quando muda" — o tamanho do bloco e da folha, mudado na folha de cima,
//    vale para os iguais com "mudar os N juntos" (um passo do desfazer); desmarcado, só ele; "igualar a este" acerta os que
//    ficaram diferentes; o BlockSizeY pelo painel de parâmetros recalcula os bornes da esquerda (como o largura × altura)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:5010/pew/simu/");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor)); k++) { if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    await pg.evaluate(async () => {                        // SUBCIRCUIT.1 com um terminal (+Vcc por fora) e uma cópia igual
      const j = await api("editor/novo", { modo: "descartar" }); dados = j; folhaAtual = "0"; novoEstado(j);
      const c = (op, args) => api("editor/cmd", { op, args });
      await c("CREATE", ["SUBCIRCUIT.1", 20, 10, "SUBCIRCUIT"]); await c("CREATE", ["SUBCIRCUIT.1#R.1", 20, 10, "R"]);
      await c("CREATE", ["SUBCIRCUIT.1#CIRCUIT_TERMINAL.1", 5, 9, "CIRCUIT_TERMINAL"]);
      await api("editor/copiar", { nome: "SUBCIRCUIT.1", folha: "0" }); await api("editor/colar", { x: 40, y: 10, folha: "0" });
      await c("OUTNODE", ["SUBCIRCUIT.1#CIRCUIT_TERMINAL.1", 0, "+Vcc"]);
      const r = await api("editor/estado"), s2 = r.folhas["0"].elementos.find((x) => x.tipo === "SUBCIRCUIT" && x.nome !== "SUBCIRCUIT.1");
      await c("OUTNODE", [`${s2.nome}#CIRCUIT_TERMINAL.1`, 0, "x2"]);
      novoEstado(await api("editor/estado")); ed.todos = true; });
    const sms = () => pg.evaluate(() => dados.folhas["0"].elementos.filter((x) => x.tipo === "SUBCIRCUIT").map((s) => ({ nome: s.nome, bloco: s.tamanho.join("×"),
      folha: dados.folhas[s.uid].tamanho.join("×"), rot: s.terminais.map((t) => t.rotulo || "").join(), rel: s.terminais.map((t) => t.y - s.y).join() })));
    const sel = async (nome) => { await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === n)), nome); await pg.waitForTimeout(500); };
    const muda = async (seletor, valor) => { await pg.evaluate(([s, v]) => { const i = document.querySelector(s); i.value = v; i.dispatchEvent(new Event("change")); }, [seletor, valor]); await pg.waitForTimeout(2500); };
    const hist = () => pg.evaluate(() => historico.map((h) => h.t));
    let v = await sms();
    const S2 = v[1] && v[1].nome, B0 = v[0] && v[0].bloco, FY = v[0] && v[0].folha.split("×")[1], CURTO2 = await pg.evaluate((n) => nomeSub(n), S2);
    ok(v.length === 2 && v[0].rot === "+Vcc" && v[1].rot === "x2", `dois subcircuitos iguais: ${v.map((s) => `${s.nome} (borne ${s.rot}, bloco ${s.bloco})`).join(", ")}`);
    // 1. o rótulo de fora do borne
    await sel("SUBCIRCUIT.1");
    const borne = await pg.evaluate(() => { const i = document.querySelector('#props [data-borne="CIRCUIT_TERMINAL.1"]'); return i && i.value; });
    ok(borne === "+Vcc", `o painel do SUBCIRCUIT.1 mostra o rótulo do borne: "${borne}"`);
    await muda('#props [data-borne="CIRCUIT_TERMINAL.1"]', "");
    v = await sms();
    ok(v[0].rot === "" && v[1].rot === "x2" && (await hist()).some((t) => /^SUBCIRCUIT\.1: borne .+ solto \(sem rótulo\)$/.test(t)),
      `apagar o rótulo solta o borne (SUBCIRCUIT.1 "${v[0].rot}"); o ${S2} continua com o dele ("${v[1].rot}"); no histórico: "${(await hist())[0]}"`);
    await muda('#props [data-borne="CIRCUIT_TERMINAL.1"]', "nA");
    v = await sms();
    ok(v[0].rot === "nA" && v[1].rot === "x2", `escrever um nome liga o borne ao nó: "${v[0].rot}"`);
    // 2. o tamanho nos iguais
    const caixa = await pg.evaluate(() => ({ ck: $("p-juntos") && $("p-juntos").checked, txt: (document.querySelector("#props label.p-juntos") || {}).textContent || "" }));
    ok(caixa.ck && /mudar os 2 iguais juntos/.test(caixa.txt), `no painel do bloco: "${caixa.txt.trim()}" (marcado)`);
    await muda("#p-bloco", "6 × 4");
    v = await sms();
    ok(v.every((s) => s.bloco === "6×4"), `largura × altura 6 × 4: os dois mudam (${v.map((s) => s.bloco).join(", ")}; antes ${B0})`);
    await pg.click("#bt-desfazer"); await pg.waitForTimeout(2500);
    v = await sms();
    ok(v.every((s) => s.bloco === B0), `um Ctrl+Z volta os dois (${v.map((s) => s.bloco).join(", ")})`);
    await sel("SUBCIRCUIT.1"); await muda("#p-bloco", "6 × 4");
    await pg.waitForSelector('#p-params [data-p="SheetSizeX"]', { timeout: 15000 });
    await muda('#p-params [data-p="SheetSizeX"]', "50");
    v = await sms();
    ok(v.every((s) => s.bloco === "6×4" && s.folha === `50×${FY}`), `SheetSizeX = 50 pelos parâmetros: as duas folhas (${v.map((s) => s.folha).join(", ")})`);
    // desmarcado: só ele; o aviso e "igualar a este"
    await pg.uncheck("#p-juntos"); await pg.waitForTimeout(300);
    await muda("#p-bloco", "8 × 4");
    v = await sms();
    const dif = await pg.evaluate(() => (document.querySelector("#props .p-dif") || {}).textContent || "");
    ok(v[0].bloco === "8×4" && v[1].bloco === "6×4" && dif.includes(`${CURTO2} está com bloco 6 × 4, folha 50 × ${FY}`),
      `desmarcado: só o SUBCIRCUIT.1 (${v.map((s) => s.bloco).join(", ")}); o aviso "${dif.replace(/\s+/g, " ").trim()}"`);
    await pg.click("#p-iguala"); await pg.waitForTimeout(2500);
    v = await sms();
    ok(v.every((s) => s.bloco === "8×4" && s.folha === `50×${FY}`) && !(await pg.$("#props .p-dif")), `igualar a este: ${v.map((s) => `${s.bloco} / ${s.folha}`).join(", ")}, sem o aviso`);
    // o BlockSizeY pelo painel de parâmetros (o nome do Gecko): os dois, e os bornes da esquerda recalculados
    await pg.check("#p-juntos"); await pg.waitForTimeout(300);
    const rel0 = v.map((s) => s.rel).join(" ");
    await pg.waitForSelector('#p-params [data-p="BlockSizeY"]', { timeout: 15000 });
    await muda('#p-params [data-p="BlockSizeY"]', "8");
    v = await sms();
    const espera = String(Math.floor(8 * 9 / FY));           // o terminal em y = 9: borne em ⌊8 · 9 / altura da folha⌋ (à esquerda)
    ok(v.every((s) => s.bloco === "8×8" && s.rel === espera), `BlockSizeY = 8 pelos parâmetros: ${v.map((s) => `${s.bloco}, borne em y + ${s.rel}`).join("; ")} (antes y + ${rel0}; esperado ${espera})`);
    await pg.evaluate(async () => { await api("editor/novo", { modo: "descartar" }); });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
