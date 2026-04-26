// Flow 7: 合并结算 + 对账 + CSV 导出
// Strategy: seed staff + approved claim + commission_log, then manual-settle via API.
import { BASE, API, OUT, launchBrowser, shot, record, writeResults,
  adminLogin, apiAdminLogin, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "07-finance-settle";
const results = [];

async function main() {
  const token = await apiAdminLogin();

  // Seed: create test staff + approved claim + commission_log
  const TS = Date.now();
  mongoPy(`
from datetime import datetime, timezone
from bson import ObjectId
import bcrypt, secrets
db.staff_users.delete_many({'username':{'$regex':'^test_fin_'}})
db.claims.delete_many({'phone':{'$regex':'^\\\\+6390000'}})
db.commission_logs.delete_many({'amount_cents': 100, 'level': 1})
pw=bcrypt.hashpw(b'Pass123!',bcrypt.gensalt()).decode()
cid=ObjectId('69d5d011514405fc970bd1df')
sid=db.staff_users.insert_one({
  'staff_no':'TFIN_${TS}','name':'Test Fin','phone':'+639170099${TS}'[:14],
  'username':'test_fin_${TS}','password_hash':pw,
  'status':'active','vip_level':'0','invite_code':'TFIN'+secrets.token_hex(2).upper(),
  'parent_id':None,'campaign_id':cid,
  'stats':{'total_scans':0,'total_valid':0,'total_commission':0,'team_size':0,'level1_count':0,'level2_count':0,'level3_count':0},
  'qr_version':0,'created_at':datetime.now(timezone.utc),
}).inserted_id
# Create a paid-eligible claim with approved commission_log
claim_id=db.claims.insert_one({
  'campaign_id':cid,'staff_id':sid,'phone':'+6390000${TS}'[:14],
  'prize_type':'onsite','verified':True,'reward_code_id':None,'reward_code':None,
  'settlement_status':'unpaid','commission_amount':1.0,'commission_amount_cents':100,
  'settled_at':None,'redirected':False,'status':'success','risk_hit':[],
  'promo_session_id':None,'created_at':datetime.now(timezone.utc),
}).inserted_id
db.commission_logs.insert_one({
  'claim_id':claim_id,'staff_id':sid,'level':1,'amount':1.0,'amount_cents':100,
  'status':'approved','created_at':datetime.now(timezone.utc),
})
print(str(sid))
`).then ? null : null;
  const seed = mongoJson(`
s=db.staff_users.find_one({'username':'test_fin_${TS}'})
c=db.claims.find_one({'staff_id':s['_id']})
cl=db.commission_logs.find_one({'claim_id':c['_id']})
print(json.dumps({'sid':str(s['_id']),'cid':str(c['_id']),'log_status':cl['status']}))
`);
  record(results, "01 seed staff+claim+commission_log", !!seed.sid, seed);

  // Manual settle — must match full approved balance (1.00)
  const sr = await fetch(`${API}/api/admin/finance/manual-settle`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
    body: JSON.stringify({staff_id: seed.sid, amount: 1.0, remark: "e2e test"}),
  });
  const sj = await sr.json();
  record(results, "02 manual-settle API", sr.status===200, {status:sr.status, resp:sj});

  // Verify commission_logs transitioned to paid
  const after = mongoJson(`
import json
c=db.claims.find_one({'_id':ObjectId('${seed.cid}')})
cl=db.commission_logs.find_one({'claim_id':ObjectId('${seed.cid}')})
print(json.dumps({'claim_status':c.get('settlement_status'),'log_status':cl.get('status') if cl else None}))
`);
  record(results, "03 DB status paid", after.claim_status==="paid" && after.log_status==="paid", after);

  // Wrong amount should fail
  const badR = await fetch(`${API}/api/admin/finance/manual-settle`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
    body: JSON.stringify({staff_id: seed.sid, amount: 999, remark:"bad"}),
  });
  record(results, "04 reject mismatched amount", badR.status>=400, {status:badR.status});

  // Reconciliation endpoint
  const rc = await fetch(`${API}/api/admin/finance/reconciliation`, {headers:{Authorization:`Bearer ${token}`}});
  const rcJ = await rc.json();
  record(results, "05 reconciliation 200", rc.status===200, {keys:Object.keys(rcJ||{})});

  // CSV exports
  const e1 = await fetch(`${API}/api/admin/finance/export/commissions`, {headers:{Authorization:`Bearer ${token}`}});
  const e2 = await fetch(`${API}/api/admin/finance/export/withdrawals`, {headers:{Authorization:`Bearer ${token}`}});
  record(results, "06 CSV exports 200", e1.status===200 && e2.status===200, {commissions:e1.status, withdrawals:e2.status});

  // UI check
  const { browser, page, logs } = await launchBrowser();
  try {
    await adminLogin(page);
    await page.goto(`${BASE}/finance`, { waitUntil:"networkidle2" });
    await new Promise(r=>setTimeout(r,1500));
    await shot(page, "01-finance", FLOW);
    const on = await page.evaluate(()=>/finance|结算|佣金|commission|settle/i.test(document.body.innerText));
    record(results, "07 UI finance page renders", on);
    fs.writeFileSync(path.join(OUT,FLOW,"console-errors.json"), JSON.stringify(logs,null,2));
  } finally {
    await browser.close();
    writeResults(FLOW, results);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
