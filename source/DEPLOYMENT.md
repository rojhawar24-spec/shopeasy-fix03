# ShopEasy — persistente Linux-deployment met atomaire releases

Deze route gebruikt één persistente Ubuntu VM, Node.js >=24.22.2 <25, een lokale SQLite-database en Caddy HTTPS. Houd één ShopEasy-proces actief: `RATE_LIMIT_BACKEND=memory-single-instance` deelt geen toestand tussen replicas. Cloudflare Workers/Turso blijven een afzonderlijke optionele route; volg daarvoor `CLOUDFLARE-DEPLOYMENT.md`. Deze Linux-route weigert remote database-aliases en vereist `DATABASE_URL=file:./data/shop.db`.

Een deployment bereidt nieuwe code in `releases/` voor, controleert de release en wisselt daarna atomair de `current`-symlink. `.env`, database, uploads en back-ups staan buiten alle releases. De procedures hieronder zijn operatorinstructies: documentatie of een lokale technische test betekent niet dat een echte productie-deployment, providerverificatie of herstel op jouw host is uitgevoerd.

## 1. Oracle Cloud-account en VM

1. Maak een account aan op [Oracle Cloud Infrastructure](https://cloud.oracle.com/) en open de OCI Console.
2. Kies **Compute → Instances → Create instance** in je home region.
3. Kies Ubuntu 24.04 LTS (voorkeur) of Ubuntu 22.04 LTS, en de ARM-shape **`VM.Standard.A1.Flex`**. Controleer dat de console de shape als **Always Free eligible** markeert. Binnen de Always Free compute-limiet is het maximum in totaal 2 OCPU en 12 GB geheugen; beschikbaarheid in een regio is niet gegarandeerd. [Oracle Always Free-resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
4. Kies een publieke IPv4-adres, een publieke subnet-route via een Internet Gateway, en een SSH-public key. Bewaar je private key veilig; upload die nooit naar de VM of een repository.
5. Maak in de subnet Security List of de gekoppelde Network Security Group inbound-regels: TCP 22 alleen vanaf je eigen vertrouwde IP (aanbevolen), TCP 80 en 443 vanaf internet. Laat outbound HTTPS/DNS toe.

### SSH-key op Windows

In PowerShell (als je nog geen key hebt):

```powershell
ssh-keygen -t ed25519 -C "shopeasy-oracle"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
ssh -i $env:USERPROFILE\.ssh\id_ed25519 ubuntu@JOUW_PUBLIEKE_IP
```

Plak de `.pub`-inhoud tijdens het aanmaken van de VM in OCI. Bewaar de private key `id_ed25519` lokaal.

## 2. Firewall en benodigde pakketten

Log in via SSH:

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg unzip rsync sqlite3 ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Verwacht een UFW-regel voor OpenSSH/22, 80/tcp en 443/tcp. Open ook poorten 80/443 in OCI's Security List/NSG; UFW alleen is niet genoeg. **Open poort 3000 niet naar het publieke internet**: Caddy proxy't lokaal naar Node.

## 3. Node.js 24 installeren (ARM64)

NodeSource documenteert Ubuntu Jammy 22.04 en Noble 24.04 voor Node 24 op `arm64`. [NodeSource ondersteunde architecturen/Ubuntu-versies](https://github.com/nodesource/distributions/blob/master/DEV_README.md)

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
node -p "process.arch"
```

Verwachting: Node-versie begint met `v24.`, npm toont een versienummer en architectuur is `arm64`.

## 4. Linux-user en blijvende mappen

Maak bij een nieuwe installatie een eigen service-account. Controleer bestaande accounts/mappen eerst; verplaats een bestaande live installatie alleen tijdens een afzonderlijk geplande migratie met een geteste back-up. Zet een bestaande live map nooit blind om in deze structuur.

```bash
sudo adduser --system --group --home /opt/shopeasy --shell /usr/sbin/nologin shopeasy
sudo adduser --system --group --no-create-home --shell /usr/sbin/nologin shopeasy-build
sudo install -d -o root -g root -m 755 /opt/shopeasy
sudo install -d -o root -g shopeasy -m 755 /opt/shopeasy/releases
sudo install -d -o shopeasy -g shopeasy -m 700 /opt/shopeasy/data /opt/shopeasy/backups /opt/shopeasy/public/uploads
```

De structuur na de eerste geslaagde deployment is:

```text
/opt/shopeasy/
  .env                    privé, buiten elke release
  data/shop.db            blijvende database en SQLite-sidecars
  public/uploads/         blijvende bestanden
  backups/                versleutelde back-ups en checksums
  releases/<release-id>/   gecontroleerde code en runtime-dependencies
  current -> releases/<release-id>
```

Elke release heeft symlinks naar de vier blijvende locaties. Alleen code wordt gewisseld. Oude releases blijven staan; verwijder ze pas na de afgesproken herstelperiode en nooit zolang `current` ernaar verwijst. De service-account mag code en de installatie-root niet kunnen wijzigen. `shopeasy-build` is een afzonderlijk niet-root buildaccount, is geen lid van de `shopeasy`-groep en mag `.env`, `data`, `backups` en `public/uploads` niet lezen of doorkruisen. De deployment controleert deze scheiding vóór installatie/tests. Gebruik geen productiecredentials of gedeelde home/cache voor dit buildaccount.

## 5. Bronrelease controleren en verpakken op een afzonderlijke computer

Werk vanuit een verse, complete bronextractie met de bijbehorende `SHA256SUMS.txt`. Gebruik geen live installatie, `.env`, database, uploads, `venv` of `.venv` als invoer. De validator weigert privébestanden en symlinks. De bronmap wordt niet herschreven; installatie en checks gebruiken een tijdelijke kopie zonder applicatiecredentials uit de aanroepende omgeving.

Windows PowerShell 5.1, met Node.js >=24.22.2 <25 op PATH:

```powershell
.\FINALIZE-AND-VERIFY-WINDOWS.ps1 -OutputDirectory C:\ShopEasy-release-output-NEW
```

`RELEASE-VERIFY-WINDOWS.ps1` blijft een compatibele ingang met dezelfde `-OutputDirectory`-parameter en roept deze geïsoleerde workflow aan.

Dezelfde workflow op Linux/macOS:

```bash
npm run release:verify -- --output ../ShopEasy-release-output-NEW
```

Kies een nog niet bestaande outputmap buiten de bronmap. De wrapper verandert geen dependencies of lockfile in de bron. Hij laat de actuele releasepoorten in de tijdelijke kopie uitvoeren, inclusief locked install, codecontroles, templates, de volledige testsuite, dependency-advisories en noticegeneratie. Cloudflare-bronbouw is een buildcontrole, geen deployment. Ontbrekende testvereisten of een fout stoppen de workflow; los die op een ontwikkelmachine op, verander geen productieomgeving om te kunnen verpakken.

Na alle gegenereerde bestanden schrijft de workflow een nieuw SHA-256-manifest. Vervolgens bouwt hij een echte ZIP, pakt die opnieuw uit, controleert de uitgepakte inhoud en levert de ZIP met `.sha256`, `CONTENTS.json` en een privé verificatielog. Alleen de daadwerkelijk uitgevoerde checks tellen als bewijs. Windows PowerShell 5.1 is pas op dat platform getest wanneer de wrapper daar werkelijk is uitgevoerd. Commerciële rechten blijven UNKNOWN totdat de bronrechten en doorverkoopbevoegdheid afzonderlijk zijn vastgesteld.

Upload de technische ZIP naar de bedoelde host. Bewaar daarnaast een gecontroleerde volledige bronextractie, bijvoorbeeld `~/shopeasy-release-tools`, om `deploy.sh` met zijn helpers uit te voeren. Controleer de ZIP-hash tegen een digest uit een onafhankelijk vertrouwd kanaal; een ZIP en checksum uit dezelfde onbevestigde bron bewijzen geen authenticiteit.

```powershell
Get-FileHash .\ShopEasy-VERSION-technical-checks.zip -Algorithm SHA256
scp -i $env:USERPROFILE\.ssh\id_ed25519 .\ShopEasy-VERSION-technical-checks.zip ubuntu@JOUW_PUBLIEKE_IP:/tmp/shopeasy.zip
```

`deploy.sh` accepteert een ZIP en verwachte SHA-256. Er is geen Git-pull of update over een bestaande live codeboom. Pak nooit een update uit bovenop `/opt/shopeasy/current`.

## 6. Privé configuratie voor de eerste start

Maak alleen bij de eerste installatie `/opt/shopeasy/.env` uit `.env.example` in de gecontroleerde bronextractie. Een bestaande `.env` blijft behouden; de deployment maakt of herschrijft hem niet. Bewerk hem lokaal op de host met een editor en maak hem alleen leesbaar voor root en de servicegroep. Gebruik `root:shopeasy` en modus `640` wanneer de handmatige back-uphelpers dotenv moeten lezen; het buildaccount mag geen lid zijn van die groep.

```bash
sudo install -o root -g shopeasy -m 640 .env.example /opt/shopeasy/.env
sudo nano /opt/shopeasy/.env
```

Vereiste waarden voor deze Linux-route:

```dotenv
NODE_ENV=production
PORT=3000
BASE_URL=https://shop.yourdomain.example
TRUST_PROXY=1
DATABASE_URL=file:./data/shop.db
RATE_LIMIT_BACKEND=memory-single-instance
CLOUDFLARE_WORKER=0
MANAGER_NAME="Store Manager"
MANAGER_EMAIL=
MANAGER_PASSWORD=
MFA_ENCRYPTION_KEY=
RESET_CODE_SECRET=
BACKUP_ENCRYPTION_KEY=
OFFSITE_BACKUP_DIR=/opt/shopeasy/backups
```

De lege credentialvelden zijn geen geldige eerste-startwaarden. Vul zelf een uniek Manager-mailadres en sterk wachtwoord in wanneer er nog geen Manager bestaat. Beide bootstrapcredentials kunnen na een geverifieerde login en MFA-inschrijving worden verwijderd; ze resetten geen bestaand account. Bij een lege nieuwe database leveren ontbrekende credentials geen bruikbare Manager op. Bewaar MFA- en back-upsleutels ook in een afzonderlijke beveiligde herstelopslag. Maak `MFA_ENCRYPTION_KEY` als 32 willekeurige bytes in 64 hextekens; maak `RESET_CODE_SECRET` met minstens 24 willekeurige tekens. Bijvoorbeeld, voer elk afzonderlijk uit en plaats de waarde zelf in het juiste privéveld:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Gebruik de base64-uitvoer voor `BACKUP_ENCRYPTION_KEY`. Deel geen uitvoer, `.env`, sessietokens of sleutels in logs/screenshots. `.env` is geen shell-script: gebruik `KEY=value`, zonder `export`, shellsubstitutie of commands. Volg eenvoudige dotenv/systemd-compatibele waarden.

`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` en `SHOP_DATABASE_URL` blijven leeg. `SESSION_SECRET` wordt niet gelezen door de applicatie en voegt geen beveiliging toe. `.env.example` documenteert ook `SECURITY_LOG_HMAC_KEY` (64 hextekens voor stabiele pseudoniemen in loginlogs), alertdrempels, optionele providers, back-uplimieten en displaymetadata. Displaymetadata bewijst geen rechten.

E-mail blijft optioneel. Verifieer eerst het Resend-domein; configureer dan `RESEND_API_KEY`, `EMAIL_FROM` en `RESET_CODE_SECRET`. Houd `ORDER_CONFIRMATION_EMAILS=0` en `ORDER_STATUS_EMAILS=0` totdat private tests slagen. `ORDER_EMAIL_DAILY_LIMIT=10` begrenst verzending; `EMAIL_LOCALE` accepteert `nl`, `en`, `ckb`, `ar` of leeg voor de aanvraag/bestelling. Nieuwsbriefverzending vereist ook `NEWSLETTER_UNSUBSCRIBE_SECRET` met minstens 32 willekeurige tekens. Ontbrekende e-mailconfiguratie blokkeert orderverwerking niet.

`STAGING_*`, `RESTORE_*`, load-testinputs en integratietestflags horen alleen bij de betreffende losse opdracht of stagingomgeving. Houd ze buiten de productie-service. `VERCEL` en `AWS_LAMBDA_FUNCTION_NAME` zijn platformsignalen voor niet-ondersteunde serverless targets; stel ze hier niet in. `APP_DIR`, `BACKUP_DIR` en `CADDY_CONFIG_FILE` zijn shellinputs voor helpers, geen dotenv-instellingen van de storefront.

## 7. Verplichte voorbereiding vóór de pointerwissel

De deployment controleert eerst de verwachte ZIP-digest en pakt de ZIP veilig uit in een nieuwe voorbereidingsmap. De nieuwe release moet zijn manifest, pakketstructuur, locked dependencies en verplichte tests doorstaan voordat privéstate wordt gekoppeld en voordat `current` verandert. Installatie en tests draaien als het afzonderlijke `shopeasy-build`-account met een lege basisomgeving, tijdelijke privé-HOME/cache en zonder toegang tot de blijvende applicatielocaties. De applicatiecredentials zijn uit de omgeving verwijderd. Na de checks volgt een nieuwe locked installatie van alleen productiedependencies. Er is geen test-skipoptie. Een onvolledige of mislukte voorbereiding laat de huidige codepointer ongemoeid.

De test- en packageomgeving moet de vereisten uit `scripts/check-test-dependencies.mjs` al ondersteunen. Deze workflow installeert of verandert geen Python-venv in productie. Een geslaagde ZIP-check vervangt geen host- of providerverificatie.

## 8. systemd-service registreren

Installeer vanuit de gecontroleerde bronextractie het servicebestand voordat je de eerste release activeert:

```bash
sudo install -m 644 shopeasy.service /etc/systemd/system/shopeasy.service
sudo systemctl daemon-reload
sudo systemctl enable shopeasy
```

Start de service pas via de deployment wanneer `current` bestaat. Het meegeleverde bestand gebruikt `WorkingDirectory=/opt/shopeasy/current`, `User=shopeasy`, `EnvironmentFile=/opt/shopeasy/.env`, `ExecStart=/usr/bin/node scripts/start-production.mjs`, `Restart=always` en `UMask=0077`. De unit beperkt schrijftoegang met `ProtectSystem=strict` en expliciete `ReadWritePaths` voor de blijvende gegevens, uploads en back-ups. Ook `ProtectHome`, `PrivateTmp`, `NoNewPrivileges` en `RestrictSUIDSGID` beperken het serviceproces. De Node-wrapper zet production-modus platformonafhankelijk. Ook `npm run start:prod` gebruikt die wrapper; een POSIX `NODE_ENV=...`-prefix is hiervoor niet nodig.

Het servicebestand is afgestemd op `/opt/shopeasy`. Gebruik `APP_DIR` niet voor een echte alternatieve installatie zonder systemd, rechten, back-upcommando's en operationele controles samen aan te passen.

## 9. Caddy installeren en HTTPS vóór productie configureren

**Gebruik geen HTTP-only IP-installatie voor echte klantaccounts, bestellingen of betalingen.** Productie vereist een publieke DNS-hostnaam met HTTPS. De deployment weigert een `BASE_URL` met `http://`, een IP-adres of localhost, en controleert de actieve Caddy-configuratie in `/etc/caddy/Caddyfile`.

1. Registreer/kies een domein en maak een `A`-record dat naar het publieke IPv4-adres van de VM wijst. Voeg een `AAAA`-record alleen toe als de VM daadwerkelijk bereikbaar IPv6 heeft; een fout AAAA-record kan bereikbaarheid breken.
2. Open inbound TCP 80 en 443 in zowel OCI Security List/NSG als UFW. Controleer dat er geen andere service die poorten gebruikt.
3. Volg de officiële Caddy Ubuntu/Debian-installatie-instructies; het officiële pakket registreert een systemd-service. [Caddy installatiedocumentatie](https://caddyserver.com/docs/install)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
sudo install -m 644 Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Vervang `shop.example.com` door exact dezelfde hostname als in `BASE_URL` en gebruik dit actieve blok:

```caddyfile
yourdomain.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Controleer daarna:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
sudo systemctl --no-pager --full status caddy
```

Caddy verkrijgt en vernieuwt TLS-certificaten automatisch wanneer de publieke DNS-records en poorten 80/443 correct werken. `deploy.sh` weigert de update als het actieve siteblok niet exact overeenkomt met de hostname uit `BASE_URL`, als het geen loopback-proxy naar `127.0.0.1:3000` is, of als `caddy validate` faalt.

De meegeleverde validator ondersteunt bewust dit eenvoudige enkele HTTPS-siteblok, met optioneel `encode zstd gzip`. Globale blokken, imports, extra HTTP-sites of andere geavanceerde Caddy-instellingen vereisen een afzonderlijk beoordeelde wijziging van de validator; voeg geen configuratie toe die de controle stilzwijgend omzeilt.

## 10. De eerste release of een update activeren

Zorg eerst dat DNS klopt, Caddy actief is met het exacte `BASE_URL`-siteblok en `/opt/shopeasy/.env` privé is geconfigureerd. Bij de eerste installatie kan Caddy tot de codewissel een 502 geven doordat de backend nog niet draait. Voer de deployment uit vanuit de volledige gecontroleerde bronextractie. Vervang de digest door de onafhankelijk gecontroleerde 64 hextekens:

```bash
cd ~/shopeasy-release-tools
sudo bash ./deploy.sh /tmp/shopeasy.zip EXPECTED_SHA256
```

Het script neemt een exclusieve deploymentlock. Na geslaagde voorbereiding en configuratievalidatie wordt de release naar een nieuwe definitieve releasemap verplaatst en wordt `current` via een atomaire rename vervangen. Daarna herstart systemd de service. De deployment vereist HTTP 200 voor lokale `/health`, lokale `/ready` en publieke HTTPS `/health`. Bekijk ook:

```bash
sudo systemctl --no-pager --full status shopeasy
sudo journalctl -u shopeasy -n 80 --no-pager
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/ready
curl -i https://yourdomain.com/health
sudo readlink -f /opt/shopeasy/current
```

Een atomaire codepointer maakt codeplaatsing consistent; de herstart is geen belofte van nul downtime. Bij een fout vóór de wissel blijft de oude pointer staan. Bij een fout na de wissel stopt het script de service, selecteert het de vorige code opnieuw en probeert het die te starten en op readiness te controleren. Zonder vorige release blijft de service gestopt en wordt de nieuwe pointer verwijderd. Als rollback of readiness faalt, herstel de host handmatig en controleer de logs; neem geen beschikbaarheid aan op basis van een rollbackpoging.

## 11. Expliciete code-rollback

Kies een eerder gecontroleerde release, controleer eerst of die compatibel is met de huidige database/schema en neem een recente versleutelde back-up. Plan onderhoud. Gebruik de volgende opdrachten vanuit de gecontroleerde toolbron, met de echte vorige releasemap en publieke hostnaam. Dezelfde lock als de deployment voorkomt een gelijktijdige codewissel; een fout stopt de service voor operatorherstel:

```bash
sudo flock --exclusive --nonblock /opt/shopeasy/.deploy.lock /bin/bash -e -s -- "$PWD/scripts/release-layout.mjs" <<'ROLLBACK'
trap 'systemctl stop shopeasy' ERR
systemctl stop shopeasy
node "$1" /opt/shopeasy /opt/shopeasy/releases/PREVIOUS_RELEASE_ID
systemctl start shopeasy
curl --fail -i http://127.0.0.1:3000/health
curl --fail -i http://127.0.0.1:3000/ready
curl --fail -i https://yourdomain.com/health
journalctl -u shopeasy -n 80 --no-pager
ROLLBACK
```

**Code-rollback herstelt geen database, uploads of `.env`.** Een nieuwe applicatiestart kan migraties uitvoeren of gegevens schrijven vóór een healthcheck faalt. Daarom kan oude code onverenigbaar zijn met het nieuwe schema. Stop bij twijfel de service en volg `DATABASE-BACKUP-RESTORE.md` voor herstel naar een afzonderlijk leeg doel, verificatie en een afzonderlijk beoordeelde data-cutover. De deployment voert nooit automatisch een databaserestore of datadirectory-vervanging uit.

## 12. Functionele en providercontrole

Controleer na de technische healthchecks in een aparte stagingomgeving login/MFA, producten/varianten, catalogus, winkelwagen, checkout, voorraad, ordergeschiedenis en beelden. Controleer HTTPS-certificaat en browserconsole. Gebruik voor Mollie eerst een eigen staginghost, eigen database en `test_`-sleutel. Zet `MOLLIE_TEST_CHECKOUT_ENABLED=true` alleen op die niet-productiehost. Voor echte transacties zijn merchant-onboarding, providerverificatie en `MOLLIE_LIVE_CHECKOUT_APPROVED=true` nodig. Deze vlag is geen bewijs van providergoedkeuring.

## 13. Back-ups en cron buiten de releases

Gebruik `DATABASE-BACKUP-RESTORE.md` als herstelrunbook. De gestreamde logische back-up wordt met gzip gecomprimeerd en met AES-256-GCM versleuteld (`.jsonl.gz.enc`), met een SHA-256-sidecar. Alle back-ups gaan naar `/opt/shopeasy/backups`; de sleutel staat privé en wordt afzonderlijk veilig bewaard. Met de nieuwe layout moet de helper de `current`-bron gebruiken:

```bash
sudo -u shopeasy env APP_DIR=/opt/shopeasy/current BACKUP_DIR=/opt/shopeasy/backups bash /opt/shopeasy/current/backup.sh
```

`backup.sh` verwijdert na een geslaagde back-up lokale bijbehorende bestanden ouder dan 30 dagen. Kies die helper pas als deze retentie geschikt is en een off-host herstelkopie bestaat. Het kale `npm run backup:database` heeft een locatie-afhankelijke standaardmap; geef bij releasegebruik altijd `--output` op of gebruik de bovenstaande wrapper. De offsite-helper vereist hier `OFFSITE_BACKUP_DIR=/opt/shopeasy/backups`; zonder die instelling kan zijn standaardpad naast de releasemap vallen.

Een mogelijke dagelijkse taak in `sudo crontab -u shopeasy -e`:

```cron
0 2 * * * /usr/bin/env APP_DIR=/opt/shopeasy/current BACKUP_DIR=/opt/shopeasy/backups /bin/bash /opt/shopeasy/current/backup.sh >> /opt/shopeasy/backups/backup.log 2>&1
```

Controleer de eerste werkelijke taak en logrechten. Een lokale back-up op dezelfde VM is geen off-host bescherming. Download de `.jsonl.gz.enc` en `.sha256`, verifieer de hash, bewaar meer dan één goede kopie en oefen herstel naar een aparte lege database en uploadsmap. Neem vóór upgrades een geteste herstelkopie; deployment maakt die niet automatisch.

## 14. Problemen controleren

### SQLite-permissies of `data/` ontbreekt

```bash
ls -ld /opt/shopeasy/data
sudo ls -l /opt/shopeasy/data/shop.db
sudo -u shopeasy test -w /opt/shopeasy/data && echo WRITE_OK
```

Verwachting: map/database zijn van `shopeasy` en `WRITE_OK` verschijnt. Herstel zo nodig:

```bash
sudo install -d -o shopeasy -g shopeasy -m 700 /opt/shopeasy/data
sudo chown -R shopeasy:shopeasy /opt/shopeasy/data
```

### Verkeerde Node-versie

```bash
node -v; npm -v; node -p "process.arch"; which node
```

Verwachting: `v24.22.2` of hoger binnen de 24.x-lijn, een npm-versie en `arm64`. `/usr/bin/node` moet bestaan omdat systemd dat pad gebruikt.

### Poortconflict op 80/443/3000

```bash
sudo ss -ltnp | grep -E ':(80|443|3000)\b' || true
```

Verwachting: Caddy bezit 80/443; Node bezit 3000. Stop of herconfigureer een concurrerende service als een poort dubbel bezet is.

### systemd start niet

```bash
sudo systemctl status shopeasy --no-pager --full
sudo journalctl -u shopeasy -n 100 --no-pager
sudo systemctl cat shopeasy
```

Verwachting: `Active: active (running)` en geen `MODULE_NOT_FOUND`, `EACCES` of `DATABASE_URL`-fout.

### `.env` wordt niet gelezen

```bash
sudo systemctl show shopeasy -p EnvironmentFiles -p WorkingDirectory -p ExecStart
sudo test -r /opt/shopeasy/.env && echo ENV_FILE_READABLE
sudo grep -E '^(NODE_ENV|PORT|DATABASE_URL|RATE_LIMIT_BACKEND)=' /opt/shopeasy/.env
```

Verwachting: `EnvironmentFiles=/opt/shopeasy/.env`, working directory `/opt/shopeasy/current`, `ENV_FILE_READABLE`, en de gevulde variabelen. `EnvironmentFile` is geen shell-script: gebruik `KEY=value`, geen `export KEY=value`.

### Health check faalt

```bash
curl -i http://localhost:3000/health
sudo journalctl -u shopeasy -n 100 --no-pager
```

Verwacht: HTTP 200 en `{"ok":true}`. Als dit faalt, herstel eerst de Node/systemd- of databasefout; pas daarna Caddy aan.

### Oracle meldt `Out of host capacity`

Oracle beschrijft dit als tijdelijke schaarste aan Always Free-shapes in de geselecteerde regio. Controleer dat `VM.Standard.A1.Flex` Always Free eligible is, probeer een andere Availability Domain in dezelfde home region als die beschikbaar is, probeer later opnieuw en controleer je quota. Er is geen deployment-script dat capaciteit kan garanderen. [Oracle Always Free-resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

## 15. Lokale testchecklist vóór productie

Voer op je ontwikkel-pc uit vanuit de map met `package.json`:

```powershell
npm ci
npm test
node src/bootstrap.js
```

Voer de actuele testsuite uit met de Node.js-versie die in `package.json` staat. Historische aantallen uit eerdere releases (zoals de oude P0-1-suite) zijn geen release-gate en mogen niet als bewijs voor deze ZIP worden gebruikt. Als je `.env` van het deployment-voorbeeld hebt gekopieerd, zet voor de lokale HTTP-smoketest in dezelfde PowerShell-sessie tijdelijk de omgevingsvariabelen naar development (de Oracle-VM blijft `production` gebruiken):

```powershell
$env:NODE_ENV = "development"
$env:TRUST_PROXY = "0"
node src/bootstrap.js
```

Laat die server in deze terminal draaien; voer in een tweede terminal uit:

```powershell
Invoke-WebRequest http://localhost:3000/health -UseBasicParsing
```

Verwacht `StatusCode : 200` en body `{"ok":true}`. Stop de server met `Ctrl+C`.

### Handmatige account-/reset-smoketest

1. Open `http://localhost:3000/register`; maak met een mailbox die je beheert een nieuwe klant aan, kies een wachtwoord van 15–200 tekens, bevestig dat wachtwoord en accepteer de voorwaarden. Verwacht doorsturing naar `/account` en dat de accountpagina opent.
2. Log uit, open `/login`, log opnieuw in met hetzelfde mailadres/wachtwoord. Verwacht doorsturing naar `/account`.
3. Open `/forgot-password`, vraag een resetcode aan en controleer de mailbox. Dit vereist een werkende `RESEND_API_KEY`, `EMAIL_FROM` en `RESET_CODE_SECRET`; de code vervalt na 10 minuten.
4. Vul dezelfde e-mail, de ontvangen zescijferige code, een nieuw sterk wachtwoord en de bevestiging in. Verwacht een redirect naar `/login?reset=1`.
5. Log in met het nieuwe wachtwoord: dit moet lukken. Probeer daarna het oude wachtwoord: dat moet worden geweigerd. Vraag geen herhaalde codes aan als mailinstellingen nog niet bevestigd zijn.

**Deployment-status:** deze ZIP is een deployment-kandidaat totdat op Node.js 24 jouw lokale `npm ci`, de volledige actuele `npm test`-suite zonder fouten én bovenstaande smoke test slagen. Gebruik geen historische testteller als bewijs. Een groen lokaal testresultaat alleen bewijst nog niet dat de Oracle-VM, DNS, e-mail en Caddy-configuratie live werken.


## 16. Noodprocedure: Manager-MFA lokaal resetten via SSH

Dit is een **lokale CLI**, geen web-endpoint. Gebruik dit alleen wanneer je via SSH op de VM bent ingelogd en de Manager geen MFA meer kan gebruiken:

```bash
sudo -u shopeasy -- env --chdir=/opt/shopeasy/current node scripts/reset-manager-mfa.mjs
```

Het script controleert dat de ingestelde database een bestaande lokale SQLite-bestand is en dat een interactieve terminal beschikbaar is. Voer het Manager-e-mailadres in en typ daarna exact `RESET MFA`. Zonder die bevestiging verandert er niets. De CLI wist voor die Manager `mfa_secret`, zet `mfa_enabled` op `0`, wist recovery-code-hashes en de laatste TOTP-step, trekt Manager-sessies en openstaande MFA-challenges in en schrijft de actie met uitvoerder en tijd in `audit_logs`. Verwachte succesvolle melding:

```text
MFA gereset voor manager@example.com. Manager moet opnieuw MFA setupen bij volgende login.
```

Gebruik geen remote database-URL voor deze noodprocedure. Bij succes logt de Manager opnieuw in en doorloopt opnieuw de MFA-setup. Bewaar de SSH-sessie tot de nieuwe setup en login geverifieerd zijn.

## 17. Off-host download en maandelijkse hersteloefening

Vanuit `/opt/shopeasy/current` kan de offsite-helper een versleutelde back-up in de blijvende map voorbereiden:

```bash
sudo -u shopeasy -- env --chdir=/opt/shopeasy/current OFFSITE_BACKUP_DIR=/opt/shopeasy/backups OFFSITE_SSH_HOST=ubuntu@YOUR_VM_HOST node scripts/backup-offsite.mjs
```

Deze helper uploadt niets: hij maakt lokaal de versleutelde back-up en SHA-256-sidecar en print SCP-commando's. De private SSH-sleutel blijft op de downloadcomputer. Download beide bestanden naar beveiligde opslag buiten de VM, vergelijk op Windows `Get-FileHash -Algorithm SHA256` met de sidecar en bewaar de oorspronkelijke `BACKUP_ENCRYPTION_KEY` in een afzonderlijke herstelopslag. Controleer bij een aangepaste backupmap zelf het SCP-pad.

Voer ten minste volgens je afgesproken herstelcadans en na grote updates een restore-drill uit op een afzonderlijke testmachine zonder productiecredentials. Gebruik de originele sleutel en een nieuwe lege testdatabase én uploadsmap. Volg de checksum-, restore- en functionele controles in `DATABASE-BACKUP-RESTORE.md`. Noteer feitelijke aantallen, tijd, versie en resultaat. Een niet-uitgevoerde restore-drill is NOT TESTED; een gegenereerd back-upbestand bewijst geen herstelbaarheid.

## Optional hosted card checkout (Mollie)

COD is the default and stays available even when card configuration is incomplete. Only the Mollie hosted card adapter is implemented; PayTabs, FIB, iyzico, ZainCash and Stripe in Manager settings are onboarding/contact references, not enabled transaction integrations.

For real transactions, first complete provider onboarding using the true legal merchant country and payout account, then configure `BASE_URL` as the public HTTPS origin, set `NODE_ENV=production`, and store the Mollie `live_` API key as a server secret named `MOLLIE_API_KEY`. Never put API keys into the browser or Manager form. The app re-fetches payment status through the provider API and checks order ID, reference, amount and currency before marking an order paid. Configure the public `/payments/mollie/webhook` endpoint to be reachable from Mollie.

For a dedicated non-production staging site, set `MOLLIE_API_KEY` to a test key and explicitly set `MOLLIE_TEST_CHECKOUT_ENABLED=true`. A test key is not allowed to show card checkout in production, and test-mode payments are not real charges. Reset the flag to `false` outside staging.

Mollie publishes the merchant-country list at https://help.mollie.com/hc/en-us/articles/115002116105-Can-I-use-Mollie-s-services-in-my-country and the payment API at https://docs.mollie.com/reference/create-payment. The Manager payment directory links official provider onboarding and support pages. Eligibility, KYC, card-method activation, settlement, chargebacks and local legal compliance must be confirmed with the provider; country selection in ShopEasy is only a safety gate, not provider approval.
