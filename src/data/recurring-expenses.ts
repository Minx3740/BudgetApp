import type { SupabaseClient } from '@supabase/supabase-js'
import { recurringExpenseSchema, type RecurringExpense } from './models'

export interface RecurringExpenseInput {
  workspace_id: string
  label: string
  amount: number
  category_id: string | null
  day_of_month: number
  start_month: string
}

export interface RecurringExpenseChanges {
  label: string
  amount: number
  category_id: string | null
  day_of_month: number
}

function parseRpcRow(data: unknown, action: string): RecurringExpense {
  const result = recurringExpenseSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`Le serveur a renvoyé un forfait invalide après ${action}.`)
  }
  return result.data
}

function throwRpcError(action: string, error: { code?: string; message: string }): never {
  if (error.code === '40001') {
    throw new Error('Ce forfait a été modifié, recharge la page.')
  }
  throw new Error(`Impossible de ${action}. ${error.message}`)
}

export async function createRecurringExpense(
  client: SupabaseClient,
  input: RecurringExpenseInput,
): Promise<RecurringExpense> {
  const { data, error } = await client.rpc('create_recurring_expense', {
    p_workspace_id: input.workspace_id,
    p_label: input.label,
    p_amount: input.amount,
    p_category_id: input.category_id,
    p_day_of_month: input.day_of_month,
    p_start_month: input.start_month,
  })
  if (error) throwRpcError('créer le forfait', error)
  return parseRpcRow(data, 'création')
}

export async function replaceRecurringExpenseFromMonth(
  client: SupabaseClient,
  id: string,
  expectedVersion: number,
  effectiveMonth: string,
  changes: RecurringExpenseChanges,
): Promise<RecurringExpense> {
  const { data, error } = await client.rpc('replace_recurring_expense_from_month', {
    p_id: id,
    p_expected_version: expectedVersion,
    p_effective_month: effectiveMonth,
    p_label: changes.label,
    p_amount: changes.amount,
    p_category_id: changes.category_id,
    p_day_of_month: changes.day_of_month,
  })
  if (error) throwRpcError('modifier le forfait', error)
  return parseRpcRow(data, 'modification')
}

export async function stopRecurringExpense(
  client: SupabaseClient,
  id: string,
  expectedVersion: number,
): Promise<RecurringExpense> {
  const { data, error } = await client.rpc('stop_recurring_expense', {
    p_id: id,
    p_expected_version: expectedVersion,
  })
  if (error) throwRpcError('arrêter le forfait', error)
  return parseRpcRow(data, 'arrêt')
}

export async function generateRecurringForMonth(
  client: SupabaseClient,
  workspaceId: string,
  month: string,
): Promise<number> {
  const { data, error } = await client.rpc('generate_recurring_for_month', {
    p_workspace_id: workspaceId,
    p_month: month,
  })
  if (error) throwRpcError('générer les dépenses fixes', error)
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
    throw new Error('Le serveur a renvoyé un nombre invalide de dépenses générées.')
  }
  return data
}

export function countRecurringMonths(startMonth: string, throughMonth: string): number {
  const [startYear, startNumber] = startMonth.split('-').map(Number)
  const [throughYear, throughNumber] = throughMonth.split('-').map(Number)
  if (!startYear || !startNumber || !throughYear || !throughNumber || startMonth > throughMonth) {
    return 0
  }
  return (throughYear - startYear) * 12 + throughNumber - startNumber + 1
}
