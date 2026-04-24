# SETUP.md — Contact PWA

Stap-voor-stap om deze app live te krijgen onder `https://contact.nietvooriedereen.nl`.

---

## 1. Entra ID — App Registration

1. Log in als Global Admin op <https://entra.microsoft.com> in tenant `bf2f39aa-496c-406a-940c-41e73a851d39`.
2. **Applications → App registrations → New registration**
   - Name: `Contactbeheer PWA`
   - Supported account types: **Single tenant**
   - Redirect URI: type **Single-page application (SPA)** → `https://contact.nietvooriedereen.nl/`
3. Open de registration. Voeg onder **Authentication → Single-page application** ook deze SPA-redirects toe (voor dev/preview):
   - `http://localhost:3000/`
   - (optioneel je GitHub Pages preview-URL, bv. `https://<user>.github.io/contact-pwa/`)
4. **API permissions → Add a permission → Microsoft Graph → Delegated**:
   - `User.Read`
   - `Contacts.ReadWrite`
   - `Group.ReadWrite.All`
   - `Directory.Read.All` (nodig voor Global Admin-rolcheck via `/me/memberOf`; optioneel als je alleen op `wids`-claim leunt)
5. Klik **Grant admin consent**.
6. Noteer **Application (client) ID** → deze vul je in als `NEXT_PUBLIC_CLIENT_ID`.

> De tenant-ID staat al hardcoded als default in `src/lib/config.ts` maar kun je overschrijven via env of `public/config.js`.

---

## 2. Distributielijst

De app voegt nieuwe contacten automatisch toe aan de DL via Graph (`POST /groups/{id}/members/$ref`).

- **Werkt direct** voor: Microsoft 365 groups en mail-enabled security groups.
- **Werkt NIET** voor: klassieke Exchange distribution groups — daarvoor is Exchange Online PowerShell nodig. Zet de DL dan bij voorkeur om naar een M365-group of mail-enabled security group.

Zet het e-mailadres van de DL in de config (`leden@<domein>`). De app zoekt de groep via `GET /groups?$filter=mail eq '…'`.

---

## 3. Configuratie

### Dev

```bash
cp .env.local.example .env.local
# Pas NEXT_PUBLIC_CLIENT_ID en NEXT_PUBLIC_DL_EMAIL aan
npm install
npm run dev
```

### Productie (GitHub Pages)

Twee opties voor configuratie:

**A. Build-time via repo variables (aanbevolen)**

Zet in je GitHub repo → **Settings → Secrets and variables → Actions → Variables**:
- `NEXT_PUBLIC_CLIENT_ID` = jouw client-id
- `NEXT_PUBLIC_TENANT_ID` = `bf2f39aa-496c-406a-940c-41e73a851d39`
- `NEXT_PUBLIC_DL_EMAIL` = `leden@<domein>`

De workflow `.github/workflows/deploy.yml` leest deze automatisch.

**B. Runtime via `public/config.js`**

Vul `public/config.js` met echte waarden (client-id, DL-email). Dit overschrijft env op draaiende pagina — handig als je zonder rebuild de DL wilt wisselen.

---

## 4. GitHub Pages + custom domain

1. Maak een GitHub repo (bv. `contact-pwa`) en push de code naar `main`.
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. De workflow bouwt `out/` en deployt naar Pages.
4. Custom domain: `public/CNAME` bevat `contact.nietvooriedereen.nl`. Zet in je DNS:
   - `contact.nietvooriedereen.nl` **CNAME** → `<user>.github.io.`
5. Wacht op DNS + Pages-SSL (Let's Encrypt, doorgaans enkele minuten).
6. Repo → **Settings → Pages → Custom domain** → vul `contact.nietvooriedereen.nl`, vink **Enforce HTTPS** aan.

---

## 5. Toegangsregels

Deze app staat alleen toegang toe aan:

- Accounts uit tenant `bf2f39aa-496c-406a-940c-41e73a851d39` (check via `tid` claim in id_token)
- Accounts die lid zijn van de **Global Administrator** directory role (role template id `62e90394-69f5-4237-9190-012177145e10`)

Check gebeurt client-side na login:
1. Primair via `wids`-claim in het id_token.
2. Fallback via Graph: `GET /me/memberOf/microsoft.graph.directoryRole`.

> Client-side check = UX-filter. Echte veiligheid zit in de Graph-permissies: gebruikers zonder rechten krijgen gewoon 403 van Graph. Schedule geen gevoelige data in de UI die niet afhankelijk is van Graph-calls.

---

## 6. Bekende beperkingen v1

- **Organization contacts write-paden lopen via Graph `beta` endpoint** (`/beta/contacts` POST/PATCH/DELETE). Stable (`v1.0`) is read-only voor org-contacten. Gedrag van beta kan veranderen; test dit eerst handmatig voor je massaal wijzigt.
- **Klassieke distribution groups**: Graph kan daar geen members aan toevoegen. Zet de DL om naar een mail-enabled security group of M365-group.
- **Offline**: service worker cached alleen de app-shell. Graph-calls vereisen netwerk.
- **Single user check client-side**: tenant + role check wordt ook door Graph zelf afgedwongen; client-side guard is UX.

---

## 7. Wat moet Helmer nog doen

- [ ] App Registration aanmaken + admin consent
- [ ] Client-id invullen (via GitHub variables of `public/config.js`)
- [ ] DL-email invullen
- [ ] DNS CNAME zetten voor `contact.nietvooriedereen.nl`
- [ ] GitHub repo maken en pushen
- [ ] Pages aanzetten → source: GitHub Actions
- [ ] Custom domain invullen in Pages-settings, HTTPS afdwingen
- [ ] Handmatig `/beta/contacts` POST testen met je admin-account om te verifiëren dat de tenant write toestaat
