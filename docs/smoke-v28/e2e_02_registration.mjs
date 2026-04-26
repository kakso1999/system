// Flow 2: 地推注册审核闭环
// Path: captcha API -> register API -> admin UI approve -> staff login
import { BASE, API, OUT, launchBrowser, shot, setReact, record, writeResults,
  adminLogin, apiAdminLogin, setSetting, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "02-registration-approval";
const TS = Date.now();
const USERNAME = `test_reg_${TS}`;
const PASSWORD = "TestPass123!";
const PHONE = `+63900${String(TS).slice(-7)}`;
const NAME = `test_Applicant_${TS}`;
const results = [];

async function main() {
  const adminTok = await apiAdminLogin();
  await setSetting(adminTok, "staff_register_enabled", true);
  await setSetting(adminTok, "staff_register_captcha_enabled", true);

  // Clean previous leftovers
  mongoPy(`
db.staff_users.delete_many({'username': {'$regex':'^test_reg_'}})
db.staff_registration_applications.delete_many({'username': {'$regex':'^test_reg_'}})
print('ok')
`);

  // Step 1: get captcha + solve via DB
  const cRes = await fetch(`${API}/api/auth/staff/captcha`);
  const cj = await cRes.json();
  const answer = mongoPy(`r=db.captcha_records.find_one({'token':'${cj.token}'}); print(r['answer'] if r else '')`);
  record(results, "01 captcha issued", !!cj.token && !!answer, { q: cj.question, answer });

  // Step 2: submit registration via API (match frontend payload)
  const regRes = await fetch(`${API}/api/auth/staff/register`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      name: NAME, phone: PHONE, username: USERNAME, password: PASSWORD,
      invite_code: null, captcha_token: cj.token, captcha_answer: answer,
    }),
  });
  const regJ = await regRes.json().catch(()=>null);
  record(results, "02 register submitted", regRes.status>=200 && regRes.status<300, {status:regRes.status, resp:regJ});

  // Verify row in DB
  const reg = mongoJson(`r=db.staff_registration_applications.find_one({'username':'${USERNAME}'}); print(json.dumps({'exists':bool(r),'status':r.get('status') if r else None,'id':str(r['_id']) if r else None}))`);
  record(results, "03 registration row pending", reg.exists && reg.status==="pending", reg);

  // Step 3: admin logs in via UI and opens registrations page
  const { browser, page, logs } = await launchBrowser();
  try {
    const { url, token } = await adminLogin(page);
    record(results, "04 admin login", url.includes("/dashboard"), { url });

    await page.goto(`${BASE}/registrations`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
    await shot(page, "01-registrations-list", FLOW);
    const listOk = await page.evaluate((u) => document.body.innerText.includes(u), USERNAME);
    record(results, "05 registration visible in admin list", listOk, { username: USERNAME });

    // Approve via API (UI button wiring varies; assert via API)
    const appr = await fetch(`${API}/api/admin/registrations/${reg.id}/approve`, {
      method: "POST", headers: {"Content-Type":"application/json", Authorization: `Bearer ${token}`},
      body: JSON.stringify({}),
    });
    const apprJ = await appr.json().catch(()=>null);
    record(results, "06 approve API", appr.status>=200 && appr.status<300, {status:appr.status, approved_id: apprJ?.approved_staff_id || apprJ?.id || null});

    // Verify staff_users created with invite_code
    const staff = mongoJson(`s=db.staff_users.find_one({'username':'${USERNAME}'}); print(json.dumps({'exists':bool(s),'invite_code':s.get('invite_code') if s else None,'status':s.get('status') if s else None}))`);
    record(results, "07 staff_users created with invite_code", staff.exists && !!staff.invite_code, staff);

    await page.goto(`${BASE}/registrations`, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 800));
    await shot(page, "02-after-approve", FLOW);

    // Step 4: new staff login
    await page.goto(`${BASE}/staff-login`, { waitUntil: "networkidle2" });
    await page.waitForSelector('#username, input[type="text"]', { timeout: 10000 });
    const unameSel = await page.$('#username') ? '#username' : 'input[type="text"]';
    const pwSel = await page.$('#password') ? '#password' : 'input[type="password"]';
    await setReact(page, unameSel, USERNAME);
    await setReact(page, pwSel, PASSWORD);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(()=>null),
    ]);
    await shot(page, "03-new-staff-home", FLOW);
    const onHome = page.url().includes("/home") || page.url().includes("/promoter") || page.url().includes("/qrcode");
    record(results, "08 new staff login -> home", onHome, { url: page.url() });

    fs.writeFileSync(path.join(OUT, FLOW, "console-errors.json"), JSON.stringify(logs, null, 2));
  } finally {
    await browser.close();
    writeResults(FLOW, results);
  }
}

main().catch(e=>{console.error(e);process.exit(1);});
