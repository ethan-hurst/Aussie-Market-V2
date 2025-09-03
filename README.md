# Aussie-Market-V2 - C2C Auction Marketplace

[![CI](https://github.com/ethan-hurst/Aussie-Market-V2/actions/workflows/ci.yml/badge.svg)](https://github.com/ethan-hurst/Aussie-Market-V2/actions/workflows/ci.yml)
 [![Canary](https://github.com/ethan-hurst/Aussie-Market-V2/actions/workflows/canary.yml/badge.svg)](https://github.com/ethan-hurst/Aussie-Market-V2/actions/workflows/canary.yml)

A TradeMe-style C2C auction platform for Australia, focused on regular people auctioning items with trust features including ID-verified sellers, on-platform payments, pickup verification, and clear dispute flow.

## 🎯 Project Overview

This is a comprehensive auction marketplace built with **SvelteKit** (frontend) and **Supabase** (backend) that provides:

- **Secure Authentication** with role-based access control
- **KYC Verification** for sellers via Stripe Identity
- **Proxy Bidding** with anti-sniping protection
- **On-Platform Payments** with Stripe integration
- **Local Pickup** with QR code verification
- **Shipping Integration** with tracking
- **In-App Messaging** with safety filters
- **Dispute Resolution** system
- **Admin Console** for moderation and management

## 🏗️ Architecture

### Frontend
- **SvelteKit** with TypeScript
- **Tailwind CSS** for styling
- **TanStack Query** for data fetching
- **Zod** for form validation

### Backend
- **Supabase** as the primary backend
  - **Postgres** database with RLS
  - **Auth** for authentication
  - **Realtime** for live updates
  - **Storage** for file uploads
  - **Edge Functions** for serverless logic

### External Integrations
- **Stripe** for payments and KYC
- **PayPal** (optional) for alternative payments
- **Shipping providers** for label generation and tracking

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Supabase CLI
- Stripe account
- Git

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Aussie-Market-V2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set up Supabase

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Initialize Supabase project
supabase init

# Start local development
supabase start

# Apply database schema
supabase db reset
```

### 4. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret
PUBLIC_SITE_URL=http://localhost:5173
```

Health check endpoint:

- GET `/api/health` returns `{ ok, errors, warnings, services }` and HTTP 200/503 based on startup validation.

### 5. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## 📁 Project Structure

```
Aussie-Market-V2/
├── src/
│   ├── routes/                 # SvelteKit routes
│   │   ├── +layout.svelte     # Main layout
│   │   ├── +page.svelte       # Home/feed page
│   │   ├── login/             # Authentication
│   │   ├── account/           # User account management
│   │   ├── sell/              # Listing creation
│   │   ├── l/[listingId]/     # Listing details
│   │   ├── a/[auctionId]/     # Live auction
│   │   ├── checkout/          # Payment checkout
│   │   ├── orders/            # Order management
│   │   ├── messages/          # In-app messaging
│   │   └── admin/             # Admin console
│   ├── lib/                   # Utility functions
│   │   ├── auth.ts           # Authentication utilities
│   │   ├── supabase.ts       # Supabase client
│   │   ├── stripe.ts         # Stripe integration
│   │   └── validation.ts     # Form validation
│   └── components/           # Reusable components
├── database/
│   └── schema.sql            # Database schema
├── supabase/
│   ├── config.toml           # Supabase configuration
│   ├── functions/            # Edge Functions
│   └── migrations/           # Database migrations
├── tests/                    # Test files
└── docs/                     # Documentation
```

## 🔧 Development Workflow

### Database Changes

1. Make changes to `database/schema.sql`
2. Generate migration: `supabase db diff -f migration_name`
3. Apply migration: `supabase db push`

### Edge Functions

Edge Functions are located in `supabase/functions/`:

- `finalize_auctions` - Processes ended auctions
- `pickup_redeem` - Handles pickup verification
- `shipping_webhook` - Processes shipping updates
- `stripe_webhook` - Handles Stripe events
- `moderation_scan` - Content moderation

### Auction Finalization (Cron & Manual)

- Database RPCs: `end_auction(auction_id UUID)` and `end_expired_auctions()`
- Cron: a pg_cron schedule runs every minute to execute `SELECT public.end_expired_auctions();`
- Manual trigger (for local/testing):

```bash
curl -X POST http://localhost:5173/api/auctions/process-expired
```

When an auction is finalized, an `orders` row is created with `state=pending_payment`, `platform_fee_cents`, `seller_amount_cents`, and `winning_bid_id`, and buyer/seller notifications are inserted.

### Testing

```bash
# Run all tests with coverage
npm test -- --coverage
```

### Database schema validation

We ship a lightweight schema validation suite to catch drift and missing security controls.

Local run (requires a Postgres URL):

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
psql $DATABASE_URL -v ON_ERROR_STOP=1 -f database/schema.sql
npm run db:test
psql $DATABASE_URL -v ON_ERROR_STOP=1 -f database/tests/002_rls_policies.sql
psql $DATABASE_URL -v ON_ERROR_STOP=1 -f database/tests/003_fk_indexes.sql
```

CI runs the same via `.github/workflows/db-validate.yml` on pushes and PRs.

### Canary (Staging Stripe/Webhooks)

The repository includes a scheduled canary that validates the Stripe webhook path and idempotency on staging.

Secrets required in GitHub for canary:

- `STAGING_SITE_URL` – Base URL of the deployed staging site (e.g., https://staging.example.com)
- `CANARY_TOKEN` – Shared secret for the secured canary endpoint
- `STRIPE_SECRET_KEY` – Stripe test secret key (sk_test_...)
- `STRIPE_WEBHOOK_SECRET` – Stripe webhook signing secret for staging endpoint

Manual run:

```bash
gh workflow run canary.yml -f env=staging
```


## 🎯 Key Features

### Authentication & KYC
- Email/password authentication
- Role-based access control (buyer, seller, moderator, admin)
- Stripe Identity integration for seller verification
- Secure session management

### Auction System
- Timed English auctions
- Proxy bidding with automatic increments
- Anti-sniping protection (extends auction if bid in last 2 minutes)
- Reserve prices and buy-now options
- Real-time updates via Supabase Realtime

### Payment Processing
- Stripe Checkout for initial payments
- Payment Intents for auction finalization
- Stripe Connect for seller payouts
- Double-entry ledger system for financial tracking
- Fund holding until pickup/delivery verification

### Trust & Safety
- Content moderation and filtering
- Dispute resolution system
- Evidence upload for disputes
- Admin moderation tools
- Audit logging for sensitive operations

### Fulfillment
- QR code generation for local pickup
- 6-digit code verification
- Optional shipping with tracking
- Automatic fund release on verification

## 📊 Performance Targets

- **≥75% GMV** via on-platform payments
- **Dispute rate ≤0.6%**
- **Median pickup completion ≤48h** from auction close
- **p75 LCP ≤2.5s**
- **p95 write latency <150ms**

## 🔒 Security Features

- Row Level Security (RLS) on all tables
- JWT token rotation
- CSRF protection
- Input sanitization and validation
- Secure file uploads with signed URLs
- Audit logging for sensitive operations

## 🚀 Deployment

### Production Setup

1. Create Supabase project
2. Configure environment variables
3. Deploy Edge Functions
4. Set up monitoring and alerts
5. Configure backup schedules

### Monitoring

- Supabase dashboard for database metrics
- Edge Function logs
- Sentry for error tracking
- Custom metrics for business KPIs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation in `/docs`
- Review the project specification

## 🗺️ Roadmap

- [ ] Native mobile apps
- [ ] BNPL integration
- [ ] Crypto payments
- [ ] Store/enterprise accounts
- [ ] Motors/real estate verticals
- [ ] Social graph features


