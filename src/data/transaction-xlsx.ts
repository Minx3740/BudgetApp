import * as ExcelJS from 'exceljs'
import type { Transaction } from './models'
import { calculateNetExpenseTotals } from './reform-calculations'
import type { TransactionExportModel } from './transaction-export-model'
import type { AgendaDayGroup, AgendaWeekGroup } from './transaction-grouping'
import { transactionXlsxStyles as styles } from './transaction-xlsx-styles'

type XlsxBuffer = Awaited<ReturnType<ExcelJS.Workbook['xlsx']['writeBuffer']>>

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

function excelDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

function categoryColor(categoryColor: string | null): string {
  if (!categoryColor) return styles.categoryColors['var(--category-uncategorized)']
  const mappedColor = Object.entries(styles.categoryColors).find(
    ([token]) => token === categoryColor,
  )
  return mappedColor?.[1] ?? styles.categoryColors['var(--category-uncategorized)']
}

function transactionHeaders(model: TransactionExportModel): string[] {
  return [
    'Date',
    'Jour',
    ...(model.includeTypeColumn ? ['Type'] : []),
    'Catégorie',
    'Note',
    'Responsable',
    ...(model.includeCreatedByColumn ? ['Saisi par'] : []),
    'Montant',
    'Origine',
  ]
}

function columnWidth(header: string): number {
  switch (header) {
    case 'Date':
      return styles.widths.date
    case 'Jour':
      return styles.widths.weekday
    case 'Type':
      return styles.widths.type
    case 'Catégorie':
      return styles.widths.category
    case 'Note':
      return styles.widths.note
    case 'Responsable':
    case 'Saisi par':
      return styles.widths.member
    case 'Montant':
      return styles.widths.amount
    case 'Origine':
      return styles.widths.origin
    default:
      return styles.widths.note
  }
}

function addTransactionRow(
  worksheet: ExcelJS.Worksheet,
  model: TransactionExportModel,
  rowIndex: number,
  headers: string[],
): void {
  const row = model.rows[rowIndex]
  if (!row) return

  const values: ExcelJS.CellValue[] = []
  for (const header of headers) {
    switch (header) {
      case 'Date':
        values.push(excelDate(row.occurredOn))
        break
      case 'Jour':
        values.push(row.weekday)
        break
      case 'Type':
        values.push(transactionKindLabel(row.kind))
        break
      case 'Catégorie':
        values.push(
          row.categoryId
            ? {
                richText: [
                  { text: '● ', font: { color: { argb: categoryColor(row.categoryColor) } } },
                  { text: row.categoryName },
                ],
              }
            : { richText: [{ text: 'Sans catégorie', font: { color: { argb: styles.muted } } }] },
        )
        break
      case 'Note':
        values.push(row.note)
        break
      case 'Responsable':
        values.push(row.responsible)
        break
      case 'Saisi par':
        values.push(row.createdBy)
        break
      case 'Montant':
        values.push(row.signedAmount)
        break
      case 'Origine':
        values.push(row.origin)
        break
    }
  }

  const worksheetRow = worksheet.addRow(values)
  worksheetRow.height = Math.min(72, Math.max(26, 18 + row.note.split(/\r?\n/u).length * 14))
  worksheetRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    const header = headers[columnNumber - 1]
    cell.font = {
      name: styles.font.name,
      size: styles.font.size,
      color: { argb: styles.font.color },
    }
    cell.alignment = { vertical: 'middle', wrapText: header === 'Note' }
    cell.border = {
      bottom: { style: 'thin', color: { argb: styles.border } },
    }
    if (rowIndex % 2 === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: styles.alternateRow } }
    }
  })

  const amountColumn = headers.indexOf('Montant') + 1
  const dateColumn = headers.indexOf('Date') + 1
  const amountCell = worksheetRow.getCell(amountColumn)
  amountCell.numFmt = styles.amountFormat
  amountCell.alignment = { horizontal: 'right', vertical: 'middle' }
  amountCell.font = {
    name: styles.font.name,
    size: styles.font.size,
    bold: true,
    color: {
      argb:
        row.kind === 'income'
          ? styles.income
          : row.kind === 'expense' || row.kind === 'refund'
            ? styles.expense
            : styles.muted,
    },
  }
  worksheetRow.getCell(dateColumn).numFmt = styles.dateFormat

  if (row.origin === 'Forfait') {
    const originCell = worksheetRow.getCell(headers.indexOf('Origine') + 1)
    originCell.font = {
      name: styles.font.name,
      size: styles.font.size,
      italic: true,
      color: { argb: styles.muted },
    }
  }
}

export function transactionXlsxFilename(startDate: string, endDate: string): string {
  return `cashflowplus_transactions_${startDate}_${endDate}.xlsx`
}

export interface TransactionXlsxOptions {
  workspaceName?: string
  periodLabel?: string
  title?: string
  generatedAt?: Date
  includeMemberBreakdown?: boolean
}

function formulaValue(formula: string, result: number): ExcelJS.CellFormulaValue {
  return { formula, result }
}

function formulaText(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function sumIfsFormula(
  amountRange: string,
  criteria: Array<[range: string, value: string, raw?: boolean]>,
): string {
  if (criteria.length === 0) return `SUM(${amountRange})`
  return `SUMIFS(${amountRange}${criteria.map(([range, value, raw]) => `,${range},${raw ? value : formulaText(value)}`).join('')})`
}

function netExpenseFormula(
  amountRange: string,
  typeRange: string | null,
  criteria: Array<[range: string, value: string, raw?: boolean]>,
): string {
  if (!typeRange) return `-${sumIfsFormula(amountRange, criteria)}`

  const expenses = sumIfsFormula(amountRange, [...criteria, [typeRange, 'Dépense']])
  const refunds = sumIfsFormula(amountRange, [...criteria, [typeRange, 'Remboursement']])
  return `-${expenses}-${refunds}`
}

function incomeFormula(amountRange: string, typeRange: string | null): string {
  return typeRange ? sumIfsFormula(amountRange, [[typeRange, 'Revenu']]) : `SUM(${amountRange})*0`
}

function adjustmentsFormula(amountRange: string, typeRange: string | null): string {
  return typeRange
    ? sumIfsFormula(amountRange, [[typeRange, 'Ajustement']])
    : `SUM(${amountRange})*0`
}

function dateRangeCriteria(
  dateRange: string,
  start: string,
  end: string,
): Array<[range: string, value: string, raw?: boolean]> {
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  return [
    [dateRange, `">="&DATE(${startYear},${startMonth},${startDay})`, true],
    [dateRange, `"<="&DATE(${endYear},${endMonth},${endDay})`, true],
  ]
}

function countIfsFormula(criteria: Array<[range: string, value: string, raw?: boolean]>): string {
  return `COUNTIFS(${criteria.map(([range, value, raw]) => `${range},${raw ? value : formulaText(value)}`).join(',')})`
}

function expenseTotal(transactions: Transaction[], recurring: boolean | null): number {
  const selectedTransactions =
    recurring === null
      ? transactions
      : transactions.filter((transaction) => (transaction.recurring_id !== null) === recurring)
  return calculateNetExpenseTotals(
    selectedTransactions.filter(
      (transaction) => transaction.kind === 'expense' || transaction.kind === 'refund',
    ),
  ).netExpenses
}

function formatLocalDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const dateValue = new Date(`${date}T00:00:00.000Z`)
  return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: 'UTC' }).format(dateValue)
}

function periodRangeLabel(start: string, end: string): string {
  const startLabel = formatLocalDate(start, { day: 'numeric', month: 'short' }).replace(/\.$/u, '')
  const endLabel = formatLocalDate(end, {
    day: 'numeric',
    month: 'short',
    year: start.slice(0, 4) === end.slice(0, 4) ? undefined : 'numeric',
  }).replace(/\.$/u, '')
  return `Semaine du ${startLabel} au ${endLabel}`
}

function formatDataSheetHeader(worksheet: ExcelJS.Worksheet, headers: string[]): void {
  worksheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width: index === 0 ? 34 : index === 3 ? 22 : 25,
  }))
  const headerRow = worksheet.getRow(1)
  headerRow.height = 30
  headerRow.eachCell((cell) => {
    cell.font = {
      name: styles.font.name,
      size: 10,
      bold: true,
      color: { argb: styles.header.font },
    }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: styles.header.fill },
    }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: styles.border } } }
  })
}

function styleDataRow(
  row: ExcelJS.Row,
  options: { bold?: boolean; fill?: string; indentFirst?: number } = {},
): void {
  row.height = 24
  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    cell.font = {
      name: styles.font.name,
      size: styles.font.size,
      bold: options.bold ?? false,
      color: { argb: styles.font.color },
    }
    cell.alignment = {
      vertical: 'middle',
      horizontal: columnNumber > 1 ? 'right' : 'left',
      indent: columnNumber === 1 ? (options.indentFirst ?? 0) : 0,
    }
    cell.border = { bottom: { style: 'thin', color: { argb: styles.border } } }
    if (options.fill) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: options.fill },
      }
    }
  })
}

function addDayRow(
  worksheet: ExcelJS.Worksheet,
  day: AgendaDayGroup,
  ranges: {
    amount: string
    date: string
    origin: string
    type: string | null
  },
  hidden: boolean,
): void {
  const criteria = dateRangeCriteria(ranges.date, day.date, day.date)
  const row = worksheet.addRow([
    new Date(`${day.date}T00:00:00.000Z`),
    formulaValue(
      netExpenseFormula(ranges.amount, ranges.type, [...criteria, [ranges.origin, 'Manuelle']]),
      expenseTotal(day.transactions, false),
    ),
    formulaValue(
      netExpenseFormula(ranges.amount, ranges.type, [...criteria, [ranges.origin, 'Forfait']]),
      expenseTotal(day.transactions, true),
    ),
    formulaValue(countIfsFormula(criteria), day.count),
  ])
  row.getCell(1).numFmt = styles.dateFormat
  row.getCell(2).numFmt = styles.amountFormat
  row.getCell(3).numFmt = styles.amountFormat
  row.getCell(4).numFmt = '#,##0'
  row.outlineLevel = 1
  row.hidden = hidden
  styleDataRow(row, { indentFirst: 1 })
}

function addWeekRow(
  worksheet: ExcelJS.Worksheet,
  week: AgendaWeekGroup,
  ranges: {
    amount: string
    date: string
    origin: string
    type: string | null
  },
): void {
  const criteria = dateRangeCriteria(ranges.date, week.bounds.start, week.bounds.end)
  const row = worksheet.addRow([
    periodRangeLabel(week.bounds.start, week.bounds.end),
    formulaValue(
      netExpenseFormula(ranges.amount, ranges.type, [...criteria, [ranges.origin, 'Manuelle']]),
      expenseTotal(
        week.days.flatMap((day) => day.transactions),
        false,
      ),
    ),
    formulaValue(
      netExpenseFormula(ranges.amount, ranges.type, [...criteria, [ranges.origin, 'Forfait']]),
      expenseTotal(
        week.days.flatMap((day) => day.transactions),
        true,
      ),
    ),
    formulaValue(countIfsFormula(criteria), week.count),
  ])
  row.getCell(2).numFmt = styles.amountFormat
  row.getCell(3).numFmt = styles.amountFormat
  row.getCell(4).numFmt = '#,##0'
  styleDataRow(row, { bold: true, fill: styles.alternateRow })
}

function addPeriodSheet(
  workbook: ExcelJS.Workbook,
  model: TransactionExportModel,
  ranges: {
    amount: string
    date: string
    origin: string
    type: string | null
  },
): void {
  const worksheet = workbook.addWorksheet('Par jour', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  formatDataSheetHeader(worksheet, [
    'Semaine / jour',
    'Dépenses hors forfaits',
    'Dont forfaits',
    'Nombre de transactions',
  ])
  worksheet.properties.outlineLevelRow = 1

  const weeks = model.weeks.flatMap((month) => month.weeks)
  weeks.forEach((week, weekIndex) => {
    addWeekRow(worksheet, week, ranges)
    week.days.forEach((day) => addDayRow(worksheet, day, ranges, weekIndex !== 0))
  })

  const totalRow = worksheet.addRow([
    'Total période',
    formulaValue(
      netExpenseFormula(ranges.amount, ranges.type, [[ranges.origin, 'Manuelle']]),
      model.totals.nonRecurringExpenses,
    ),
    formulaValue(
      netExpenseFormula(ranges.amount, ranges.type, [[ranges.origin, 'Forfait']]),
      model.totals.recurringExpenses,
    ),
    formulaValue(`COUNTA('Transactions'!$A$2:$A$${model.rows.length + 1})`, model.totals.count),
  ])
  totalRow.getCell(2).numFmt = styles.amountFormat
  totalRow.getCell(3).numFmt = styles.amountFormat
  totalRow.getCell(4).numFmt = '#,##0'
  styleDataRow(totalRow, { bold: true, fill: styles.alternateRow })
}

interface CategorySheetRow {
  label: string
  categoryColor: string | null
  transactionCount: number
  total: number
  percentage: number
  criterion: string
}

function categorySheetRows(model: TransactionExportModel): CategorySheetRow[] {
  const rowsByLabel = new Map<string, CategorySheetRow>()
  for (const category of model.categories) {
    if (category.nonRecurringExpenseTransactionCount === 0) continue
    const criterion = category.categoryId === null ? 'Sans catégorie' : `● ${category.categoryName}`
    const existing = rowsByLabel.get(criterion)
    if (existing) {
      existing.transactionCount += category.nonRecurringExpenseTransactionCount
      existing.total += category.nonRecurringExpenses
      if (existing.categoryColor !== category.categoryColor) existing.categoryColor = null
      continue
    }
    rowsByLabel.set(criterion, {
      label: criterion,
      categoryColor: category.categoryColor,
      transactionCount: category.nonRecurringExpenseTransactionCount,
      total: category.nonRecurringExpenses,
      percentage: 0,
      criterion,
    })
  }

  const rows = [...rowsByLabel.values()]
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  for (const row of rows) {
    row.percentage = total > 0 ? Math.max(0, row.total) / total : 0
  }
  rows.sort((left, right) => {
    if (left.label === 'Sans catégorie') return 1
    if (right.label === 'Sans catégorie') return -1
    return right.total - left.total || left.label.localeCompare(right.label, 'fr')
  })
  return rows
}

function categoryTransactionCountFormula(
  categoryRange: string,
  typeRange: string | null,
  originRange: string,
  categoryCriterion: string,
): string {
  const baseCriteria: Array<[range: string, value: string, raw?: boolean]> = [
    [categoryRange, categoryCriterion],
    [originRange, 'Manuelle'],
  ]
  if (!typeRange) return countIfsFormula(baseCriteria)
  return `${countIfsFormula([...baseCriteria, [typeRange, 'Dépense']])}+${countIfsFormula([...baseCriteria, [typeRange, 'Remboursement']])}`
}

function addCategorySheet(
  workbook: ExcelJS.Workbook,
  model: TransactionExportModel,
  ranges: {
    amount: string
    category: string
    origin: string
    type: string | null
  },
): void {
  const worksheet = workbook.addWorksheet('Par catégorie', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })
  formatDataSheetHeader(worksheet, [
    'Catégorie',
    'Nombre de transactions',
    'Dépenses hors forfaits',
    '% du total hors forfaits',
  ])
  worksheet.getColumn(1).width = 32
  worksheet.getColumn(2).width = 24
  worksheet.getColumn(3).width = 25
  worksheet.getColumn(4).width = 25

  const categoryRows = categorySheetRows(model)
  const firstCategoryRow = 2
  const lastCategoryRow = firstCategoryRow + categoryRows.length - 1

  categoryRows.forEach((category, index) => {
    const rowNumber = firstCategoryRow + index
    const criteria: Array<[range: string, value: string, raw?: boolean]> = [
      [ranges.category, category.criterion],
      [ranges.origin, 'Manuelle'],
    ]
    const totalFormula = netExpenseFormula(ranges.amount, ranges.type, criteria)
    const denominator = model.totals.nonRecurringExpenses
    const percentageFormula =
      denominator > 0
        ? `IFERROR(IF(C${rowNumber}>0,C${rowNumber}/SUM($C$${firstCategoryRow}:$C$${lastCategoryRow}),0),0)`
        : '0+0'
    const row = worksheet.addRow([
      category.criterion === 'Sans catégorie'
        ? { richText: [{ text: 'Sans catégorie', font: { color: { argb: styles.muted } } }] }
        : {
            richText: [
              { text: '● ', font: { color: { argb: categoryColor(category.categoryColor) } } },
              { text: category.label.slice(2) },
            ],
          },
      formulaValue(
        categoryTransactionCountFormula(
          ranges.category,
          ranges.type,
          ranges.origin,
          category.criterion,
        ),
        category.transactionCount,
      ),
      formulaValue(totalFormula, category.total),
      formulaValue(percentageFormula, category.percentage),
    ])
    row.getCell(2).numFmt = '#,##0'
    row.getCell(3).numFmt = styles.amountFormat
    row.getCell(4).numFmt = '0.0%'
    styleDataRow(row)
  })

  const forfaitRowNumber = Math.max(lastCategoryRow + 1, 2)
  const forfaitCountCriteria: Array<[range: string, value: string, raw?: boolean]> = [
    [ranges.origin, 'Forfait'],
  ]
  const forfaitCountFormula = ranges.type
    ? `${countIfsFormula([...forfaitCountCriteria, [ranges.type, 'Dépense']])}+${countIfsFormula([...forfaitCountCriteria, [ranges.type, 'Remboursement']])}`
    : countIfsFormula(forfaitCountCriteria)
  const forfaitRow = worksheet.addRow([
    'Forfaits',
    formulaValue(
      forfaitCountFormula,
      model.rows.filter(
        (row) => row.origin === 'Forfait' && (row.kind === 'expense' || row.kind === 'refund'),
      ).length,
    ),
    formulaValue(
      netExpenseFormula(ranges.amount, ranges.type, [[ranges.origin, 'Forfait']]),
      model.totals.recurringExpenses,
    ),
    formulaValue('0+0', 0),
  ])
  forfaitRow.getCell(2).numFmt = '#,##0'
  forfaitRow.getCell(3).numFmt = styles.amountFormat
  forfaitRow.getCell(4).numFmt = '0.0%'
  styleDataRow(forfaitRow, { bold: true, fill: styles.alternateRow })

  const totalRow = worksheet.addRow([
    'Total des dépenses',
    formulaValue(
      `${forfaitCountFormula}+${categoryRows.map((_, index) => `B${firstCategoryRow + index}`).join('+') || '0'}`,
      model.rows.filter((row) => row.kind === 'expense' || row.kind === 'refund').length,
    ),
    formulaValue(`SUM(C${firstCategoryRow}:C${forfaitRowNumber})`, model.totals.expenses),
    formulaValue(
      model.totals.nonRecurringExpenses > 0 ? '0+0+1' : '0+0',
      model.totals.nonRecurringExpenses > 0 ? 1 : 0,
    ),
  ])
  totalRow.getCell(2).numFmt = '#,##0'
  totalRow.getCell(3).numFmt = styles.amountFormat
  totalRow.getCell(4).numFmt = '0.0%'
  styleDataRow(totalRow, { bold: true, fill: styles.alternateRow })

  if (categoryRows.length > 0) {
    const dataBarRule: ExcelJS.DataBarRuleType & { color: Partial<ExcelJS.Color> } = {
      type: 'dataBar',
      priority: 1,
      showValue: true,
      gradient: true,
      minLength: 0,
      maxLength: 100,
      cfvo: [{ type: 'min' }, { type: 'max' }],
      color: { argb: styles.accent },
    }
    worksheet.addConditionalFormatting({
      ref: `C${firstCategoryRow}:C${lastCategoryRow}`,
      rules: [dataBarRule],
    })
  }
}

export async function buildTransactionXlsx(
  model: TransactionExportModel,
  options: TransactionXlsxOptions = {},
): Promise<XlsxBuffer> {
  if (model.rows.length === 0) {
    throw new Error('Aucune transaction à exporter.')
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'cashFlow+'
  workbook.created = new Date()
  workbook.modified = workbook.created
  workbook.calcProperties.fullCalcOnLoad = true

  const summarySheet = workbook.addWorksheet('Résumé', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
  })

  const transactionsSheet = workbook.addWorksheet('Transactions', {
    views: [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
      printTitlesRow: '1:1',
    },
    headerFooter: {
      oddFooter: 'Page &P / &N',
    },
  })
  const headers = transactionHeaders(model)
  transactionsSheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: columnWidth(header),
  }))

  const headerRow = transactionsSheet.getRow(1)
  headerRow.height = 30
  headerRow.eachCell((cell) => {
    cell.font = {
      name: styles.font.name,
      size: 10,
      bold: true,
      color: { argb: styles.header.font },
    }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: styles.header.fill },
    }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = {
      bottom: { style: 'thin', color: { argb: styles.border } },
    }
  })

  model.rows.forEach((_, index) => addTransactionRow(transactionsSheet, model, index, headers))

  const amountColumn = headers.indexOf('Montant') + 1
  const amountColumnLetter = transactionsSheet.getColumn(amountColumn).letter
  const totalRowNumber = model.rows.length + 2
  const lastTransactionRow = totalRowNumber - 1
  const amountRange = `'Transactions'!$${amountColumnLetter}$2:$${amountColumnLetter}$${lastTransactionRow}`
  const typeColumnIndex = headers.indexOf('Type')
  const typeColumnLetter =
    typeColumnIndex >= 0 ? transactionsSheet.getColumn(typeColumnIndex + 1).letter : null
  const typeRange = typeColumnLetter
    ? `'Transactions'!$${typeColumnLetter}$2:$${typeColumnLetter}$${lastTransactionRow}`
    : null
  const originColumnLetter = transactionsSheet.getColumn(headers.indexOf('Origine') + 1).letter
  const originRange = `'Transactions'!$${originColumnLetter}$2:$${originColumnLetter}$${lastTransactionRow}`
  const responsibleColumnLetter = transactionsSheet.getColumn(
    headers.indexOf('Responsable') + 1,
  ).letter
  const responsibleRange = `'Transactions'!$${responsibleColumnLetter}$2:$${responsibleColumnLetter}$${lastTransactionRow}`
  const dateColumnLetter = transactionsSheet.getColumn(headers.indexOf('Date') + 1).letter
  const dateRange = `'Transactions'!$${dateColumnLetter}$2:$${dateColumnLetter}$${lastTransactionRow}`
  const categoryColumnLetter = transactionsSheet.getColumn(headers.indexOf('Catégorie') + 1).letter
  const categoryRange = `'Transactions'!$${categoryColumnLetter}$2:$${categoryColumnLetter}$${lastTransactionRow}`
  const totalRow = transactionsSheet.getRow(totalRowNumber)
  totalRow.getCell(1).value = 'Total filtré'
  totalRow.getCell(amountColumn).value = formulaValue(
    `SUBTOTAL(109,${amountColumnLetter}2:${amountColumnLetter}${lastTransactionRow})`,
    model.totals.net,
  )
  totalRow.height = 30
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = {
      name: styles.font.name,
      size: styles.font.size,
      bold: true,
      color: { argb: styles.accent },
    }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: styles.alternateRow } }
    cell.border = {
      top: { style: 'thin', color: { argb: styles.border } },
    }
    cell.alignment = { vertical: 'middle' }
  })
  totalRow.getCell(amountColumn).numFmt = styles.amountFormat
  totalRow.getCell(amountColumn).alignment = { horizontal: 'right', vertical: 'middle' }

  transactionsSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastTransactionRow, column: headers.length },
  }

  const generatedAt = options.generatedAt ?? new Date()
  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Indian/Antananarivo',
  }).format(generatedAt)
  const periodLabel = options.periodLabel ?? 'Période sélectionnée'
  const workspaceName = options.workspaceName ?? 'Mon espace'

  summarySheet.getCell('A1').value = options.title ?? `${workspaceName} · ${periodLabel}`
  summarySheet.getCell('A1').font = {
    name: styles.font.name,
    size: 18,
    bold: true,
    color: { argb: styles.accent },
  }
  summarySheet.getCell('A2').value = `Généré le ${formattedDate}`
  summarySheet.getCell('A2').font = {
    name: styles.font.name,
    size: 10,
    color: { argb: styles.muted },
  }

  const expensesFormula = netExpenseFormula(amountRange, typeRange, [])
  const recurringCriteria: Array<[range: string, value: string]> = [[originRange, 'Forfait']]
  const nonRecurringCriteria: Array<[range: string, value: string]> = [[originRange, 'Manuelle']]
  const summaryRows = [
    {
      label: 'Dépenses totales',
      formula: expensesFormula,
      result: model.totals.expenses,
      format: 'amount',
    },
    {
      label: 'Dont forfaits',
      formula: netExpenseFormula(amountRange, typeRange, recurringCriteria),
      result: model.totals.recurringExpenses,
      format: 'amount',
    },
    {
      label: 'Dépenses hors forfaits',
      formula: netExpenseFormula(amountRange, typeRange, nonRecurringCriteria),
      result: model.totals.nonRecurringExpenses,
      format: 'amount',
    },
    {
      label: 'Revenus',
      formula: incomeFormula(amountRange, typeRange),
      result: model.totals.income,
      format: 'amount',
    },
    {
      label: 'Net',
      formula: `${incomeFormula(amountRange, typeRange)}+${adjustmentsFormula(amountRange, typeRange)}-(${expensesFormula})`,
      result: model.totals.net,
      format: 'amount',
    },
    {
      label: 'Nombre de transactions',
      formula: `COUNTA('Transactions'!$A$2:$A$${lastTransactionRow})`,
      result: model.totals.count,
      format: 'count',
    },
  ] as const

  summaryRows.forEach(({ label, formula, result, format }, index) => {
    const rowNumber = 4 + index
    const labelCell = summarySheet.getCell(`A${rowNumber}`)
    labelCell.value = label
    labelCell.font = {
      name: styles.font.name,
      size: 11,
      color: { argb: styles.font.color },
    }

    const amountCell = summarySheet.getCell(`B${rowNumber}`)
    amountCell.value = formulaValue(formula, result)
    amountCell.numFmt = format === 'amount' ? styles.amountFormat : '#,##0'
    amountCell.font = {
      name: styles.font.name,
      size: 12,
      bold: true,
      color: { argb: styles.accent },
    }
    amountCell.alignment = { horizontal: 'right' }
  })

  if (options.includeMemberBreakdown) {
    summarySheet.getCell('A11').value = 'Répartition par membre'
    summarySheet.getCell('A11').font = {
      name: styles.font.name,
      size: 12,
      bold: true,
      color: { argb: styles.accent },
    }

    const memberHeaders = [
      'Membre',
      'Nombre de transactions',
      'Dépenses totales',
      'Dont forfaits',
      'Dépenses hors forfaits',
    ]
    memberHeaders.forEach((header, index) => {
      const cell = summarySheet.getCell(12, index + 1)
      cell.value = header
      cell.font = {
        name: styles.font.name,
        size: 10,
        bold: true,
        color: { argb: styles.header.font },
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: styles.header.fill },
      }
      cell.alignment = { vertical: 'middle', wrapText: true }
    })

    model.members.forEach((member, index) => {
      const rowNumber = 13 + index
      summarySheet.getCell(`A${rowNumber}`).value = member.responsible
      summarySheet.getCell(`B${rowNumber}`).value = formulaValue(
        `COUNTIF(${responsibleRange},${formulaText(member.responsible)})`,
        member.transactionCount,
      )
      summarySheet.getCell(`C${rowNumber}`).value = formulaValue(
        netExpenseFormula(amountRange, typeRange, [[responsibleRange, member.responsible]]),
        member.totalExpenses,
      )
      summarySheet.getCell(`D${rowNumber}`).value = formulaValue(
        netExpenseFormula(amountRange, typeRange, [
          [responsibleRange, member.responsible],
          [originRange, 'Forfait'],
        ]),
        member.recurringExpenses,
      )
      summarySheet.getCell(`E${rowNumber}`).value = formulaValue(
        netExpenseFormula(amountRange, typeRange, [
          [responsibleRange, member.responsible],
          [originRange, 'Manuelle'],
        ]),
        member.nonRecurringExpenses,
      )
      summarySheet.getRow(rowNumber).eachCell((cell, columnNumber) => {
        cell.font = {
          name: styles.font.name,
          size: styles.font.size,
          color: { argb: styles.font.color },
        }
        cell.border = { bottom: { style: 'thin', color: { argb: styles.border } } }
        if (columnNumber > 1) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' }
          cell.numFmt = columnNumber === 2 ? '#,##0' : styles.amountFormat
        }
      })
    })
  }

  summarySheet.columns = [{ width: 34 }, { width: 24 }, { width: 24 }, { width: 20 }, { width: 26 }]
  summarySheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }]

  addPeriodSheet(workbook, model, {
    amount: amountRange,
    date: dateRange,
    origin: originRange,
    type: typeRange,
  })
  addCategorySheet(workbook, model, {
    amount: amountRange,
    category: categoryRange,
    origin: originRange,
    type: typeRange,
  })

  return await workbook.xlsx.writeBuffer()
}

export function downloadXlsxFile(content: XlsxBuffer, filename: string): void {
  const blob = new Blob([content], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
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
