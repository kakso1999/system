// Flow 6: 地推员列表筛选 + 暂停/恢复
import { BASE, API, OUT, launchBrowser, shot, record, writeResults,
  adminLogin, apiAdminLogin, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "06-staff-filter-pause";
const results = [];

async function main() {
  const token = await apiAdminLogin();

  // Use seed wstest1 staff
  const staff = mongoJson(`s=db.staff_users.find_one({'invite_code':'NFPSSY'}); print(json.dumps({'id':str(s['_id']),'work_status':s.get('work_status')}))`);
  record(results, "01 target staff exists", !!staff.id, staff);
  const SID = staff.id;

  // Ensure promoting state first
  await fetch(`${API}/api/admin/staff/${SID}/resume`, {method:"POST",headers:{Authorization:`Bearer ${token}`}}).catch(()=>null);
  mongoPy(`db.staff_users.update_one({'_id':ObjectId('${SID}')},{'$set':{'work_status':'promoting','promotion_paused':False}}); print('ok')`);

  // Pause
  const pr = await fetch(`${API}/api/admin/staff/${SID}/pause`, {method:"POST",headers:{Authorization:`Bearer ${token}`}});
  record(results, "02 pause API", pr.status===200, {status:pr.status});

  const afterPause = mongoJson(`s=db.staff_users.find_one({'_id':ObjectId('${SID}')}); print(json.dumps({'work_status':s.get('work_status'),'paused':s.get('promotion_paused')}))`);
  record(results, "03 DB work_status=paused", afterPause.work_status==="paused" && afterPause.paused===true, afterPause);

  // Live QR token for this staff should be expired
  const liveTokens = mongoPy(`print(db.promo_live_tokens.count_documents({'staff_id':ObjectId('${SID}'),'status':'active'}))`);
  record(results, "04 live tokens deactivated", liveTokens==="0", {active_tokens:liveTokens});

  // Resume
  const rr = await fetch(`${API}/api/admin/staff/${SID}/resume`, {method:"POST",headers:{Authorization:`Bearer ${token}`}});
  record(results, "05 resume API", rr.status===200, {status:rr.status});
  const afterResume = mongoJson(`s=db.staff_users.find_one({'_id':ObjectId('${SID}')}); print(json.dumps({'work_status':s.get('work_status')}))`);
  record(results, "06 DB work_status=promoting", afterResume.work_status==="promoting", afterResume);

  // UI: list filter works
  const { browser, page, logs } = await launchBrowser();
  try {
    await adminLogin(page);
    // staff list page - likely /staff or /promotion-activity
    const tryUrls = ["/staff","/promotion-activity","/promoters"];
    let found = null;
    for (const u of tryUrls) {
      const r = await page.goto(`${BASE}${u}`, { waitUntil:"networkidle2", timeout:10000 }).catch(()=>null);
      if (r && r.status()!==404 && !page.url().includes("/404")) { found=u; break; }
    }
    await new Promise(r=>setTimeout(r,1500));
    await shot(page, "01-staff-list", FLOW);
    const onList = !!found && await page.evaluate(()=>/wstest1|WS Test|NFPSSY/i.test(document.body.innerText));
    record(results, "07 UI staff list shows target", onList, {page:found});
    fs.writeFileSync(path.join(OUT,FLOW,"console-errors.json"), JSON.stringify(logs,null,2));
  } finally {
    await browser.close();
    writeResults(FLOW, results);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
