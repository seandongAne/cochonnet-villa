// Serve a production build on fresh origins: browser HTTP/module/storage caches
// cannot leak between samples. OS file cache and GPU driver cache are NOT reset.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const root = path.resolve('dist');
const first = Number(process.argv[2] || 4341), count = Number(process.argv[3] || 12);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.woff2':'font/woff2','.bin':'application/octet-stream'};
for(let port=first;port<first+count;port++) http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    let name=decodeURIComponent(url.pathname); if(name.endsWith('/')) name+='index.html';
    const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const data=await fs.readFile(file), type=types[path.extname(file)]||'application/octet-stream';
    const compressed=/text|json|svg/.test(type)&&req.headers['accept-encoding']?.includes('gzip');
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store',...(compressed?{'Content-Encoding':'gzip'}:{})});
    res.end(compressed?gzipSync(data):data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Cold origin http://127.0.0.1:${port}`));
