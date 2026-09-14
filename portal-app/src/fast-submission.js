export async function forwardWithFastHttp(route) {
  const port = process.env.FAST_TRANSPORT_PORT || '3105';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid transport port');
  const request = route.request();
  const response = await fetch(`http://127.0.0.1:${port}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WORKER_TOKEN}` },
    body: JSON.stringify({ body: request.postData(), headers: await request.allHeaders() }),
    signal: AbortSignal.timeout(35000),
  });
  if (!response.ok) throw new Error('Go HTTP transport failed');
  const data = await response.json();
  if (!Number.isInteger(data.status) || data.status < 100 || data.status > 599 || typeof data.body !== 'string') throw new Error('Invalid transport response');
  await route.fulfill({ status: data.status, headers: data.headers, body: Buffer.from(data.body, 'base64') });
  return data.status;
}
