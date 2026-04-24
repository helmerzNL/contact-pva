# Contact-PWA Backend (Azure Functions)

Azure Functions v4 / Node.js 20 / TypeScript. Beheert **classic Exchange MailContacts**
en voegt ze toe aan de distributielijst `leden@...` via Exchange Online REST (`InvokeCommand`).

## Waarom een backend?

De DL bij de wijkvereniging is een **classic Exchange distribution group**, geen M365-group.
Microsoft Graph kan daar:

- **geen** members van classic DL's muteren, en
- **geen** MailContacts CRUD'en (Graph `/contacts` = OrgContacts, dat is iets anders).

Dus: we praten rechtstreeks met Exchange Online via het `adminapi/beta/{org}/InvokeCommand`
REST-endpoint met **app-only** auth (`Exchange.ManageAsApp` + Exchange Administrator rol).

Classic DL mutaties en MailContact CRUD vereisen een Exchange-admin context. De SPA kan dat niet
delegated doen (dat zou PowerShell-v3 flows in de browser vereisen) — vandaar deze thin wrapper.

## Architectuur

```
Browser (SPA, MSAL)
   │  Bearer <user-token, aud=api://{fn}/access_as_user>
   ▼
Azure Function (jouw subscription)
   │  – verifieert JWT (issuer/audience/tid/wids)
   │  – app-only client credentials → https://outlook.office365.com/.default
   ▼
Exchange Online adminapi/beta/{org}/InvokeCommand
   (Get-/New-/Set-/Remove-MailContact, Add-DistributionGroupMember)
```

De Function App draait in **jouw Azure-subscription** (tenant X). De App Registration
waar we tokens tegen valideren zit in de **doel-tenant** (wijkvereniging,
`bf2f39aa-496c-406a-940c-41e73a851d39`). Dat is prima — cross-tenant is de bedoeling.

## Endpoints

| Method | Path                   | Doet                                             |
|--------|------------------------|--------------------------------------------------|
| GET    | `/api/health`          | Alive-check, geen auth                           |
| GET    | `/api/contacts`        | Lijst MailContacts                               |
| POST   | `/api/contacts`        | `{displayName, email}` → create + add-to-DL      |
| PATCH  | `/api/contacts/:id`    | Update displayName en/of email                   |
| DELETE | `/api/contacts/:id`    | Remove-MailContact (auto-removed uit DL)         |

Alle endpoints (behalve `/api/health`) vereisen:
- `Authorization: Bearer <token>` — audience = `API_AUDIENCE`, tid = `TARGET_TENANT_ID`,
  `wids` bevat de Global Administrator role template id.

## Env vars (App Settings)

| Naam | Voorbeeld | Omschrijving |
|------|-----------|---|
| `TARGET_TENANT_ID` | `bf2f39aa-496c-406a-940c-41e73a851d39` | Tenant waar contacten/DL staan |
| `APP_CLIENT_ID` | `<guid>` | Client ID van App Registration in doel-tenant |
| `APP_CLIENT_SECRET` | `<secret>` | Client secret (of zie "Certificaat-variant") |
| `API_AUDIENCE` | `api://<app-id>` | Verwachte `aud`-claim in user-token |
| `DL_EMAIL` | `leden@wijkvereniging.nl` | Distributielijst-adres |
| `EXCHANGE_ORG` | `wijkvereniging.onmicrosoft.com` | Organization initial domain, voor InvokeCommand URL |
| `ALLOWED_ORIGINS` | `https://contact.nietvooriedereen.nl,http://localhost:3000` | CORS allowlist (CSV) |

## Lokaal draaien

```bash
cp local.settings.json.example local.settings.json
# vul de waardes
npm install
npm run build
npm start          # draait `func start` op :7071
```

Je hebt [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
nodig: `npm i -g azure-functions-core-tools@4`.

## Deploy (Helmer's eigen subscription)

### 0. Prereqs
- Azure subscription (trial / pay-as-you-go in eigen tenant)
- `az` CLI + `func` CLI geïnstalleerd en ingelogd
- Resource group, bv. `rg-contact-pwa`

### 1. Function App aanmaken

```bash
SUB="<subscription-id>"
RG="rg-contact-pwa"
LOC="westeurope"
STG="stcontactpwa$(openssl rand -hex 3)"
APP="func-contact-pwa"

az account set -s "$SUB"
az group create -n "$RG" -l "$LOC"

# Storage account (vereist voor Functions)
az storage account create \
  -g "$RG" -n "$STG" -l "$LOC" --sku Standard_LRS --kind StorageV2

# Consumption plan, Linux, Node 20
az functionapp create \
  -g "$RG" -n "$APP" -s "$STG" \
  --consumption-plan-location "$LOC" \
  --runtime node --runtime-version 20 --functions-version 4 --os-type Linux
```

### 2. App Registration in doel-tenant (wijkvereniging)

Log in als Global Admin op **tenant `bf2f39aa-...`** en:

1. **Entra ID → App registrations → New registration**
   - Name: `Contactbeheer Function`
   - Supported account types: **Single tenant**
   - Redirect URI: — _(niet nodig; app-only + API)_
2. **Expose an API**:
   - Application ID URI: `api://<application-id>` (accept default)
   - **Add scope**: name `access_as_user`, admin+user consent, display "Access API as signed-in user".
   - Noteer de volledige scope string: `api://<application-id>/access_as_user`
3. **API permissions → Add**:
   - **Microsoft Graph** — _optioneel_, niet strikt nodig voor deze backend.
   - **Office 365 Exchange Online** → **Application permissions** → `Exchange.ManageAsApp` ✅
   - Klik **Grant admin consent**.
4. **Certificates & secrets** → **New client secret** → noteer de waarde (verloopt!).
5. **Exchange Administrator-rol toewijzen aan de service principal**:
   ```bash
   # draai in de doel-tenant (bf2f39aa-...) als Privileged Role Admin / Global Admin:
   # via portal: Entra ID → Roles → Exchange Administrator → Add assignments
   #   → type: Service Principal → selecteer "Contactbeheer Function"
   # of via PowerShell (Exchange Online Management v3):
   Connect-ExchangeOnline -UserPrincipalName you@wijkvereniging.onmicrosoft.com
   # Service principal moet eerst een enterprise-app entry hebben:
   # portal → Enterprise applications → zoek op app id → Properties → bevestig
   ```
   Gebruik bij voorkeur de portal-stap onder **Microsoft Entra ID → Roles and admins → Exchange Administrator → Add assignments → Type: Service Principal**.

### 3. App Settings in de Function App

```bash
az functionapp config appsettings set -g "$RG" -n "$APP" --settings \
  TARGET_TENANT_ID="bf2f39aa-496c-406a-940c-41e73a851d39" \
  APP_CLIENT_ID="<app-id-uit-stap-2>" \
  APP_CLIENT_SECRET="<secret-uit-stap-2.4>" \
  API_AUDIENCE="api://<app-id-uit-stap-2>" \
  DL_EMAIL="leden@wijkvereniging.nl" \
  EXCHANGE_ORG="wijkvereniging.onmicrosoft.com" \
  ALLOWED_ORIGINS="https://contact.nietvooriedereen.nl,http://localhost:3000"
```

CORS óók instellen in Azure (extra laag naast de App's eigen headers):

```bash
az functionapp cors add -g "$RG" -n "$APP" \
  --allowed-origins "https://contact.nietvooriedereen.nl" "http://localhost:3000"
```

### 4. Deployen

```bash
npm run build
func azure functionapp publish "$APP"
```

De base URL is dan `https://$APP.azurewebsites.net`. Noteer die → zet in SPA als `NEXT_PUBLIC_API_URL`.

### 5. Custom domain (optioneel)

Bv. `api.contact.nietvooriedereen.nl`:
- DNS CNAME → `$APP.azurewebsites.net`
- In Azure Portal → Function App → Custom domains → toevoegen
- Managed Certificate aanvragen

## Certificaat-variant (i.p.v. secret) — later

Client secrets roteren pijnlijk. Voor productie eigenlijk cert:

1. Genereer cert (self-signed of Key Vault):
   ```bash
   openssl req -x509 -nodes -newkey rsa:2048 \
     -keyout fn.key -out fn.crt -days 825 \
     -subj "/CN=contact-pwa-fn"
   openssl pkcs12 -export -out fn.pfx -inkey fn.key -in fn.crt -password pass:
   ```
2. Upload `fn.crt` (public) naar App Registration → **Certificates & secrets → Upload certificate**.
3. Upload `fn.pfx` naar Function App → **TLS/SSL settings → Private Key Certificates**.
4. Zet `WEBSITE_LOAD_CERTIFICATES=<thumbprint>`.
5. Vervang in `src/lib/appToken.ts` de secret-flow door `@azure/identity`'s
   `ClientCertificateCredential` (al een dependency). Env:
   - `APP_CLIENT_SECRET` leeg laten
   - `APP_CERT_THUMBPRINT=<thumbprint>`
6. Code-snippet (TODO, niet in deze prototype-drop):
   ```ts
   import { ClientCertificateCredential } from '@azure/identity';
   const cred = new ClientCertificateCredential(tenantId, clientId, {
     certificate: fs.readFileSync(`/var/ssl/private/${thumb}.p12`),
   });
   const { token } = await cred.getToken('https://outlook.office365.com/.default');
   ```

## Known limits / honest caveats

- **Exchange `InvokeCommand` REST endpoint is officieel, maar gedocumenteerd onder
  de "REST-based connection" voor het EXO v3 module.** Microsoft kan schema wijzigen.
  Test na module-updates.
- App-only roles op Exchange kunnen soms ~1 uur token-cache lag hebben na toewijzing.
- `New-MailContact` vereist soms `OrganizationalUnit` param in hybrid-setups — hier
  niet aangenomen; breid de params uit als je hybrid hebt.
- Als `InvokeCommand` voor classic DL in de toekomst breekt: fall back op **Azure Automation
  PowerShell runbook** met EXO v3 module + cert-auth, getriggerd via webhook vanuit deze Function.
  Hoeft nu niet; houd de optie open.

## Code layout

```
backend/
├── src/
│   ├── functions/
│   │   ├── contacts.ts      # GET/POST /api/contacts + GET/PATCH/DELETE /api/contacts/{id}
│   │   └── health.ts        # GET /api/health
│   └── lib/
│       ├── env.ts           # env vars + redaction
│       ├── http.ts          # CORS, JSON helpers, ApiError
│       ├── verifyUserToken.ts  # SPA→Function JWT validation
│       ├── appToken.ts      # client-credentials (Function→EXO)
│       ├── exchange.ts      # InvokeCommand helper
│       └── contacts.ts      # MailContact CRUD
├── host.json
├── package.json
├── tsconfig.json
├── local.settings.json.example
└── .funcignore
```
