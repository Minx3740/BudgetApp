import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChartNoAxesColumn,
  CirclePlus,
  Home,
  LogOut,
  ReceiptText,
  RefreshCw,
  Settings2,
  UserRound,
  UsersRound,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BudgetDashboard } from './components/budget/budget-dashboard'
import { LocalDataView } from './components/budget/local-data-view'
import {
  InvitationAcceptance,
  WorkspaceManagement,
} from './components/workspaces/workspace-management'
import { WorkspaceSettings } from './components/workspaces/workspace-settings'
import { bootstrapFromSupabase } from './data/bootstrap'
import { clearLocalData, db } from './data/database'
import {
  useInvitations,
  useMemberships,
  useProfiles,
  useSyncSummary,
  useTransactions,
  useWorkspaces,
} from './data/hooks'
import { monthKeyForDate, shiftMonth } from './data/calculations'
import { createSupabaseSyncEngine, retryFailedSyncOperations } from './data/sync'
import { supabase } from './lib/supabase'

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'update-password'
type AppSection =
  | 'home'
  | 'transactions'
  | 'budgets'
  | 'spaces'
  | 'workspace-settings'
  | 'profile'
  | 'settings'
  | 'plus'
type ThemePreference = 'system' | 'light' | 'dark'

function savedThemePreference(): ThemePreference {
  const preference = window.localStorage.getItem('cashFlow.theme')
  return preference === 'light' || preference === 'dark' ? preference : 'system'
}

const navigation: { id: AppSection; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Accueil', icon: Home },
  { id: 'transactions', label: 'Transactions', icon: ReceiptText },
  { id: 'budgets', label: 'Budgets', icon: ChartNoAxesColumn },
]
const mobileNavigation = [...navigation, { id: 'plus' as const, label: 'Plus', icon: Settings2 }]

const sectionDetails: Record<
  Exclude<AppSection, 'home'>,
  { title: string; description: string; milestone: string }
> = {
  transactions: {
    title: 'Transactions',
    description: 'Tes dépenses, remboursements, revenus et ajustements apparaîtront ici.',
    milestone: 'La saisie locale arrive au jalon M5.',
  },
  budgets: {
    title: 'Budgets',
    description: 'Retrouve ici l’enveloppe du mois et les seuils par catégorie.',
    milestone: 'Ton enveloppe, ton solde et les seuils sont calculés sur cet appareil.',
  },
  spaces: {
    title: 'Espaces',
    description: 'Ton espace personnel est prêt pour la suite.',
    milestone: 'Les espaces partagés et invitations arrivent au jalon M8.',
  },
  'workspace-settings': {
    title: 'Réglages de l’espace',
    description: 'Le nom et les options de l’espace actif.',
    milestone: 'Les changements de propriétaire sont contrôlés par les permissions Supabase.',
  },
  profile: {
    title: 'Mon profil',
    description: 'Les informations de ton compte personnel.',
    milestone: 'Tu peux consulter ici ton identité et ton rôle dans l’espace actif.',
  },
  settings: {
    title: 'Réglages de l’application',
    description: 'Ton profil, tes préférences et les informations de connexion.',
    milestone: 'Les réglages de l’espace se trouvent dans Plus.',
  },
  plus: {
    title: 'Plus',
    description: 'Les outils moins fréquents et les réglages de l’espace.',
    milestone: 'Les fonctions de forfaits seront disponibles dans le lot R5.',
  },
}

function authErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'Adresse e-mail ou mot de passe incorrect.'
  }
  if (normalizedMessage.includes('email not confirmed')) {
    return 'Confirme ton adresse e-mail avant de te connecter.'
  }
  if (normalizedMessage.includes('user already registered')) {
    return 'Un compte existe déjà avec cette adresse e-mail.'
  }
  if (normalizedMessage.includes('database error saving new user')) {
    return 'La base Supabase ne contient pas toutes les migrations requises. Vérifie que les deux migrations M1 ont été appliquées avant M2.'
  }
  if (normalizedMessage.includes('redirect') && normalizedMessage.includes('allow')) {
    return 'Cette adresse de retour n’est pas autorisée par Supabase. Ajoute l’URL locale dans Authentication → URL Configuration → Redirect URLs.'
  }
  return `Impossible de terminer l’opération : ${message}`
}

function getAuthLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const errorCode = hash.get('error_code')
  const description = hash.get('error_description')?.toLowerCase() ?? ''

  if (errorCode === 'otp_expired' || description.includes('expired')) {
    return 'Ce lien de confirmation a expiré ou a déjà été utilisé. Demande un nouvel e-mail de confirmation.'
  }
  if (hash.has('error')) {
    return 'Ce lien de confirmation n’est plus valide. Demande un nouvel e-mail de confirmation.'
  }
  return null
}

function getApplicationUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(amount)} Ar`
}

function selectedMonthFromLocation(): string {
  const month = new URLSearchParams(window.location.search).get('mois')
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    try {
      return shiftMonth(`${month}-01`, 0)
    } catch {
      // An invalid URL month falls back to the current local month.
    }
  }
  return monthKeyForDate(new Date())
}

function formatMonth(month: string): string {
  const label = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T00:00:00.000Z`))
  return `${label.charAt(0).toLocaleUpperCase('fr-FR')}${label.slice(1)}`
}

function AuthForm({
  client,
  initialMode = 'sign-in',
  initialError,
  onRecoveryComplete,
}: {
  client: SupabaseClient
  initialMode?: AuthMode
  initialError?: string | null
  onRecoveryComplete?: () => void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [notice, setNotice] = useState<string | null>(null)
  const [canResendConfirmation, setCanResendConfirmation] = useState(Boolean(initialError))
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setIsSubmitting(true)

    try {
      if (mode === 'forgot-password') {
        const { error: recoveryError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: getApplicationUrl(),
        })

        if (recoveryError) {
          setError(authErrorMessage(recoveryError.message))
        } else {
          setNotice(
            'Si un compte correspond à cette adresse, un lien de réinitialisation va être envoyé.',
          )
        }
      } else if (mode === 'update-password') {
        const { error: updateError } = await client.auth.updateUser({ password })

        if (updateError) {
          setError(authErrorMessage(updateError.message))
        } else {
          setNotice('Ton mot de passe a été modifié. Tu peux maintenant te connecter.')
          setPassword('')
        }
      } else if (mode === 'sign-up') {
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: getApplicationUrl(),
          },
        })

        if (signUpError) {
          setError(authErrorMessage(signUpError.message))
        } else if (!data.session) {
          setNotice('Vérifie ta boîte mail pour confirmer ton adresse et terminer l’inscription.')
          setCanResendConfirmation(true)
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (signInError) {
          setError(authErrorMessage(signInError.message))
          setCanResendConfirmation(
            signInError.message.toLowerCase().includes('email not confirmed'),
          )
        }
      }
    } catch {
      setError('La connexion au service est impossible. Vérifie ton réseau puis réessaie.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendConfirmation() {
    if (!email.trim()) {
      setError('Saisis l’adresse e-mail du compte à confirmer.')
      return
    }

    setError(null)
    setNotice(null)
    setIsSubmitting(true)

    try {
      const { error: resendError } = await client.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: getApplicationUrl() },
      })

      if (resendError) {
        setError(authErrorMessage(resendError.message))
      } else {
        setNotice(
          'Un nouvel e-mail de confirmation a été demandé pour l’adresse saisie. Vérifie aussi les courriers indésirables.',
        )
      }
    } catch {
      setError('La connexion au service est impossible. Vérifie ton réseau puis réessaie.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError(null)
    setNotice(null)
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-stone-50 px-5 py-10 text-stone-900">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="mb-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
            cashFlow+
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === 'sign-in' && 'Content de te revoir'}
            {mode === 'sign-up' && 'Créer ton compte'}
            {mode === 'forgot-password' && 'Mot de passe oublié ?'}
            {mode === 'update-password' && 'Nouveau mot de passe'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {mode === 'sign-in' && 'Connecte-toi pour retrouver ton espace personnel.'}
            {mode === 'sign-up' && 'Ton espace personnel sera préparé automatiquement.'}
            {mode === 'forgot-password' &&
              'Indique ton e-mail pour recevoir un lien de réinitialisation.'}
            {mode === 'update-password' && 'Choisis un nouveau mot de passe pour ton compte.'}
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {mode === 'sign-up' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="display-name">
                Nom affiché
              </label>
              <input
                autoComplete="name"
                className="min-h-12 w-full rounded-xl border border-stone-300 px-4 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
                id="display-name"
                maxLength={80}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </div>
          )}

          {mode !== 'update-password' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="email">
                Adresse e-mail
              </label>
              <input
                autoComplete="email"
                className="min-h-12 w-full rounded-xl border border-stone-300 px-4 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
          )}

          {mode !== 'forgot-password' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="password">
                {mode === 'update-password' ? 'Nouveau mot de passe' : 'Mot de passe'}
              </label>
              <input
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                className="min-h-12 w-full rounded-xl border border-stone-300 px-4 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
                id="password"
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          {canResendConfirmation && (
            <button
              className="min-h-12 w-full rounded-xl border border-stone-300 px-4 font-semibold text-emerald-800 transition hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => void resendConfirmation()}
              type="button"
            >
              {isSubmitting ? 'Patiente…' : 'Renvoyer l’e-mail de confirmation'}
            </button>
          )}
          {notice && (
            <>
              <p
                className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
                role="status"
              >
                {notice}
              </p>
              {mode === 'update-password' && onRecoveryComplete && (
                <button
                  className="min-h-12 w-full rounded-xl border border-stone-300 px-4 font-semibold text-emerald-800 transition hover:bg-stone-50"
                  onClick={onRecoveryComplete}
                  type="button"
                >
                  Continuer vers l’application
                </button>
              )}
            </>
          )}

          <button
            className="min-h-12 w-full rounded-xl bg-emerald-800 px-4 font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-wait disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? 'Patiente…'
              : mode === 'sign-in'
                ? 'Se connecter'
                : mode === 'sign-up'
                  ? 'Créer mon compte'
                  : mode === 'forgot-password'
                    ? 'Envoyer le lien'
                    : 'Enregistrer le nouveau mot de passe'}
          </button>
        </form>

        {mode === 'sign-in' && (
          <button
            className="mt-5 block w-full text-center text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
            onClick={() => changeMode('forgot-password')}
            type="button"
          >
            Mot de passe oublié ?
          </button>
        )}

        {(mode === 'sign-up' || mode === 'forgot-password') && (
          <p className="mt-6 text-center text-sm text-stone-600">
            {mode === 'sign-up' ? 'Tu as déjà un compte ?' : 'Tu te souviens de ton mot de passe ?'}{' '}
            <button
              className="font-semibold text-emerald-800 underline-offset-4 hover:underline"
              onClick={() => changeMode('sign-in')}
              type="button"
            >
              Se connecter
            </button>
          </p>
        )}

        {mode === 'sign-in' && (
          <p className="mt-6 text-center text-sm text-stone-600">
            Pas encore de compte ?{' '}
            <button
              className="font-semibold text-emerald-800 underline-offset-4 hover:underline"
              onClick={() => changeMode('sign-up')}
              type="button"
            >
              Créer un compte
            </button>
          </p>
        )}
      </section>
    </main>
  )
}

function SignedInView({ client, session }: { client: SupabaseClient; session: Session }) {
  const [activeSection, setActiveSection] = useState<AppSection>('home')
  const [selectedMonth, setSelectedMonth] = useState(selectedMonthFromLocation)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    () => window.localStorage.getItem(`cashFlow.activeWorkspace.${session.user.id}`) ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const [bootstrapResult, setBootstrapResult] = useState<{
    key: string
    error: string | null
  } | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncAttempt, setSyncAttempt] = useState(0)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false)
  const [themePreference, setThemePreference] = useState<ThemePreference>(savedThemePreference)
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<{
    type: 'error' | 'notice'
    text: string
  } | null>(null)
  const bootstrapAbortController = useRef<AbortController | null>(null)
  const syncAbortController = useRef<AbortController | null>(null)
  const workspaces = useWorkspaces()
  const availableWorkspaces = workspaces.filter((workspace) => workspace.deleted_at === null)
  const activeWorkspace =
    availableWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
    availableWorkspaces.find((workspace) => workspace.type === 'personal') ??
    availableWorkspaces[0]
  const fallbackWorkspaceId =
    availableWorkspaces.find(
      (workspace) => workspace.id !== activeWorkspace?.id && workspace.type === 'personal',
    )?.id ?? availableWorkspaces.find((workspace) => workspace.id !== activeWorkspace?.id)?.id
  const memberships = useMemberships(activeWorkspace?.id)
  const profiles = useProfiles()
  const invitations = useInvitations(activeWorkspace?.id)
  const activeMembership = memberships.find((membership) => membership.user_id === session.user.id)
  const canEditWorkspace =
    activeWorkspace?.type === 'personal' ||
    activeMembership?.role === 'owner' ||
    activeMembership?.role === 'member'
  const canManageWorkspace =
    activeWorkspace?.type === 'personal' || activeMembership?.role === 'owner'
  const transactions = useTransactions(activeWorkspace?.id)
  const syncSummary = useSyncSummary()
  const activeTransactions = transactions.filter((transaction) => transaction.deleted_at === null)
  const monthTransactions = activeTransactions.filter((transaction) =>
    transaction.occurred_on.startsWith(`${selectedMonth.slice(0, 7)}-`),
  )
  const recentTransactions = [...monthTransactions]
    .sort(
      (left, right) =>
        right.occurred_on.localeCompare(left.occurred_on) ||
        right.created_at.localeCompare(left.created_at),
    )
    .slice(0, 5)
  const metadataDisplayName = session.user.user_metadata['display_name']
  const displayName =
    (typeof metadataDisplayName === 'string' && metadataDisplayName.trim()) ||
    session.user.email ||
    'utilisateur'
  const bootstrapKey = `${session.user.id}:${bootstrapAttempt}`
  const isBootstrapping = bootstrapResult?.key !== bootstrapKey
  const bootstrapError = bootstrapResult?.key === bootstrapKey ? bootstrapResult.error : null
  const visibleSyncError = syncError ?? syncSummary.lastError
  const syncStatusLabel = isSyncing
    ? 'Synchronisation en cours'
    : visibleSyncError || syncSummary.failedCount > 0
      ? 'Échec de la synchronisation'
      : syncSummary.pendingCount > 0
        ? `${syncSummary.pendingCount} en attente`
        : !isOnline
          ? 'Hors ligne'
          : null
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('fr-FR'))
    .join('')
  const invitationToken = new URLSearchParams(window.location.hash.slice(1)).get('invite')
  const currentMonth = monthKeyForDate(new Date())

  useEffect(() => {
    function restoreSelectedMonthFromHistory() {
      setSelectedMonth(selectedMonthFromLocation())
    }
    window.addEventListener('popstate', restoreSelectedMonthFromHistory)
    return () => window.removeEventListener('popstate', restoreSelectedMonthFromHistory)
  }, [])

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const useDarkTheme =
        themePreference === 'dark' || (themePreference === 'system' && systemTheme.matches)
      document.documentElement.classList.toggle('dark', useDarkTheme)
    }

    applyTheme()
    window.localStorage.setItem('cashFlow.theme', themePreference)
    if (themePreference === 'system') {
      systemTheme.addEventListener('change', applyTheme)
    }

    return () => systemTheme.removeEventListener('change', applyTheme)
  }, [themePreference])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('mois') === selectedMonth.slice(0, 7)) return
    url.searchParams.set('mois', selectedMonth.slice(0, 7))
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [selectedMonth])

  useEffect(() => {
    function updateNetworkStatus() {
      setIsOnline(navigator.onLine)
      if (navigator.onLine) {
        setBootstrapAttempt((attempt) => attempt + 1)
      }
    }

    window.addEventListener('online', updateNetworkStatus)
    window.addEventListener('offline', updateNetworkStatus)

    return () => {
      window.removeEventListener('online', updateNetworkStatus)
      window.removeEventListener('offline', updateNetworkStatus)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    if (!isOnline) {
      bootstrapAbortController.current = null
      void db.workspaces
        .count()
        .then((workspaceCount) => {
          if (isMounted) {
            setBootstrapResult({
              key: bootstrapKey,
              error:
                workspaceCount > 0
                  ? null
                  : 'La première récupération des données nécessite une connexion Internet.',
            })
          }
        })
        .catch((bootstrapFailure: unknown) => {
          if (isMounted) {
            const message =
              bootstrapFailure instanceof Error ? bootstrapFailure.message : 'Erreur inconnue.'
            setBootstrapResult({
              key: bootstrapKey,
              error: `La base locale ne peut pas être lue. ${message}`,
            })
          }
        })

      return () => {
        isMounted = false
      }
    }

    const abortController = new AbortController()
    bootstrapAbortController.current = abortController

    void bootstrapFromSupabase(client, session.user.id, abortController.signal)
      .then(() => {
        if (isMounted) {
          setBootstrapResult({ key: bootstrapKey, error: null })
        }
      })
      .catch((bootstrapFailure: unknown) => {
        if (!isMounted) {
          return
        }
        if (bootstrapFailure instanceof DOMException && bootstrapFailure.name === 'AbortError') {
          setBootstrapResult({
            key: bootstrapKey,
            error: 'Le chargement initial a été interrompu. Tu peux le relancer.',
          })
          return
        }
        const message =
          bootstrapFailure instanceof Error ? bootstrapFailure.message : 'Erreur inconnue.'
        setBootstrapResult({
          key: bootstrapKey,
          error: `Le chargement initial des données est impossible. Les données déjà enregistrées localement sont conservées. ${message}`,
        })
      })

    return () => {
      isMounted = false
      abortController.abort()
      if (bootstrapAbortController.current === abortController) {
        bootstrapAbortController.current = null
      }
    }
  }, [bootstrapAttempt, bootstrapKey, client, isOnline, session.user.id])

  useEffect(() => {
    if (!isOnline || isBootstrapping || bootstrapError) {
      return
    }

    let isMounted = true
    let isRunning = false
    const abortController = new AbortController()
    syncAbortController.current = abortController
    const syncEngine = createSupabaseSyncEngine(client, session.user.id)

    function synchronize() {
      if (
        isRunning ||
        abortController.signal.aborted ||
        !navigator.onLine ||
        document.visibilityState === 'hidden'
      ) {
        return
      }

      isRunning = true
      setIsSyncing(true)
      setSyncError(null)
      void syncEngine
        .synchronize(abortController.signal)
        .catch((failure: unknown) => {
          if (!isMounted || abortController.signal.aborted) {
            return
          }
          const message =
            failure instanceof Error ? failure.message : 'Erreur inconnue de synchronisation.'
          setSyncError(message)
        })
        .finally(() => {
          isRunning = false
          if (isMounted) {
            setIsSyncing(false)
          }
        })
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        synchronize()
      }
    }

    synchronize()
    const intervalId = window.setInterval(synchronize, 60_000)
    window.addEventListener('online', synchronize)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      abortController.abort()
      if (syncAbortController.current === abortController) {
        syncAbortController.current = null
      }
      window.clearInterval(intervalId)
      window.removeEventListener('online', synchronize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [bootstrapError, client, isBootstrapping, isOnline, session.user.id, syncAttempt])

  async function retrySynchronization() {
    setSyncError(null)
    try {
      await retryFailedSyncOperations()
      setSyncAttempt((attempt) => attempt + 1)
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : 'Erreur inconnue de synchronisation.'
      setSyncError(`Impossible de relancer la file locale. ${message}`)
    }
  }

  async function requestPasswordReset() {
    const email = session.user.email
    setSettingsMessage(null)
    if (!isOnline) {
      setSettingsMessage({
        type: 'error',
        text: 'Une connexion Internet est nécessaire pour demander le lien de modification.',
      })
      return
    }
    if (!email) {
      setSettingsMessage({
        type: 'error',
        text: 'Aucune adresse e-mail n’est associée à ce compte.',
      })
      return
    }

    setIsSendingPasswordReset(true)
    try {
      const { error: resetError } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: getApplicationUrl(),
      })
      if (resetError) {
        setSettingsMessage({ type: 'error', text: authErrorMessage(resetError.message) })
      } else {
        setSettingsMessage({
          type: 'notice',
          text: 'Un lien pour modifier ton mot de passe a été envoyé à ton adresse e-mail.',
        })
      }
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : 'Erreur inconnue de réinitialisation.'
      setSettingsMessage({
        type: 'error',
        text: `Impossible de demander le lien de modification. ${message}`,
      })
    } finally {
      setIsSendingPasswordReset(false)
    }
  }

  async function signOut() {
    setError(null)
    setIsSigningOut(true)
    try {
      bootstrapAbortController.current?.abort()
      syncAbortController.current?.abort()
      await clearLocalData()
      const { error: signOutError } = await client.auth.signOut()
      if (signOutError) {
        setError(authErrorMessage(signOutError.message))
      }
    } catch {
      setError('La déconnexion a échoué ou les données locales n’ont pas pu être effacées.')
    } finally {
      setIsSigningOut(false)
    }
  }

  const activeDetails = sectionDetails[activeSection === 'home' ? 'transactions' : activeSection]
  const addTransaction = () => {
    if (!canEditWorkspace) return
    setActiveSection('transactions')
    setIsQuickEntryOpen(true)
  }

  function selectWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId)
    setIsQuickEntryOpen(false)
    window.localStorage.setItem(`cashFlow.activeWorkspace.${session.user.id}`, workspaceId)
  }

  function changeMonth(month: string) {
    setSelectedMonth(month)
    const url = new URL(window.location.href)
    url.searchParams.set('mois', month.slice(0, 7))
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function clearInvitationToken() {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  }

  function cancelInvitation() {
    clearInvitationToken()
    setActiveSection('home')
  }

  function handleInvitationAccepted(workspaceId: string) {
    clearInvitationToken()
    selectWorkspace(workspaceId)
    setActiveSection('home')
    setBootstrapAttempt((attempt) => attempt + 1)
  }

  if (invitationToken !== null) {
    return (
      <InvitationAcceptance
        client={client}
        isOnline={isOnline}
        onAccepted={handleInvitationAccepted}
        onCancel={cancelInvitation}
        token={invitationToken}
      />
    )
  }

  function renderNavigationItem(item: { id: AppSection; label: string; icon: LucideIcon }) {
    const Icon = item.icon
    const isActive = activeSection === item.id

    return (
      <button
        aria-current={isActive ? 'page' : undefined}
        className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 ${
          isActive
            ? 'bg-emerald-50 text-emerald-900'
            : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'
        }`}
        key={item.id}
        onClick={() => setActiveSection(item.id)}
        type="button"
      >
        <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
        {item.label}
      </button>
    )
  }

  return (
    <div className="min-h-svh bg-stone-50 text-stone-950 md:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-stone-200 bg-white px-4 py-6 md:flex">
        <a
          className="mb-9 flex items-center gap-3 px-3"
          href={import.meta.env.BASE_URL}
          aria-label="cashFlow+, accueil"
        >
          <img
            alt=""
            className="size-10 rounded-xl"
            src={`${import.meta.env.BASE_URL}budget-app-icon.svg`}
          />
          <span className="text-lg font-bold tracking-tight">cashFlow+</span>
        </a>

        <div className="mb-7 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Espace actif</p>
          <select
            aria-label="Choisir l’espace actif"
            className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-2 font-semibold"
            onChange={(event) => selectWorkspace(event.target.value)}
            value={activeWorkspace?.id ?? ''}
          >
            {availableWorkspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>

        <nav aria-label="Navigation principale" className="grid gap-1">
          {navigation.map(renderNavigationItem)}
          <button
            className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium text-stone-400"
            disabled
            title="Les forfaits seront disponibles dans le lot R5."
            type="button"
          >
            <RefreshCw aria-hidden="true" size={20} strokeWidth={1.8} />
            Forfaits
          </button>
        </nav>

        <div className="mt-6">
          <p className="mb-2 px-4 text-xs font-medium uppercase tracking-wide text-stone-500">
            Espace
          </p>
          <nav aria-label="Navigation de l’espace" className="grid gap-1">
            {renderNavigationItem({
              id: 'spaces',
              label: 'Membres et invitations',
              icon: UsersRound,
            })}
            {renderNavigationItem({
              id: 'workspace-settings',
              label: 'Réglages de l’espace',
              icon: Settings2,
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-stone-200 pt-5">
          <p className="truncate px-3 text-xs text-stone-500">
            {activeWorkspace?.name ?? 'Aucun espace sélectionné'}
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-stone-200 bg-white/95 px-4 backdrop-blur sm:px-8 md:px-10">
          <div className="min-w-0 md:hidden">
            <label className="sr-only" htmlFor="active-workspace-mobile">
              Choisir l’espace actif
            </label>
            <select
              className="min-h-11 max-w-[55vw] truncate rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold"
              id="active-workspace-mobile"
              onChange={(event) => selectWorkspace(event.target.value)}
              value={activeWorkspace?.id ?? ''}
            >
              {availableWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {syncStatusLabel && (
              <span
                aria-label={syncStatusLabel}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${
                  syncSummary.failedCount > 0 || visibleSyncError
                    ? 'bg-red-50 text-red-800'
                    : !isOnline
                      ? 'bg-amber-50 text-amber-900'
                      : 'bg-stone-100 text-stone-700'
                }`}
                role="status"
                title={syncStatusLabel}
              >
                {!isOnline ? (
                  <WifiOff aria-hidden="true" size={14} />
                ) : (
                  <RefreshCw aria-hidden="true" size={14} />
                )}
                <span className="hidden sm:inline">{syncStatusLabel}</span>
              </span>
            )}
            <details className="relative">
              <summary
                aria-label={`Profil de ${displayName}`}
                className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-950 outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-800"
              >
                {initials || <UserRound aria-hidden="true" size={20} />}
              </summary>
              <div className="absolute right-0 top-14 z-40 w-64 rounded-2xl border border-stone-200 bg-white p-2 shadow-lg">
                <div className="border-b border-stone-100 px-3 py-2">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-stone-500">{session.user.email}</p>
                </div>
                <button
                  className="mt-1 min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-emerald-800"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    setActiveSection('profile')
                  }}
                  type="button"
                >
                  Mon profil
                </button>
                <button
                  className="min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-emerald-800"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    setActiveSection('settings')
                  }}
                  type="button"
                >
                  Réglages de l’application
                </button>
                <button
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-800 disabled:opacity-50"
                  disabled={isSigningOut}
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    void signOut()
                  }}
                  type="button"
                >
                  <LogOut aria-hidden="true" size={17} />
                  {isSigningOut ? 'Déconnexion…' : 'Se déconnecter'}
                </button>
              </div>
            </details>
            <Button
              aria-label="Ajouter une transaction"
              className="hidden min-h-11 rounded-xl bg-emerald-800 px-4 text-white hover:bg-emerald-900 md:inline-flex"
              onClick={addTransaction}
            >
              <CirclePlus aria-hidden="true" size={18} />
              Ajouter
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-7 sm:px-8 sm:pt-10 md:px-10 md:pb-12">
          {error && (
            <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          {isBootstrapping && (
            <p
              className="mb-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              role="status"
            >
              Chargement initial des données depuis ton espace…
            </p>
          )}
          {bootstrapError && (
            <div
              className="mb-6 flex flex-col gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <p>{bootstrapError}</p>
              <Button
                className="min-h-12 shrink-0"
                onClick={() => setBootstrapAttempt((attempt) => attempt + 1)}
                variant="outline"
              >
                Réessayer
              </Button>
            </div>
          )}
          {visibleSyncError && (
            <div
              className="mb-6 flex flex-col gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <p>
                Synchronisation interrompue : {visibleSyncError}
                {syncSummary.pendingCount + syncSummary.failedCount > 0 &&
                  ` ${syncSummary.pendingCount + syncSummary.failedCount} opération(s) locale(s) restent dans la file.`}
              </p>
              <Button
                className="min-h-12 shrink-0"
                onClick={() => void retrySynchronization()}
                variant="outline"
              >
                Réessayer
              </Button>
            </div>
          )}
          <nav
            aria-label="Sélection du mois"
            className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2"
          >
            <Button
              aria-label="Mois précédent"
              className="min-h-11 min-w-11"
              onClick={() => changeMonth(shiftMonth(selectedMonth, -1))}
              size="icon"
              variant="outline"
            >
              <ArrowLeft aria-hidden="true" size={18} />
            </Button>
            <p aria-live="polite" className="text-center font-semibold">
              {formatMonth(selectedMonth)}
            </p>
            <Button
              aria-label="Mois suivant"
              className="min-h-11 min-w-11"
              disabled={selectedMonth >= currentMonth}
              onClick={() => changeMonth(shiftMonth(selectedMonth, 1))}
              size="icon"
              variant="outline"
            >
              <ArrowRight aria-hidden="true" size={18} />
            </Button>
          </nav>
          {activeSection === 'home' ? (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Vue du mois</h1>
                <p className="mt-1 text-sm text-stone-600">
                  {activeWorkspace?.type === 'shared' ? 'Espace partagé' : 'Espace personnel'}
                </p>
              </div>

              <section
                aria-label="Aperçu du budget"
                className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]"
              >
                <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>Transactions</CardTitle>
                        <CardDescription>
                          Les opérations de ton espace, à jour sur cet appareil.
                        </CardDescription>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
                        {activeWorkspace?.type === 'shared' ? 'Partagé' : 'Perso'}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-4xl font-bold tracking-tight text-emerald-950">
                      {activeTransactions.length}
                    </p>
                    <p className="text-sm text-stone-600">
                      {activeTransactions.length === 1 ? 'transaction' : 'transactions'} enregistrée
                      {activeTransactions.length === 1 ? '' : 's'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button className="min-h-11" onClick={addTransaction} variant="default">
                        <CirclePlus aria-hidden="true" size={18} />
                        Ajouter
                      </Button>
                      <Button
                        className="min-h-11"
                        onClick={() => setActiveSection('budgets')}
                        variant="outline"
                      >
                        Budgets
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                  <CardHeader>
                    <CardTitle>Ce mois</CardTitle>
                    <CardDescription>Le point clé pour savoir où tu en es.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recentTransactions.length === 0 ? (
                      <p className="text-sm text-stone-500">Aucune transaction récente.</p>
                    ) : (
                      recentTransactions.slice(0, 3).map((transaction) => (
                        <div
                          className="flex items-center justify-between gap-3 text-sm"
                          key={transaction.id}
                        >
                          <span className="truncate text-stone-600">
                            {transaction.kind === 'expense'
                              ? 'Dépense'
                              : transaction.kind === 'refund'
                                ? 'Remboursement'
                                : transaction.kind === 'income'
                                  ? 'Revenu'
                                  : 'Ajustement'}
                          </span>
                          <span className="shrink-0 font-semibold">
                            {transaction.kind === 'expense'
                              ? '−'
                              : transaction.kind === 'income' || transaction.kind === 'refund'
                                ? '+'
                                : ''}
                            {formatMoney(transaction.amount)}
                          </span>
                        </div>
                      ))
                    )}
                    <Button
                      className="mt-2 min-h-11 w-full"
                      onClick={() => setActiveSection('transactions')}
                      variant="outline"
                    >
                      Voir les transactions
                    </Button>
                  </CardContent>
                </Card>
              </section>

              <BudgetDashboard
                canManageBudget={canManageWorkspace}
                key={`${activeWorkspace?.id}:${selectedMonth}`}
                month={selectedMonth}
                mode="home"
                onOpenBudgets={() => setActiveSection('budgets')}
                workspaceId={activeWorkspace?.id}
              />
            </>
          ) : activeSection === 'transactions' ? (
            <LocalDataView
              canEdit={canEditWorkspace}
              isSharedWorkspace={activeWorkspace?.type === 'shared'}
              isQuickEntryOpen={isQuickEntryOpen}
              key={activeWorkspace?.id}
              month={selectedMonth}
              onQuickEntryOpenChange={setIsQuickEntryOpen}
              profiles={profiles}
              userId={session.user.id}
              workspaceId={activeWorkspace?.id}
            />
          ) : activeSection === 'budgets' ? (
            <BudgetDashboard
              canManageBudget={canManageWorkspace}
              key={`${activeWorkspace?.id}:${selectedMonth}`}
              month={selectedMonth}
              mode="manage"
              workspaceId={activeWorkspace?.id}
            />
          ) : activeSection === 'spaces' ? (
            <WorkspaceManagement
              client={client}
              invitations={invitations}
              isOnline={isOnline}
              key={activeWorkspace?.id}
              memberships={memberships}
              onRefresh={(workspaceId) => {
                if (workspaceId) selectWorkspace(workspaceId)
                setBootstrapAttempt((attempt) => attempt + 1)
              }}
              profiles={profiles}
              userId={session.user.id}
              workspace={activeWorkspace}
            />
          ) : activeSection === 'workspace-settings' ? (
            <WorkspaceSettings
              client={client}
              fallbackWorkspaceId={fallbackWorkspaceId}
              isOnline={isOnline}
              key={`${activeWorkspace?.id}:${activeWorkspace?.name}`}
              memberships={memberships}
              onRefresh={(workspaceId) => {
                if (workspaceId) selectWorkspace(workspaceId)
                setBootstrapAttempt((attempt) => attempt + 1)
              }}
              userId={session.user.id}
              workspace={activeWorkspace}
            />
          ) : activeSection === 'profile' ? (
            <section aria-labelledby="section-title" className="max-w-3xl space-y-5">
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" id="section-title">
                  Mon profil
                </h1>
                <p className="mt-2 leading-7 text-stone-600">
                  Ton identité de compte, distincte des réglages de cet espace.
                </p>
              </div>
              <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                <CardHeader>
                  <CardTitle>Informations du compte</CardTitle>
                  <CardDescription>Ces informations sont associées à ta connexion.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className="flex size-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-semibold text-emerald-950"
                    >
                      {initials || <UserRound size={24} />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{displayName}</p>
                      <p className="truncate text-sm text-stone-600">{session.user.email}</p>
                    </div>
                  </div>
                  <dl className="grid gap-3 border-t border-stone-100 pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-stone-500">Espace actif</dt>
                      <dd className="mt-1 font-medium">
                        {activeWorkspace?.name ?? 'Aucun espace'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-stone-500">Rôle dans cet espace</dt>
                      <dd className="mt-1 font-medium">
                        {activeWorkspace?.type === 'personal'
                          ? 'Propriétaire'
                          : activeMembership?.role === 'owner'
                            ? 'Propriétaire'
                            : activeMembership?.role === 'member'
                              ? 'Membre'
                              : activeMembership?.role === 'viewer'
                                ? 'Lecture seule'
                                : 'Non membre'}
                      </dd>
                    </div>
                  </dl>
                  <Button
                    className="min-h-11"
                    onClick={() => setActiveSection('settings')}
                    variant="outline"
                  >
                    Réglages de l’application
                  </Button>
                </CardContent>
              </Card>
            </section>
          ) : activeSection === 'plus' ? (
            <section aria-labelledby="section-title" className="max-w-4xl space-y-5">
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" id="section-title">
                  Plus
                </h1>
                <p className="mt-2 leading-7 text-stone-600">{sectionDetails.plus.description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  className="min-h-16 justify-between text-left"
                  onClick={() => setActiveSection('budgets')}
                  variant="outline"
                >
                  Budgets et seuils par catégorie
                  <ChartNoAxesColumn aria-hidden="true" size={18} />
                </Button>
                <Button
                  className="min-h-16 justify-between text-left"
                  onClick={() => setActiveSection('spaces')}
                  variant="outline"
                >
                  Membres et invitations
                  <UsersRound aria-hidden="true" size={18} />
                </Button>
                <Button
                  className="min-h-16 justify-between text-left"
                  onClick={() => setActiveSection('workspace-settings')}
                  variant="outline"
                >
                  Réglages de l’espace
                  <UsersRound aria-hidden="true" size={18} />
                </Button>
                <Button
                  className="min-h-16 justify-between text-left"
                  disabled
                  title="Disponible dans le lot R5"
                  variant="outline"
                >
                  Forfaits · bientôt disponibles
                  <RefreshCw aria-hidden="true" size={18} />
                </Button>
              </div>
            </section>
          ) : (
            <section aria-labelledby="section-title" className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" id="section-title">
                  {activeDetails.title}
                </h1>
                <p className="mt-2 leading-7 text-stone-600">{activeDetails.description}</p>
              </div>

              {settingsMessage && (
                <p
                  className={`rounded-xl px-4 py-3 text-sm ${
                    settingsMessage.type === 'error'
                      ? 'bg-red-50 text-red-800'
                      : 'bg-emerald-50 text-emerald-900'
                  }`}
                  role={settingsMessage.type === 'error' ? 'alert' : 'status'}
                >
                  {settingsMessage.text}
                </p>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                  <CardHeader>
                    <CardTitle>Préférences d’affichage</CardTitle>
                    <CardDescription>Le choix est conservé sur cet appareil.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="theme-preference">
                        Thème
                      </label>
                      <select
                        className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3"
                        id="theme-preference"
                        onChange={(event) => {
                          const preference = event.target.value
                          if (
                            preference === 'system' ||
                            preference === 'light' ||
                            preference === 'dark'
                          ) {
                            setThemePreference(preference)
                          }
                        }}
                        value={themePreference}
                      >
                        <option value="system">Selon l’appareil</option>
                        <option value="light">Clair</option>
                        <option value="dark">Sombre</option>
                      </select>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">Langue</p>
                      <p className="text-stone-600">Français (seule langue disponible)</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                  <CardHeader>
                    <CardTitle>Mot de passe</CardTitle>
                    <CardDescription>
                      Reçois un lien sécurisé pour définir un nouveau mot de passe.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="min-h-11"
                      disabled={!isOnline || !session.user.email || isSendingPasswordReset}
                      onClick={() => void requestPasswordReset()}
                    >
                      {isSendingPasswordReset ? 'Envoi…' : 'Envoyer le lien de modification'}
                    </Button>
                    {!isOnline && (
                      <p className="mt-2 text-sm text-amber-800">
                        Connecte-toi à Internet pour demander ce lien.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                  <CardHeader>
                    <CardTitle>À propos</CardTitle>
                    <CardDescription>
                      cashFlow+ · gestion du budget mensuel par espace.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-stone-600">
                    <p>Les montants sont affichés en ariary (Ar).</p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                  <CardHeader>
                    <CardTitle>État de connexion</CardTitle>
                    <CardDescription>Réseau et synchronisation sur cet appareil.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-stone-600">
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
                      <span className="font-medium text-stone-800">Réseau</span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          isOnline ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
                        }`}
                      >
                        {isOnline ? (
                          <Wifi aria-hidden="true" size={12} />
                        ) : (
                          <WifiOff aria-hidden="true" size={12} />
                        )}
                        {isOnline ? 'En ligne' : 'Hors-ligne'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
                      <span className="font-medium text-stone-800">Synchronisation</span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700">
                        <RefreshCw
                          aria-hidden="true"
                          className={isSyncing ? 'animate-spin' : undefined}
                          size={12}
                        />
                        {isSyncing
                          ? 'Sync…'
                          : syncSummary.failedCount > 0
                            ? 'Échec'
                            : syncSummary.pendingCount > 0
                              ? `${syncSummary.pendingCount} en attente`
                              : syncSummary.lastSuccessfulSync
                                ? 'À jour'
                                : 'À synchroniser'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}
        </main>
      </div>

      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-stretch border-t border-stone-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur md:hidden"
      >
        {mobileNavigation.slice(0, 2).map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <button
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-emerald-800 ${
                isActive ? 'bg-emerald-50 text-emerald-900' : 'text-stone-500'
              }`}
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              <span className="max-w-full truncate px-0.5">{item.label}</span>
            </button>
          )
        })}
        <button
          aria-label="Ajouter une transaction"
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-emerald-900 focus-visible:outline-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canEditWorkspace}
          onClick={addTransaction}
          title={!canEditWorkspace ? 'Accès en lecture seule' : undefined}
          type="button"
        >
          <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-800 text-white">
            <CirclePlus aria-hidden="true" size={20} />
          </span>
          <span>Ajouter</span>
        </button>
        {mobileNavigation.slice(2).map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <button
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-emerald-800 ${
                isActive ? 'bg-emerald-50 text-emerald-900' : 'text-stone-500'
              }`}
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              <span className="max-w-full truncate px-0.5">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLinkError] = useState(getAuthLinkError)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      return
    }

    let isMounted = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (isMounted) {
        setSession(nextSession)
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true)
        } else if (event === 'SIGNED_OUT') {
          setIsPasswordRecovery(false)
        }
        setIsLoading(false)
        setSessionError(null)
      }
    })

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (isMounted) {
          setSession(data.session)
          setSessionError(error ? authErrorMessage(error.message) : null)
          setIsLoading(false)
          if (authLinkError && window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setSessionError('La session ne peut pas être vérifiée. Recharge la page puis réessaie.')
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [authLinkError])

  if (!supabase) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-stone-50 px-5 py-10 text-stone-900">
        <section className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-7 shadow-sm">
          <h1 className="text-2xl font-bold">Configuration Supabase nécessaire</h1>
          <p className="mt-3 leading-7 text-stone-600">
            Renseigne <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>{' '}
            dans <code>.env.local</code>, puis relance le serveur de développement.
          </p>
        </section>
      </main>
    )
  }

  if (isLoading) {
    return (
      <main
        aria-label="Chargement de la session"
        className="flex min-h-svh items-center justify-center bg-stone-50 px-5"
      >
        <div className="h-32 w-full max-w-md animate-pulse rounded-3xl bg-stone-200" />
      </main>
    )
  }

  if (sessionError && !session) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-stone-50 px-5 py-10">
        <p className="max-w-md rounded-xl bg-red-50 px-5 py-4 text-sm text-red-800" role="alert">
          {sessionError}
        </p>
      </main>
    )
  }

  if (isPasswordRecovery && session) {
    return (
      <AuthForm
        client={supabase}
        initialMode="update-password"
        onRecoveryComplete={() => setIsPasswordRecovery(false)}
      />
    )
  }

  return session ? (
    <SignedInView client={supabase} session={session} />
  ) : (
    <AuthForm client={supabase} initialError={authLinkError} />
  )
}
