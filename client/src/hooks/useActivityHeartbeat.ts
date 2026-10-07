import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

const HEARTBEAT_MS = 60_000;
const ACTIVE_WINDOW_MS = 5 * 60_000;

function moduleFromPath(path: string): string {
  if (path === "/") return "dashboard";
  if (path.startsWith("/clientes")) return "clientes";
  if (path.startsWith("/creditos") || path.startsWith("/mis-solicitudes") || path.startsWith("/comparar-propuestas") || path.startsWith("/re-gestion")) return "creditos";
  if (path.startsWith("/solicitudes-pendientes")) return "aprobaciones";
  if (path.startsWith("/comisiones")) return "comisiones";
  if (path.startsWith("/financieras")) return "financieras";
  if (path.startsWith("/sistema-productos")) return "sistema_productos";
  if (path.startsWith("/red-brokers")) return "red_brokers";
  if (path.startsWith("/documentos")) return "documentos";
  if (path.startsWith("/reportes")) return "reportes";
  if (path.startsWith("/importacion-masiva")) return "importacion";
  if (path.startsWith("/admin/usuarios")) return "usuarios";
  if (path.startsWith("/configuracion")) return "configuracion";
  if (path.startsWith("/notificaciones")) return "notificaciones";
  if (path.startsWith("/ayuda") || path.startsWith("/reglas-operacion")) return "ayuda";
  return "otro";
}

export function useActivityHeartbeat(): void {
  const [location] = useLocation();
  const lastInteractionAt = useRef(Date.now());
  const currentModule = useRef(moduleFromPath(location));

  useEffect(() => {
    currentModule.current = moduleFromPath(location);
  }, [location]);

  useEffect(() => {
    const markInteraction = () => {
      lastInteractionAt.current = Date.now();
    };

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, markInteraction, { passive: true }));

    return () => {
      events.forEach((event) => window.removeEventListener(event, markInteraction));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const sendHeartbeat = async () => {
      if (cancelled) return;
      const active =
        document.visibilityState === "visible" &&
        Date.now() - lastInteractionAt.current <= ACTIVE_WINDOW_MS;

      try {
        await fetch("/api/activity/heartbeat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            moduleId: currentModule.current,
            active,
          }),
        });
      } catch {
        // Usage analytics is best-effort and must never interrupt navigation.
      }
    };

    void sendHeartbeat();
    const timer = window.setInterval(() => void sendHeartbeat(), HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        lastInteractionAt.current = Date.now();
      }
      void sendHeartbeat();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    // Record module changes immediately without creating a clickstream event.
    const active = document.visibilityState === "visible";
    void fetch("/api/activity/heartbeat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId: moduleFromPath(location), active }),
    }).catch(() => undefined);
  }, [location]);
}
