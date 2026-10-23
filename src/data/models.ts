import { z } from 'zod'

const uuidSchema = z.string().uuid()
const timestampSchema = z.string().datetime({ offset: true })
const moneySchema = z.number().int().safe()

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

export const accountSchema = z.object({
  ...syncFields,
  workspace_id: uuidSchema,
  name: z.string().trim().min(1).max(80),
  type: z.string().trim().min(1).max(40),
  initial_balance: moneySchema,
  archived_at: timestampSchema.nullable(),
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

export const transactionSchema = z
  .object({
    ...syncFields,
    workspace_id: uuidSchema,
    account_id: uuidSchema,
    to_account_id: uuidSchema.nullable(),
    category_id: uuidSchema.nullable(),
    kind: z.enum(['expense', 'income', 'transfer']),
    amount: moneySchema.positive(),
    occurred_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`)
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
      }),
    note: z.string().nullable(),
    created_by: uuidSchema,
  })
  .refine(
    (transaction) =>
      transaction.kind === 'transfer'
        ? transaction.to_account_id !== null &&
          transaction.to_account_id !== transaction.account_id &&
          transaction.category_id === null
        : transaction.to_account_id === null && transaction.category_id !== null,
    { message: 'Transaction fields do not match its kind.' },
  )

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
  limit_amount: moneySchema.positive(),
})

export type Profile = z.infer<typeof profileSchema>
export type Workspace = z.infer<typeof workspaceSchema>
export type Membership = z.infer<typeof membershipSchema>
export type Invitation = z.infer<typeof invitationSchema>
export type Account = z.infer<typeof accountSchema>
export type Category = z.infer<typeof categorySchema>
export type Transaction = z.infer<typeof transactionSchema>
export type Budget = z.infer<typeof budgetSchema>

export type EditableTable = 'accounts' | 'categories' | 'transactions' | 'budgets'

export interface EditableRows {
  accounts: Account
  categories: Category
  transactions: Transaction
  budgets: Budget
}

export const editableRowSchemas: {
  [K in EditableTable]: z.ZodType<EditableRows[K]>
} = {
  accounts: accountSchema,
  categories: categorySchema,
  transactions: transactionSchema,
  budgets: budgetSchema,
}
