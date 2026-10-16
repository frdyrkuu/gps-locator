# Sending a device's first location

Use a phone-accessible HTTPS deployment or HTTPS development tunnel. `localhost`
on a phone means the phone itself. Non-local plain HTTP submissions are rejected.

1. Sign in to the dashboard and add the appropriate tracker. Use **iPhone / On
   demand** for Shortcuts, **ESP32 / Interval** for a scheduled GPS sender.
2. Select it, issue its device token, and copy it once. The full token belongs only
   in that device's configuration, never in a URL or a shared Shortcut.
3. Find its ID in `GET /api/v1/trackers` from your signed-in browser. Each device
   needs a separate tracker and token. The ingest request uses only its device
   token; it does not need an owner cookie or owner password.

## iPhone Shortcut

Create these actions in order:

1. **Get Current Location**; allow location access.
2. **Get Details of Locations → Latitude**, using the original Current Location.
3. **Set Variable → Latitude**, using that extracted number.
4. **Get Details of Locations → Longitude**, again using the original Current
   Location, not the previous Latitude variable.
5. **Set Variable → Longitude**, using that extracted number.
6. **Current Date**.
7. **Format Date**, using Current Date, with **ISO 8601** format. If unavailable,
   choose Custom: `yyyy-MM-dd'T'HH:mm:ssXXX`.
8. **Get Contents of URL**: `https://YOUR-APP/api/v1/locations`, method **POST**.
   Set headers `Authorization: Bearer YOUR_DEVICE_TOKEN` and
   `Content-Type: application/json`. Choose **JSON** request body:

   | Key (case-sensitive) | Field type | Value |
   | --- | --- | --- |
   | `trackerId` | Text | The full tracker ID |
   | `latitude` | Number | Latitude variable |
   | `longitude` | Number | Longitude variable |
   | `reportedAt` | Text | Formatted Date output |
   | `source` | Text | `IPHONE_SHORTCUT` |

   Insert variable bubbles rather than typing their names. Do not use the Time
   Between Dates action: the server needs a timestamp, not a duration.
9. **Get Text from Input**, using Contents of URL, then **Show Result** using Text.

Run it. Success returns `id` and `receivedAt`; the dashboard shows the fix on its
next visible refresh, normally within 20 seconds plus network/server latency.
This is one report per run, not a guaranteed background feed. A watch-initiated,
phone-assisted setup uses an Apple Watch tracker and `WATCH_PHONE_ASSISTED` source;
it does not establish an independent watch GPS position.

For another iPhone, duplicate the working Shortcut, remove its token/tracker ID,
and share the clean copy through an iCloud link. Fill in the new phone's own values.
Where supported, Shortcut import/setup questions can collect those two values.

## ESP32-shaped HTTPS smoke test

With local `APP_URL`, `TRACKER_ID`, and `DEVICE_TOKEN` environment values, run this
PowerShell example against a temporary **ESP32** tracker. It submits sample
coordinates to check the contract; it does not read a GPS module:

```powershell
$headers = @{ Authorization = "Bearer $env:DEVICE_TOKEN" }
$body = @{
  trackerId = $env:TRACKER_ID
  latitude = 14.676
  longitude = 121.0437
  reportedAt = [DateTime]::UtcNow.ToString("o")
  messageId = [guid]::NewGuid().ToString()
  source = "ESP32"
} | ConvertTo-Json
Invoke-RestMethod -Uri "$env:APP_URL/api/v1/locations" -Method Post `
  -Headers $headers -ContentType "application/json" -Body $body
```

Firmware must send actual valid GPS fixes, use a correctly validated HTTPS
connection, and preserve the observation timestamp and `messageId` when retrying.
Do not disable certificate checks or substitute `0,0` for a missing fix. Accepted
observations are at most seven days old and five minutes ahead of server time.
Wi-Fi-only devices cannot upload while away from Wi-Fi; offline storage/retry and
cellular connectivity require device firmware/hardware work.

## Errors

| Status | Check |
| --- | --- |
| `400` | Exact field names, numeric coordinates, timestamp format/age and source |
| `401` | Ingest URL, `Bearer ` plus full token, and whether it was rotated/revoked |
| `403` | HTTPS, tracker/token binding, and source matching tracker type |
| `413` / `415` | JSON body under 4096 bytes and JSON Content-Type |
| `429` | Wait according to `Retry-After` before retrying |

If reports appear in the list but the map is blank, sending worked. Check the
browser console, worker request, WebGL availability and tile requests instead of
reissuing the token. See [release checks](release.md) for deployment verification.
