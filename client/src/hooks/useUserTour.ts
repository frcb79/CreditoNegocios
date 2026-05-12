import { useEffect } from 'react';
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from './useAuth';
import type { DriveStep } from 'driver.js';

export function useUserTour() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const hasSeenTour = localStorage.getItem(`hasSeenTour_${user.id}`);
    if (hasSeenTour) return;

    const tourSteps: DriveStep[] = [
      {
        element: '#dashboard-title',
        popover: {
          title: '¡Bienvenido a Crédito Negocios!',
          description: 'Hola ' + user.firstName + ', estamos felices de tenerte aquí. Vamos a darte un recorrido rápido por la plataforma.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-testid="metrics-grid"]',
        popover: {
          title: 'Tus Métricas',
          description: 'Aquí puedes ver un resumen de tu actividad, volumen colocado y comisiones.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '[data-testid="nav-clientes"]',
        popover: {
          title: 'Gestión de Clientes',
          description: 'Registra y administra a tus clientes aquí. Es el primer paso para solicitar un crédito.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-testid="nav-gestión-de-créditos"]',
        popover: {
          title: 'Tus Solicitudes',
          description: 'Sigue el estado de todas tus solicitudes de crédito en tiempo real.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-testid="nav-financieras"]',
        popover: {
          title: 'Financieras Aliadas',
          description: 'Consulta las instituciones financieras disponibles y sus productos.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-testid="nav-configuración"]',
        popover: {
          title: 'Tu Perfil',
          description: 'Configura tu información personal, contraseña y preferencias.',
          side: 'right',
          align: 'start',
        },
      },
      {
        popover: {
          title: '¡Todo listo!',
          description: 'Ya puedes empezar a usar la plataforma. Si tienes dudas, contacta a soporte.',
        },
      },
    ];

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

    // Short delay to ensure components are mounted
    const timer = setTimeout(() => {
      driverObj.drive();
    }, 1000);

    return () => clearTimeout(timer);
  }, [user]);
}
