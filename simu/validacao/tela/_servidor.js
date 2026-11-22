// O ambiente do simulador de teste (porta 7201), para os testes de tela que leem as pastas dele: o mesmo que o
// ../_servidor.py (no Linux, o /proc do processo; no Windows, o perfil de teste), chamado com o Python do ci.py
// (MAISIM_PYTHON) ou o python3.
const { execFileSync } = require("child_process");
const path = require("path");
exports.ambiente = (porta = 7201) => JSON.parse(execFileSync(process.env.MAISIM_PYTHON || "python3",
  [path.join(__dirname, "..", "_servidor.py"), String(porta)]).toString());
