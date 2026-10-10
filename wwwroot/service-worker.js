const CACHE_NAME = "grassquest-shell-v2";
const APP_SHELL = [
    "/index.html",
    "/styles.css",
    "/app.js",
    "/manifest.webmanifest",
    "/grassquest-icon.svg",
    "/icons/grassquest-192.png",
    "/icons/grassquest-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key.startsWith("grassquest-shell-") && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // API calls must always go to the running ASP.NET backend. Never cache AI responses.
    if (url.pathname.startsWith("/api/")) return;

    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
            const response = await fetch(request);
            if (response && response.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
            }
            return response;
        } catch {
            if (request.mode === "navigate") {
                return (await caches.match("/index.html")) || Response.error();
            }
            return Response.error();
        }
    })());
});
