self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    if (event.data) {
      const text = event.data.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {
          title: "GSV",
          body: text,
        };
      }
    }

    const title = typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "GSV";
    const body = typeof payload.body === "string" ? payload.body : undefined;
    const notificationId = typeof payload.notificationId === "string" ? payload.notificationId : undefined;

    await self.registration.showNotification(title, {
      body,
      tag: notificationId,
      data: {
        notificationId,
        url: typeof payload.url === "string" ? payload.url : "/",
      },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        client.postMessage({
          type: "gsv.notification.click",
          notificationId: event.notification.data?.notificationId ?? null,
        });
        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
