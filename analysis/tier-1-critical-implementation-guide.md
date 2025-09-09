# Tier 1 Critical Implementation Guide
## 12 MVP-Blocking Functionalities - Technical Specifications

**Priority:** CRITICAL - MVP Blockers
**Timeline:** 2-4 weeks  
**Status:** Ready for Development

---

## 1. Pickup Code Redemption System

### Current State Analysis
- ✅ Database: `pickups` table with `code6_hash`, `qr_token` fields
- ❌ UI: No redemption interface
- ❌ API: No redemption validation endpoint

### Missing Components

**Frontend Routes Needed:**
- `/orders/[orderId]/pickup/redeem` - Buyer redemption page
- `/orders/seller/pickup-codes` - Seller code management
- QR code scanner component integration

**API Endpoints Needed:**
- `POST /api/pickup/[orderId]/generate` - Generate pickup codes
- `POST /api/pickup/[orderId]/redeem` - Validate and redeem codes  
- `GET /api/pickup/[orderId]/status` - Check redemption status

**Database Updates:**
- Already complete - `pickups` table ready

**UI Components Required:**
- QR code scanner component (`@zxing/library` or similar)
- PIN entry interface (6-digit code)
- Code generation interface for sellers
- Redemption status indicators

**Technical Implementation:**
```typescript
// Component: PickupRedemption.svelte
// Features: QR scan, PIN entry, validation feedback
// Dependencies: QR scanner library, camera permissions

// API: /api/pickup/[orderId]/redeem
// Validation: Hash comparison, single-use enforcement
// Security: Rate limiting, fraud detection
```

**Estimated Effort:** 3-4 days

---

## 2. Shipment Label/Tracking Interface

### Current State Analysis
- ✅ Database: `shipments` table with carrier, tracking fields
- ✅ Events: `shipment_events` table for status tracking
- ❌ UI: No shipment management interface
- ❌ Integration: No carrier API integration

### Missing Components

**Frontend Routes Needed:**
- `/orders/[orderId]/shipping` - Shipping details page
- `/orders/seller/shipments` - Bulk shipment management
- `/admin/shipments` - Admin shipment overview

**API Endpoints Needed:**
- `POST /api/shipments/[orderId]/create-label` - Generate shipping label
- `GET /api/shipments/[orderId]/tracking` - Get tracking updates
- `POST /api/shipments/[orderId]/events` - Add tracking events

**Integration Requirements:**
- Australia Post API integration
- DHL/FedEx API integration (future)
- Label PDF generation
- Tracking webhook handling

**UI Components Required:**
- Address validation component
- Package dimensions/weight input
- Label printing interface
- Tracking timeline display
- Delivery confirmation UI

**Technical Implementation:**
```typescript
// Component: ShipmentManager.svelte
// Features: Label generation, tracking display
// APIs: Australia Post, carrier webhooks
// Files: PDF generation, label formatting
```

**Estimated Effort:** 5-6 days

---

## 3. Complete KYC Verification Flow

### Current State Analysis
- ✅ Database: `users` table with KYC status enum
- ✅ Basic: Stripe Identity webhook handler
- ❌ UI: No complete verification interface
- ❌ Flow: Missing multi-step verification process

### Missing Components

**Frontend Routes Needed:**
- `/account/kyc/start` - Initiate KYC process
- `/account/kyc/upload` - Document upload interface
- `/account/kyc/bank-details` - Bank account verification
- `/account/kyc/status` - Verification status tracking

**API Endpoints Needed:**
- `POST /api/kyc/initiate` - Start verification process
- `POST /api/kyc/documents` - Upload identity documents
- `POST /api/kyc/bank-account` - Add/verify bank details
- `GET /api/kyc/status` - Check verification progress

**Integration Requirements:**
- Stripe Identity API integration
- Bank account validation (Stripe/third-party)
- Document upload to secure storage
- Identity verification status tracking

**UI Components Required:**
- Multi-step form wizard
- Document upload with preview
- Bank account form validation
- Progress indicator
- Status feedback system

**Technical Implementation:**
```typescript
// Components: KYCWizard.svelte, DocumentUpload.svelte
// Features: Step validation, document preview, progress tracking
// Security: Encrypted file upload, PII protection
// Integration: Stripe Identity, bank validation APIs
```

**Estimated Effort:** 4-5 days

---

## 4. Admin User Management Interface

### Current State Analysis
- ✅ Database: `users` table with role-based access
- ✅ Basic: Admin layout structure exists
- ❌ UI: No comprehensive user management
- ❌ Actions: No bulk user operations

### Missing Components

**Frontend Routes Needed:**
- `/admin/users` - Enhanced user listing with actions
- `/admin/users/[userId]` - Individual user management
- `/admin/users/bulk` - Bulk operations interface

**API Endpoints Needed:**
- `GET /api/admin/users` - Enhanced user listing with filters
- `PUT /api/admin/users/[userId]` - Update user status/role
- `POST /api/admin/users/bulk` - Bulk user operations
- `GET /api/admin/users/[userId]/activity` - User activity history

**UI Components Required:**
- Advanced data table with sorting/filtering
- User action buttons (suspend, verify, etc.)
- Bulk selection and operations
- User activity timeline
- Role management interface

**Technical Implementation:**
```typescript
// Components: AdminUserTable.svelte, UserActions.svelte
// Features: Pagination, sorting, bulk operations, activity tracking
// Security: Admin role validation, audit logging
// Performance: Server-side filtering, lazy loading
```

**Estimated Effort:** 3-4 days

---

## 5. Payment Method Management

### Current State Analysis
- ✅ Database: `users` table with Stripe customer IDs
- ✅ Integration: Basic Stripe payment processing
- ❌ UI: No payment method management interface
- ❌ Features: No saved payment methods

### Missing Components

**Frontend Routes Needed:**
- `/account/payment-methods` - Manage saved cards/accounts
- `/account/payment-methods/add` - Add new payment method
- `/orders/[orderId]/pay` - Enhanced with saved methods

**API Endpoints Needed:**
- `GET /api/payments/methods` - List saved payment methods
- `POST /api/payments/methods` - Add new payment method
- `DELETE /api/payments/methods/[methodId]` - Remove payment method
- `PUT /api/payments/methods/[methodId]/default` - Set default method

**Integration Requirements:**
- Stripe Payment Methods API
- Secure card tokenization
- Default payment method handling
- Payment method validation

**UI Components Required:**
- Payment method list display
- Add card/bank account forms
- Default method selection
- Delete confirmation dialogs
- Payment method validation

**Technical Implementation:**
```typescript
// Components: PaymentMethods.svelte, AddPaymentMethod.svelte
// Features: Stripe Elements integration, method management
// Security: PCI compliance, tokenization
// UX: Card validation, error handling
```

**Estimated Effort:** 4-5 days

---

## 6. Dispute Filing Interface

### Current State Analysis
- ✅ Database: `disputes` table with reason/state enums
- ✅ Basic: Dispute listing in admin
- ❌ UI: No buyer dispute filing interface
- ❌ Process: No evidence submission system

### Missing Components

**Frontend Routes Needed:**
- `/orders/[orderId]/dispute/file` - File dispute form
- `/disputes/[disputeId]` - Dispute details and updates
- `/disputes` - User's dispute history

**API Endpoints Needed:**
- `POST /api/disputes` - File new dispute
- `POST /api/disputes/[disputeId]/evidence` - Submit evidence
- `PUT /api/disputes/[disputeId]` - Update dispute status
- `GET /api/disputes/[disputeId]/timeline` - Get dispute history

**UI Components Required:**
- Dispute filing form with reason selection
- Evidence upload interface (photos, documents)
- Dispute timeline/status tracking
- Communication thread for disputes
- Resolution display

**Technical Implementation:**
```typescript
// Components: DisputeForm.svelte, EvidenceUpload.svelte
// Features: Multi-step form, file upload, timeline display
// Integration: Secure file storage, notification system
// Validation: Evidence requirements, dispute eligibility
```

**Estimated Effort:** 4-5 days

---

## 7. Enhanced Message Threading UI

### Current State Analysis
- ✅ Database: `message_threads`, `messages` tables
- ✅ Basic: Simple messaging functionality
- ❌ UI: Poor threading organization
- ❌ Features: No rich messaging capabilities

### Missing Components

**Frontend Routes Needed:**
- `/messages` - Enhanced inbox with proper threading
- `/messages/[threadId]` - Improved conversation view
- `/messages/compose` - New message composition

**UI Components Required:**
- Threaded conversation display
- Message composition with rich text
- File/image attachment support
- Message status indicators (read, delivered)
- Search within conversations

**API Enhancements:**
- Enhanced message retrieval with threading
- File attachment handling
- Message status tracking
- Real-time message delivery

**Technical Implementation:**
```typescript
// Components: MessageThread.svelte, MessageComposer.svelte
// Features: Rich text, attachments, real-time updates
// Real-time: WebSocket integration for instant messaging
// Storage: Attachment handling, message archival
```

**Estimated Effort:** 3-4 days

---

## 8. Listing Preview System

### Current State Analysis
- ✅ Database: `listings` table supports all fields
- ✅ Basic: Listing creation form exists
- ❌ UI: No preview before publishing
- ❌ Process: No draft management

### Missing Components

**Frontend Routes Needed:**
- `/sell/preview/[draftId]` - Listing preview interface
- `/sell/drafts` - Draft management page

**API Endpoints Needed:**
- `POST /api/listings/drafts` - Save draft listing
- `GET /api/listings/drafts` - Get user's drafts
- `PUT /api/listings/drafts/[draftId]/publish` - Publish draft

**UI Components Required:**
- Preview display matching live listing
- Edit/publish/delete draft actions
- Draft auto-save functionality
- Preview validation checks
- Mobile preview mode

**Technical Implementation:**
```typescript
// Components: ListingPreview.svelte, DraftManager.svelte
// Features: Preview rendering, auto-save, validation
// Storage: Draft persistence, version control
// UX: Seamless edit-preview flow
```

**Estimated Effort:** 2-3 days

---

## 9. Enhanced User Profile Management

### Current State Analysis
- ✅ Database: `users` table with profile fields
- ✅ Basic: Simple profile viewing
- ❌ UI: Limited profile editing
- ❌ Features: No profile picture, preferences

### Missing Components

**Frontend Routes Needed:**
- `/account/profile` - Complete profile editing
- `/account/settings` - User preferences
- `/account/privacy` - Privacy settings

**API Enhancements:**
- Profile picture upload/management
- Comprehensive profile updates
- Privacy setting controls
- Account deactivation options

**UI Components Required:**
- Profile picture upload with cropping
- Comprehensive form validation
- Privacy controls interface
- Account settings dashboard
- Data export/deletion options

**Technical Implementation:**
```typescript
// Components: ProfileEditor.svelte, PrivacySettings.svelte
// Features: Image upload/crop, settings management
// Storage: Profile image handling, settings persistence
// Privacy: Data export, account deletion flows
```

**Estimated Effort:** 3-4 days

---

## 10. Comprehensive Error Boundary Enhancement

### Current State Analysis
- ✅ Basic: Some error boundary components exist
- ✅ Integration: Sentry error tracking
- ❌ Coverage: Incomplete error state handling
- ❌ UX: Poor error recovery options

### Missing Components

**UI Components Required:**
- Global error boundary with retry options
- Network error handling with offline indicators
- Form validation error states
- Payment error recovery flows
- Real-time connection error handling

**Error States to Handle:**
- Payment processing failures
- Network connectivity issues
- Authentication expiration
- File upload failures
- Real-time disconnections

**Technical Implementation:**
```typescript
// Components: GlobalErrorBoundary.svelte, NetworkStatus.svelte
// Features: Error recovery, retry mechanisms, offline indicators
// Integration: Enhanced Sentry reporting, error analytics
// UX: User-friendly error messages, recovery guidance
```

**Estimated Effort:** 3-4 days

---

## 11. Auction Analytics Dashboard

### Current State Analysis
- ✅ Database: `metrics` table for analytics storage
- ✅ Basic: Simple dashboard exists
- ❌ Analytics: No detailed auction performance
- ❌ Insights: No seller performance metrics

### Missing Components

**Frontend Routes Needed:**
- `/dashboard/auctions` - Detailed auction analytics
- `/dashboard/seller-performance` - Seller metrics
- `/dashboard/insights` - AI-powered insights

**Analytics Required:**
- Auction conversion rates
- Bidding pattern analysis
- Time-to-sell metrics
- Price optimization suggestions
- Market trend analysis

**UI Components Required:**
- Interactive charts and graphs
- Performance comparison tools
- Export functionality
- Drill-down capabilities
- Mobile-responsive analytics

**Technical Implementation:**
```typescript
// Components: AnalyticsDashboard.svelte, PerformanceCharts.svelte
// Features: Interactive visualizations, data export
// Data: Real-time metrics calculation, trend analysis
// Performance: Efficient query optimization, caching
```

**Estimated Effort:** 4-5 days

---

## 12. Financial Oversight Tools (Admin)

### Current State Analysis
- ✅ Database: `ledger_entries`, `payments` tables
- ✅ Basic: Payment processing exists
- ❌ UI: No admin financial oversight
- ❌ Tools: No reconciliation interface

### Missing Components

**Frontend Routes Needed:**
- `/admin/finances/overview` - Financial dashboard
- `/admin/finances/reconciliation` - Payment reconciliation
- `/admin/finances/disputes` - Financial disputes

**API Endpoints Needed:**
- `GET /api/admin/finances/summary` - Financial summary
- `GET /api/admin/finances/transactions` - Transaction listing
- `POST /api/admin/finances/reconcile` - Manual reconciliation

**UI Components Required:**
- Financial overview dashboard
- Transaction search and filtering
- Reconciliation interface
- Dispute resolution tools
- Export and reporting features

**Technical Implementation:**
```typescript
// Components: FinanceDashboard.svelte, TransactionTable.svelte
// Features: Financial reporting, reconciliation tools
// Security: Admin-only access, audit logging
// Compliance: Financial reporting, tax preparation
```

**Estimated Effort:** 4-5 days

---

## Implementation Timeline

### Week 1 (Days 1-7)
- **Days 1-3:** Listing Preview System + Enhanced User Profile Management
- **Days 4-7:** Pickup Code Redemption System

### Week 2 (Days 8-14)  
- **Days 8-12:** Shipment Label/Tracking Interface
- **Days 13-14:** Enhanced Message Threading UI

### Week 3 (Days 15-21)
- **Days 15-19:** Complete KYC Verification Flow
- **Days 20-21:** Admin User Management Interface

### Week 4 (Days 22-28)
- **Days 22-26:** Payment Method Management + Dispute Filing Interface
- **Days 27-28:** Comprehensive Error Boundary Enhancement

### Week 5 (Days 29-35)
- **Days 29-33:** Auction Analytics Dashboard
- **Days 34-35:** Financial Oversight Tools

---

## Success Criteria

### Functional Requirements
- ✅ All 12 critical functionalities implemented and tested
- ✅ Database integration complete for all features
- ✅ API endpoints implemented with proper validation
- ✅ UI components responsive and accessible
- ✅ Error handling comprehensive and user-friendly

### Quality Requirements
- ✅ End-to-end tests for all critical paths
- ✅ Integration tests for API endpoints  
- ✅ Accessibility compliance (WCAG 2.1 AA)
- ✅ Mobile responsiveness verified
- ✅ Performance benchmarks met

### Security Requirements
- ✅ Admin-only features properly secured
- ✅ Financial data encrypted and protected
- ✅ User data privacy maintained
- ✅ Input validation and sanitization complete
- ✅ Rate limiting and fraud prevention active

---

## Post-Implementation Validation

### Testing Strategy
1. **Unit Tests:** Component-level functionality
2. **Integration Tests:** API endpoint validation  
3. **End-to-End Tests:** Complete user journeys
4. **Performance Tests:** Load testing for critical paths
5. **Security Tests:** Penetration testing for new features

### User Acceptance Testing
1. **Admin Testing:** Administrative functionality validation
2. **Seller Testing:** Seller workflow completion
3. **Buyer Testing:** Purchase and dispute processes  
4. **Mobile Testing:** Cross-device functionality
5. **Accessibility Testing:** Screen reader compatibility

This completes the technical specification for all 12 Tier 1 critical MVP-blocking functionalities. Implementation of these features will bring the Aussie Market V2 MVP to production-ready status.