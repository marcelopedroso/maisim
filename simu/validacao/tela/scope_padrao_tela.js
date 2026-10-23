// o padrão do scope de cada circuito (instância de teste 7200 → simu 7201 e scope 7202), pedido de Marcelo em 23/10: "Layout ▾"
// → "Guardar como padrão deste circuito" grava <nome>.scope.json ao lado do .ipes; mexer e "Voltar ao padrão" volta; outro
// navegador (sem o layout guardado) começa pelo padrão; "Automático" volta aos sinais da rodada; um exemplo (só leitura)
// recusa; o "salvar como" leva o padrão junto
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const CIRC = path.join(os.homedir(), ".cache/maisim_teste/circuitos"), PI = path.join(CIRC, "exemplo_controle_pi.ipes");
const PADRAO = path.join(CIRC, "exemplo_controle_pi.scope.json"), COPIA = path.join(CIRC, "pi_padrao_copia");
const api = (rota, corpo) => fetch("http://localhost:7201/maisim/simu/" + rota, corpo ? { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo) } : {}).then(async (r) => ({ st: r.status, ...(await r.json().catch(() => ({}))) }));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let b, pasta;
  try {
    fs.rmSync(PADRAO, { force: true });
    await api("editor/abrir", { arq: PI, modo: "descartar" });
    let j = await api("editor/rodar", { dt: "1e-6", tfim: "0.002", nome: "padrao_teste", amostras: "100", por_cima: "0" });
    while (["rodando", "pausada", "preparando"].includes(j.estado)) { await espera(300); j = await api("editor/rodada"); }
    pasta = path.dirname(path.isAbsolute(j.arquivo) ? j.arquivo : path.resolve(__dirname, "../../..", j.arquivo));
    b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    const erros = []; pg.on("pageerror", (e) => erros.push(e.message));
    const URL = "http://localhost:7200/maisim/scope/?a=" + encodeURIComponent(j.arquivo);
    const vistos = () => pg.evaluate(() => itens.map((x) => x.tipo === "secao" ? "S:" + x.titulo : "P:" + x.titulo));
    const abre = async () => { await pg.goto(URL); await pg.waitForFunction(() => typeof A !== "undefined" && A && A.dados && itens.length, null, { timeout: 20000 }); await pg.waitForTimeout(1200); };
    await abre();
    const auto = await vistos();
    // monta um painel e guarda como padrão
    await pg.evaluate(() => { adicionaPainel({ titulo: "Meu painel", sinais: [catalogo()[0].canal] }); guardaLayout(); });
    await pg.click("#bt-layout"); await pg.click("#ml-guardar"); await pg.waitForFunction(() => /guardado como o padrão/.test(document.getElementById("status").textContent), null, { timeout: 10000 });
    const arq = fs.existsSync(PADRAO) && JSON.parse(fs.readFileSync(PADRAO, "utf8"));
    ok(arq && arq.itens.some((x) => x.titulo === "Meu painel"), `guardar como padrão: ${path.basename(PADRAO)} ao lado do circuito, com "Meu painel" (antes: ${auto.join(" ")})`);
    // mexe (tira o painel) e volta ao padrão
    await pg.evaluate(() => { const p = paineis().find((x) => x.titulo === "Meu painel"); p.el.querySelector(".b-rem").click(); });
    const mexido = await vistos();
    await pg.click("#bt-layout"); await pg.click("#ml-padrao"); await pg.waitForTimeout(800);
    ok(!mexido.includes("P:Meu painel") && (await vistos()).includes("P:Meu painel"), "mexeu (tirou o painel) e “Voltar ao padrão” trouxe de volta");
    // outro navegador (sem o layout guardado): começa pelo padrão
    await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("maisim-scope-layout")) localStorage.removeItem(k); });
    await abre();
    ok((await vistos()).includes("P:Meu painel"), `sem o layout no navegador, o circuito começa pelo padrão: ${(await vistos()).join(" ")}`);
    // o padrão demorando a vir (ao vivo, a rodada mexe na tela nesse meio-tempo): o provisório não é gravado e o padrão entra
    await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("maisim-scope-layout")) localStorage.removeItem(k); });
    await pg.route("**/scope/padrao?*", async (r) => { await espera(1500); await r.continue(); });
    await pg.goto(URL); await pg.waitForFunction(() => typeof A !== "undefined" && A && A.dados && itens.length, null, { timeout: 20000 });
    const gravouNoMeio = await pg.evaluate(() => { guardaLayout(); return !!localStorage.getItem(chaveLayout()); });
    await pg.waitForTimeout(2500); await pg.unroute("**/scope/padrao?*");
    ok(!gravouNoMeio && (await vistos()).includes("P:Meu painel"), `com o padrão demorando, o provisório não foi gravado e o padrão entrou: ${(await vistos()).join(" ")}`);
    // o mesmo com um layout de antes (v3) no navegador: com o padrão ainda vindo, o v3 não entra na frente dele
    await pg.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("maisim-scope-layout")) localStorage.removeItem(k);
      localStorage.setItem("maisim-scope-layout-v3", JSON.stringify({ itens: [{ secao: "Do v3" }, { titulo: "Painel do v3", sinais: [catalogo()[0].canal] }] })); });
    await pg.route("**/scope/padrao?*", async (r) => { await espera(1500); await r.continue(); });
    await pg.goto(URL); await pg.waitForFunction(() => typeof A !== "undefined" && A && A.dados && itens.length, null, { timeout: 20000 });
    await pg.evaluate(() => montaTudo());                                                   // a remontagem do 1º dado, com o padrão ainda vindo
    await pg.waitForTimeout(2500); await pg.unroute("**/scope/padrao?*");
    const v3 = await vistos(); await pg.evaluate(() => localStorage.removeItem("maisim-scope-layout-v3"));
    ok(v3.includes("P:Meu painel") && !v3.includes("P:Painel do v3"), `com o padrão demorando e um v3 no navegador: o padrão entra, o v3 não (${v3.join(" ")})`);
    // automático
    await pg.click("#bt-layout"); await pg.click("#bt-padrao"); await pg.waitForTimeout(500);
    ok(!(await vistos()).includes("P:Meu painel"), `automático: ${(await vistos()).join(" ")}`);
    await abre();
    ok(!(await vistos()).includes("P:Meu painel"), `automático e reaberto: fica no automático, o padrão não volta por cima (${(await vistos()).join(" ")})`);
    // um exemplo (só leitura): recusa
    const ex = await api("scope/padrao", { modelo: "exemplos/exemplo_buck.ipes", layout: { itens: [{ titulo: "x", sinais: ["v_o"] }] } });
    ok(ex.st === 409 && /só de leitura/.test(ex.erro || ""), `num exemplo, guardar o padrão é recusado (${ex.erro})`);
    // um circuito que não existe (apagado): recusa, sem deixar um padrão órfão
    const orf = await api("scope/padrao", { modelo: path.join(CIRC, "nao_existe_padrao.ipes"), layout: { itens: [{ titulo: "x", sinais: ["v_o"] }] } });
    ok(orf.st === 409 && /não existe/.test(orf.erro || "") && !fs.existsSync(path.join(CIRC, "nao_existe_padrao.scope.json")), `circuito que não existe: recusado (${orf.erro})`);
    // o "salvar como" leva o padrão junto
    await api("editor/abrir", { arq: PI, modo: "descartar" });
    const sv = await api("editor/salvar", { nome: "pi_padrao_copia", pasta: "circuitos", sobrescrever: true });
    ok(sv.st === 200 && fs.existsSync(COPIA + ".scope.json"), `salvar como: a cópia leva o padrão (${path.basename(COPIA)}.scope.json)`);
    // apagar o circuito: o padrão (e os outros de ao lado) vão junto para a lixeira — um circuito novo com o mesmo nome não os herda
    const ap = await api("editor/apagar_arquivo", { arq: COPIA + ".ipes" });
    const lix = path.join(CIRC, ".lixeira"), naLixeira = ap.lixeira ? path.basename(ap.lixeira, ".ipes") : "?";
    ok(ap.st === 200 && !fs.existsSync(COPIA + ".scope.json") && fs.existsSync(path.join(lix, naLixeira + ".scope.json")),
      `apagar: o ${path.basename(COPIA)}.scope.json foi junto para a lixeira (${naLixeira}.scope.json)`);
    // salvar como por cima de um que tinha padrão, vindo de um circuito sem padrão: o de antes sai (era do outro)
    fs.writeFileSync(COPIA + ".scope.json", JSON.stringify({ itens: [{ titulo: "velho", sinais: ["x"] }] })); fs.rmSync(PADRAO, { force: true });
    await api("editor/abrir", { arq: PI, modo: "descartar" });
    const sv2 = await api("editor/salvar", { nome: "pi_padrao_copia", pasta: "circuitos", sobrescrever: true });
    ok(sv2.st === 200 && !fs.existsSync(COPIA + ".scope.json"), "salvar como (sem padrão na origem) por cima de um com padrão: o padrão velho sai");
    for (const f of fs.readdirSync(lix)) if (f.startsWith(naLixeira)) fs.rmSync(path.join(lix, f), { force: true });
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message.split("\n")[0]}`); }
  finally {
    if (b) await b.close();
    fs.rmSync(PADRAO, { force: true });
    for (const ext of [".ipes", ".scope.json", ".controle.json", ".aparencia.json"]) fs.rmSync(COPIA + ext, { force: true });
    if (pasta && /padrao_teste$/.test(pasta)) fs.rmSync(pasta, { recursive: true, force: true });
    await api("editor/abrir", { arq: PI, modo: "descartar" }).catch(() => {});
  }
  process.exit(falhas ? 1 : 0);
})();
