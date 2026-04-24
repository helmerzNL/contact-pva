#!/usr/bin/env bash
# deploy.sh - Contact-PWA Azure Function bootstrap
set -euo pipefail

# VUL EERST IN:
SUB="<subscription-id>"
RG="rg-contact-pwa"
LOC="westeurope"
APP="func-contact-pwa-$RANDOM"
STG="stcontactpwa$(openssl rand -hex 3)"

TARGET_TENANT_ID="bf2f39aa-496c-406a-940c-41e73a851d39"
APP_CLIENT_ID="<app-id>"
APP_CLIENT_SECRET="<secret>"
DL_EMAIL="leden@wijkvereniging.nl"
EXCHANGE_ORG="wijkvereniging.onmicrosoft.com"
ALLOWED_ORIGINS="https://contact.nietvooriedereen.nl,http://localhost:3000"
# ---

echo "Subscription"
az account set -s "$SUB"

echo "Resource group"
az group create -n "$RG" -l "$LOC" -o none

echo "Storage account $STG"
az storage account create -g "$RG" -n "$STG" -l "$LOC" --sku Standard_LRS --kind StorageV2 -o none

echo "Function App $APP"
az functionapp create -g "$RG" -n "$APP" -s "$STG" --consumption-plan-location "$LOC" --runtime node --runtime-version 20 --functions-version 4 --os-type Linux -o none

echo "App settings"
az functionapp config appsettings set -g "$RG" -n "$APP" --settings TARGET_TENANT_ID="$TARGET_TENANT_ID" APP_CLIENT_ID="$APP_CLIENT_ID" APP_CLIENT_SECRET="$APP_CLIENT_SECRET" API_AUDIENCE="api://$APP_CLIENT_ID" DL_EMAIL="$DL_EMAIL" EXCHANGE_ORG="$EXCHANGE_ORG" ALLOWED_ORIGINS="$ALLOWED_ORIGINS" -o none

echo "CORS"
az functionapp cors add -g "$RG" -n "$APP" --allowed-origins "https://contact.nietvooriedereen.nl" "http://localhost:3000" -o none

echo "Done. Function App URL: https://$APP.azurewebsites.net"
echo "Next: cd backend && npm install && npm run build && func azure functionapp publish $APP"
