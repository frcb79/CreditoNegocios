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
import type { UserTourStep } from "@/lib/userTour";

/**
 * El Sidebar renderiza dos menús (móvil y escritorio). Un nodo puede existir en
 * el DOM pero estar fuera de pantalla por una transformación translateX.
 * Solo resaltamos la versión que realmente se ve en el viewport horizontal.
 * La posición vertical se corrige con scrollIntoView, incluso dentro del nav.
 */
function findRenderableTarget(selector: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    if (element.getClientRects().length === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= window.innerWidth) continue;

    let candidate: HTMLElement | null = element;
    let hidden = false;
    while (candidate) {
      const styles = window.getComputedStyle(candidate);
      if (styles.display === "none" || styles.visibility === "hidden" || candidate.hasAttribute("inert")) {
        hidden = true;
        break;
      }
      candidate = candidate.parentElement;
    }
    if (!hidden) return element;
  }
  return null;
}

const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));

function mobileSidebarIsOpen(): boolean {
  const closeButton = document.querySelector<HTMLElement>('[data-testid="button-close-sidebar"]');
  return Boolean(closeButton && closeButton.getBoundingClientRect().left >= 0);
}

async function prepareMobileSidebar(shouldOpen: boolean): Promise<void> {
  if (mobileSidebarIsOpen() === shouldOpen) return;

  const selector = shouldOpen ? '[data-testid="button-open-sidebar"]' : '[data-testid="button-close-sidebar"]';
  document.querySelector<HTMLButtonElement>(selector)?.click();
  // Sidebar utiliza transition-transform duration-300. Esperar al layout real
  // antes de medir el destino y ubicar su popover.
  await wait(340);
}

/**
 * Reproduce la guía desde Ayuda o para una cuenta que todavía no la vio.
 * No muestra mensajes centrados por un ancla inexistente: omite ese paso.
 */
export function useUserTour() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    const role = user.role || "broker";
    const storageKey = getUserTourStorageKey(user.id, role);
    const currentUrl = new URL(window.location.href);
    const replay = currentUrl.searchParams.get(USER_TOUR_QUERY_PARAM) === USER_TOUR_QUERY_VALUE;

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
    let stopped = false;
    let navigating = false;
    let scrollFrame = 0;
    const mobile = window.innerWidth < 1024;

    const onLayoutScroll = () => {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => instance?.refresh());
    };
    const onResize = () => {
      // No mostrar el destino escritorio si durante el tour cambia a móvil.
      // El recorrido puede repetirse desde Ayuda en el nuevo tamaño.
      if ((window.innerWidth < 1024) !== mobile) {
        instance?.destroy();
      } else {
        onLayoutScroll();
      }
    };

    const timer = window.setTimeout(() => {
      const availableSteps = getUserTourSteps(role, mobile).filter(
        (step): step is UserTourStep & { selector: string } =>
          Boolean(step.selector && document.querySelector(step.selector))
      );
      if (availableSteps.length === 0) return;

      const steps: DriveStep[] = availableSteps.map(step => {
        const isNav = step.selector.includes('data-testid="nav-');
        return {
          // Resolver al entrar en cada paso, nunca durante la carga inicial.
          element: () => findRenderableTarget(step.selector) as Element,
          disableActiveInteraction: true,
          popover: {
            title: step.title,
            description: step.description,
            side: isNav && !mobile ? "right" : "bottom",
            align: mobile ? "center" : "start"
          }
        };
      });

      const showStep = async (initialIndex: number, direction: 1 | -1) => {
        if (navigating || stopped) return;
        navigating = true;
        try {
          for (let index = initialIndex; index >= 0 && index < availableSteps.length; index += direction) {
            const step = availableSteps[index];
            if (mobile) {
              await prepareMobileSidebar(step.selector.includes('data-testid="nav-'));
            }
            if (stopped) return;

            const target = findRenderableTarget(step.selector);
            if (!target) continue;
            target.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
            await wait(60);
            if (stopped || !findRenderableTarget(step.selector)) continue;
            if (instance?.isActive()) instance.moveTo(index);
            else instance?.drive(index);
            return;
          }

          if (direction === 1) finished = true;
          instance?.destroy();
        } finally {
          navigating = false;
        }
      };

      instance = driver({
        showProgress: true,
        allowClose: true,
        smoothScroll: false,
        nextBtnText: "Siguiente",
        prevBtnText: "Anterior",
        doneBtnText: "Finalizar",
        steps,
        onNextClick: (_element, _step, { driver: current }) => {
          if (current.hasNextStep()) {
            void showStep((current.getActiveIndex() ?? 0) + 1, 1);
          } else {
            finished = true;
            current.destroy();
          }
        },
        onPrevClick: (_element, _step, { driver: current }) => {
          void showStep((current.getActiveIndex() ?? 0) - 1, -1);
        },
        onCloseClick: (_element, _step, { driver: current }) => current.destroy(),
        onDestroyed: () => {
          stopped = true;
          if (mobile && mobileSidebarIsOpen()) {
            document.querySelector<HTMLButtonElement>('[data-testid="button-close-sidebar"]')?.click();
          }
          if (started) {
            localStorage.setItem(storageKey, finished ? "completed" : "skipped");
          }
        }
      });

      window.addEventListener("scroll", onLayoutScroll, true);
      window.addEventListener("resize", onResize);
      started = true;
      void showStep(0, 1);
    }, 800);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", onLayoutScroll, true);
      window.removeEventListener("resize", onResize);
      instance?.destroy();
    };
  }, [user?.id, user?.role]);
}
