const paths={
 home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h5v-7h4v7h5V9"/>',
 attendance:'<rect x="4" y="3" width="16" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
 marks:'<path d="M5 20V11m7 9V4m7 16V8"/>',
 schedule:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M9 10v11M15 10v11"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 login:'<path d="M10 4H4v16h6m4-12 4 4-4 4m-6-4h10"/>',
 grades:'<path d="M4 19h16M6 15l4-5 4 3 4-8"/><path d="M14 5h4v4"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
const page=document.body.dataset.page;
const link=(name,label)=>`<a href="/${name}/"${page===name?' aria-current="page"':''}>${icon(name)}<span>${label}</span></a>`;
const header=document.querySelector('header.masthead');
if(header) header.innerHTML=`<div class="brand-row"><a class="brand" href="/home/" aria-label="Anon home"><img src="/assets/logo.svg" alt="" width="29" height="29">Anon</a><details class="space-menu"><summary aria-label="Open tools"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></summary><nav class="menu-links" aria-label="Your space">${link('grades','Grade planning')}${link('schedule','Schedule')}${link('calendar','Academic calendar')}${link('settings','Settings')}${link('login','Sign out')}</nav></details></div>`;
const nav=document.querySelector('nav.bottom-nav');
if(nav){nav.setAttribute('aria-label','Main navigation');nav.innerHTML=link('home','Home')+link('attendance','Attendance')+link('marks','Marks');}
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 const menu=document.querySelector('.space-menu[open]');
 if(menu){menu.open=false;menu.querySelector('summary').focus();}
});
document.addEventListener('click',event=>{
 const menu=document.querySelector('.space-menu[open]');
 if(menu&&!menu.contains(event.target))menu.open=false;
});
