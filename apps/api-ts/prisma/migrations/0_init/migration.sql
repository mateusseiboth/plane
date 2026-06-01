-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WidgetStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'ARCHIVED');

-- CreateTable
CREATE TABLE "instances" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "instance_name" TEXT NOT NULL DEFAULT 'Plane',
    "instance_id" TEXT NOT NULL,
    "current_version" TEXT NOT NULL DEFAULT '0.23-dev',
    "latest_version" TEXT,
    "edition" TEXT NOT NULL DEFAULT 'PLANE_COMMUNITY',
    "domain" TEXT NOT NULL DEFAULT '',
    "is_setup_done" BOOLEAN NOT NULL DEFAULT false,
    "is_signup_screen_visited" BOOLEAN NOT NULL DEFAULT false,
    "is_telemetry_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_support_required" BOOLEAN NOT NULL DEFAULT true,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "configurations" JSONB,

    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "email" TEXT NOT NULL,
    "username" TEXT,
    "first_name" TEXT NOT NULL DEFAULT '',
    "last_name" TEXT NOT NULL DEFAULT '',
    "display_name" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '',
    "avatar_url" TEXT,
    "date_joined" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_staff" BOOLEAN NOT NULL DEFAULT false,
    "is_superuser" BOOLEAN NOT NULL DEFAULT false,
    "is_instance_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_bot_user" BOOLEAN NOT NULL DEFAULT false,
    "user_timezone" TEXT NOT NULL DEFAULT 'UTC',
    "language" VARCHAR(20) NOT NULL DEFAULT 'en',
    "week_start_day" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_login_medium" TEXT NOT NULL DEFAULT 'email',
    "is_password_autoset" BOOLEAN NOT NULL DEFAULT false,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "token_updated_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expired_at" TIMESTAMP(3),
    "last_used" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "user_type" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_activity_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "status_code" INTEGER NOT NULL,

    CONSTRAINT "api_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "logo_url" TEXT,
    "org_size" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "workspace_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "role" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "company_role" TEXT,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_member_invites" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT NOT NULL,
    "message" TEXT,
    "responded_at" TIMESTAMP(3),
    "role" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "workspace_member_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "network" INTEGER NOT NULL DEFAULT 2,
    "default_assignee_id" UUID,
    "project_lead_id" UUID,
    "emoji" TEXT,
    "icon_prop" JSONB,
    "cover_image" TEXT,
    "module_view" BOOLEAN NOT NULL DEFAULT false,
    "cycle_view" BOOLEAN NOT NULL DEFAULT false,
    "issue_views_view" BOOLEAN NOT NULL DEFAULT false,
    "page_view" BOOLEAN NOT NULL DEFAULT true,
    "intake_view" BOOLEAN NOT NULL DEFAULT false,
    "is_time_tracking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_issue_type_enabled" BOOLEAN NOT NULL DEFAULT false,
    "estimate_id" UUID,
    "archive_in" INTEGER NOT NULL DEFAULT 0,
    "close_in" INTEGER NOT NULL DEFAULT 0,
    "default_state_id" UUID,
    "timezone" TEXT,
    "external_source" TEXT,
    "external_id" TEXT,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "role" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member_invites" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "invited_by_id" UUID,
    "email" TEXT NOT NULL,
    "role" INTEGER NOT NULL DEFAULT 5,
    "token" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "project_member_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_user_properties" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "display_filters" JSONB NOT NULL DEFAULT '{}',
    "display_properties" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "project_user_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "states" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#ffffff',
    "slug" TEXT NOT NULL,
    "sequence" DOUBLE PRECISION NOT NULL DEFAULT 65535,
    "group" TEXT NOT NULL DEFAULT 'backlog',
    "is_triage" BOOLEAN NOT NULL DEFAULT false,
    "default" BOOLEAN NOT NULL DEFAULT false,
    "external_source" TEXT,
    "external_id" TEXT,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 65535,
    "external_source" TEXT,
    "external_id" TEXT,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "parent_id" UUID,
    "state_id" UUID,
    "entity_id" UUID,
    "name" TEXT NOT NULL,
    "description_json" JSONB,
    "description_html" TEXT NOT NULL DEFAULT '<p></p>',
    "description_stripped" TEXT NOT NULL DEFAULT '',
    "priority" TEXT NOT NULL DEFAULT 'none',
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 65535,
    "completed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "sequence_id" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3),
    "target_date" TIMESTAMP(3),
    "point" INTEGER,
    "external_source" TEXT,
    "external_id" TEXT,
    "legacy_ticket_number" VARCHAR(50),

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_assignees" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "issue_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_labels" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "issue_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_comments" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "issue_id" UUID NOT NULL,
    "actor_id" UUID,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "comment_json" JSONB,
    "comment_html" TEXT NOT NULL DEFAULT '<p></p>',
    "comment_stripped" TEXT NOT NULL DEFAULT '',
    "access" TEXT NOT NULL DEFAULT 'INTERNAL',
    "edited_at" TIMESTAMP(3),
    "external_source" TEXT,
    "external_id" TEXT,

    CONSTRAINT "issue_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_comment_versions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment_id" UUID NOT NULL,
    "comment_html" TEXT NOT NULL,
    "edited_by_id" UUID,

    CONSTRAINT "issue_comment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_reactions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "reaction" TEXT NOT NULL,

    CONSTRAINT "issue_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_reactions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "comment_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "reaction" TEXT NOT NULL,

    CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_subscribers" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "subscriber_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "issue_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_votes" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "vote" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "issue_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_mentions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "mention_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "issue_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_blockers" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "blocked_by_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "issue_blockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_activities" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "actor_id" UUID,
    "verb" TEXT NOT NULL DEFAULT 'created',
    "field" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "comment" TEXT NOT NULL DEFAULT '',
    "epoch" DOUBLE PRECISION,
    "issue_comment_id" UUID,

    CONSTRAINT "issue_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_attachments" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "asset" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "external_source" TEXT,
    "external_id" TEXT,

    CONSTRAINT "issue_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_links" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "issue_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_relations" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "issue_id" UUID NOT NULL,
    "related_issue_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "relation_type" TEXT NOT NULL DEFAULT 'relates_to',

    CONSTRAINT "issue_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_versions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issue_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "owned_by_id" UUID,
    "last_saved_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "description_json" JSONB,
    "description_html" TEXT,
    "priority" TEXT,
    "state_id" UUID,
    "start_date" TIMESTAMP(3),
    "target_date" TIMESTAMP(3),
    "is_draft" BOOLEAN,
    "completed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "issue_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_time_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "issue_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "logged_date" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_by_id" UUID,

    CONSTRAINT "issue_time_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_issues" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description_json" JSONB,
    "description_html" TEXT NOT NULL DEFAULT '<p></p>',
    "state_id" UUID,
    "priority" TEXT NOT NULL DEFAULT 'none',
    "start_date" TIMESTAMP(3),
    "target_date" TIMESTAMP(3),
    "type_id" UUID,

    CONSTRAINT "draft_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_types" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logo_props" JSONB,
    "is_epic" BOOLEAN NOT NULL DEFAULT false,
    "level" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "external_source" TEXT,
    "external_id" TEXT,

    CONSTRAINT "issue_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_properties" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "issue_type_id" UUID,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "property_type" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_multi" BOOLEAN NOT NULL DEFAULT false,
    "default_value" JSONB,
    "extra_settings" JSONB,
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 65535,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "issue_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_property_options" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 65535,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "issue_property_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_property_values" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "issue_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "value_text" TEXT,
    "value_date" TIMESTAMP(3),
    "value_bool" BOOLEAN,
    "value_number" DOUBLE PRECISION,
    "value_uuid" UUID,

    CONSTRAINT "issue_property_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimates" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'categories',

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_points" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "estimate_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" INTEGER NOT NULL DEFAULT 0,
    "value" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "estimate_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycles" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "owned_by_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "external_source" TEXT,
    "external_id" TEXT,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_issues" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "cycle_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "cycle_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_user_properties" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cycle_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "display_filters" JSONB NOT NULL DEFAULT '{}',
    "display_properties" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "cycle_user_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "lead_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3),
    "target_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "external_source" TEXT,
    "external_id" TEXT,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_issues" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "module_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "module_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_members" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "module_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "module_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_links" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "module_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID,
    "title" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "module_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "owned_by_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "description_json" JSONB,
    "description_html" TEXT NOT NULL DEFAULT '<p></p>',
    "description_stripped" TEXT NOT NULL DEFAULT '',
    "access" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '',
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 65535,
    "archived_at" TIMESTAMP(3),
    "external_source" TEXT,
    "external_id" TEXT,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_pages" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,

    CONSTRAINT "project_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_labels" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "page_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "page_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_versions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "page_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "owned_by_id" UUID,
    "last_saved_at" TIMESTAMP(3) NOT NULL,
    "description_json" JSONB,
    "description_html" TEXT,
    "description_stripped" TEXT,

    CONSTRAINT "page_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intakes" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Intake',
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "view_props" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_issues" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "intake_id" UUID NOT NULL,
    "issue_id" UUID,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" INTEGER NOT NULL DEFAULT -2,
    "snooze_till" TIMESTAMP(3),
    "duplicate_of" UUID,
    "source" TEXT NOT NULL DEFAULT 'in-app',
    "external_source" TEXT,
    "external_id" TEXT,

    CONSTRAINT "intake_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "events" TEXT[],

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "webhook_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 200,
    "request_headers" JSONB,
    "request_body" JSONB,
    "response_headers" JSONB,
    "response_body" TEXT,
    "retried_at" TIMESTAMP(3),

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_webhooks" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "js_code" TEXT NOT NULL,
    "secret" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "custom_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_webhook_audit_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "webhook_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_ip" TEXT,
    "body" TEXT,
    "headers" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error" TEXT,
    "execution_ms" INTEGER,

    CONSTRAINT "custom_webhook_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_views" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "query_data" JSONB NOT NULL DEFAULT '{}',
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "access" TEXT NOT NULL DEFAULT 'PUBLIC',
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "issue_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorites" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "parent_id" UUID,
    "sequence" DOUBLE PRECISION NOT NULL DEFAULT 65535,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "issue_id" UUID,
    "receiver_id" UUID NOT NULL,
    "actor_id" UUID,
    "title" TEXT NOT NULL DEFAULT '',
    "message" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "triggered" TEXT NOT NULL DEFAULT 'issue_activities',

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "property" BOOLEAN NOT NULL DEFAULT true,
    "state" BOOLEAN NOT NULL DEFAULT true,
    "comment" BOOLEAN NOT NULL DEFAULT true,
    "mention" BOOLEAN NOT NULL DEFAULT true,
    "priority" BOOLEAN NOT NULL DEFAULT true,
    "member" BOOLEAN NOT NULL DEFAULT true,
    "email_notification" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytic_views" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "query" JSONB NOT NULL DEFAULT '{}',
    "query_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "analytic_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_integration_configs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "app_id" TEXT,
    "client_id" TEXT,
    "client_secret" TEXT,
    "webhook_secret" TEXT,
    "installation_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "git_integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_repositories" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "config_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "repo_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "git_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_issue_links" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "repository_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "git_issue_id" TEXT NOT NULL,
    "git_issue_url" TEXT NOT NULL,
    "git_issue_num" INTEGER,
    "git_issue_title" TEXT,
    "git_state" TEXT NOT NULL DEFAULT 'open',
    "sync_status" TEXT NOT NULL DEFAULT 'synced',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "git_issue_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_integration_configs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "bot_token" TEXT,
    "team_id" TEXT,
    "team_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "slack_integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_project_channels" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "config_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "channel_id" TEXT NOT NULL,
    "channel_name" TEXT NOT NULL,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "slack_project_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL,
    "base_url" TEXT,
    "api_key" TEXT,
    "default_model" TEXT,
    "timeout_secs" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspace_id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_email" TEXT,
    "actor_ip" TEXT,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "config" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "error_logs" JSONB,
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "imported_items" INTEGER NOT NULL DEFAULT 0,
    "token" TEXT,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "created_by_id" UUID,
    "format" TEXT NOT NULL DEFAULT 'csv',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "download_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "filters" JSONB NOT NULL DEFAULT '{}',
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL DEFAULT 's3',
    "token" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deploy_boards" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "anchor" TEXT NOT NULL,
    "comments_access" BOOLEAN NOT NULL DEFAULT false,
    "reactions_access" BOOLEAN NOT NULL DEFAULT false,
    "votes_access" BOOLEAN NOT NULL DEFAULT false,
    "view_props" JSONB NOT NULL DEFAULT '{}',
    "is_public" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "deploy_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stickies" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "workspace_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#ffffff',
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 65535,

    CONSTRAINT "stickies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_recent_visits" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_recent_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_user_properties" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "display_filters" JSONB NOT NULL DEFAULT '{}',
    "display_properties" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "workspace_user_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" INTEGER,
    "cnpj" VARCHAR(20),
    "city" TEXT,
    "state" VARCHAR(2),
    "email" TEXT,
    "phone" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "legacy_id" INTEGER,
    "external_source" TEXT,
    "external_id" TEXT,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_visits" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "workspace_id" UUID NOT NULL,
    "technician_id" UUID,
    "technician_2_id" UUID,
    "entity_id" UUID,
    "contacts" TEXT,
    "city" TEXT,
    "scheduled_date" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "status" INTEGER NOT NULL DEFAULT 0,
    "period" VARCHAR(50),
    "mot_update" BOOLEAN NOT NULL DEFAULT false,
    "mot_bug_fix" BOOLEAN NOT NULL DEFAULT false,
    "mot_training" BOOLEAN NOT NULL DEFAULT false,
    "mot_improvement" BOOLEAN NOT NULL DEFAULT false,
    "mot_commercial" BOOLEAN NOT NULL DEFAULT false,
    "mot_other" BOOLEAN NOT NULL DEFAULT false,
    "mot_other_description" VARCHAR(255),
    "summary" TEXT,
    "conclusion" TEXT,
    "visit_number" VARCHAR(50),
    "legacy_id" INTEGER,
    "project_ids" JSONB DEFAULT '[]',

    CONSTRAINT "technical_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_visit_issues" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "visit_id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,

    CONSTRAINT "technical_visit_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "workspace_id" UUID,
    "project_id" UUID,
    "entity_type" INTEGER,
    "entity_id" UUID,
    "asset" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mime_type" TEXT,
    "is_uploaded" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_settings" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widgets" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "version" VARCHAR(50) NOT NULL,
    "author" VARCHAR(255) NOT NULL,
    "entry_file" VARCHAR(500) NOT NULL,
    "manifest" JSONB NOT NULL,
    "permissions" TEXT[],
    "status" "WidgetStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "storage_key" VARCHAR(500) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widget_versions" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" VARCHAR(50) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "manifest" JSONB NOT NULL,
    "changelog" TEXT,
    "widget_id" UUID NOT NULL,

    CONSTRAINT "widget_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instances_instance_id_key" ON "instances"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_token_key" ON "api_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_member_id_deleted_at_key" ON "workspace_members"("workspace_id", "member_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_member_invites_token_key" ON "workspace_member_invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_identifier_deleted_at_key" ON "projects"("workspace_id", "identifier", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_name_deleted_at_key" ON "projects"("workspace_id", "name", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_member_id_deleted_at_key" ON "project_members"("project_id", "member_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_invites_token_key" ON "project_member_invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX "project_user_properties_project_id_user_id_key" ON "project_user_properties"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "states_project_id_name_deleted_at_key" ON "states"("project_id", "name", "deleted_at");

-- CreateIndex
CREATE INDEX "issues_legacy_ticket_number_idx" ON "issues"("legacy_ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "issue_assignees_issue_id_assignee_id_deleted_at_key" ON "issue_assignees"("issue_id", "assignee_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_labels_issue_id_label_id_deleted_at_key" ON "issue_labels"("issue_id", "label_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_reactions_issue_id_actor_id_reaction_deleted_at_key" ON "issue_reactions"("issue_id", "actor_id", "reaction", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "comment_reactions_comment_id_actor_id_reaction_deleted_at_key" ON "comment_reactions"("comment_id", "actor_id", "reaction", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_subscribers_issue_id_subscriber_id_deleted_at_key" ON "issue_subscribers"("issue_id", "subscriber_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_votes_issue_id_actor_id_deleted_at_key" ON "issue_votes"("issue_id", "actor_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_mentions_issue_id_mention_id_deleted_at_key" ON "issue_mentions"("issue_id", "mention_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_blockers_issue_id_blocked_by_id_deleted_at_key" ON "issue_blockers"("issue_id", "blocked_by_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_relations_issue_id_related_issue_id_deleted_at_key" ON "issue_relations"("issue_id", "related_issue_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_issues_cycle_id_issue_id_deleted_at_key" ON "cycle_issues"("cycle_id", "issue_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_user_properties_cycle_id_user_id_key" ON "cycle_user_properties"("cycle_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_issues_module_id_issue_id_deleted_at_key" ON "module_issues"("module_id", "issue_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "module_members_module_id_member_id_deleted_at_key" ON "module_members"("module_id", "member_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_pages_project_id_page_id_key" ON "project_pages"("project_id", "page_id");

-- CreateIndex
CREATE UNIQUE INDEX "page_labels_page_id_label_id_key" ON "page_labels"("page_id", "label_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_preferences_workspace_id_user_id_key" ON "user_notification_preferences"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "git_integration_configs_workspace_id_provider_key" ON "git_integration_configs"("workspace_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "slack_integration_configs_workspace_id_key" ON "slack_integration_configs"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_workspace_id_name_deleted_at_key" ON "ai_providers"("workspace_id", "name", "deleted_at");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "deploy_boards_anchor_key" ON "deploy_boards"("anchor");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_user_properties_workspace_id_user_id_key" ON "workspace_user_properties"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "technical_visits_visit_number_idx" ON "technical_visits"("visit_number");

-- CreateIndex
CREATE UNIQUE INDEX "technical_visit_issues_visit_id_issue_id_deleted_at_key" ON "technical_visit_issues"("visit_id", "issue_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_settings_workspace_id_key_key" ON "workspace_settings"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "widgets_status_idx" ON "widgets"("status");

-- CreateIndex
CREATE INDEX "widgets_created_by_id_idx" ON "widgets"("created_by_id");

-- CreateIndex
CREATE INDEX "widget_versions_widget_id_idx" ON "widget_versions"("widget_id");

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_activity_logs" ADD CONSTRAINT "api_activity_logs_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "api_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_member_invites" ADD CONSTRAINT "workspace_member_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_invites" ADD CONSTRAINT "project_member_invites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_user_properties" ADD CONSTRAINT "project_user_properties_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_user_properties" ADD CONSTRAINT "project_user_properties_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_user_properties" ADD CONSTRAINT "project_user_properties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "states" ADD CONSTRAINT "states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "issue_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comment_versions" ADD CONSTRAINT "issue_comment_versions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "issue_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_reactions" ADD CONSTRAINT "issue_reactions_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_reactions" ADD CONSTRAINT "issue_reactions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "issue_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_subscribers" ADD CONSTRAINT "issue_subscribers_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_subscribers" ADD CONSTRAINT "issue_subscribers_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_votes" ADD CONSTRAINT "issue_votes_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_votes" ADD CONSTRAINT "issue_votes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_mentions" ADD CONSTRAINT "issue_mentions_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_mentions" ADD CONSTRAINT "issue_mentions_mention_id_fkey" FOREIGN KEY ("mention_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_blockers" ADD CONSTRAINT "issue_blockers_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_blockers" ADD CONSTRAINT "issue_blockers_blocked_by_id_fkey" FOREIGN KEY ("blocked_by_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_related_issue_id_fkey" FOREIGN KEY ("related_issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_versions" ADD CONSTRAINT "issue_versions_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_time_logs" ADD CONSTRAINT "issue_time_logs_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_time_logs" ADD CONSTRAINT "issue_time_logs_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_issues" ADD CONSTRAINT "draft_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_properties" ADD CONSTRAINT "issue_properties_issue_type_id_fkey" FOREIGN KEY ("issue_type_id") REFERENCES "issue_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_property_options" ADD CONSTRAINT "issue_property_options_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "issue_properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_points" ADD CONSTRAINT "estimate_points_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_owned_by_id_fkey" FOREIGN KEY ("owned_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_issues" ADD CONSTRAINT "cycle_issues_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_issues" ADD CONSTRAINT "cycle_issues_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_user_properties" ADD CONSTRAINT "cycle_user_properties_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_user_properties" ADD CONSTRAINT "cycle_user_properties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_issues" ADD CONSTRAINT "module_issues_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_issues" ADD CONSTRAINT "module_issues_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_members" ADD CONSTRAINT "module_members_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_members" ADD CONSTRAINT "module_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_links" ADD CONSTRAINT "module_links_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_owned_by_id_fkey" FOREIGN KEY ("owned_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_pages" ADD CONSTRAINT "project_pages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_pages" ADD CONSTRAINT "project_pages_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_labels" ADD CONSTRAINT "page_labels_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_labels" ADD CONSTRAINT "page_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_issues" ADD CONSTRAINT "intake_issues_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "intakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_issues" ADD CONSTRAINT "intake_issues_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_webhooks" ADD CONSTRAINT "custom_webhooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_webhook_audit_logs" ADD CONSTRAINT "custom_webhook_audit_logs_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "custom_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_views" ADD CONSTRAINT "issue_views_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_views" ADD CONSTRAINT "issue_views_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytic_views" ADD CONSTRAINT "analytic_views_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_integration_configs" ADD CONSTRAINT "git_integration_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_repositories" ADD CONSTRAINT "git_repositories_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "git_integration_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_repositories" ADD CONSTRAINT "git_repositories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_issue_links" ADD CONSTRAINT "git_issue_links_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "git_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_issue_links" ADD CONSTRAINT "git_issue_links_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_integration_configs" ADD CONSTRAINT "slack_integration_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_project_channels" ADD CONSTRAINT "slack_project_channels_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "slack_integration_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_project_channels" ADD CONSTRAINT "slack_project_channels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_boards" ADD CONSTRAINT "deploy_boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_boards" ADD CONSTRAINT "deploy_boards_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stickies" ADD CONSTRAINT "stickies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stickies" ADD CONSTRAINT "stickies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recent_visits" ADD CONSTRAINT "user_recent_visits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recent_visits" ADD CONSTRAINT "user_recent_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_user_properties" ADD CONSTRAINT "workspace_user_properties_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_user_properties" ADD CONSTRAINT "workspace_user_properties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_visits" ADD CONSTRAINT "technical_visits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_visits" ADD CONSTRAINT "technical_visits_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_visits" ADD CONSTRAINT "technical_visits_technician_2_id_fkey" FOREIGN KEY ("technician_2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_visits" ADD CONSTRAINT "technical_visits_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_visit_issues" ADD CONSTRAINT "technical_visit_issues_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "technical_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_visit_issues" ADD CONSTRAINT "technical_visit_issues_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "widget_versions" ADD CONSTRAINT "widget_versions_widget_id_fkey" FOREIGN KEY ("widget_id") REFERENCES "widgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

