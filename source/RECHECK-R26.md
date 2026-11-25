# Hercontrole — R26, 11 november 2026

De controle begon met een nieuwe extractie van de werkelijk aangeboden `ShopEasy-Whole-Website-R25.zip`, niet alleen de werkmap. De ZIP-CRC, externe SHA-256 en 555 interne checksums klopten. Alle 1.052 tests slaagden opnieuw vanuit die extractie. Herbouw en tests wijzigden geen van de bestanden uit het manifest.

Een onafhankelijke hercontrole van de financiële wijzigingen vond geen aanvullende fout in de kortingsbasis van bundels, kaart-/orderreferenties, atomair voorraadverbruik, gecombineerde terugbetalingslimieten of herhaalbeveiliging. De lokale SQLite-regressies slaagden.

Er zijn wel vier concrete problemen gevonden en in R26 opgelost:

1. **Juridische terugvaltekst:** de browser kon door de winkel ingevoerde Engelse beleidstekst automatisch vertalen, terwijl de melding aangaf dat de Engelse terugvaltekst werd getoond. De beleidstekst is nu beschermd met `data-no-translate`; HTML wordt nog steeds ontsmet door EJS-escaping.
2. **Franse Contact en FAQ:** deze pagina's misten een eigen Franse inhoudsset. Er zijn volledige Franse koppen, toelichtingen, veiligheidswaarschuwing, zes vragen en antwoorden toegevoegd. Dit werkt ook zonder JavaScript.
3. **Retourhistorie:** een productnaam zoals `Featured` kon in de retourtabel als een interfacewoord worden vertaald. Product- en varianttekst in die cel blijven nu letterlijk bewaard.
4. **Gedeelde mobiele footer:** de eerder verbeterde kolombreedtes en leesbare taalbadge waren beperkt tot Home/Login. Deze gelden nu voor alle klantpagina’s; Franse woorden breken niet meer midden in het woord en de taalbadge is ook daar leesbaar.

Er zijn drie regressietests toegevoegd. De volledige R26-suite telt **1.055 geslaagde tests**, zonder mislukte of overgeslagen tests. De gerichte browsercontrole bevat **13 geslaagde groepen**: beleidsfallback in vier talen met/zonder JavaScript, Franse Contact/FAQ met/zonder JavaScript, en letterlijk behouden retourhistorie na de echte Franse browservertaler.

De bestaande brede browsercontroles zijn opnieuw uitgevoerd; hun actuele resultaten staan in `qa/full-site/`. De nieuwe inhoudsregressies en twee Franse mobiele screenshots staan in `qa/recheck/`. Syntax, lint, core-typecheck, statische audit, releasepreflight, Cloudflare-bronbouw en alle 59 EJS-templates zijn eveneens gecontroleerd.

R26 bevat alle eerdere R25-wijzigingen. R25 is als historische download behouden. Er is geen productieomgeving gewijzigd; live e-mail, betalingen, provideraccounts en domeinconfiguratie vallen buiten deze lokale verificatie. Dit is geen formele WCAG-certificering of garantie dat iedere mogelijke productieconfiguratie foutloos is.
