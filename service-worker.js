self.addEventListener('install', event => {
    console.log('Service worker installed.');
    self.skipWaiting();
  });
  
  self.addEventListener('activate', event => {
    console.log('Service worker activated.');
  });
  
  self.addEventListener('fetch', event => {
    event.respondWith(fetch(event.request));
  });
  