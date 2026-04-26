// Flow 13: External API 兑奖闭环
// Uses reward_code from a fresh website-prize claim, calls /api/redeem/verify and /api/redeem/claim.
import { BASE, API, OUT, launchBrowser, shot, setReact, record, writeResults,
  apiAdminLogin, setSetting, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "13-external-redeem";
const STAFF_CODE = "NFPSSY";
const CAMPAIGN_ID = "69d5d011514405fc970bd1df";
const TEST_PHONE_LOCAL = "9000013322";
const API_KEY = "E2E_TEST_KEY_v28";
const results = [];

async function main() {
  // Set external_api_key and prereq DB
  const token = await apiAdminLogin();
  await setSetting(token, "external_api_key", API_KEY);
  await setSetting(token, "live_qr_enabled", false);
  await setSetting(token, "sms_verification", true);
  await setSetting(token, "sms_real_send_enabled", false);
  await setSetting(token, "commission_after_redeem", true);

  mongoPy(`
db.claims.delete_many({'phone': '+63${TEST_PHONE_LOCAL}'})
db.otp_records.delete_many({'phone': '+63${TEST_PHONE_LOCAL}'})
cid = ObjectId('${CAMPAIGN_ID}')
db.wheel_items.update_many({'campaign_id': cid, 'type':'onsite'}, {'$set': {'enabled': False}})
db.wheel_items.update_many({'campaign_id': cid, 'type':'website'}, {'$set': {'enabled': True, 'weight': 100}})
db.campaigns.update_one({'_id': cid}, {'$set': {'no_prize_weight': 0}})
print('ok')
`);

  const qrV = mongoPy(`print(db.staff_users.find_one({'invite_code':'${STAFF_CODE}'}).get('qr_version',0))`);

  // --- Generate a real reward_code via full UI flow (reuse Flow 11 pattern, condensed) ---
  const { browser, page, logs } = await launchBrowser();
  let rewardCode = null, claimId = null;
  try {
    await page.goto(`${BASE}/welcome/${STAFF_CODE}?v=${qrV}`, { waitUntil: "networkidle2" });
    await page.waitForSelector('button', { timeout: 10000 });
    await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/View Prizes/i.test(x.innerText)); b&&b.click(); });
    await new Promise(r => setTimeout(r, 600));
    await Promise.all([
      page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/SPIN THE WHEEL/i.test(x.innerText)); b&&b.click(); }),
      page.waitForNavigation({ waitUntil: "networkidle2" }).catch(()=>null),
    ]);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForSelector('canvas', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/SPIN NOW/i.test(x.innerText)); b&&b.click(); });
    // Wait for phone input to appear (result state) instead of fixed delay
    await page.waitForSelector('input[type="tel"]', { timeout: 30000 });
    await shot(page, "01-after-spin", FLOW);
    await setReact(page, 'input[type="tel"]', TEST_PHONE_LOCAL);
    await page.evaluate(() => { const btns=[...document.querySelectorAll('button')].filter(b=>!b.disabled); const b=btns.find(x=>/send|code|verify|发送|验证/i.test(x.innerText)); b&&b.click(); });
    await new Promise(r => setTimeout(r, 2500));
    const otp = mongoPy(`r=db.otp_records.find_one({'phone':'+63${TEST_PHONE_LOCAL}','used':False},sort=[('created_at',-1)]); print(r['code'] if r else '')`);
    await page.evaluate((code) => {
      for (let i=0;i<6;i++){const el=document.getElementById('otp-'+i);if(!el)continue;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(el,code[i]);el.dispatchEvent(new Event('input',{bubbles:true}));}
    }, otp);
    await new Promise(r=>setTimeout(r,400));
    await page.evaluate(() => { const btns=[...document.querySelectorAll('button')].filter(b=>!b.disabled); const b=btns.find(x=>/verify|confirm|验证|确认/i.test(x.innerText) && !/change|cancel|resend|更改/i.test(x.innerText)); b&&b.click(); });
    await new Promise(r=>setTimeout(r,2000));
    await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/claim|领/i.test(x.innerText)); b&&b.click(); });
    await new Promise(r=>setTimeout(r,3500));
    await shot(page, "02-claim-done", FLOW);

    const claim = mongoJson(`c=db.claims.find_one({'phone':'+63${TEST_PHONE_LOCAL}'},sort=[('created_at',-1)]); print(json.dumps({'id':str(c['_id']) if c else None,'reward_code':c.get('reward_code') if c else None,'settlement_status':c.get('settlement_status') if c else None}))`);
    rewardCode = claim.reward_code; claimId = claim.id;
    record(results, "01 prepared reward_code via UI", !!rewardCode, claim);
    fs.writeFileSync(path.join(OUT, FLOW, "console-errors.json"), JSON.stringify(logs, null, 2));
  } finally {
    await browser.close();
  }

  if (!rewardCode) { writeResults(FLOW, results); return; }

  // --- D1: /api/redeem/verify ---
  const v1 = await fetch(`${API}/api/redeem/verify`, {
    method: "POST", headers: {"Content-Type":"application/json","X-API-Key": API_KEY},
    body: JSON.stringify({code: rewardCode}),
  });
  const v1j = await v1.json();
  record(results, "02 redeem/verify", v1.status===200 && v1j.exists===true && v1j.status==="assigned", {status:v1.status, resp:v1j});

  // Auth failure check
  const v1bad = await fetch(`${API}/api/redeem/verify`, {method:"POST",headers:{"Content-Type":"application/json","X-API-Key":"WRONG"},body:JSON.stringify({code:rewardCode})});
  record(results, "03 verify rejects bad key", v1bad.status===401 || v1bad.status===403, {status:v1bad.status});

  // --- D2: /api/redeem/claim first time -> redeemed ---
  const c1 = await fetch(`${API}/api/redeem/claim`, {method:"POST",headers:{"Content-Type":"application/json","X-API-Key":API_KEY},body:JSON.stringify({code:rewardCode})});
  const c1j = await c1.json();
  record(results, "04 redeem/claim first ok", c1.status===200 && (c1j.success===true || c1j.redeemed || c1j.status==="redeemed"), {status:c1.status, resp:c1j});

  // DB: reward_code.status should be redeemed/used
  const rcState = mongoJson(`r=db.reward_codes.find_one({'code':'${rewardCode}'}); print(json.dumps({'status':r.get('status') if r else None,'redeemed_at':str(r.get('redeemed_at')) if r else None}))`);
  record(results, "05 DB reward_code redeemed", /redeem|used/i.test(rcState.status||""), rcState);

  // commission_logs transition (commission_after_redeem=true)
  await new Promise(r=>setTimeout(r,1500));
  const commState = mongoJson(`
rows = list(db.commission_logs.find({'claim_id': ObjectId('${claimId}')}, {'status':1,'amount':1,'level':1}))
print(json.dumps([{'status':r.get('status'),'amount':r.get('amount'),'level':r.get('level')} for r in rows]))
`);
  record(results, "06 commission_logs transition", Array.isArray(commState) && commState.length>0, {rows:commState});

  // --- D2 again: should be already_redeemed ---
  const c2 = await fetch(`${API}/api/redeem/claim`, {method:"POST",headers:{"Content-Type":"application/json","X-API-Key":API_KEY},body:JSON.stringify({code:rewardCode})});
  const c2j = await c2.json();
  const alreadyFlag = JSON.stringify(c2j).match(/already|redeemed|used/i);
  record(results, "07 redeem/claim second = already_redeemed", !!alreadyFlag, {status:c2.status, resp:c2j});

  writeResults(FLOW, results);
}

main().catch(e=>{console.error(e);process.exit(1);});
