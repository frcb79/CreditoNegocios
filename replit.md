# Overview

This project is a comprehensive fintech broker application designed for the Mexican market. Its main goal is to enable brokers to efficiently manage their credit portfolios, client relationships, and commission payments. The system supports various user roles (admins, master brokers, individual brokers) with robust role-based access control. Key features include client management, credit pipeline tracking, document handling, re-gestión opportunities, broker network management, STP payment integration, and extensive reporting. The vision is to streamline financial operations and enhance client interaction for credit brokers in Mexico, fostering business growth and market potential.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React with TypeScript (Vite)
- **UI/UX**: Radix UI, shadcn/ui, Tailwind CSS. Includes consistent styling for placeholders, search inputs, inactive product templates, and currency formatting (`toLocaleString('es-MX')`).
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts
- **Key Features**:
    - **Product Configuration**: Supports range-based requirements (currency, score, months).
    - **Client Credit Request History**: Displays all client credit submissions with per-institution status and details.
    - **Final Credit Proposal**: Captures interest rate, opening commission, and description.
    - **Product System**: Manages product templates by client profiles (Persona Moral, PFAE, Persona Física, Sin SAT) with visual differentiation for inactive templates and color-coded category badges.
    - **Credit Form**: Streamlined for Client, Credit Type, Amount, and Credit Purpose.
    - **Commission System**: 3-tier flow (Financiera → Admin → Master Broker → Broker) with configurable rates for various commission types.
    - **Intelligent Matching System**: Evaluates client profiles against financial institution requirements, categorizing institutions as Recommended, Compatible, or Other with visual indicators, scores, and detailed tooltips.
    - **Credit Submission Workflow**: Comprehensive request-to-dispersion lifecycle, including broker submission, admin review, institution proposals, broker comparison, winner selection, and disbursement. Features document management, status tracking, role-based access, and Admin Quality Control for returning submissions with feedback.
    - **Financial Institution Requirements Configuration**: Comprehensive profiling field requirements system per client type, including range configurations, Opinion de Cumplimiento acceptance modes, type-specific guarantee multipliers, additional notes, and maximum thresholds for "Participación de Ventas con Gobierno". Automatically copies `targetProfiles` to `institution_product` and standardizes category names.
    - **Broker-Specific Features**:
        - **Role-Based Data Access**: Brokers only see their own clients, credits, commissions, documents, and re-gestión opportunities.
        - **Financial Institution Request System**: Allows brokers to request new financial institutions, notifying admins for review.
        - **Broker-Facing Financieras View**: Read-only catalog of financial institutions with Proceso, Productos, and Requisitos tabs displaying active products and detailed requirements.
        - **Simplified Product View**: Read-only display of active products for brokers.
        - **Enhanced Dashboard Metrics**: Displays pipeline, disbursement, and commission metrics with month-over-month trends for brokers and their networks.
        - **Settings/Configuración Enhancements**: Structured address management (7 fields), broker profiling metrics (years in business, client portfolio size, annual placement goal, products handled, average ticket size), and simplified "Solicitar Baja de Cuenta" feature with admin notification.
        - **Simplified Broker Profile Questionnaire**: Perfilamiento tab now has streamlined sections: Commercial References (dynamic list with name/phone/email and add-more functionality) and Banking Information (bank selector for Mexican banks, CLABE interbancaria, account holder name) for commission payments.
    - **UI Navigation Changes**: Sidebar adjusted for broker role, hiding "Red de Brokers" and "Reportes".
    - **Excel Bulk Import System** (Admin/Super Admin only):
        - **Route**: `/importacion-masiva`
        - **Templates**: Downloadable Excel templates for Financieras+Productos and Clients (separate sheets per client type)
        - **Financieras Template Structure**: One row per product per client profile per institution. 32 columns covering institution data, product details (tipo, plazo, tasa, comisión apertura, destinos), matching requirements (monto min/max, edad min/max, antigüedad, ingresos, buró scores, garantía, opinión cumplimiento, participación ventas gobierno), operational info (presencia, giros prohibidos, tiempo respuesta), and commissions.
        - **Import Logic**: Detects existing financieras by name (case-insensitive), creates/updates `requirements` JSONB with `ranges` structure for intelligent matching, creates ProductTemplates and InstitutionProducts, deduplicates institution products, persists template profile updates. Uses most-permissive merge when multiple products have different requirements for the same profile.
        - **Profile Normalization**: Accepts aliases like "Persona Moral", "PM", "PFAE", "Persona Física", "PF", "Sin SAT" and normalizes to system keys.
        - **Features**: Drag-and-drop upload, row-by-row validation with field-level error messages, preview before import
        - **API Endpoints**: `/api/import/template/:type`, `/api/import/preview/:type`, `/api/import/financieras`, `/api/import/clients`
        - **Security**: All endpoints protected with isAuthenticated and admin/super_admin role check via `requirePlatformRole()`
        - **File Limits**: 10MB max, .xlsx/.xls only
    - **Financial Institution Detail Enhancements**:
        - **AcceptedProfiles Display**: Shows color-coded badges for client profiles (Persona Moral, PFAE, Persona Física, Sin SAT) with fallback message when empty.
        - **Comisiones Tab**: New 4th tab displaying commission rate breakdowns for Financiera, Master Broker, and Broker roles with detailed fields (Total, Apertura, Sobretasa, Renovación).

## Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ES modules)
- **Database ORM**: Drizzle ORM
- **Authentication**: Replit Auth with OpenID Connect
- **Session Management**: Express sessions (PostgreSQL store)
- **File Uploads**: Multer
- **Real-time**: WebSocket integration
- **Scheduled Tasks**: Node-cron

## Database Design
- **Primary Database**: PostgreSQL (Neon Database)
- **Schema Management**: Drizzle migrations
- **Key Tables**: Users, Clients, Credits, Financial Institutions, Commissions, Documents, Notifications.
- **Schema Updates**: Includes `productTemplateId`, `necessity`, `purpose` in credits; `finalProposal` JSONB; `commissionRates` JSONB; `creditSubmissionTargets` for proposal management.

## Authentication & Authorization
- **Authentication Provider**: Replit Auth (OAuth 2.0/OIDC)
- **Session Management**: Encrypted PostgreSQL-stored sessions.
- **Role-based Access**: Three-tier system (admin, master_broker, broker) with API security and frontend route protection.
- **Security Hardening**: Enforces authentication for sensitive endpoints and restricts role escalation.

## File Management
- **Upload Handling**: Multer for images (JPEG, PNG) and documents (PDF, DOC, DOCX) with type/size validation.
- **Storage**: Local filesystem.
- **Document Types**: RFC, CURP, proof of address, financial statements, business licenses.

## Real-time Features
- **WebSocket Server**: Provides live updates.
- **Notification System**: Real-time push notifications for credit, document, and commission updates, with role-based broadcasting.

# External Dependencies

## Core Infrastructure
- **Database**: Neon Database (PostgreSQL)
- **Authentication**: Replit Auth
- **Session Store**: connect-pg-simple

## Payment Integration
- **STP Payments**: Simulated STP (Sistema de Transferencias y Pagos) for Mexico

## Development Tools
- **Build System**: Vite
- **Code Quality**: TypeScript strict mode

## UI Components
- **Component Library**: Radix UI
- **Design System**: shadcn/ui
- **Icons**: Font Awesome
- **Typography**: Google Fonts

## Utilities & Libraries
- **Date Handling**: date-fns
- **Password Security**: bcrypt
- **Form Validation**: Zod
- **Caching**: Memoizee
- **File Processing**: Multer
- **PDF Generation**: PDFKit
- **Excel Processing**: xlsx (for bulk import/export)