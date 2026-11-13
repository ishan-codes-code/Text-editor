// Per-chunk budget report: warn at 350 KB, fail at 450 KB gzipped total JS.
// size-limit (npm run size) enforces the 450 KB fail gate; this script prints
// the per-chunk table the Phase A prompt requires and surfaces the warning.
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
    return { name, raw, gzipped };
  })
  .sort((a, b) => b.gzipped - a.gzipped);

const total = rows.reduce((sum, row) => sum + row.gzipped, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log("chunk".padEnd(44) + "raw".padStart(10) + "gzip".padStart(10));
for (const row of rows) {
  console.log(row.name.padEnd(44) + kb(row.raw).padStart(10) + kb(row.gzipped).padStart(10));
}
console.log(`${"TOTAL JS (gzipped)".padEnd(44)}${"".padStart(10)}${kb(total).padStart(10)}`);

if (total > FAIL_BYTES) {
  console.error(`FAIL: ${kb(total)} exceeds the 450 KB budget.`);
  process.exit(1);
}
if (total > WARN_BYTES) {
  console.log(`WARN: ${kb(total)} exceeds the 350 KB warning threshold.`);
}
