const sharp=require('../portal-app/node_modules/sharp');
const fs=require('node:fs');
const path=require('node:path');
const source=path.join(__dirname,'.evidence');
const target=path.join(__dirname,'screenshots');
fs.mkdirSync(target,{recursive:true});
const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;');
async function board(name,title,items){
 const width=items.length*414+24,height=960;
 const labels=items.map((item,i)=>`<text x="${i*414+24}" y="86" font-size="16" fill="#adb4a4">${escape(item[0])}</text>`).join('');
 const top=Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#111511"/><g font-family="Arial,sans-serif"><text x="24" y="39" font-size="24" fill="#f1eee3">${escape(title)}</text>${labels}</g></svg>`);
 const layers=[{input:top,left:0,top:0}];
 for(let i=0;i<items.length;i++)layers.push({input:path.join(source,items[i][1]+'-screen.png'),left:24+i*414,top:105});
 await sharp({create:{width,height,channels:4,background:'#111511'}}).composite(layers).png().toFile(path.join(target,name+'.png'));
}
(async()=>{
 await board('marks-and-planning','Marks stays focused. Planning opens from +.',[
  ['Marks','marks'],['+ menu','marks-menu'],['Predict your grade','grades-predict'],['CGPA','grades-cgpa']]);
 await board('login-and-attendance','Email first. Expand in place. Attendance at a glance.',[
  ['Email','login'],['Both passwords','login-passwords'],['Attendance','attendance']]);
 await board('other-pages','The rest of your space.',[
  ['Home','home'],['Schedule','schedule'],['Academic calendar','calendar'],['Settings','settings']]);
 for(const file of fs.readdirSync(source).filter(n=>n.endsWith('-screen.png')))fs.copyFileSync(path.join(source,file),path.join(target,file));
 console.log('Saved three screenshot boards and individual screens to design-preview/screenshots');
})().catch(e=>{console.error(e.message);process.exitCode=1});
