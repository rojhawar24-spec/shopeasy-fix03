# ShopEasy 2.8.95 R28 FIX03 — herstel en lokale verificatie

**Alle 31 geregistreerde codepunten zijn gerepareerd. De volledige lokale suite slaagt: 1.420 tests, 0 fouten, 0 overgeslagen.** Dit register omvat de 26 bevestigde bevindingen en vijf aanvullende risico's uit de audit van FIX02-B. Het resultaat is een technisch gecontroleerde reparatieversie; dit rapport geeft geen algemene 100/100-, productie-, WCAG-, provider- of juridische certificering.

De originele FIX02-B-bron bleef behouden: alle 1.162 oorspronkelijk geïnventariseerde bestanden zijn ongewijzigd en de oorspronkelijke ZIP houdt SHA-256 `a51866cfb1bbc5e36701e58ea6563258a43f97d11dada04761a90680003be341`. Alle wijzigingen zijn in een afzonderlijke werkkopie uitgevoerd.

## Welk bewijs is actueel?

- [Volledige huidige testsuite](docs/qa/fix03/full-suite-final.txt): 1.420/1.420 PASS, 0 FAIL, 0 skip; 177 netto nieuwe tests ten opzichte van de baseline van 1.243.
- [Huidige verificatiesamenvatting](docs/qa/fix03/verification-summary.json) en [volledig register](REMEDIATION-FIX03.json): scope, scenario's en resterende grenzen.
- [Voor/na-prestatiemeting](docs/qa/fix03/performance-before-after.json): dezelfde fixture en dezelfde geordende product-ID's.
- [Browserblokkering](docs/qa/fix03/browser-limitations.json): nul uitgevoerde UI-checks en nul axe-scans.
- [Oorspronkelijke bestanden](docs/qa/fix03/original-source-preservation.json) en [oorspronkelijke ZIP](docs/qa/fix03/original-archive-integrity.json): behoud gecontroleerd.
- [Alle dependencies](docs/qa/fix03/npm-audit-all.json) en [productiedependencies](docs/qa/fix03/npm-audit-production.json): nul gemelde bekende advisories tijdens deze controle.

Gerichte testruns overlappen met de volledige suite en worden niet bij 1.420 opgeteld. De eerste integratierun bevatte fouten; het externe bewijs bewaart die run naast de latere geslaagde uitvoering. Historische R28/FIX01/FIX02-browsertests en Lighthouse-scores zijn geen bewijs voor deze gewijzigde versie.

De definitieve distributie wordt door de bestaande releasewrapper opnieuw gecontroleerd in een schone, tijdelijke installatie. **Het in de uiteindelijke ZIP opgenomen [FINAL-VERIFICATION-REPORT.json](FINAL-VERIFICATION-REPORT.json) bevat de werkelijk uitgevoerde checks van die installatie.** Het externe `verification-log.json` en `CONTENTS.json` leggen de concrete ZIP, heruitpakken, bestandenaantal en SHA-256 vast. Dit bronrapport loopt niet vooruit op die verpakkingsstap.

## Belangrijkste gevolgen voor klanten en beheer

| Onderdeel | Gedrag in FIX03 |
| --- | --- |
| Privacy en voorraad | Een privacybewerking stopt bij onopgeloste orders of retouren. De normale orderafhandeling blijft verantwoordelijk voor reserveringen. |
| Hervatten van betaling | Een klant of gast kan de eigen ongewijzigde betaling voor het laatste artikel hervatten. Eigendom, intentie, provideridentiteit en hersteltermijn blijven vereist. |
| Omruiling | Verzenden boekt de oorspronkelijke SKU/variant en het retouraantal atomair af. Het proces is een gelijksoortige omruiling; een andere variant kiezen is hiermee niet toegevoegd. |
| Brutowinst | Coupon-/bundelkortingen en inbegrepen productbelasting worden consistent verwerkt. De getoonde maatstaf blijft brutowinst op erkende voltooide verkopen; bedrijfskosten, refunds en chargebacks worden niet stilzwijgend in deze maatstaf opgenomen. |
| Bestelmails | Tijdelijke mislukking kan begrensd opnieuw geprobeerd worden met exact dezelfde inhoud en providersleutel. Bij een onzekere, verouderde of gewijzigde providerpoging is expliciete Manager-controle nodig. |
| Registratie | Nieuwe publieke accounts blijven in afwachting. Verificatie per e-mail vereist de token en het actuele registratiewachtwoord. De link openen activeert niets. |
| Handmatige accountgoedkeuring | Een bevoegde Manager bevestigt de identiteit en stelt een ander, sterk wachtwoord in. Onbevestigde oude tokens en sessies vervallen; het actuele registratiewachtwoord is niet meer bruikbaar. |
| Retourbeheer | Een gefilterde lijst toont 50 verzoeken per pagina en maakt ook verzoeken boven de oorspronkelijke grens van 100 bereikbaar. |

## Alle 31 reparaties

Elke onderstaande rij heeft de status **gerepareerd, relevante lokale regressie geslaagd**. Voor gedrag in een echte browser blijft de afzonderlijk beschreven browsergrens gelden. De prioriteit is de oorspronkelijke auditprioriteit.

| ID | Prioriteit | Gerepareerd gedrag en controle |
| --- | --- | --- |
| COM-001 | P1 | Beide privacybewerkingen weigeren onopgeloste orders en open retouren voordat gegevens of voorraad wijzigen. Alleen de normale orderafhandeling kan een reservering vrijgeven. **Controle:** Pending Mollie, bevestigde bankbetaling, cadeaukaartbewaring, annulering vóór verwijdering en late gesimuleerde betaling zijn afgedekt. |
| COM-002 | P2 | De checkout herkent eerst eigendom en exact dezelfde betaalintentie. De eigen reservering blokkeert hervatting niet meer; ook verversen en een winkel met slechts één resterend product werken. **Controle:** Afwijkend adres, andere sessie, gewijzigde providercredential en verstreken hersteltermijn worden geweigerd; één order, één reservering en dezelfde providersleutel blijven behouden. |
| COM-003 | P2 | Het verzenden van een omruiling boekt het oorspronkelijke product of de oorspronkelijke variant en retourhoeveelheid atomair af. Gereserveerde voorraad blijft beschermd. **Controle:** Basisproduct, variant, gelijktijdige dubbele verzending, voorraadtekort, ontbrekende variant en rollback na databasefout zijn getest. **Grens:** Uitsluitend hetzelfde oorspronkelijke product/variant en retouraantal; daadwerkelijke vervangende verzending en koerierafhandeling blijven handmatig. |
| COM-004 | P2 | Productoverzicht en dashboard gebruiken dezelfde exacte verdeling van coupon- en bundelkortingen over orderregels. Een volledige order met ontbrekende historische kostprijs wordt consequent uitgesloten. **Controle:** Een verkoop van 100,00 met 50% korting en 40,00 kosten levert op beide schermen 10,00 brutowinst op; afrondingsgevallen en deelrapportages zijn gecontroleerd. **Grens:** Brutowinst op erkende afgeronde verkopen vóór afzonderlijke refunds/chargebacks en zonder operationele kosten. Ontbreekt een historische kostprijs, dan wordt de volledige order consequent uitgesloten. |
| COM-005 | P2 | Inbegrepen productbelasting wordt uit omzet gehaald voordat de als exclusief belasting getoonde winst wordt berekend. Een numerieke belastingsnapshot blijft behouden na privacyminimalisatie. **Controle:** 121,00 inclusief 21,00 belasting en 50,00 kosten geeft 50,00 brutowinst; belastbare en niet-belastbare verzending, oude orders en minimalisatie zijn getest. **Grens:** Brutowinst op erkende afgeronde verkopen vóór afzonderlijke refunds/chargebacks en zonder operationele kosten. Ontbreekt een historische kostprijs, dan wordt de volledige order consequent uitgesloten. |
| COM-006 | P2 | appearance_logo telt mee als beschermde mediaverwijzing en als vereiste media bij back-up en herstel. Verwijderen van een product mag een gedeeld winkellogo niet verwijderen. **Controle:** Werkelijke lokale HTTP-verwijdering bewaart het logo-BLOB en de opslagquota; ontbrekende logomedia en restore-controles zijn toegevoegd. |
| COM-007 | P2 | Bestelmails bewaren exact dezelfde berichtinhoud, ontvanger, providersleutel en provideridentiteit. Een lease en een token per poging voorkomen dubbel afronden. Manager-herstel controleert de bekeken generatie en poging. **Controle:** Mislukking, leaseverval, verouderde afronding, dagquotum, drie pogingen, hersteltermijn, providerwijziging, expliciete reconciliatie, oude formulieren en historische statusmails zijn getest. **Grens:** Lease 60 seconden; maximaal drie pogingen binnen 23 uur. Onzekere/oude/providergewijzigde pogingen vereisen daadwerkelijke providercontrole door een Manager. Bevestigd niet-verzonden maakt een nieuwe sleutelgeneratie; reconciliatie verstuurt niet automatisch. |
| COM-008 | P2 | Verlanglijstwijzigingen lezen en wijzigen de laatste opgeslagen lijst binnen één transactie. Een GET overschrijft geen nieuwere wijziging meer; de limiet wordt eerlijk teruggegeven. **Controle:** Gelijktijdige verschillende toevoegingen, dubbele toggles, verdwenen producten, de limiet van 50 en verlopen sessies zijn afgedekt, inclusief echte lokale HTTP-concurrentie. |
| PERF-001 | P2 | Een index op order_items(product_id) en afzonderlijke, gebundelde beheeranalyses vervangen de dure herhaalde catalogusscans. De publieke lijst vraagt geen beheercijfers op. **Controle:** Dezelfde query op klonen van dezelfde fixture met 5.000 producten en 10.000 orders geeft dezelfde 24 product-ID’s; daarnaast zijn winstberekening en indexmigratie getest. |
| SEC-001 | P2 | Vroege foutpagina’s krijgen veilige SEO- en navigatiestandaarden. Een ongeldige CSRF-aanvraag veroorzaakt daardoor de bedoelde afwijzing in plaats van een fout tijdens het renderen. **Controle:** Productiemodus: logout, taalwisseling en nieuwsbrief met ontbrekend of verkeerd CSRF leveren HTTP 403 op zonder de bedoelde gegevenswijziging. |
| UI-001 | P2 | AI-verzoeken worden geserialiseerd; herhaald Enter start geen dubbele aanvraag en verouderde antwoorden vervangen de actuele reactie niet. **Controle:** Uitvoering van de echte handler met herhaald Enter, vertraagde antwoorden en fout/herstel. |
| UI-002 | P2 | Een winkelmandlade negeert antwoorden uit een vorige openingsronde. Sluiten, opnieuw openen en fouten behouden de juiste toestand. **Controle:** Werkelijke handlers met omgekeerde antwoordvolgorde, gesloten lade en foutreacties. |
| UI-003 | P2 | Alle betrokken prijsformatters tonen expliciete valutaprecisie. IQD behoudt drie decimalen; tekstfallbacks rekenen met dezelfde hoofdeenheden, ook zonder Intl. **Controle:** Nul, twee en drie decimalen, IQD 1,234/1,001 en geforceerde formatteruitval zijn getest in frontend en ordermail. |
| UI-006 | P2 | Checkout, gastretouren en voorraadbeheer tonen de benodigde productopties samen met product/variantidentiteit. **Controle:** Beide optieassen en variant-SKU’s zijn in de relevante templates getest. |
| UI-010 | P2 | Formulieren en serverroutes delen één annuleringsbeleid. Een actie die niet is toegestaan wordt niet ten onrechte als reeds aangevraagd bevestigd. **Controle:** Klant en gast: pending COD, processing COD, pending bank, processing bank en Mollie, plus herhaalde echte verzoeken. |
| OPS-001 | P3 | De huidige documentatie noemt de echte dependencyversies, Manager/Admin-rechten, gasttokens en nieuwe herstel- en verificatieroutes. Oude bewijzen zijn herkenbaar als historisch. **Controle:** Alle declaratieve routes staan in de API-inventaris; versies, integriteitsvelden, lokale links en actuele gedragsbeschrijvingen zijn vergeleken. |
| OPS-002 | P3 | Het offsite downloadpad verwijst ook bij een aangepaste doelmap naar het juiste back-upbestand; argumenten en bijzondere tekens blijven correct gescheiden. **Controle:** Gerichte tests omvatten lokale scp/SFTP-overdracht en mappen met spaties, quotes en metatekens. |
| OPS-003 | P3 | De licentiedatum moet een werkelijk bestaande kalenderdatum zijn. JavaScript-normalisatie kan onmogelijke dagen niet meer stilzwijgend accepteren. **Controle:** Ongeldige dagen, schrikkeljaren, maandgrenzen en correcte datums zijn getest. |
| SEC-002 | P3 | Gestructureerde, ongeldige sessiecookies worden eerst op type en formaat gecontroleerd en daarna veilig vervangen. Ze veroorzaken geen aanhoudende HTTP 500 meer. **Controle:** Object-, array- en overige ongeldige cookies zijn via echte HTTP getest, inclusief nieuwe veilige cookies en herstel bij een volgende aanvraag. |
| SEC-003 | P3 | PNG-containers, CRC’s, eindstructuur en gecomprimeerde beelddata worden binnen vaste grenzen gecontroleerd. JPEG- en WebP-structuren krijgen volledige containercontroles. **Controle:** De onvolledige PNG van 33 bytes wordt geweigerd zonder logo-, media- of quotawijziging; echte PNG, progressieve JPEG en WebP met transparantie blijven bruikbaar. |
| UI-004 | P3 | De dynamische bestelknop blijft in de gekozen interfacetaal wanneer een variant verandert. **Controle:** Nieuwe handlers en vertaalde knopteksten zijn voor de ondersteunde talen gecontroleerd. |
| UI-005 | P3 | Merk-, product- en categorienamen en andere winkelinhoud worden expliciet beschermd tegen automatische interfacevertaling. **Controle:** Template- en vertaalcontroles bevestigen behoud van aangeleverde winkelteksten. |
| UI-007 | P3 | Fotozoom laat Ctrl-, Cmd-, Shift- en andere aangepaste klikacties aan de browser over. **Controle:** Gewone zoomklik en alternatieve klikacties zijn afzonderlijk uitgevoerd. |
| UI-008 | P3 | De terugknop bewaart een gevalideerd lokaal pad inclusief query en fragment, zodat de oorspronkelijke aanmeldbestemming behouden blijft. **Controle:** Behoud van veilige next-parameters en weigering van externe, protocol-relatieve en gemanipuleerde bestemmingen. |
| UI-009 | P3 | De vorige productpagina bewaart het gekozen statusfilter. **Controle:** Links voor actief, gearchiveerd en andere ondersteunde filters zijn gecontroleerd. |
| UI-011 | P4 | De lokale Manager-herstelpagina gebruikt unieke document-ID’s en één hoofdinhoudsdoel. **Controle:** Gerenderde templatecontrole op dubbele ID’s en het skiplinkdoel. |
| SEC-004 | P3 | Nieuwe publieke accounts blijven pending; bestaande en nieuwe adressen krijgen dezelfde zichtbare reactie. Offline Manager-goedkeuring vervangt het wachtwoord na identiteitscontrole. E-mailverificatie vereist een token én het actuele registratiewachtwoord op een CSRF-beschermde POST. **Controle:** Geen automatische login, geen activering door een linkklik alleen, rol/MFA/CSRF-controles, geweigerde wachtwoordherhaling, token- en sessie-intrekking, races en atomair wachtwoordbewijs zijn afgedekt. **Grens:** Offline identiteitscontrole is een menselijke Manager-taak. De e-mailcontrole vergelijkt het actuele opgeslagen wachtwoord, inclusief een eventuele geldige wachtwoordreset. |
| UI-RISK-01 | P3 | Herstel via pageshow maakt achtergebleven winkelmandvergrendelingen vrij, zodat plus/min weer kunnen reageren. **Controle:** Synthetisch herstel van een bewaard document en afgebroken submitpaden; echte BFCache-uitvoering blijft een browsercontrole. |
| UI-RISK-02 | P3 | Zoeksuggesties ondersteunen Escape, pijltjestoetsen, selectie met Enter, comboboxrelaties en aankondiging van het aantal resultaten. **Controle:** Toetsen, actieve optie, live-status, fouten en verouderde zoekreacties zijn met de echte handler uitgevoerd. |
| UI-RISK-03 | P3 | De meter voor gratis verzending heeft een programmatische naam en duidelijke waarde-informatie. **Controle:** Gerenderde attributen en vertaalde naam/waarde in de ondersteunde talen zijn gecontroleerd. |
| UI-RISK-04 | P2 | De retourwachtrij heeft gefilterde paginering van 50 verzoeken per pagina, inclusief begrensde paginanummers en totaal. **Controle:** Een werkelijke lokale HTTP-test bereikt alle 101 verzoeken over drie pagina’s, inclusief het oudste verzoek en een te groot paginanummer. |

## Uitvoering en precisie

De volledige applicatiesuite is uitgevoerd op Linux met Node.js 24.22.3 en npm 11.19.1. Echte lokale HTTP-verzoeken en native lokale SQLite/libSQL-transacties zijn gebruikt, waaronder gelijktijdige wijzigingen, rollback na fouten, upgrade van een bestaande FIX02-B-database en daadwerkelijke versleutelde back-up/restore. De Manager-integratie volgt MFA, goedkeuring via HTTP, login met het vervangende wachtwoord, COD-checkout en intrekking bij logout.

Alle 62 EJS-templates compileren. Syntaxcontrole, statische import-/hygienelint, de afgebakende core-typecheck, statische audit, productiepreflight en Cloudflare-bronbuild zijn geslaagd. De core-typecheck omvat vier geselecteerde modules. De Cloudflare-build is geen deployment. De schone releasewrapper voert deze controles opnieuw uit op de versie die hij verpakt.

Bestelmails en betaalreacties zijn in de integratietests lokaal onderschept. Er zijn geen echte klantmails, betalingen of productiegegevens verzonden. Een daadwerkelijke lokale OpenSSH/SFTP-subsystemoverdracht bevestigt de downloadargumenten; dit is geen test van externe offsite-bewaring.

### Catalogusprestatie

| Meting | FIX02-B | FIX03 |
| --- | ---: | ---: |
| Native `listProducts`, één query | 20.463,33 ms | 10,56 ms |
| Teruggegeven producten | 24 | 24 |
| Geordende product-ID's | 396 t/m 419 | 396 t/m 419 |
| Database-integriteit | OK | OK |

Beide versies gebruikten klonen van dezelfde synthetische fixture: 5.000 producten, 10.000 orders en 10.000 orderregels, `limit=24`, `offset=2376`, `sort=price_low`. Dit is één lokale native query per versie. Het is geen meting van HTTP, koude/warmteverdeling, langdurige belasting, gelijktijdige checkout of een productie-SLA. De fixture heeft bewust geen betalingsreferenties en is niet gebruikt als bewijs voor brutowinst; winst heeft eigen regressietests.

### Bestelmailherstel

De database bewaart de exacte berichtinhoud, ontvanger, providerfingerprint en idempotentiesleutel. Iedere claim heeft een eigen token en een lease van 60 seconden. Automatisch hergebruik is begrensd tot drie pogingen, met 5/10 seconden wachttijd en een venster van 23 uur. Het dagquotum telt pogingen. Oude of onzekere records vereisen Manager-reconciliatie; zowel generatie als pogingnummer moeten nog overeenkomen met het bekeken formulier. Reconciliatie verstuurt op zichzelf geen mail.

Het 23-uursvenster houdt marge binnen de gedocumenteerde 24 uur sleutelbewaring van [Resend](https://resend.com/docs/dashboard/emails/idempotency-keys). De tests bevestigen lokaal het hergebruik van dezelfde body/sleutel en de afhandeling van races. Ze bewijzen geen daadwerkelijke bezorging of universele exact-eenmaal-bezorging bij een externe provider.

### Beeldvalidatie

PNG wordt gecontroleerd op complete chunks, CRC, eindstructuur, begrensde decompressie en scanlines, met aanvullende palette-, Adam7- en APNG-controles. De bestaande upload- en pixelgrenzen blijven gelden; gedecomprimeerde data is begrensd op 64 MiB. JPEG en WebP krijgen structuur- en containercontrole. Er wordt geen volledige JPEG/WebP-pixel- of entropydecodering uitgevoerd. Geldige fixtures en daadwerkelijke uploadroutes zijn getest; een universele garantie dat iedere structureel complete afbeelding rendert wordt niet gegeven.

## Gecontroleerd overnemen

De ZIP is een volledig bronproject. Hij bevat geen winkeldata, `.env`, uploads of geïnstalleerde dependencies. De pakketversie blijft 2.8.95; FIX03 is de expliciete revisie in de releasebestanden.

1. Maak via de bestaande back-upinstructies een versleutelde back-up van de huidige database en alle vereiste media. Controleer herstel in een afzonderlijk leeg doel. Bewaar de oude release en configuratie.
2. Pak FIX03 uit in een **nieuwe** map. Controleer vóór installatie of eigen bestanden met `npm run verify:package` de exacte meegestuurde bestanden en hashes.
3. Gebruik Node.js `>=24.22.2 <25` en installeer het lockbestand met `npm ci --ignore-scripts --no-audit --no-fund`. Volg vervolgens [DEPLOYMENT.md](DEPLOYMENT.md) en [STAGING-QA-RUNBOOK.md](STAGING-QA-RUNBOOK.md). Behoud de eigen `.env`, database en media buiten het releasepakket.
4. Start eerst op staging met een kopie van de data. De normale database-initialisatie past de voorwaartse, aanvullende kolommen/index toe. FIX03 voegt onder meer de numerieke productbelastingsnapshot en velden voor mailclaims/herstel toe. [SCHEMA.md](SCHEMA.md) en [database-schema.json](database-schema.json) beschrijven de actuele export.
5. Controleer de relevante winkelconfiguratie, een eigen pending betaalhervatting, aanmelding/verificatie, Manager-goedkeuring, retour-/omruilvoorraad, mailherstel en back-upherstel. Gebruik geautoriseerde provider-testaccounts en testontvangers voor de externe stappen.
6. Neem de versie pas via de normale deploymentprocedure over als de tests voor de eigen host en providerconfiguratie gereed zijn. Alleen broncode terugzetten draait een databasemigratie niet terug; herstel zo nodig de bijbehorende gecontroleerde back-up.

Er is in deze reparatieronde geen productieomgeving gewijzigd.

## Resterende verificatiegrenzen

De codebevindingen en de ontbrekende externe bewijzen zijn verschillende dingen. De eerste groep is gerepareerd. De onderstaande punten blijven expliciet zichtbaar; onbekend of niet uitgevoerd wordt niet als geslaagd geboekt.

| Onderdeel | Actuele grens |
| --- | --- |
| Echte browser en responsiviteit | Beide actuele workflows stopten voor het renderen. De gepinde Chromium ontbreekt; de bestaande systeembrowser wordt bij `socket()` geblokkeerd met `Operation not permitted`. Nul UI-checks, nul axe-scans. |
| Toegankelijkheid | Handler- en templatecontroles slagen. Echte focus, contrast, zoom, schermlezers, RTL-bediening en volledige WCAG-beoordeling zijn nog niet uitgevoerd. |
| Betaal-, mail- en factuurproviders | Mollie/Resend-reacties zijn gesimuleerd; werkelijke sandboxtransacties, inboxbezorging/mailclients en Peppol/Recommand-acceptatie ontbreken. |
| Hosting en herstel | Geen actuele productie-/publieke TLS-deployment, remote offsite-bewaring, remote libSQL, multi-instance- of schone-host-herstelrepetitie. |
| Belasting en platformen | Geen langdurige capaciteitstest en geen daadwerkelijke Windows/PowerShell/macOS-uitvoering. De uitgevoerde catalogusmeting is hierboven afgebakend. |
| Inhoud en rechten | Geen moedertaalreview van alle tekst en geen nieuwe rechten-/licentie-/juridische beoordeling. Negen native componentengrenzen blijven UNKNOWN. Metadata validatie verleent geen verkooprecht. |
| Exhaustiviteit | Niet iedere historische migratietoestand, featurecombinatie, codebranch, dependency of input is semantisch volledig beoordeeld. Een groene suite is geen foutloosheidsgarantie. |

De oorspronkelijke 101-retouren-verificatiegrens is wél lokaal gesloten: de werkelijke HTTP-test bereikt alle 101 records over drie pagina's. Alle 18 oorspronkelijke verificatieonderwerpen staan met hun bijgewerkte status in [het JSON-register](REMEDIATION-FIX03.json).

## Waar de regressies staan

- **COM-001**: [test/fix03-commerce-privacy.test.js](test/fix03-commerce-privacy.test.js).
- **COM-002**: [test/fix03-routes.integration.test.js](test/fix03-routes.integration.test.js).
- **COM-003**: [test/fix03-commerce-workflows.test.js](test/fix03-commerce-workflows.test.js).
- **COM-004**: [test/fix03-commerce-accounting.test.js](test/fix03-commerce-accounting.test.js).
- **COM-005**: [test/fix03-commerce-accounting.test.js](test/fix03-commerce-accounting.test.js).
- **COM-006**: [test/fix03-routes.integration.test.js](test/fix03-routes.integration.test.js).
- **COM-007**: [test/fix03-commerce-email.test.js](test/fix03-commerce-email.test.js), [test/fix03-routes.integration.test.js](test/fix03-routes.integration.test.js), [test/fix03-email-payload.test.js](test/fix03-email-payload.test.js).
- **COM-008**: [test/fix03-commerce-workflows.test.js](test/fix03-commerce-workflows.test.js), [test/fix03-routes.integration.test.js](test/fix03-routes.integration.test.js).
- **PERF-001**: [test/fix03-commerce-accounting.test.js](test/fix03-commerce-accounting.test.js), [test/fix03-commerce-upgrade.test.js](test/fix03-commerce-upgrade.test.js).
- **SEC-001**: [test/fix03-security-ops-http.test.js](test/fix03-security-ops-http.test.js).
- **UI-001**: [test/fix03-frontend-handlers.test.js](test/fix03-frontend-handlers.test.js).
- **UI-002**: [test/fix03-frontend-handlers.test.js](test/fix03-frontend-handlers.test.js).
- **UI-003**: [test/fix03-frontend-handlers.test.js](test/fix03-frontend-handlers.test.js), [test/fix03-email-payload.test.js](test/fix03-email-payload.test.js).
- **UI-006**: [test/fix03-frontend-templates.test.js](test/fix03-frontend-templates.test.js).
- **UI-010**: [test/fix03-commerce-workflows.test.js](test/fix03-commerce-workflows.test.js), [test/fix03-routes.integration.test.js](test/fix03-routes.integration.test.js), [test/fix03-frontend-templates.test.js](test/fix03-frontend-templates.test.js).
- **OPS-001**: [test/release-documentation.test.js](test/release-documentation.test.js).
- **OPS-002**: [test/fix03-security-ops-backup.test.js](test/fix03-security-ops-backup.test.js).
- **OPS-003**: [test/fix03-security-ops-backup.test.js](test/fix03-security-ops-backup.test.js).
- **SEC-002**: [test/fix03-security-ops-http.test.js](test/fix03-security-ops-http.test.js).
- **SEC-003**: [test/fix03-security-ops-images.test.js](test/fix03-security-ops-images.test.js), [test/fix03-security-ops-upload.test.js](test/fix03-security-ops-upload.test.js).
- **UI-004**: [test/fix03-frontend-localization.test.js](test/fix03-frontend-localization.test.js).
- **UI-005**: [test/fix03-frontend-localization.test.js](test/fix03-frontend-localization.test.js), [test/fix03-frontend-templates.test.js](test/fix03-frontend-templates.test.js).
- **UI-007**: [test/fix03-frontend-handlers.test.js](test/fix03-frontend-handlers.test.js).
- **UI-008**: [test/fix03-frontend-templates.test.js](test/fix03-frontend-templates.test.js).
- **UI-009**: [test/fix03-frontend-templates.test.js](test/fix03-frontend-templates.test.js).
- **UI-011**: [test/fix03-frontend-templates.test.js](test/fix03-frontend-templates.test.js).
- **SEC-004**: [test/fix03-commerce-verification.test.js](test/fix03-commerce-verification.test.js), [test/fix03-security-ops-http.test.js](test/fix03-security-ops-http.test.js), [test/manager-dashboard.integration.test.js](test/manager-dashboard.integration.test.js).
- **UI-RISK-01**: [test/fix03-frontend-handlers.test.js](test/fix03-frontend-handlers.test.js).
- **UI-RISK-02**: [test/fix03-frontend-handlers.test.js](test/fix03-frontend-handlers.test.js).
- **UI-RISK-03**: [test/fix03-frontend-templates.test.js](test/fix03-frontend-templates.test.js).
- **UI-RISK-04**: [test/fix03-routes.integration.test.js](test/fix03-routes.integration.test.js).
