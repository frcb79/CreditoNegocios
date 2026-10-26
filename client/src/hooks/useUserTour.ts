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
    let navigationTimer: number | undefined;

    const timer = window.setTimeout(() => {
      const mobile = window.innerWidth < 1024;
      const configured = getUserTourSteps(role, mobile);

      // Only highlight actual, rendered controls. Missing RBAC modules are
      // skipped, never presented as a floating popover in the corner/center.
      const steps: DriveStep[] = configured.flatMap((step) => {
        const target = step.selector ? findRenderableTarget(step.selector) : null;
        if (!target) return [];
        const isMobileNav = mobile && step.selector?.includes('-mobile"]');
        const desktopNav = !mobile && step.selector?.startsWith('[data-testid="nav-');
        return [{
          // Resolve the latest node at each step; opening the mobile drawer
          // can re-render Sidebar and replace its original DOM nodes.
          element: step.selector!,
          popover: {
            title: step.title,
            description: step.description,
            side: desktopNav ? "right" as const : "bottom" as const,
            align: isMobileNav ? "center" as const : "start" as const
          }
        }];
      });

      if (steps.length === 0) return;

      // A mobile nav target lives inside a drawer that starts offscreen.
      // Open it BEFORE driver.js measures that target, and wait for its CSS
      // slide transition. Close it before returning to a Dashboard control.
      const mobileDrawer = () => document.querySelector<HTMLElement>('[data-testid="mobile-sidebar"]');
      const prepareMobileDrawer = (next: DriveStep) => {
        if (!mobile) return false;
        const nav = typeof next.element === "string" &&
          next.element.startsWith('[data-testid="nav-') &&
          next.element.endsWith('-mobile"]');
        const open = mobileDrawer()?.dataset.open === "true";
        if (nav && !open) {
          document.querySelector<HTMLButtonElement>('[data-testid="button-open-sidebar"]')?.click();
          return true;
        }
        if (!nav && open) {
          document.querySelector<HTMLButtonElement>('[data-testid="button-close-sidebar"]')?.click();
          return true;
        }
        return false;
      };

      const move = (to: number) => {
        if (!instance || to < 0 || to >= steps.length) return;
        if (navigationTimer !== undefined) window.clearTimeout(navigationTimer);
        const transition = prepareMobileDrawer(steps[to]);
        const advance = () => instance?.moveTo(to);
        if (transition) navigationTimer = window.setTimeout(advance, 360);
        else advance();
      };

      instance = driver({
        showProgress: true,
        allowClose: true,
        stagePadding: 7,
        popoverOffset: 12,
        nextBtnText: "Siguiente",
        prevBtnText: "Anterior",
        doneBtnText: "Finalizar",
        steps,
        onNextClick: (_element, _step, { driver: current }) => {
          const index = current.getActiveIndex() ?? 0;
          if (index < steps.length - 1) move(index + 1);
          else {
            finished = true;
            current.destroy();
          }
        },
        onPrevClick: (_element, _step, { driver: current }) => {
          const index = current.getActiveIndex() ?? 0;
          if (index > 0) move(index - 1);
        },
        onCloseClick: (_element, _step, { driver: current }) => {
          current.destroy();
        },
        onDestroyed: () => {
          if (navigationTimer !== undefined) window.clearTimeout(navigationTimer);
          if (mobile && mobileDrawer()?.dataset.open === "true") {
            document.querySelector<HTMLButtonElement>('[data-testid="button-close-sidebar"]')?.click();
          }
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
      if (navigationTimer !== undefined) window.clearTimeout(navigationTimer);
      instance?.destroy();
    };
  }, [user?.id, user?.role]);
}
