import type { Transaction } from './models'

export interface TransactionCsvLabels {
  categoryNames: ReadonlyMap<string, string>
  memberNames: ReadonlyMap<string, string>
}

const csvHeaders = [
  'Date',
  'Type',
  'Montant (Ar)',
  'Catégorie',
  'Note',
  'Responsable',
  'Saisi par',
  'Origine',
]

function protectSpreadsheetText(value: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value
}

function csvCell(value: string | number): string {
  const text = typeof value === 'string' ? protectSpreadsheetText(value) : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function transactionKindLabel(kind: Transaction['kind']): string {
  switch (kind) {
    case 'expense':
      return 'Dépense'
    case 'refund':
      return 'Remboursement'
    case 'income':
      return 'Revenu'
    case 'adjustment':
      return 'Ajustement'
  }
}

function signedAmount(transaction: Transaction): number {
  switch (transaction.kind) {
    case 'expense':
      return -transaction.amount
    case 'refund':
    case 'income':
    case 'adjustment':
      return transaction.amount
  }
}

export function buildTransactionCsv(
  transactions: Transaction[],
  labels: TransactionCsvLabels,
): string {
  const rows = transactions.map((transaction) => [
    transaction.occurred_on,
    transactionKindLabel(transaction.kind),
    signedAmount(transaction),
    transaction.category_id ? (labels.categoryNames.get(transaction.category_id) ?? '') : '',
    transaction.note ?? '',
    labels.memberNames.get(transaction.paid_by) ?? 'Membre',
    labels.memberNames.get(transaction.created_by) ?? 'Membre',
    transaction.recurring_id ? 'Forfait' : 'Manuelle',
  ])
  return `\uFEFF${[csvHeaders, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`
}

export function transactionCsvFilename(startDate: string, endDate: string): string {
  return `cashflowplus_transactions_${startDate}_${endDate}.csv`
}

export function downloadCsvFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
