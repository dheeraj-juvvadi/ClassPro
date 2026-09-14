const submitURL = 'https://sp.srmist.edu.in/srmiststudentportal/LoginServlet';

export async function submitThroughHttp(page, submit, log = () => {}, forward) {
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
      let status;
      if (forward) {
        status = await forward(route);
      } else {
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30000 });
        status = response.status();
        await route.fulfill({ response });
      }
      log({ event: 'http_submission_transport', transport: forward ? 'fasthttp' : 'playwright', upstream_status: status, forwarded_once: true });
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
