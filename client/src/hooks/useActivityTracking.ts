import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { buildApiUrl } from "@/lib/runtimeConfig";

const HEARTBEAT_MS = 60_000;
const ACTIVE_WINDOW_MS = 90_000;

function moduleFromPath(path: string) {
  if (path === "/") return "dashboard";
  if (path.startsWith("/clientes")) return "clientes";
  if (path.startsWith("/creditos") || path.startsWith("/mis-solicitudes") || path.startsWith("/comparar-propuestas")) return "creditos";
  if (path.startsWith("/re-gestion")) return "re_gestion";
  if (path.startsWith("/red-brokers")) return "red_brokers";
  if (path.startsWith("/comisiones")) return "comisiones";
  if (path.startsWith("/financieras")) return "financieras";
  if (path.startsWith("/sistema-productos")) return "sistema_productos";
  if (path.startsWith("/documentos")) return "documentos";
  if (path.startsWith("/reportes")) return "reportes";
  if (path.startsWith("/solicitudes-pendientes")) return "aprobaciones";
  if (path.startsWith("/admin/usuarios")) return "usuarios";
  if (path.startsWith("/importacion-masiva")) return "importacion";
  if (path.startsWith("/configuracion")) return "configuracion";
  if (path.startsWith("/ayuda") || path.startsWith("/reglas-operacion")) return "ayuda";
  return "otro";
}

async function sendHeartbeat(moduleName: string, active: boolean) {
  try {
    await fetch(buildApiUrl("/api/activity/heartbeat"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: moduleName, active }),
      keepalive: true,
    });
  } catch {
    // Activity telemetry must never interrupt the product experience.
  }
}

export function useActivityTracking(enabled: boolean) {
  const [location] = useLocation();
  const lastInteractionRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;

    const markActive = () => {
      lastInteractionRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    return () => {
      events.forEach((event) => window.removeEventListener(event, markActive));
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    lastInteractionRef.current = Date.now();
    void sendHeartbeat(moduleFromPath(location), true);
  }, [enabled, location]);

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      const isVisible = document.visibilityState === "visible";
      const recentlyActive = Date.now() - lastInteractionRef.current <= ACTIVE_WINDOW_MS;
      if (isVisible && recentlyActive) {
        void sendHeartbeat(moduleFromPath(window.location.pathname), true);
      }
    }, HEARTBEAT_MS);

    return () => window.clearInterval(timer);
  }, [enabled]);
}
