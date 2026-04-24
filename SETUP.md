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
   - `User.Read` (alleen login-info; echte CRUD loopt via de Function backend, zie §3)
5. Klik **Grant admin consent**.
6. Noteer **Application (client) ID** → deze vul je in als `NEXT_PUBLIC_CLIENT_ID`.
7. **Expose an API** (zodat de SPA een token voor de Function kan vragen):
   - Pas dit toe op de **Function App Registration** uit §3 — niet deze SPA-registratie.
   - De SPA vraagt een token met scope `api://{function-app-id}/access_as_user`.

> De tenant-ID staat al hardcoded als default in `src/lib/config.ts` maar kun je overschrijven via env of `public/config.js`.

---

## 2. Distributielijst

De DL is een **classic Exchange distribution group**. Graph kan daar geen members aan toevoegen — daarom gaat
DL-membership via de **Azure Functions backend** (`backend/`, zie §3).

Zet het e-mailadres van de DL als `NEXT_PUBLIC_DL_EMAIL` + als `DL_EMAIL` in de Function App settings.

---

## 3. Azure Function backend

De SPA praat niet meer rechtstreeks met Graph. Alle contact-CRUD loopt via `backend/` (Azure Functions v4, Node 20).

Stappen (volledige instructie: `backend/README.md`):

1. **Azure subscription** in jouw eigen tenant (of bestaande).
2. **Resource group** + **Function App** (Consumption, Linux, Node 20) + **Storage account**. Zie `backend/README.md` §1 voor `az` commando's.
3. **App Registration in de doel-tenant** `bf2f39aa-...`:
   - Naam: `Contactbeheer Function`
   - **Expose an API** → scope `access_as_user` → noteer `api://{app-id}/access_as_user`
   - **API permissions** → Office 365 Exchange Online → Application → `Exchange.ManageAsApp` → **Grant admin consent**
   - **Certificates & secrets** → New client secret → noteer de value
   - **Entra ID → Roles and admins → Exchange Administrator → Add assignments → Service Principal** → selecteer deze app
4. **Function App Settings** zetten (zie `backend/README.md` §3):
   - `TARGET_TENANT_ID`, `APP_CLIENT_ID`, `APP_CLIENT_SECRET`, `API_AUDIENCE`, `DL_EMAIL`, `EXCHANGE_ORG`, `ALLOWED_ORIGINS`
5. **CORS** in Azure Functions: allow `https://contact.nietvooriedereen.nl` + `http://localhost:3000`.
6. **Deploy**: `cd backend && npm install && npm run build && func azure functionapp publish <app-name>`
7. **SPA koppelen aan backend**:
   - Zet `NEXT_PUBLIC_API_URL` = `https://<function-app>.azurewebsites.net` (of custom domain)
   - Zet `NEXT_PUBLIC_API_SCOPE` = `api://{function-app-id}/access_as_user`
   - Deze scope hoort bij de **Function** App Registration (§3.3), niet bij de SPA-registration.
   - Als de Function App in de SPA `/Expose an API` nog niet staat, voeg 'm toe als **Authorized client application** van de Function, of laat Entra admin consent afhandelen.

> **Belangrijk:** De SPA haalt nu een user-token op **voor de Function**, niet meer voor Graph. Global Admin check gebeurt
> dubbel: client-side als UX-guard, en server-side in elke request (de Function weigert non-admins hard).

---

## 4. Configuratie (SPA)

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

## 5. GitHub Pages + custom domain

1. Maak een GitHub repo (bv. `contact-pwa`) en push de code naar `main`.
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. De workflow bouwt `out/` en deployt naar Pages.
4. Custom domain: `public/CNAME` bevat `contact.nietvooriedereen.nl`. Zet in je DNS:
   - `contact.nietvooriedereen.nl` **CNAME** → `<user>.github.io.`
5. Wacht op DNS + Pages-SSL (Let's Encrypt, doorgaans enkele minuten).
6. Repo → **Settings → Pages → Custom domain** → vul `contact.nietvooriedereen.nl`, vink **Enforce HTTPS** aan.

---

## 6. Toegangsregels

Deze app staat alleen toegang toe aan:

- Accounts uit tenant `bf2f39aa-496c-406a-940c-41e73a851d39` (check via `tid` claim in id_token)
- Accounts die lid zijn van de **Global Administrator** directory role (role template id `62e90394-69f5-4237-9190-012177145e10`)

Check gebeurt client-side na login:
1. Primair via `wids`-claim in het id_token.
2. Fallback via Graph: `GET /me/memberOf/microsoft.graph.directoryRole`.

> Client-side check = UX-filter. Echte veiligheid zit in de Graph-permissies: gebruikers zonder rechten krijgen gewoon 403 van Graph. Schedule geen gevoelige data in de UI die niet afhankelijk is van Graph-calls.

---

## 7. Bekende beperkingen v1

- **Classic Exchange DL + MailContacts**: gaat via de Function backend (`backend/`), niet via Graph.
- **Offline**: service worker cached alleen de app-shell. API-calls vereisen netwerk.
- **Global-admin check**: dubbel — client-side UX + backend-side hard check op `wids`-claim.
- **`APP_CLIENT_SECRET`** roteert; voor productie liever certificaat (zie `backend/README.md` § Certificaat-variant).

---

## 8. Wat moet Helmer nog doen

- [ ] **SPA App Registration** aanmaken in doel-tenant + admin consent (§1)
- [ ] **Function App Registration** aanmaken in doel-tenant, `Expose an API`, Exchange.ManageAsApp + consent, client secret (§3)
- [ ] **Exchange Administrator**-rol toewijzen aan de Function service principal (§3)
- [ ] **Azure subscription** + Function App deployen in eigen tenant (§3)
- [ ] **Function App Settings** invullen (secret, audience, DL, org)
- [ ] **CORS** in Function App op `https://contact.nietvooriedereen.nl` + localhost
- [ ] **SPA env vars** zetten: `NEXT_PUBLIC_CLIENT_ID`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_SCOPE`, `NEXT_PUBLIC_DL_EMAIL`
- [ ] DNS CNAME voor `contact.nietvooriedereen.nl` + GitHub Pages custom domain (§5)
- [ ] Handmatig eerste contact maken en controleren dat DL-membership werkt
- [ ] (Later) certificate auth ipv client secret
