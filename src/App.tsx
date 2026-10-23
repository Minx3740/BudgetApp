import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ChartNoAxesColumn,
  CirclePlus,
  Home,
  LogOut,
  ReceiptText,
  UsersRound,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LocalDataView } from './components/budget/local-data-view'
import { bootstrapFromSupabase } from './data/bootstrap'
import { calculateWorkspaceBalance } from './data/calculations'
import { clearLocalData, db } from './data/database'
import { useAccounts, useTransactions, useWorkspaces } from './data/hooks'
import { supabase } from './lib/supabase'

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'update-password'
type AppSection = 'home' | 'transactions' | 'budgets' | 'spaces'

const navigation: { id: AppSection; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Accueil', icon: Home },
  { id: 'transactions', label: 'Transactions', icon: ReceiptText },
  { id: 'budgets', label: 'Budgets', icon: ChartNoAxesColumn },
  { id: 'spaces', label: 'Espaces', icon: UsersRound },
]

const sectionDetails: Record<
  Exclude<AppSection, 'home'>,
  { title: string; description: string; milestone: string }
> = {
  transactions: {
    title: 'Transactions',
    description: 'Tes dépenses, revenus et transferts apparaîtront ici.',
    milestone: 'La saisie locale arrive au jalon M5.',
  },
  budgets: {
    title: 'Budgets',
    description: 'Retrouve ici tes plafonds mensuels et le reste à dépenser.',
    milestone: 'Les budgets et leur calcul arrivent au jalon M7.',
  },
  spaces: {
    title: 'Espaces',
    description: 'Ton espace personnel est prêt pour la suite.',
    milestone: 'Les espaces partagés et invitations arrivent au jalon M8.',
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

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function AuthForm({
  client,
  initialMode = 'sign-in',
  onRecoveryComplete,
}: {
  client: SupabaseClient
  initialMode?: AuthMode
  onRecoveryComplete?: () => void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setIsSubmitting(true)

    try {
      if (mode === 'forgot-password') {
        const { error: recoveryError } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
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
          options: { data: { display_name: displayName.trim() } },
        })

        if (signUpError) {
          setError(authErrorMessage(signUpError.message))
        } else if (!data.session) {
          setNotice('Vérifie ta boîte mail pour confirmer ton adresse et terminer l’inscription.')
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (signInError) {
          setError(authErrorMessage(signInError.message))
        }
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
  const [error, setError] = useState<string | null>(null)
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const [bootstrapResult, setBootstrapResult] = useState<{
    key: string
    error: string | null
  } | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false)
  const bootstrapAbortController = useRef<AbortController | null>(null)
  const workspaces = useWorkspaces()
  const activeWorkspace =
    workspaces.find(
      (workspace) => workspace.type === 'personal' && workspace.deleted_at === null,
    ) ?? workspaces.find((workspace) => workspace.deleted_at === null)
  const accounts = useAccounts(activeWorkspace?.id)
  const transactions = useTransactions(activeWorkspace?.id)
  const activeTransactions = transactions.filter((transaction) => transaction.deleted_at === null)
  const recentTransactions = [...activeTransactions]
    .sort(
      (left, right) =>
        right.occurred_on.localeCompare(left.occurred_on) ||
        right.created_at.localeCompare(left.created_at),
    )
    .slice(0, 5)
  const currency = activeWorkspace?.currency ?? 'MGA'
  const totalBalance = calculateWorkspaceBalance(accounts, activeTransactions)
  const metadataDisplayName = session.user.user_metadata['display_name']
  const displayName =
    (typeof metadataDisplayName === 'string' && metadataDisplayName.trim()) ||
    session.user.email ||
    'utilisateur'
  const bootstrapKey = `${session.user.id}:${bootstrapAttempt}`
  const isBootstrapping = bootstrapResult?.key !== bootstrapKey
  const bootstrapError = bootstrapResult?.key === bootstrapKey ? bootstrapResult.error : null

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

  async function signOut() {
    setError(null)
    setIsSigningOut(true)
    try {
      bootstrapAbortController.current?.abort()
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
    setActiveSection('transactions')
    setIsQuickEntryOpen(true)
  }

  function renderNavigationItem(item: (typeof navigation)[number]) {
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
        <a className="mb-9 flex items-center gap-3 px-3" href="/" aria-label="cashFlow+, accueil">
          <img alt="" className="size-10 rounded-xl" src="/budget-app-icon.svg" />
          <span className="text-lg font-bold tracking-tight">cashFlow+</span>
        </a>

        <div className="mb-7 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Espace actif</p>
          <p className="mt-1 font-semibold">{activeWorkspace?.name ?? 'Perso'}</p>
        </div>

        <nav aria-label="Navigation principale" className="grid gap-1">
          {navigation.map(renderNavigationItem)}
        </nav>

        <div className="mt-auto border-t border-stone-200 pt-5">
          <p className="truncate px-3 text-sm font-medium">{displayName}</p>
          <Button
            className="mt-2 min-h-12 w-full justify-start px-3"
            disabled={isSigningOut}
            onClick={() => void signOut()}
            variant="ghost"
          >
            <LogOut aria-hidden="true" size={18} />
            {isSigningOut ? 'Déconnexion…' : 'Se déconnecter'}
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur sm:px-8 md:px-10">
          <div className="flex items-center gap-3 md:hidden">
            <img alt="" className="size-9 rounded-xl" src="/budget-app-icon.svg" />
            <span className="font-bold">cashFlow+</span>
          </div>
          <div className="hidden md:block">
            <p className="text-sm text-stone-500">Ton espace personnel</p>
            <p className="font-semibold">{activeWorkspace?.name ?? 'Perso'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${
                isOnline ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
              }`}
              role="status"
            >
              {isOnline ? (
                <Wifi aria-hidden="true" size={15} />
              ) : (
                <WifiOff aria-hidden="true" size={15} />
              )}
              <span>{isOnline ? 'En ligne' : 'Hors-ligne'}</span>
            </span>
            <Button
              className="hidden min-h-12 rounded-xl bg-emerald-800 px-4 text-white hover:bg-emerald-900 sm:inline-flex"
              onClick={addTransaction}
            >
              <CirclePlus aria-hidden="true" size={18} />
              Ajouter
            </Button>
            <Button
              aria-label="Se déconnecter"
              className="min-h-12 min-w-12 md:hidden"
              disabled={isSigningOut}
              onClick={() => void signOut()}
              size="icon"
              variant="ghost"
            >
              <LogOut aria-hidden="true" size={19} />
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
          {activeSection === 'home' ? (
            <>
              <div className="mb-8">
                <p className="mb-2 text-sm font-medium text-emerald-800">Espace personnel</p>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Bonjour, {displayName}
                </h1>
                <p className="mt-3 max-w-2xl leading-7 text-stone-600">
                  Ton espace « {activeWorkspace?.name ?? 'Perso'} » est prêt. Tes comptes et
                  transactions sont enregistrés sur cet appareil.
                </p>
              </div>

              <section aria-label="Aperçu du budget" className="grid gap-4 sm:grid-cols-2">
                <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                  <CardHeader>
                    <CardTitle>Solde total des comptes</CardTitle>
                    <CardDescription>
                      Calculé localement à partir de tes transactions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold tracking-tight">
                      {formatMoney(totalBalance, currency)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                  <CardHeader>
                    <CardTitle>Dernières transactions</CardTitle>
                    <CardDescription>Les mouvements récents de ton espace.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recentTransactions.length === 0 ? (
                      <p className="text-sm text-stone-500">Aucune transaction pour le moment.</p>
                    ) : (
                      recentTransactions.map((transaction) => (
                        <div
                          className="flex items-center justify-between gap-3 text-sm"
                          key={transaction.id}
                        >
                          <span className="truncate text-stone-600">
                            {transaction.kind === 'expense'
                              ? 'Dépense'
                              : transaction.kind === 'income'
                                ? 'Revenu'
                                : 'Transfert'}
                            {' · '}
                            {new Date(`${transaction.occurred_on}T00:00:00`).toLocaleDateString(
                              'fr-FR',
                            )}
                          </span>
                          <span className="shrink-0 font-semibold">
                            {transaction.kind === 'expense'
                              ? '−'
                              : transaction.kind === 'income'
                                ? '+'
                                : ''}
                            {formatMoney(transaction.amount, currency)}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </section>

              <Card className="mt-4 rounded-2xl border-0 bg-emerald-900 text-white shadow-sm">
                <CardContent className="flex flex-col gap-5 py-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Prêt à suivre tes dépenses ?</h2>
                    <p className="mt-1 text-sm text-emerald-100">
                      Ajoute une dépense ou un revenu en quelques secondes, même hors-ligne.
                    </p>
                  </div>
                  <Button
                    className="min-h-12 shrink-0 rounded-xl bg-white px-5 text-emerald-950 hover:bg-emerald-50"
                    onClick={addTransaction}
                    variant="secondary"
                  >
                    <CirclePlus aria-hidden="true" size={18} />
                    Ajouter une transaction
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : activeSection === 'transactions' ? (
            <LocalDataView
              currency={currency}
              isQuickEntryOpen={isQuickEntryOpen}
              onQuickEntryOpenChange={setIsQuickEntryOpen}
              userId={session.user.id}
              workspaceId={activeWorkspace?.id}
            />
          ) : (
            <section aria-labelledby="section-title" className="max-w-3xl">
              <p className="mb-2 text-sm font-medium text-emerald-800">Espace personnel</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" id="section-title">
                {activeDetails.title}
              </h1>
              <Card className="mt-6 rounded-2xl border-0 shadow-sm ring-stone-200">
                <CardHeader>
                  <CardTitle>{activeDetails.description}</CardTitle>
                  <CardDescription>{activeDetails.milestone}</CardDescription>
                </CardHeader>
              </Card>
            </section>
          )}
        </main>
      </div>

      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur md:hidden"
      >
        {navigation.slice(0, 2).map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <button
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-emerald-800 ${
                isActive ? 'text-emerald-900' : 'text-stone-500'
              }`}
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              {item.label}
            </button>
          )
        })}
        <button
          aria-label="Ajouter une transaction"
          className="mx-auto my-1 flex size-12 items-center justify-center self-center rounded-2xl bg-emerald-800 text-white shadow-md transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          onClick={addTransaction}
          type="button"
        >
          <CirclePlus aria-hidden="true" size={23} />
        </button>
        {navigation.slice(2).map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <button
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-emerald-800 ${
                isActive ? 'text-emerald-900' : 'text-stone-500'
              }`}
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
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
  }, [])

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
    <AuthForm client={supabase} />
  )
}
