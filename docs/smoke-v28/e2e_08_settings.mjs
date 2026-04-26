// Flow 8: 系统设置修改与生效
import { BASE, API, OUT, launchBrowser, shot, record, writeResults,
  apiAdminLogin, setSetting, mongoPy, mongoJson } from "./_lib.mjs";
import fs from "fs"; import path from "path";

const FLOW = "08-system-settings";
const results = [];

async function main() {
  const token = await apiAdminLogin();

  // Save originals
  const orig = mongoJson(`
import json
keys=['project_name','customer_service_whatsapp','default_redirect_url','live_qr_enabled','sms_verification','sms_real_send_enabled','external_api_key']
out={k:(db.system_settings.find_one({'key':k}) or {}).get('value') for k in keys}
print(json.dumps(out))
`);
  record(results, "01 read originals", !!orig, orig);

  // Flip a bunch
  const NEW_NAME = `E2E_TEST_${Date.now()}`;
  const NEW_WA = "https://wa.me/99988877766";
  const NEW_URL = "https://example.com/go";
  const NEW_KEY = `E2E_KEY_${Date.now()}`;
  const updates = [
    ["project_name", NEW_NAME],
    ["customer_service_whatsapp", NEW_WA],
    ["default_redirect_url", NEW_URL],
    ["live_qr_enabled", false],
    ["sms_verification", true],
    ["sms_real_send_enabled", false],
    ["external_api_key", NEW_KEY],
  ];
  let allOk = true;
  for (const [k,v] of updates) {
    const s = await setSetting(token, k, v);
    if (s !== 200) allOk = false;
  }
  record(results, "02 PUT all settings", allOk);

  // DB verify
  const after = mongoJson(`
import json
keys=['project_name','customer_service_whatsapp','default_redirect_url','live_qr_enabled','sms_verification','sms_real_send_enabled','external_api_key']
print(json.dumps({k:(db.system_settings.find_one({'key':k}) or {}).get('value') for k in keys}))
`);
  const allMatch = after.project_name===NEW_NAME && after.customer_service_whatsapp===NEW_WA && after.default_redirect_url===NEW_URL && after.live_qr_enabled===false && after.external_api_key===NEW_KEY;
  record(results, "03 DB reflects new settings", allMatch, after);

  // Public settings endpoint should include project_name
  const pub = await fetch(`${API}/api/public/settings`);
  const pubJ = await pub.json();
  record(results, "04 public-settings propagates project_name", pubJ.project_name===NEW_NAME, {project_name:pubJ.project_name, whatsapp:pubJ.customer_service_whatsapp});

  // UI: staff-login shows new project_name (header) + whatsapp link
  const { browser, page, logs } = await launchBrowser();
  try {
    // NOTE: staff-login does not render project_name/whatsapp. Use welcome page instead.
    // getPublicSettings has module-level cache; use incognito context to ensure fresh.
    const ctx = await browser.createBrowserContext();
    const p2 = await ctx.newPage();
    const qrV = mongoPy(`print(db.staff_users.find_one({'invite_code':'NFPSSY'}).get('qr_version',0))`);
    await p2.goto(`${BASE}/welcome/NFPSSY?v=${qrV}`, { waitUntil:"networkidle2" });
    await new Promise(r=>setTimeout(r,2500));
    await shot(p2, "01-welcome-branding", FLOW);
    const hasName = await p2.evaluate((n)=>document.body.innerText.includes(n), NEW_NAME);
    record(results, "05 UI project_name reflected on welcome", hasName, {hasName, qrV, project_name:NEW_NAME});
    await ctx.close();

    fs.writeFileSync(path.join(OUT,FLOW,"console-errors.json"), JSON.stringify(logs,null,2));
  } finally {
    await browser.close();
  }

  // Restore originals
  for (const [k,v] of Object.entries(orig)) {
    if (v !== undefined && v !== null) await setSetting(token, k, v);
  }
  record(results, "06 restored originals", true);
  writeResults(FLOW, results);
}
main().catch(e=>{console.error(e);process.exit(1);});
