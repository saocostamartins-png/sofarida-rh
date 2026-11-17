'use strict';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Only document navigation. Sessions, requests and records are never cached by the app.
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sofarida RH</title><body style="font:1rem system-ui;background:#f5f7f5;color:#153f35;margin:2rem"><h1>Sem ligação</h1><p>Ligue-se à Internet para entrar no Portal RH.</p><a href="/">Tentar novamente</a></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
