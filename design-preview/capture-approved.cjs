const {chromium}=require('../portal-app/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const target=path.join(__dirname,'screenshots');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('anon.analytics-choice.v1','decline'));
 const root='http://127.0.0.1:4184';
 try{
  await page.route('**/api/**',route=>route.fulfill({json:{authenticated:false,authMode:'http'}}));
  await page.goto(root);await page.locator('#login-view').waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.doesNotMatch(await page.locator('#login-view').innerText(),/Welcome back/i);
  for(const width of [320,390,430,1280]){
   await page.setViewportSize({width,height:844});
   const box=await page.locator('.login-card').boundingBox();
   assert.ok(Math.abs(box.y+box.height/2-422)<4);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(target,'approved-login-email.png')});
  await page.locator('#account').fill('sample@srmist.edu.in');await page.locator('#sign-in').click();
  await page.locator('#password').waitFor();await page.locator('#password').blur();
  await page.screenshot({path:path.join(target,'approved-login-passwords.png')});
  await page.goto(`${root}/?preview=home`);await page.locator('#home-view').waitFor();
  await page.locator('[data-page="attendance"]').click();
  await page.locator('.attendance-row').first().waitFor();
  await page.evaluate(()=>{
   const container=document.getElementById('attendance-content');container.replaceChildren();
   academicUI.renderAttendance([
    {code:'21CSC302J',title:'Computer Networks',present:13,conducted:19,change24h:{points:-.3}},
    {code:'21CSC201J',title:'Data Structures',present:22,conducted:25,change24h:{points:1.1}},
    {code:'21CSC202J',title:'Operating Systems',present:20,conducted:24,change24h:{points:0}},
    {code:'21MAB204T',title:'Discrete Mathematics',present:18,conducted:24},
    {code:'21LEM202T',title:'Professional Ethics',present:0,conducted:0}
   ],container,{});
  });
  assert.doesNotMatch(await page.locator('.attendance-rows').innerText(),/can miss|to recover|recovered by/i);
  assert.equal((await page.locator('.risk .attendance-margin-value').innerText()).replace(/\s/g,''),'−5h');
  for(const width of [320,390,430,1280]){
   await page.setViewportSize({width,height:844});
   const rows=await page.locator('.attendance-summary').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),m=e.querySelector('.attendance-main-metric').getBoundingClientRect();return Math.abs(r.right-m.right)}));
   assert.ok(rows.every(gap=>gap<2));
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(target,'approved-attendance.png')});
  await page.locator('#planner-menu summary').click();await page.locator('#open-accounts').click();
  await page.locator('#settings-view').waitFor();
  for(const width of [320,390,430,1280]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const clipped=await page.locator('#settings-view .connection-row,#settings-view .settings-row').evaluateAll(es=>es.filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className));
   assert.deepEqual(clipped,[]);
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(target,'approved-settings.png')});
  await page.locator('#settings-display-name').fill('Sample Name');await page.locator('#settings-profile-form button').click();
  assert.equal(await page.locator('#settings-name').innerText(),'Sample Name');
  await page.locator('[data-page="marks"]').click();
  await page.evaluate(()=>renderMarks({data:[
   {code:'21CSC302J',title:'Computer Networks',scored:39,total:60,credits:3,components:[{name:'FT-1',scored:16,total:25},{name:'FT-2',scored:16,total:25},{name:'Quiz',scored:7,total:10}]},
   {code:'21CSC201J',title:'Data Structures',scored:43,total:50,credits:4,components:[{name:'FT-1',scored:21,total:25},{name:'FT-2',scored:22,total:25},{name:'Assignment',scored:null,total:10}]},
   {code:'21CSC202P',title:'Operating Systems Lab',scored:35,total:40,credits:2,components:[{name:'Practical',scored:18,total:20},{name:'Lab record',scored:9,total:10},{name:'Viva',scored:8,total:10}]},
   {code:'21MAB204T',title:'Discrete Mathematics',scored:43,total:60,credits:4,components:[{name:'Test 1',scored:17,total:20},{name:'Test 2',scored:18,total:20},{name:'Problem set',scored:8,total:10},{name:'Quiz',scored:0,total:10}]}
  ]}));
  await page.screenshot({path:path.join(target,'approved-mini-marks.png')});
  const tiles=await page.locator('#marks-content .assessment-row').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
  assert.ok(tiles.every(height=>height<=36));
  await page.locator('#planner-menu summary').click();await page.locator('#open-grades').click();
  await page.locator('#grades-view').waitFor();await page.screenshot({path:path.join(target,'approved-grade-planning.png')});
  assert.deepEqual(errors,[]);console.log('Built-page UI checks passed; approved screenshots saved.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
