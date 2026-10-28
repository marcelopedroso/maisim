// os conectores de rótulo, como o "label" do PSIM (instância de teste 7201): a bandeirinha nas pontas soltas com nome, a
// seta para fora, a cor do domínio, a marca do voltímetro sem cobrir a bandeirinha, o realce do mesmo nome, o clique que
// seleciona a conexão, o tema escuro e o zoom; e a ferramenta conector (o botão "Conector" abaixo do "Fio", tecla C: liga e
// desliga, exclui o W, põe no domínio do ponto clicado, liga ao nó do mesmo nome, desfaz, o nome que o ponto já tem no
// campo e o aviso antes de juntar dois nós, Esc)
const { chromium } = require("playwright");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  await pg.addInitScript(() => { try { localStorage.setItem("maisim-simu-travado", "1"); } catch (e) { /* ok */ } });   // começa travado (o padrão é editando)
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const ARQ = require("os").homedir() + "/.cache/maisim_teste/circuitos/conectores_teste.ipes";
  // o circuito, montado aqui: R.1 e R.2 em pé, cada um com uma conexão "a" que sai do borne de cima e termina solta (a do
  // R.1 para a direita; a do R.2 para cima, começando na ponta solta: a marca automática do voltímetro vai nela); "p"
  // liga os dois bornes de baixo (ligada dos dois lados: fica o texto); "q" desce solta do R.3 (em pé: a casinha para baixo);
  // "c", de controle, sai do CONST.1 e termina solta; o GAIN.1 (controle) com os bornes livres. O VOLT.1 mede a contra p
  const S = "http://localhost:7201/maisim/simu/", post = (r, c) => fetch(S + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) }).then((x) => x.json());
  await post("editor/novo", { modo: "descartar" });
  for (const a of [["R.1", 10, 10, "R"], ["R.2", 30, 10, "R"], ["R.3", 20, 10, "R"], ["CONST.1", 10, 22, "CONST"], ["GAIN.1", 30, 22, "GAIN"], ["VOLT.1", 44, 10, "VOLT"]]) await post("editor/cmd", { op: "CREATE", args: a });
  for (const [cantos, dom, rotulo] of [[[[14, 8], [10, 8]], "LK", "a"], [[[30, 5], [30, 8]], "LK", "a"], [[[10, 12], [10, 14], [30, 14], [30, 12]], "LK", "p"],
    [[[20, 12], [20, 15]], "LK", "q"], [[[12, 22], [16, 22]], "CONTROL", "c"]]) {
    const j = await post("editor/fio", { acao: "novo", cantos, dom, rotulo });
    if (!j.folhas) { console.log("FALHA não deu para montar o circuito do teste", JSON.stringify(j).slice(0, 200)); process.exit(1); }
  }
  await post("editor/mede", { nome: "VOLT.1", tipo: "V", no1: "a", no2: "p" });
  const mont = await post("editor/salvar", { nome: "conectores_teste", pasta: "circuitos", sobrescrever: true });
  if (!mont.salvo) { console.log("FALHA não deu para salvar o circuito do teste", JSON.stringify(mont).slice(0, 200)); process.exit(1); }
  await pg.goto(`http://localhost:7201/maisim/simu/?modelo=${encodeURIComponent(ARQ)}`);
  await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && dados.folhas["0"].fios.length === 5, null, { timeout: 30000 });
  await pg.evaluate(() => { mostrar.medicoes = true; mostrar.rotulos = true; mostrar.controle = true; desenha(); ajusta(); }); await pg.waitForTimeout(300);

  // as bandeirinhas: onde estão, para onde apontam (a ponta da seta: o ponto do polígono mais longe da base) e a cor
  const band = () => pg.evaluate(() => [...document.querySelectorAll("#svg .conector-rot")].map((c) => {
    const tr_ = c.getAttribute("transform").match(/translate\(([-\d.]+),([-\d.]+)\)/), pol = c.querySelector("polygon");
    const pts = pol.getAttribute("points").split(" ").map((p) => p.split(",").map(Number)), ponta = pts.reduce((m, p) => (Math.hypot(...p) > Math.hypot(...m) ? p : m));
    const r = pol.getBoundingClientRect();
    return { rot: c.dataset.rot, dom: c.dataset.dom, x: +tr_[1] / G, y: +tr_[2] / G, seta: Math.abs(ponta[0]) > Math.abs(ponta[1]) ? (ponta[0] > 0 ? "d" : "e") : (ponta[1] > 0 ? "b" : "c"),
      stroke: pol.getAttribute("stroke"), fill: pol.getAttribute("fill"), titulo: c.getAttribute("title") || c.dataset.dica || "", nome: c.querySelector("text").dataset.txt,
      tab: c.getAttribute("tabindex"), caixa: [r.left, r.right, r.top, r.bottom], w: r.width }; }));
  let bs = await band();
  const a = bs.filter((c) => c.rot === "a").sort((p, q) => p.x - q.x);
  ok(a.length === 2 && a[0].x === 14 && a[0].y === 8 && a[0].seta === "d" && a[1].x === 30 && a[1].y === 5 && a[1].seta === "c" && a.every((c) => c.nome === "a"),
     `duas bandeirinhas "a", nas pontas soltas (14,8) e (30,5), com a seta para fora (direita; para cima, em pé): ${JSON.stringify(a.map((c) => [c.x, c.y, c.seta]))}`);
  ok(a.every((c) => /conectado pelo nome a: R\.\d/.test(c.titulo) && /1 outro conector/.test(c.titulo) && c.tab === "0"),
     `a dica diz a que está ligado e quantos outros conectores há; dá para chegar pelo teclado (tabindex): ${JSON.stringify(a[0].titulo)}`);
  const q = bs.find((c) => c.rot === "q");
  ok(q && q.x === 20 && q.y === 15 && q.seta === "b", `a ponta solta que desce ("q") ganha a casinha para baixo: ${JSON.stringify(q && [q.x, q.y, q.seta])}`);
  const temP = await pg.evaluate(() => [...document.querySelectorAll("#svg text")].some((t) => t.textContent === "p"));
  ok(!bs.some((c) => c.rot === "p") && temP, `"p", ligada dos dois lados, fica como texto (sem bandeirinha)`);
  const cor = await pg.evaluate(() => ({ lk: COR.fioLK, ct: COR.fioCT, cartao: COR.cartao }));
  const c = bs.find((x) => x.rot === "c");
  ok(c && c.dom === "CONTROL" && c.stroke === cor.ct && c.x === 16 && c.seta === "d" && a.every((x) => x.stroke === cor.lk && x.fill === cor.cartao),
     `a cor do domínio: a de controle verde (${c && c.stroke}), as de potência azuis, o fundo do cartão`);
  // a marca automática V+ (no 1º ponto da conexão "a" do R.2, a ponta solta de cima: cairia em cima da bandeirinha, que
  // aponta para cima) sobe para cima dela, sem cobrir nenhuma (descer a poria sobre a conexão e o R.2)
  const marca = await pg.evaluate(() => { const g = [...document.querySelectorAll("#svg g.medido")].find((x) => x.querySelector("rect") && x.querySelector("text").textContent === "V+");
    if (!g) return null; const r = g.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; });
  const cobre = (p, q_) => p[0] < q_[1] - 1 && q_[0] < p[1] - 1 && p[2] < q_[3] - 1 && q_[2] < p[3] - 1;
  ok(marca && !bs.some((x) => cobre(marca, x.caixa)) && marca[3] <= a[1].caixa[2] + 1 && marca[3] > a[1].caixa[2] - 8 && marca[0] < a[1].caixa[1] && a[1].caixa[0] < marca[1],
     `a marca V+ sobe para cima da bandeirinha "a" que aponta para cima (logo acima dela) e não cobre nenhuma: ${JSON.stringify(marca && marca.map(Math.round))} × ${JSON.stringify(a[1].caixa.map(Math.round))}`);
  await pg.screenshot({ path: "conectores.png" });

  // o realce: o mouse num "a" acende os dois "a" e as conexões "a"; o resto não; sair apaga
  await pg.hover('#svg .conector-rot[data-rot="a"]'); await pg.waitForTimeout(150);
  const realce = await pg.evaluate(() => ({ a: document.querySelectorAll('#svg .conector-rot.realce[data-rot="a"]').length, fios: document.querySelectorAll('#svg polyline.realce[data-rot="a"]').length,
    outros: document.querySelectorAll('#svg .realce:not([data-rot="a"])').length,
    filtro: getComputedStyle(document.querySelector('#svg .conector-rot.realce polygon')).filter, larg: getComputedStyle(document.querySelector('#svg .conector-rot.realce polygon')).strokeWidth }));
  ok(realce.a === 2 && realce.fios === 2 && realce.outros === 0 && /drop-shadow/.test(realce.filtro) && parseFloat(realce.larg) > 2,
     `o mouse num "a" realça os dois "a" e as duas conexões "a" (borda ${realce.larg}, brilho): ${JSON.stringify(realce)}`);
  // a dica: a caixinha do MaiSim (o #dica-ui), não a do navegador (nenhum <title> dentro da bandeirinha)
  await pg.waitForFunction(() => { const d = document.getElementById("dica-ui"); return d && d.classList.contains("vis"); }, null, { timeout: 3000 }).catch(() => {});
  const dica = await pg.evaluate(() => { const d = document.getElementById("dica-ui");
    return { vis: !!d && d.classList.contains("vis"), txt: d ? d.textContent : "", titulos: document.querySelectorAll("#svg .conector-rot title").length }; });
  ok(dica.vis && /conectado pelo nome a/.test(dica.txt) && dica.titulos === 0, `a dica no estilo do MaiSim ("${dica.txt.slice(0, 50)}…"), sem a do navegador`);
  await pg.mouse.move(5, 300); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => !document.querySelector("#svg .realce")), "o mouse saiu: o realce apaga");

  // editando: clicar na bandeirinha seleciona a conexão (como clicar nela)
  await pg.click("#bt-editar"); await pg.waitForTimeout(600); while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-ok"); await pg.waitForTimeout(800); }
  await pg.waitForFunction(() => dados && dados.editor && ed.ligado, null, { timeout: 30000 });
  await pg.click('#svg .conector-rot[data-rot="q"]'); await pg.waitForTimeout(400);
  const sel = await pg.evaluate(() => { const w = fioSelecionado(); return w && [w.rotulo, w.pts[0], w.pts[w.pts.length - 1]]; });
  ok(sel && sel[0] === "q", `clicar na bandeirinha "q" seleciona a conexão dela: ${JSON.stringify(sel)}`);
  await pg.keyboard.press("Escape");

  // o tema escuro e o zoom: as cores do tema, e a bandeirinha cresce com o desenho, presa na ponta da conexão
  await pg.evaluate(() => { document.documentElement.dataset.tema = "escuro"; dispatchEvent(new Event("maisim-tema")); }); await pg.waitForTimeout(300);
  const esc = (await band()).find((x) => x.rot === "c"), corE = await pg.evaluate(() => ({ ct: TEMA_COR.escuro.fioCT, cartao: TEMA_COR.escuro.cartao }));
  ok(esc && esc.stroke === corE.ct && esc.fill === corE.cartao, `tema escuro: a borda ${esc && esc.stroke}, o fundo ${esc && esc.fill}`);
  const antes = (await band()).find((x) => x.rot === "a" && x.x === 14);
  const ponta = () => pg.evaluate(() => { const s = $("svg"), p = s.createSVGPoint(); p.x = 14 * G; p.y = 8 * G; const r = p.matrixTransform(s.getScreenCTM()); return [r.x, r.y]; });
  const p0 = await ponta();
  await pg.mouse.move(p0[0], p0[1] + 40); for (let i = 0; i < 4; i++) { await pg.mouse.wheel(0, -200); await pg.waitForTimeout(80); }
  await pg.waitForTimeout(200);
  const depois = (await band()).find((x) => x.rot === "a" && x.x === 14), p1 = await ponta();
  ok(depois.w > antes.w * 1.5 && Math.abs(depois.caixa[0] - p1[0]) < 2.5 && p1[1] > depois.caixa[2] && p1[1] < depois.caixa[3],
     `zoom: a bandeirinha cresce (${Math.round(antes.w)} → ${Math.round(depois.w)} px) e a base fica na ponta da conexão (${p1.map(Math.round)} × ${depois.caixa.map(Math.round)})`);
  await pg.screenshot({ path: "conectores_escuro.png" });
  await pg.evaluate(() => { document.documentElement.dataset.tema = "claro"; dispatchEvent(new Event("maisim-tema")); ajusta(); }); await pg.waitForTimeout(300);
  // o botão dos rótulos esconde as bandeirinhas também
  await pg.evaluate(() => { mostrar.rotulos = false; desenha(); });
  ok(await pg.evaluate(() => !document.querySelector("#svg .conector-rot")), "rótulos escondidos: as bandeirinhas também somem");
  await pg.evaluate(() => { mostrar.rotulos = true; desenha(); });

  // a ferramenta conector: fora das abas da paleta; um botão logo abaixo do "Fio" (W), com o ícone, "Conector" e o C
  const semItem = await pg.evaluate(() => !ed.catalogo.abas.some((x) => x.itens.some((i) => /CONECTOR/.test(i.id || "") || i.conector)));
  const bt = await pg.evaluate(() => { const b = $("bt-conector"), f = $("bt-fio"); return { txt: b.textContent.trim(), kbd: b.querySelector("kbd").textContent, svg: !!b.querySelector("svg"),
    titulo: b.getAttribute("title"), logo: f.nextElementSibling === b, abaixo: b.getBoundingClientRect().top >= f.getBoundingClientRect().bottom - 1 }; });
  ok(semItem && bt.txt === "ConectorC" && bt.kbd === "C" && bt.svg && bt.logo && bt.abaixo && /^Conector \(rótulo\) · clique num borne ou num ponto de conexão e dê o nome: pontos com o mesmo nome ficam ligados \(C\)$/.test(bt.titulo) && !/PSIM/.test(bt.titulo),
     `o conector sai das abas e vira ferramenta abaixo do "conexão": ${JSON.stringify(bt)}`);
  const modo = () => pg.evaluate(() => ({ c: ed.conector, w: ed.fio.modo, bc: $("bt-conector").classList.contains("ativo"), bw: $("bt-fio").classList.contains("ativo") }));
  await pg.click("#bt-conector"); const m1 = await modo();
  await pg.keyboard.press("c"); const m2 = await modo();
  await pg.keyboard.press("C"); await pg.keyboard.press("w"); const m3 = await modo();      // C liga; W liga a conexão e desliga o conector
  await pg.keyboard.press("c"); const m4 = await modo();                                     // C desliga a conexão
  await pg.keyboard.press("Escape"); const m5 = await modo();
  ok(m1.c && m1.bc && !m2.c && !m2.bc && m3.w && !m3.c && m3.bw && !m3.bc && m4.c && !m4.w && m4.bc && !m4.bw && !m5.c && !m5.w,
     `o botão e o C ligam e desligam; W e C se excluem; Esc sai: ${JSON.stringify([m1, m2, m3, m4, m5])}`);
  await pg.click("#bt-fio"); await pg.click("#bt-conector"); const m6 = await modo();
  ok(m6.c && !m6.w, `o botão do conector também desliga a conexão: ${JSON.stringify(m6)}`);
  const ponto = (x, y) => pg.evaluate(([x, y]) => { const s = $("svg"), p = s.createSVGPoint(); p.x = x * G; p.y = y * G; const r = p.matrixTransform(s.getScreenCTM()); return [r.x, r.y]; }, [x, y]);
  const nFios = () => pg.evaluate(() => dados.folhas["0"].fios.length);
  const n0 = await nFios();
  // Esc no campo do nome desiste do nome (nada muda; a ferramenta continua)
  let pt = await ponto(20, 8); await pg.mouse.click(pt[0], pt[1]);
  await pg.waitForSelector("#conector-nome input", { timeout: 5000 }); await pg.waitForTimeout(100);
  await pg.keyboard.type("zz"); await pg.keyboard.press("Escape"); await pg.waitForTimeout(400);
  ok(!(await pg.$("#conector-nome")) && await nFios() === n0 && (await modo()).c, "Esc no campo: o campo some, nenhuma conexão nova, a ferramenta continua");
  // num ponto vazio: o aviso, nada muda
  pt = await ponto(36, 18); await pg.mouse.click(pt[0], pt[1]); await pg.waitForTimeout(300);
  const aviso = await pg.evaluate(() => $("msg").textContent);
  ok(!(await pg.$("#conector-nome")) && await nFios() === n0 && /borne ou num ponto de conexão/.test(aviso), `num ponto sem borne nem conexão: não abre o campo, avisa (${aviso})`);
  // potência: no borne de cima do R.3, com o nome "a" (o domínio vem do ponto)
  pt = await ponto(20, 8); await pg.mouse.click(pt[0], pt[1]);
  await pg.waitForSelector("#conector-nome input", { timeout: 5000 }); await pg.waitForTimeout(100);
  const lista = await pg.evaluate(() => [...document.querySelectorAll("#conector-nomes option")].map((o) => o.value));
  await pg.keyboard.type("a"); await pg.keyboard.press("Enter");
  await pg.waitForFunction((n) => dados.folhas["0"].fios.length === n + 1, n0, { timeout: 20000 }); await pg.waitForTimeout(300);
  const novo = await pg.evaluate(() => { const f = dados.folhas["0"], w = f.fios.find((u) => u.pts.some((p) => p[0] === 20 && p[1] === 8));
    return { w: w && [w.dom, w.rotulo, w.pts], noA: ((dados.nos_medidos || {})["0"] || {}).a.map((c) => c.nome) }; });
  bs = await band();
  ok(novo.w && novo.w[0] === "LK" && novo.w[1] === "a" && JSON.stringify(novo.w[2]) === "[[20,8],[20,7],[20,6]]" && novo.noA.includes("R.3")
     && bs.filter((x) => x.rot === "a").length === 3 && bs.some((x) => x.rot === "a" && x.x === 20 && x.y === 6 && x.seta === "c" && x.dom === "LK") && lista.includes("a") && lista.includes("p") && !lista.includes("c"),
     `o de potência no borne do R.3 (o R.3 no nó "a", o do voltímetro): ${JSON.stringify(novo)}; três bandeirinhas "a" (a nova em (20,6), para cima); os nomes sugeridos (só de potência) ${JSON.stringify(lista)}`);
  await pg.screenshot({ path: "conectores_ferramenta.png" });
  // um passo só no desfazer
  await pg.keyboard.press("Control+z");
  await pg.waitForFunction((n) => dados.folhas["0"].fios.length === n, n0, { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(300);
  bs = await band();
  ok(await nFios() === n0 && bs.filter((x) => x.rot === "a").length === 2 && await pg.evaluate(() => !dados.nos_medidos["0"].a.some((c) => c.nome === "R.3")),
     "Ctrl+Z desfaz o conector inteiro (um passo)");
  // controle: a mesma ferramenta, na entrada do GAIN.1 (28,22): a conexão de controle para a esquerda, a bandeirinha verde
  if (!(await modo()).c) await pg.keyboard.press("c");
  pt = await ponto(28, 22); await pg.mouse.click(pt[0], pt[1]);
  await pg.waitForSelector("#conector-nome input", { timeout: 5000 }); await pg.waitForTimeout(100);
  const listaC = await pg.evaluate(() => [...document.querySelectorAll("#conector-nomes option")].map((o) => o.value));
  await pg.keyboard.type("c"); await pg.keyboard.press("Enter");
  await pg.waitForFunction((n) => dados.folhas["0"].fios.length === n + 1, n0, { timeout: 20000 }); await pg.waitForTimeout(300);
  const ctl = await pg.evaluate(() => { const w = dados.folhas["0"].fios.find((u) => u.pts.some((p) => p[0] === 28 && p[1] === 22)); return w && [w.dom, w.rotulo, w.pts]; });
  bs = await band(); const cor2 = await pg.evaluate(() => COR.fioCT);
  const verde = bs.find((x) => x.rot === "c" && x.x === 26 && x.y === 22);
  ok(ctl && ctl[0] === "CONTROL" && ctl[1] === "c" && JSON.stringify(ctl[2]) === "[[28,22],[27,22],[26,22]]" && verde && verde.dom === "CONTROL" && verde.stroke === cor2 && verde.seta === "e"
     && JSON.stringify(listaC) === JSON.stringify(["c"]), `o de controle na entrada do GAIN.1: ${JSON.stringify(ctl)}, a bandeirinha verde para a esquerda; sugeridos ${JSON.stringify(listaC)}`);
  // num ponto que já tem nome (a ponta solta da conexão "a" do R.1, (14,8)): o campo vem com "a"; outro nome ("b") junta os
  // num subcircuito com "os iguais juntos", o conector vai para todas as folhas iguais: o nome do ponto é conferido em cada
  // uma (Codex, #153) — uma folha igual com outro nome ali dá o aviso mesmo digitando o nome da folha aberta
  const iguais = await pg.evaluate(() => { const f = dados.folhas[folhaAtual], w = f.fios.find((u) => u.rotulo === "a" && u.dom === "LK");
    const p = w.pts[0], copia = JSON.parse(JSON.stringify(f)); copia.fios.find((u) => u.rotulo === "a" && u.dom === "LK" && u.pts[0].join() === p.join()).rotulo = "x";
    dados.folhas.__igual = copia; const r = { p, nomes: nomesNasFolhas(p, "LK", [folhaAtual, "__igual"]), so: nomesNasFolhas(p, "LK", [folhaAtual]) };
    window.__res = nomeNoLugar(200, 200, "LK", "a", r.nomes); return r; });
  await pg.waitForSelector("#conector-nome input", { timeout: 5000 }); await pg.keyboard.press("Enter");
  await pg.waitForSelector(".modal-fundo .modal", { timeout: 5000 }).catch(() => {});
  const avIg = await pg.evaluate(() => { const m = document.querySelector(".modal-fundo .modal"); return m ? m.textContent : ""; });
  if (avIg) { await pg.click(".modal .m-cancela"); await pg.waitForTimeout(200); }
  await pg.keyboard.press("Escape"); await pg.waitForTimeout(150);
  const res = await pg.evaluate(() => window.__res);
  await pg.evaluate(() => { delete dados.folhas.__igual; });
  ok(iguais.nomes.join() === "a,x" && iguais.so.join() === "a" && /'x'/.test(avIg) && /'a'/.test(avIg) && res === null,
     `folhas iguais: os nomes do ponto em todas (${iguais.nomes.join(", ")}); digitar "a" ainda avisa do "x" da outra folha ("${avIg.slice(0, 70)}…")`);
  // dois nós: o aviso do MaiSim antes (cancelar volta ao campo, sem criar; confirmar cria)
  const n1 = await nFios();
  pt = await ponto(14, 8); await pg.mouse.click(pt[0], pt[1]);
  await pg.waitForSelector("#conector-nome input", { timeout: 5000 }); await pg.waitForTimeout(150);
  const pre = await pg.$eval("#conector-nome input", (i) => [i.value, i.selectionStart, i.selectionEnd]);
  await pg.keyboard.type("b"); await pg.keyboard.press("Enter");
  await pg.waitForSelector(".modal-fundo .modal", { timeout: 5000 });
  const av = await pg.evaluate(() => ({ h: document.querySelector(".modal h3").textContent, p: document.querySelector(".modal p").textContent, ok: document.querySelector(".modal .m-ok").textContent }));
  await pg.screenshot({ path: "conectores_aviso.png" });
  ok(pre[0] === "a" && pre[1] === 0 && pre[2] === 1 && av.h === "Ligar dois nós?" && av.p === "Este ponto já é o nó 'a'; chamar de 'b' liga 'a' e 'b' (curto entre eles). Criar mesmo assim?" && av.ok === "Criar",
     `o campo já vem com o nome do ponto ("${pre[0]}", selecionado); outro nome: o aviso "${av.h}" — "${av.p}"`);
  await pg.click(".modal .m-cancela"); await pg.waitForTimeout(300);
  const volta = await pg.evaluate(() => { const i = document.querySelector("#conector-nome input"); return i && [i.value, document.activeElement === i]; });
  ok(volta && volta[0] === "b" && volta[1] && await nFios() === n1, `cancelar volta ao campo ("${volta && volta[0]}", com o foco), nada criado`);
  await pg.keyboard.press("Enter"); await pg.waitForSelector(".modal-fundo .modal", { timeout: 5000 }); await pg.click(".modal .m-ok");
  await pg.waitForFunction((n) => dados.folhas["0"].fios.length === n + 1, n1, { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(300);
  const wb = await pg.evaluate(() => { const w = dados.folhas["0"].fios.find((u) => u.rotulo === "b"); return w && [w.dom, w.pts]; });
  ok(wb && wb[0] === "LK" && JSON.stringify(wb[1]) === "[[14,8],[15,8],[16,8]]" && !(await pg.$("#conector-nome")), `confirmar cria: ${JSON.stringify(wb)}`);
  await pg.keyboard.press("Escape");
  ok(!(await modo()).c && !(await pg.$("#conector-nome")), "Esc sai da ferramenta");
  // num exemplo, o retificador trifásico (Marcelo, 28/10: "nível didático"): a bandeirinha a da fonte e a da ponte (o nó do
  // meio da perna com um toco), e o nome não se repete em texto nos fios e bornes ligados a uma bandeirinha; o "p" (ligado
  // dos dois lados, sem bandeirinha) continua em texto. Numa página nova (a de cima tem mudanças: fechar perguntaria)
  await post("editor/abrir", { arq: "exemplos/exemplo_retificador_trifasico.ipes", modo: "descartar" });
  const pg2 = await pg.context().newPage(); pg2.on("pageerror", (e) => erros.push(e.message));
  await pg2.goto(`http://localhost:7201/maisim/simu/?modelo=${encodeURIComponent("exemplos/exemplo_retificador_trifasico.ipes")}`);
  await pg2.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && document.querySelectorAll("#svg .conector-rot").length >= 6, null, { timeout: 30000 }).catch(() => {});
  const ex = await pg2.evaluate(() => { const txt = [...document.querySelectorAll("#svg text")].filter((t) => !t.closest(".conector-rot"));
    return { band: [...document.querySelectorAll("#svg .conector-rot")].map((c) => c.dataset.rot).sort().join(""),
      soltos: txt.filter((t) => ["a", "b", "c"].includes(t.textContent)).length, p: txt.some((t) => t.textContent === "p") }; });
  ok(ex.band === "aabbcc" && ex.soltos === 0 && ex.p, `o retificador trifásico: bandeirinhas ${ex.band} (fonte e ponte), ${ex.soltos} "a/b/c" em texto, "p" em texto ${ex.p}`);
  await pg2.close();
  ok(!erros.length, `sem erros de JS nem diálogos ${erros.join(" ; ")}`);
  await b.close(); process.exit(falhas ? 1 : 0);
})();
