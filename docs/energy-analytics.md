# Battery and charging analytics

Available in the Odovi 0.5.0 source candidate. These views read the Odovi
archive; they do not wake the vehicle or activate an external provider.

## Battery range history

Open **Battery** in the sidebar, or **More → Battery** on a phone. Select a
vehicle to view its recorded post-charge rated range over time. The chart and
data table show monthly medians in the configured application timezone.

Each observation uses TeslaMate's reported rated range at charge completion,
divided by the recorded state of charge and normalized to 100%. Only completed
charges adding more than 5 kWh, with a valid end SoC of at least 20%, contribute.
Missing or invalid measurements are excluded and their coverage is shown.
Months without measurements do not become zero-range observations.

The comparison uses the **first month with usable range observations**. This
can be years after the vehicle was new, and the archive can start earlier. Both
the first and latest usable month need at least three qualifying observations,
and must be different months, before a change is displayed. A sparse first
usable month is not silently replaced by a later baseline.

This is a trend in the vehicle's Battery Management System estimate. It does
not measure physical battery degradation, original factory capacity, or the
result of Tesla's battery-health test. Calibration, firmware changes, weather
and battery replacement can affect the observations.

The additive database migration stores the new nullable range field and resets
only the TeslaMate charging watermark once. The next successful sync enriches
existing charging history. This one-time pass can take longer for a large
archive. Costs, notes and locked place assignments remain
user-owned. Imports without independently recorded rated range cannot supply
this history.

## Charging economics

Open **Charging → Charging economics**, then choose the vehicle and month.
The view groups completed charges by AC/DC and charging location, with missing
charger type or location shown separately.

Charging efficiency is the sum of energy added divided by the sum of energy
drawn for the same valid paired sessions. Charging loss is the corresponding
difference. Sessions with a missing measurement, zero drawn energy, or energy
added above energy drawn do not enter the efficiency calculation. The view
reports the paired sample coverage and inconsistent measurements.

Costs are grouped by recorded currency. Missing currency stays unknown; Odovi
does not assume a currency or convert between currencies. A recorded zero cost
is a known free session. Cost per kWh uses only sessions with a valid price and
matching energy, and states the denominator and coverage. Totals for a partial
sample describe that sample rather than the cost of all charging.

## Since the last charge

The dashboard shows completed drives starting at or after the latest completed
charge and ending by the current time. Driving energy excludes parking drain.
An active charging session clears the previous boundary until charging ends.
With no reliable completed charge, the summary explains that the boundary is
unavailable.

Trips crossing the boundary are excluded rather than assigning the entire trip
to the period. Ongoing and future trips are excluded. Missing values remain
unavailable or explicitly partial, estimated driving energy is marked, and a
period without drives shows zero distance and energy with no consumption ratio.
