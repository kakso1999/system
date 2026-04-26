// Flow 5: 奖励码导入（paste + upload file）
import { BASE, API, OUT, launchBrowser, shot, record, writeResults,
  adminLogin, apiAdminLogin, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "05-reward-codes-import";
const CAMPAIGN_ID = "69d5d011514405fc970bd1df";
const results = [];

async function main() {
  const token = await apiAdminLogin();

  // find website item for target
  const wid = mongoPy(`i=db.wheel_items.find_one({'campaign_id':ObjectId('${CAMPAIGN_ID}'),'type':'website'}); print(str(i['_id']) if i else '')`);

  const PREFIX = `E2E5_${Date.now()}`;
  mongoPy(`db.reward_codes.delete_many({'code': {'$regex':'^${PREFIX}'}}); print('ok')`);

  // Paste 3 codes
  const pasteCodes = [`${PREFIX}_P1`,`${PREFIX}_P2`,`${PREFIX}_P3`].join("\n");
  const r1 = await fetch(`${API}/api/admin/reward-codes/import-paste`, {
    method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
    body: JSON.stringify({codes_text: pasteCodes, campaign_id: CAMPAIGN_ID, wheel_item_id: wid, pool_type:"imported"}),
  });
  const j1 = await r1.json();
  record(results, "01 paste import 3 codes", r1.status===200 && /3/.test(j1.message||""), {resp:j1});

  const countAfterPaste = mongoPy(`print(db.reward_codes.count_documents({'code':{'$regex':'^${PREFIX}'}}))`);
  record(results, "02 DB has 3 codes", countAfterPaste==="3", {count:countAfterPaste});

  // File upload 5 codes
  const txt = `${PREFIX}_U1\n${PREFIX}_U2\n${PREFIX}_U3\n${PREFIX}_U4\n${PREFIX}_U5\n`;
  const fd = new FormData();
  fd.append("file", new Blob([txt], {type:"text/plain"}), "codes.txt");
  fd.append("campaign_id", CAMPAIGN_ID);
  fd.append("wheel_item_id", wid);
  fd.append("pool_type", "imported");
  const r2 = await fetch(`${API}/api/admin/reward-codes/import`, {
    method:"POST", headers:{Authorization:`Bearer ${token}`}, body: fd,
  });
  const j2 = await r2.json();
  record(results, "03 upload import 5 codes", r2.status===200 && /5/.test(j2.message||""), {resp:j2});

  const totalAfter = mongoPy(`print(db.reward_codes.count_documents({'code':{'$regex':'^${PREFIX}'}}))`);
  record(results, "04 total 8 codes", totalAfter==="8", {total:totalAfter});

  // API list verify
  const lr = await fetch(`${API}/api/admin/reward-codes/?campaign_id=${CAMPAIGN_ID}&page=1&page_size=100`, {headers:{Authorization:`Bearer ${token}`}});
  const lj = await lr.json();
  const items = lj.items || lj.results || [];
  const hasImported = items.some(r => (r.code||"").startsWith(PREFIX));
  record(results, "05 API /reward-codes list includes imported", hasImported, {total_rows:items.length});

  // UI: open campaigns page to ensure admin UI entry loads
  const { browser, page, logs } = await launchBrowser();
  try {
    await adminLogin(page);
    await page.goto(`${BASE}/campaigns`, { waitUntil:"networkidle2" });
    await new Promise(r=>setTimeout(r,1000));
    await shot(page, "01-campaigns", FLOW);
    fs.writeFileSync(path.join(OUT,FLOW,"console-errors.json"), JSON.stringify(logs,null,2));
  } finally {
    await browser.close();
    writeResults(FLOW, results);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
