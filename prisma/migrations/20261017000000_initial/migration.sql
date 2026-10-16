CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "TrackerType" AS ENUM ('ESP32', 'IPHONE', 'APPLE_WATCH');
CREATE TYPE "ReportingMode" AS ENUM ('INTERVAL', 'ON_DEMAND');
CREATE TYPE "LocationSource" AS ENUM ('ESP32', 'IPHONE_SHORTCUT', 'WATCH_PHONE_ASSISTED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL DEFAULT 'owner',
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_single_owner" CHECK ("id" = 'owner')
);

CREATE TABLE "Tracker" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "TrackerType" NOT NULL,
    "reportingMode" "ReportingMode" NOT NULL,
    "expectedIntervalSeconds" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Tracker_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Tracker_name_nonblank" CHECK (length(trim("name")) > 0),
    CONSTRAINT "Tracker_interval_mode" CHECK (
        ("reportingMode" = 'INTERVAL' AND "expectedIntervalSeconds" BETWEEN 10 AND 86400)
        OR ("reportingMode" = 'ON_DEMAND' AND "expectedIntervalSeconds" IS NULL)
    )
);

CREATE TABLE "DeviceCredential" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "tokenId" VARCHAR(64) NOT NULL,
    "tokenDigest" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    CONSTRAINT "DeviceCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationPoint" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accuracyMeters" DOUBLE PRECISION,
    "batteryPercent" DOUBLE PRECISION,
    "speedMps" DOUBLE PRECISION,
    "messageId" VARCHAR(128),
    "source" "LocationSource" NOT NULL,
    CONSTRAINT "LocationPoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LocationPoint_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "LocationPoint_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180),
    CONSTRAINT "LocationPoint_accuracy_nonnegative" CHECK ("accuracyMeters" >= 0),
    CONSTRAINT "LocationPoint_battery_range" CHECK ("batteryPercent" BETWEEN 0 AND 100),
    CONSTRAINT "LocationPoint_speed_nonnegative" CHECK ("speedMps" >= 0)
);

CREATE TABLE "LatestLocation" (
    "trackerId" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "accuracyMeters" DOUBLE PRECISION,
    "batteryPercent" DOUBLE PRECISION,
    "speedMps" DOUBLE PRECISION,
    "source" "LocationSource" NOT NULL,
    CONSTRAINT "LatestLocation_pkey" PRIMARY KEY ("trackerId"),
    CONSTRAINT "LatestLocation_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "LatestLocation_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180),
    CONSTRAINT "LatestLocation_accuracy_nonnegative" CHECK ("accuracyMeters" >= 0),
    CONSTRAINT "LatestLocation_battery_range" CHECK ("batteryPercent" BETWEEN 0 AND 100),
    CONSTRAINT "LatestLocation_speed_nonnegative" CHECK ("speedMps" >= 0)
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Tracker_ownerId_idx" ON "Tracker"("ownerId");
CREATE UNIQUE INDEX "DeviceCredential_tokenId_key" ON "DeviceCredential"("tokenId");
CREATE INDEX "DeviceCredential_trackerId_idx" ON "DeviceCredential"("trackerId");
CREATE INDEX "LocationPoint_trackerId_reportedAt_id_idx" ON "LocationPoint"("trackerId", "reportedAt" DESC, "id" DESC);
CREATE INDEX "LocationPoint_receivedAt_idx" ON "LocationPoint"("receivedAt");
CREATE UNIQUE INDEX "LocationPoint_trackerId_messageId_key" ON "LocationPoint"("trackerId", "messageId");

ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceCredential" ADD CONSTRAINT "DeviceCredential_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationPoint" ADD CONSTRAINT "LocationPoint_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LatestLocation" ADD CONSTRAINT "LatestLocation_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
