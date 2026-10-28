import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9223;
const EVIDENCE_DIR = path.resolve('docs/evidence');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function run() {
  console.log('[CDP] Launching headless Chrome on port ' + DEBUG_PORT + '...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1440,900',
    'about:blank'
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
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

    await send('Page.enable');
    await send('Runtime.enable');

    console.log('[CDP] Navigating to http://localhost:5173...');
    await send('Page.navigate', { url: 'http://localhost:5173' });
    await new Promise((r) => setTimeout(r, 3000));

    // 1. Dashboard screenshot with role switcher
    const dashShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(EVIDENCE_DIR, '06_preview_role_switcher_and_cases.png'), Buffer.from(dashShot.data, 'base64'));
    console.log('[CDP] Saved 06_preview_role_switcher_and_cases.png');

    // 2. Open Submit FDR Modal
    await send('Runtime.evaluate', {
      expression: `
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Submit New FDR'));
        if (submitBtn) submitBtn.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Click Pre-fill
    await send('Runtime.evaluate', {
      expression: `
        const prefillBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pre-fill'));
        if (prefillBtn) prefillBtn.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1000));

    const submitModalShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(EVIDENCE_DIR, '07_preview_submit_modal.png'), Buffer.from(submitModalShot.data, 'base64'));
    console.log('[CDP] Saved 07_preview_submit_modal.png');

    // Close modal
    await send('Runtime.evaluate', {
      expression: `
        const closeBtn = document.querySelector('.modal-close-btn');
        if (closeBtn) closeBtn.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Open FDR-2026-006 (our persisted newly created & approved case)
    await send('Runtime.evaluate', {
      expression: `
        const row = Array.from(document.querySelectorAll('tr')).find(el => el.textContent.includes('FDR-2026-006') || el.textContent.includes('FDR-2026-001'));
        if (row) row.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Click Decision Gate tab
    await send('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('.subnav-btn')).find(el => el.textContent.includes('Decision Gate'));
        if (btn) btn.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1000));
    const gateShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(EVIDENCE_DIR, '08_preview_decision_gate_approved.png'), Buffer.from(gateShot.data, 'base64'));
    console.log('[CDP] Saved 08_preview_decision_gate_approved.png');

    // 4. Click Audit Trail tab
    await send('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('.subnav-btn')).find(el => el.textContent.includes('Audit Trail'));
        if (btn) btn.click();
      `
    });
    await new Promise((r) => setTimeout(r, 1000));
    const auditShot = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(EVIDENCE_DIR, '09_preview_audit_trail_timeline.png'), Buffer.from(auditShot.data, 'base64'));
    console.log('[CDP] Saved 09_preview_audit_trail_timeline.png');

    ws.close();
    console.log('[CDP] All preview screenshots captured successfully!');
  } finally {
    chrome.kill();
  }
}

run().catch((err) => {
  console.error('[CDP Error]', err);
  process.exit(1);
});
