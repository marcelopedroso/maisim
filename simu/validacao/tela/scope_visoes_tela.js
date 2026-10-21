// as visões do scope num arquivo (instância de teste 7200 → scope 7202): "Exportar visões" baixa os painéis, as seções e
// as cores; "Importar visões…" troca pelas de um arquivo — o exportado aqui, um do PEW (o mesmo formato) — e recusa o
// que não é (Marcelo, 21/10: "exportar scopes e daí importar, pra ter as mesmas views")
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "visoes_"));
const URL = "http://localhost:7200/maisim/scope/";
const MEU = { colunas: 1, itens: [{ secao: "Seção do teste" }, { titulo: "Painel do teste", sinais: ["sinal_a", "sinal_b"] }] };
(async () => {
  let b;
  try {
    b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
    const pg = await ctx.newPage();
    const erros = [], dialogos = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { dialogos.push(d.message()); d.accept(); });
    const vistos = () => pg.evaluate(() => itens.map((x) => x.tipo === "secao" ? "S:" + x.titulo : "P:" + x.titulo));
    await pg.goto(URL); await pg.waitForFunction(() => typeof itens !== "undefined" && itens.length, null, { timeout: 20000 });
    await pg.evaluate((L) => { localStorage.setItem("maisim-scope-layout-v3", JSON.stringify(L)); localStorage.setItem("maisim-scope-cores", JSON.stringify({ sinal_a: "#ff0000" })); }, MEU);
    await pg.reload(); await pg.waitForFunction(() => typeof itens !== "undefined" && itens.length, null, { timeout: 20000 });
    ok(JSON.stringify(await vistos()) === JSON.stringify(["S:Seção do teste", "P:Painel do teste"]), `as visões de partida: ${JSON.stringify(await vistos())}`);
    // exportar
    const [down] = await Promise.all([pg.waitForEvent("download"), pg.click("#bt-exportar")]);
    const arq = path.join(TMP, down.suggestedFilename()); await down.saveAs(arq);
    const v = JSON.parse(fs.readFileSync(arq, "utf8"));
    ok(/^visoes_scope_\d{4}-\d\d-\d\d\.json$/.test(down.suggestedFilename()) && v.formato === "scope-visoes" && v.de === "MaiSim" && v.layout.itens.length === 2
       && v.layout.itens[1].titulo === "Painel do teste" && v.cores.sinal_a === "#ff0000", `exportado: ${down.suggestedFilename()} (${v.layout.itens.length} itens, cores ${JSON.stringify(v.cores)})`);
    // de volta ao padrão, e importar o arquivo exportado
    await pg.click("#bt-padrao"); await pg.waitForTimeout(300);
    await pg.evaluate(() => localStorage.setItem("maisim-scope-cores", "{}"));
    const padrao = await vistos();
    ok(!padrao.includes("P:Painel do teste"), `layout padrão: ${padrao.length} itens, sem o painel do teste`);
    await pg.setInputFiles("#arq-visoes", arq); await pg.waitForFunction(() => /visões importadas/.test(document.getElementById("status").textContent), null, { timeout: 10000 });
    const cor = await pg.evaluate(() => JSON.parse(localStorage.getItem("maisim-scope-cores")).sinal_a);
    ok(JSON.stringify(await vistos()) === JSON.stringify(["S:Seção do teste", "P:Painel do teste"]) && cor === "#ff0000" && dialogos.length === 1 && /2 painéis e seções/.test(dialogos[0]),
       `importado de volta: ${JSON.stringify(await vistos())}, cor ${cor}; pergunta antes ("${dialogos[0]}")`);
    // um arquivo do PEW (o mesmo formato; as chaves do navegador eram outras, o arquivo não)
    const pew = path.join(TMP, "visoes_pew.json");
    fs.writeFileSync(pew, JSON.stringify({ formato: "scope-visoes", versao: 1, de: "PEW", layout: { colunas: 3, itens: [{ secao: "MMC" }, { titulo: "Correntes", sinais: ["i_Lf_a"] }, { titulo: "Vdc", sinais: ["Vdc_cmd", "Vcc"] }] },
      cores: { Vcc: "#d62728", "<script>": "#000000", Vdc_cmd: "vermelho" } }));
    await pg.setInputFiles("#arq-visoes", pew); await pg.waitForFunction(() => /visões importadas de visoes_pew/.test(document.getElementById("status").textContent), null, { timeout: 10000 });
    const cores = await pg.evaluate(() => JSON.parse(localStorage.getItem("maisim-scope-cores")));
    ok(JSON.stringify(await vistos()) === JSON.stringify(["S:MMC", "P:Correntes", "P:Vdc"]) && await pg.evaluate(() => larguraPadrao) === 3 && JSON.stringify(cores) === JSON.stringify({ Vcc: "#d62728" }),
       `do PEW: ${JSON.stringify(await vistos())}, por linha ${await pg.evaluate(() => larguraPadrao)}, cores só as válidas ${JSON.stringify(cores)}`);
    await pg.reload(); await pg.waitForFunction(() => typeof itens !== "undefined" && itens.length, null, { timeout: 20000 });
    ok(JSON.stringify(await vistos()) === JSON.stringify(["S:MMC", "P:Correntes", "P:Vdc"]), "recarregada: as visões importadas ficam");
    // o que não é arquivo de visões: recusado, nada muda
    const ruim = path.join(TMP, "outro.json"); fs.writeFileSync(ruim, JSON.stringify({ formato: "outro", itens: [] }));
    await pg.setInputFiles("#arq-visoes", ruim); await pg.waitForTimeout(500);
    ok(/não é um arquivo de visões/.test(await pg.textContent("#status")) && JSON.stringify(await vistos()) === JSON.stringify(["S:MMC", "P:Correntes", "P:Vdc"]) && dialogos.length === 2,
       `arquivo que não é de visões: "${await pg.textContent("#status")}", nada mudou`);
    await pg.click("#bt-padrao"); await pg.evaluate(() => localStorage.removeItem("maisim-scope-cores"));
    ok(!erros.length, `sem erros de JS ${erros.join(" ; ")}`);
  } catch (e) { ok(false, `o teste caiu: ${e.message}`); }
  finally { if (b) await b.close(); fs.rmSync(TMP, { recursive: true, force: true }); }
  process.exit(falhas ? 1 : 0);
})();
