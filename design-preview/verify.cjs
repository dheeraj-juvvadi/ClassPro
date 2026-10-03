const {chromium}=require('../portal-app/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root='http://127.0.0.1:4180';
const evidence=path.join(__dirname,'.evidence');
fs.mkdirSync(evidence,{recursive:true});
const report={routes:[],attendance:[],marks:[],login:[],errors:[],failures:[]};
async function check(name,fn){try{await fn();}catch(error){report.failures.push({name,message:error.message});}}
async function geometry(page){return page.evaluate(()=>{
 const visible=e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden';
 const outside=[...document.querySelectorAll('main h1,main h2,main h3,main p,main button,main input,main td,main th,.course')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left < -1 || r.right>innerWidth+1}).map(e=>e.textContent.trim().slice(0,70));
 return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,outside};
});}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(root))report.errors.push(`${r.status()} ${r.url()}`)});
 try{
  for(const route of ['login','attendance','marks','home','schedule','calendar','settings','grades']){
   await check(route,async()=>{
    const response=await page.goto(`${root}/${route}/`);assert.equal(response.status(),200);
    await page.evaluate(()=>document.fonts.ready);
    if(route==='login')await page.locator('[data-ready="true"]').waitFor();
    for(const width of [320,390,430,1280]){
     await page.setViewportSize({width,height:844});
     const g=await geometry(page);report.routes.push({route,...g});assert.equal(g.overflow,false);assert.deepEqual(g.outside,[]);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(evidence,`${route}.png`),fullPage:true});
    await page.screenshot({path:path.join(evidence,`${route}-screen.png`)});
    const links=await page.locator('a[href]').evaluateAll(es=>es.map(e=>e.href).filter(h=>h.startsWith(location.origin)&&!h.includes('#')));
    for(const url of [...new Set(links)])assert.equal((await context.request.get(url)).status(),200,url);
   });
  }
  await check('attendance alignment',async()=>{
   await page.goto(`${root}/attendance/`);
   assert.equal(await page.locator('.course').count(),5);
   assert.equal((await page.locator('.needs-attention .allowance-value').innerText()).replace(/\s/g,''),'−5h');
   assert.equal(await page.locator('.unknown .sync-delta').count(),0);
   for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    const rows=await page.locator('.course').evaluateAll(es=>es.map(e=>{
     const r=e.getBoundingClientRect(),m=e.querySelector('.margin-row').getBoundingClientRect();
     const percent=e.querySelector('.recorded-percent')?.getBoundingClientRect(),delta=e.querySelector('.sync-delta')?.getBoundingClientRect();
     return {marginGap:r.right-m.right,height:r.height,deltaGap:delta?delta.left-percent.right:null,deltaLine:delta?Math.abs(delta.top-percent.top):null};
    }));
    report.attendance.push({width,rows});
    assert.ok(rows.every(r=>Math.abs(r.marginGap)<2));
    assert.ok(rows.every(r=>r.deltaGap===null||(r.deltaGap>=0&&r.deltaGap<10&&r.deltaLine<7)));
   }
  });
  await check('marks compactness',async()=>{
   await page.goto(`${root}/marks/`);assert.equal(await page.locator('.assessments dt').count(),15);
   assert.equal(await page.locator('.score-zero').count(),1);assert.equal(await page.locator('.score-pending').count(),3);
   for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    const heights=await page.locator('.assessments dl>div').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
    report.marks.push({width,heights});assert.ok(heights.every(h=>h<=44));
   }
   await page.goto(`${root}/marks/?stress=1`);assert.deepEqual((await geometry(page)).outside,[]);
  });
  await check('email and both passwords',async()=>{
   await page.setViewportSize({width:390,height:844});await page.goto(`${root}/login/`);
   await page.locator('[data-ready="true"]').waitFor();
   assert.equal(await page.locator('input').count(),1);
   const initial=await page.locator('.family-surface').boundingBox();
   assert.ok(Math.abs(initial.y+initial.height/2-422)<3);
   assert.ok(initial.height<330);
   await page.getByLabel('Email address').fill('sample@srmist.edu.in');
   await page.getByRole('button',{name:'Continue',exact:true}).click();
   await page.locator('[data-step="password"][data-ready="true"] [data-content="password"]:not([inert])').waitFor();
   const expanded=await page.locator('.family-surface').boundingBox();
   assert.ok(expanded.height>initial.height);assert.ok(Math.abs(expanded.y+expanded.height/2-422)<3);
   assert.equal(await page.locator('.account-row').innerText(),'sample@srmist.edu.in\nChange');
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
   assert.equal(await page.locator('#academia-error').innerText(),'Enter your Academia password.');
   assert.equal(await page.locator('#portal-error').innerText(),'Enter your Student Portal password.');
   await page.getByLabel('Academia password',{exact:true}).fill(' dummy pass ');
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
   assert.equal(await page.locator('#portal-error').innerText(),'Enter your Student Portal password.');
   await page.getByLabel('Student Portal password',{exact:true}).fill(' second dummy ');
   await page.getByRole('button',{name:'Show academia password',exact:true}).click();
   assert.equal(await page.locator('#academia').inputValue(),' dummy pass ');
   assert.equal(await page.locator('#academia').getAttribute('type'),'text');
   assert.equal(await page.locator('#portal').getAttribute('type'),'password');
   await page.screenshot({path:path.join(evidence,'login-passwords.png'),fullPage:true});
   await page.screenshot({path:path.join(evidence,'login-passwords-screen.png')});
   for(const [width,height] of [[320,568],[390,360],[430,844]]){
    await page.setViewportSize({width,height});
    await page.waitForTimeout(80);
    const box=await page.locator('.family-surface').boundingBox();report.login.push({width,height,box});
    assert.ok(box.y>=0&&box.y+box.height<=height+1);
   }
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await page.getByRole('link',{name:'Open home preview'}).waitFor();
   await page.getByRole('link',{name:'Open home preview'}).click();assert.ok(page.url().endsWith('/home/'));
  });
  await check('schedule and calendar',async()=>{
   await page.setViewportSize({width:390,height:844});await page.goto(`${root}/schedule/`);
   await page.getByRole('button',{name:'Tuesday',exact:true}).click();assert.equal(await page.locator('#day-title').innerText(),'Tuesday');
   assert.equal(await page.getByRole('button',{name:'Tuesday',exact:true}).getAttribute('aria-pressed'),'true');
   await page.locator('#calendar-link').click();assert.ok(page.url().includes('2026-10-06'));
   assert.match(await page.locator('#selected-date').innerText(),/Tuesday.*6 October/);
   assert.equal(await page.locator('#month-title').innerText(),'October 2026');
   const offset=await page.locator('#month-days tr').first().locator('td').evaluateAll(es=>es.findIndex(e=>e.querySelector('button')));
   assert.equal(offset,3);
   await page.locator('#next-month').click();assert.equal(await page.locator('#month-title').innerText(),'November 2026');
   await page.locator('#previous-month').click();
   await page.locator('[data-date="2026-10-09"]').click();assert.match(await page.locator('#day-events').innerText(),/Practice exam/);
  });
  await check('settings and menu',async()=>{
   await page.goto(`${root}/settings/`);
   await page.getByLabel('Display name').fill('Sample Student');
   await page.getByRole('button',{name:'Save sample'}).click();assert.equal(await page.locator('#profile-name').innerText(),'Sample Student');
   await page.getByRole('switch',{name:'Class reminders'}).check();assert.equal(await page.locator('#reminder-state').innerText(),'On');
   await page.locator('.space-menu summary').click();assert.ok(await page.locator('.menu-links').isVisible());
   await page.keyboard.press('Escape');assert.equal(await page.locator('.space-menu').getAttribute('open'),null);
   await page.locator('.settings-signout').click();assert.ok(page.url().endsWith('/login/'));
  });
  await check('grade tools through plus menu',async()=>{
   await page.goto(`${root}/marks/`);
   assert.equal(await page.locator('main').getByText(/CGPA|Predict your grade/).count(),0);
   await page.getByRole('button',{name:'Open tools'}).click();
   await page.screenshot({path:path.join(evidence,'marks-menu-screen.png')});
   await page.getByRole('link',{name:'Grade planning',exact:true}).click();
   assert.ok(page.url().endsWith('/grades/'));
   assert.equal(await page.locator('#cgpa-panel').isVisible(),false);
   await page.locator('#target').selectOption('81');await page.locator('#expected').fill('8');
   await page.getByRole('button',{name:'Estimate final marks'}).click();
   assert.equal(await page.locator('#final-value').innerText(),'56.25 / 75');
   await page.screenshot({path:path.join(evidence,'grades-predict-screen.png')});
   await page.getByRole('tab',{name:'CGPA',exact:true}).click();
   assert.equal(await page.locator('#predict-panel').isVisible(),false);
   await page.getByRole('button',{name:'Estimate CGPA'}).click();
   assert.equal(await page.locator('#cgpa-value').innerText(),'—');
   for(const [id,value] of [['current','8.2'],['completed','60'],['semester','8.8'],['credits','20']])await page.locator(`#${id}`).fill(value);
   await page.getByRole('button',{name:'Estimate CGPA'}).click();
   assert.equal(await page.locator('#cgpa-value').innerText(),'8.35 / 10');
   await page.screenshot({path:path.join(evidence,'grades-cgpa-screen.png')});
   for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.deepEqual((await geometry(page)).outside,[]);}
  });
  await check('login with motion enabled',async()=>{
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.setViewportSize({width:390,height:844});await page.goto(`${root}/login/`);
   await page.locator('[data-ready="true"]').waitFor();
   await page.getByLabel('Email address').fill('sample@srmist.edu.in');
   await page.getByRole('button',{name:'Continue',exact:true}).click();
   await page.locator('[data-step="password"][data-ready="true"] [data-content="password"]:not([inert])').waitFor();
   await page.waitForFunction(()=>document.activeElement?.id==='academia');
   const box=await page.locator('.family-surface').boundingBox();assert.ok(Math.abs(box.y+box.height/2-422)<3);
   await page.getByRole('button',{name:'Change',exact:true}).click();
   await page.getByLabel('Email address').waitFor();assert.equal(await page.getByLabel('Email address').inputValue(),'sample@srmist.edu.in');
  });
 }finally{
  await browser.close();
  fs.writeFileSync(path.join(evidence,'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({routeChecks:report.routes.length,errors:report.errors,failures:report.failures}));
  if(report.errors.length||report.failures.length)process.exitCode=1;
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
