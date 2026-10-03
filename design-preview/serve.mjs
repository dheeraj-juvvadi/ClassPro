import {createServer} from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {extname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('./site/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const port=Number(process.env.PREVIEW_PORT||4180);
createServer((request,response)=>{
 try{
  let path=resolve(root,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname));
  if(path!==resolve(root)&&!path.startsWith(resolve(root)+sep))throw new Error('Invalid path');
  if(statSync(path).isDirectory())path=join(path,'index.html');
  const data=readFileSync(path);
  response.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  response.end(data);
 }catch{
  response.writeHead(404,{'Content-Type':'text/plain'});response.end('Page not found');
 }
}).listen(port,'127.0.0.1',()=>console.log(`Anon design preview: http://127.0.0.1:${port}`));
