# ArborCore

## Overview

ArborCore is a multi-tenant SaaS platform designed for tree service businesses, offering comprehensive management capabilities including CRM, lead tracking, cost profiling, scheduling, and billing. It is built as an enterprise-focused, full-stack TypeScript application with a React frontend and Express backend, utilizing PostgreSQL for data persistence and Replit Auth for authentication. The platform emphasizes robust form handling, complex table views, role-based interfaces, and strict server-side enforcement of business logic and pricing calculations. Its core ambition is to streamline operations and enhance profitability for tree service companies.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (server state), React hooks (local state)
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS with custom design tokens (Carbon Design System principles)
- **Build Tool**: Vite

### Backend
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful endpoints (`/api/*`)
- **Authentication**: Replit OpenID Connect with Passport.js
- **Session Management**: PostgreSQL-backed sessions via `connect-pg-simple`

### Data Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with Zod schema validation
- **Schema**: `shared/schema.ts`
- **Migrations**: Drizzle Kit

### Multi-Tenancy
- Company-scoped data isolation.
- Role-based permissions for users within companies.

### Key Design Decisions
- **Server-Side Pricing Enforcement**: All pricing and calculations are computed server-side to ensure integrity.
- **Immutable Snapshots**: Cost profiles are versioned, estimates are immutable post-send, and paid invoices are locked.
- **Cost Calculation Service**: Centralized service (`server/services/costCalculation.ts`) for labor, equipment, overhead, and pricing thresholds.
- **Audit Logging**: Tracks state changes and pricing decisions.
- **Dynamic RBAC**: Admin UI for creating custom roles, managing permissions grouped by module, and assigning roles to users. System roles are protected from modification.
- **Single-Day Scheduling Model**: MVP supports single-day crew and equipment assignments with conflict detection.
- **Contracts**: Automatic generation and customer signing via magic links; templates are company-scoped.
- **Payment Plan Portal**: Customer-facing portal for tracking payment progress, making payments, and submitting service requests.

### Core Entities & Features
- **Jobs**: Manages job lifecycle (pending to closed), links estimates, scheduling, and billing.
- **Payment Processing**: Stripe integration with webhook-based state management and a robust invoice state machine.
- **Pricing Tool**: A two-step wizard for quick, guided estimate pricing based on tree counts and site conditions, generating work items and initial pricing.
- **Scheduling**: Manages `crews`, `equipment`, `crewAssignments`, and `equipmentReservations` with conflict detection.
- **SMS Integration**: Twilio-based service for sending magic links and reminders via SMS.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store and session storage.

### Authentication
- **Replit Auth**: OpenID Connect for user authentication.

### Payment Processing
- **Stripe**: For payment gateway and webhook-based payment state management.

### Communication
- **Twilio**: For sending SMS messages (estimates, invoices, contracts, reminders).

### UI/Utilities
- **Radix UI**: Headless UI primitives.
- **Lucide React**: Icon library.
- **React Hook Form**: Form management with Zod validation.
- **date-fns**: Date manipulation.