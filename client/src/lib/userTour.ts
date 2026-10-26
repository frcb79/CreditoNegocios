/**
 * Recorridos breves de incorporación: describen el flujo comercial real.
 * Los puntos no disponibles se explican sin resaltado, nunca se eliminan.
 */
export interface UserTourStep {
  selector?: string;
  title: string;
  description: string;
}

export const USER_TOUR_VERSION = "3";
export const USER_TOUR_QUERY_PARAM = "recorrido";
export const USER_TOUR_QUERY_VALUE = "inicio";

export function getUserTourStorageKey(userId: string, role: string): string {
  return "userTour:" + USER_TOUR_VERSION + ":" + userId + ":" + role;
}

export function getLegacyUserTourStorageKey(userId: string): string {
  return "hasSeenTour_" + userId;
}

const welcome: UserTourStep = {
  selector: '[data-testid="header-title"]',
  title: "¡Bienvenido a Crédito Negocios!",
  description: "En este recorrido conocerás cómo empezar a trabajar: registrar prospectos, preparar solicitudes y darles seguimiento. Puedes cerrarlo y repetirlo desde Ayuda."
};

const help: UserTourStep = {
  selector: '[data-testid="nav-ayuda"]',
  title: "La ayuda siempre está disponible",
  description: "En Ayuda puedes repetir esta bienvenida. Encontrarás también pequeñas opciones de Ayuda rápida (?) dentro de las secciones, sin salir de ellas."
};

const commercialResources: UserTourStep = {
  selector: '[data-testid="nav-recursos-comerciales"]',
  title: "1. Promueve tus servicios con plantillas",
  description: "En Recursos comerciales encontrarás publicaciones autorizadas para compartir en tus redes. Descarga el PNG con tu nombre y WhatsApp, y copia el texto con tu enlace personal de captación. Cada difusión también da visibilidad a Crédito Negocios. Las plantillas aparecerán conforme sean aprobadas."
};

const broker: UserTourStep[] = [
  {
    selector: '[data-testid="broker-quick-start"]',
    title: "Tu ruta para comenzar",
    description: "Primero difunde tus servicios con plantillas aprobadas; después registra prospectos, captura su necesidad de financiamiento y da seguimiento al trámite. Puedes usar los accesos rápidos de este panel."
  },
  commercialResources,
  {
    selector: '[data-testid="nav-clientes"]',
    title: "2. Registra un prospecto",
    description: "En Clientes presiona Nuevo Cliente. Elige Crédito Empresarial, Hipotecario Vivienda o Arrendamiento; cada ruta permite iniciar con información esencial."
  },
  {
    selector: '[data-testid="button-start-first-prospect"]',
    title: "3. Registra lo que necesita",
    description: "Desde el acceso para registrar un prospecto iniciarás su ficha. Al guardarlo, registra su necesidad, el monto solicitado y los datos disponibles. Puedes completar el perfil más adelante."
  },
  {
    selector: '[data-testid="nav-productos"]',
    title: "4. Revisa alternativas",
    description: "Consulta Productos y Financieras. La compatibilidad depende del perfil: si falta información, se mostrará como insuficiente y podrás completarla sin inventar datos."
  },
  {
    selector: '[data-testid="nav-gestión-de-créditos"]',
    title: "5. Da seguimiento al financiamiento",
    description: "En Gestión de Créditos consulta solicitudes, propuestas y avances. La plataforma facilita la gestión: no significa que la financiera haya aprobado el crédito."
  },
  {
    selector: '[data-testid="nav-comisiones"]',
    title: "6. Consulta tus comisiones",
    description: "Cuando existan operaciones elegibles, aquí podrás revisar comisiones y estados de pago según tu rol."
  }
];

const master: UserTourStep[] = [
  broker[0],
  commercialResources,
  broker[2],
  broker[3],
  {
    selector: '[data-testid="nav-red-de-brokers"]',
    title: "Coordina a tu red",
    description: "En Red de Brokers consulta a los integrantes de tu estructura y da seguimiento a su actividad sin alterar la titularidad de sus operaciones."
  },
  broker[4],
  broker[5]
];

const admin: UserTourStep[] = [
  {
    selector: '[data-testid="metrics-grid"]',
    title: "Vista de la operación",
    description: "El panel muestra las métricas y prioridades de seguimiento correspondientes a tu rol."
  },
  {
    selector: '[data-testid="nav-usuarios"]',
    title: "1. Usuarios e invitaciones",
    description: "Consulta y administra los accesos dentro de tus permisos. Los usuarios reciben enlaces para crear su propia contraseña."
  },
  {
    selector: '[data-testid="nav-aprobaciones"]',
    title: "2. Operaciones pendientes",
    description: "Revisa qué solicitudes necesitan validación y cuáles siguen en trámite."
  },
  {
    selector: '[data-testid="nav-financieras"]',
    title: "3. Financieras",
    description: "Consulta las instituciones aliadas y su información operativa."
  },
  {
    selector: '[data-testid="nav-productos"]',
    title: "4. Productos y ofertas",
    description: "Consulta los productos y las ofertas disponibles. El acceso para editar o publicar depende de tus permisos."
  }
];

export function getUserTourSteps(role: string, mobile: boolean): UserTourStep[] {
  const adminSteps = role === "super_admin"
    ? [...admin, {
        selector: '[data-testid="nav-auditoría-administrativa"]',
        title: "Auditoría administrativa",
        description: "En Super Admin puedes revisar el historial de acciones administrativas."
      }]
    : admin;

  const steps = role === "broker" ? broker :
    role === "master_broker" ? master :
    (role === "admin" || role === "super_admin") ? adminSteps : broker;

  const result = [welcome, ...steps, help];

  if (!mobile) return result;

  // La guía abre el menú móvil antes de cada paso de navegación.
  // Anclar directamente a la opción real, no al botón de abrir menú
  // ni a un popover centrado sin destino.
  return result.map(step => {
    if (!step.selector?.startsWith('[data-testid="nav-')) return step;
    return { ...step, selector: step.selector.replace('"]', '-mobile"]') };
  });
}
