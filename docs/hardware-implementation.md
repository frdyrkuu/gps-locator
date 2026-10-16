# ESP32 cellular GPS tracker

## Approved hardware direction

Use an **ESP32-based board with an LTE cellular modem and GPS/GNSS capability**,
plus a SIM with a **15 GB no-expiry data plan**. Cellular data is the primary
upload connection; operation away from home must not depend on Wi-Fi or a phone
hotspot. The exact board, modem, carrier and plan are still to be selected.

GPS/GNSS receives positioning signals from existing satellites without internet.
The cellular modem sends those coordinates to the app over the carrier network.
No private satellite service is needed for this design.

```text
Existing GPS/GNSS satellites
             |
             v
GPS/GNSS receiver --> ESP32 --> LTE modem + SIM --> HTTPS API --> Dashboard
                       |
                       +--> Local queue while cellular data is unavailable
```

Start with an upload interval of **30 seconds**, matching the tracker settings in
the app. The device initiates outbound HTTPS requests; the dashboard reads saved
reports from the server. Direct inbound queries to the modem are not part of this
design because mobile connections commonly use carrier NAT. On-demand commands
would require a separate device command channel and are outside this prototype.

### Board and connectivity requirements

- Confirm the exact board includes GNSS, or add a separate compatible receiver;
  an ESP32 board with a cellular modem does not automatically include GPS.
- Match LTE bands and supported network technologies to the intended carrier.
  Avoid assuming a cheap 2G-only modem will have usable service.
- Include the correct LTE and GNSS antennas, a supported SIM, and the carrier's
  APN configuration. Check HTTPS/certificate support in the modem and firmware.
- Size the supply for the board's documented cellular transmit current peaks.
  Use only its specified power input; a bare modem may require a different supply
  voltage from an ESP32 DevKit. Follow the selected board's power/antenna design.
- An integrated board's modem UART, power-enable and GNSS pins are board-specific.
  Use its manufacturer schematic, not the GPIO16/17 example below, for those pins.

### No-expiry data budget

The approved starting allowance is **15 GB**. No-expiry data still requires an
active SIM/account: verify carrier inactivity rules, coverage, modem/IoT usage
terms and how the data allowance is consumed.

Every 30 seconds means 2,880 uploads per day, or 86,400 in 30 days. For illustration
only, a **measured total of 5–20 KB per upload** would use about **0.43–1.73 GB per
30 days**, giving roughly **9–35 months** from 15 GB before other traffic. This is
not a measured device budget: TLS handshakes, responses, reconnections and retries
all contribute. Measure actual SIM usage for a week and extrapolate before relying
on an allowance lifetime. Do not disable TLS verification to reduce consumption.

## Offline behavior and optional Wi-Fi bench prototype

Offline recording requires firmware that stores observations locally. Reports
do not need to be sent immediately, but remote updates require an available
communication link. Loss of cellular coverage or data must trigger local queuing,
not a dependency on finding an unfamiliar Wi-Fi network.

This is a proposed design, not implemented or verified firmware. The bench wiring
below assumes a **classic ESP32-WROOM-32 DevKit** and a UART GPS breakout such as
a NEO-6M. Verify the exact boards before connecting power: other ESP32 variants
can have different pin assignments or reserved pins.

### Optional Wi-Fi bench parts

- Classic ESP32 DevKit.
- UART GPS/GNSS breakout with antenna; a NEO-6M breakout is sufficient for an
  initial test.
- Regulated 5V supply with enough current for the selected boards.
- Jumper wires.

Start with a small, bounded offline queue in ESP32 internal flash. An SD card is
not necessary for the initial prototype; larger or longer recordings may justify
additional storage later.

### Optional Wi-Fi bench wiring schematic

This earlier ESP32-plus-GPS setup can validate position parsing and API uploads
over known Wi-Fi before the cellular board is available. It does not include LTE
and is not the final vehicle installation schematic.

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

### Electrical checks before powering the bench prototype

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
         +-- Cellular data returns --> upload queued observations over HTTPS
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
6. Reconnect to the cellular network using the selected modem's supported
   interface and carrier APN. Bound retry frequency during coverage/data outages;
   do not busy-loop modem reconnections or uploads.

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

Start by verifying valid GPS readings locally, then test cellular HTTPS uploads
(or Wi-Fi for the optional bench setup), then offline storage/reconnect behavior.
Confirm the latest position resumes reporting after an outage while older queued
fixes enter history without moving the marker backward. This document does not supply firmware or
establish that offline buffering is already implemented.

## Vehicle monitoring limits

| Situation | Expected behavior with the planned firmware |
| --- | --- |
| No Wi-Fi, cellular data available | Upload GPS fixes through LTE; Wi-Fi is unnecessary |
| No cellular coverage or usable data, valid GPS reception | Record observations locally while powered |
| Cellular data becomes available again | Resume current reporting and upload queued, still-acceptable observations |
| No communication link | Dashboard retains the last uploaded position |
| No valid GPS fix | Do not invent coordinates; retain the previous valid observation |

Offline-only recording cannot provide remote anti-theft updates without any
communication link. The approved LTE design removes the Wi-Fi dependency but
still depends on carrier coverage and an active SIM/data allowance. Loss of power stops recording; an engineered
backup supply can extend operation but is not included in this prototype.

Before building, confirm the exact ESP32 board, GPS module, logic levels, supply
rating, and installation conditions. No specific hardware has been validated by
this schematic.
