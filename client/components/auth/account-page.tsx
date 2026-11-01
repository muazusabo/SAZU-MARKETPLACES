'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, BadgeCheck, Bell, BookmarkCheck, ChevronRight, CircleUserRound,
  Clock3, Compass, ImageOff, LayoutDashboard, MessageCircle, Plus, Store,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useRealtime } from '@/components/realtime/realtime-provider';
import { AvatarUploader } from '@/components/ui/avatar-uploader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { apiFetch, ApiError } from '@/lib/api';
import { authedFetch, jsonBody, setAccessToken } from '@/lib/auth-client';
import { buyerApi } from '@/lib/buyer-api';
import { formatMessageTime, formatNairaFromKobo } from '@/lib/format';
import { useBrowserFormDraft } from '@/lib/use-browser-draft';
import { ProfileValues, normalizeNigerianPhone, profileSchema } from '@/lib/validation';
import { Me, useAuth } from './auth-provider';
import { FormError } from './auth-shell';
import { RequireAuth } from './require-auth';

function ProfileForm({ user }: { user: Me }) {
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: user.profile.fullName, displayName: user.profile.displayName, phone: user.profile.phone ?? '', campusArea: user.profile.campusArea ?? '' },
  });
  const draft = useBrowserFormDraft(`sazu:draft:profile:${user.id}`, form);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = form;

  async function onSubmit(v: ProfileValues) {
    setError(null);
    try {
      const me = await authedFetch<Me>('/users/me', jsonBody('PATCH', {
        fullName: v.fullName, displayName: v.displayName,
        phone: v.phone ? normalizeNigerianPhone(v.phone) : null,
        campusArea: v.campusArea || null,
      }));
      setUser(me);
      reset({ fullName: me.profile.fullName, displayName: me.profile.displayName, phone: me.profile.phone ?? '', campusArea: me.profile.campusArea ?? '' });
      draft.clearDraft();
      toast.success('Profile saved.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your profile.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      {draft.hasDraft && <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">Your in-progress profile changes are saved on this device.</p>}
      {draft.storageFailed && <p role="alert" className="rounded-md border border-accent/50 bg-secondary px-3 py-2 text-sm">Your browser couldn’t read or save your profile draft. Save your changes before leaving.</p>}
      <FormError message={error} />
      <TextField label="Full name" error={errors.fullName?.message} {...register('fullName')} />
      <TextField label="Display name" hint="Shown to other students." error={errors.displayName?.message} {...register('displayName')} />
      <TextField label="Phone" type="tel" hint="Private. Leave blank to remove it." error={errors.phone?.message} {...register('phone')} />
      <TextField label="Campus or hostel area" error={errors.campusArea?.message} {...register('campusArea')} />
      <Button type="submit" disabled={isSubmitting || !isDirty} className="justify-self-start">{isSubmitting ? 'Saving…' : 'Save changes'}</Button>
    </form>
  );
}

function VerifyBanner() {
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  if (!user || user.emailVerified) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-accent bg-card p-4">
      <p className="text-sm">Verify <strong>{user.email}</strong> to apply as a seller and message sellers.</p>
      <Button asChild size="sm" variant="outline"><Link href={`/verify-email?email=${encodeURIComponent(user.email)}`}>Enter code</Link></Button>
      <Button size="sm" variant="outline" disabled={sending} onClick={async () => {
        setSending(true);
        try { await apiFetch('/auth/resend-verification', jsonBody('POST', { email: user.email })); toast.success('Verification email sent.'); }
        catch { toast.error('Could not send the email. Try again shortly.'); }
        finally { setSending(false); }
      }}>Resend email</Button>
    </div>
  );
}

function DangerZone() {
  const router = useRouter();
  const { logout } = useAuth();
  const [mode, setMode] = useState<null | 'deactivate' | 'delete'>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPassword(''); setError(null); }, [mode]);

  async function confirm() {
    if (!mode) return;
    setBusy(true); setError(null);
    try {
      await authedFetch(mode === 'delete' ? '/users/me' : '/users/me/deactivate', jsonBody(mode === 'delete' ? 'DELETE' : 'POST', { password }));
      setAccessToken(null);
      await logout();
      toast.success(mode === 'delete' ? 'Your account has been deleted.' : 'Your account is deactivated. Sign in any time to reactivate it.');
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="danger" className="rounded-2xl border border-destructive/30 bg-destructive/[0.03] p-5 sm:p-6">
      <h2 id="danger" className="flex items-center gap-2 text-lg font-bold text-destructive"><AlertTriangle aria-hidden className="size-5" /> Account removal</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setMode('deactivate')}>Deactivate account</Button>
        <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => setMode('delete')}>Delete account</Button>
      </div>
      {mode && (
        <div className="mt-4 grid gap-3">
          <p className="text-sm text-muted-foreground">
            {mode === 'deactivate'
              ? 'Deactivating signs you out everywhere. Signing in again reactivates your account.'
              : 'Deleting permanently removes your personal details and cannot be undone.'}{' '}
            Enter your password to confirm.
          </p>
          <FormError message={error} />
          <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex gap-2">
            <Button variant={mode === 'delete' ? 'default' : 'default'} className={mode === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''} disabled={busy || !password} onClick={confirm}>
              {busy ? 'Working…' : mode === 'delete' ? 'Delete my account' : 'Deactivate my account'}
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function AccountContent() {
  const { user, setUser } = useAuth();
  const { unreadMessages, unreadNotifications } = useRealtime();
  const wishlist = useQuery({ queryKey: ['wishlist', 1], queryFn: () => buyerApi.wishlist(1), staleTime: 30_000 });
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: buyerApi.conversations, staleTime: 30_000 });
  if (!user) return null;
  const sellerApproved = user.seller?.status === 'approved';
  const quickLinks = [
    { href: '/browse', label: 'Explore listings', description: 'Find something you need', Icon: Compass },
    { href: '/wishlist', label: 'Saved listings', description: 'Come back to items you like', Icon: BookmarkCheck },
    { href: '/messages', label: 'Your messages', description: 'Continue buyer and seller chats', Icon: MessageCircle },
    { href: '/notifications', label: 'Notifications', description: 'See updates about your account', Icon: Bell },
    sellerApproved
      ? { href: '/dashboard', label: 'Seller dashboard', description: 'Manage your shop and listings', Icon: Store }
      : { href: '/sell', label: 'Start selling', description: 'Create your seller profile', Icon: Plus },
  ];

  return (
    <div className="container mx-auto grid max-w-7xl gap-7 py-6 sm:gap-9 sm:py-10">
      <section aria-labelledby="dashboard-title" className="relative isolate overflow-hidden rounded-[2rem] border border-primary/10 bg-gradient-to-br from-primary via-primary to-primary/85 p-5 text-primary-foreground shadow-xl shadow-primary/10 sm:p-8 lg:p-10">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 -z-10 size-72 rounded-full border-[44px] border-accent/15" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-1/4 -z-10 size-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-2xl font-bold shadow-inner sm:size-[4.5rem]">
              {user.profile.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.profile.avatarUrl} alt="" className="size-full object-cover" />
                : user.profile.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground/85"><LayoutDashboard aria-hidden className="size-3.5" />Personal dashboard</p>
              <h1 id="dashboard-title" className="mt-3 break-words text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">Welcome, {user.profile.displayName}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-2 break-all text-xs text-primary-foreground/75 sm:text-sm">
                {user.email}
                {user.emailVerified && <Badge variant="success"><BadgeCheck aria-hidden className="mr-1 size-3.5" />Verified</Badge>}
              </p>
            </div>
          </div>
          <Button asChild variant="accent" className="min-h-12 w-full rounded-xl px-5 font-bold shadow-md shadow-black/10 transition-transform hover:-translate-y-0.5 sm:w-auto">
            <Link href="/browse"><Compass aria-hidden />Explore marketplace<ChevronRight aria-hidden className="size-4" /></Link>
          </Button>
        </div>
      </section>

      <VerifyBanner />

      <section aria-label="Your marketplace activity" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStat href="/messages" label="Conversations" value={conversations.data?.meta.total} Icon={MessageCircle} loading={conversations.isLoading} error={conversations.isError} tone="primary" />
        <DashboardStat href="/messages" label="Unread messages" value={unreadMessages} Icon={MessageCircle} tone="primary" />
        <DashboardStat href="/wishlist" label="Saved listings" value={wishlist.data?.meta.total} Icon={BookmarkCheck} loading={wishlist.isLoading} error={wishlist.isError} tone="rose" />
        <DashboardStat href="/notifications" label="New notifications" value={unreadNotifications} Icon={Bell} tone="gold" />
      </section>

      <section aria-labelledby="quick-links-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your marketplace</p>
            <h2 id="quick-links-title" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Quick access</h2>
          </div>
          <p className="hidden text-sm text-muted-foreground sm:block">Everything you need, all in one place.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {quickLinks.map(({ href, label, description, Icon }) => (
            <li key={href}>
              <Link href={href} className="group flex h-full min-h-[112px] items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col sm:justify-between sm:p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                <span className="flex min-w-0 flex-1 items-start justify-between gap-2 sm:w-full">
                  <span className="min-w-0">
                    <span className="block font-bold">{label}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span>
                  </span>
                  <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Recent marketplace activity" className="grid items-start gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b bg-gradient-to-r from-primary/[0.06] to-transparent px-5 py-4 sm:px-6">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><MessageCircle aria-hidden className="size-5" /></span>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Stay connected</p>
                <h2 className="mt-0.5 text-lg font-bold tracking-tight sm:text-xl">Recent conversations</h2>
              </div>
              <Button asChild size="sm" variant="ghost" className="shrink-0 rounded-full">
                <Link href="/messages">View all<ChevronRight aria-hidden className="ml-1 size-4" /></Link>
              </Button>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            {conversations.isLoading ? (
              <div role="status" aria-label="Loading recent conversations" className="grid gap-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-xl bg-muted" />)}
              </div>
            ) : conversations.isError ? (
              <p role="alert" className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive">Recent conversations couldn’t be loaded. Visit Messages to try again.</p>
            ) : !conversations.data?.data.length ? (
              <div className="rounded-2xl border border-dashed p-5 text-center">
                <MessageCircle aria-hidden className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-2 font-semibold">No conversations yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Message a seller to start a conversation.</p>
                <Button asChild variant="outline" size="sm" className="mt-3 rounded-full"><Link href="/browse">Browse listings</Link></Button>
              </div>
            ) : (
              <ul className="grid gap-1">
                {conversations.data.data.slice(0, 3).map((conversation) => (
                  <li key={conversation.id}>
                    <Link href={`/messages/${conversation.id}`} className="group flex min-h-[68px] items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary">
                        {conversation.counterpart.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-bold">{conversation.counterpart.name}</span>
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <Clock3 aria-hidden className="size-3" />
                            {formatMessageTime(conversation.lastMessage?.createdAt ?? conversation.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                          {conversation.lastMessage
                            ? `${conversation.lastMessage.mine ? 'You: ' : ''}${conversation.lastMessage.body}`
                            : conversation.product?.title ?? 'Conversation started'}
                        </span>
                      </span>
                      {conversation.unreadCount > 0 && (
                        <Badge className="shrink-0 rounded-full bg-primary text-primary-foreground">{conversation.unreadCount}</Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b bg-gradient-to-r from-accent/15 to-transparent px-5 py-4 sm:px-6">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/20 text-accent-foreground"><BookmarkCheck aria-hidden className="size-5" /></span>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Saved for later</p>
                <h2 className="mt-0.5 text-lg font-bold tracking-tight sm:text-xl">Saved listings</h2>
              </div>
              <Button asChild size="sm" variant="ghost" className="shrink-0 rounded-full">
                <Link href="/wishlist">View all<ChevronRight aria-hidden className="ml-1 size-4" /></Link>
              </Button>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            {wishlist.isLoading ? (
              <div role="status" aria-label="Loading saved listings" className="grid gap-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-xl bg-muted" />)}
              </div>
            ) : wishlist.isError ? (
              <p role="alert" className="rounded-xl bg-destructive/5 p-4 text-sm text-destructive">Saved listings couldn’t be loaded. Visit your wishlist to try again.</p>
            ) : !wishlist.data?.data.length ? (
              <div className="rounded-2xl border border-dashed p-5 text-center">
                <BookmarkCheck aria-hidden className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-2 font-semibold">Nothing saved yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Tap the heart on a listing to keep it here.</p>
                <Button asChild variant="outline" size="sm" className="mt-3 rounded-full"><Link href="/browse">Find listings</Link></Button>
              </div>
            ) : (
              <ul className="grid gap-1">
                {wishlist.data.data.slice(0, 3).map((item) => {
                  const content = (
                    <>
                      {item.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={item.imageUrl} alt="" className="size-14 shrink-0 rounded-xl bg-muted object-cover" />
                        : <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><ImageOff className="size-5" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{item.title}</span>
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">{formatNairaFromKobo(item.priceKobo)} · {item.category}</span>
                      </span>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {item.href
                        ? <Link href={item.href} className="group flex min-h-[68px] items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</Link>
                        : <div className="flex min-h-[68px] items-center gap-3 rounded-2xl px-3 py-2.5 opacity-70">{content}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="profile-h" className="grid items-start gap-6 overflow-hidden rounded-3xl border bg-card p-5 shadow-sm sm:p-7 lg:grid-cols-[minmax(240px,.72fr)_minmax(0,1.28fr)] lg:gap-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Account settings</p>
          <h2 id="profile-h" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Your profile</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Keep your information current so other students know who they’re chatting with.</p>
          <div className="mt-5 rounded-2xl bg-secondary/50 p-4">
            <AvatarUploader name={user.profile.displayName} imageUrl={user.profile.avatarUrl} upload={async (file) => {
              const f = new FormData(); f.append('file', file);
              setUser(await authedFetch<Me>('/users/me/avatar', { method: 'POST', body: f }));
            }} />
          </div>
        </div>
        <div className="rounded-2xl border bg-background/70 p-4 sm:p-6">
          <div className="mb-5 flex items-center gap-2 border-b pb-4">
            <CircleUserRound aria-hidden className="size-5 text-primary" />
            <h3 className="font-bold">Personal information</h3>
          </div>
          <ProfileForm user={user} />
        </div>
      </section>

      {!sellerApproved && user.seller?.status && (
        <section aria-label="Seller application status" className="flex flex-col justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 sm:flex-row sm:items-center sm:p-5">
          <div>
            <p className="font-bold">Seller application: {user.seller.status}</p>
            <p className="mt-1 text-sm text-muted-foreground">Your buyer account is ready to use. Check your seller area for application details.</p>
          </div>
          <Button asChild variant="outline" className="shrink-0 rounded-full"><Link href="/sell">View seller area</Link></Button>
        </section>
      )}

      {wishlist.isError || conversations.isError ? (
        <p role="status" className="text-sm text-destructive">
          {wishlist.isError && conversations.isError
            ? 'Some dashboard activity counts could not be loaded. Open Saved listings or Your messages to try again.'
            : wishlist.isError
              ? 'Your saved-listing count could not be loaded. Open Saved listings to try again.'
              : 'Your conversation count could not be loaded. Open Your messages to try again.'}
        </p>
      ) : null}

      <DangerZone />
    </div>
  );
}

function DashboardStat({
  href, label, value, Icon, loading = false, error = false, tone,
}: {
  href: string;
  label: string;
  value: number | undefined;
  Icon: typeof MessageCircle;
  loading?: boolean;
  error?: boolean;
  tone: 'primary' | 'rose' | 'gold';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    rose: 'bg-destructive/10 text-destructive',
    gold: 'bg-accent/20 text-accent-foreground',
  }[tone];
  return (
    <Link href={href} className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
      <span aria-hidden className={`pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-50 ${toneClass}`} />
      <div className="flex items-start justify-between gap-3">
        <span className={`relative grid size-11 place-items-center rounded-xl ${toneClass}`}><Icon aria-hidden className="size-5" /></span>
        <ChevronRight aria-hidden className="relative size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </div>
      <p className="relative mt-4 text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="relative mt-1 text-3xl font-extrabold tracking-tight">
        {loading ? <span className="inline-block h-8 w-10 animate-pulse rounded bg-muted" aria-label="Loading" />
          : error ? <span className="text-base font-semibold text-muted-foreground">Unavailable</span>
            : value ?? 0}
      </p>
    </Link>
  );
}

export function AccountPage() {
  return <RequireAuth><AccountContent /></RequireAuth>;
}
