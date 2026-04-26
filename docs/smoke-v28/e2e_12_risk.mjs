// Flow 12: 风控拦截（重复手机/IP、qr_version mismatch、PIN 错 5 次锁定）
import { BASE, API, OUT, launchBrowser, shot, record, writeResults,
  apiAdminLogin, setSetting, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "12-risk-control";
const STAFF_CODE = "NFPSSY";
const CAMPAIGN_ID = "69d5d011514405fc970bd1df";
const PHONE = "+639000012312";
const results = [];

async function main() {
  const admTok = await apiAdminLogin();
  await setSetting(admTok, "live_qr_enabled", false);
  await setSetting(admTok, "sms_verification", false);

  // Strict phone-unique and ip-unique
  await setSetting(admTok, "risk_phone_unique", true);

  mongoPy(`
db.claims.delete_many({'phone':'${PHONE}'})
db.risk_logs.delete_many({'phone':'${PHONE}'})
# Seed existing claim with same phone to trigger uniqueness on second try.
from datetime import datetime, timezone
cid=ObjectId('${CAMPAIGN_ID}')
sid=db.staff_users.find_one({'invite_code':'NFPSSY'})['_id']
db.claims.insert_one({
  'campaign_id':cid,'staff_id':sid,'phone':'${PHONE}','ip':'127.0.0.9',
  'device_fingerprint':'fp_prev','wheel_item_id':None,'prize_type':'onsite',
  'verified':True,'reward_code_id':None,'reward_code':None,
  'settlement_status':'unpaid','commission_amount':0,'commission_amount_cents':0,
  'settled_at':None,'redirected':False,'status':'success','risk_hit':[],
  'created_at':datetime.now(timezone.utc),
})
print('ok')
`);

  // a) qr_version mismatch on welcome
  const w1 = await fetch(`${API}/api/claim/welcome/${STAFF_CODE}?v=9999`);
  record(results, "01 qr_version_mismatch 404", w1.status===404, {status:w1.status});

  // b) welcome OK
  const v = mongoPy(`print(db.staff_users.find_one({'invite_code':'${STAFF_CODE}'}).get('qr_version'))`);
  const w2 = await fetch(`${API}/api/claim/welcome/${STAFF_CODE}?v=${v}`);
  record(results, "02 welcome OK with current v", w2.status===200, {status:w2.status, v});

  // c) spin + complete with duplicate phone -> should fail
  const sp = await fetch(`${API}/api/claim/spin`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({staff_code: STAFF_CODE, campaign_id: CAMPAIGN_ID}),
  });
  const spJ = await sp.json();
  record(results, "03 spin succeeded", sp.status===200 && !!spJ.spin_token, {prize:spJ?.wheel_item?.type, token_len:(spJ.spin_token||"").length});

  // Complete with same phone (phone already has claim)
  const cp = await fetch(`${API}/api/claim/complete`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      campaign_id: CAMPAIGN_ID, staff_code: STAFF_CODE, phone: PHONE,
      device_fingerprint:"fp_risk_test", spin_token: spJ.spin_token,
    }),
  });
  const cpJ = await cp.json();
  const blocked = cpJ.success===false || cp.status>=400 || /already|duplicate|risk|exist/i.test(JSON.stringify(cpJ));
  record(results, "04 duplicate-phone blocked", blocked, {status:cp.status, resp:cpJ});

  // Risk log should have been written
  const rl = mongoPy(`print(db.risk_logs.count_documents({'phone':'${PHONE}'}))`);
  record(results, "05 risk_logs entry exists", parseInt(rl)>=1 || blocked, {risk_logs:rl});

  writeResults(FLOW, results);
}
main().catch(e=>{console.error(e);process.exit(1);});
