// e2e_runner.mjs — serially run all flows and aggregate results
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const OUT = "E:/工作代码/159_system/docs/smoke-v28";
const scripts = [
  "e2e_01_admin_create.mjs",
  "e2e_02_registration.mjs",
  "e2e_03_sponsors.mjs",
  "e2e_04_campaigns.mjs",
  "e2e_05_reward_codes.mjs",
  "e2e_06_staff_pause.mjs",
  "e2e_07_finance.mjs",
  "e2e_08_settings.mjs",
  "e2e_09_live_qr.mjs",
  "e2e_10_bonus.mjs",
  "e2e_11_full_claim.mjs",
  "e2e_12_risk.mjs",
  "e2e_13_external_redeem.mjs",
];

const summary = [];
for (const s of scripts) {
  const t0 = Date.now();
  let ok = true, stdout = "", err = null;
  try {
    stdout = execSync(`node ${s}`, { cwd: OUT, encoding: "utf-8", timeout: 180000 });
  } catch (e) {
    ok = false; err = String(e.message || e).slice(0, 400);
    stdout = (e.stdout || "").toString();
  }
  const dur = Date.now() - t0;
  // Parse ✅/❌ counts
  const pass = (stdout.match(/✅/g) || []).length;
  const fail = (stdout.match(/❌/g) || []).length;
  summary.push({ script: s, pass, fail, ok: ok && fail===0, duration_ms: dur, err });
  console.log(`${(ok && fail===0) ? "✅" : "❌"} ${s}  ${pass}P/${fail}F  ${dur}ms`);
}

fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({
  generated_at: new Date().toISOString(),
  summary,
  total_pass: summary.reduce((s,r)=>s+r.pass,0),
  total_fail: summary.reduce((s,r)=>s+r.fail,0),
}, null, 2));

console.log("\n=== Totals ===");
console.log("Pass:", summary.reduce((s,r)=>s+r.pass,0));
console.log("Fail:", summary.reduce((s,r)=>s+r.fail,0));
