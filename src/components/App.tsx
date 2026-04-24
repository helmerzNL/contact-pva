'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Loader2, LogOut, Plus, Search, Pencil, Trash2, UserPlus, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { config, GLOBAL_ADMIN_ROLE_TEMPLATE_ID } from '@/lib/config';
import { initMsal, login, logout, getActiveAccount } from '@/lib/auth';
import {
  listOrgContacts,
  createOrgContact,
  updateOrgContact,
  deleteOrgContact,
  findGroupByMail,
  addMemberToGroup,
  hasDirectoryRole,
  GraphError,
  type OrgContact,
} from '@/lib/graph';

type AuthStatus = 'booting' | 'unconfigured' | 'logged-out' | 'checking' | 'forbidden-tenant' | 'forbidden-role' | 'ready';

function describeError(e: unknown): string {
  if (e instanceof GraphError) {
    if (e.status === 429) return `Te veel verzoeken. Probeer het opnieuw${e.retryAfter ? ` over ${e.retryAfter}s` : ''}.`;
    if (e.status === 401) return 'Niet geautoriseerd. Log opnieuw in.';
    if (e.status === 403) return `Geen rechten: ${e.message}`;
    return `Graph ${e.status}: ${e.message}`;
  }
  if (e instanceof Error) return e.message;
  return 'Onbekende fout';
}

export default function App() {
  const [status, setStatus] = React.useState<AuthStatus>('booting');
  const [userName, setUserName] = React.useState<string>('');
  const [contacts, setContacts] = React.useState<OrgContact[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [dialog, setDialog] = React.useState<null | { mode: 'create' } | { mode: 'edit'; contact: OrgContact }>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<OrgContact | null>(null);

  const loadContacts = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await listOrgContacts();
      setContacts(list);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const bootstrap = React.useCallback(async () => {
    if (!config.isConfigured) {
      setStatus('unconfigured');
      return;
    }
    await initMsal();
    const account = getActiveAccount();
    if (!account) {
      setStatus('logged-out');
      return;
    }
    setStatus('checking');
    // tenant check
    const tid = (account.idTokenClaims as any)?.tid as string | undefined;
    if (tid && tid !== config.tenantId) {
      setStatus('forbidden-tenant');
      return;
    }
    // Global admin check: eerst via id_token claims (wids), anders via Graph
    const wids = (account.idTokenClaims as any)?.wids as string[] | undefined;
    let isAdmin = Array.isArray(wids) && wids.includes(GLOBAL_ADMIN_ROLE_TEMPLATE_ID);
    if (!isAdmin) {
      try {
        isAdmin = await hasDirectoryRole(GLOBAL_ADMIN_ROLE_TEMPLATE_ID);
      } catch {
        isAdmin = false;
      }
    }
    if (!isAdmin) {
      setStatus('forbidden-role');
      return;
    }
    setUserName(account.name || account.username);
    setStatus('ready');
    await loadContacts();
  }, [loadContacts]);

  React.useEffect(() => {
    bootstrap().catch((e) => toast.error(describeError(e)));
  }, [bootstrap]);

  async function handleLogin() {
    try {
      await initMsal();
      await login();
      await bootstrap();
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  async function handleLogout() {
    await logout();
    setStatus('logged-out');
    setContacts([]);
  }

  async function handleCreate(values: { displayName: string; email: string }) {
    try {
      const created = await createOrgContact({ displayName: values.displayName, email: values.email });
      toast.success('Contact aangemaakt');
      // Voeg toe aan DL
      try {
        const group = await findGroupByMail(config.dlEmail);
        if (!group) {
          toast.warning(`Distributielijst ${config.dlEmail} niet gevonden — contact is wel aangemaakt.`);
        } else {
          await addMemberToGroup(group.id, created.id);
          toast.success(`Toegevoegd aan ${group.displayName || config.dlEmail}`);
        }
      } catch (e) {
        toast.error(`DL-toevoeging mislukt: ${describeError(e)}`);
      }
      setDialog(null);
      await loadContacts();
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  async function handleUpdate(id: string, values: { displayName: string; email: string }) {
    try {
      await updateOrgContact(id, { displayName: values.displayName, mail: values.email });
      toast.success('Contact bijgewerkt');
      setDialog(null);
      await loadContacts();
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  async function handleDelete(c: OrgContact) {
    try {
      await deleteOrgContact(c.id);
      toast.success('Contact verwijderd');
      setConfirmDelete(null);
      await loadContacts();
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => (c.displayName || '').toLowerCase().includes(q) || (c.mail || '').toLowerCase().includes(q));
  }, [contacts, query]);

  if (status === 'booting') return <CenterLoader label="Bezig met laden…" />;

  if (status === 'unconfigured') {
    return (
      <CenterMessage
        icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
        title="App niet geconfigureerd"
        body={
          <div className="space-y-2 text-sm">
            <p>De <code>CLIENT_ID</code> ontbreekt. Vul <code>.env.local</code> (dev) of <code>public/config.js</code> (productie).</p>
            <p>Zie <code>SETUP.md</code> voor de volledige instructies.</p>
          </div>
        }
      />
    );
  }

  if (status === 'logged-out') {
    return (
      <CenterMessage
        title="Contactbeheer"
        body={
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Inloggen met je Microsoft 365 Global Admin account.</p>
            <Button onClick={handleLogin} className="w-full">Inloggen met Microsoft</Button>
          </div>
        }
      />
    );
  }

  if (status === 'checking') return <CenterLoader label="Rechten controleren…" />;

  if (status === 'forbidden-tenant') {
    return (
      <CenterMessage
        icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
        title="Verkeerde tenant"
        body={
          <div className="space-y-3 text-sm">
            <p>Je account hoort niet bij de geautoriseerde tenant.</p>
            <Button variant="outline" onClick={handleLogout}>Uitloggen</Button>
          </div>
        }
      />
    );
  }

  if (status === 'forbidden-role') {
    return (
      <CenterMessage
        icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
        title="Geen Global Admin"
        body={
          <div className="space-y-3 text-sm">
            <p>Alleen Global Administrators hebben toegang.</p>
            <Button variant="outline" onClick={handleLogout}>Uitloggen</Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contactbeheer</h1>
          <p className="text-sm text-muted-foreground">{userName} · DL: <code>{config.dlEmail}</code></p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}><LogOut className="h-4 w-4" /> Uitloggen</Button>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Zoek op naam of e-mail…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}><Plus className="h-4 w-4" /> Nieuw contact</Button>
        <Button variant="outline" onClick={loadContacts} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Vernieuwen
        </Button>
      </div>

      {loading && contacts.length === 0 ? (
        <CenterLoader label="Contacten laden…" inline />
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">Geen contacten gevonden.</Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li key={c.id}>
              <Card className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.displayName || '(zonder naam)'}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.mail || '—'}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setDialog({ mode: 'edit', contact: c })} aria-label="Bewerken">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(c)} aria-label="Verwijderen">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ContactDialog
        open={!!dialog}
        mode={dialog?.mode}
        contact={dialog?.mode === 'edit' ? dialog.contact : undefined}
        onClose={() => setDialog(null)}
        onSubmit={(values) => {
          if (dialog?.mode === 'edit') return handleUpdate(dialog.contact.id, values);
          return handleCreate(values);
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Contact verwijderen"
        description={confirmDelete ? `Weet je zeker dat je ${confirmDelete.displayName || confirmDelete.mail} wilt verwijderen?` : ''}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={async () => { if (confirmDelete) await handleDelete(confirmDelete); }}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function CenterLoader({ label, inline }: { label: string; inline?: boolean }) {
  return (
    <div className={inline ? 'py-12 flex items-center justify-center' : 'min-h-screen flex items-center justify-center'}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {label}
      </div>
    </div>
  );
}

function CenterMessage({ icon, title, body }: { icon?: React.ReactNode; title: string; body: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          {icon ?? <UserPlus className="h-6 w-6 text-primary" />}
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        <div>{body}</div>
      </Card>
    </div>
  );
}

function ContactDialog({
  open,
  mode,
  contact,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode?: 'create' | 'edit';
  contact?: OrgContact;
  onClose: () => void;
  onSubmit: (values: { displayName: string; email: string }) => Promise<void>;
}) {
  const [displayName, setDisplayName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDisplayName(contact?.displayName ?? '');
      setEmail(contact?.mail ?? '');
    }
  }, [open, contact]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !email.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ displayName: displayName.trim(), email: email.trim() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-lg focus:outline-none">
          <Dialog.Title className="text-lg font-semibold">
            {mode === 'edit' ? 'Contact bewerken' : 'Nieuw contact'}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {mode === 'edit' ? 'Pas naam of e-mailadres aan.' : 'Nieuw contact wordt ook toegevoegd aan de distributielijst.'}
          </Dialog.Description>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Naam</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">E-mail</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuleren</Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {mode === 'edit' ? 'Opslaan' : 'Aanmaken'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  async function go() {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  }
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-lg focus:outline-none">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Annuleren</Button>
            <Button variant={destructive ? 'destructive' : 'default'} onClick={go} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
