-- EnableExtension
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "resource_type" AS ENUM ('ROOM', 'EQUIPMENT', 'VEHICLE');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('CONFIRMED', 'HOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "waitlist_status" AS ENUM ('WAITING', 'OFFERED', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "resource_type" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "min_advance_minutes" INTEGER NOT NULL DEFAULT 60,
    "max_advance_days" INTEGER NOT NULL DEFAULT 30,
    "cancellation_notice_minutes" INTEGER NOT NULL DEFAULT 120,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'CONFIRMED',
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "hold_expires_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "period" tstzrange GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_blocks" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "period" tstzrange GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "desired_starts_at" TIMESTAMPTZ NOT NULL,
    "desired_ends_at" TIMESTAMPTZ NOT NULL,
    "status" "waitlist_status" NOT NULL DEFAULT 'WAITING',
    "offered_booking_id" UUID,
    "offered_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "bookings_resource_id_status_idx" ON "bookings"("resource_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_hold_expires_at_idx" ON "bookings"("status", "hold_expires_at");

-- CreateIndex
CREATE INDEX "maintenance_blocks_resource_id_idx" ON "maintenance_blocks"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_offered_booking_id_key" ON "waitlist_entries"("offered_booking_id");

-- CreateIndex
CREATE INDEX "waitlist_entries_resource_id_status_created_at_idx" ON "waitlist_entries"("resource_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_blocks" ADD CONSTRAINT "maintenance_blocks_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_offered_booking_id_fkey" FOREIGN KEY ("offered_booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_valid_time_range_chk"
  CHECK ("ends_at" > "starts_at");

ALTER TABLE "maintenance_blocks"
  ADD CONSTRAINT "maintenance_blocks_valid_time_range_chk"
  CHECK ("ends_at" > "starts_at");

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_valid_time_range_chk"
  CHECK ("desired_ends_at" > "desired_starts_at");

-- AddExclusionConstraints
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlapping_active_excl"
  EXCLUDE USING gist (
    "resource_id" WITH =,
    "period" WITH &&
  )
  WHERE ("status" IN ('CONFIRMED', 'HOLD'));

ALTER TABLE "maintenance_blocks"
  ADD CONSTRAINT "maintenance_blocks_no_overlap_excl"
  EXCLUDE USING gist (
    "resource_id" WITH =,
    "period" WITH &&
  );