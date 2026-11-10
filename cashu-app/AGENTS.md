# App page layout

- Keep each page's title and back button visible while content scrolls. Use the shared `PageHeader` styling.
- For viewport-height forms, keep the header outside the scrollable content region. Reserve layout space for the keypad and primary action so they stay visible without covering fields.
- Account for app navigation and device safe areas. Avoid scrolling the whole document for these forms.
- Do not build an APK unless the user explicitly requests one.
