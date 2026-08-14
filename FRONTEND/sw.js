// sw.js - Service Worker for A.I.D.E.
// v2: precaches actual first-aid content (not just app shell) so the
// device still works with zero signal, which is the whole point of an
// emergency instructional tool.

const CACHE_NAME = 'aide-v6';

const SHELL_ASSETS = [
    '/',
    '/CSS/styles.css',
    '/JS/main.js',
    '/JS/state.js',
    '/JS/settings.js',
    '/JS/history.js',
    '/JS/captures.js',
    '/JS/voice.js',
    '/JS/scan.js',
    '/JS/search.js',
    '/JS/ui.js',
    '/JS/utils.js',
    '/JS/analytics.js',
    '/VENDOR/tf.min.js',
    '/HTML/index.html'
];

const LANGS = ['en', 'tl'];

// Fetch the injury list, then fetch every individual injury's full
// steps (in every supported language), and cache all of it. This is
// what actually makes the app usable with no connection.
async function precacheInjuryContent(cache) {
    for (const lang of LANGS) {
        const listUrl = `/api/injuries?lang=${lang}`;
        try {
            const listRes = await fetch(listUrl);
            if (!listRes.ok) continue;
            await cache.put(listUrl, listRes.clone());
            const list = await listRes.json();

            await Promise.all(list.map(async (injury) => {
                const detailUrl = `/api/injury/${encodeURIComponent(injury.key)}?lang=${lang}`;
                try {
                    const detailRes = await fetch(detailUrl);
                    if (detailRes.ok) {
                        await cache.put(detailUrl, detailRes.clone());
                    }
                } catch (e) {
                    console.warn('⚠️ Could not precache', detailUrl, e);
                }

                // Icons are static assets too — worth having offline.
                if (injury.icon) {
                    try {
                        const iconRes = await fetch(injury.icon);
                        if (iconRes.ok) await cache.put(injury.icon, iconRes.clone());
                    } catch (e) {
                        console.warn('⚠️ Could not precache icon', injury.icon, e);
                    }
                }
            }));
        } catch (e) {
            console.warn(`⚠️ Could not load injury list for lang=${lang}:`, e);
        }
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                console.log('📦 Caching app shell...');
                await cache.addAll(SHELL_ASSETS);
                console.log('🩹 Caching first-aid content for offline use...');
                await precacheInjuryContent(cache);
                console.log('✅ Offline cache ready.');
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('🧹 Removing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const isApi = request.url.includes('/api/');

    if (isApi) {
        // Network-first for API calls: always prefer fresh data when
        // online, but fall back to whatever we precached/cached before
        // when offline. This is the actual fix — previously API calls
        // were never cached at all, so offline meant no first-aid data.
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(request);
                    if (cached) return cached;
                    return new Response(
                        JSON.stringify({ error: 'offline', message: 'This item was not available offline.' }),
                        { status: 503, headers: { 'Content-Type': 'application/json' } }
                    );
                })
        );
        return;
    }

    // App shell: network-first so fixes are not hidden by an old cache.
    event.respondWith(
        fetch(request)
            .then((response) => {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
                return response;
            })
            .catch(async () => {
                const cachedResponse = await caches.match(request);
                return cachedResponse || new Response('You are offline. Please connect to the internet.', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            })
    );
});