// a janela do código e o cadeado (instância de teste 5010 → 8768), com o PI do exemplo (congelado em validacao/dados):
// o simu abre editando (cadeado aberto, o padrão); fechar o cadeado fica lembrado; a coluna do controle recolhe; o item
// "código" no trilho; a janela do código (?vista=codigo) mostra só o controle, ligado ao circuito aberto, sem o ▶; as duas
// janelas acompanham uma à outra (código guardado, circuito mudado, rodada) e a do circuito avisa que o código está fora.
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const PI = require("os").homedir() + "/.cache/pew_simu_teste/pew/exemplo_controle_pi.ipes";
const S = "http://localhost:5010/pew/simu/";
(async () => {
  let b;
  try {
    b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } });
    const erros = [];
    const pagina = async () => { const p = await ctx.newPage(); p.on("pageerror", (e) => erros.push(e.message)); p.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); }); return p; };
    // o exemplo como está no arquivo (pela API, antes de abrir: o que estiver em trabalho fica de fora)
    const A = await pagina();
    await A.goto(S + "?modelo=" + encodeURIComponent(PI));
    await A.evaluate(async (pi) => { await fetch("editor/abrir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arq: pi, modo: "descartar" }) }); }, PI);
    await A.reload();
    // 1. o cadeado: aberto por padrão (editando), sem nada guardado no navegador
    await A.waitForFunction(() => typeof dados !== "undefined" && dados && dados.editor, null, { timeout: 30000 });
    ok(await A.evaluate(() => ed.ligado && $("bt-editar").classList.contains("ativo") && /editando/.test($("bt-editar").title || $("bt-editar").dataset.dica || "")),
      "ao abrir, o simu já está editando (cadeado aberto)");
    await A.click("#bt-editar"); await A.waitForTimeout(1200);
    ok(await A.evaluate(() => !ed.ligado && localStorage.getItem("pew-simu-travado") === "1"), "clicar fecha o cadeado (só ver) e fica lembrado");
    await A.reload(); await A.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas, null, { timeout: 30000 }); await A.waitForTimeout(1500);
    ok(await A.evaluate(() => !ed.ligado), "recarregado: continua travado");
    await A.click("#bt-editar"); await A.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
    ok(await A.evaluate(() => ed.ligado && localStorage.getItem("pew-simu-travado") === "0"), "clicar de novo abre (e fica lembrado)");
    await A.evaluate(() => { sim.par.dt = "1e-6"; sim.par.tfim = "0.005"; sim.par.nome = "codigo_tela"; sim.par.amostras = "1000"; localStorage.setItem("pew-simu-sim", JSON.stringify(sim.par)); });
    // 2. a coluna do controle recolhe (o editor fica com a largura toda) e fica lembrada
    await A.click("#bt-ctl"); await A.waitForFunction(() => ctl.carregado && ctl.editor, null, { timeout: 30000 });
    const larg = () => A.evaluate(() => Math.round($("ctl-editor").getBoundingClientRect().width));
    const w0 = await larg(); await A.click("#ctl-lado-bt"); await A.waitForTimeout(400); const w1 = await larg();
    ok(await A.evaluate(() => $("painel-controle").classList.contains("sem-lado") && getComputedStyle($("ctl-lado")).visibility === "hidden" && $("ctl-lado").getBoundingClientRect().width < 1) && w1 > w0 + 150,
      `recolher a coluna: o editor vai de ${w0} para ${w1} px`);
    await A.click("#ctl-lado-bt"); await A.waitForTimeout(300);
    ok(await A.evaluate(() => !$("painel-controle").classList.contains("sem-lado") && localStorage.getItem("pew-simu-ctl-sem-lado") === "0"), "e volta (lembrado no navegador)");
    // 3. o trilho: o item "código"
    const it = await A.evaluate(() => { const a = document.querySelector('#pew-nav a[data-janela="pew-codigo"]'); return a && { href: a.getAttribute("href"), ativo: a.classList.contains("ativo"), simu: document.querySelector('#pew-nav a[href="/pew/simu/"]').classList.contains("ativo") }; });
    ok(it && it.href === "/pew/simu/?vista=codigo" && !it.ativo && it.simu, `trilho: o item "código" (${it && it.href}), o simu marcado nesta janela`);
    // o scope do trilho abre numa janela à parte (a mesma em outro clique) e o simu fica onde está
    const [sj] = await Promise.all([ctx.waitForEvent("page"), A.click('#pew-nav a[data-janela="pew-scope"]')]);
    await sj.waitForLoadState(); await A.waitForTimeout(300);
    const outraVez = await Promise.race([ctx.waitForEvent("page", { timeout: 1500 }).then(() => "nova").catch(() => "mesma"), A.click('#pew-nav a[data-janela="pew-scope"]').then(() => new Promise((r) => setTimeout(() => r("?"), 2000)))]);
    await sj.waitForFunction(() => document.getElementById("pew-nav"), null, { timeout: 15000 });
    const sv = await sj.evaluate(() => ({ trilho: getComputedStyle(document.getElementById("pew-nav")).display, w: getComputedStyle(document.documentElement).getPropertyValue("--pew-nav-w").trim() }));
    ok(/\/pew\/scope\/\?janela=1$/.test(sj.url()) && /\/pew\/simu\//.test(A.url()) && outraVez !== "nova" && sv.trilho === "none" && !sv.w,
      `scope pelo trilho: janela à parte e sem o trilho (${sj.url().replace(/^https?:\/\/[^/]+/, "")}), o simu fica; outro clique reaproveita a janela`);
    await sj.close();
    // 4. a janela do código
    const B = await pagina();
    await B.goto(S + "?vista=codigo&janela=1");                        // como o trilho abre (janela=1: sem o trilho)
    await B.waitForFunction(() => typeof ctl !== "undefined" && ctl.carregado && ctl.editor && dados && dados.editor, null, { timeout: 30000 }); await B.waitForTimeout(800);
    const vb = await B.evaluate(() => ({ corpo: document.body.classList.contains("vista-codigo"), tela: getComputedStyle($("tela")).display, play: getComputedStyle($("g-sim")).display,
      painel: !$("painel-controle").classList.contains("oculto") && getComputedStyle($("painel-scope")).display, titulo: $("titulo-pagina").textContent, arq: $("sel-modelo").value,
      larg: Math.round($("painel-scope").getBoundingClientRect().width), cab: getComputedStyle(document.querySelector("header")).display,
      trilho: getComputedStyle($("pew-nav")).display, janela: document.title }));
    ok(vb.corpo && vb.tela === "none" && vb.play === "none" && vb.painel === "flex" && vb.cab === "none" && vb.trilho === "none" && vb.larg === 1500
      && vb.janela === "código · exemplo_controle_pi.ipes" && vb.arq.endsWith("exemplo_controle_pi.ipes"),
      `janela do código: só o código (${vb.larg} px: sem o trilho, sem o cabeçalho, sem o desenho e sem o ▶); título da janela "${vb.janela}"`);
    await B.evaluate(() => iniciaSim()); await B.waitForTimeout(300);
    ok(/o ▶ fica na janela do circuito/.test(await B.textContent("#ctl-estado")), "Ctrl+Enter na janela do código: a linha do editor diz que o ▶ fica na janela do circuito");
    await A.waitForTimeout(3500);
    ok(await A.evaluate(() => document.body.classList.contains("codigo-fora") && getComputedStyle($("ctl-fora")).display !== "none"), "na janela do circuito, o painel do controle avisa: o código está aberto na janela do código");
    // 5. código guardado na janela do código → a do circuito acompanha
    await B.evaluate(() => ctl.modelos["controle.py"].setValue(ctl.modelos["controle.py"].getValue() + "\n# da janela do código\n")); await B.waitForTimeout(2000);
    ok(await A.evaluate(() => /# da janela do código/.test(codigoAtual())), "código mudado na janela do código: a janela do circuito mostra o mesmo");
    // 6. circuito mudado na janela do circuito → a do código acompanha (um CONST novo vira atuador possível)
    await A.evaluate(async () => { novoEstado(await api("editor/cmd", { op: "CREATE", args: ["CONST.9", 60, 30, "CONST"] })); }); await B.waitForTimeout(2000);
    ok(await B.evaluate(() => ctl.dados.atuadores.some((a) => a.bloco === "CONST.9") && dados.folhas["0"].elementos.some((e) => e.nome === "CONST.9")),
      "um CONST posto na janela do circuito aparece na janela do código (atuadores do controle)");
    await A.evaluate(async () => { novoEstado(await api("editor/cmd", { op: "DELETE", args: ["CONST.9"] })); }); await B.waitForTimeout(1500);
    // 7. a rodada (▶ na janela do circuito) trava a janela do código e destrava no fim
    await B.evaluate(() => { window.__travou = false; new MutationObserver(() => { if (document.body.classList.contains("sim-rodando")) window.__travou = true; }).observe(document.body, { attributes: true }); });
    await A.evaluate(() => iniciaSim());
    await A.waitForFunction(() => !document.body.classList.contains("sim-rodando") && sim.estado !== "rodando", null, { timeout: 120000 }); await B.waitForTimeout(1500);
    const rb = await B.evaluate(() => ({ travou: window.__travou, agora: document.body.classList.contains("sim-rodando"), estado: sim.estado }));
    ok(rb.travou && !rb.agora && rb.estado === "fim", `a rodada pelo ▶ do circuito travou a janela do código e destravou no fim (${rb.estado})`);
    // 8. fechar a janela do código: o aviso some
    await B.evaluate(() => ctl.modelos["controle.py"].setValue(ctl.modelos["controle.py"].getValue().replace("\n# da janela do código\n", ""))); await B.waitForTimeout(1500);
    await B.close(); await A.waitForTimeout(1500);
    ok(await A.evaluate(() => !document.body.classList.contains("codigo-fora")), "fechada a janela do código, o painel do circuito volta a editar");
    ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
    await A.evaluate(() => { localStorage.removeItem("pew-simu-travado"); localStorage.removeItem("pew-simu-ctl-sem-lado"); });
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); }
  process.exit(falhas ? 1 : 0);
})();
