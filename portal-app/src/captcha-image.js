export async function readCaptchaImage(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector('#secure_captcha');
    return image?.complete && image.naturalWidth > 0
      && (image.currentSrc.startsWith('blob:') || image.currentSrc.startsWith('data:image/'));
  });
  const result = await page.evaluate(async () => {
    const image = document.querySelector('#secure_captcha');
    const source = image?.currentSrc;
    if (!source || !(source.startsWith('blob:') || source.startsWith('data:image/'))) return null;
    const response = await fetch(source, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size > 262144 || !['image/png', 'image/jpeg'].includes(blob.type)) return null;
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  });
  if (typeof result !== 'string' || result.length > 350000 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(result)) {
    throw new Error('Student Portal verification image unavailable');
  }
  return result;
}
