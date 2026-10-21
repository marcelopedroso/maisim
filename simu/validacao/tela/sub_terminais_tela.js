// terminais de subcircuito pela tela (instância de teste 5010 → 8768), o caso do Marcelo (18/10): dois de potência e um de
// controle postos no meio da folha do SM — cada um encosta na borda e nenhum cai no borne de outro; arrastar o terminal
// (a prévia já encostada na borda) muda o lado do borne; o painel do terminal (nome, posição, apagar; girar não); os nomes
// no bloco sem se cobrirem; o tamanho do bloco pelo painel; e o aviso de bornes juntos (arquivo antigo).
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const B = "http://localhost:5010/pew/simu/";
(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("pew-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    const api = (rota, corpo) => pg.evaluate(([r, c]) => fetch(r, c ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) } : {}).then((x) => x.json()), [rota, corpo]);
    await pg.goto(B); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-extra, .modal .m-ok"); await pg.waitForTimeout(800); }
    await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
    const nv = await api("editor/novo", { modo: "descartar" });
    await pg.evaluate((j) => { ed.novo = "sub_terminais"; dados = Object.assign(j, { arq: "sub_terminais" }); folhaAtual = "0"; seleciona(null); novoEstado(j); }, nv);
    const tela = (x, y) => pg.evaluate(([gx, gy]) => { const s = $("svg"), m = s.getScreenCTM(), pt = s.createSVGPoint();
      pt.x = gx * G; pt.y = gy * G; const q = pt.matrixTransform(m); return [q.x, q.y]; }, [x, y]);
    const clicaGrade = async (x, y) => { const p = await tela(x, y); await pg.mouse.click(p[0], p[1]); await pg.waitForTimeout(900); };
    const poe = async (aba, id, x, y) => { await pg.click(`#abas button:text-is("${aba}")`); await pg.waitForTimeout(150); await pg.click(`#itens .item[data-id="${id}"]`); await clicaGrade(x, y); };
    const bloco = () => pg.evaluate(() => { const s = Object.values(dados.folhas).flatMap((f) => f.elementos).find((x) => x.tipo === "SUBCIRCUIT");
      return { uid: s.uid, tam: s.tamanho, bornes: Object.fromEntries(s.terminais.map((t) => [t.interno, [t.x - s.x, t.y - s.y, t.lado]])) }; });
    const dentro = (n) => pg.evaluate((n) => { const e = dados.folhas[folhaAtual].elementos.find((x) => x.nome === n); return e && [e.x, e.y]; }, n);
    await poe("Subcircuit", "SUBCIRCUIT", 20, 10);
    const sm = await bloco();
    const el = await pg.evaluateHandle(() => document.querySelector(`#svg .el[data-i="${dados.folhas["0"].elementos.findIndex((x) => x.tipo === "SUBCIRCUIT")}"]`));
    await el.dblclick(); await pg.waitForTimeout(600);
    ok(await pg.evaluate((u) => folhaAtual === u, sm.uid), "dentro do subcircuito novo");
    // os três pontos do Marcelo
    await poe("Subcircuit", "CIRCUIT_TERMINAL", 5, 9); await poe("Subcircuit", "CIRCUIT_TERMINAL", 2, 16);
    await poe("Subcircuit", "CONTROL_TERMINAL", 5, 19);
    const msgCtl = await pg.evaluate(() => $("msg").textContent);
    const pos3 = [await dentro("CIRCUIT_TERMINAL.1"), await dentro("CIRCUIT_TERMINAL.2"), await dentro("CONTROL_TERMINAL.1")];
    let s1 = await bloco();
    ok(JSON.stringify(pos3) === "[[1,9],[1,16],[1,24]]" && new Set(Object.values(s1.bornes).map((v) => v.slice(0, 2).join())).size === 3,
      `postos em (5, 9), (2, 16) e (5, 19): encostam na borda, (1, 9), (1, 16) e (1, 24), três bornes diferentes → ${JSON.stringify(s1.bornes)}`);
    ok(/livre mais perto/.test(msgCtl), `a mensagem diz que o de controle foi para o borne livre mais perto: "${msgCtl}"`);
    // arrastar o CIRCUIT_TERMINAL.1 até perto da borda direita: a prévia já encostada, e o borne vai para a direita
    const [x0, y0] = await tela(1, 9), [x1, y1] = await tela(45, 12);
    await pg.mouse.move(x0, y0); await pg.mouse.down();
    for (let k = 1; k <= 8; k++) await pg.mouse.move(x0 + (x1 - x0) * k / 8, y0 + (y1 - y0) * k / 8);
    const previa = await pg.evaluate(() => { const i = dados.folhas[folhaAtual].elementos.findIndex((x) => x.nome === "CIRCUIT_TERMINAL.1");
      return document.querySelector(`#svg .el[data-i="${i}"]`).getAttribute("transform"); });
    const G = await pg.evaluate(() => G);
    await pg.mouse.up(); await pg.waitForTimeout(1200);
    ok(previa === `translate(${48 * G},${3 * G})`, `durante o arrasto, a prévia fica em (49, 12), encostada na borda (${previa})`);
    s1 = await bloco();
    ok(JSON.stringify(await dentro("CIRCUIT_TERMINAL.1")) === "[49,12]" && s1.bornes["CIRCUIT_TERMINAL.1"][2] === "d", `solto: (49, 12), borne à direita (${s1.bornes["CIRCUIT_TERMINAL.1"]})`);
    // o painel do terminal
    await pg.evaluate(() => seleciona(dados.folhas[folhaAtual].elementos.find((x) => x.nome === "CIRCUIT_TERMINAL.1"))); await pg.waitForTimeout(400);
    const painel = await pg.evaluate(() => ({ nome: !!$("p-nome"), pos: !!$("p-pos"), apaga: !!$("p-apaga"), gira: !!$("p-gira"), txt: $("props").textContent }));
    ok(painel.nome && painel.pos && painel.apaga && !painel.gira && /borne à direita/.test(painel.txt), "painel do terminal: nome, posição e apagar (girar não); diz \"borne à direita\"");
    await pg.keyboard.press("r"); await pg.waitForTimeout(500);
    ok(!(await pg.evaluate(() => historico.some((h) => /girado CIRCUIT_TERMINAL/.test(h.t)))), "R no terminal não gira");
    await pg.fill("#p-nome", "entrada"); await pg.press("#p-nome", "Enter"); await pg.evaluate(() => $("p-nome").dispatchEvent(new Event("change"))); await pg.waitForTimeout(1200);
    s1 = await bloco();
    ok("entrada" in s1.bornes && !("CIRCUIT_TERMINAL.1" in s1.bornes), `renomeado pelo painel: o borne é "entrada" (${Object.keys(s1.bornes)})`);
    // soltar o terminal num ponto de ligação (o gesto de "ligar ao nó"): ele encosta na borda e o PEW liga uma conexão até o ponto
    await poe("Circuit", "R", 15, 20);                                   // R.1 em pé: terminais em (15, 18) e (15, 22)
    const arrasta = async (de, para) => { const [a0, b0] = await tela(...de), [a1, b1] = await tela(...para);
      await pg.mouse.move(a0, b0); await pg.mouse.down(); for (let k = 1; k <= 8; k++) await pg.mouse.move(a0 + (a1 - a0) * k / 8, b0 + (b1 - b0) * k / 8);
      await pg.mouse.up(); await pg.waitForTimeout(2500); };
    const fiosSM = () => pg.evaluate(() => dados.folhas[folhaAtual].fios.map((w) => `${w.pts[0]}→${w.pts[w.pts.length - 1]}`));
    await arrasta([1, 16], [15, 18]);
    let fs_ = await fiosSM();
    ok(JSON.stringify(await dentro("CIRCUIT_TERMINAL.2")) === "[1,16]" && fs_.some((w) => w === "1,16→15,18"),
      `CIRCUIT_TERMINAL.2 solto no terminal de cima do R.1: fica na borda (1, 16) e ganha uma conexão até ele (${fs_}) · "${await pg.textContent("#msg")}"`);
    const nCtl = await dentro("CONTROL_TERMINAL.1");
    await arrasta(nCtl, [15, 22]);
    ok(JSON.stringify(await dentro("CONTROL_TERMINAL.1")) === JSON.stringify(nCtl) && /não liga/.test(await pg.textContent("#msg")) && (await fiosSM()).length === 1,
      `o de controle solto no terminal de potência do R.1: não liga nem sai do lugar ("${await pg.textContent("#msg")}")`);
    await poe("Circuit", "R", 30, 24);                                   // R.2: terminal em (30, 22), no caminho vertical-primeiro
    await arrasta(await dentro("entrada"), [15, 22]);
    const msgE = await pg.textContent("#msg");
    ok((await fiosSM()).length === 1 && JSON.stringify(await dentro("entrada")) === "[49,12]" && /não liguei/.test(msgE) && /\(15,18\)/.test(msgE) && /\(30,22\)/.test(msgE),
      `"entrada" solto no terminal de baixo do R.1: os dois caminhos passariam por outro terminal — não liga sozinho e diz onde ("${msgE.slice(0, 110)}…")`);
    await arrasta(await dentro("entrada"), [30, 26]);
    fs_ = await fiosSM();
    ok(fs_.some((w) => w === "49,12→30,26") && JSON.stringify(await dentro("entrada")) === "[49,12]", `"entrada" solto no terminal de baixo do R.2: liga pelo caminho livre (${fs_.join(" · ")})`);
    // de volta ao Main: os nomes no bloco, curtos e sem se cobrir
    await pg.click("#volta"); await pg.waitForTimeout(600);
    const txts = await pg.evaluate(() => { const g = document.querySelector("#svg .el.sub");
      return [...g.querySelectorAll("text")].map((t) => { const r = t.getBoundingClientRect(); return { s: t.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom }; }); });
    const cobre = []; for (let i = 0; i < txts.length; i++) for (let j = i + 1; j < txts.length; j++) { const a = txts[i], c = txts[j];
      if (a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1) cobre.push(`${a.s} × ${c.s}`); }
    ok(!cobre.length && txts.some((t) => t.s === "Circuit.2") && txts.some((t) => t.s === "Control.1") && txts.some((t) => t.s === "entrada"),
      `no bloco: ${txts.map((t) => t.s).join(", ")} — nenhum texto por cima de outro ${cobre.join("; ")}`);
    await pg.screenshot({ path: "sub_terminais_main.png", clip: await pg.evaluate(() => { const r = document.querySelector("#svg .el.sub").getBoundingClientRect(); return { x: r.left - 120, y: r.top - 60, width: r.width + 240, height: r.height + 120 }; }) });
    // tamanho do bloco pelo painel
    await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.tipo === "SUBCIRCUIT"))); await pg.waitForTimeout(400);
    const v0 = await pg.inputValue("#p-bloco");
    await pg.fill("#p-bloco", "8 × 7"); await pg.evaluate(() => $("p-bloco").dispatchEvent(new Event("change"))); await pg.waitForTimeout(2500);
    s1 = await bloco();
    ok(v0 === "8 × 5" && JSON.stringify(s1.tam) === "[8,7]" && /de 7 à esquerda/.test(await pg.evaluate(() => $("props").textContent)), `tamanho do bloco: ${v0} → ${s1.tam.join(" × ")}, e o painel conta os bornes por lado`);
    // aviso de bornes juntos (arquivo antigo): a marca no bloco e no painel
    await pg.evaluate(() => { const s = dados.folhas["0"].elementos.find((x) => x.tipo === "SUBCIRCUIT"); s.terminais[1].junto = [s.terminais[2].interno]; s.terminais[2].junto = [s.terminais[1].interno]; desenha(); mostraProps(); });
    const aviso = await pg.evaluate(() => ({ marcas: document.querySelectorAll("#svg .el.sub .junto").length, txt: $("props").textContent }));
    ok(aviso.marcas === 2 && /No mesmo borne/.test(aviso.txt), `bornes juntos: ${aviso.marcas} marcas vermelhas no bloco e o aviso no painel`);
    await api("editor/novo", { modo: "descartar" });
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
