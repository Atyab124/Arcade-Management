# iFun City — Arcade Management System

**Project Planning & Architecture Document — v2.0**

- **Generated:** May 17, 2026
- **Version:** 2.0 — Reviewed
- **Status:** In Planning

> ⚠️ **Reviewer Notes**
>
> This v2.0 document incorporates a full architectural review of the original planning document.
> Additions and enhancements are highlighted throughout. Key new sections include: Live Data Sync
> Strategy, Security & Compliance, API Integration Architecture, and an expanded Technology Stack.

---

## 1. Project Objective

Develop a modern, scalable, web-based arcade management platform for iFun City to manage
day-to-day operations, customer relationships, party bookings, reporting, and marketing
communication.

> 💡 **Reviewer Note:** The objective is clear and well-scoped. Consider adding a measurable
> success criterion for each phase — e.g. "reduce manual booking errors by 80%" or "achieve 30%
> customer re-engagement via WhatsApp within 6 months". This makes phase sign-off more objective.

---

## 2. Core Functional Areas

The system covers the following eight functional domains:

| # | Functional Area                          | Priority | Phase     |
|---|------------------------------------------|----------|-----------|
| 1 | Customer Relationship Management (CRM)   | Critical | Phase 1   |
| 2 | Daily Register & POS Operations          | Critical | Phase 1   |
| 3 | Party & Event Booking Management         | Critical | Phase 1   |
| 4 | WhatsApp Marketing & Communication       | Critical | Phase 1   |
| 5 | Loyalty & Rewards Program                | High     | Phase 2   |
| 6 | Machine Maintenance Tracking             | High     | Phase 2   |
| 7 | Reporting & Business Analytics           | High     | Phase 1–2 |
| 8 | Staff & Shift Management                 | Medium   | Phase 2   |

> ✅ **Reviewer Addition:** Priority and Phase columns added above to help the team sequence
> development. Machine Maintenance is often underestimated — consider adding a QR code per
> machine that links to its maintenance history.

---

## 3. Customer Database Requirements

The system shall maintain detailed customer records. Below is the recommended database schema:

| Field             | Type                | Notes                                                                       |
|-------------------|---------------------|-----------------------------------------------------------------------------|
| customer_id       | UUID (Primary Key)  | System-generated unique identifier                                          |
| full_name         | VARCHAR(150)        | Customer full name                                                          |
| phone_number      | VARCHAR(20)         | International format e.g. +60123456789 — unique index                       |
| email             | VARCHAR(200)        | Optional — for email marketing                                              |
| date_of_birth     | DATE                | Used for birthday automation                                                |
| membership_type   | ENUM                | Values: walk_in / basic / premium / vip                                     |
| loyalty_points    | INTEGER             | Current redeemable points balance                                           |
| lifetime_spend    | DECIMAL(10,2)       | **NEW:** Total spend across all visits                                      |
| visit_count       | INTEGER             | **NEW:** Total number of visits                                             |
| last_visit_date   | DATE                | **NEW:** Drives re-engagement campaigns                                     |
| whatsapp_opt_in   | BOOLEAN             | Mandatory — true only with explicit consent                                 |
| opt_in_date       | TIMESTAMP           | **NEW:** Required for PDPA/GDPR compliance                                  |
| opt_out_date      | TIMESTAMP           | **NEW:** Record when customer opts out                                      |
| preferred_lang    | VARCHAR(10)         | **NEW:** For multilingual message templates                                 |
| notes             | TEXT                | Staff notes and preferences                                                 |
| created_at        | TIMESTAMP           | Record creation timestamp                                                   |
| updated_at        | TIMESTAMP           | Last record modification timestamp                                          |

> ⚠️ **Reviewer Addition:** Fields marked NEW are recommended additions. `opt_in_date` and
> `opt_out_date` are critical for legal compliance with Malaysia's PDPA. `lifetime_spend` and
> `visit_count` enable customer value segmentation (e.g. VIP auto-upgrade rules).

---

## 4. Live Data Sync Strategy *[NEW SECTION]*

> 💡 This section is new and addresses a key operational requirement: iFun City currently uses
> Excel as a live document updated throughout the day as customers arrive. The database must
> stay in sync with this workflow.

### 4.1 Recommended Approach — Google Sheets as Live Source

The recommended migration path moves the Excel sheet to Google Sheets, which provides a real-time
API that the backend can query automatically. This requires zero change to staff workflow.

| Stage  | Action                                                          | Frequency        |
|--------|-----------------------------------------------------------------|------------------|
| Step 1 | Migrate Excel to Google Sheets (one-time)                       | Once             |
| Step 2 | Backend polls Google Sheets API for new/updated rows            | Every 15 minutes |
| Step 3 | Sync job compares rows against database by phone number         | Each poll cycle  |
| Step 4 | New customers inserted — existing records updated               | Each poll cycle  |
| Step 5 | Sync log records every change for audit purposes                | Each poll cycle  |

### 4.2 Alternative — Direct POS Integration (Phase 2)

Once the custom POS module is built, customer records should be created directly at point of
sale — eliminating the Excel dependency entirely. The sync approach above is an interim solution
for Phase 1.

### 4.3 Sync Architecture

| Layer           | Role                                                                            |
|-----------------|---------------------------------------------------------------------------------|
| Google Sheets   | Staff update customer records in real time as customers arrive                  |
| Sync Service    | Scheduled job (every 15 min) reads sheet via Google Sheets API, diffs against DB |
| PostgreSQL      | Canonical customer database — upserts on phone_number as unique key              |
| WhatsApp Layer  | Reads only from PostgreSQL — never directly from Excel or Sheets                 |

> 🔐 **Critical Rule:** WhatsApp campaigns must always read from PostgreSQL — never directly
> from the spreadsheet. The database is the single source of truth. The spreadsheet is only a
> data entry interface.

---

## 5. Daily Operations Register

The POS and daily register module shall support:

- Opening and closing cash tracking with variance alerts
- Sales and transaction logging with receipt generation
- Refunds, voids, and adjustments with manager approval workflow
- Expense tracking and petty cash management
- Staff shift assignment and clock-in / clock-out
- Daily reconciliation reports with PDF export

> 💡 **Reviewer Addition:** Add a manager approval workflow for refunds and voids — this is a
> common source of revenue leakage in arcade businesses. Also recommend integrating token/card
> top-up directly in the POS to auto-update loyalty points.

---

## 6. Party & Event Booking Module

### 6.1 Core Features

- Visual party scheduling calendar (day / week / month views)
- Customer booking records linked to CRM profile
- Deposit and balance payment tracking
- Food, package, and add-on selection per booking
- Automated WhatsApp reminders (48 hrs and 24 hrs before event)
- Event notes, headcount, and staffing assignments

### 6.2 Recommended Additions *[NEW]*

- **NEW:** Booking confirmation sent automatically via WhatsApp on creation
- **NEW:** Waitlist management for peak dates
- **NEW:** Post-event feedback request sent 24 hours after the party
- **NEW:** Revenue per booking report to identify most profitable packages
- **NEW:** Blackout dates and venue capacity limits to prevent overbooking

> ⚠️ **Reviewer Note:** Party bookings are typically iFun City's highest-revenue transactions.
> Prioritise this module and ensure deposit tracking includes payment method and receipt number
> for reconciliation.

---

## 7. WhatsApp CRM & Customer Communication

### 7.1 Communication Types

| Message Type            | Trigger                                | Template Category   |
|-------------------------|----------------------------------------|---------------------|
| Promotional campaign    | Manual — staff schedules               | Marketing           |
| Birthday greeting       | Automated — daily job on DOB match     | Marketing           |
| Booking confirmation    | Automated — on booking creation        | Utility             |
| Event reminder          | Automated — 48 hrs before event        | Utility             |
| Post-event feedback     | Automated — 24 hrs after event         | Utility *[NEW]*     |
| Loyalty points update   | Automated — after each visit           | Utility *[NEW]*     |
| Re-engagement campaign  | Automated — 60 days no visit           | Marketing *[NEW]*   |
| Customer support reply  | Manual — via Trengo inbox              | Service             |

### 7.2 Customer Segmentation for Campaigns

The system shall support targeting by the following segments:

| Segment Name        | Filter Logic                                    | Recommended Use                |
|---------------------|-------------------------------------------------|--------------------------------|
| All opted-in        | `whatsapp_opt_in = true`                        | General announcements          |
| Premium & VIP       | `membership_type IN (premium, vip)`             | Exclusive previews & offers    |
| Birthday this week  | DOB within next 7 days                          | Birthday offer automation      |
| Lapsed customers    | `last_visit_date > 60 days ago`                 | Re-engagement campaigns        |
| High-value          | `lifetime_spend > threshold OR points > 500`    | Loyalty rewards                |
| New customers       | `created_at within last 30 days`                | Welcome & onboarding series    |

> ⚠️ **Reviewer Addition:** Add an opt-out / unsubscribe handler. When a customer replies STOP
> or similar, the system must immediately set `whatsapp_opt_in = false`. Failure to honour
> opt-outs violates Meta's policy and Malaysia's PDPA.

---

## 8. Trengo — Communication Platform

### 8.1 Role of Trengo

Trengo serves as the communication and customer engagement layer during Phase 1 and 2. It is
not a replacement for the custom arcade management system — it is the shared inbox and
campaign execution platform that integrates with it.

### 8.2 Trengo Capabilities

- Shared WhatsApp inbox — multiple staff reply from one number
- WhatsApp Business API integration and template management
- Automated reply flows and chatbot routing
- Customer tagging, labelling, and segmentation
- Bulk campaign sending to opted-in contacts
- Omnichannel support — WhatsApp, email, Instagram DM
- Team performance and response-time reporting

### 8.3 Integration with iFun City Platform *[NEW]*

Trengo should integrate with the custom system via webhooks and API in the following ways:

| Integration Point        | Direction            | Description                                                |
|--------------------------|----------------------|------------------------------------------------------------|
| New customer created     | iFun City → Trengo   | Auto-create contact in Trengo when added to DB             |
| Booking confirmed        | iFun City → Trengo   | Trigger booking confirmation template via Trengo           |
| Campaign audience        | iFun City → Trengo   | Push segmented contact list for bulk campaigns             |
| Inbound message received | Trengo → iFun City   | Log customer message in CRM conversation history           |
| Opt-out received         | Trengo → iFun City   | Update `whatsapp_opt_in = false` in DB immediately         |
| Delivery status          | Trengo → iFun City   | Update message log with delivered / read status            |

> 💡 **Reviewer Note:** Define a clear data ownership boundary. iFun City PostgreSQL is the
> master record. Trengo holds a copy for communication purposes only. Any conflict resolves in
> favour of the PostgreSQL record.

---

## 9. Recommended System Architecture

### 9.1 Architecture Overview

| Layer              | Components                                                                       |
|--------------------|----------------------------------------------------------------------------------|
| Client Layer       | React + Tailwind Web App, Mobile App (Phase 3), Trengo Inbox                     |
| API Gateway        | Node.js / Express REST API, Auth middleware, Rate limiting, Request logging      |
| Core Services      | CRM Service, POS Service, Booking Service, Loyalty Service, Reporting Service    |
| Integration Layer  | WhatsApp Cloud API, Trengo Webhooks, Google Sheets Sync, Payment Gateway         |
| Data Layer         | PostgreSQL (primary), Redis (sessions & cache), AWS S3 (media storage)           |
| Infrastructure     | AWS / Azure, Docker containers, CI/CD pipeline, Automated backups                |

> ⚠️ **Reviewer Addition:** Add an API Gateway layer with rate limiting and authentication
> middleware. Without this, the backend is exposed if Trengo or any third-party integration is
> compromised.

---

## 10. Recommended Technology Stack

| Layer              | Technology                          | Rationale                                                  |
|--------------------|-------------------------------------|------------------------------------------------------------|
| Frontend           | React + Tailwind CSS                | Fast development, large ecosystem, mobile-responsive       |
| Backend            | Node.js + Express                   | JavaScript full-stack consistency; strong WhatsApp SDK     |
| Database           | PostgreSQL 16                       | Robust relational DB; ideal for CRM, POS, and bookings     |
| Cache / Sessions   | Redis *[NEW]*                       | Session management, rate limiting, real-time counters      |
| Message Queue      | BullMQ on Redis *[NEW]*             | WhatsApp send queue, scheduled jobs, retry logic           |
| File Storage       | AWS S3 *[NEW]*                      | Customer media, receipts, booking documents                |
| Authentication     | JWT + Refresh Tokens *[NEW]*        | Stateless auth; role-based access for staff vs. managers   |
| WhatsApp           | WhatsApp Cloud API via Trengo       | Official Meta API; Trengo adds inbox management layer      |
| Sync Service       | Node.js cron + Google Sheets API *[NEW]* | Live Excel-to-DB sync during Phase 1                  |
| Infrastructure     | AWS / DigitalOcean + Docker         | Containerised services; easy to scale horizontally         |
| CI/CD              | GitHub Actions *[NEW]*              | Automated testing and deployment pipeline                  |
| Monitoring         | Sentry + Datadog *[NEW]*            | Error tracking and uptime monitoring                       |

---

## 11. Security & Compliance *[NEW SECTION]*

> 🔐 This section is new. Arcade businesses collect personal data including phone numbers,
> dates of birth, and spending history. Compliance with Malaysia's PDPA (Personal Data
> Protection Act) is mandatory.

### 11.1 Data Protection Requirements

- Explicit opt-in consent must be recorded with timestamp before any WhatsApp message is sent
- Opt-out requests must be honoured immediately — no grace period
- Customer data must not be shared with third parties without consent
- Data retention policy: define how long inactive customer records are kept
- Right to erasure: customers can request deletion of their personal data

### 11.2 Application Security

- All API endpoints protected with JWT authentication
- Role-based access control — staff can view, managers can edit, admin can delete
- All data encrypted in transit (HTTPS/TLS) and at rest (AES-256)
- API rate limiting to prevent abuse and protect WhatsApp sending quotas
- Audit log of all data access, exports, and bulk message sends
- Regular automated database backups with tested restore procedures

### 11.3 WhatsApp-Specific Compliance

- Only send messages to customers with `whatsapp_opt_in = true`
- All outbound templates must be pre-approved by Meta before use
- Maintain message logs for a minimum of 12 months
- Never send marketing messages between 10 PM and 8 AM local time
- Monitor quality rating in Meta Business Manager — low ratings risk number suspension

---

## 12. Development Roadmap

### Phase 1 — Foundation & MVP (Months 1–3)

- Customer database with Google Sheets live sync
- POS / Daily register system
- Party & event booking module
- Basic reporting dashboard
- Trengo integration for WhatsApp communication
- WhatsApp opt-in collection at point of sale
- Manual campaign sending via Trengo

### Phase 2 — Automation & Loyalty (Months 4–6)

- Full loyalty & rewards engine
- Automated WhatsApp flows (birthday, re-engagement, post-event feedback)
- Advanced analytics and revenue reporting
- Machine maintenance tracking module
- Staff shift and scheduling management
- Mobile-responsive dashboard
- Direct POS-to-database integration (remove Excel dependency)

### Phase 3 — Scale & Intelligence (Months 7–12)

- Native mobile app (iOS & Android)
- AI-driven customer insights and campaign recommendations
- Multi-location support
- Self-service customer portal (check points, book parties)
- Payment gateway integration (online deposits for bookings)
- SaaS multi-tenancy foundation

---

## 13. API Integration Architecture *[NEW SECTION]*

The following external APIs and services need to be integrated:

| Integration         | Purpose                            | Phase | Key Considerations                                       |
|---------------------|------------------------------------|-------|----------------------------------------------------------|
| WhatsApp Cloud API  | Send/receive WhatsApp messages     | 1     | Via Trengo; requires Meta Business verification          |
| Trengo API          | Inbox management, campaigns        | 1     | Webhook setup for inbound messages and opt-outs          |
| Google Sheets API   | Live customer data sync from Excel | 1     | OAuth2 service account; poll every 15 minutes            |
| Payment Gateway     | Online booking deposits            | 3     | Recommend Stripe or local Malaysian gateway (iPay88)     |
| SMS Fallback        | Fallback if WhatsApp undelivered   | 2     | Twilio or local provider; for critical booking reminders |
| Google Maps         | Location display in customer comms | 2     | Embed map link in booking confirmation messages          |

---

## 14. Long-Term Vision

The iFun City platform can evolve into a scalable SaaS product for arcades, family entertainment
centres, and indoor playground businesses across Southeast Asia.

### 14.1 SaaS Readiness Checklist *[NEW]*

- Multi-tenancy database design from Phase 1 — use `tenant_id` on all tables
- White-label branding support — configurable logo, colours, and business name
- Subscription billing module for SaaS customers
- Onboarding wizard for new arcade businesses
- Centralised WhatsApp number management per tenant
- Aggregate (anonymised) analytics across all tenants for benchmarking

> 🚀 **Strategic Note:** If SaaS is a genuine Phase 3 goal, the multi-tenancy design decision
> must be made in Phase 1 — retrofitting it later is expensive. Add `tenant_id` to all database
> tables from day one, even if iFun City is the only tenant initially.

---

## 15. Open Questions for Stakeholders *[NEW SECTION]*

The following decisions are needed before development begins:

| # | Question                                                                   | Impact                                  |
|---|----------------------------------------------------------------------------|-----------------------------------------|
| 1 | Will the arcade use Google Sheets or keep Excel on a local PC?             | Determines sync strategy for Phase 1    |
| 2 | How many staff members need simultaneous system access?                    | Affects licensing and concurrency design |
| 3 | Does iFun City have an existing POS system to integrate with or replace?   | Determines Phase 1 POS scope            |
| 4 | What is the expected customer database size at launch?                     | Affects database sizing and migration plan |
| 5 | Is multi-location support needed from launch, or is it a future requirement? | Critical for database schema decisions  |
| 6 | What payment methods must be supported for party booking deposits?         | Determines payment gateway selection    |
| 7 | Is there an existing Trengo account, or does one need to be set up?        | Affects Phase 1 timeline                |
| 8 | What is the data retention and backup policy for customer records?         | Required for PDPA compliance            |

---

📄 *Document prepared by: Architectural Review · v2.0 · May 17, 2026 · All additions marked
[NEW] or [NEW SECTION] are reviewer recommendations not present in the original v1.0 document.*
