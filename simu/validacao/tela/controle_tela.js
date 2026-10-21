// instância de teste (7201): painel Controle com o PI de corrente do RL
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const CODIGO = `def iniciar(p, e):
    e["integral"] = 0.0
    print("PI pronto: Kp =", round(p["Kp"], 3))


def passo(t, m, p, e):
    erro = p["i_ref"] - m["i_L"]
    e["integral"] += erro * p["Ts"]
    u = p["Kp"] * erro + p["Ki"] * e["integral"]
    scope("erro", erro)
    return {"u_ctrl": max(-p["Vmax"], min(p["Vmax"], u))}
`;
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  await pg.goto("http://localhost:7201/maisim/simu/?modelo=exemplos%2Fexemplo_cascata_hb.ipes");
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(400); if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok");
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  // o circuito do teste (pela API, como no teste do servidor) e a configuração do controle
  await pg.evaluate(async (codigo) => {
    await api("editor/novo", { descartar: true }); const c = (op, args) => api("editor/cmd", { op, args });
    for (const a of [["U.1", 10, 10, "U"], ["R.1", 20, 10, "R"], ["L.1", 30, 10, "L"], ["CONST.1", 40, 6, "CONST"], ["AMP.1", 40, 12, "AMP"]]) await c("CREATE", a);
    for (const [n, i, o] of [["U.1", "a", "gnd"], ["R.1", "a", "b"], ["L.1", "b", "gnd"]]) { await c("INNODE", [n, 0, i]); await c("OUTNODE", [n, 0, o]); }
    await c("SETP", ["R.1", "R", 1]); await c("SETP", ["L.1", "L", 0.01]); await c("SETP", ["CONST.1", "const", 0]); await c("OUTNODE", ["CONST.1", 0, "u_ctrl"]);
    await c("SETP", ["U.1", "type", 400]); await c("OUTNODE", ["AMP.1", 0, "i_L"]); await api("editor/mede", { nome: "AMP.1", tipo: "I", componente: "L.1" });
    const wc = 2 * Math.PI * 200;
    await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["u_ctrl"], codigo,
      parametros: [{ nome: "Kp", valor: 0.01 * wc, unidade: "V/A" }, { nome: "Ki", valor: wc, unidade: "V/As" }, { nome: "i_ref", valor: 5, unidade: "A" }, { nome: "Vmax", valor: 100, unidade: "V" }] } });
    novoEstado(await api("editor/estado")); ajusta(); sim.par.dt = "1e-6"; sim.par.tfim = "0.01"; sim.par.nome = "teste_tela_pi"; sim.par.amostras = "4000";
    await recarregaControle();
  }, CODIGO);
  // a fonte: campo "sinal de controle" pelo painel da direita
  await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "U.1")));
  await pg.waitForSelector("#p-sinal"); await pg.fill("#p-sinal", "u_ctrl"); await pg.press("#p-sinal", "Tab");
  await pg.waitForFunction(() => /controlada por u_ctrl/.test($("msg").textContent), null, { timeout: 20000 });
  const u1 = await pg.evaluate(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "U.1"); return [e.par.sourceType, e.mede[0], valorPrincipal(e)]; });
  ok(u1[0] === 400 && u1[1] === "u_ctrl", `fonte U.1 pelo painel: tipo ${u1[0]}, sinal ${u1[1]}, no desenho "${u1[2]}"`);
  await pg.evaluate(() => seleciona(null));
  // o painel Controle
  await pg.click("#bt-ctl");
  await pg.waitForFunction(() => ctl.carregado && (ctl.editor || ctl.texto), null, { timeout: 30000 });
  const temMonaco = await pg.evaluate(() => !!ctl.editor);
  ok(temMonaco, `editor ${temMonaco ? "Monaco (o do VS Code)" : "caixa de texto (sem Monaco)"} com o código: ${(await pg.evaluate(() => codigoAtual().split("\n")[6])).trim()}`);
  const lado = await pg.evaluate(() => ({ ativo: $("ctl-ativo").checked, atu: [...document.querySelectorAll("#ctl-atu [data-atu]")].map((x) => x.dataset.atu + (x.checked ? "✓" : "")),
    ent: [...document.querySelectorAll("#ctl-ent code")].map((x) => x.textContent), par: [...document.querySelectorAll('#ctl-par [data-k="nome"]')].map((x) => x.value), ts: (($("ctl-ts-i").getAttribute("title") || $("ctl-ts-i").dataset.dica || "") + "\n" + $("ctl-ts-info").innerText) }));
  ok(lado.ativo && lado.atu.join() === "u_ctrl✓" && lado.ent.includes("i_L") && lado.par.join() === "Kp,Ki,i_ref,Vmax",
     `painel: ativo, atuações ${lado.atu}, medidas ${lado.ent}, parâmetros ${lado.par}, Ts ${lado.ts}`);
  ok(await pg.$$eval("#svg .tag-atuador", (s) => s.map((x) => x.textContent).join()) === "⚙u_ctrl", "no desenho: CONST.1 com a etiqueta ⚙ u_ctrl");
  await pg.screenshot({ path: "controle_painel.png" });
  // erro de sintaxe: marca a linha
  await pg.evaluate(() => { ctl.editor.setValue(codigoAtual().replace('e["integral"] += erro * p["Ts"]', 'e["integral"] += erro * p["Ts"] +')); });
  await pg.waitForFunction(() => /erro de sintaxe/.test($("ctl-estado").textContent), null, { timeout: 10000 });
  const marc = await pg.evaluate(() => monaco.editor.getModelMarkers({}).map((m) => `${m.startLineNumber}: ${m.message}`));
  ok(marc.length && /^8:/.test(marc[0]), `erro de sintaxe marcado: ${$m = marc[0]}`.replace("$m = ", ""));
  await pg.evaluate((c) => ctl.editor.setValue(c), CODIGO);
  await pg.waitForFunction(() => $("ctl-estado").textContent === "guardado", null, { timeout: 10000 });
  ok(await pg.evaluate(() => monaco.editor.getModelMarkers({}).length === 0), "corrigido: guardado, sem marcas");
  // autocompletar de m["…"]
  await pg.evaluate(() => { const ed_ = ctl.editor; ed_.setPosition({ lineNumber: 11, column: 1 }); ed_.focus(); });
  await pg.keyboard.type('    x = m["'); await pg.waitForTimeout(700);
  const sug = await pg.$$eval(".monaco-editor .suggest-widget .monaco-list-row", (r) => r.map((x) => x.getAttribute("aria-label") || x.textContent));
  ok(sug.some((s) => /i_L/.test(s)), `autocompletar em m["…": ${sug.slice(0, 4).join(" | ")}`);
  await pg.keyboard.press("Escape"); await pg.evaluate((c) => ctl.editor.setValue(c), CODIGO); await pg.waitForTimeout(800);
  // ▶ com o controle
  await pg.click("#bt-play");
  await pg.waitForFunction(() => sim.estado === "fim" || sim.estado === "erro", null, { timeout: 60000 });
  const j = await pg.evaluate(() => api("editor/rodada"));
  ok(j.estado === "fim", `rodada pelo ▶: ${j.estado} ${j.erro || ""} · ${j.amostras} amostras em ${j.segundos} s · sinais ${j.sinais}`);
  ok(/PI pronto: Kp = 12.566/.test(await pg.textContent("#ctl-saida")), `print() do código na saída do controle: ${(await pg.textContent("#ctl-saida")).trim()}`);
  // erro em tempo de execução: abre o painel na linha
  await pg.evaluate((c) => ctl.editor.setValue(c.replace('    scope("erro", erro)', '    if t > 0.002:\n        raise ValueError("teste de erro")\n    scope("erro", erro)')), CODIGO);
  await pg.waitForTimeout(800); await pg.evaluate(() => mostraDoca("scope"));
  await pg.click("#bt-play"); await pg.waitForFunction(() => sim.estado === "erro", null, { timeout: 60000 }); await pg.waitForTimeout(500);
  const ec = await pg.evaluate(() => ({ aba: abaDoca, marcas: monaco.editor.getModelMarkers({}).map((m) => `${m.startLineNumber}: ${m.message}`), saida: $("ctl-saida").textContent.split("\n")[0] }));
  ok(ec.aba === "controle" && ec.marcas.length && /^11:/.test(ec.marcas[0]), `erro durante a rodada: painel aberto, linha marcada (${ec.marcas[0]}); saída: ${ec.saida}`);
  await pg.screenshot({ path: "controle_erro.png" });
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
