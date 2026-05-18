-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "tenant_id" UUID NOT NULL,
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "customers" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "email" TEXT,
    "date_of_birth" DATE,
    "membership_type" TEXT NOT NULL DEFAULT 'walk_in',
    "loyalty_points" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "last_visit_date" DATE,
    "preferred_lang" TEXT NOT NULL DEFAULT 'en',
    "notes" TEXT,
    "vip_flag" BOOLEAN NOT NULL DEFAULT false,
    "dietary_flags" JSONB NOT NULL DEFAULT '[]',
    "medical_flags" JSONB NOT NULL DEFAULT '[]',
    "row_hash" TEXT,
    "source_row" INTEGER,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "anonymized_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "notice_version" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "sheet_modified_time" TIMESTAMP(3),
    "rows_read" INTEGER NOT NULL DEFAULT 0,
    "rows_changed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error_message" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id" BIGSERIAL NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sheet_row" INTEGER,
    "domain_key" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "changed_fields" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error_message" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sync_errors" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "sheet_row" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "fields" TEXT[],
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sync_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "till_sessions" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "register_id" TEXT NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash" DECIMAL(12,2) NOT NULL,
    "closed_by_user_id" UUID,
    "closed_at" TIMESTAMP(3),
    "expected_cash" DECIMAL(12,2),
    "actual_cash" DECIMAL(12,2),
    "variance" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'open',
    "notes" TEXT,

    CONSTRAINT "till_sessions_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "till_session_id" UUID NOT NULL,
    "customer_id" UUID,
    "type" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "reason_code" TEXT,
    "approved_by_user_id" UUID,
    "void_of_transaction_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "transaction_lines" (
    "tenant_id" UUID NOT NULL,
    "id" BIGSERIAL NOT NULL,
    "transaction_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "transaction_lines_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "cards" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "card_uid" TEXT NOT NULL,
    "customer_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "card_bucket_ledger" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_bucket_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "availability_events" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "availability_events_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "party_packages" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_price" DECIMAL(12,2) NOT NULL,
    "deposit_pct" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "min_guests" INTEGER NOT NULL DEFAULT 1,
    "max_guests" INTEGER NOT NULL DEFAULT 50,
    "duration_minutes" INTEGER NOT NULL DEFAULT 120,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cancellation_policy" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_packages_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "package_variations" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_override" DECIMAL(12,2),
    "included_addons" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "package_variations_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "package_addons" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "package_id" UUID,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "stock_period_start" TIMESTAMP(3),
    "stock_period_end" TIMESTAMP(3),

    CONSTRAINT "package_addons_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "variation_id" UUID,
    "resource_id" UUID NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "notes" TEXT,
    "run_sheet_notes" TEXT,
    "wristband_color" TEXT,
    "policy_snapshot" JSONB NOT NULL DEFAULT '{}',
    "pricing_snapshot" JSONB NOT NULL DEFAULT '{}',
    "reminder_48h_sent_at" TIMESTAMP(3),
    "reminder_24h_sent_at" TIMESTAMP(3),
    "feedback_request_sent_at" TIMESTAMP(3),
    "confirmation_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "booking_lines" (
    "tenant_id" UUID NOT NULL,
    "id" BIGSERIAL NOT NULL,
    "booking_id" UUID NOT NULL,
    "addon_id" UUID,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price_snapshot" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "booking_lines_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "payments" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "txn_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'captured',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "customer_id" UUID,
    "contact_phone" TEXT NOT NULL,
    "requested_date" DATE NOT NULL,
    "notified_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "earn_rate_per_rm" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "expiry_months" INTEGER NOT NULL DEFAULT 12,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "loyalty_tiers" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_qualifying_points" INTEGER NOT NULL,
    "perks" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "points_ledger" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "parent_ledger_id" BIGINT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "points_cost" INTEGER NOT NULL,
    "stock" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reward_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "points_cost" INTEGER NOT NULL,
    "fulfilled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "machines" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "qr_token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "location_zone" TEXT,
    "install_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'in_service',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "machine_revenue_events" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "collection" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payout_pct" DECIMAL(5,2),

    CONSTRAINT "machine_revenue_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT NOT NULL,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "maintenance_tasks" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assigned_to_user_id" UUID,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "parts_used" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_tasks_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "wa_templates" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "trengo_hsm_id" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_templates_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "wa_messages" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "phone_e164" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "template_id" UUID,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "external_id" TEXT,
    "conversation_window_until" TIMESTAMP(3),
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_webhook_events" (
    "id" BIGSERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_campaigns" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "template_name" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "segment_filter" JSONB NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_campaigns_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "tenant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "role" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateTable
CREATE TABLE "clock_events" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,

    CONSTRAINT "clock_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_tenant_id_user_id_idx" ON "refresh_tokens"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_entity_type_entity_id_idx" ON "audit_log"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "audit_log"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "customers_tenant_id_email_idx" ON "customers"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "customers_tenant_id_deleted_at_idx" ON "customers"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "customers_tenant_id_last_visit_date_idx" ON "customers"("tenant_id", "last_visit_date");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_phone_e164_key" ON "customers"("tenant_id", "phone_e164");

-- CreateIndex
CREATE INDEX "consent_events_tenant_id_customer_id_channel_created_at_idx" ON "consent_events"("tenant_id", "customer_id", "channel", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sync_runs_tenant_id_started_at_idx" ON "sync_runs"("tenant_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "sync_log_tenant_id_occurred_at_idx" ON "sync_log"("tenant_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "sync_log_tenant_id_domain_key_idx" ON "sync_log"("tenant_id", "domain_key");

-- CreateIndex
CREATE INDEX "customer_sync_errors_tenant_id_occurred_at_idx" ON "customer_sync_errors"("tenant_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "till_sessions_tenant_id_status_idx" ON "till_sessions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "till_sessions_tenant_id_opened_at_idx" ON "till_sessions"("tenant_id", "opened_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_till_session_id_idx" ON "transactions"("tenant_id", "till_session_id");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_customer_id_idx" ON "transactions"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_created_at_idx" ON "transactions"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_tenant_id_receipt_no_key" ON "transactions"("tenant_id", "receipt_no");

-- CreateIndex
CREATE INDEX "transaction_lines_tenant_id_transaction_id_idx" ON "transaction_lines"("tenant_id", "transaction_id");

-- CreateIndex
CREATE INDEX "cards_tenant_id_customer_id_idx" ON "cards"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "cards_tenant_id_card_uid_key" ON "cards"("tenant_id", "card_uid");

-- CreateIndex
CREATE INDEX "card_bucket_ledger_tenant_id_card_id_bucket_created_at_idx" ON "card_bucket_ledger"("tenant_id", "card_id", "bucket", "created_at" DESC);

-- CreateIndex
CREATE INDEX "resources_tenant_id_active_idx" ON "resources"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "availability_events_tenant_id_resource_id_start_at_idx" ON "availability_events"("tenant_id", "resource_id", "start_at");

-- CreateIndex
CREATE INDEX "party_packages_tenant_id_active_idx" ON "party_packages"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "package_variations_tenant_id_package_id_idx" ON "package_variations"("tenant_id", "package_id");

-- CreateIndex
CREATE INDEX "package_addons_tenant_id_package_id_idx" ON "package_addons"("tenant_id", "package_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_start_at_idx" ON "bookings"("tenant_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_resource_id_start_at_idx" ON "bookings"("tenant_id", "resource_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_customer_id_idx" ON "bookings"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_cancelled_at_idx" ON "bookings"("tenant_id", "cancelled_at");

-- CreateIndex
CREATE INDEX "booking_lines_tenant_id_booking_id_idx" ON "booking_lines"("tenant_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_booking_id_key" ON "invoices"("tenant_id", "booking_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_invoice_id_idx" ON "payments"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "waitlist_entries_tenant_id_package_id_requested_date_idx" ON "waitlist_entries"("tenant_id", "package_id", "requested_date");

-- CreateIndex
CREATE INDEX "loyalty_programs_tenant_id_active_idx" ON "loyalty_programs"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "loyalty_tiers_tenant_id_program_id_min_qualifying_points_idx" ON "loyalty_tiers"("tenant_id", "program_id", "min_qualifying_points");

-- CreateIndex
CREATE INDEX "points_ledger_tenant_id_customer_id_created_at_idx" ON "points_ledger"("tenant_id", "customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "points_ledger_tenant_id_event_type_expires_at_idx" ON "points_ledger"("tenant_id", "event_type", "expires_at");

-- CreateIndex
CREATE INDEX "rewards_tenant_id_active_idx" ON "rewards"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "redemptions_tenant_id_customer_id_created_at_idx" ON "redemptions"("tenant_id", "customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "machines_tenant_id_status_idx" ON "machines"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "machines_tenant_id_qr_token_key" ON "machines"("tenant_id", "qr_token");

-- CreateIndex
CREATE INDEX "machine_revenue_events_tenant_id_machine_id_period_start_idx" ON "machine_revenue_events"("tenant_id", "machine_id", "period_start" DESC);

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_status_idx" ON "service_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_machine_id_created_at_idx" ON "service_requests"("tenant_id", "machine_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "maintenance_tasks_tenant_id_machine_id_scheduled_for_idx" ON "maintenance_tasks"("tenant_id", "machine_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "maintenance_tasks_tenant_id_completed_at_idx" ON "maintenance_tasks"("tenant_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "wa_templates_tenant_id_name_version_key" ON "wa_templates"("tenant_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "wa_messages_external_id_key" ON "wa_messages"("external_id");

-- CreateIndex
CREATE INDEX "wa_messages_tenant_id_phone_e164_created_at_idx" ON "wa_messages"("tenant_id", "phone_e164", "created_at" DESC);

-- CreateIndex
CREATE INDEX "wa_messages_tenant_id_status_idx" ON "wa_messages"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wa_webhook_events_external_id_key" ON "wa_webhook_events"("external_id");

-- CreateIndex
CREATE INDEX "wa_webhook_events_provider_processed_at_idx" ON "wa_webhook_events"("provider", "processed_at");

-- CreateIndex
CREATE INDEX "wa_campaigns_tenant_id_status_idx" ON "wa_campaigns"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_user_id_start_at_idx" ON "shifts"("tenant_id", "user_id", "start_at");

-- CreateIndex
CREATE INDEX "clock_events_tenant_id_user_id_timestamp_idx" ON "clock_events"("tenant_id", "user_id", "timestamp" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_till_session_id_fkey" FOREIGN KEY ("tenant_id", "till_session_id") REFERENCES "till_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_tenant_id_transaction_id_fkey" FOREIGN KEY ("tenant_id", "transaction_id") REFERENCES "transactions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_bucket_ledger" ADD CONSTRAINT "card_bucket_ledger_tenant_id_card_id_fkey" FOREIGN KEY ("tenant_id", "card_id") REFERENCES "cards"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_events" ADD CONSTRAINT "availability_events_tenant_id_resource_id_fkey" FOREIGN KEY ("tenant_id", "resource_id") REFERENCES "resources"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_variations" ADD CONSTRAINT "package_variations_tenant_id_package_id_fkey" FOREIGN KEY ("tenant_id", "package_id") REFERENCES "party_packages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_addons" ADD CONSTRAINT "package_addons_tenant_id_package_id_fkey" FOREIGN KEY ("tenant_id", "package_id") REFERENCES "party_packages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_package_id_fkey" FOREIGN KEY ("tenant_id", "package_id") REFERENCES "party_packages"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_variation_id_fkey" FOREIGN KEY ("tenant_id", "variation_id") REFERENCES "package_variations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_resource_id_fkey" FOREIGN KEY ("tenant_id", "resource_id") REFERENCES "resources"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_tenant_id_booking_id_fkey" FOREIGN KEY ("tenant_id", "booking_id") REFERENCES "bookings"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_tenant_id_addon_id_fkey" FOREIGN KEY ("tenant_id", "addon_id") REFERENCES "package_addons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_booking_id_fkey" FOREIGN KEY ("tenant_id", "booking_id") REFERENCES "bookings"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_package_id_fkey" FOREIGN KEY ("tenant_id", "package_id") REFERENCES "party_packages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_tiers" ADD CONSTRAINT "loyalty_tiers_tenant_id_program_id_fkey" FOREIGN KEY ("tenant_id", "program_id") REFERENCES "loyalty_programs"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_tenant_id_reward_id_fkey" FOREIGN KEY ("tenant_id", "reward_id") REFERENCES "rewards"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_revenue_events" ADD CONSTRAINT "machine_revenue_events_tenant_id_machine_id_fkey" FOREIGN KEY ("tenant_id", "machine_id") REFERENCES "machines"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tenant_id_machine_id_fkey" FOREIGN KEY ("tenant_id", "machine_id") REFERENCES "machines"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_tenant_id_machine_id_fkey" FOREIGN KEY ("tenant_id", "machine_id") REFERENCES "machines"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_tenant_id_template_id_fkey" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "wa_templates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

