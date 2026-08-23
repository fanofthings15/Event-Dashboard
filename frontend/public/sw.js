// Push-only service worker — no offline caching/fetch interception here,
// that's already handled client-side by useEvents.ts's own localStorage
// cache. This just exists to receive push events while the app isn't open.

self.addEventListener("push", (event) => {
  let data = { title: "Event Dashboard", body: "", tag: "event-dashboard" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload (shouldn't happen — the backend always sends JSON) —
    // fall back to the defaults above rather than throwing.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

// Focuses an already-open tab instead of opening a new one, if one exists.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
