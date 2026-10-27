// os prefixos de engenharia nos campos de número (instância de teste 7200 → 7201), pedido de Marcelo em 27/10: p n u/µ/μ m k M
// G (maiúscula e minúscula contam), a unidade depois ignorada (50us, 20kHz, 1mF, 10Ω), vírgula decimal (0,5u) e as formas de
// antes (5e-7, 0.00005) — o lerNumero do simu.js, o mesmo em todo campo; embaixo do campo, o que foi entendido ("= 50 µs") ou
// o erro, e o que não é número não vai ao servidor. No ⚙, "Amostra do scope a cada" (o intervalo, com "→ N amostras"; o
// servidor continua recebendo o número) e o aviso da portadora (a amostra mais longa que meio período do SIGNAL mais rápido).
// Circuitos: exemplos/exemplo_buck.ipes (portadora de 20 kHz, Δt 0,5 µs, 20 ms) e exemplo_controle_pwm (o Ts do controle).
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const SIMU = "http://localhost:7201/maisim/simu/";
const post = (rota, corpo) => fetch(SIMU + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then((r) => r.json());
const BUCK = "exemplos/exemplo_buck.ipes";
(async () => {
  let b, pg, tsAntes = null;
  try {
    await post("editor/abrir", { arq: BUCK, modo: "descartar" });
    b = await chromium.launch(); pg = await (await b.newContext({ viewport: { width: 1600, height: 950 }, locale: "pt-BR" })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.addInitScript(() => { try { localStorage.removeItem("maisim-simu-sim"); } catch (e) { /* ok */ } });
    await pg.goto("http://localhost:7200/maisim/simu/?modelo=" + encodeURIComponent(BUCK));
    for (let k = 0; k < 60 && !(await pg.evaluate(() => typeof dados !== "undefined" && dados && dados.editor && ed.ligado)); k++) {
      if (await pg.$(".modal .m-ok")) await pg.click(".modal .m-ok"); await pg.waitForTimeout(500); }
    const espera = async (f, arg, ms = 30000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await pg.evaluate(f, arg)) return true; await pg.waitForTimeout(300); } return false; };
    const nota = (sel) => pg.evaluate((sel) => { const i = document.querySelector(sel), n = i && i._nota;
      return n ? { txt: n.hidden ? "" : n.textContent, erro: n.classList.contains("erro"), inv: i.classList.contains("invalido"), aria: i.getAttribute("aria-invalid"),
        desc: (i.getAttribute("aria-describedby") || "").split(" ").includes(n.id) } : null; }, sel);

    // 1. o leitor (lerNumero): cada prefixo, a unidade ignorada, a vírgula, as formas de antes; e o que não vale
    const casos = await pg.evaluate(() => {
      const C = [["3p", 3e-12], ["4n", 4e-9], ["50u", 5e-5], ["50µ", 5e-5], ["50μ", 5e-5], ["20m", 0.02], ["1k", 1e3], ["2M", 2e6], ["1G", 1e9],
        ["50us", 5e-5], ["20kHz", 2e4], ["1mF", 1e-3], ["10Ω", 10], ["1 MΩ", 1e6], ["0,5u", 5e-7], ["5e-7", 5e-7], ["0.00005", 5e-5], ["1m", 1e-3], ["1s", 1], ["5V", 5],
        ["-2m", -2e-3], ["1e3k", 1e6], [".5", 0.5], ["1K", NaN], ["1e", NaN], ["abc", NaN], ["", NaN], ["1,2,3", NaN], ["$x", NaN], ["1 km", NaN]];
      return C.map(([t, v]) => { const r = lerNumero(t); return [t, r, Number.isNaN(v) ? Number.isNaN(r) : r === v]; }); });
    const errados = casos.filter((c) => !c[2]);
    ok(!errados.length, `lerNumero: ${casos.length - errados.length}/${casos.length} casos certos${errados.length ? " — errados: " + errados.map((c) => `${c[0]}→${c[1]}`).join(", ") : ""}`);

    // 2. o ⚙: Δt "0,5u", tfim "20m", amostra "2u" → "= 2 µs → 10 000 amostras"; o aviso da portadora (20 kHz) com 100u
    await pg.click("#bt-param"); await pg.waitForSelector('.modal input[name="amostra"]');
    const rot = await pg.evaluate(() => document.querySelector('.modal input[name="amostra"]').closest("label").querySelector("span").textContent);
    ok(/^Amostra do scope a cada/.test(rot) && !(await pg.$('.modal input[name="amostras"]')), `o campo novo: "${rot}" (o "Amostras guardadas (até)" saiu)`);
    await pg.fill('.modal input[name="dt"]', "0,5u"); await pg.fill('.modal input[name="tfim"]', "20m"); await pg.fill('.modal input[name="amostra"]', "2u");
    let n = { dt: await nota('.modal input[name="dt"]'), tfim: await nota('.modal input[name="tfim"]'), am: await nota('.modal input[name="amostra"]') };
    let av = await pg.evaluate(() => { const a = document.querySelector(".modal .m-aviso-amostra"); return a.hidden ? "" : a.textContent; });
    ok(n.dt.txt === "= 500 ns" && n.tfim.txt === "= 20 ms" && n.am.txt === "= 2 µs → 10 000 amostras" && n.am.desc && !av,
      `as notas: Δt "${n.dt.txt}", tfim "${n.tfim.txt}", amostra "${n.am.txt}" (aria-describedby ${n.am.desc}); sem aviso`);
    await pg.screenshot({ path: "unidades_parametros.png", clip: await pg.evaluate(() => { const r = document.querySelector(".modal").getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; }) });
    await pg.fill('.modal input[name="amostra"]', "100u");
    av = await pg.evaluate(() => { const a = document.querySelector(".modal .m-aviso-amostra"); return a.hidden ? "" : a.textContent; });
    n.am = await nota('.modal input[name="amostra"]');
    ok(/meio período da portadora \(50 µs, 20 kHz\): os pulsos não vão aparecer/.test(av) && n.am.txt === "= 100 µs → 200 amostras", `amostra 100u: "${n.am.txt}" · aviso "${av}"`);
    await pg.screenshot({ path: "unidades_aviso.png", clip: await pg.evaluate(() => { const r = document.querySelector(".modal").getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; }) });
    await pg.fill('.modal input[name="amostra"]', "0,1u");
    n.am = await nota('.modal input[name="amostra"]');
    ok(/^= 100 ns → 40 000 amostras \(uma por passo Δt/.test(n.am.txt), `menor que o Δt: "${n.am.txt}"`);
    await pg.fill('.modal input[name="amostra"]', "2u");
    av = await pg.evaluate(() => !document.querySelector(".modal .m-aviso-amostra").hidden);
    ok(!av, "de volta a 2u: o aviso some");
    // inválido: o ⚙ fica aberto, o erro embaixo do campo, nada guardado
    const parAntes = await pg.evaluate(() => JSON.stringify(sim.par));
    await pg.fill('.modal input[name="dt"]', "0,5x"); await pg.click(".modal .m-ok"); await pg.waitForTimeout(300);
    n.dt = await nota('.modal input[name="dt"]');
    const aberto = await pg.evaluate(() => !!document.querySelector(".modal .m-ok") && document.activeElement && document.activeElement.name);
    ok(aberto === "dt" && n.dt.erro && n.dt.inv && n.dt.aria === "true" && /^não entendi: um número/.test(n.dt.txt) && (await pg.evaluate(() => JSON.stringify(sim.par))) === parAntes,
      `Δt "0,5x": o ⚙ continua aberto (foco em ${aberto}), "${n.dt.txt}", nada guardado`);
    await pg.fill('.modal input[name="dt"]', "0,5u"); await pg.fill('.modal input[name="nome"]', "unidades_tela");
    await pg.click(".modal .m-ok"); await pg.waitForTimeout(300);
    const par = await pg.evaluate(() => ({ ...sim.par, aberto: !!document.querySelector(".modal-fundo"), msg: $("msg").textContent }));
    ok(!par.aberto && Number(par.dt) === 5e-7 && Number(par.tfim) === 0.02 && Number(par.amostra) === 2e-6 && par.amostras === "10000",
      `guardado: dt ${par.dt}, tfim ${par.tfim}, amostra ${par.amostra}, amostras ${par.amostras} · "${par.msg}"`);
    // reabrir mostra o que foi guardado, com o prefixo
    await pg.click("#bt-param"); await pg.waitForSelector('.modal input[name="amostra"]');
    const vals = await pg.evaluate(() => ["dt", "tfim", "amostra"].map((k) => document.querySelector(`.modal input[name="${k}"]`).value).join(" "));
    await pg.click(".modal .m-cancela");
    ok(vals === "500n 20m 2µ", `reaberto: ${vals}`);
    // o ▶ roda com 10 000 amostras, a cada 2 µs
    await pg.click("#bt-play");
    await espera(() => ["rodando", "fim", "erro"].includes(sim.estado), null, 20000);
    await espera(() => sim.estado === "fim" || sim.estado === "erro", null, 180000);
    const r = await pg.evaluate(() => api("editor/rodada"));
    const passo = r.tfim / (r.amostras - 1);
    ok(r.estado === "fim" && r.dt === 5e-7 && r.tfim === 0.02 && r.amostras >= 10000 && r.amostras <= 10001 && Math.abs(passo - 2e-6) < 1e-9,
      `rodada: ${r.estado} ${r.erro || ""}, Δt ${r.dt}, tfim ${r.tfim}, ${r.amostras} amostras (a cada ${(passo * 1e6).toFixed(3)} µs)`);
    // em inglês: o rótulo, a nota, o aviso e o erro
    await pg.evaluate(() => maisimI18n.muda("en")); await pg.waitForTimeout(300);
    await pg.click("#bt-param"); await pg.waitForSelector('.modal input[name="amostra"]');
    await pg.fill('.modal input[name="amostra"]', "100u"); await pg.fill('.modal input[name="tfim"]', "20x");
    const en = await pg.evaluate(() => ({ rot: document.querySelector('.modal input[name="amostra"]').closest("label").querySelector("span").textContent,
      am: document.querySelector('.modal input[name="amostra"]')._nota.textContent, av: document.querySelector(".modal .m-aviso-amostra").textContent,
      tf: document.querySelector('.modal input[name="tfim"]')._nota.textContent }));
    await pg.click(".modal .m-cancela"); await pg.evaluate(() => maisimI18n.muda("pt")); await pg.waitForTimeout(300);
    ok(/^Scope sample every/.test(en.rot) && /^Longer than half the carrier period \(50 µs, 20 kHz\)/.test(en.av) && /^not understood: a number/.test(en.tf),
      `em inglês: "${en.rot}" · "${en.av}" · tfim "20x": "${en.tf}"`);
    // guardado de antes só com o número de amostras: abre com o intervalo equivalente (tfim/amostras)
    await pg.evaluate(() => { sim.par.tfim = "0.04"; sim.par.amostras = "4000"; sim.par.amostra = "2e-6"; });
    await pg.click("#bt-param"); await pg.waitForSelector('.modal input[name="amostra"]');
    const velho = await pg.evaluate(() => document.querySelector('.modal input[name="amostra"]').value);
    await pg.click(".modal .m-cancela");
    ok(velho === "10µ", `o número de amostras de antes (4000 em 40 ms) abre como a cada ${velho}`);
    await pg.evaluate(() => { sim.par.tfim = "0.02"; sim.par.amostras = "10000"; sim.par.amostra = "2e-6"; });

    // 3. o parâmetro do componente: R "1k" → 1000 (e a nota "= 1 kΩ"), C "100µ"; o $nome continua; o inválido não vai
    const valor = (nome, typ, p) => pg.evaluate(async ([nome, typ, p]) => ((await api(`editor/params?nome=${nome}&dom=LK&typ=${typ}`)).find((q) => q.nome === p) || {}).valor, [nome, typ, p]);
    const escolhe = async (nome, p) => { await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === n)), nome);
      await pg.waitForSelector(`#p-params input[data-p="${p}"]`, { timeout: 30000 }); };
    await escolhe("R.1", "R");
    await pg.fill('#p-params input[data-p="R"]', "1k"); await pg.press('#p-params input[data-p="R"]', "Tab");
    ok(await espera(async () => ((await api("editor/params?nome=R.1&dom=LK&typ=1")).find((q) => q.nome === "R") || {}).valor === 1000), `R.1 = "1k": o Gecko fica com ${await valor("R.1", 1, "R")}`);
    await pg.waitForFunction(() => { const i = document.querySelector('#p-params input[data-p="R"]'); return i && i.value === "1000"; }, null, { timeout: 20000 }).catch(() => {});
    n.r = await nota('#p-params input[data-p="R"]');
    const hist = await pg.evaluate(() => historico.map((x) => x.t).find((t) => /R\.1: R =/.test(t)) || "");
    ok(n.r && n.r.txt === "= 1 kΩ" && /R\.1: R = 1 kΩ/.test(hist), `o campo refeito: "${n.r && n.r.txt}"; no histórico: "${hist}"`);
    await pg.evaluate(() => document.querySelector('#p-params input[data-p="R"]').scrollIntoView({ block: "center" }));
    await pg.screenshot({ path: "unidades_componente.png", clip: await pg.evaluate(() => { const r = $("props").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 420) }; }) });
    await escolhe("C.1", "C");
    await pg.fill('#p-params input[data-p="C"]', "47µ"); await pg.press('#p-params input[data-p="C"]', "Tab");
    ok(await espera(async () => ((await api("editor/params?nome=C.1&dom=LK&typ=3")).find((q) => q.nome === "C") || {}).valor === 4.7e-5), `C.1 = "47µ": ${await valor("C.1", 3, "C")}`);
    await escolhe("C.1", "C");
    await pg.fill('#p-params input[data-p="C"]', "100µ"); await pg.press('#p-params input[data-p="C"]', "Tab");
    ok(await espera(async () => ((await api("editor/params?nome=C.1&dom=LK&typ=3")).find((q) => q.nome === "C") || {}).valor === 1e-4), `C.1 = "100µ": ${await valor("C.1", 3, "C")}`);
    // inválido: a nota com o erro, o campo marcado, nenhum pedido
    await escolhe("R.1", "R");
    const pedidosR = () => pg.evaluate(() => historico.filter((x) => /R\.1: R = /.test(x.t)).length), nh = await pedidosR();
    await pg.fill('#p-params input[data-p="R"]', "1K"); await pg.press('#p-params input[data-p="R"]', "Tab"); await pg.waitForTimeout(800);
    n.r = await nota('#p-params input[data-p="R"]');
    const depois = await pg.evaluate(() => ({ msg: $("msg").textContent, v: document.querySelector('#p-params input[data-p="R"]').value })); depois.h = await pedidosR();
    ok(n.r.erro && n.r.inv && /não entendi/.test(n.r.txt) && depois.h === nh && depois.v === "1K" && (await valor("R.1", 1, "R")) === 1000 && /R: um número, ou \$nome/.test(depois.msg),
      `R.1 = "1K" (o K maiúsculo não vale): "${n.r.txt}", nada enviado (R continua ${await valor("R.1", 1, "R")}) · "${depois.msg}"`);
    // o $nome continua: liga à variável (criada com o valor de agora, 1000) e "2k" depois desliga com 2000
    await pg.fill('#p-params input[data-p="R"]', "$R_unid"); await pg.press('#p-params input[data-p="R"]', "Escape").catch(() => {}); await pg.press('#p-params input[data-p="R"]', "Tab");
    await pg.waitForSelector('#p-params .com-var input.var[data-p="R"]', { timeout: 30000 });
    let v = await pg.evaluate(() => ({ g: dados.globais["$R_unid"], var: dados.folhas["0"].elementos.find((x) => x.nome === "R.1").par.resistance_var,
      mostra: document.querySelector('#p-params .com-var small').textContent }));
    n.r = await nota('#p-params input[data-p="R"]');
    ok(v.g === 1000 && v.var === "$R_unid" && v.mostra === "= 1 kΩ" && n.r.txt === "" && !n.r.erro, `R ← $R_unid: a variável ${v.g}, o campo mostra "${v.mostra}" (sem nota a mais)`);
    await pg.fill('#p-params input[data-p="R"]', "2k"); await pg.press('#p-params input[data-p="R"]', "Tab");
    ok(await espera(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "R.1"); return e.par.resistance === 2000 && !e.par.resistance_var; }),
      `"2k" no lugar da variável: desliga, R = ${await valor("R.1", 1, "R")}`);
    // a variável global criada com prefixo (o ⚙, aba das variáveis)
    await pg.click("#bt-param"); await pg.waitForSelector(".modal .m-abas"); await pg.click('.m-abas button[data-aba="vars"]');
    await pg.fill("#gv-nome", "f_unid"); await pg.fill("#gv-valor", "20k");
    n.gv = await nota("#gv-valor");
    await pg.click("#gv-cria");
    ok(await espera(() => dados.globais["$f_unid"] === 20000) && n.gv.txt === "= 20000", `variável nova "20k": ${await pg.evaluate(() => dados.globais["$f_unid"])} (nota "${n.gv.txt}")`);
    await pg.fill('.gv input[data-g="$f_unid"]', "1,5M"); await pg.press('.gv input[data-g="$f_unid"]', "Enter");
    ok(await espera(() => dados.globais["$f_unid"] === 1.5e6), `e mudada para "1,5M": ${await pg.evaluate(() => dados.globais["$f_unid"])}`);
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(200);

    // 4. o Ts do controle (exemplo_controle_pwm): cada prefixo na nota; o inválido não é guardado; "2u" é guardado como 2e-6
    await pg.click("#bt-modelo"); await pg.waitForSelector(".lista-abrir .op"); await pg.fill(".busca-abrir", "exemplo_controle_pwm"); await pg.keyboard.press("Enter");
    for (let k = 0; k < 180; k++) {                    // o buck mudou: "descartar e abrir" (o m-ok do aviso de não salvo)
      if (await pg.$(".modal .m-ok")) await pg.click(".modal .m-ok");
      else if (await pg.evaluate(() => /exemplo_controle_pwm/.test((dados && dados.arq) || "") && dados.editor && document.querySelectorAll("#svg .el").length >= 10)) break;
      await pg.waitForTimeout(500); }
    await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
    if (!(await pg.evaluate(() => document.body.classList.contains("com-controle") && ctl.carregado))) await pg.click("#bt-ctl");
    await pg.waitForFunction(() => ctl.carregado && ctl.dados, null, { timeout: 30000 }); await pg.waitForTimeout(400);
    tsAntes = (await pg.evaluate(() => api("editor/controle"))).controle.Ts;
    const notasTs = [];
    for (const [txt, esp] of [["2000000p", "= 2 µs"], ["5000n", "= 5 µs"], ["50u", "= 50 µs"], ["50µs", "= 50 µs"], ["0,1ms", "= 100 µs"], ["0.00002k", "= 20 ms"], ["1e-12M", "= 1 µs"], ["1e-15G", "= 1 µs"], ["5e-5", "= 50 µs"]]) {
      await pg.fill("#ctl-ts", txt); const q = await nota("#ctl-ts"); notasTs.push(`${txt} ${q.txt}`); if (q.txt !== esp || q.erro) ok(false, `Ts "${txt}": "${q.txt}" (esperado "${esp}")`); }
    ok(notasTs.length === 9, `Ts com cada prefixo: ${notasTs.join(" · ")}`);
    const info = await pg.evaluate(() => $("ctl-ts-i").getAttribute("title"));
    ok(/= 50 × Δt de 1 µs · efetivo 50 µs/.test(info), `e o Ts × Δt lê o prefixo: ${info.split("\n")[0]}`);
    await pg.fill("#ctl-ts", "2x"); await pg.press("#ctl-ts", "Tab"); await pg.waitForTimeout(900);
    n.ts = await nota("#ctl-ts");
    const est = await pg.evaluate(() => $("ctl-estado").textContent);
    ok(n.ts.erro && n.ts.inv && (await pg.evaluate(() => api("editor/controle"))).controle.Ts === tsAntes && /valor inválido/.test(est), `Ts "2x": "${n.ts.txt}", não guardado (${tsAntes}) · "${est}"`);
    await pg.fill("#ctl-ts", "2u"); await pg.press("#ctl-ts", "Tab"); await pg.waitForTimeout(900);
    ok((await pg.evaluate(() => api("editor/controle"))).controle.Ts === 2e-6, "Ts \"2u\": guardado como 2e-6");
    // a tabela dos parâmetros p[...]: o valor com prefixo, na unidade da linha ("20k" Hz → "= 20 kHz", guardado 20000)
    await pg.click('#ctl-var-lista [data-tabela="par"]'); await pg.click("#ctl-par-novo"); await pg.waitForTimeout(900);
    const linhaP = '#ctl-par .ctl-par:last-child';
    await pg.fill(`${linhaP} [data-k="unidade"]`, "Hz"); await pg.fill(`${linhaP} [data-k="valor"]`, "20k");
    n.p = await nota(`${linhaP} [data-k="valor"]`);
    await pg.press(`${linhaP} [data-k="valor"]`, "Tab"); await pg.waitForTimeout(900);
    const pars = (await pg.evaluate(() => api("editor/controle"))).controle.parametros, k1 = pars[pars.length - 1];
    ok(n.p.txt === "= 20 kHz" && k1 && k1.valor === 20000 && k1.unidade === "Hz", `p["${k1 && k1.nome}"] = "20k" Hz: "${n.p.txt}", guardado ${k1 && k1.valor}`);
    await pg.click(`${linhaP} [data-rm]`); await pg.waitForTimeout(900);
    ok((await pg.evaluate(() => api("editor/controle"))).controle.parametros.length === pars.length - 1, "e tirado de novo");
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  } catch (e) { ok(false, "erro: " + (e.stack || e.message)); }
  finally {
    try { if (tsAntes !== null && pg) { const c = (await pg.evaluate(() => api("editor/controle"))).controle; if (c.Ts !== tsAntes) await post("editor/controle", { controle: { ...c, Ts: tsAntes } }); } } catch (e) { /* ok */ }
    try { await post("editor/abrir", { arq: BUCK, modo: "descartar" }); } catch (e) { /* ok */ }
    if (b) await b.close();
  }
  process.exit(falhas ? 1 : 0);
})();
