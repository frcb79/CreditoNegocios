import { useEffect } from 'react';
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from './useAuth';

function isElementVisible(element: Element | null): boolean {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

async function waitForVisibleSelectors(selectors: string[], timeoutMs = 6000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const allVisible = selectors.every((selector) => isElementVisible(document.querySelector(selector)));
    if (allVisible) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export function useUserTour() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'broker' && user.role !== 'master_broker') return;

    const hasSeenTour = localStorage.getItem(`hasSeenTour_${user.id}`);
    if (hasSeenTour) return;

    const tourSteps = [
      {
        element: '[data-testid="header-title"]',
        popover: {
          title: '¡Bienvenido a Crédito Negocios!',
          description: 'Hola ' + user.firstName + ', estamos felices de tenerte aquí. Vamos a darte un recorrido rápido por la plataforma.',
          side: "bottom",
          align: 'start'
        }
      },
      {
        element: '[data-testid="metrics-grid"]',
        popover: {
          title: 'Tus Métricas',
          description: 'Aquí puedes ver un resumen de tu actividad, volumen colocado y comisiones.',
          side: "bottom",
          align: 'start'
        }
      },
      {
        element: '[data-testid="nav-clientes"]',
        popover: {
          title: 'Gestión de Clientes',
          description: 'Registra y administra a tus clientes aquí. Es el primer paso para solicitar un crédito.',
          side: "right",
          align: 'start'
        }
      },
      {
        element: '[data-testid="nav-gestión-de-créditos"]',
        popover: {
          title: 'Tus Solicitudes',
          description: 'Sigue el estado de todas tus solicitudes de crédito en tiempo real.',
          side: "right",
          align: 'start'
        }
      },
      {
        element: '[data-testid="nav-financieras"]',
        popover: {
          title: 'Financieras Aliadas',
          description: 'Consulta las instituciones financieras disponibles y sus productos.',
          side: "right",
          align: 'start'
        }
      },
      {
        element: '[data-testid="nav-comisiones"]',
        popover: {
          title: 'Comisiones',
          description: 'Monitorea tus comisiones pagadas y pendientes para tener visibilidad total de tus ingresos.',
          side: "right",
          align: 'start'
        }
      },
      {
        element: '[data-testid="nav-configuración"]',
        popover: {
          title: 'Tu Perfil',
          description: 'Configura tu información personal, contraseña y preferencias.',
          side: "right",
          align: 'start'
        }
      },
      {
        popover: {
          title: '¡Todo listo!',
          description: 'Ya puedes empezar a usar la plataforma. Si tienes dudas, contacta a soporte.',
        }
      },
    ];

    const requiredStepSelectors = tourSteps
      .map((step) => step.element)
      .filter((selector): selector is string => Boolean(selector));

    const driverObj = driver({
      showProgress: true,
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      doneBtnText: 'Finalizar',
      steps: tourSteps,
      onDestroyed: () => {
        localStorage.setItem(`hasSeenTour_${user.id}`, 'true');
      }
    });

    // Wait until all tour targets are rendered and visible.
    const timer = setTimeout(async () => {
      await waitForVisibleSelectors(requiredStepSelectors);
      driverObj.drive();
    }, 300);

    return () => clearTimeout(timer);
  }, [user]);
}
