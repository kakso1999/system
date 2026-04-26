// Flow 4: 活动管理 + 转盘配置 + 绑定地推员
import { BASE, API, OUT, launchBrowser, shot, record, writeResults,
  adminLogin, apiAdminLogin, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "04-campaigns";
const results = [];

async function main() {
  const token = await apiAdminLogin();
  const NAME = `test_camp_${Date.now()}`;

  mongoPy(`
db.campaigns.delete_many({'name':{'$regex':'^test_camp_'}})
db.staff_users.delete_many({'username':{'$regex':'^test_c4s_'}})
print('ok')
`);

  // Create 2 test staff for binding
  for (let i=1;i<=2;i++){
    mongoPy(`
from datetime import datetime, timezone
import secrets, bcrypt
pw = bcrypt.hashpw(b'Pass123!', bcrypt.gensalt()).decode()
db.staff_users.insert_one({
  'staff_no': f'T4_{int(datetime.now().timestamp()*1000)}_${i}',
  'name': 'Test C4 ${i}', 'phone': '+639170004004${i}',
  'username': 'test_c4s_${i}_${Date.now()}', 'password_hash': pw,
  'status': 'active','vip_level':'0','invite_code': 'TC4S'+str(${i}),
  'parent_id': None,'created_at': datetime.now(timezone.utc),
  'stats':{'total_scans':0,'total_valid':0,'total_commission':0,'team_size':0,'level1_count':0,'level2_count':0,'level3_count':0},
  'qr_version': 0,
})
print('ok')
`);
  }
  const staffIds = JSON.parse(mongoPy(`
import json
ids=[str(s['_id']) for s in db.staff_users.find({'username':{'$regex':'^test_c4s_'}},{'_id':1})]
print(json.dumps(ids))
`));
  record(results, "01 seed 2 test staff", staffIds.length===2, {staff_ids: staffIds});

  // Create campaign via API
  const now = new Date();
  const end = new Date(Date.now()+30*24*3600*1000);
  const cr = await fetch(`${API}/api/admin/campaigns/`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
    body: JSON.stringify({
      name: NAME, description: "e2e test campaign",
      start_time: now.toISOString(), end_time: end.toISOString(),
      rules_text: "rules", prize_url:"", max_claims_per_user:1, no_prize_weight: 10,
    }),
  });
  const cj = await cr.json();
  record(results, "02 create campaign", cr.status===201 && !!cj.id, {status:cr.status, id: cj.id});
  const CID = cj.id;

  // Add 3 wheel items with weights 20/30/10
  const itemWeights = [20, 30, 10];
  const itemIds = [];
  for (let i=0;i<3;i++){
    const wr = await fetch(`${API}/api/admin/wheel-items/`, {
      method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
      body: JSON.stringify({
        campaign_id: CID, name:`item${i+1}`, display_name:`Prize ${i+1}`,
        type: i===2?"website":"onsite", weight: itemWeights[i], sort_order:i,
        max_per_staff:0, enabled:true, needs_reward_code: i===2,
        reward_code_pool:"", redirect_url: i===2?"https://example.com/r":"",
        display_text:"", remark:"",
      }),
    });
    const wj = await wr.json();
    if (wj.id) itemIds.push(wj.id);
  }
  record(results, "03 add 3 wheel items", itemIds.length===3, {ids: itemIds});

  // Bind 2 staff
  const br = await fetch(`${API}/api/admin/campaigns/${CID}/bind-staff`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
    body: JSON.stringify({staff_ids: staffIds}),
  });
  const bj = await br.json();
  record(results, "04 bind 2 staff", br.status===200, {resp:bj});

  // Verify DB: each staff has campaign_id set
  const staffCheck = mongoJson(`
import json
rows=list(db.staff_users.find({'username':{'$regex':'^test_c4s_'}},{'username':1,'campaign_id':1}))
print(json.dumps([{'u':r['username'],'cid':str(r.get('campaign_id','')) if r.get('campaign_id') else None} for r in rows]))
`);
  const bothBound = staffCheck.every(r=>r.cid===CID);
  record(results, "05 DB staff.campaign_id bound", bothBound, {staffCheck});

  // Activate campaign
  const sr = await fetch(`${API}/api/admin/campaigns/${CID}/status`, {
    method:"PUT", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
    body: JSON.stringify({status:"active"}),
  });
  record(results, "06 activate campaign", sr.status===200, {status:sr.status});

  // UI: verify campaigns list
  const { browser, page, logs } = await launchBrowser();
  try {
    await adminLogin(page);
    await page.goto(`${BASE}/campaigns`, { waitUntil:"networkidle2" });
    await new Promise(r=>setTimeout(r,1500));
    await shot(page, "01-campaigns-list", FLOW);
    const listed = await page.evaluate((n)=>document.body.innerText.includes(n), NAME);
    record(results, "07 UI lists campaign", listed);
    fs.writeFileSync(path.join(OUT,FLOW,"console-errors.json"), JSON.stringify(logs,null,2));
  } finally {
    await browser.close();
    writeResults(FLOW, results);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
