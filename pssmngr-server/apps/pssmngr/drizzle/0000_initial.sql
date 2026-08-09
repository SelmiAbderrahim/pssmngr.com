CREATE TYPE "public"."emergency_audit_event" AS ENUM('request_created', 'request_denied', 'request_granted', 'request_auto_granted', 'request_expired', 'signature_verified', 'signature_failed', 'cooldown_blocked');--> statement-breakpoint
CREATE TYPE "public"."emergency_request_status" AS ENUM('pending', 'denied', 'approved', 'expired');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('login', 'passkey', 'identity', 'card', 'note', 'totp', 'file');--> statement-breakpoint
CREATE TYPE "public"."notification_category_enum" AS ENUM('security', 'sharing', 'system');--> statement-breakpoint
CREATE TYPE "public"."recovery_status" AS ENUM('pending', 'approved', 'completing', 'completed', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."share_permission" AS ENUM('view', 'edit', 'share');--> statement-breakpoint
CREATE TYPE "public"."shared_vault_permission" AS ENUM('view', 'edit', 'share', 'manage');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"is2FAEnabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL,
	"team_id" text
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"team_id" text,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	"owner_id" text NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "data_export_request" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"bundle_path" text DEFAULT '' NOT NULL,
	"bundle_size_bytes" bigint DEFAULT 0 NOT NULL,
	"download_token" text,
	"download_count" integer DEFAULT 0 NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"requested_format" text DEFAULT 'BOTH' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_name" text NOT NULL,
	"device_type" text DEFAULT 'browser' NOT NULL,
	"public_key" text NOT NULL,
	"signing_public_key" text,
	"trusted" boolean DEFAULT false NOT NULL,
	"encrypted_private_key" text,
	"encrypted_signing_private_key" text,
	"persistent_unlock_expires_at" timestamp with time zone,
	"last_ip" text,
	"last_user_agent" text,
	"last_seen" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_access_request" (
	"id" text PRIMARY KEY NOT NULL,
	"trusted_contact_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"status" "emergency_request_status" DEFAULT 'pending' NOT NULL,
	"waiting_period_days" integer NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"denied_at" timestamp with time zone,
	"granted_at" timestamp with time zone,
	"timestamp_signature" text NOT NULL,
	"denial_cooldown_until" timestamp with time zone,
	"escrow_blob" text,
	"escrow_nonce" text,
	"escrow_auth_tag" text,
	"ephemeral_public_key" text,
	"escrow_signature" text
);
--> statement-breakpoint
CREATE TABLE "emergency_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"event" "emergency_audit_event" NOT NULL,
	"actor_id" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"waiting_period_days" integer DEFAULT 7 NOT NULL,
	"escrow_blob" text,
	"escrow_nonce" text,
	"escrow_auth_tag" text,
	"ephemeral_public_key" text,
	"escrow_signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"router" varchar(64) NOT NULL,
	"procedure" varchar(64) NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"item_type" "item_type" NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"wrapped_data_key_nonce" text NOT NULL,
	"wrapped_data_key_auth_tag" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_version" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"version" integer NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"wrapped_data_key_nonce" text NOT NULL,
	"wrapped_data_key_auth_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"notificationId" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" "notification_category_enum" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recovery_request" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"requester_id" text NOT NULL,
	"approver_id" text,
	"status" "recovery_status" DEFAULT 'pending' NOT NULL,
	"new_public_key" text,
	"new_signing_public_key" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_temp" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"active_organization_id" text,
	CONSTRAINT "session_temp_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ephemeral_share" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_user_id" text NOT NULL,
	"encrypted_blob" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"has_passphrase" boolean DEFAULT false NOT NULL,
	"passphrase_salt" text,
	"expires_at" timestamp with time zone NOT NULL,
	"max_accesses" integer DEFAULT 1 NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"first_accessed_at" timestamp with time zone,
	"ip_restriction" text,
	"label" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_history" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"wrapped_data_key_nonce" text NOT NULL,
	"wrapped_data_key_auth_tag" text NOT NULL,
	"is_legacy" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_envelope" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"sender_user_id" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"wrapped_key" text NOT NULL,
	"wrapped_key_nonce" text NOT NULL,
	"wrapped_key_auth_tag" text NOT NULL,
	"sender_signature" text NOT NULL,
	"permission" "share_permission" DEFAULT 'view' NOT NULL,
	"expires_at" timestamp with time zone,
	"accepted" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_vault" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_vault_item" (
	"id" text PRIMARY KEY NOT NULL,
	"shared_vault_id" text NOT NULL,
	"item_type" "item_type" NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"auth_tag" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"wrapped_data_key_nonce" text NOT NULL,
	"wrapped_data_key_auth_tag" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_vault_member" (
	"id" text PRIMARY KEY NOT NULL,
	"shared_vault_id" text NOT NULL,
	"user_id" text NOT NULL,
	"permission" "shared_vault_permission" DEFAULT 'view' NOT NULL,
	"wrapped_key" text NOT NULL,
	"wrapped_key_nonce" text NOT NULL,
	"wrapped_key_auth_tag" text NOT NULL,
	"ephemeral_public_key" text NOT NULL,
	"sender_signature" text NOT NULL,
	"granted_by" text,
	"needs_rewrap" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp NOT NULL,
	"two_factor_enabled" boolean,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"role" text DEFAULT 'user' NOT NULL,
	"preferredLanguage" text,
	"layoutTemplate" text DEFAULT 'default',
	"guide_me" boolean DEFAULT true NOT NULL,
	"lastName" text DEFAULT '',
	"allowImpersonation" boolean DEFAULT false,
	"ownerId" text DEFAULT '',
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vault" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"name" text DEFAULT 'Personal Vault' NOT NULL,
	"encrypted_search_index" text,
	"encrypted_watchtower_state" text,
	"kdf_salt" text NOT NULL,
	"encrypted_verification_blob" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export_request" ADD CONSTRAINT "data_export_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_access_request" ADD CONSTRAINT "emergency_access_request_trusted_contact_id_trusted_contact_id_fk" FOREIGN KEY ("trusted_contact_id") REFERENCES "public"."trusted_contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_access_request" ADD CONSTRAINT "emergency_access_request_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_access_request" ADD CONSTRAINT "emergency_access_request_contact_id_user_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_audit_log" ADD CONSTRAINT "emergency_audit_log_request_id_emergency_access_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."emergency_access_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_audit_log" ADD CONSTRAINT "emergency_audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contact" ADD CONSTRAINT "trusted_contact_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contact" ADD CONSTRAINT "trusted_contact_contact_id_user_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_vault_id_vault_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vault"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_version" ADD CONSTRAINT "item_version_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_request" ADD CONSTRAINT "recovery_request_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_request" ADD CONSTRAINT "recovery_request_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_request" ADD CONSTRAINT "recovery_request_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_temp" ADD CONSTRAINT "session_temp_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ephemeral_share" ADD CONSTRAINT "ephemeral_share_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_envelope" ADD CONSTRAINT "share_envelope_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_envelope" ADD CONSTRAINT "share_envelope_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_envelope" ADD CONSTRAINT "share_envelope_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_vault" ADD CONSTRAINT "shared_vault_family_id_organization_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_vault" ADD CONSTRAINT "shared_vault_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_vault_item" ADD CONSTRAINT "shared_vault_item_shared_vault_id_shared_vault_id_fk" FOREIGN KEY ("shared_vault_id") REFERENCES "public"."shared_vault"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_vault_item" ADD CONSTRAINT "shared_vault_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_vault_member" ADD CONSTRAINT "shared_vault_member_shared_vault_id_shared_vault_id_fk" FOREIGN KEY ("shared_vault_id") REFERENCES "public"."shared_vault"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_vault_member" ADD CONSTRAINT "shared_vault_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault" ADD CONSTRAINT "vault_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault" ADD CONSTRAINT "vault_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_export_request_user_id_idx" ON "data_export_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "data_export_request_status_idx" ON "data_export_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "data_export_request_expires_at_idx" ON "data_export_request" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_export_request_user_active_uniq" ON "data_export_request" USING btree ("user_id") WHERE "data_export_request"."status" IN ('PENDING','RUNNING');--> statement-breakpoint
CREATE UNIQUE INDEX "data_export_request_download_token_uniq" ON "data_export_request" USING btree ("download_token") WHERE "data_export_request"."download_token" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "device_user_id_idx" ON "device" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "emergency_request_owner_idx" ON "emergency_access_request" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "emergency_request_contact_idx" ON "emergency_access_request" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "emergency_request_status_idx" ON "emergency_access_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "emergency_request_trusted_contact_idx" ON "emergency_access_request" USING btree ("trusted_contact_id");--> statement-breakpoint
CREATE INDEX "emergency_audit_request_idx" ON "emergency_audit_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "emergency_audit_event_idx" ON "emergency_audit_log" USING btree ("event");--> statement-breakpoint
CREATE INDEX "trusted_contact_owner_idx" ON "trusted_contact" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "trusted_contact_contact_idx" ON "trusted_contact" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idempotency_key_user_id_idx" ON "idempotency_key" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idempotency_key_created_at_idx" ON "idempotency_key" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "item_vault_id_idx" ON "item" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "item_type_idx" ON "item" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "item_deleted_at_idx" ON "item" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "item_version_item_id_idx" ON "item_version" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "notification_user_id_idx" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recovery_request_family_idx" ON "recovery_request" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "recovery_request_requester_idx" ON "recovery_request" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "recovery_request_status_idx" ON "recovery_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ephemeral_share_sender_idx" ON "ephemeral_share" USING btree ("sender_user_id");--> statement-breakpoint
CREATE INDEX "ephemeral_share_expires_idx" ON "ephemeral_share" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "password_history_item_id_idx" ON "password_history" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "share_envelope_item_id_idx" ON "share_envelope" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "share_envelope_recipient_idx" ON "share_envelope" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "share_envelope_sender_idx" ON "share_envelope" USING btree ("sender_user_id");--> statement-breakpoint
CREATE INDEX "shared_vault_family_id_idx" ON "shared_vault" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "shared_vault_item_vault_idx" ON "shared_vault_item" USING btree ("shared_vault_id");--> statement-breakpoint
CREATE INDEX "shared_vault_item_type_idx" ON "shared_vault_item" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "shared_vault_member_vault_idx" ON "shared_vault_member" USING btree ("shared_vault_id");--> statement-breakpoint
CREATE INDEX "shared_vault_member_user_idx" ON "shared_vault_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vault_user_id_idx" ON "vault" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vault_user_organization_idx" ON "vault" USING btree ("user_id","organization_id");