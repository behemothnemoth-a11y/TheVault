const fs = require("fs");
const path = require("path");

const runtimeRoot = "C:/Users/behem/AppData/Local/OpenAI/Codex/runtimes/cua_node";
const candidates = fs.existsSync(runtimeRoot)
  ? fs.readdirSync(runtimeRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(runtimeRoot, entry.name, "bin", "node_modules", "playwright"))
      .filter(candidate => fs.existsSync(candidate))
  : [];

if (!candidates.length) {
  throw new Error("The bundled Playwright runtime was not found. Open Codex once, then rerun the Vault acceptance suite.");
}

module.exports = require(candidates.at(-1));
