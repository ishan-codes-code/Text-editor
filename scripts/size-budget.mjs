// Per-chunk budget report. The TRD budget covers CORE (startup) JS only:
// warn at 350 KB, fail at 450 KB gzipped. Lazy chunks (vendor-docx,
// vendor-mammoth, OverlayHost, tables, formats, docxExport, import) stay lazy
// and precached — reported below but excluded from the gate.
// size-limit (npm run size) enforces the same 450 KB fail gate on the entry.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const WARN_BYTES = 350 * 1024;
const FAIL_BYTES = 450 * 1024;

const dir = new URL("../dist/assets", import.meta.url);
let files;
try {
  files = readdirSync(dir).filter((name) => name.endsWith(".js"));
} catch {
  console.error("dist/assets is missing: run `npm run build` first.");
  process.exit(2);
}

const rows = files
  .map((name) => {
    const raw = statSync(join(dir.pathname, name)).size;
    const gzipped = gzipSync(readFileSync(join(dir.pathname, name))).length;
    return { name, raw, gzipped, core: name.startsWith("entry-") };
  })
  .sort((a, b) => b.gzipped - a.gzipped);

const core = rows
  .filter((row) => row.core)
  .reduce((sum, row) => sum + row.gzipped, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log("chunk".padEnd(44) + "raw".padStart(10) + "gzip".padStart(10));
for (const row of rows) {
  const label = row.core ? row.name : `${row.name} (lazy)`;
  console.log(
    label.padEnd(44) + kb(row.raw).padStart(10) + kb(row.gzipped).padStart(10),
  );
}
console.log(
  `${"CORE JS (gzipped)".padEnd(44)}${"".padStart(10)}${kb(core).padStart(10)}`,
);

if (core > FAIL_BYTES) {
  console.error(`FAIL: core ${kb(core)} exceeds the 450 KB budget.`);
  process.exit(1);
}
if (core > WARN_BYTES) {
  console.log(`WARN: core ${kb(core)} exceeds the 350 KB warning threshold.`);
}
