# Public-source privacy review

Public source contains application code, open reference datasets, and fictional test profiles. No caregiver account, real child name/profile/photo, personal export, backup, browser database, credential, private network address, or user filesystem path is intentionally included.

The Huckleberry regression CSV uses **synthetic dates** and generic numerical cases to test the published export format. It is not a personal export or the unavailable original 49-row fixture. Test names such as River, Willow, and Juniper are fictional. WHO reference tables are published population standards rather than personal measurements.

Personal CSVs, backups, import audits, credentials, test browser profiles, build output and browser traces are excluded from Git. Keep any future real migration fixture outside the public repository. Never attach real exports, screenshots, backups or failure traces to public issues or workflow artifacts.

The app stores profiles, events and photos in the browser. Users control any CSV/JSON download. There is no runtime analytics beacon, cloud storage service, account or server-side processing. Source publication does not publish a user's browser database.
