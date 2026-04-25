import { InvocationContext } from '@azure/functions';
import { invoke } from './exchange.js';
import { env } from './env.js';

export type MailContact = {
  id: string; // Exchange Identity / Guid
  displayName: string;
  email: string;
  externalEmailAddress?: string;
  alias?: string;
};

type RawMailContact = {
  Guid?: string;
  Identity?: string;
  DisplayName?: string;
  PrimarySmtpAddress?: string;
  ExternalEmailAddress?: string; // e.g. "SMTP:foo@bar.com"
  Alias?: string;
  Name?: string;
};

function normalize(raw: RawMailContact): MailContact {
  const ext = raw.ExternalEmailAddress || '';
  const stripped = ext.replace(/^SMTP:/i, '');
  return {
    id: raw.Guid || raw.Identity || raw.Name || '',
    displayName: raw.DisplayName || raw.Name || '',
    email: raw.PrimarySmtpAddress || stripped || '',
    externalEmailAddress: stripped || undefined,
    alias: raw.Alias,
  };
}

export async function listMailContacts(ctx: InvocationContext): Promise<MailContact[]> {
  const raw = await invoke<RawMailContact>('Get-MailContact', { ResultSize: 'Unlimited' }, ctx);
  return raw.map(normalize);
}

export async function getMailContact(id: string, ctx: InvocationContext): Promise<MailContact | null> {
  const raw = await invoke<RawMailContact>('Get-MailContact', { Identity: id }, ctx);
  if (!raw.length) return null;
  return normalize(raw[0]!);
}

export async function createMailContactAndAddToDl(
  input: { displayName: string; email: string },
  ctx: InvocationContext
): Promise<MailContact> {
  // Step 1 — create
  const createdRaw = await invoke<RawMailContact>(
    'New-MailContact',
    {
      Name: input.displayName,
      DisplayName: input.displayName,
      ExternalEmailAddress: input.email,
    },
    ctx
  );
  if (!createdRaw.length) throw new Error('New-MailContact returned empty result');
  const created = normalize(createdRaw[0]!);

  // Step 2 — add to DL (retry: replication lag tussen Create en DL-add)
  const memberId = created.email || input.email;
  let lastErr: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      await invoke(
        'Add-DistributionGroupMember',
        {
          Identity: env.dlEmail,
          Member: memberId,
          BypassSecurityGroupManagerCheck: true,
        },
        ctx
      );
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  if (lastErr) throw lastErr;

  return created;
}

export async function updateMailContact(
  id: string,
  patch: { displayName?: string; email?: string },
  ctx: InvocationContext
): Promise<MailContact> {
  if (patch.displayName) {
    await invoke(
      'Set-MailContact',
      { Identity: id, DisplayName: patch.displayName, Name: patch.displayName },
      ctx
    );
  }
  if (patch.email) {
    await invoke('Set-MailContact', { Identity: id, ExternalEmailAddress: patch.email }, ctx);
  }
  const updated = await getMailContact(id, ctx);
  if (!updated) throw new Error(`Contact ${id} not found after update`);
  return updated;
}

export async function deleteMailContact(id: string, ctx: InvocationContext): Promise<void> {
  await invoke('Remove-MailContact', { Identity: id, Confirm: false }, ctx);
}
