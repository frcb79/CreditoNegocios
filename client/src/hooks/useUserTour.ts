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
 * The desktop and mobile sidebars both exist in the DOM, and the sidebar
 * re-renders whenever its queries or collapsed state change. Never retain
 * element references from the start of a tour: resolve on EACH step.
 *
 * An element is not usable when hidden, detached, or horizontally translated
 * outside the viewport (the closed mobile drawer). Vertically scrollable nav
 * items can be outside the viewport because driver.js scrolls them into view.
 */
export function findRenderableTarget(selector: string): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>(selector);
  for (const element of Array.from(elements)) {
    if (!element.isConnected || element.getClientRects().length === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 ||
        rect.right <= 0 || rect.left >= window.innerWidth) continue;
    let candidate: HTMLElement | null = element;
    let hidden = false;
    while (candidate) {
      const styles = window.getComputedStyle(candidate);
      if (styles.display === "none" || styles.visibility === "hidden" ||
          candidate.hasAttribute("inert") || candidate.getAttribute("aria-hidden") === "true") {
        hidden = true;
        break;
      }
      candidate = candidate.parentElement;
    }
    if (!hidden) return element;
  }
  return null;
}

/** Tours never depend on privileged sections being enabled for every account. */
const MOBILE_SIDEBAR_EVENT = "creditonegocios:tour-sidebar";
function setMobileTourSidebar(open: boolean) {
  window.dispatchEvent(new CustomEvent(MOBILE_SIDEBAR_EVENT, { detail: { open } }));
}

/**
 * Only new accounts start automatically. Users who skipped/closed their
 * previous welcome keep that decision and may replay from Ayuda at any time.
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
        window.history.state, "",
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
    let cancelled = false;
    let navigationTimer: number | null = null;
    const mobile = window.innerWidth < 1024;
    const tourSteps = getUserTourSteps(role, mobile);
    const anchoredSteps = tourSteps.map((step): DriveStep => ({
      // Resolve at the moment this step is displayed, after sidebar transitions
      // and data-driven re-renders. Do not give driver.js an obsolete DOM node.
      element: () => findRenderableTarget(step.selector!) as Element,
      disableActiveInteraction: true,
      popover: {
        title: step.title,
        description: step.description,
        side: step.selector?.includes("nav-") ? "right" : "bottom",
        align: "start"
      }
    }));

    function navigateTo(index: number, direction: 1 | -1, current: ReturnType<typeof driver>) {
      if (navigationTimer !== null) window.clearTimeout(navigationTimer);
      if (index >= tourSteps.length || index < 0) {
        if (index >= tourSteps.length) finished = true;
        setMobileTourSidebar(false);
        current.destroy();
        return;
      }
      const step = tourSteps[index];
      // The mobile drawer must be open before resolving nav-...-mobile.
      // Close it again for dashboard actions so the drawer does not obscure them.
      if (mobile) setMobileTourSidebar(Boolean(step.selector?.includes('nav-')));
      navigationTimer = window.setTimeout(() => {
        navigationTimer = null;
        if (cancelled || !current.isActive() && started) return;
        if (!step.selector || !findRenderableTarget(step.selector)) {
          // No anchor = no floating/centered or misleading explanation.
          // This also handles dismissed quick-start and RBAC-hidden modules.
          navigateTo(index + direction, direction, current);
          return;
        }
        if (!started) {
          started = true;
          current.drive(index);
        } else {
          current.moveTo(index);
          current.refresh();
        }
      }, mobile ? 380 : 50);
    }

    const timer = window.setTimeout(() => {
      if (cancelled || tourSteps.length === 0) return;
      instance = driver({
        showProgress: true,
        allowClose: true,
        smoothScroll: false,
        animate: false,
        stagePadding: 8,
        stageRadius: 8,
        popoverOffset: 12,
        popoverClass: "cn-user-tour-popover",
        nextBtnText: "Siguiente",
        prevBtnText: "Anterior",
        doneBtnText: "Finalizar",
        steps: anchoredSteps,
        onNextClick: (_element, _step, { driver: current }) =>
          navigateTo((current.getActiveIndex() ?? 0) + 1, 1, current),
        onPrevClick: (_element, _step, { driver: current }) =>
          navigateTo((current.getActiveIndex() ?? 0) - 1, -1, current),
        onCloseClick: (_element, _step, { driver: current }) => current.destroy(),
        onDestroyed: () => {
          if (navigationTimer !== null) window.clearTimeout(navigationTimer);
          setMobileTourSidebar(false);
          if (started && !cancelled) {
            localStorage.setItem(storageKey, finished ? "completed" : "skipped");
          }
        }
      });
      navigateTo(0, 1, instance);
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (navigationTimer !== null) window.clearTimeout(navigationTimer);
      instance?.destroy();
      setMobileTourSidebar(false);
    };
  }, [user?.id, user?.role]);
}
