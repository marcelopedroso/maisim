// os blocos de controle à vista, pela tela (instância de teste 7200 → 7201; v0.3.1, Marcelo 25/10: "sanetizar e arrumar
// todos… usual, sem Python"): um circuito novo com cada bloco das abas Control, Digital, Math, Source/Sink e Special que a
// paleta oferece (o "oculto" do catalogo.json fica de fora). Para cada um: o nome do MaiSim em pt e en (a paleta, o painel e
// a dica), o símbolo e os nomes dos bornes dentro da caixa (nenhum texto vaza, o símbolo não cobre os nomes), os nomes das
// entradas nos de várias (INT x/R, S-H x/z, COUNTER ↑/R, DIV a/b, comparadores a/b, abc→dq a/b/c/θ, dq→abc d/q/θ), o valor
// embaixo (Kp=1 · Ki=100, T=1 ms, k=2, h=0.5, Δt=10 µs…) e o que o bloco faz no painel (no lugar do "sem parâmetros"); os
// parâmetros com nome legível (Kp, Ki [1/s]) e o do Gecko na dica; o T do PI derivado (Kp/Ki), só de leitura; a forma
// "Importada (arquivo)" fora da lista do SIGNAL; as abas da paleta em pt e en. Fotos: blocos_pt.png e blocos_en.png.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const ABAS = ["Control", "Digital", "Math", "Source/Sink", "Special"];
// os parâmetros dados antes de conferir o valor embaixo (independe dos padrões do Gecko e dos do MaiSim ao criar)
const SETP = [["GAIN.1", "r0", 2], ["PI.1", "r0", 1], ["PI.1", "a1", 100], ["PT1.1", "T", 1e-3], ["PT1.1", "a1", 1], ["PT2.1", "T", 1e-3],
  ["PT2.1", "a1", 1], ["HYS.1", "h", 0.5], ["DELAY.1", "T", 1e-5], ["LIMIT.1", "min", 0], ["LIMIT.1", "max", 0.95], ["CONST.1", "const", 3],
  ["INT.1", "a1", 1], ["INT.1", "min", -1], ["INT.1", "max", 1], ["PD.1", "a1", 0.5], ["SDFT.1", "T", 0.02], ["SDFT.1", "F1", 50]];
const VALOR = { GAIN: "k=2", PI: "Kp=1 · Ki=100", PT1: "T=1 ms", PT2: "T=1 ms", HYS: "h=0.5", DELAY: "Δt=10 µs", LIMIT: "0…0.95", CONST: "3",
  INT: "k=1 · -1…1", PD: "k=0.5", SDFT: "50 Hz · T=20 ms" };
const PINOS = { INT: "x R", SHLD: "x z", COUNTER: "↑ R", DIV: "a b", GE: "a b", GT: "a b", EQ: "a b", NE: "a b", ABCDQ: "a b c θ d q", DQABC: "d q θ a b c" };
const NOMES = { pt: { INT: "Integrador", LIMIT: "Limitador", HYS: "Histerese", COUNTER: "Contador", SHLD: "Amostrador (S-H)", TF: "Função de transferência H(s)",
  PD: "Derivador d/dt (PD do Gecko)", GAIN: "Ganho", ADD: "Soma", PI: "Controlador PI" },
  en: { INT: "Integrator", LIMIT: "Limiter", HYS: "Hysteresis", COUNTER: "Counter", SHLD: "Sample and hold (S-H)", TF: "Transfer function H(s)",
    PD: "Differentiator d/dt (Gecko's PD)", GAIN: "Gain", ADD: "Sum", PI: "PI controller" } };
const SIMB = { INT: "∫", PI: "PI", PD: "d/dt", PT1: "PT1", PT2: "PT2", TF: "H(s)", HYS: "HYS", LIMIT: "LIM", COUNTER: "CNT", SHLD: "S-H", ABS: "|x|",
  SQRT: "√x", SQR: "x²", EXP: "eˣ", LN: "ln", ASIN: "sin⁻¹", MIN: "min", DIV: "÷", MUL: "×", SGN: "sgn", ROUND: "rnd", ABCDQ: "abc→dq", DQABC: "dq→abc",
  TIME: "t", THYRISTOR_CONTROL: "THY", SDFT: "DFT" };
(async () => {
  let b, pg;
  try {
    b = await chromium.launch(); pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto("http://localhost:7200/maisim/simu/?novo=1");
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof ed !== "undefined" && ed.catalogo && ed.ligado && document.querySelectorAll("#abas button").length)); k++) {
      if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    for (let k = 0; k < 10 && await pg.$(".modal-fundo"); k++) { await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }   // o nome do novo
    const espera = async (f, arg, ms = 30000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await pg.evaluate(f, arg)) return true; await pg.waitForTimeout(250); } return false; };

    // 1. os blocos à vista, do catálogo da paleta; todos com nome e explicação nos dois idiomas (o conector de rótulo da aba
    // Controle não é bloco: é um pedaço de conexão com nome — conectores_tela)
    const vis = await pg.evaluate((ABAS) => { const ids = [];
      for (const a of ed.catalogo.abas) if (ABAS.includes(a.aba)) for (const i of a.itens) if (!i.oculto && !i.conector && !ids.some((x) => x.id === i.id)) ids.push({ id: i.id, rot: i.rotulo || "" });
      return ids; }, ABAS);
    ok(vis.length >= 45, `${vis.length} blocos à vista nas abas ${ABAS.join(", ")}`);
    const semDic = await pg.evaluate((vis) => vis.filter(({ id, rot }) => !rot || !maisimI18n.tem(rot) || !maisimI18n.tem("simu.descr." + (id === "RANDOM" ? "RANDOM" : id))).map((x) => x.id), vis);
    ok(!semDic.length, `todos com o nome (simu.cmp_*) e o que fazem (simu.descr.*): ${semDic.length ? "faltam " + semDic.join(", ") : "sim"}`);
    // 2. a paleta: as abas e os nomes em português; o símbolo do S-H igual ao da folha
    let pal = await pg.evaluate(() => ({ abas: [...document.querySelectorAll("#abas button")].map((x) => x.textContent) }));
    ok(["Controle", "Matemática", "Fontes", "Especial", "Medição", "Circuito"].every((a) => pal.abas.includes(a)), `as abas em português: ${pal.abas.join(", ")}`);
    await pg.click('#abas button[data-aba="Digital"]'); await pg.waitForTimeout(150);
    pal = await pg.evaluate(() => { const i = document.querySelector('#itens .item[data-id="SHLD"]'), c = document.querySelector('#itens .item[data-id="COUNTER"]');
      return i && c && { nome: i.querySelector("span").textContent, sigla: i.querySelector("svg text").textContent, dica: c.title }; });
    ok(pal && pal.nome === "Amostrador (S-H)" && pal.sigla === "S-H" && /Contador \(Counter\)/.test(pal.dica) && /0,5/.test(pal.dica),
      `na paleta: "${pal && pal.nome}" com o símbolo "${pal && pal.sigla}"; a dica do contador diz o que ele faz (${pal && pal.dica.slice(0, 60)}…)`);
    await pg.fill("#busca", "integrator"); await pg.waitForTimeout(150);
    const achou = await pg.$$eval("#itens .item", (is) => is.map((i) => i.dataset.id)); await pg.fill("#busca", "");
    ok(achou.includes("INT"), `a busca acha pelo nome do Gecko também ("integrator": ${achou.join(", ")})`);

    // 3. um circuito com todos, em grade (o Gecko cria; os parâmetros que o valor embaixo mostra são dados aqui)
    const cmds = vis.map(({ id }, k) => ({ op: "CREATE", args: [`${id}.1`, 6 + 9 * (k % 8), 6 + 9 * Math.floor(k / 8), id] }));
    const r = await pg.evaluate(async ([cmds, setp]) => { try { novoEstado(await api("editor/cmds", { cmds }));
      novoEstado(await api("editor/cmds", { cmds: setp.map(([n, p, v]) => ({ op: "SETP", args: [n, p, String(v)] })) })); return ""; } catch (e) { return e.message; } }, [cmds, SETP]);
    ok(!r, `os ${vis.length} blocos criados e os parâmetros dados: ${r || "ok"}`);
    await pg.evaluate(() => ajusta()); await pg.waitForTimeout(500);
    const nomeDe = (id) => (id === "RANDOM" ? "RANDOM.1" : `${id}.1`);
    // 4. o desenho de cada um
    const des = await pg.evaluate((vis) => vis.map(({ id }) => {
      const f = dados.folhas[folhaAtual], i = f.elementos.findIndex((x) => x.nome === `${id}.1`), e = f.elementos[i], g = document.querySelector(`#svg g.el[data-i="${i}"]`);
      if (!g) return { id, erro: "não desenhado" };
      const bb = (n) => n.getBoundingClientRect(), cruza = (a, c) => a.left < c.right - 0.5 && c.left < a.right - 0.5 && a.top < c.bottom - 0.5 && c.top < a.bottom - 0.5;
      const caixa = bb(g.querySelector(".corpo")), dentro = (r) => r.left >= caixa.left - 0.5 && r.right <= caixa.right + 0.5 && r.top >= caixa.top - 0.5 && r.bottom <= caixa.bottom + 0.5;
      const simb = g.querySelector(".simbolo"), pinos = [...g.querySelectorAll(".pino, .pino-ext")], val = g.querySelector(".valor-bloco");
      const vazam = [simb, ...pinos].filter((n) => n && !dentro(bb(n))).map((n) => n.textContent);
      // o símbolo contra os nomes dos bornes: a tinta, 70 % da altura da caixa do texto (a mesma conta do ajustaSimbolo)
      const tinta = (r) => ({ left: r.left, right: r.right, top: r.top + 0.15 * r.height, bottom: r.bottom - 0.15 * r.height });
      return { id, tipo: e.tipo, simb: simb && simb.textContent, vazam, cobre: !!simb && pinos.some((n) => cruza(bb(n), tinta(bb(simb)))),
        pinos: [...g.querySelectorAll(".pino")].map((n) => n.textContent).join(" "), valor: val ? val.textContent : "",
        valorFora: !val || bb(val).top >= caixa.bottom - 1 };
    }), vis);
    const naoDes = des.filter((d) => d.erro).map((d) => d.id);
    ok(!naoDes.length, `todos desenhados: ${naoDes.length ? "faltam " + naoDes.join(", ") : `${des.length}`}`);
    const vaza = des.filter((d) => !d.erro && (d.vazam.length || d.cobre)).map((d) => `${d.id}: ${d.vazam.join("/") || "cobre"}`);
    ok(!vaza.length, `nenhum texto vaza da caixa nem o símbolo cobre os nomes dos bornes: ${vaza.join("; ") || "nenhum"}`);
    const simbErr = Object.entries(SIMB).filter(([id, s]) => (des.find((d) => d.id === id) || {}).simb !== s).map(([id, s]) => `${id}: "${(des.find((d) => d.id === id) || {}).simb}" ≠ "${s}"`);
    ok(!simbErr.length, `os símbolos (${Object.keys(SIMB).length}): ${simbErr.join("; ") || "todos certos"}`);
    const pinErr = Object.entries(PINOS).filter(([id, s]) => (des.find((d) => d.id === id) || {}).pinos !== s).map(([id, s]) => `${id}: "${(des.find((d) => d.id === id) || {}).pinos}" ≠ "${s}"`);
    ok(!pinErr.length, `os nomes dos bornes (${Object.entries(PINOS).map(([k, v]) => `${k} ${v}`).join(" · ")}): ${pinErr.join("; ") || "todos certos"}`);
    await espera((v) => v.every(([n, s]) => { const f = dados.folhas[folhaAtual], i = f.elementos.findIndex((x) => x.nome === n), g = document.querySelector(`#svg g.el[data-i="${i}"] .valor-bloco`);
      return g && g.textContent === s; }), Object.entries(VALOR).map(([id, s]) => [`${id}.1`, s]), 15000);
    const des2 = await pg.evaluate((ids) => ids.map((id) => { const f = dados.folhas[folhaAtual], i = f.elementos.findIndex((x) => x.nome === `${id}.1`),
      g = document.querySelector(`#svg g.el[data-i="${i}"]`), v = g && g.querySelector(".valor-bloco"), c = g && g.querySelector(".corpo");
      return [id, v ? v.textContent : "", !!v && v.getBoundingClientRect().top >= c.getBoundingClientRect().bottom - 1]; }), Object.keys(VALOR));
    const valErr = des2.filter(([id, v, fora]) => v !== VALOR[id] || !fora).map(([id, v]) => `${id}: "${v}" ≠ "${VALOR[id]}"`);
    ok(!valErr.length, `o valor embaixo do bloco (${Object.values(VALOR).join(" · ")}): ${valErr.join("; ") || "todos certos, fora da caixa"}`);
    await pg.screenshot({ path: "blocos_pt.png" });

    // 5. o painel de cada um: o nome do MaiSim, a explicação; os sem parâmetro mostram a explicação no lugar do "sem parâmetros"
    const painel = async (nome) => { await pg.evaluate((n) => seleciona(dados.folhas[folhaAtual].elementos.find((x) => x.nome === n)), nome);
      await espera((n) => { const p = document.querySelector("#p-params"); return ed.sel === n && !!p && p.textContent !== tr("simu.lendo"); }, nome);
      return pg.evaluate(() => ({ t: document.querySelector("#props .t").textContent, descr: (document.querySelector("#p-params .descr-bloco") || {}).textContent || "",
        sem: /sem parâmetros|no numeric/.test(document.querySelector("#p-params").textContent), campos: document.querySelectorAll("#p-params [data-p]").length,
        rotulos: [...document.querySelectorAll("#p-params label > span")].map((s) => s.textContent),
        dicas: [...document.querySelectorAll("#p-params label")].map((l) => l.title),
        entradas: [...document.querySelectorAll("#props [data-in]")].map((n) => n.closest("label").querySelector("span").textContent),
        saidas: [...document.querySelectorAll("#props [data-out]")].map((n) => n.closest("label").querySelector("span").textContent) })); };
    const resumo = [], semDescr = [], comSem = [], nomeErr = [];
    for (const { id, rot } of vis) {
      const p = await painel(nomeDe(id));
      const [nomeEsperado, descrEsperada] = await pg.evaluate(([rot, id]) => [tr(rot), tr("simu.descr." + id)], [rot, id === "RANDOM" ? "SIGNAL" : id]);
      if (!p.t.startsWith((id === "RANDOM" ? await pg.evaluate(() => tr("simu.cmp_signal")) : nomeEsperado) + " ·")) nomeErr.push(`${id}: "${p.t}"`);
      if (p.descr !== descrEsperada) semDescr.push(id);
      if (p.sem) comSem.push(id);
      resumo.push([id, p]);
    }
    ok(!nomeErr.length, `o painel diz o nome do MaiSim (Integrador, Limitador…): ${nomeErr.join("; ") || "todos"}`);
    ok(!semDescr.length, `o painel explica o bloco (simu.descr.*): ${semDescr.join(", ") || "todos"}`);
    const semPar = resumo.filter(([, p]) => !p.campos).map(([id]) => id);
    ok(!comSem.length && semPar.length >= 15, `os ${semPar.length} sem parâmetros (${semPar.join(", ")}) mostram a explicação, sem o "sem parâmetros"${comSem.length ? ": não em " + comSem.join(", ") : ""}`);
    const de = (id) => (resumo.find(([x]) => x === id) || [])[1] || {};
    ok(NOMES.pt.COUNTER === de("COUNTER").t.split(" · ")[0] && /0,5/.test(de("COUNTER").descr) && /entrada 2 \(R\)/.test(de("COUNTER").descr),
      `o contador: "${de("COUNTER").descr}"`);
    ok(/Ganho \(Kp\)/.test(de("PD").descr) && de("PD").t.startsWith("Derivador d/dt (PD do Gecko)"), `o PD com o nome honesto e o PD de verdade na ajuda: "${de("PD").descr.slice(0, 90)}…"`);
    // os parâmetros com nome legível e a unidade; o nome do Gecko na dica, entre parênteses
    const pi = de("PI");
    ok(pi.rotulos.join("|") === "Kp (ganho proporcional)|Ki (ganho integral) [1/s]|T = Kp/Ki (só leitura) [s]" && /\(r0\b/.test(pi.dicas[0]) && /\(a1\b/.test(pi.dicas[1]),
      `PI: ${pi.rotulos.join(" · ")}; dicas: ${pi.dicas.slice(0, 2).join(" | ")}`);
    const it = de("INT"), hy = de("HYS");
    ok(it.rotulos.join("|") === "k (ganho do integrador) [1/s]|y₀ (valor inicial)|saída mínima|saída máxima" && hy.rotulos[0] === "h (meia largura da histerese)",
      `INT: ${it.rotulos.join(" · ")}; HYS: ${hy.rotulos.join(" · ")}`);
    ok(de("ADD").rotulos[0] === "número de entradas" && de("PT1").rotulos.join("|") === "T (constante de tempo) [s]|K (ganho)" && de("DELAY").rotulos[0] === "Δt (atraso) [s]",
      `ADD: ${de("ADD").rotulos[0]}; PT1: ${de("PT1").rotulos.join(" · ")}; DELAY: ${de("DELAY").rotulos[0]}`);
    ok(it.entradas.join("|") === "entrada 1 · x (o sinal)|entrada 2 · R (reset: ≥ 1 volta a y₀)" && de("ABCDQ").entradas.join("|") === "entrada 1 · a|entrada 2 · b|entrada 3 · c|entrada 4 · θ (o ângulo, em rad)"
      && de("ABCDQ").saidas.join("|") === "saída 1 · d|saída 2 · q" && de("GE").entradas.join("|") === "entrada 1 · a|entrada 2 · b",
      `os rótulos dos terminais dizem o que cada um é: INT ${it.entradas.join(" · ")}; abc→dq ${de("ABCDQ").entradas.join(" · ")} → ${de("ABCDQ").saidas.join(" · ")}`);
    // 6. o T do PI: derivado (Kp/Ki = 1/100 = 10 ms), só leitura (o Gecko ignora a escrita)
    await painel("PI.1");
    const t = await pg.evaluate(() => { const i = document.querySelector('#p-params input[data-derivado="T"]'); return i && { v: i.value, d: i.disabled, p: !!document.querySelector('#p-params [data-p="T"]') }; });
    ok(t && t.v === "10 ms" && t.d && !t.p, `PI: T = Kp/Ki = ${t && t.v}, só leitura (${JSON.stringify(t)})`);
    // 7. a forma do SIGNAL sem a "Importada (arquivo)" (o FILE está fora da paleta)
    await painel("SIGNAL.1");
    const ops = await pg.evaluate(() => [...document.querySelectorAll('#p-params select[data-p="type"] option')].map((o) => o.textContent));
    ok(ops.length === 4 && !ops.some((o) => /Importada|Import/.test(o)), `as formas do SIGNAL: ${ops.join(", ")}`);
    // 8. a dica (passar o mouse): o nome do MaiSim e os parâmetros com o nome do painel
    const dica = await pg.evaluate(() => { const f = dados.folhas[folhaAtual], e = f.elementos.find((x) => x.nome === "PI.1"); dica({ clientX: 50, clientY: 50 }, e);
      const t = $("dica").textContent; esconde(); return t; });
    ok(/Controlador PI/.test(dica) && /Kp \(ganho proporcional\)/.test(dica) && !/T_Value/.test(dica), `a dica do PI: "${dica.slice(0, 120)}"`);

    // 9. em inglês: a paleta, o painel e a explicação acompanham
    await pg.evaluate(() => maisimI18n.muda("en")); await pg.waitForTimeout(800);
    const en = await pg.evaluate(() => ({ abas: [...document.querySelectorAll("#abas button")].map((x) => x.textContent) }));
    ok(["Control", "Math", "Sources", "Special", "Measure", "Circuit"].every((a) => en.abas.includes(a)), `as abas em inglês: ${en.abas.join(", ")}`);
    const enNomes = [];
    for (const id of Object.keys(NOMES.en)) { const p = await painel(nomeDe(id)); if (!p.t.startsWith(NOMES.en[id] + " ·") || /[ãçõé]/.test(p.descr)) enNomes.push(`${id}: "${p.t}"`); }
    ok(!enNomes.length, `os nomes em inglês (${Object.values(NOMES.en).join(", ")}): ${enNomes.join("; ") || "todos"}`);
    const piEn = await painel("PI.1"), coEn = await painel("COUNTER.1");
    ok(piEn.rotulos[0] === "Kp (proportional gain)" && piEn.rotulos[1] === "Ki (integral gain) [1/s]" && /rising edges/.test(coEn.descr) && /0\.5/.test(coEn.descr),
      `PI em inglês: ${piEn.rotulos.join(" · ")}; contador: "${coEn.descr.slice(0, 70)}…"`);
    const ptNomes = [];
    await pg.screenshot({ path: "blocos_en.png" });
    await pg.evaluate(() => maisimI18n.muda("pt")); await pg.waitForTimeout(500);
    for (const id of Object.keys(NOMES.pt)) { const p = await painel(nomeDe(id)); if (!p.t.startsWith(NOMES.pt[id] + " ·")) ptNomes.push(`${id}: "${p.t}"`); }
    ok(!ptNomes.length, `de volta ao português: ${ptNomes.join("; ") || "os mesmos nomes de antes"}`);
    // a caixa de texto com um título longo, sozinha na ponta direita: o ajuste à tela mostra a caixa inteira (Codex, #139)
    const corte = await pg.evaluate(() => { const f = dados.folhas[folhaAtual], salvo = f.elementos;
      const xm = Math.max(...salvo.map((e) => e.x)) + 4, ym = salvo[0] ? salvo[0].y : 0;
      const base = salvo.find((e) => e.tipo === "TEXT");
      f.elementos = salvo.concat([Object.assign(JSON.parse(JSON.stringify(base)), { nome: "TEXT.longo", x: xm, y: ym, titulo: "um título bem comprido para a caixa de texto" })]);
      desenha(); ajusta(); desenha();
      const cx = document.querySelector(`#svg g.el[data-i="${f.elementos.length - 1}"] rect.corpo`), rr = cx.getBoundingClientRect(), sv = $("svg").getBoundingClientRect();
      const res = { dentro: rr.right <= sv.right + 0.5 && rr.left >= sv.left - 0.5, larg: +cx.getAttribute("width") / G, dir: rr.right, svg: sv.right };
      f.elementos = salvo; desenha(); ajusta(); return res; });
    ok(corte.dentro && corte.larg > 4, `a caixa de texto longa na ponta direita cabe no ajuste: borda ${corte.dir.toFixed(0)} ≤ ${corte.svg.toFixed(0)} px (${corte.larg.toFixed(1)} quadrados de largura)`);
    ok(!erros.length, `sem erro na página: ${erros.join(" | ") || "nenhum"}`);
  } catch (e) { ok(false, "erro: " + e.message); }
  finally { if (pg) await pg.evaluate(() => maisimI18n.muda("pt")).catch(() => {}); if (b) await b.close(); console.log(falhas ? `\n${falhas} FALHA(S)` : "\nOK: tudo certo"); process.exit(falhas ? 1 : 0); }
})();
