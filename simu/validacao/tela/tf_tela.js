// a função de transferência pela tela (instância de teste; v0.3.1, frente C): o bloco TF mostra "H(s)" embaixo (curto:
// 1/(1+0.001s)); o painel dela tem o numerador e o denominador em potências de s (o texto que o campo aceita de volta),
// sem o "gain" e o "usePolynoms" do diálogo do Gecko; aplicar um denominador de 2ª ordem grava e o rótulo acompanha; o modo
// "polos, zeros e ganho" troca os campos e grava os polinômios da conta; um denominador nulo é recusado com a mensagem e nada
// muda; em inglês, os mesmos campos. O circuito do teste sai no fim.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), http = require("http");
const RAIZ = path.resolve(__dirname, "../../..");
const conf = (k, p) => { try { const m = fs.readFileSync(path.join(RAIZ, "config/teste.env"), "utf8").match(new RegExp(`^${k}=(\\S+)`, "m")); return m ? m[1] : p; } catch (e) { return p; } };
const PORTA = conf("MAISIM_PORTA_SIMU", "7201"), B = `http://localhost:${PORTA}/maisim/simu/`;
const CIRC = conf("MAISIM_SALVOS", "~/.cache/maisim_teste/circuitos").replace("~", require("os").homedir());
let falhas = 0;
const ok = (c, txt) => { console.log((c ? "OK   " : "FALHA") + " " + txt); if (!c) falhas++; };
const api = (rota, corpo) => new Promise((res) => {
  const d = corpo === undefined ? null : JSON.stringify(corpo);
  const q = http.request({ host: "localhost", port: PORTA, path: "/maisim/simu/" + rota, method: d ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (r) => {
    let s = ""; r.on("data", (c) => (s += c)); r.on("end", () => { try { res(JSON.parse(s)); } catch (e) { res({ erro: s }); } }); });
  q.on("error", (e) => res({ erro: e.message })); if (d) q.write(d); q.end(); });
const perto = (a, b) => a && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= 1e-9 * Math.max(Math.abs(x), Math.abs(b[i]), 1e-300));
(async () => {
  const ARQ = path.join(CIRC, "tf_tela_t.ipes");
  await api("editor/novo", { modo: "descartar" });
  for (const a of [["CONST.1", 4, 6, "CONST"], ["TF.1", 12, 6, "TF"]]) await api("editor/cmd", { op: "CREATE", args: a });
  await api("editor/cmd", { op: "OUTNODE", args: ["CONST.1", 0, "u"] }); await api("editor/cmd", { op: "INNODE", args: ["TF.1", 0, "u"] });
  const sv = await api("editor/salvar", { nome: "tf_tela_t", pasta: "circuitos", sobrescrever: true });
  ok(!sv.erro, `o circuito do teste: CONST → TF nova (${sv.erro || "salvo"})`);
  const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const erros = []; pg.on("pageerror", (e) => erros.push(e.message)); pg.on("dialog", (d) => { erros.push("diálogo: " + d.message()); d.dismiss(); });
  const tf = () => pg.evaluate(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "TF.1"); return e && e.tf; });
  const rot = () => pg.evaluate(() => { const i = dados.folhas["0"].elementos.findIndex((x) => x.nome === "TF.1"), t = document.querySelector(`#svg g.el[data-i="${i}"] text.tf-h`); return t && t.textContent; });
  const sel = async () => { await pg.evaluate(() => seleciona(dados.folhas["0"].elementos.find((x) => x.nome === "TF.1"))); await pg.waitForSelector("#tf-num"); await pg.waitForTimeout(400); };
  const espera = (f, arg) => pg.waitForFunction(f, arg, { timeout: 60000 }).then(() => true, () => false);
  try {
    await pg.goto(`${B}?modelo=${encodeURIComponent(ARQ)}`);
    await pg.waitForFunction(() => typeof dados !== "undefined" && dados && dados.folhas && dados.folhas["0"].elementos.some((e) => e.nome === "TF.1"), null, { timeout: 60000 });
    if (!(await pg.evaluate(() => ed.ligado))) { await pg.click("#bt-editar"); await pg.waitForTimeout(500); }
    while (await pg.$(".modal-fundo")) { await pg.click(".modal .m-ok"); await pg.waitForTimeout(800); }
    ok(await rot() === "1/(1+0.001s)", `embaixo do bloco: “${await rot()}” (a TF nova da paleta, 1/(1 + 1e-3 s))`);
    await sel();
    const campos = await pg.evaluate(() => ({ num: document.querySelector("#tf-num").value, den: document.querySelector("#tf-den").value,
      h4: [...document.querySelectorAll("#props h4")].map((h) => h.textContent), pz: document.querySelector("#tf-pz").hidden,
      pars: [...document.querySelectorAll("#p-params [data-p]")].map((i) => i.dataset.p) }));
    ok(campos.num === "1" && campos.den === "1 + 0.001 s" && campos.h4.includes("função de transferência H(s)") && campos.pz,
      `o painel: numerador “${campos.num}”, denominador “${campos.den}” (${campos.h4.join(" | ")})`);
    ok(!campos.pars.includes("gain") && !campos.pars.includes("usePolynoms") && campos.pars.includes("useInitState"),
      `sem o gain e o usePolynoms do diálogo do Gecko: ${campos.pars.join(", ")}`);
    // um denominador de 2ª ordem (Enter aplica)
    await pg.fill("#tf-den", "1 + 2*0.5/1000 s + 1e-6 s^2"); await pg.press("#tf-den", "Enter");
    const foi = await espera(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "TF.1"); return e.tf.den.length === 3; });
    let h = await tf();
    ok(foi && perto(h.num, [1]) && perto(h.den, [1, 1e-3, 1e-6]) && await rot() === "1/(1+0.001s+1e-6s²)",
      `aplicado: den ${JSON.stringify(h.den)}; embaixo “${await rot()}”; a mensagem “${await pg.textContent("#msg")}”`);
    // polos, zeros e ganho
    await sel();
    await pg.selectOption("#tf-modo", "pz");
    const vis = await pg.evaluate(() => [document.querySelector("#tf-pol").hidden, document.querySelector("#tf-pz").hidden]);
    ok(vis[0] && !vis[1], `o modo polos e zeros troca os campos (polinômios escondidos: ${vis[0]}, polos à vista: ${!vis[1]})`);
    await pg.fill("#tf-polos", "-1000"); await pg.fill("#tf-ganho", "1000"); await pg.click("#tf-aplica");
    await espera(() => { const e = dados.folhas["0"].elementos.find((x) => x.nome === "TF.1"); return e.tf.den.length === 2 && e.tf.den[0] === 1000; });
    h = await tf();
    ok(perto(h.num, [1000]) && perto(h.den, [1000, 1]) && await rot() === "1000/(1000+s)", `1000/(s + 1000): num ${JSON.stringify(h.num)}, den ${JSON.stringify(h.den)}; embaixo “${await rot()}”`);
    // recusado: nada muda, a mensagem diz por quê
    await sel();
    await pg.fill("#tf-den", "0"); await pg.click("#tf-aplica");
    await espera(() => /zero/.test(document.querySelector("#msg").textContent));
    const m = await pg.textContent("#msg"), cls = await pg.getAttribute("#msg", "class");
    ok(/denominador não pode ser zero/.test(m) && cls === "erro" && perto((await tf()).den, [1000, 1]), `denominador 0: “${m}” (${cls}); a TF ficou como estava`);
    // em inglês
    await pg.evaluate(() => maisimI18n.muda("en")); await pg.waitForTimeout(600); await sel();
    const en = await pg.evaluate(() => ({ h4: [...document.querySelectorAll("#props h4")].map((h) => h.textContent),
      lab: [...document.querySelectorAll("#tf-pol label span")].map((s) => s.textContent), bt: document.querySelector("#tf-aplica").textContent,
      op: [...document.querySelectorAll("#tf-modo option")].map((o) => o.textContent) }));
    ok(en.h4.includes("transfer function H(s)") && en.lab.join() === "numerator,denominator" && en.bt === "Apply H(s)" && en.op.join() === "polynomials in s,poles, zeros and gain",
      `em inglês: ${JSON.stringify(en)}`);
    await pg.fill("#tf-den", "1 + x"); await pg.click("#tf-aplica");
    await espera(() => /could not read/.test(document.querySelector("#msg").textContent));
    ok(/denominator: could not read/.test(await pg.textContent("#msg")), `o erro em inglês: “${await pg.textContent("#msg")}”`);
    await pg.evaluate(() => maisimI18n.muda("pt"));
    ok(!erros.length, `sem erros na página (${erros.join(" | ")})`);
  } catch (e) { ok(false, `exceção: ${e.stack || e}`); }
  await b.close();
  await api("editor/novo", { modo: "descartar" });
  for (const f of fs.readdirSync(CIRC).filter((f) => f.startsWith("tf_tela_t."))) fs.unlinkSync(path.join(CIRC, f));
  console.log(falhas ? `FALHA tf_tela: ${falhas} falha(s)` : "OK tf_tela");
  process.exit(falhas ? 1 : 0);
})();
