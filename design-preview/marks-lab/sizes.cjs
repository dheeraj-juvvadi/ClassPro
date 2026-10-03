const {chromium}=require('../../portal-app/node_modules/playwright');
const assert=require('node:assert/strict');
const sharp=require('../../portal-app/node_modules/sharp');
const path=require('node:path');
const target=path.join(__dirname,'../screenshots');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const size of ['mini','compact','regular']){
   await page.goto(`http://127.0.0.1:4180/marks-lab/?style=strips&size=${size}`);
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('.assessments dt').count(),15);
   for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const clipped=await page.locator('.course h2,.course-total,.assessments dl>div').evaluateAll(es=>es.filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.textContent));
    assert.deepEqual(clipped,[]);
   }
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:path.join(target,`marks-${size}.png`)});
  }
  assert.deepEqual(errors,[]);
  const labels=['32px · Mini','44px · Compact','52px · Relaxed'];
  const top=Buffer.from(`<svg width="1266" height="960"><rect width="100%" height="100%" fill="#111511"/><g font-family="Arial,sans-serif"><text x="24" y="39" font-size="24" fill="#f1eee3">Smaller score tiles · same charcoal</text>${labels.map((l,i)=>`<text x="${24+414*i}" y="86" font-size="16" fill="#adb4a4">${l}</text>`).join('')}</g></svg>`);
  await sharp({create:{width:1266,height:960,channels:4,background:'#111511'}}).composite([{input:top,left:0,top:0},...['mini','compact','regular'].map((v,i)=>({input:path.join(target,`marks-${v}.png`),left:24+414*i,top:105}))]).png().toFile(path.join(target,'marks-sizes.png'));
  console.log('Three compact tile sizes passed at 320/390/430; screenshots ready.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
