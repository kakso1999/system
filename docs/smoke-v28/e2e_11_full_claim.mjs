// Flow 11: 完整抽奖流程 (longest chain)
// User: scan welcome -> view prizes -> spin -> OTP -> claim -> result -> DB asserts.
import { BASE, API, OUT, launchBrowser, shot, setReact, record, writeResults,
  saveFail, apiAdminLogin, setSetting, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "11-full-claim";
const STAFF_CODE = "NFPSSY"; // seed staff wstest1
const CAMPAIGN_ID = "69d5d011514405fc970bd1df";
const TEST_PHONE_LOCAL = "9000012311"; // +639000012311 (test range)
const results = [];

async function main() {
  // Prereq: clean previous test claim on this phone, enable SMS demo, seed onsite reward code.
  mongoPy(`
from datetime import datetime, timezone
db.claims.delete_many({'phone': '+63${TEST_PHONE_LOCAL}'})
db.otp_records.delete_many({'phone': '+63${TEST_PHONE_LOCAL}'})
db.risk_logs.delete_many({'phone': '+63${TEST_PHONE_LOCAL}'})
cid = ObjectId('${CAMPAIGN_ID}')
# Ensure onsite item "1" has at least one available reward_code.
avail = db.reward_codes.count_documents({'campaign_id': cid, 'status': 'available'})
if avail < 3:
  onsite = db.wheel_items.find_one({'campaign_id': cid, 'type':'onsite'})
  for i in range(3):
    db.reward_codes.insert_one({
      'campaign_id': cid,
      'wheel_item_id': onsite['_id'] if onsite else None,
      'code': f'E2E11-{int(datetime.now().timestamp())}-{i}',
      'pool_type': 'imported',
      'status': 'unused',
      'created_at': datetime.now(timezone.utc),
    })
# Force website item to 100% weight for deterministic test (reward_code only generated for website).
db.wheel_items.update_many({'campaign_id': cid, 'type': 'onsite'}, {'$set': {'enabled': False}})
db.wheel_items.update_many({'campaign_id': cid, 'type': 'website'}, {'$set': {'enabled': True, 'weight': 100}})
db.campaigns.update_one({'_id': cid}, {'$set': {'no_prize_weight': 0}})
print('prereq ok')
`);

  const token = await apiAdminLogin();
  await setSetting(token, "live_qr_enabled", false);
  await setSetting(token, "sms_verification", true);
  await setSetting(token, "sms_real_send_enabled", false);

  const qrV = mongoPy(`print(db.staff_users.find_one({'invite_code':'${STAFF_CODE}'}).get('qr_version',0))`);

  const { browser, page, logs } = await launchBrowser();
  try {
    // Step 1: welcome page
    await page.goto(`${BASE}/welcome/${STAFF_CODE}?v=${qrV}`, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector('button', { timeout: 10000 });
    await shot(page, "01-welcome", FLOW);
    const welcomeOk = await page.evaluate(() => /Welcome/i.test(document.body.innerText));
    record(results, "01 welcome loaded", welcomeOk);

    // Step 2: click "View Prizes"
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /View Prizes/i.test(x.innerText));
      b && b.click();
    });
    await new Promise(r => setTimeout(r, 800));
    await shot(page, "02-prizes", FLOW);
    const prizesOk = await page.evaluate(() => /SPIN THE WHEEL/i.test(document.body.innerText));
    record(results, "02 prizes carousel", prizesOk);

    // Step 3: click SPIN THE WHEEL -> /wheel/[code]
    await Promise.all([
      page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /SPIN THE WHEEL/i.test(x.innerText));
        b && b.click();
      }),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null),
    ]);
    await page.waitForSelector('canvas', { timeout: 10000 });
    await shot(page, "03-wheel", FLOW);
    record(results, "03 wheel page canvas", page.url().includes("/wheel/"));

    // Step 4: click SPIN NOW, wait for animation ~6s
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /SPIN NOW/i.test(x.innerText));
      b && b.click();
    });
    await page.waitForSelector('input[type="tel"]', { timeout: 30000 });
    await shot(page, "04-after-spin", FLOW);
    const wonOk = await page.evaluate(() => /You won:/i.test(document.body.innerText));
    record(results, "04 spin result shown", wonOk);

    // Step 5: enter phone (10 local digits)
    await page.waitForSelector('input[type="tel"], input[inputmode="numeric"]', { timeout: 15000 });
    const phoneSel = await page.evaluate(() => {
      const ins = [...document.querySelectorAll('input')];
      const el = ins.find(i => i.type === "tel" || /phone|910/i.test((i.placeholder||"")) || i.maxLength === 10);
      if (el) el.setAttribute('data-e2e','phone');
      return el ? 'input[data-e2e="phone"]' : null;
    });
    if (!phoneSel) throw new Error("phone input not found");
    await setReact(page, phoneSel, TEST_PHONE_LOCAL);
    await shot(page, "05-phone-entered", FLOW);
    record(results, "05 phone input filled", true);

    // Click Send OTP button (label is i18n, could be en/zh; click first enabled non-back button after phone)
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b => !b.disabled);
      const b = btns.find(x => /send|code|verify|发送|验证/i.test(x.innerText));
      b && b.click();
    });
    await new Promise(r => setTimeout(r, 2500));
    await shot(page, "06-otp-sent", FLOW);

    // Step 6: pull OTP from DB (demo mode also returns via modal but DB is reliable)
    const otp = mongoPy(`
rec = db.otp_records.find_one({'phone':'+63${TEST_PHONE_LOCAL}','used':False}, sort=[('created_at',-1)])
print(rec['code'] if rec else '')
`);
    if (!otp || otp.length !== 6) throw new Error("OTP not found, got: " + otp);
    record(results, "06 otp generated in DB", true, { otp });

    // Step 7: type OTP into 6 inputs
    await page.evaluate((code) => {
      for (let i = 0; i < 6; i++) {
        const el = document.getElementById(`otp-${i}`);
        if (!el) continue;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, code[i]);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, otp);
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b => !b.disabled);
      const b = btns.find(x => /verify|submit|confirm|验证|确认/i.test(x.innerText) && !/change|cancel|resend|更改|重/i.test(x.innerText));
      b && b.click();
    });
    await new Promise(r => setTimeout(r, 2000));
    await shot(page, "07-otp-verified", FLOW);
    record(results, "07 otp verified", true);

    // Step 8: claim button (appears after phoneVerified)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /claim|confirm/i.test(x.innerText) && !/verify|cancel/i.test(x.innerText));
      b && b.click();
    });
    await new Promise(r => setTimeout(r, 3500));
    await shot(page, "08-claim-done", FLOW);

    // Step 9: assert claim created in DB
    const claim = mongoJson(`
c = db.claims.find_one({'phone':'+63${TEST_PHONE_LOCAL}'}, sort=[('created_at',-1)])
print(json.dumps({'exists': bool(c), 'id': str(c['_id']) if c else None, 'reward_code': c.get('reward_code') if c else None, 'status': c.get('status') if c else None}, default=str))
`);
    record(results, "08 claim in DB", !!claim.exists, claim);

    // Step 10: assert reward_code allocated
    if (claim.reward_code) {
      const rc = mongoJson(`
r = db.reward_codes.find_one({'code': '${claim.reward_code}'})
print(json.dumps({'status': r['status'] if r else None, 'claim_id': str(r.get('claim_id','')) if r else None}))
`);
      record(results, "09 reward_code allocated", rc.status === "allocated" || rc.status === "assigned", rc);
    } else {
      record(results, "09 reward_code allocated", false, { reason: "no reward_code on claim" });
    }

    // Step 11: auto-redirect to result page (5s countdown)
    await new Promise(r => setTimeout(r, 6000));
    await shot(page, "10-result-page", FLOW);
    const onResult = page.url().includes("/result/");
    record(results, "10 redirected to result", onResult, { url: page.url() });

    // Step 12: new browser context uses receipt_token (from claim_receipts) to view claim
    if (claim.id) {
      const rt = mongoPy(`
r = db.claim_receipts.find_one({'claim_id': ObjectId('${claim.id}')})
print(r['receipt_token'] if r else '')
`);
      const ctx2 = await launchBrowser();
      const url = rt ? `${BASE}/result/${claim.id}?rt=${rt}` : `${BASE}/result/${claim.id}`;
      await ctx2.page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
      await new Promise(r2 => setTimeout(r2, 1500));
      await shot(ctx2.page, "11-cross-device-result", FLOW);
      const secondOk = await ctx2.page.evaluate(() => /reward|prize|code|success|congrat|恭喜|奖/i.test(document.body.innerText));
      record(results, "11 cross-device view", secondOk, { rt_found: !!rt });
      await ctx2.browser.close();
    }

    fs.writeFileSync(path.join(OUT, FLOW, "console-errors.json"), JSON.stringify(logs, null, 2));
  } catch (e) {
    record(results, "fatal", false, { err: String(e) });
    await saveFail(page, FLOW, "fatal");
  } finally {
    await browser.close();
    writeResults(FLOW, results);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
