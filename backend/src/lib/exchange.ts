/**
 * Exchange Online REST client — app-only (Exchange.ManageAsApp).
 *
 * Background / design notes:
 *   - Classic Exchange distribution lists ("MailContact" + DL via Get-MailContact / Add-DistributionGroupMember)
 *     live in Exchange Online, NOT in Entra ID directory objects. Microsoft Graph's /contacts
 *     endpoint only exposes OrgContacts and cannot read/mutate Exchange MailContacts.
 *   - Graph also cannot add/remove members of *classic* Exchange DLs.
 *   - So we must talk to Exchange Online directly.
 *
 * Two pragmatic routes were considered:
 *
 *   A) Exchange Online Management v3 PowerShell module running *inside a Function / container*.
 *      Works with app-only cert auth via `Connect-ExchangeOnline -CertificateThumbprint … -AppId … -Organization …`.
 *      Requires PowerShell runtime inside the Functions image; messy on a Linux Node.js Consumption plan.
 *
 *   B) Exchange Online REST endpoint `https://outlook.office365.com/adminapi/beta/{org}/InvokeCommand`
 *      This is the same REST channel the PowerShell module uses under the hood.
 *      Auth: app-only access_token for resource `https://outlook.office365.com/.default`
 *      Requires the App Registration to have `Exchange.ManageAsApp` (application permission,
 *      Office 365 Exchange Online), admin consent, and the service principal to be granted the
 *      `Exchange Administrator` Entra role.
 *
 *   => We go with (B). This file implements a thin `invoke(cmdlet, params)` helper.
 *
 * If Helmer finds that Microsoft changes behaviour or the app-only InvokeCommand route is
 * unavailable for a specific cmdlet, the fallback is an Azure Automation PowerShell runbook
 * (Exchange Online v3 module, cert-auth) that the Function triggers via webhook. See README.
 */

import { InvocationContext } from '@azure/functions';
import { getAppToken } from './appToken.js';
import { ApiError } from './http.js';
import { env, redact } from './env.js';

const EXO_RESOURCE = 'https://outlook.office365.com/.default';

function exoUrl(): string {
  return `https://outlook.office365.com/adminapi/beta/${encodeURIComponent(env.exchangeOrg)}/InvokeCommand`;
}

type InvokeResult<T = unknown> = { value: T[]; '@odata.context'?: string };

/**
 * Run a single Exchange PowerShell cmdlet via the REST InvokeCommand endpoint.
 * Retries once on 429/503 honoring Retry-After.
 */
export async function invoke<T = unknown>(
  cmdlet: string,
  params: Record<string, unknown>,
  ctx: InvocationContext
): Promise<T[]> {
  const token = await getAppToken(EXO_RESOURCE, ctx);
  const body = { CmdletInput: { CmdletName: cmdlet, Parameters: params } };

  const attempt = async (): Promise<Response> => {
    return fetch(exoUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  };

  let res = await attempt();
  if (res.status === 429 || res.status === 503) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 2;
    ctx.warn('exo_rate_limited', { cmdlet, retryAfter });
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
    res = await attempt();
  }

  if (!res.ok) {
    let data: unknown = await res.text();
    try {
      data = JSON.parse(data as string);
    } catch {
      /* text */
    }
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    ctx.error('exo_invoke_failed', redact({ cmdlet, status: res.status, body: data }));
    throw new ApiError(
      res.status === 429 ? 429 : res.status >= 500 ? 502 : res.status,
      'exchange_error',
      `Exchange ${cmdlet} failed (${res.status})`,
      data,
      retryAfter
    );
  }

  // Some cmdlets (Remove-*, Add-DistributionGroupMember, Set-*) return empty bodies on success.
  const text = await res.text();
  if (!text || !text.trim()) return [];
  let json: InvokeResult<T>;
  try {
    json = JSON.parse(text) as InvokeResult<T>;
  } catch {
    ctx.warn('exo_invoke_non_json', { cmdlet, sample: text.slice(0, 200) });
    return [];
  }
  return json.value || [];
}
