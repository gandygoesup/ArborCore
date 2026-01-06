# ArborCore Design Guidelines

## Design Approach

**Selected System:** Carbon Design System (IBM)  
**Rationale:** ArborCore is a data-intensive, enterprise-focused SaaS requiring robust form handling, complex table views, multi-step workflows, and role-based interfaces. Carbon excels at information-dense applications with its structured grid system, comprehensive component library, and emphasis on productivity over decoration.

**Core Design Principles:**
1. **Clarity Over Decoration** - Every element serves a functional purpose
2. **Density with Breathing Room** - Pack information efficiently while maintaining scannability
3. **Workflow Efficiency** - Minimize clicks and cognitive load for repetitive tasks
4. **State Transparency** - Make system state (approvals, overrides, payments) immediately visible
5. **Trust Through Consistency** - Predictable patterns across all modules build user confidence

---

## Typography

**Font Family:** 
- Primary: IBM Plex Sans (via Google Fonts CDN)
- Monospace: IBM Plex Mono (for IDs, codes, financial values)

**Type Scale:**
- Page Titles: text-3xl font-semibold (30px)
- Section Headers: text-xl font-semibold (20px)
- Subsection Headers: text-base font-semibold (16px)
- Body Text: text-sm (14px)
- Supporting/Meta Text: text-xs (12px)
- Data Tables: text-sm (14px body), text-xs (12px headers)

**Hierarchy Rules:**
- All-caps with letter-spacing for table column headers and status badges
- Semibold weight for interactive elements (buttons, tabs, actionable items)
- Regular weight for readonly data display
- Financial values always in tabular figures (monospace)

---

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, and 8
- Component padding: p-4 or p-6
- Section spacing: space-y-6 or space-y-8
- Tight groupings: space-y-2 or space-y-4
- Page margins: p-8 for main content areas

**Grid Structure:**
- Primary container: max-w-7xl mx-auto
- Two-column layouts: 60/40 or 70/30 split (form left, context right)
- Three-column dashboards: equal thirds for metric cards
- Full-width data tables with horizontal scroll on overflow

**Responsive Breakpoints:**
- Mobile: Single column, collapsible navigation drawer
- Tablet (md:): Two-column forms, persistent sidebar
- Desktop (lg:): Full multi-column layouts, expanded navigation

---

## Component Library

### Navigation
- **Top Bar:** Persistent across all pages with company logo, global search, user menu, notification bell
- **Sidebar:** Collapsible left navigation with module grouping (CRM, Jobs, Scheduling, Billing, Settings)
- **Breadcrumbs:** Below top bar for deep navigation context

### Data Display
- **Tables:** Striped rows, sticky headers, sortable columns, row selection checkboxes, inline action menus (kebab)
- **Cards:** Subtle borders (border-gray-200), no shadows, used for metric summaries and list items
- **Status Badges:** Pill-shaped with ALL-CAPS text, positioned consistently top-right in cards
- **Timeline:** Vertical left-aligned for job history and audit logs

### Forms
- **Input Groups:** Label-input-helper text vertical stack with space-y-2
- **Multi-Step Wizards:** Horizontal stepper indicator at top, progress bar, clear previous/next/submit actions
- **Validation:** Inline error messages below fields, error state border treatment
- **Field Widths:** Semantic sizing (postal code: w-24, phone: w-40, full name: w-full)

### Actions
- **Primary Buttons:** Solid fill, high contrast
- **Secondary Buttons:** Outlined with hover state
- **Destructive Actions:** Require confirmation modal, use danger styling
- **Overflow Menus:** Three-dot kebab for contextual actions within tables/cards

### Overlays
- **Modals:** Max-w-2xl, header with title and close X, footer with aligned action buttons
- **Toasts:** Top-right notifications for success/error feedback, auto-dismiss after 5s
- **Popovers:** Contextual help and quick actions, appear on hover/click near trigger

### State Indicators
- **OVERRIDDEN Flag:** Persistent orange badge with exclamation icon, appears in job cards, calendar events, and detail headers
- **Payment Status:** Green (Paid), Yellow (Pending), Red (Overdue), Gray (Draft)
- **Job Lifecycle:** Progress indicator showing current stage in Lead → Estimate → Scheduled → Completed → Paid flow

---

## Module-Specific Patterns

### Estimate Builder
- Left panel: Multi-step form with collapsible sections (Job Details, Tree Inventory, Pricing)
- Right panel: Live estimate preview (readonly values from server)
- Bottom sticky footer: Total display and Send Estimate action button

### Scheduling Calendar
- Week/Month view toggle
- Crew rows with time-blocked job cards (drag-and-drop zones)
- Equipment availability sidebar showing conflicts in real-time
- Override indicator on conflicted assignments

### Invoice Management
- Milestone invoice cards in horizontal timeline layout
- Stripe payment button prominently placed, disabled if already paid
- Audit trail accordion showing all payment events

### Dashboard
- Top metric cards: Revenue, Outstanding Invoices, Active Jobs, Completion Rate
- Main area: Split between Recent Estimates table and Job Pipeline kanban view
- Filters/search toolbar sticky at top of data views

---

## Icons

**Library:** Heroicons (via CDN)  
Use Outline variants for navigation and neutral actions, Solid variants for active states and primary CTAs

---

## Animations

**Minimal Use Only:**
- Smooth transitions for dropdown menus and modal overlays (150ms ease)
- Subtle loading spinners for async operations
- No scroll-triggered animations, parallax, or decorative motion

---

## Images

**Strategic Placement:**
- Company logo upload in settings (displayed in top nav and estimate PDFs)
- Job site photos in estimate detail view and crew job packets (thumbnail grid, expandable to lightbox)
- Equipment photos in equipment registry (small avatar-style images)
- No hero images or marketing imagery in core application interface

This is a **productivity-first, data-dense application**. Visual restraint and functional clarity take absolute precedence over aesthetic experimentation.