// os contextos salvos na tela (direto no servidor de teste 7201, claude de mentira), Marcelo em 21/10 ("um botãozinho para
// salvar isso na memória não volátil… usar em outras conversas"): "salvar" com a nota de quem salva; a biblioteca
// ("contextos"): usar nesta conversa (a etiqueta 📘 ao lado dos anexos; × tira), abrir (o resumo formatado e a conversa),
// editar, exportar (baixa o .maisimctx), importar, apagar (pergunta); as conversas anteriores, salvas como contexto; o "exportar"
// do topo da conversa, juntando com o contexto em uso (espera o resumo único pela IA e baixa). Sem fotos.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const pid = execSync(`ss -ltnp | grep ':7201 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1`).toString().trim();
const ENV = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`).toString().split("\0").filter((x) => x.includes("=")).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)]));
if (!(ENV.MAISIM_CLAUDE_BIN || "").endsWith("claude_falso.py") || !/maisim_teste/.test(ENV.MAISIM_CONTEXTOS || "")) { console.log("FALHA suba o servidor de teste (reinicia_servidor_teste.sh)"); process.exit(1); }
const CONF = ENV.MAISIM_CLAUDE_DIR, CTX = ENV.MAISIM_CONTEXTOS;
fs.mkdirSync(CONF, { recursive: true }); fs.writeFileSync(path.join(CONF, "falso_cenario"), "ganho"); fs.writeFileSync(path.join(CONF, "falso_logado"), "");
const DADOS = path.resolve(__dirname, "../dados");
for (const f of ["exemplo_controle_pwm.ipes", "exemplo_controle_pwm.controle.json"]) fs.copyFileSync(path.join(DADOS, f), path.join(ENV.MAISIM_SALVOS, f));
const ARQ = path.join(ENV.MAISIM_SALVOS, "exemplo_controle_pwm.ipes"), URL = "http://localhost:7201/maisim/simu/?modelo=" + encodeURIComponent(ARQ);
const api = (pg, rota, corpo) => pg.evaluate(([r, c]) => fetch(r, c ? { method: "POST", headers: { "Content-Type": "application/json", "X-MaiSim": "1" }, body: JSON.stringify(c) } : {}).then((x) => x.json()), [rota, corpo]);
const antes = new Set(fs.existsSync(CTX) ? fs.readdirSync(CTX) : []);
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1700, height: 950 }, acceptDownloads: true }); const pg = await ctx.newPage();
    await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
    await pg.goto(URL);
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await api(pg, "editor/abrir", { arq: ARQ, modo: "descartar" });
    await api(pg, "claude/nova", {});
    await pg.reload(); await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 });
    await pg.click("#bt-ctl"); await pg.waitForFunction(() => ctl.carregado && editorPronto(), null, { timeout: 30000 });
    await pg.click("#ctl-claude-bt"); await pg.waitForTimeout(1200);
    // uma conversa: um pedido
    await pg.fill("#cc-texto", "dobre o Kp"); await pg.click("#cc-enviar");
    await pg.waitForFunction(() => cc.estado && !cc.estado.andamento && (cc.estado.conversa.historico || []).length === 1, null, { timeout: 60000 })
      .catch(async (e) => {                         // falhou 2 vezes em ~10 rodadas sem causa achada (21/10): diz onde parou
        console.log("  depuração:", JSON.stringify(await pg.evaluate(() => ({ aviso: cc.aviso, logado: cla.estado && cla.estado.logado, andamento: cc.estado && cc.estado.andamento,
          hist: cc.estado && (cc.estado.conversa.historico || []).length, erro: cc.estado && cc.estado.erro, texto: $("cc-texto").value, janela: !!document.querySelector(".modal.cla") }))));
        throw e; });
    const sidAntigo = (await api(pg, "claude/contextos", null)).conversa;
    // salvar: a nota de quem salva (sem resumo pela IA: Marcelo, 21/10), guardado; o aviso em verde
    await pg.click("#cc-salvar"); await pg.waitForSelector(".cx-salvar");
    ok(!(await pg.$(".cx-salvar .cx-gerar")) && /nota/.test(await pg.evaluate(() => document.querySelector(".cx-salvar .cx-res-cab").textContent)),
       "a janela pede a nota (sem \"gerar com a IA\")");
    await pg.fill(".cx-salvar .cx-resumo", "## O que lembrar\nKp dobrado; $i_L$ em 10 A.");
    fs.writeFileSync(path.join(CONF, "falso_resumo_lento"), "3");
    await pg.check(".cx-salvar .cx-resumo-ia");                    // o resumo pela IA, depois de salvar, invisível
    await pg.fill(".cx-salvar .cx-titulo", "Buck — Kp dobrado"); await pg.fill(".cx-salvar .cx-etiquetas", "buck, teste");
    await pg.click(".cx-salvar .m-guardar"); await pg.waitForTimeout(600);
    const salvo = await pg.evaluate(() => ({ modal: !!document.querySelector(".cx-salvar"), aviso: $("cc-aviso").textContent, verde: $("cc-aviso").classList.contains("ok") }));
    const novos = () => (fs.existsSync(CTX) ? fs.readdirSync(CTX) : []).filter((x) => !antes.has(x) && !x.startsWith("."));
    ok(!salvo.modal && /contexto salvo: Buck — Kp dobrado/.test(salvo.aviso) && salvo.verde && novos().length === 1, `guardar: a janela fecha, "${salvo.aviso}" em verde, 1 pasta nova em ${CTX}`);
    const id = novos()[0];
    // a biblioteca: usar nesta conversa (numa conversa nova)
    await api(pg, "claude/nova", {}); await pg.evaluate(async () => { cc.estado = await apiClaude("pedido"); desenhaChat(); });
    await pg.click("#cc-contextos"); await pg.waitForSelector(".cx-bib .cx-item");
    const item = `.cx-bib .cx-item[data-id="${id}"]`;
    const lin = await pg.evaluate((s) => document.querySelector(s).textContent.replace(/\s+/g, " "), item);
    const gerando = await pg.evaluate((s) => { const l = document.querySelector(`${s} .cx-ia-linha`); return { txt: l && l.textContent, diodo: !!(l && l.querySelector(".diodo-ia")) }; }, item);
    await pg.waitForFunction((s) => /resumo pela IA ✓/.test((document.querySelector(`${s} .cx-ia-linha`) || {}).textContent || ""), item, { timeout: 30000 });
    ok(/gerando/.test(gerando.txt || "") && gerando.diodo, `o resumo pela IA: "gerando…" com o diodo animado, depois "pronto ✓" sozinho (que não entra na conversa: contextos_api)`);
    fs.rmSync(path.join(CONF, "falso_resumo_lento"), { force: true });
    ok(/Buck — Kp dobrado/.test(lin) && /buck/.test(lin) && /claude-falso/.test(lin), `na biblioteca: ${lin.slice(0, 120)}…`);
    await pg.click(`${item} [data-a="usar"]`); await pg.waitForTimeout(500);
    const uso = await pg.evaluate((s) => ({ bt: document.querySelector(`${s} [data-a="usar"]`).textContent, chip: [...document.querySelectorAll("#cc-anexos .cx-em-uso")].map((x) => x.textContent.trim()) }), item);
    ok(uso.bt === "em uso ✓" && uso.chip.length === 1 && /Buck — Kp dobrado/.test(uso.chip[0]), `usar nesta conversa: "${uso.bt}", a etiqueta ${JSON.stringify(uso.chip)} ao lado dos anexos`);
    // abrir: o resumo formatado e a conversa; editar o título
    await pg.click(`${item} [data-a="abrir"]`); await pg.waitForSelector(".cx-abrir");
    const ab = await pg.evaluate(() => ({ h: [...document.querySelectorAll(".cx-abrir .cx-ver .md-h")].map((x) => x.textContent), conv: (document.querySelector(".cx-abrir .cx-conversa summary") || {}).textContent,
      tex: document.querySelectorAll(".cx-abrir .cx-ver .katex").length }));
    ok(ab.h.includes("O que lembrar") && ab.h.includes("Resumo pela IA (claude-falso)") && /1 pedido\)/.test(ab.conv || "") && ab.tex >= 1,
       `abrir: a nota e o resumo pela IA formatados (${ab.h.join(", ")}; ${ab.tex} equação), "${ab.conv}"`);
    await pg.click(".cx-abrir .m-editar"); await pg.fill(".cx-abrir .cx-titulo", "Buck — Kp dobrado (rev)");
    const resEdit = await pg.inputValue(".cx-abrir .cx-resumo");
    await pg.click(".cx-abrir .m-guardar"); await pg.waitForTimeout(700);
    const tit = await pg.evaluate((s) => document.querySelector(`${s} .cx-tit`).textContent, item);
    ok(/^## O que lembrar/.test(resEdit) && /Kp dobrado \(rev\)/.test(tit), `editar: a nota vem para editar; o título novo na lista ("${tit.trim()}")`);
    // exportar: baixa o .maisimctx
    await pg.click(`${item} [data-a="exportar"]`); await pg.waitForSelector(".cx-exportar");
    const [down] = await Promise.all([pg.waitForEvent("download"), pg.click(".cx-exportar .m-guardar")]);
    const arqZip = path.join(require("os").tmpdir(), `teste_${id}.maisimctx`); await down.saveAs(arqZip);
    ok(down.suggestedFilename() === `${id}.maisimctx` && fs.statSync(arqZip).size > 500, `exportar: baixou ${down.suggestedFilename()} (${fs.statSync(arqZip).size} bytes)`);
    // importar de volta
    await pg.setInputFiles(".cx-bib .cx-arq", arqZip);
    await pg.waitForFunction(() => document.querySelectorAll(".cx-bib .cx-item").length === 2, null, { timeout: 10000 }).catch(() => {});
    const imp = await pg.evaluate(() => [...document.querySelectorAll(".cx-bib .cx-item .cx-imp")].length);
    if (imp !== 1) console.log("  depuração:", await pg.evaluate(() => ({ status: document.querySelector(".cx-bib .cx-status").textContent, itens: document.querySelectorAll(".cx-bib .cx-item").length,
      lista: (cx.lista.contextos || []).map((c) => [c.id, !!c.importado]) })));
    ok(imp === 1 && novos().length === 2, `importar: o contexto volta com a marca "importado" (${novos().length} na pasta)`);
    // conversas anteriores: a de antes do "nova", salva como contexto
    await pg.click('.cx-bib [data-aba="anteriores"]'); await pg.waitForTimeout(300);
    const ant = `.cx-bib .cx-item[data-sid="${sidAntigo}"]`;
    ok(!!(await pg.$(ant)), "conversas anteriores: a de antes do \"nova\" está lá");
    await pg.click(`${ant} [data-a="salvar-ant"]`); await pg.waitForSelector(".cx-salvar");
    const semGerar = !(await pg.$(".cx-salvar .cx-gerar")) && !!(await pg.$(".cx-salvar .cx-resumo-ia:not([disabled])"));
    await pg.fill(".cx-salvar .cx-resumo", "a conversa antiga"); await pg.click(".cx-salvar .m-guardar"); await pg.waitForTimeout(600);
    ok(semGerar && novos().length === 3, `salvar uma conversa anterior (com a opção do resumo pela IA): ${novos().length} na pasta`);
    // "exportar" no topo da conversa, juntando com o contexto em uso (Marcelo, 21/10): salva um contexto novo que continua
    // daquele (um resumo só pela IA, as duas conversas) e já baixa o .maisimctx — depois que o resumo fica pronto
    await pg.click("#cc-exportar"); await pg.waitForSelector(".cx-salvar");
    const semPedido = !(await pg.$(".cx-salvar .cx-junta"));
    await pg.click(".cx-salvar .m-fechar");
    fs.writeFileSync(path.join(CONF, "falso_cenario"), "le_contexto");
    await pg.fill("#cc-texto", "continue daquele contexto"); await pg.click("#cc-enviar");
    await pg.waitForFunction(() => cc.estado && !cc.estado.andamento && (cc.estado.conversa.historico || []).length === 1, null, { timeout: 60000 });
    await pg.click("#cc-exportar"); await pg.waitForSelector(".cx-salvar");
    const jan = await pg.evaluate(() => { const q = (s) => document.querySelector(`.cx-salvar ${s}`);
      return { h: q("h3").textContent, junta: !!(q(".cx-juntar") && q(".cx-juntar").checked), com: (q(".cx-junta-tit") || {}).textContent, bt: q(".m-guardar").textContent,
        travados: [q('.cx-i[data-k="conversa"]'), q(".cx-resumo-ia")].map((c) => c.checked && c.disabled) }; });
    await pg.uncheck(".cx-salvar .cx-juntar");
    const solto = await pg.evaluate(() => [".cx-i[data-k=\"conversa\"]", ".cx-resumo-ia"].map((s) => document.querySelector(`.cx-salvar ${s}`).disabled));
    await pg.check(".cx-salvar .cx-juntar");
    ok(semPedido && jan.h === "Exportar esta conversa" && jan.junta && jan.com === "Buck — Kp dobrado (rev)" && /baixar \.maisimctx/.test(jan.bt)
       && jan.travados.every(Boolean) && solto.every((x) => !x),
       `exportar: "${jan.h}", "juntar com o contexto em uso" marcado (${jan.com}; sem pedido nesta conversa, não oferece), a conversa e o resumo pela IA travados enquanto junta`);
    fs.writeFileSync(path.join(CONF, "falso_resumo_lento"), "2");
    await pg.fill(".cx-salvar .cx-titulo", "Buck — continuação");
    const espDown = pg.waitForEvent("download", { timeout: 40000 });
    await pg.click(".cx-salvar .m-guardar");
    await pg.waitForSelector(".cx-salvar .cx-espera .diodo-ia", { timeout: 5000 });
    const dj = await espDown;
    const novo = novos().find((x) => JSON.parse(fs.readFileSync(path.join(CTX, x, "meta.json"), "utf8")).continua_de);
    const zipJ = path.join(require("os").tmpdir(), `teste_junta_${novo}.maisimctx`); await dj.saveAs(zipJ);
    const noZip = JSON.parse(execSync(`python3 -I -c "import sys, zipfile, json; z = zipfile.ZipFile(sys.argv[1]); print(json.dumps({n.split('/', 1)[1]: (z.read(n).decode() if n.endswith('resumo_ia.md') else '') for n in z.namelist()}))" "${zipJ}"`).toString());
    await pg.waitForTimeout(300);
    const avJ = await pg.evaluate(() => ({ modal: !!document.querySelector(".cx-salvar"), aviso: $("cc-aviso").textContent }));
    ok(novo && dj.suggestedFilename() === `${novo}.maisimctx` && "anterior.md" in noZip && /li anterior\.md: Buck — Kp dobrado \(rev\)/.test(noZip["resumo_ia.md"] || "")
       && !avJ.modal && /contexto salvo e exportado: Buck — continuação \(continua de “Buck — Kp dobrado \(rev\)”\) — com o resumo pela IA/.test(avJ.aviso),
       `salvar e baixar: esperou o resumo pela IA (o diodo) e baixou ${dj.suggestedFilename()} com anterior.md e o resumo único; "${avJ.aviso}"`);
    await pg.click("#cc-contextos"); await pg.waitForSelector(".cx-bib .cx-item");
    const linJ = await pg.evaluate((s) => (document.querySelector(s) || {}).textContent || "", `.cx-bib .cx-item[data-id="${novo}"] .cx-meta`);
    ok(/continua de “Buck — Kp dobrado \(rev\)”/.test(linJ) && !!(await pg.$(item)) && novos().length === 4,
       `na biblioteca: o novo diz de onde continua; o antigo continua lá (${novos().length} na pasta)`);
    await pg.click(".cx-bib .m-fechar");
    fs.rmSync(zipJ, { force: true }); fs.rmSync(path.join(CONF, "falso_resumo_lento"), { force: true });
    // o × da etiqueta tira da conversa; apagar pergunta e tira da biblioteca
    await pg.click("#cc-anexos .cx-em-uso button"); await pg.waitForTimeout(500);
    ok(!(await pg.$("#cc-anexos .cx-em-uso")), "o × da etiqueta: o contexto sai da conversa");
    await pg.click("#cc-contextos"); await pg.waitForSelector(".cx-bib .cx-item");
    await pg.click(`${item} [data-a="apagar"]`); await pg.waitForSelector(".modal .m-ok.perigo"); await pg.click(".modal .m-ok.perigo"); await pg.waitForTimeout(600);
    ok(!(await pg.$(item)) && !fs.existsSync(path.join(CTX, id)), "apagar: pergunta e some (da lista e da pasta)");
    await pg.click(".cx-bib .m-fechar");
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
    fs.rmSync(arqZip, { force: true });
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally {
    for (const x of (fs.existsSync(CTX) ? fs.readdirSync(CTX) : [])) if (!antes.has(x)) fs.rmSync(path.join(CTX, x), { recursive: true, force: true });
    fs.rmSync(path.join(CONF, "falso_logado"), { force: true }); fs.rmSync(path.join(CONF, "falso_cenario"), { force: true }); fs.rmSync(path.join(CONF, "falso_resumo_lento"), { force: true });
    if (b) await b.close();
  }
  process.exit(falhas ? 1 : 0);
})();
