// Flow 3: 赞助商管理 (创建/上传 logo/启用/staff-login 下方显示)
import { BASE, API, OUT, launchBrowser, shot, record, writeResults,
  apiAdminLogin, mongoPy } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "03-sponsors";
const results = [];

async function main() {
  const token = await apiAdminLogin();
  const NAME = `test_sponsor_${Date.now()}`;

  mongoPy(`db.sponsors.delete_many({'name':{'$regex':'^test_sponsor_'}}); print('ok')`);

  // Create
  const cr = await fetch(`${API}/api/admin/sponsors/`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
    body: JSON.stringify({name:NAME, logo_url:"", link_url:"https://example.com/sp", enabled:true, sort_order:1}),
  });
  const cj = await cr.json();
  record(results, "01 create sponsor", cr.status===201, {status:cr.status, id:cj.id});
  const SID = cj.id;

  // Upload logo: generate minimal PNG (1x1 transparent)
  const png = Buffer.from("89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6300010000000500010D0A2DB40000000049454E44AE426082","hex");
  const fd = new FormData();
  fd.append("file", new Blob([png],{type:"image/png"}), "logo.png");
  const ur = await fetch(`${API}/api/admin/sponsors/${SID}/upload-logo`, {
    method:"POST", headers:{Authorization:`Bearer ${token}`}, body: fd,
  });
  const uj = await ur.json();
  record(results, "02 upload logo", ur.status===200 && /\/uploads\//.test(uj.logo_url||""), {status:ur.status, resp:uj});

  // Toggle to ensure enabled=true
  await fetch(`${API}/api/admin/sponsors/${SID}/toggle`, {method:"PUT",headers:{Authorization:`Bearer ${token}`}});
  mongoPy(`db.sponsors.update_one({'_id':ObjectId('${SID}')},{'$set':{'enabled':True}}); print('ok')`);

  // Public /api/sponsors/active should list it
  const pub = await fetch(`${API}/api/sponsors/active`);
  const pubJ = await pub.json();
  const found = (pubJ||[]).some(s=>s.name===NAME);
  record(results, "03 public /api/sponsors/active includes new", found, {count:(pubJ||[]).length});

  // UI: staff-login page should render sponsors carousel with our name (or its logo)
  const { browser, page, logs } = await launchBrowser();
  try {
    await page.goto(`${BASE}/staff-login`, { waitUntil:"networkidle2" });
    await new Promise(r=>setTimeout(r, 2000));
    await shot(page, "01-staff-login-sponsors", FLOW);
    const has = await page.evaluate((n)=> document.body.innerText.includes(n) || !!document.querySelector(`img[alt="${n}"]`), NAME);
    record(results, "04 UI sponsor visible on staff-login", has, {name:NAME});
    fs.writeFileSync(path.join(OUT,FLOW,"console-errors.json"), JSON.stringify(logs,null,2));
  } finally {
    await browser.close();
    writeResults(FLOW, results);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
