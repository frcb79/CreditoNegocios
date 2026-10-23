import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "./useAuth";
import {
  USER_TOUR_QUERY_PARAM,
  USER_TOUR_QUERY_VALUE,
  getLegacyUserTourStorageKey,
  getUserTourSteps,
  getUserTourStorageKey
} from "@/lib/userTour";
import type { DriveStep } from "driver.js";

/**
 * En escritorio existen simultáneamente versiones móvil y escritorio del
 * Sidebar. querySelector tomaría el elemento móvil (oculto) y truncaría el tour.
 * Usar un elemento renderizado sin exigir que esté ya dentro del viewport:
 * driver.js desplazará el scroll hasta el control resaltado.
 */
function findRenderableTarget(selector: string): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>(selector);
  for (const element of Array.from(elements)) {
    if (element.getClientRects().length === 0) continue;
    let candidate: HTMLElement | null = element;
    let hidden = false;
    while (candidate) {
      const styles = window.getComputedStyle(candidate);
      if (styles.display === "none" || styles.visibility === "hidden") {
        hidden = true;
        break;
      }
      candidate = candidate.parentElement;
    }
    if (!hidden) return element;
  }
  return null;
}

/**
 * Solo se activa automáticamente para cuentas nuevas.
 * Los usuarios que cerraron el recorrido antiguo no reciben una nueva
 * interrupción; desde Ayuda pueden iniciarlo tantas veces como quieran.
 */
export function useUserTour() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    const role = user.role || "broker";
    const storageKey = getUserTourStorageKey(user.id, role);
    const currentUrl = new URL(window.location.href);
    const replay = currentUrl.searchParams.get(USER_TOUR_QUERY_PARAM) === USER_TOUR_QUERY_VALUE;

    // Consumir el enlace para que refrescar Dashboard no reinicie la guía.
    if (replay) {
      currentUrl.searchParams.delete(USER_TOUR_QUERY_PARAM);
      window.history.replaceState(
        window.history.state,
        "",
        currentUrl.pathname + currentUrl.search + currentUrl.hash
      );
    }

    if (!replay && (
      localStorage.getItem(storageKey) ||
      localStorage.getItem(getLegacyUserTourStorageKey(user.id))
    )) return;

    let instance: ReturnType<typeof driver> | null = null;
    let finished = false;
    let started = false;

    const timer = window.setTimeout(() => {
      const mobile = window.innerWidth < 1024;
      const steps: DriveStep[] = getUserTourSteps(role, mobile)
        .map((step) => {
          // Nunca eliminar un mensaje: si falta un ancla, mostrar el paso
          // como explicación centrada en lugar de reducir la guía a 2 pasos.
          const target = step.selector ? findRenderableTarget(step.selector) : null;
          return {
            ...(target ? { element: target } : {}),
            popover: {
              title: step.title,
              description: step.description,
              side: target ? (step.selector?.includes("nav-") ? "right" as const : "bottom" as const) : undefined,
              align: "start" as const
            }
          };
        });

      if (steps.length === 0) return;

      instance = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: "Siguiente",
        prevBtnText: "Anterior",
        doneBtnText: "Finalizar",
        steps,
        onNextClick: (_element, _step, { driver: current }) => {
          if (current.hasNextStep()) {
            current.moveNext();
          } else {
            finished = true;
            current.destroy();
          }
        },
        onCloseClick: (_element, _step, { driver: current }) => {
          current.destroy();
        },
        onDestroyed: () => {
          if (started) {
            localStorage.setItem(storageKey, finished ? "completed" : "skipped");
          }
        }
      });
      started = true;
      instance.drive();
    }, 800);

    return () => {
      window.clearTimeout(timer);
      instance?.destroy();
    };
  }, [user?.id, user?.role]);
}
