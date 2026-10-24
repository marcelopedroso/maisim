// validador do controle (sublinhados + testar) e a janela de conflito ao abrir (manter / salvar e abrir / descartar)
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const REINICIA = require("path").resolve(__dirname, "../reinicia_servidor_teste.sh");   // (re)sobe só o servidor de teste
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage(); await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } }); /* começa travado (o padrão é editando; estes testes clicam no cadeado) */
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const ARQ = require("os").homedir() + "/.cache/maisim_teste/circuitos/valida_tela.ipes";
  // o circuito do teste, montado aqui (antes era uma sobra na pasta da instância de teste): U.1 → S.1 → R.1, CONST_1 → GATE.1 → S.1
  const api = (rota, corpo) => fetch("http://localhost:7201/maisim/simu/" + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then((r) => r.json());
  const cmd = (op, args) => api("editor/cmd", { op, args });
  await api("editor/novo", { descartar: true });
  for (const a of [["U.1", 4, 10, "U"], ["S.1", 10, 6, "S"], ["R.1", 16, 10, "R"], ["CONST.1", 4, 18, "CONST"], ["GATE.1", 12, 18, "GATE"], ["VOLT.1", 24, 10, "VOLT"]]) await cmd("CREATE", a);
  for (const [n, i, o] of [["U.1", "a", "gnd"], ["S.1", "a", "b"], ["R.1", "b", "gnd"]]) { await cmd("INNODE", [n, 0, i]); await cmd("OUTNODE", [n, 0, o]); }
  await cmd("SETP", ["CONST.1", "const", 0]); await cmd("OUTNODE", ["CONST.1", 0, "CONST_1"]); await cmd("INNODE", ["GATE.1", 0, "CONST_1"]);
  await api("editor/mede", { nome: "GATE.1", tipo: "G", componente: "S.1" });
  await cmd("OUTNODE", ["VOLT.1", 0, "v_R"]); await api("editor/mede", { nome: "VOLT.1", tipo: "V", no1: "b", no2: "gnd" });
  await api("editor/controle", { controle: { ativo: true, Ts: 1e-4, atuacoes: ["CONST_1"], parametros: [], codigo: "def passo(t, m, p, e):\n    return {}\n" } });
  const salvo = await api("editor/salvar", { nome: "valida_tela", pasta: "circuitos", sobrescrever: true });
  ok(!salvo.erro && salvo.salvo, `circuito do teste salvo: ${salvo.salvo || salvo.erro}`);
  await pg.goto(`http://localhost:7201/maisim/simu/?modelo=${encodeURIComponent(ARQ)}`);
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
  await pg.click("#bt-editar"); await pg.waitForTimeout(500); if (await pg.$(".modal-fundo")) await pg.click(".modal .m-ok");
  await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  await pg.evaluate(() => { sim.par.dt = "1e-6"; });
  await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
  // o código do Marcelo, só com k1 no painel
  await pg.evaluate(() => { ctl.dados.controle.parametros = [{ nome: "k1", valor: 0, unidade: "" }]; desenhaLigacoes();
    poeCodigo('"CONST_1"# comentário\ndef iniciar(p, e):\n    pass\n\n\ndef passo(t, m, p, e):\n    fase = (t * p["f_clk"] + 1e-9) % 1.0\n    return {"CONST_1": 1.0 if fase < p["duty"] else 0.0}\n'); });
  await pg.evaluate(() => guardaControle()); await pg.waitForTimeout(400);
  const v = await pg.evaluate(() => ({ estado: $("ctl-estado").textContent, cls: $("ctl-estado").className,
    marcas: monaco.editor.getModelMarkers({ owner: "maisim" }).map((m) => [m.startLineNumber, m.startColumn, m.endColumn, m.severity]) }));
  ok(/2 avisos no código/.test(v.estado) && v.cls === "aviso" && JSON.stringify(v.marcas) === JSON.stringify([[7, 17, 27, 4], [8, 38, 47, 4]]), `validador: "${v.estado.slice(0, 70)}…" · marcas ${JSON.stringify(v.marcas)}`);
  await pg.click("#ctl-testar"); await pg.waitForFunction(() => !/testando/.test($("ctl-saida").textContent), null, { timeout: 30000 });
  let sa = await pg.evaluate(() => ({ t: $("ctl-saida").textContent, c: $("ctl-saida").className }));
  ok(sa.c === "erro" && /KeyError: 'f_clk'/.test(sa.t) && /linha 7/.test(sa.t), `testar sem f_clk: ${sa.t.split("\n")[0]}`);
  await pg.screenshot({ path: "validador.png" });
  // cria os parâmetros: avisos somem, testar mostra o clock
  await pg.evaluate(() => { ctl.dados.controle.parametros = [{ nome: "f_clk", valor: 1000, unidade: "Hz" }, { nome: "duty", valor: 0.5, unidade: "" }]; desenhaLigacoes(); });
  await pg.evaluate(() => guardaControle()); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => $("ctl-estado").textContent) === "guardado" && await pg.evaluate(() => monaco.editor.getModelMarkers({ owner: "maisim" }).length) === 0, "com f_clk e duty: guardado, sem sublinhados");
  await pg.click("#ctl-testar"); await pg.waitForFunction(() => !/testando/.test($("ctl-saida").textContent), null, { timeout: 30000 });
  sa = await pg.evaluate(() => ({ t: $("ctl-saida").textContent, c: $("ctl-saida").className }));
  ok(sa.c === "ok" && /teste ok/.test(sa.t) && (sa.t.match(/CONST_1 = 1/g) || []).length === 3, `testar: ${sa.t.split("\n").slice(0, 2).join(" | ")}`);
  await pg.screenshot({ path: "testar.png" });
  // mudança do próprio editor + sair e voltar à edição: fica, sem perguntar
  await pg.evaluate(() => api("editor/cmd", { op: "MOVE", args: ["R.1", 22, 12] }).then((j) => { novoEstado ? novoEstado(j) : null; marcaSujo(true); }));
  await pg.click("#bt-editar"); await pg.waitForTimeout(800); await pg.click("#bt-editar"); await pg.waitForTimeout(1500);
  const m1 = await pg.evaluate(() => ({ modal: !!document.querySelector(".modal-fundo"), x: dados.folhas["0"].elementos.find((e) => e.nome === "R.1").x, sujo: ed.sujo }));
  ok(!m1.modal && m1.x === 22 && m1.sujo, `sair e voltar à edição: sem pergunta, a mudança fica (x = ${m1.x}), disquete marcado`);
  // reiniciar o servidor não faz perguntar à toa (ele lembra o que o editor viu)
  await pg.click("#bt-editar"); await pg.waitForTimeout(500);
  execFileSync(REINICIA);
  await pg.click("#bt-editar"); await pg.waitForTimeout(2500);
  ok(!(await pg.$(".modal-fundo")) && await pg.evaluate(() => dados.folhas["0"].elementos.find((e) => e.nome === "R.1").x) === 22, "servidor reiniciado: entra na edição sem perguntar, com a mudança");
  // mudança que o editor não viu (simulada: a lembrança apagada): pergunta; o foco começa em "manter" e Enter mantém
  await pg.click("#bt-editar"); await pg.waitForTimeout(500);
  require("fs").writeFileSync(require("os").homedir() + "/.cache/maisim_teste/visto.txt", "outro"); execFileSync(REINICIA);
  await pg.click("#bt-editar"); await pg.waitForSelector(".modal .m-extra", { timeout: 30000 }); await pg.waitForTimeout(200);
  const bts = await pg.$$eval(".modal .modal-botoes button", (l) => l.map((x) => x.textContent));
  const foco = await pg.evaluate(() => document.activeElement && document.activeElement.textContent);
  ok(bts.join("|") === "Cancelar|Manter as mudanças|Descartar" && foco === "Manter as mudanças", `não vista: botões ${bts.join(" · ")}; foco em "${foco}"`);
  await pg.screenshot({ path: "conflito.png" });
  await pg.keyboard.press("Enter"); await pg.waitForFunction(() => dados && dados.editor && !document.querySelector(".modal-fundo"), null, { timeout: 30000 });
  const m2 = await pg.evaluate(() => ({ x: dados.folhas["0"].elementos.find((e) => e.nome === "R.1").x, sujo: ed.sujo }));
  ok(m2.x === 22 && m2.sujo, `Enter manteve: x = ${m2.x}, disquete marcado`);
  // trocar de modelo com mudança não salva: pergunta; cancelar volta a lista e continua na edição
  await pg.evaluate(() => { $("sel-modelo").value = "exemplos/exemplo_controle_pi.ipes"; $("sel-modelo").dispatchEvent(new Event("change")); });
  await pg.waitForSelector(".modal .m-extra", { timeout: 30000 });
  const bt2 = await pg.$$eval(".modal .modal-botoes button", (l) => l.map((x) => x.textContent));
  ok(/Salvar valida_tela\.ipes e abrir/.test(bt2.join("|")) && /Descartar e abrir/.test(bt2.join("|")), `outro modelo: ${bt2.join(" · ")}`);
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(800);
  const c3 = await pg.evaluate(() => ({ sel: $("sel-modelo").value, ed: ed.ligado, x: dados.folhas["0"].elementos.find((e) => e.nome === "R.1").x }));
  ok(/valida_tela\.ipes$/.test(c3.sel) && c3.ed && c3.x === 22, `cancelar: a lista volta (${c3.sel.split("/").pop()}), segue editando, a mudança fica`);
  // novo com mudança não salva: pergunta (salvar e criar / descartar e criar); Esc não perde nada
  await pg.click("#bt-novo"); await pg.waitForSelector(".modal .m-ok"); await pg.click(".modal .m-ok");
  await pg.waitForSelector(".modal .m-extra", { timeout: 30000 });
  const bt3 = await pg.$$eval(".modal .modal-botoes button", (l) => l.map((x) => x.textContent));
  ok(/Salvar valida_tela\.ipes e criar/.test(bt3.join("|")) && /Descartar e criar/.test(bt3.join("|")), `novo: ${bt3.join(" · ")}`);
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(600);
  ok(await pg.evaluate(() => dados.folhas["0"].elementos.some((e) => e.nome === "R.1")), "Esc no novo: o circuito continua");
  await pg.evaluate((a) => api("editor/abrir", { arq: a, modo: "descartar" }), require("os").homedir() + "/.cache/maisim_teste/circuitos/valida_tela.ipes");
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
