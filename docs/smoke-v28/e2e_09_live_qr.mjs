// Flow 9: Live QR + 3-digit PIN
import { BASE, API, OUT, launchBrowser, shot, record, writeResults,
  staffLogin, apiStaffLogin, apiAdminLogin, setSetting, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "09-live-qr-pin";
const USERNAME = "wstest1";
const PASSWORD = "Pass123!";
const results = [];

async function main() {
  const admTok = await apiAdminLogin();
  await setSetting(admTok, "live_qr_enabled", true);

  // Ensure promoting
  const sid = mongoPy(`s=db.staff_users.find_one({'invite_code':'NFPSSY'}); print(str(s['_id']))`);
  mongoPy(`
from datetime import datetime, timezone
db.staff_users.update_one({'_id':ObjectId('${sid}')},{'$set':{'work_status':'promoting','promotion_paused':False,'started_promoting_at':datetime.now(timezone.utc)}})
print('ok')
`);

  // Reset wstest1 password so we know it
  mongoPy(`
import bcrypt
pw=bcrypt.hashpw(b'Pass123!',bcrypt.gensalt()).decode()
db.staff_users.update_one({'_id':ObjectId('${sid}')},{'$set':{'password_hash':pw}})
print('ok')
`);

  const sTok = await apiStaffLogin(USERNAME, PASSWORD);
  record(results, "01 staff login", !!sTok);

  const vBefore = mongoPy(`print(db.staff_users.find_one({'_id':ObjectId('${sid}')}).get('qr_version'))`);

  // Call live-qr/generate
  const gr = await fetch(`${API}/api/promoter/live-qr/generate`, {method:"POST", headers:{Authorization:`Bearer ${sTok}`}});
  const gj = await gr.json();
  record(results, "02 live-qr/generate 200", gr.status===200 && /^\d{3}$/.test(gj.pin||""), {status:gr.status, pin:gj.pin, qr_version:gj.qr_version});

  const vAfter = mongoPy(`print(db.staff_users.find_one({'_id':ObjectId('${sid}')}).get('qr_version'))`);
  record(results, "03 qr_version incremented", parseInt(vAfter)>parseInt(vBefore), {before:vBefore, after:vAfter});

  // DB: active token row exists
  const tok = mongoJson(`t=db.promo_live_tokens.find_one({'staff_id':ObjectId('${sid}'),'status':'active'}); print(json.dumps({'exists':bool(t),'pin':t.get('pin') if t else None}))`);
  record(results, "04 promo_live_tokens active row", tok.exists && tok.pin===gj.pin, tok);

  // Rotate: generate again -> previous becomes 'rotated'
  const gr2 = await fetch(`${API}/api/promoter/live-qr/generate`, {method:"POST", headers:{Authorization:`Bearer ${sTok}`}});
  const gj2 = await gr2.json();
  const rotatedCount = mongoPy(`print(db.promo_live_tokens.count_documents({'staff_id':ObjectId('${sid}'),'status':'rotated'}))`);
  record(results, "05 rotate old tokens", gr2.status===200 && parseInt(rotatedCount)>=1, {pin2:gj2.pin, rotated:rotatedCount});

  // UI: open qrcode page
  const { browser, page, logs } = await launchBrowser();
  try {
    await staffLogin(page, USERNAME, PASSWORD);
    await page.goto(`${BASE}/qrcode`, { waitUntil:"networkidle2" });
    await new Promise(r=>setTimeout(r,1500));
    await shot(page, "01-qrcode", FLOW);
    const hasQR = await page.evaluate(()=> !!document.querySelector('svg[role="img"], canvas, img[alt*="QR" i], img[src*="qr" i]') || /QR|Code|PIN|\d{3}/i.test(document.body.innerText));
    record(results, "06 UI qrcode page renders", hasQR);
    fs.writeFileSync(path.join(OUT,FLOW,"console-errors.json"), JSON.stringify(logs,null,2));
  } finally {
    await browser.close();
  }

  // Restore live_qr_enabled=false
  await setSetting(admTok, "live_qr_enabled", false);
  writeResults(FLOW, results);
}
main().catch(e=>{console.error(e);process.exit(1);});
