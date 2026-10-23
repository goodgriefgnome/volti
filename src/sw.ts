// The service worker: the offline copy of the app, and receiving PDFs shared from other apps. It
// runs apart from the page, so it imports only code that needs no DOM (storage, the inbox).

/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { putInbox } from './originals/inbox';

declare const self: ServiceWorkerGlobalScope;

// A new version waits until the page, starting up, tells it to take over (updates.ts), so it
// never changes under a page already open.
self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// PDFs shared from another app (Files, Gmail, Drive) arrive as a form post.
// Park them in the inbox; the app moves them into the library when it opens.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || !url.pathname.endsWith('/share')) return;
  e.respondWith((async () => {
    const form = await e.request.formData();
    const files = form.getAll('pdfs').filter((f): f is File => f instanceof File);
    if (files.length) await putInbox(files);
    return Response.redirect(new URL('./?shared', self.registration.scope).href, 303);
  })());
});

precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
