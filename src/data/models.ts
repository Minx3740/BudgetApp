import { z } from 'zod'

const uuidSchema = z.string().uuid()
const timestampSchema = z.string().datetime({ offset: true })
const moneySchema = z.number().int().safe()
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  })
const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-01$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  })

const syncFields = {
  id: uuidSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deleted_at: timestampSchema.nullable(),
}

export const profileSchema = z.object({
  id: uuidSchema,
  display_name: z.string().max(80),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deleted_at: timestampSchema.nullable(),
})

export const workspaceSchema = z.object({
  ...syncFields,
  name: z.string().trim().min(1).max(80),
  type: z.enum(['personal', 'shared']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  owner_id: uuidSchema,
})

export const membershipSchema = z.object({
  workspace_id: uuidSchema,
  user_id: uuidSchema,
  role: z.enum(['owner', 'member', 'viewer']),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const invitationSchema = z.object({
  ...syncFields,
  workspace_id: uuidSchema,
  token_hash: z.string().regex(/^[0-9a-f]{64}$/),
  role: z.enum(['member', 'viewer']),
  expires_at: timestampSchema,
  max_uses: z.number().int().positive().nullable(),
  used_count: z.number().int().nonnegative(),
  revoked_at: timestampSchema.nullable(),
  created_by: uuidSchema,
})

export const categorySchema = z.object({
  ...syncFields,
  workspace_id: uuidSchema,
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['expense', 'income']),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  archived_at: timestampSchema.nullable(),
})

export const budgetSchema = z.object({
  ...syncFields,
  workspace_id: uuidSchema,
  category_id: uuidSchema,
  month: z
    .string()
    .regex(/^\d{4}-\d{2}-01$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`)
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    }),
  limit_amount: moneySchema.nonnegative(),
})

export const monthlyBudgetSchema = z.object({
  ...syncFields,
  workspace_id: uuidSchema,
  month: monthSchema,
  budget_amount: moneySchema.nonnegative(),
})

export const monthCarryDecisionSchema = z.object({
  ...syncFields,
  workspace_id: uuidSchema,
  month: monthSchema,
  accepted: z.boolean(),
})

export const cashflowTransactionSchema = z
  .object({
    ...syncFields,
    workspace_id: uuidSchema,
    category_id: uuidSchema.nullable(),
    kind: z.enum(['expense', 'refund', 'income', 'adjustment']),
    amount: moneySchema,
    occurred_on: dateSchema,
    note: z.string().nullable(),
    created_by: uuidSchema,
    paid_by: uuidSchema,
  })
  .superRefine((transaction, context) => {
    if (transaction.kind === 'adjustment') {
      if (transaction.amount === 0) {
        context.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'An adjustment amount must not be zero.',
        })
      }
      if (transaction.category_id !== null) {
        context.addIssue({
          code: 'custom',
          path: ['category_id'],
          message: 'An adjustment cannot have a category.',
        })
      }
      return
    }

    if (transaction.amount <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'A transaction amount must be positive.',
      })
    }
    if (transaction.kind === 'income' && transaction.category_id === null) {
      context.addIssue({
        code: 'custom',
        path: ['category_id'],
        message: 'An income must have a category.',
      })
    }
  })

export const transactionSchema = cashflowTransactionSchema

export type Profile = z.infer<typeof profileSchema>
export type Workspace = z.infer<typeof workspaceSchema>
export type Membership = z.infer<typeof membershipSchema>
export type Invitation = z.infer<typeof invitationSchema>
export type Category = z.infer<typeof categorySchema>
export type Transaction = z.infer<typeof cashflowTransactionSchema>
export type Budget = z.infer<typeof budgetSchema>
export type MonthlyBudget = z.infer<typeof monthlyBudgetSchema>
export type MonthCarryDecision = z.infer<typeof monthCarryDecisionSchema>
export type CashflowTransaction = z.infer<typeof cashflowTransactionSchema>

export type EditableTable =
  'categories' | 'transactions' | 'budgets' | 'monthlyBudgets' | 'monthCarryDecisions'

export interface EditableRows {
  categories: Category
  transactions: CashflowTransaction
  budgets: Budget
  monthlyBudgets: MonthlyBudget
  monthCarryDecisions: MonthCarryDecision
}

export const editableRowSchemas: {
  [K in EditableTable]: z.ZodType<EditableRows[K]>
} = {
  categories: categorySchema,
  transactions: cashflowTransactionSchema,
  budgets: budgetSchema,
  monthlyBudgets: monthlyBudgetSchema,
  monthCarryDecisions: monthCarryDecisionSchema,
}
