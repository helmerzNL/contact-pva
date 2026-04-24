# Contact PWA

Progressive Web App om Exchange Organization Contacts in een Microsoft 365-tenant te beheren (aanmaken, bewerken, verwijderen) en automatisch toe te voegen aan de `leden@` distributielijst.

## Stack
Next.js 15 (static export) · TypeScript · Tailwind + shadcn-stijl UI · MSAL Browser (SPA + PKCE) · Microsoft Graph · PWA (manifest + service worker).

## Deployment
GitHub Pages via Actions → custom domain `contact.nietvooriedereen.nl`.

Zie **[SETUP.md](./SETUP.md)** voor app-registration, DNS, en eerste-keer-configuratie.

## Dev

```bash
cp .env.local.example .env.local   # vul client id in
npm install
npm run dev
```

## Build

```bash
npm run build   # produceert ./out
```

## Licentie
MIT
