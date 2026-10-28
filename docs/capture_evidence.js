import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9222;
const EVIDENCE_DIR = path.resolve('docs/evidence');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function run() {
  console.log('[CDP] Launching headless Chrome...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1440,900',
    'about:blank'
  ]);

  // Wait 1.5s for port to open
  await new Promise((r) => setTimeout(r, 1500));

  try {
    // Open new tab
    const newTabRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new`, { method: 'PUT' });
    const target = await newTabRes.json();
    const wsUrl = target.webSocketDebuggerUrl;
    console.log('[CDP] Connecting to page target:', wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === msgId) {
            ws.removeEventListener('message', handler);
            if (data.error) reject(data.error);
            else resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    // Enable Page & Runtime
    await send('Page.enable');
    await send('Runtime.enable');

    // Navigate to live app
    console.log('[CDP] Navigating to https://kosh-pramaan.vercel.app...');
    await send('Page.navigate', { url: 'https://kosh-pramaan.vercel.app' });
    await new Promise((r) => setTimeout(r, 3000));

    // 1. Dashboard screenshot
    const dashShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(EVIDENCE_DIR, '01_executive_dashboard.png'), Buffer.from(dashShot.data, 'base64'));
    console.log('[CDP] Saved 01_executive_dashboard.png');

    // 2. Click FDR Cases tab
    await send('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('.nav-item')).find(el => el.textContent.includes('FDR Cases'));
        if (btn) btn.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1500));
    const casesShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(EVIDENCE_DIR, '02_fdr_inventory_table.png'), Buffer.from(casesShot.data, 'base64'));
    console.log('[CDP] Saved 02_fdr_inventory_table.png');

    // 3. Click FDR-2026-002 row to open modal
    await send('Runtime.evaluate', {
      expression: `
        const row = Array.from(document.querySelectorAll('tr')).find(el => el.textContent.includes('FDR-2026-002'));
        if (row) row.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1500));
    const modalShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(EVIDENCE_DIR, '03_mismatch_verification_modal.png'), Buffer.from(modalShot.data, 'base64'));
    console.log('[CDP] Saved 03_mismatch_verification_modal.png');

    // 4. Click Decision Gate tab
    await send('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('.subnav-btn')).find(el => el.textContent.includes('Decision Gate'));
        if (btn) btn.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Type rationale and attempt approval
    await send('Runtime.evaluate', {
      expression: `
        const textarea = document.querySelector('textarea');
        if (textarea) {
          textarea.value = 'Attempting administrative approval during SIH audit test.';
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      `
    });
    await new Promise((r) => setTimeout(r, 2000));
    const gateShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(EVIDENCE_DIR, '04_decision_gate_violation_422.png'), Buffer.from(gateShot.data, 'base64'));
    console.log('[CDP] Saved 04_decision_gate_violation_422.png');

    // 5. Click Audit Replay tab
    await send('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('.subnav-btn')).find(el => el.textContent.includes('Audit Trail'));
        if (btn) btn.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1500));
    const auditShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(EVIDENCE_DIR, '05_audit_replay_timeline.png'), Buffer.from(auditShot.data, 'base64'));
    console.log('[CDP] Saved 05_audit_replay_timeline.png');

    ws.close();
    console.log('[CDP] Automation complete. All evidence captured!');
  } finally {
    chrome.kill();
  }
}

run().catch((err) => {
  console.error('[CDP Error]', err);
  process.exit(1);
});
