-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ZoneKind" AS ENUM ('CITY_BEACH', 'WILD_COAST', 'PORT_INDUSTRIAL', 'RESORT', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('kk', 'ru');

-- CreateEnum
CREATE TYPE "TgRole" AS ENUM ('RESIDENT', 'EXECUTOR');

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('BOT', 'WEB');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('TRASH', 'PLASTIC', 'OIL', 'DEAD_ANIMAL', 'SEWAGE', 'CONSTRUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NEW', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'AI_CLASSIFIED', 'STATUS_CHANGED', 'ASSIGNED', 'AFTER_PHOTO', 'COMMENT');

-- CreateEnum
CREATE TYPE "ExecutorKind" AS ENUM ('UTILITY', 'ECOLOGY', 'VOLUNTEER_ORG', 'ANIMAL_RESCUE');

-- CreateEnum
CREATE TYPE "CleanupStatus" AS ENUM ('PLANNED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateTable
CREATE TABLE "Zone" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nameKk" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "kind" "ZoneKind" NOT NULL,
    "polygon" JSONB NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "cleanIndex" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "indexUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgUser" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lang" "Lang" NOT NULL DEFAULT 'kk',
    "role" "TgRole" NOT NULL DEFAULT 'RESIDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TgUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "source" "ReportSource" NOT NULL,
    "tgUserId" INTEGER,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "zoneId" INTEGER,
    "comment" TEXT,
    "photo" TEXT NOT NULL,
    "photoThumb" TEXT NOT NULL,
    "afterPhoto" TEXT,
    "category" "Category" NOT NULL DEFAULT 'OTHER',
    "severity" INTEGER NOT NULL DEFAULT 2,
    "aiConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiSummaryKk" TEXT,
    "aiSummaryRu" TEXT,
    "aiRaw" JSONB,
    "categoryConfirmedByUser" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReportStatus" NOT NULL DEFAULT 'NEW',
    "executorId" INTEGER,
    "parentId" INTEGER,
    "duplicatesCount" INTEGER NOT NULL DEFAULT 0,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportEvent" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "type" "EventType" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Executor" (
    "id" SERIAL NOT NULL,
    "nameKk" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "kind" "ExecutorKind" NOT NULL,
    "tgUserId" INTEGER,
    "linkCode" TEXT,

    CONSTRAINT "Executor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cleanup" (
    "id" SERIAL NOT NULL,
    "zoneId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "meetingPoint" TEXT NOT NULL,
    "maxVolunteers" INTEGER NOT NULL DEFAULT 50,
    "status" "CleanupStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cleanup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupSignup" (
    "cleanupId" INTEGER NOT NULL,
    "tgUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleanupSignup_pkey" PRIMARY KEY ("cleanupId","tgUserId")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Zone_slug_key" ON "Zone"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TgUser_telegramId_key" ON "TgUser"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_code_key" ON "Report"("code");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- CreateIndex
CREATE INDEX "Report_zoneId_status_idx" ON "Report"("zoneId", "status");

-- CreateIndex
CREATE INDEX "Report_category_status_createdAt_idx" ON "Report"("category", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_lat_lng_idx" ON "Report"("lat", "lng");

-- CreateIndex
CREATE INDEX "ReportEvent_reportId_createdAt_idx" ON "ReportEvent"("reportId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Executor_tgUserId_key" ON "Executor"("tgUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Executor_linkCode_key" ON "Executor"("linkCode");

-- CreateIndex
CREATE INDEX "Cleanup_startsAt_idx" ON "Cleanup"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_tgUserId_fkey" FOREIGN KEY ("tgUserId") REFERENCES "TgUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "Executor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvent" ADD CONSTRAINT "ReportEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Executor" ADD CONSTRAINT "Executor_tgUserId_fkey" FOREIGN KEY ("tgUserId") REFERENCES "TgUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cleanup" ADD CONSTRAINT "Cleanup_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanupSignup" ADD CONSTRAINT "CleanupSignup_cleanupId_fkey" FOREIGN KEY ("cleanupId") REFERENCES "Cleanup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanupSignup" ADD CONSTRAINT "CleanupSignup_tgUserId_fkey" FOREIGN KEY ("tgUserId") REFERENCES "TgUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

