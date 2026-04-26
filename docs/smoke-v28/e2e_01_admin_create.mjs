// Flow 1: 新增管理员账户 + 首次登录改密
import { BASE, API, OUT, launchBrowser, shot, setReact, record, writeResults,
  adminLogin, apiAdminLogin, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "01-admin-create";
const results = [];

async function main() {
  const token = await apiAdminLogin();
  const UNAME = `test_admin_${Date.now()}`;
  const TEMP = "TempPass123!";
  const NEW = "NewPass456!";

  mongoPy(`db.admins.delete_many({'username':{'$regex':'^test_admin_'}}); print('ok')`);

  // Create admin via API
  const cr = await fetch(`${API}/api/admin/admins/`, {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
    body: JSON.stringify({username:UNAME,password:TEMP,display_name:"Test Admin",role:"admin",status:"active",must_change_password:true}),
  });
  const cj = await cr.json();
  record(results, "01 create admin API", cr.status===201, {status:cr.status, id:cj.id, username:cj.username});

  const row = mongoJson(`r=db.admins.find_one({'username':'${UNAME}'}); print(json.dumps({'exists':bool(r),'must_change':r.get('must_change_password') if r else None,'role':r.get('role') if r else None}))`);
  record(results, "02 DB admin row created", row.exists && row.must_change===true && row.role==="admin", row);

  // UI: verify new admin in list
  const { browser, page, logs } = await launchBrowser();
  try {
    await adminLogin(page);
    await page.goto(`${BASE}/admins`, { waitUntil:"networkidle2" });
    await new Promise(r=>setTimeout(r,1200));
    await shot(page, "01-admins-list", FLOW);
    const listed = await page.evaluate((n)=>document.body.innerText.includes(n), UNAME);
    record(results, "03 UI shows new admin", listed);

    // Logout and login as new admin
    await page.goto(`${BASE}/admin-login`, { waitUntil:"networkidle2" });
    // Clear cookies to force re-login
    const ctx = await browser.createBrowserContext().catch(()=>null);
    const page2 = ctx ? await ctx.newPage() : page;
    await page2.goto(`${BASE}/admin-login`, { waitUntil:"networkidle2" });
    await page2.waitForSelector('#username');
    await setReact(page2, '#username', UNAME);
    await setReact(page2, '#password', TEMP);
    await Promise.all([
      page2.click('button[type="submit"]'),
      new Promise(r=>setTimeout(r,3000)),
    ]);
    await shot(page2, "02-new-admin-login", FLOW);
    // Should show password change prompt
    const mustChange = await page2.evaluate(()=>/新密码|new password|change password|修改密码/i.test(document.body.innerText));
    record(results, "04 new admin login prompts password change", mustChange, {url:page2.url()});

    // Fill new password via UI
    const confirmExists = await page2.waitForSelector('#confirm-password', {timeout:5000}).catch(()=>null);
    if (confirmExists) {
      await setReact(page2, '#new-password', NEW);
      await setReact(page2, '#confirm-password', NEW);
      // Click the exact submit button within the password change form
      await page2.evaluate(() => {
        const btns = [...document.querySelectorAll('button[type="submit"]')];
        const b = btns.find(x => /确认|修改|change/i.test(x.innerText));
        b && b.click();
      });
      await new Promise(r=>setTimeout(r, 4000));
      await shot(page2, "03-after-change", FLOW);
      const onDash = page2.url().includes("/dashboard");
      record(results, "05 password changed -> dashboard", onDash, {url:page2.url()});

      const after = mongoJson(`r=db.admins.find_one({'username':'${UNAME}'}); print(json.dumps({'must_change':r.get('must_change_password')}))`);
      record(results, "06 DB must_change_password=false (after fix)", after.must_change===false, after);
    } else {
      record(results, "05 password change UI", false, {reason:"confirm-password not found"});
    }

    fs.writeFileSync(path.join(OUT,FLOW,"console-errors.json"), JSON.stringify(logs,null,2));
  } finally {
    await browser.close();
    writeResults(FLOW, results);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
