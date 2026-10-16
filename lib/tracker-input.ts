import { z } from "zod";

export const trackerInput = z.strictObject({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["ESP32", "IPHONE", "APPLE_WATCH"]),
  reportingMode: z.enum(["INTERVAL", "ON_DEMAND"]),
  expectedIntervalSeconds: z.number().int().min(10).max(86400).nullable(),
}).refine((v) => (v.reportingMode === "INTERVAL") === (v.expectedIntervalSeconds !== null));

export const trackerSelect = {
  id: true, name: true, type: true, reportingMode: true, expectedIntervalSeconds: true,
  latestLocation: { select: { latitude: true, longitude: true, reportedAt: true,
    receivedAt: true, source: true, accuracyMeters: true, batteryPercent: true, speedMps: true } },
} as const;
