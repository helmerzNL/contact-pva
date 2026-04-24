'use client';

import { PublicClientApplication, type AccountInfo, type AuthenticationResult, InteractionRequiredAuthError } from '@azure/msal-browser';
import { config, getApiScopes } from './config';

function scopes(): string[] {
  return getApiScopes(config.apiScope);
}

let msalInstance: PublicClientApplication | null = null;
let initPromise: Promise<void> | null = null;

export function getMsal(): PublicClientApplication {
  if (msalInstance) return msalInstance;
  msalInstance = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: config.authority,
      redirectUri: config.redirectUri,
      postLogoutRedirectUri: config.redirectUri,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false,
    },
  });
  return msalInstance;
}

export async function initMsal(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const m = getMsal();
    await m.initialize();
    // handle redirect response (noop voor popup flow)
    await m.handleRedirectPromise().catch(() => undefined);
  })();
  return initPromise;
}

export function getActiveAccount(): AccountInfo | null {
  const m = getMsal();
  const active = m.getActiveAccount();
  if (active) return active;
  const all = m.getAllAccounts();
  if (all.length > 0) {
    m.setActiveAccount(all[0]);
    return all[0];
  }
  return null;
}

export async function login(): Promise<AuthenticationResult> {
  const m = getMsal();
  const result = await m.loginPopup({ scopes: scopes(), prompt: 'select_account' });
  m.setActiveAccount(result.account);
  return result;
}

export async function logout(): Promise<void> {
  const m = getMsal();
  await m.logoutPopup().catch(() => undefined);
}

export async function getAccessToken(): Promise<string> {
  const m = getMsal();
  const account = getActiveAccount();
  if (!account) throw new Error('Niet ingelogd');
  // Vraag uitsluitend de Function-scope aan, geen Graph mengen.
  const apiOnly = [config.apiScope];
  try {
    const res = await m.acquireTokenSilent({ scopes: apiOnly, account });
    return res.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const res = await m.acquireTokenPopup({ scopes: apiOnly, account });
      return res.accessToken;
    }
    throw e;
  }
}
