import { describe, expect, it } from 'vitest'
import type { Transaction } from './models'
import { buildTransactionCsv, transactionCsvFilename } from './transaction-export'

const memberId = '14e06ce8-9cf7-4d68-9df4-3eea34655c28'
const categoryId = '8ac67042-51c9-4ed2-93de-9ced9b714e3d'

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    workspace_id: '74d4d0a1-2088-4071-b85d-74d7cb7620b6',
    category_id: categoryId,
    kind: 'expense',
    amount: 1250,
    occurred_on: '2026-11-07',
    note: 'Marché',
    created_by: memberId,
    updated_by: memberId,
    paid_by: memberId,
    recurring_id: null,
    recurring_month: null,
    created_at: '2026-11-07T10:00:00.000Z',
    updated_at: '2026-11-07T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

const labels = {
  categoryNames: new Map([[categoryId, 'Alimentation']]),
  memberNames: new Map([[memberId, 'Laro']]),
}

describe('transaction CSV export', () => {
  it('exports readable headers and signed ariary values without internal identifiers', () => {
    const transactions = [
      transaction({ kind: 'expense', amount: 1250 }),
      transaction({ id: '00000000-0000-4000-8000-000000000002', kind: 'refund', amount: 250 }),
      transaction({ id: '00000000-0000-4000-8000-000000000003', kind: 'income', amount: 3000 }),
      transaction({
        id: '00000000-0000-4000-8000-000000000004',
        kind: 'adjustment',
        amount: -100,
        category_id: null,
      }),
    ]

    const csv = buildTransactionCsv(transactions, labels)

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Date";"Type";"Montant (Ar)";"Catégorie";"Note"')
    expect(csv).toContain('"2026-11-07";"Dépense";"-1250"')
    expect(csv).toContain('"2026-11-07";"Remboursement";"250"')
    expect(csv).toContain('"2026-11-07";"Revenu";"3000"')
    expect(csv).toContain('"2026-11-07";"Ajustement";"-100"')
    expect(csv).not.toContain('00000000-0000-4000-8000')
    expect(csv).not.toContain('74d4d0a1-2088-4071-b85d-74d7cb7620b6')
  })

  it('quotes CSV metacharacters and prevents spreadsheet formula execution in text fields', () => {
    const csv = buildTransactionCsv(
      [
        transaction({
          note: '=HYPERLINK("https://example.invalid","ouvrir");\nligne',
        }),
      ],
      {
        categoryNames: new Map([[categoryId, 'Catégorie; spéciale']]),
        memberNames: new Map([[memberId, '+Nom dangereux']]),
      },
    )

    expect(csv).toContain('"Catégorie; spéciale"')
    expect(csv).toContain('"\'+Nom dangereux"')
    expect(csv).toContain('"\u0027=HYPERLINK(""https://example.invalid"",""ouvrir"");\nligne"')
  })

  it('marks recurring transactions and uses a safe date-based filename', () => {
    const csv = buildTransactionCsv(
      [transaction({ recurring_id: '8c4e5b00-4e90-4ef1-a8ce-12c23a182c2a' })],
      labels,
    )

    expect(csv).toContain('"Forfait"')
    expect(transactionCsvFilename('2026-11-01', '2026-11-30')).toBe(
      'cashflowplus_transactions_2026-11-01_2026-11-30.csv',
    )
  })

  it('exports an empty document with headers when there are no matching transactions', () => {
    expect(buildTransactionCsv([], labels)).toBe(
      '\uFEFF"Date";"Type";"Montant (Ar)";"Catégorie";"Note";"Responsable";"Saisi par";"Origine"\r\n',
    )
  })
})
