export function classifyPortalText(text) {
  if (/concurrent|maximum.*session|session.*limit/i.test(text)) return 'SESSION_LIMIT';
  if (/invalid captcha|captcha[^\n]*(?:incorrect|mismatch|invalid|expired)/i.test(text)) return 'CAPTCHA_INVALID';
  if (/net\s*id should not be empty/i.test(text)) return 'PORTAL_FORM_REJECTED';
  if (/invalid (?:user\s*name|net\s*id|password|credentials)|incorrect password/i.test(text)) return 'LOGIN_REJECTED';
  if (/access denied|request blocked|forbidden|security violation/i.test(text)) return 'PORTAL_ACCESS_REJECTED';
  return 'LOGIN_FAILED';
}

export async function inspectPortalResponse(page) {
  const evidence = await page.evaluate(() => {
    const visible = element => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
    const excluded = '.invalid-feedback, script, style, noscript, input, textarea, select';
    const copyText = element => {
      const copy = element.cloneNode(true);
      copy.querySelectorAll(excluded).forEach(node => node.remove());
      return copy.textContent.replace(/\s+/g, ' ').slice(0, 12000);
    };
    const alerts = [...document.querySelectorAll('[role="alert"], .alert, .alert-danger, .alert-warning')]
      .filter(visible).map(copyText).filter(text => text.trim());
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const lines = [];
    let current;
    while ((current = walker.nextNode()) && lines.join('').length < 12000) {
      const parent = current.parentElement;
      if (parent && !parent.closest(excluded) && visible(parent)) lines.push(current.textContent);
    }
    return { alertText: alerts.join('\n'), text: lines.join('\n'), alertCount: alerts.length,
      dashboard: Boolean(document.querySelector('#userHomePage #hdnFormId')) && !document.querySelector('#login_form') };
  });
  return {
    dashboard: evidence.dashboard,
    alert_count: evidence.alertCount,
    classification_source: evidence.alertCount ? 'visible_alert' : 'visible_text_without_validation',
    code: classifyPortalText(evidence.alertCount ? evidence.alertText : evidence.text),
  };
}

export async function verifyProtectedPage(page, evidence, log = () => {}) {
  if (evidence.dashboard) return true;
  if (evidence.code !== 'LOGIN_FAILED') return false;
  const target = 'https://sp.srmist.edu.in/srmiststudentportal/students/template/HRDSystem.jsp';
  try {
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const authenticated = response?.status() === 200
      && new URL(page.url()).origin === new URL(target).origin
      && await page.locator('#userHomePage #hdnFormId').count() > 0
      && await page.locator('#login_form').count() === 0;
    log({ event: 'protected_page_check', status: response?.status() || null, authenticated });
    return authenticated;
  } catch {
    log({ event: 'protected_page_check', authenticated: false, failed: true });
    return false;
  }
}
