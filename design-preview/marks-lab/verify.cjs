const {chromium}=require('../../portal-app/node_modules/playwright');
const assert=require('node:assert/strict');
const sharp=require('../../portal-app/node_modules/sharp');
const fs=require('node:fs');
const path=require('node:path');
const target=path.join(__dirname,'../screenshots');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const errors=[];const geometry=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const variant of ['cards','ledger','strips']){
   await page.goto(`http://127.0.0.1:4180/marks-lab/?style=${variant}`);
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('.assessments dt').count(),15);
   assert.equal(await page.locator('.score-pending').count(),3);
   assert.equal(await page.locator('.score-zero').count(),1);
   for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    const result=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
     clipped:[...document.querySelectorAll('.course h2,.course-total,.assessments dl>div,.assessments dd')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.textContent.trim()),
     heights:[...document.querySelectorAll('.assessments dl>div')].map(e=>e.getBoundingClientRect().height)}));
    geometry.push({variant,...result});assert.equal(result.overflow,false);assert.deepEqual(result.clipped,[]);
   }
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:path.join(target,`marks-${variant}.png`)});
   await page.screenshot({path:path.join(target,`marks-${variant}-full.png`),fullPage:true});
   await page.goto(`http://127.0.0.1:4180/marks-lab/?style=${variant}&stress=1`);
   await page.setViewportSize({width:320,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(errors,[]);
  const labels=['A · Grouped cards','B · Gradebook','C · Score tiles'];
  const top=Buffer.from(`<svg width="1266" height="960"><rect width="100%" height="100%" fill="#111511"/><g font-family="Arial,sans-serif"><text x="24" y="39" font-size="24" fill="#f1eee3">Marks · three component styles</text>${labels.map((l,i)=>`<text x="${24+414*i}" y="86" font-size="16" fill="#adb4a4">${l}</text>`).join('')}</g></svg>`);
  const composites=[{input:top,left:0,top:0},...['cards','ledger','strips'].map((v,i)=>({input:path.join(target,`marks-${v}.png`),left:24+414*i,top:105}))];
  await sharp({create:{width:1266,height:960,channels:4,background:'#111511'}}).composite(composites).png().toFile(path.join(target,'marks-options.png'));
  fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify({errors,geometry},null,2));
  console.log('Three styles passed at 320/390/430px; screenshots saved.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
