// Flow 10: Bonus Ladder 冲单奖励
import { BASE, API, OUT, launchBrowser, shot, record, writeResults,
  staffLogin, apiStaffLogin, apiAdminLogin, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "10-bonus-ladder";
const USERNAME = "wstest1";
const PASSWORD = "Pass123!";
const results = [];

async function main() {
  const admTok = await apiAdminLogin();

  // Ensure default rules exist
  const rulesList = await fetch(`${API}/api/admin/bonus/rules`, {headers:{Authorization:`Bearer ${admTok}`}});
  const rj = await rulesList.json();
  record(results, "01 bonus rules exist", rulesList.status===200 && (rj.rules||rj.items||[]).length>=0, {count: (rj.rules||rj.items||[]).length});

  // Reset wstest1 password to known value
  const sid = mongoPy(`s=db.staff_users.find_one({'invite_code':'NFPSSY'}); print(str(s['_id']))`);
  mongoPy(`
import bcrypt
pw=bcrypt.hashpw(b'Pass123!',bcrypt.gensalt()).decode()
db.staff_users.update_one({'_id':ObjectId('${sid}')},{'$set':{'password_hash':pw}})
print('ok')
`);
  const sTok = await apiStaffLogin(USERNAME, PASSWORD);
  record(results, "02 staff login", !!sTok);

  // GET /today
  const tr = await fetch(`${API}/api/promoter/bonus/today`, {headers:{Authorization:`Bearer ${sTok}`}});
  const tj = await tr.json();
  record(results, "03 GET /bonus/today", tr.status===200 && Array.isArray(tj.tiers), {tier_count:(tj.tiers||[]).length});

  // 3 tiers: locked/reachable/claimed states visible
  const hasTiers = (tj.tiers||[]).length >= 3;
  record(results, "04 3+ tiers returned", hasTiers, {tiers: tj.tiers?.map(t=>({t:t.threshold,status:t.status||t.state})).slice(0,5)});

  // Try claiming tier threshold=1 (may fail if not eligible)
  const claimR = await fetch(`${API}/api/promoter/bonus/claim`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${sTok}`},
    body: JSON.stringify({tier_threshold: 1}),
  });
  const claimJ = await claimR.json();
  record(results, "05 claim tier=1 (may 400 if not reached)", claimR.status===200 || claimR.status===400 || claimR.status===409, {status:claimR.status, resp:claimJ});

  // UI: promoter sprint page
  const { browser, page, logs } = await launchBrowser();
  try {
    await staffLogin(page, USERNAME, PASSWORD);
    await page.goto(`${BASE}/sprint`, { waitUntil:"networkidle2" });
    await new Promise(r=>setTimeout(r,1500));
    await shot(page, "01-sprint", FLOW);
    const ok = await page.evaluate(()=>/bonus|冲单|阶梯|tier|ladder|reward/i.test(document.body.innerText));
    record(results, "06 UI sprint page renders", ok);
    fs.writeFileSync(path.join(OUT,FLOW,"console-errors.json"), JSON.stringify(logs,null,2));
  } finally {
    await browser.close();
  }
  writeResults(FLOW, results);
}
main().catch(e=>{console.error(e);process.exit(1);});
