import {cpSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('.',import.meta.url));
const site=join(root,'site');
mkdirSync(site,{recursive:true});
for(const name of ['login','attendance','marks','marks-lab']){
 const directory=join(root,name);
 const binary=join(directory,'node_modules/vite/bin/vite.js');
 if(!existsSync(binary))throw new Error(`Run npm install in design-preview/${name} first.`);
 const log=execFileSync(process.execPath,[binary,'build'],{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 writeFileSync(join(directory,'build.log'),log);
 cpSync(join(directory,'dist'),join(site,name),{recursive:true});
 console.log(`Built ${name}`);
}
for(const name of ['home','schedule','calendar','settings','grades','assets']){
 cpSync(join(root,name),join(site,name),{recursive:true});
}
for(const name of ['shared.css','navigation.js','index.html'])cpSync(join(root,name),join(site,name));
// Keep source licensing available next to the built components.
for(const [page,license] of [['login','LICENSE-Rare-UI.txt'],['attendance','LICENSE.mdxcn'],['marks','LICENSE.mdxcn']]){
 cpSync(join(root,page,license),join(site,page,license));
}
console.log('Preview ready. Run: node design-preview/serve.mjs');
