CREATE TYPE "public"."audit_outcome" AS ENUM('ok', 'denied', 'error');--> statement-breakpoint
CREATE TYPE "public"."cert_provider" AS ENUM('letsencrypt', 'custom');--> statement-breakpoint
CREATE TYPE "public"."cert_status" AS ENUM('pending', 'issued', 'renewing', 'failed');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."db_engine" AS ENUM('mysql', 'postgres');--> statement-breakpoint
CREATE TYPE "public"."dns_type" AS ENUM('A', 'CNAME', 'TXT');--> statement-breakpoint
CREATE TYPE "public"."domain_type" AS ENUM('primary', 'addon', 'subdomain', 'alias');--> statement-breakpoint
CREATE TYPE "public"."https_mode" AS ENUM('off', 'redirect', 'only');--> statement-breakpoint
CREATE TYPE "public"."intent_status" AS ENUM('pending', 'applied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."owner_scope" AS ENUM('platform', 'reseller');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."resource_state" AS ENUM('pending', 'provisioning', 'active', 'error', 'removing');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'reseller', 'customer');--> statement-breakpoint
CREATE TYPE "public"."server_status" AS ENUM('online', 'degraded', 'offline');--> statement-breakpoint
CREATE TYPE "public"."sub_state" AS ENUM('active', 'suspended', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."vhost_state" AS ENUM('pending', 'live', 'disabled');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"actor_ip" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"request_id" text,
	"command_hash" text,
	"outcome" "audit_outcome" NOT NULL,
	"detail_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"server_id" text NOT NULL,
	"provider" "cert_provider" DEFAULT 'letsencrypt' NOT NULL,
	"status" "cert_status" DEFAULT 'pending' NOT NULL,
	"sans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"not_before" timestamp with time zone,
	"not_after" timestamp with time zone,
	"fingerprint" text,
	"key_path" text,
	"chain_path" text,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_reseller_id" text,
	"name" text NOT NULL,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_users" (
	"id" text PRIMARY KEY NOT NULL,
	"database_id" text NOT NULL,
	"engine" "db_engine" NOT NULL,
	"username" text NOT NULL,
	"grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"password_set_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "databases" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"server_id" text NOT NULL,
	"engine" "db_engine" NOT NULL,
	"db_name" text NOT NULL,
	"size_bytes_cached" bigint DEFAULT 0 NOT NULL,
	"state" "resource_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dns_records" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"type" "dns_type" NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"ttl" integer DEFAULT 3600 NOT NULL,
	"managed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"fqdn" text NOT NULL,
	"type" "domain_type" DEFAULT 'primary' NOT NULL,
	"doc_root" text NOT NULL,
	"php_version" text,
	"vhost_state" "vhost_state" DEFAULT 'pending' NOT NULL,
	"https_mode" "https_mode" DEFAULT 'off' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_scope" "owner_scope" DEFAULT 'platform' NOT NULL,
	"owner_reseller_id" text,
	"name" text NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"limits" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconcile_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"subscription_id" text,
	"kind" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"desired_state" jsonb NOT NULL,
	"status" "intent_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"agent_endpoint" text NOT NULL,
	"public_ip" text,
	"status" "server_status" DEFAULT 'online' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sftp_users" (
	"id" text PRIMARY KEY NOT NULL,
	"system_user_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"unix_username" text NOT NULL,
	"chroot_dir" text NOT NULL,
	"state" "resource_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"server_id" text NOT NULL,
	"state" "sub_state" DEFAULT 'active' NOT NULL,
	"effective_limits" jsonb NOT NULL,
	"disk_used_mb" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_users" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"server_id" text NOT NULL,
	"unix_username" text NOT NULL,
	"uid" integer,
	"home_dir" text NOT NULL,
	"shell" text DEFAULT '/usr/sbin/nologin' NOT NULL,
	"state" "resource_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text,
	"role" "role" NOT NULL,
	"customer_id" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_users" ADD CONSTRAINT "database_users_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_records" ADD CONSTRAINT "dns_records_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_owner_reseller_id_customers_id_fk" FOREIGN KEY ("owner_reseller_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconcile_intents" ADD CONSTRAINT "reconcile_intents_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconcile_intents" ADD CONSTRAINT "reconcile_intents_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sftp_users" ADD CONSTRAINT "sftp_users_system_user_id_system_users_id_fk" FOREIGN KEY ("system_user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sftp_users" ADD CONSTRAINT "sftp_users_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "databases_engine_name_unique" ON "databases" USING btree ("engine","db_name");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_fqdn_unique" ON "domains" USING btree ("fqdn");--> statement-breakpoint
CREATE UNIQUE INDEX "reconcile_intents_idem_unique" ON "reconcile_intents" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_subscription_unique" ON "system_users" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_username_unique" ON "system_users" USING btree ("unix_username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");