import { z } from "zod";

export const locationInput = z.strictObject({
  trackerId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  reportedAt: z.iso.datetime({ offset: true }),
  accuracyMeters: z.number().min(0).optional(),
  batteryPercent: z.number().min(0).max(100).optional(),
  speedMps: z.number().min(0).optional(),
  messageId: z.string().min(1).max(128).optional(),
  source: z.enum(["ESP32", "IPHONE_SHORTCUT", "WATCH_PHONE_ASSISTED"]),
});

export function validObservation(reportedAt: string, now: Date) {
  const time = new Date(reportedAt).getTime();
  return Number.isFinite(time) && time >= now.getTime() - 7 * 86400_000 && time <= now.getTime() + 300_000;
}

export const sourceForType = {
  ESP32: "ESP32", IPHONE: "IPHONE_SHORTCUT", APPLE_WATCH: "WATCH_PHONE_ASSISTED",
} as const;
