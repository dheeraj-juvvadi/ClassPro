const submitURL = 'https://sp.srmist.edu.in/srmiststudentportal/LoginServlet';

export async function submitThroughHttp(page, submit, log = () => {}) {
  let forwarded = false;
  let failure = null;
  const handler = async route => {
    const request = route.request();
    if (request.method() !== 'POST' || !request.isNavigationRequest()) {
      await route.continue();
      return;
    }
    if (forwarded) {
      failure = new Error('Duplicate portal submission blocked');
      await route.abort();
      return;
    }
    forwarded = true;
    try {
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30000 });
      log({ event: 'http_submission_transport', upstream_status: response.status(), forwarded_once: true });
      await route.fulfill({ response });
    } catch {
      failure = new Error('HTTP submission transport failed');
      log({ event: 'http_submission_transport', failed: true, forwarded_once: true });
      await route.abort();
    }
  };
  await page.route(submitURL, handler);
  try {
    await submit();
    if (failure) throw failure;
    if (!forwarded) throw new Error('Portal submission was not observed');
  } finally {
    await page.unroute(submitURL, handler);
  }
}
