/* 只快取同一 GitHub Pages 單元目錄；整合入口必須另行收納單元檔案。 */
const VERSION='3.1.0-2026-11-12';
const PREFIX='bio-sugar-'+new URL(self.registration.scope).pathname.replace(/[^a-zA-Z0-9]/g,'_')+'-';
const CACHE_NAME=PREFIX+VERSION;
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./unit.json',
'./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-96.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{
const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim();
})());});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url),scope=new URL(self.registration.scope);if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
event.respondWith((async()=>{const c=await caches.open(CACHE_NAME);if(event.request.mode==='navigate'){return await c.match(event.request,{ignoreSearch:true})||await c.match('./index.html')||fetch(event.request);}return await c.match(event.request,{ignoreSearch:true})||fetch(event.request);})());});
self.addEventListener('message',event=>{if(event.data?.type!=='CHECK_OFFLINE'||!event.ports?.[0])return;event.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);const found=await Promise.all(SHELL.map(x=>c.match(x)));event.ports[0].postMessage({ready:found.every(Boolean),version:VERSION});})());});
