"use client";

import { useEffect } from "react";

/** Converte a chave VAPID base64-url para o formato aceito pelo PushManager. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Registra o Service Worker e, se houver permissão de notificação, inscreve
 * o dispositivo no Web Push. Não pede permissão automaticamente — apenas
 * reaproveita se já concedida (o pedido vem de um clique, ver useHabilitarPush).
 */
export function PushManager() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    (async () => {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (Notification.permission !== "granted") return;
      await inscrever(reg);
    })().catch((err) => console.error("[push] registro falhou:", err));
  }, []);

  return null;
}

async function inscrever(reg: ServiceWorkerRegistration) {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return;

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    }));

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
}

/** Pede permissão (a partir de um clique) e inscreve. Retorna se ficou ativo. */
export async function habilitarPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  await inscrever(reg);
  return true;
}
