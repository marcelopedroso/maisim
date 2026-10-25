// as máquinas pela tela (instância de teste; v0.3.1, frente C): o motor CC de exemplo desenha o símbolo (o círculo com M e
// "=", o tipo, "carga ← Tm") com os 4 bornes onde o Gecko os põe, todos ligados; no tema escuro com a cor dele e no zoom
// junto do desenho; o painel do motor (o sinal do torque de carga, com busca; os rótulos dos bornes: armadura e campo) e o
// do VIEWMOT ("grandeza da máquina": a máquina com busca e a lista do Gecko para ela; trocar a grandeza grava e o nome
// automático acompanha, n_MDC1 → omega_MDC1); um VIEWMOT novo ganha a máquina e o nome sozinho; o PMSM com "~" e as fases.
// Os exemplos voltam como estavam (abrir de novo descarta).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const RAIZ = path.resolve(__dirname, "../../..");
const conf = (k, p) => { try { const m = fs.readFileSync(path.join(RAIZ, "config/teste.env"), "utf8").match(new RegExp(`^${k}=(\\S+)`, "m")); return m ? m[1] : p; } catch (e) { return p; } };
const B = `http://localhost:${conf("MAISIM_PORTA_SIMU", "7201")}/maisim/simu/`;
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
(async () => {
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const abre = async (arq, nome) => {
    await pg.goto(`${B}?modelo=${encodeURIComponent(arq)}`);
    await pg.waitForFunction((n) => typeof dados !== "undefined" && dados && dados.folhas && dados.folhas["0"].elementos.some((e) => e.nome === n), nome, { timeout: 60000 });
    if (!(await pg.evaluate(() => ed.ligado))) { await pg.click("#bt-editar"); await pg.waitForTimeout(500); }
    while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-ok"); await pg.waitForTimeout(800); }
    await pg.waitForFunction(() => dados && dados.editor, null, { timeout: 30000 });
  };
  const sel = async (n) => { await pg.evaluate((n) => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === n)), n); await pg.waitForTimeout(300); };
  const elem = (n) => pg.evaluate((n) => { const e = dados.folhas["0"].elementos.find((x) => x.nome === n); return e && { mede: e.mede, grandeza: e.grandeza, saidas: e.saidas }; }, n);
  // o símbolo da máquina: o grupo dela no desenho (o círculo, os textos, os bornes) e onde estão os bornes
  const simbolo = (n) => pg.evaluate((n) => {
    const f = dados.folhas["0"], i = f.elementos.findIndex((x) => x.nome === n), e = f.elementos[i], g = document.querySelector(`#svg g.el[data-i="${i}"]`);
    if (!g) return null;
    const c = g.querySelector("circle.corpo"), bornes = [...g.querySelectorAll("circle.borne")];
    return { textos: [...g.querySelectorAll("text")].map((t) => t.textContent), r: c && +c.getAttribute("r") / G, stroke: c && c.getAttribute("stroke"),
      cx: c && +c.getAttribute("cx") / G, cy: c && +c.getAttribute("cy") / G, x: e.x, y: e.y, larg: c ? c.getBoundingClientRect().width : 0,
      bornes: bornes.map((b) => [+b.getAttribute("cx") / G, +b.getAttribute("cy") / G, +b.getAttribute("r") / G]),
      terminais: e.terminais.map((t) => [t.x, t.y]), lk: COR.lk };
  }, n);
  try {
    // ---------------------------------------------------------------- o motor CC: o símbolo
    await abre("exemplos/exemplo_motor_cc.ipes", "M-DC.1");
    let s = await simbolo("M-DC.1");
    const noLugar = s && s.bornes.length === 4 && s.terminais.every(([x, y]) => s.bornes.some(([bx, by]) => bx === x && by === y));
    ok(s && s.r === 1 && s.cx === s.x && s.cy === s.y && ["M", "=", "M-DC", "M-DC.1"].every((t) => s.textos.includes(t)) && s.textos.some((t) => /Tm/.test(t)),
      `M-DC.1: o círculo (raio 1, no centro), M, "=", o tipo e a carga (${s && s.textos.join(" | ")})`);
    ok(noLugar && s.bornes.every((b) => b[2] < 0.15), `os 4 bornes onde o Gecko os põe, todos ligados (cheios): ${JSON.stringify(s && s.bornes)}`);
    // o zoom: o símbolo cresce junto (o desenho é da folha); o tema escuro: a cor do circuito dele
    await pg.waitForTimeout(800);
    const z = await pg.evaluate(() => { const c = () => [...document.querySelectorAll("#svg circle.corpo")].find((x) => x.closest("g.el") && /M-DC\.1/.test(x.closest("g.el").textContent));
      const w0 = c().getBoundingClientRect().width, antes = Object.assign({}, ver);
      ver.w /= 2; ver.h /= 2; aplicaVer(); const w1 = c().getBoundingClientRect().width; ver = antes; aplicaVer(); return [w0, w1]; });
    ok(Math.abs(z[1] / z[0] - 2) < 0.1, `o zoom: o círculo de ${z[0].toFixed(0)} para ${z[1].toFixed(0)} px (o dobro)`);
    await pg.evaluate(() => { document.documentElement.dataset.tema = "escuro"; dispatchEvent(new Event("maisim-tema")); }); await pg.waitForTimeout(500);
    s = await simbolo("M-DC.1");
    ok(s.stroke === s.lk && s.lk === "#8fa2ff", `o tema escuro: o círculo na cor do circuito dele (${s.stroke})`);
    await pg.evaluate(() => { document.documentElement.dataset.tema = "claro"; dispatchEvent(new Event("maisim-tema")); }); await pg.waitForTimeout(300);
    // ---------------------------------------------------------------- o painel do motor
    await sel("M-DC.1"); await pg.waitForSelector("#p-carga");
    const lig = await pg.evaluate(() => [...document.querySelectorAll("#props [data-in], #props [data-out]")].map((i) => `${i.closest("label").querySelector("span").textContent}=${i.value}`));
    ok(await pg.inputValue("#p-carga") === "Tm" && ["armadura +=a", "campo +=vf", "armadura −=gnd", "campo −=gnd"].every((x) => lig.includes(x)),
      `o painel do M-DC.1: carga ← Tm; os bornes ${lig.join(", ")}`);
    await pg.fill("#p-carga", ""); await pg.type("#p-carga", "T"); await pg.waitForTimeout(300);
    const sug = await pg.evaluate(() => [...document.querySelectorAll(".sug")].map((x) => x.textContent));
    ok(sug.some((x) => x.includes("Tm")), `a busca do sinal mostra o Tm (${sug.join(" | ")})`);
    await pg.fill("#p-carga", ""); await pg.keyboard.press("Escape"); await pg.dispatchEvent("#p-carga", "change");
    await pg.waitForFunction(() => dados.folhas["0"].elementos.find((x) => x.nome === "M-DC.1").mede[0] === "", null, { timeout: 20000 }).catch(() => {});
    const sem = await pg.evaluate(() => [...document.querySelectorAll("#svg text.maq-carga")].map((t) => [t.textContent, t.getAttribute("fill") === COR.erro]));
    ok((await elem("M-DC.1")).mede[0] === "" && sem.some(([t, c]) => /sem torque/.test(t) && c), `sem carga: o desenho avisa em vermelho (${JSON.stringify(sem)})`);
    await sel("M-DC.1"); await pg.waitForSelector("#p-carga");
    await pg.fill("#p-carga", "Tm"); await pg.keyboard.press("Escape"); await pg.dispatchEvent("#p-carga", "change");
    await pg.waitForFunction(() => dados.folhas["0"].elementos.find((x) => x.nome === "M-DC.1").mede[0] === "Tm", null, { timeout: 20000 }).catch(() => {});
    ok((await elem("M-DC.1")).mede[0] === "Tm", "e de volta: carga ← Tm");
    // ---------------------------------------------------------------- o VIEWMOT ("grandeza da máquina")
    await sel("VIEWMOT.1"); await pg.waitForSelector("#m-grandeza");
    const opc = await pg.evaluate(() => [...document.querySelectorAll("#m-grandeza option")].map((o) => o.value));
    ok(await pg.inputValue("#m-maq") === "M-DC.1" && await pg.inputValue("#m-grandeza") === "n [rpm]" && opc.length === 8 && opc.includes("phi [Vs]"),
      `o painel do VIEWMOT.1: M-DC.1 · n [rpm], as 8 grandezas do M-DC (${opc.join(", ")})`);
    const desenho = await pg.evaluate(() => [...document.querySelectorAll("#svg text.vm-alvo")].map((t) => t.textContent));
    ok(desenho.includes("M-DC.1 · n [rpm]"), `o desenho diz a máquina e a grandeza embaixo do bloco (${desenho.join(" | ")})`);
    await pg.selectOption("#m-grandeza", "omega");
    await pg.waitForFunction(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "VIEWMOT.1"); return e.grandeza === "omega" && e.saidas[0] === "omega_MDC1"; }, null, { timeout: 20000 }).catch(() => {});
    let v = await elem("VIEWMOT.1");
    ok(v.grandeza === "omega" && v.saidas[0] === "omega_MDC1", `trocar para omega grava e o nome automático acompanha (${v.grandeza}, ${v.saidas[0]})`);
    await sel("VIEWMOT.1"); await pg.waitForSelector("#m-grandeza"); await pg.selectOption("#m-grandeza", "n [rpm]");
    await pg.waitForFunction(() => dados.folhas["0"].elementos.find((x) => x.nome === "VIEWMOT.1").saidas[0] === "n_MDC1", null, { timeout: 20000 }).catch(() => {});
    v = await elem("VIEWMOT.1");
    ok(v.grandeza === "n [rpm]" && v.saidas[0] === "n_MDC1", `e de volta (${v.grandeza}, ${v.saidas[0]})`);
    // um VIEWMOT novo: a máquina pela busca, a grandeza padrão (n) e o nome sozinho; depois a f.c.e.m.
    await pg.evaluate(() => api("editor/cmd", { op: "CREATE", args: ["VIEWMOT.7", 50, 40, "VIEWMOT"] }).then((j) => novoEstado(j)));
    await sel("VIEWMOT.7"); await pg.waitForSelector("#m-maq");
    ok(await pg.evaluate(() => $("m-grandeza") ? document.querySelector("#m-grandeza").disabled : null) === true
       && (await pg.evaluate(() => [...document.querySelectorAll("#svg text.vm-alvo")].map((t) => t.textContent))).some((t) => /sem máquina/.test(t)),
      "o VIEWMOT novo: sem máquina (a grandeza desligada; no desenho, em vermelho)");
    await pg.fill("#m-maq", "M-DC.1"); await pg.keyboard.press("Escape"); await pg.dispatchEvent("#m-maq", "change");
    await pg.waitForFunction(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "VIEWMOT.7"); return e.grandeza === "n [rpm]" && e.saidas[0]; }, null, { timeout: 20000 }).catch(() => {});
    v = await elem("VIEWMOT.7");
    ok(v.mede[1] === "M-DC.1" && v.grandeza === "n [rpm]" && /^n_MDC1/.test(v.saidas[0] || ""), `a máquina escolhida: n [rpm] e o nome ${v.saidas[0]}`);
    await sel("VIEWMOT.7"); await pg.waitForSelector("#m-grandeza"); await pg.selectOption("#m-grandeza", "emf [V]");
    await pg.waitForFunction(() => dados.folhas["0"].elementos.find((x) => x.nome === "VIEWMOT.7").saidas[0] === "emf_MDC1", null, { timeout: 20000 }).catch(() => {});
    v = await elem("VIEWMOT.7");
    ok(v.grandeza === "emf [V]" && v.saidas[0] === "emf_MDC1", `a f.c.e.m.: ${v.grandeza}, ${v.saidas[0]}`);
    await pg.screenshot({ path: "motores_tela.png" });
    // ---------------------------------------------------------------- o PMSM: "~" e as fases
    await abre("exemplos/exemplo_pmsm.ipes", "PMSM.1");
    s = await simbolo("PMSM.1");
    ok(s && s.textos.includes("~") && s.textos.includes("PMSM") && s.bornes.length === 3 && s.terminais.every(([x, y]) => s.bornes.some(([bx, by]) => bx === x && by === y)),
      `PMSM.1: "~", o tipo e as 3 fases nos bornes do Gecko (${s && s.textos.join(" | ")})`);
    await sel("PMSM.1"); await pg.waitForSelector("#p-carga");
    const fases = await pg.evaluate(() => [...document.querySelectorAll("#props [data-in]")].map((i) => `${i.closest("label").querySelector("span").textContent}=${i.value}`));
    ok(fases.join(",") === "fase a=a,fase b=b,fase c=c", `o painel do PMSM.1: ${fases.join(", ")}`);
    // a paleta: a aba Motor & EMI com as quatro
    const pal = await pg.evaluate(() => (ed.catalogo.abas.find((x) => /Motor/.test(x.aba)) || { itens: [] }).itens.filter((i) => !i.oculto).map((i) => i.id));
    ok(["M-DC", "PM-DC", "PMSM", "IM-CAGE"].every((x) => pal.includes(x)), `a aba Motor & EMI: ${pal.join(", ")}`);
    ok(!erros.length, `sem erros na página (${erros.join(" | ")})`);
  } finally {
    await pg.evaluate(() => api("editor/abrir", { arq: "exemplos/exemplo_motor_cc.ipes", modo: "descartar" })).catch(() => {});
    await b.close();
  }
  process.exit(falhas ? 1 : 0);
})();
