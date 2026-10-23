/**
 * Recorrido inicial 2026: textos por rol vinculados únicamente a módulos reales.
 * No contiene reglas comerciales ni acciones que modifiquen información.
 */
export interface UserTourStep {
  selector?: string;
  title: string;
  description: string;
}

export const USER_TOUR_VERSION = "2";
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
  title: "Bienvenido a Crédito Negocios",
  description: "Conoce las herramientas de tu cuenta. Este recorrido es orientativo, puedes omitirlo y volver a iniciarlo desde Ayuda."
};

const metrics: UserTourStep = {
  selector: '[data-testid="metrics-grid"]',
  title: "Tu actividad de un vistazo",
  description: "Las cifras del panel se adaptan a tu rol. Aquí podrás revisar la actividad de tus operaciones."
};

const byRole: Record<string, UserTourStep[]> = {
  broker: [
    {
      selector: '[data-testid="nav-clientes"]',
      title: "Registra a tu primer prospecto",
      description: "En Clientes elige Nuevo Cliente y el tipo de operación: Empresarial, Hipotecario o Arrendamiento. Puedes comenzar con datos mínimos."
    },
    {
      selector: '[data-testid="nav-gestión-de-créditos"]',
      title: "Da seguimiento a tus solicitudes",
      description: "Consulta el avance de tus créditos y revisa los siguientes pasos de cada expediente."
    },
    {
      selector: '[data-testid="nav-productos"]',
      title: "Explora opciones de financiamiento",
      description: "Conoce los productos disponibles. Cuando falte información del cliente, puede ser necesario completar su perfil antes del matching."
    },
    {
      selector: '[data-testid="nav-comisiones"]',
      title: "Consulta tus comisiones",
      description: "Revisa tus operaciones y el estado de las comisiones que correspondan a tu gestión."
    }
  ],
  master_broker: [
    {
      selector: '[data-testid="nav-red-de-brokers"]',
      title: "Administra tu red",
      description: "Consulta los brokers de tu estructura y da seguimiento a su actividad, de acuerdo con tus permisos."
    },
    {
      selector: '[data-testid="nav-clientes"]',
      title: "Clientes y prospectos",
      description: "Registra prospectos y revisa sus expedientes. También puedes orientar a los miembros de tu red."
    },
    {
      selector: '[data-testid="nav-gestión-de-créditos"]',
      title: "Solicitudes de financiamiento",
      description: "Da seguimiento a las solicitudes que tu cuenta tiene permitido consultar."
    },
    {
      selector: '[data-testid="nav-comisiones"]',
      title: "Comisiones de tu operación",
      description: "Consulta tus comisiones y la información de tu red disponible para tu rol."
    }
  ],
  admin: [
    {
      selector: '[data-testid="nav-usuarios"]',
      title: "Gestiona usuarios",
      description: "Consulta usuarios e invitaciones desde Administración, respetando los permisos asignados."
    },
    {
      selector: '[data-testid="nav-aprobaciones"]',
      title: "Solicitudes que requieren atención",
      description: "Revisa las gestiones pendientes de intervención administrativa."
    },
    {
      selector: '[data-testid="nav-financieras"]',
      title: "Financieras aliadas",
      description: "Consulta las financieras vinculadas y la información de su catálogo."
    },
    {
      selector: '[data-testid="nav-productos"]',
      title: "Catálogo de productos",
      description: "Consulta la oferta de productos disponibles para la operación."
    }
  ],
  super_admin: [
    {
      selector: '[data-testid="nav-usuarios"]',
      title: "Usuarios e invitaciones",
      description: "Administra accesos de brokers y masters, así como beneficios y promociones."
    },
    {
      selector: '[data-testid="nav-aprobaciones"]',
      title: "Supervisa operaciones",
      description: "Revisa solicitudes y acciones que requieren validación administrativa."
    },
    {
      selector: '[data-testid="nav-productos"]',
      title: "Financieras y productos",
      description: "Supervisa catálogos y ofertas desde sus módulos, conforme al flujo de publicación."
    },
    {
      selector: '[data-testid="nav-auditoría-administrativa"]',
      title: "Consulta la auditoría",
      description: "Revisa acciones administrativas registradas sin modificar expedientes."
    }
  ]
};

export function getUserTourSteps(role: string, mobile: boolean): UserTourStep[] {
  const end: UserTourStep = {
    title: "Aquí puedes volver a aprender",
    description: "En Ayuda encontrarás el manual y preguntas frecuentes. Siempre podrás repetir esta bienvenida desde allí."
  };
  if (mobile) {
    return [
      welcome,
      metrics,
      {
        selector: '[data-testid="button-open-sidebar"]',
        title: "Explora el menú",
        description: role === "master_broker"
          ? "Abre el menú para consultar Clientes, Gestión de Créditos, Red de Brokers y Comisiones."
          : role === "admin" || role === "super_admin"
            ? "Abre el menú para consultar operaciones, catálogos, administración y Ayuda."
            : "Abre el menú para registrar clientes, consultar solicitudes, productos, comisiones y Ayuda."
      },
      end
    ];
  }

  return [
    welcome,
    metrics,
    ...(byRole[role] || byRole.broker),
    {
      selector: '[data-testid="nav-configuración"]',
      title: "Configura tu cuenta",
      description: "Revisa las secciones de tu perfil, seguridad y, cuando corresponda, documentos y convenios."
    },
    {
      selector: '[data-testid="nav-ayuda"]',
      title: "Centro de Ayuda",
      description: "Consulta el manual de uso, las preguntas frecuentes y el botón para repetir esta guía."
    },
    end
  ];
}
