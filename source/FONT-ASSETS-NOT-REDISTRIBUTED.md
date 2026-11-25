# Typography assets — release packaging note

This design release deliberately contains no binary font files. It uses system-font fallbacks, including Arabic/Sorani-capable fonts available on the user’s operating system.

If you already hold independently licensed self-hosted WOFF2 font assets from a previous version, you may install those in `public/fonts/` and add your own `@font-face` declarations / preloads as needed. Never assume a font is licensed for redistribution merely because it exists locally.

The design does not use external Google Fonts or a tracking font service.
