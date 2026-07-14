# FarmXpert - Cattle Feedlot Management SaaS

## Overview
FarmXpert is a multi-tenant SaaS solution designed for cattle feedlot management in Pakistan. It helps farm owners and managers track cattle, manage feed, optimize weight gain, and handle Qurbani sales. The platform aims to streamline operations, improve efficiency, and provide data-driven insights for better farm management, including an AI-powered advisor for recommendations.

## User Preferences
- I want iterative development.
- Ask before making major changes.
- I prefer detailed explanations.
- Do not make changes to the folder `Z`.
- Do not make changes to the file `Y`.

## System Architecture

### UI/UX Decisions
The frontend uses React 18 with TypeScript, Vite, and Tailwind CSS, focusing on a responsive and modern design. The authentication landing page features an emerald/teal color theme. The SaaS Admin panel is mobile-responsive with a card-based layout.
- **Dark Mode**: Toggle with localStorage persistence and SSR-safe hydration using ThemeContext.
- **Multi-language**: English/Urdu support with RTL for Urdu (Noto Nastaliq Urdu font), stored in localStorage.

### Technical Implementations
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL
- **AI**: Google Gemini API for AI Advisor features (recommendations, growth predictions).
- **Authentication**: Professional email-based registration with verification, bcrypt for password hashing (12 rounds), JWT tokens (7-day expiry), and password reset functionality. Gmail is used for email services (verification, password reset, welcome emails).
- **Multi-tenancy**: Role-based access control (Owner, Manager, Labor, SAAS_ADMIN, ANIMAL_OWNER) and tenant isolation are core to the system.
- **Animal Owner Accounts**: When registering a new animal with owner email, the system automatically creates an ANIMAL_OWNER account and sends a welcome email with password setup link. Animal owners have view-only access to their own animals' weight progress, costs, and status.
- **Dynamic Subscription Management**: SaaS Admin can manage subscription plans, pricing, and features dynamically.

### Feature Specifications
- **Cattle Management**: Inventory tracking, weight history, vaccination records, transactions, monthly charges, photo gallery (base64, max 10 photos @ 2MB each), YouTube video links, and document uploads (receipts, certificates - base64, max 20 docs @ 5MB each).
- **Feed Management**: Inventory of feed ingredients, nutritional data, and predefined feed ration packages.
- **Cost Breakdown Module**: Detailed per-animal cost tracking including Purchase, Feed, Medical, Vaccination, Labor, and Other costs. Features visual pie/bar charts for cost distribution analysis. Each animal has its own cost summary accessible via the "Cost Breakdown" tab in the animal detail view.
- **ROI Analysis**: Dashboard widget showing feed cost vs weight gain analysis with investment breakdown, cost per kg gained, and individual animal ROI metrics.
- **Supplier Management**: Tracking suppliers, purchases, and payment statuses.
- **Labour Management**: Workers, attendance, and wage processing.
- **Payment Tracking**: Management of cattle owner payments, including overdue payment notifications.
- **Qurbani Sales Tracking**: Module for managing Qurbani sales (Premium tier).
- **AI Advisor**: Provides farming recommendations and growth predictions (Premium tier).
- **SaaS Administration**: A dedicated admin panel for managing tenants, users, feature modules, farm status, subscription plans, billing, and payments. It includes MRR tracking and invoice management.

### System Design Choices
- The application is a multi-tenant SaaS with distinct feature tiers (BASIC, STANDARD, PREMIUM, CUSTOM).
- A robust API-driven backend handles all data and business logic.
- Data models are designed for scalability and clear relationships between tenants, users, cattle, feed, and subscription data.

## External Dependencies
- **Google Gemini API**: Used for AI-powered farming advice and growth predictions.
- **PostgreSQL**: Primary database for all application data.
- **Gmail SMTP**: Used for sending email notifications, including registration verification, password resets, low feed stock alerts, and overdue payment alerts.