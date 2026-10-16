# ESP32 offline GPS prototype

An ESP32 and GPS/GNSS receiver can obtain coordinates without Wi-Fi, a SIM, or
internet. Offline recording requires firmware that stores those observations
locally. Remote dashboard updates still require an internet connection.

This is a proposed prototype, not implemented or verified firmware. The wiring
below assumes a **classic ESP32-WROOM-32 DevKit** and a UART GPS breakout such as
a NEO-6M. Verify the exact boards before connecting power: other ESP32 variants
can have different pin assignments or reserved pins.

## Parts

- Classic ESP32 DevKit.
- UART GPS/GNSS breakout with antenna; a NEO-6M breakout is sufficient for an
  initial test.
- Regulated 5V supply with enough current for the selected boards.
- Jumper wires.

Start with a small, bounded offline queue in ESP32 internal flash. An SD card is
not necessary for the initial prototype; larger or longer recordings may justify
additional storage later.

## Wiring schematic

**The power wiring below applies only to a GPS breakout explicitly rated for 5V
input.** A bare NEO-6M receiver is not a 5V device. Some breakout boards include
an input regulator; check the actual board's specification rather than assuming.

```text
                REGULATED 5V SUPPLY
                 +              -
                 |              |
           +-----+-----+    +----+----------+
           |           |    |               |
           v           v    v               v
      ESP32 5V/VIN   GPS VCC ESP32 GND     GPS GND


          GPS MODULE                       ESP32 DevKit
        +-------------+                  +----------------+
        | TX          |----------------->| GPIO16 / RX2   |
        | RX          |<-----------------| GPIO17 / TX2   |
        |             |                  |                |
        | GPS antenna |                  | USB / VIN      |
        +-------------+                  +----------------+
```

| GPS pin | ESP32 connection |
| --- | --- |
| `TX` | `GPIO16` (UART receive) |
| `RX` | `GPIO17` (UART transmit); optional for configuring the receiver |
| `GND` | Common `GND` with the ESP32 and supply |
| `VCC` | Supply voltage explicitly allowed by the GPS breakout |

TX connects to RX, and RX connects to TX. GPS RX can remain disconnected when
only reading the receiver's default position output. Configure the firmware's
UART pins and baud rate to match the board and receiver.

### Electrical checks before powering

- ESP32 GPIO uses **3.3V logic**. Confirm that GPS TX is compatible; if it outputs
  5V logic, use appropriate level shifting before the ESP32 RX pin. A regulator
  on GPS VCC does not automatically make its signal pins safe.
- Feed 5V only into the ESP32 board's supported **5V/VIN/USB input**, never its
  `3V3` pin. If the GPS breakout requires a 3.3V supply, revise its VCC wiring and
  verify the chosen regulator has sufficient capacity.
- Avoid simultaneous external 5V and USB power unless the board's power-path
  design explicitly supports it.
- This diagram starts at an already regulated 5V source. Do not connect vehicle
  12V directly. A permanent installation needs a suitably protected automotive
  supply, including protection against transients and reverse polarity.
- Test reception outdoors with a clear sky view and suitable antenna placement.
  A valid fix is not guaranteed inside buildings, garages, or behind shielding.

## Planned offline behavior

```text
GPS obtains a valid fix
         |
         v
ESP32 queues coordinates + GPS UTC observation time + messageId
         |
         +-- No internet --> retain observations locally
         |
         +-- Wi-Fi returns --> upload queued observations over HTTPS
                                      |
                                      v
                               Existing dashboard
```

The firmware must:

1. Parse a valid GPS fix and observation timestamp. Never substitute `0,0` for a
   missing fix; `0,0` can itself be a real coordinate.
2. Store observations in a bounded queue. Define what happens when storage fills
   and batch writes to limit flash wear; account for records that can be lost
   before a batch is persisted.
3. Preserve each observation's timestamp and `messageId` across retries.
4. Upload through HTTPS with certificate validation and a per-device token.
5. Remove queued records only after acceptance or duplicate acknowledgement.
   Handle permanently invalid/expired records explicitly so they cannot block
   later uploads; respect rate limits and back off on transient failures.

The current API accepts observations at most **seven days old** and at most
**five minutes ahead** of server time. Older offline records need an explicit
expiry/export policy; they cannot be uploaded unchanged to the current endpoint.
History accepts valid delayed reports without moving a newer last-known marker
backward. The dashboard displays the last uploaded observation while disconnected.

## Connect to the existing app

Create a tracker with **ESP32** type, **Interval** reporting mode, and an expected
interval matching the firmware's upload schedule (for example, 30 seconds). Issue
its own device token and send observations to:

```text
POST https://YOUR-APP/api/v1/locations
Authorization: Bearer YOUR_DEVICE_TOKEN
Content-Type: application/json
```

Use `source: "ESP32"`, the correct `trackerId`, numeric coordinates, an ISO 8601
`reportedAt`, and a stable per-observation `messageId`. See
[device setup](device-setup.md) for the payload and an HTTPS smoke test, and
[architecture](../ARCHITECTURE.md) for the full contract.

Start by verifying valid GPS readings locally, then test Wi-Fi uploads, then
offline storage/reconnect behavior. This document does not supply firmware or
establish that offline buffering is already implemented.

## Vehicle monitoring limits

| Situation | Expected behavior with the planned firmware |
| --- | --- |
| No Wi-Fi, valid GPS reception | Record observations locally while powered |
| Known Wi-Fi becomes available | Upload queued, still-acceptable observations |
| Vehicle leaves all available internet connections | Dashboard retains the last uploaded position |
| Cellular modem and SIM added later | Remote uploads become possible while coverage and data are available |

Offline-only recording cannot provide remote anti-theft tracking when the vehicle
is taken away from Wi-Fi. Cellular connectivity requires additional hardware,
power capacity, and firmware work. Loss of power stops recording; an engineered
backup supply can extend operation but is not included in this prototype.

Before building, confirm the exact ESP32 board, GPS module, logic levels, supply
rating, and installation conditions. No specific hardware has been validated by
this schematic.
