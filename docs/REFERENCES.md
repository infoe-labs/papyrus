# Bundled reference data and guidance

## Growth

WHO Child Growth Standards LMS reference tables, published by CDC, birth to 24 months. Eight CSV tables were downloaded directly from CDC, converted losslessly to JSON numerical fields and bundled in `src/data/who.json`. Exact source URLs, retrieval date, original file hashes and row counts are in `GROWTH-SOURCES.json`. No runtime request is made.

- WHO standard: https://www.who.int/tools/child-growth-standards/
- CDC table index and statistical method: https://www.cdc.gov/growthcharts/who-data-files.htm
- Formula: `z = ((measurement/M)^L - 1)/(L*S)`; for `L=0`, `ln(measurement/M)/S`. Percentiles use the standard normal CDF.
- Published monthly LMS values (or 0.5 cm length values) are linearly interpolated for intermediate coordinates, as allowed by CDC's guidance. Values outside the bundled range have no percentile. The curves show the published 5th, 50th, and 95th reference values.
- Extreme values beyond ±3 z are flagged for measurement review; percentiles are withheld because the extended WHO tail method is not implemented.
- Recumbent-length standards are not applied to explicitly recorded standing heights. No unrequested height correction is fabricated.
- Corrected age is opt-in for premature birth (<37 weeks) up to two years; chronological and raw measurement dates remain unchanged. AAP guidance: https://www.healthychildren.org/English/ages-stages/baby/preemie/Pages/Preemie-Milestones.aspx
- Independent regression examples include WHO male birth weight median 3.3464 kg and published fifth percentile 2.603994 kg, and female birth length median 49.1477 cm.

WHO/CDC are the reference publishers, not sponsors of Papyrus. The application is informational and makes no diagnosis.

## Sleep

- NHS, Helping your baby to sleep: https://www.nhs.uk/baby/caring-for-a-newborn/helping-your-baby-to-sleep/ (checked 2026-11-09).
- NHS safe-sleep guidance: https://www.nhs.uk/best-start-in-life/baby/baby-basics/newborn-and-baby-sleeping-advice-for-parents/safe-sleep-advice-for-babies/ (checked 2026-11-09).
- Sleep Foundation, Newborn Wake Windows, updated 2026-10-13, pediatrician reviewed: https://www.sleepfoundation.org/baby-sleep/newborn-wake-windows . This is practical secondary guidance, not validation of a predictive algorithm.

Papyrus's starting wake windows (60, 120, 150, 180, 225, 300, 360 minutes at the age breakpoints in `prediction.ts`) are configurable engineering assumptions. Infant defaults sit within the broad published ranges. Older toddler defaults are application assumptions; they do not claim clinical authority. A starting value is never an exact medical rule. The model blends robust observations with the starting point, weights records from the last 7/14/30 days, distinguishes window sequence, and makes bounded adjustments after short/long naps or shorter recorded nights. These adjustment weights are original application heuristics, not a scientifically validated prediction model.

Plans summarize simple responsive routines and preserve the family's preferences. Newborn plans emphasize observation, feeding needs and responsive care. No cry-it-out instructions, medication doses, or diagnosed developmental deadlines are generated. Safe-sleep summaries are bundled in the UI so their core content remains accessible offline.
