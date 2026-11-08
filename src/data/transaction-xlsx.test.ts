import { describe, expect, it } from 'vitest'
import * as ExcelJS from 'exceljs'
import type { Category, Transaction } from './models'
import { buildExportModel } from './transaction-export-model'
import { calculateTransactionHistorySummary } from './transaction-history'
import { buildTransactionXlsx, transactionXlsxFilename } from './transaction-xlsx'

const memberId = '14e06ce8-9cf7-4d68-9df4-3eea34655c28'
const categoryId = '8ac67042-51c9-4ed2-93de-9ced9b714e3d'

const category: Category = {
  id: categoryId,
  workspace_id: '74d4d0a1-2088-4071-b85d-74d7cb7620b6',
  name: 'Alimentation',
  kind: 'expense',
  icon: null,
  color: 'var(--category-5)',
  created_at: '2026-11-01T10:00:00.000Z',
  updated_at: '2026-11-01T10:00:00.000Z',
  deleted_at: null,
  archived_at: null,
}

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

async function zipEntryText(contents: ArrayBuffer, entryName: string): Promise<string> {
  const bytes = new Uint8Array(contents)
  const view = new DataView(bytes.buffer)
  let offset = 0

  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressionMethod = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const fileNameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const fileNameStart = offset + 30
    const dataStart = fileNameStart + fileNameLength + extraLength
    const fileName = new TextDecoder().decode(
      bytes.subarray(fileNameStart, dataStart - extraLength),
    )
    const compressedData = bytes.subarray(dataStart, dataStart + compressedSize)

    if (fileName === entryName) {
      if (compressionMethod === 0) return new TextDecoder().decode(compressedData)
      if (compressionMethod === 8) {
        const compressedBlob = new Blob([compressedData.slice().buffer])
        const decompressed = compressedBlob
          .stream()
          .pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat))
        return await new Response(decompressed).text()
      }
      throw new Error(`Compression ZIP non prise en charge : ${compressionMethod}`)
    }

    offset = dataStart + compressedSize
  }

  throw new Error(`Entrée ZIP introuvable : ${entryName}`)
}

function formulaResult(cell: ExcelJS.Cell): number {
  const value = cell.value
  if (typeof value !== 'object' || value === null || !('result' in value)) {
    throw new Error(`La cellule ${cell.address} ne contient pas de résultat de formule.`)
  }
  if (typeof value.result !== 'number') {
    throw new Error(`Le résultat de ${cell.address} n'est pas numérique.`)
  }
  return value.result
}

describe('transaction xlsx export', () => {
  it('creates a styled workbook with real date and number cells, filters, and a subtotal', async () => {
    const transactions = [
      transaction({
        kind: 'income',
        amount: 3000,
        created_by: '00000000-0000-4000-8000-000000000009',
      }),
      transaction({
        id: '00000000-0000-4000-8000-000000000002',
        recurring_id: '8c4e5b00-4e90-4ef1-a8ce-12c23a182c2a',
        note: 'Loyer',
        created_at: '2026-11-07T09:00:00.000Z',
      }),
    ]
    const model = buildExportModel(
      transactions,
      [category],
      new Map([
        [memberId, 'Laro'],
        ['00000000-0000-4000-8000-000000000009', 'Membre'],
      ]),
      { period: { start: '2026-11-01', end: '2026-11-30' } },
    )
    const contents = await buildTransactionXlsx(model)
    const workbook = await new ExcelJS.Workbook().xlsx.load(contents)
    const worksheet = workbook.getWorksheet('Transactions')
    const categorySheet = workbook.getWorksheet('Par catégorie')
    const categoryXml = await zipEntryText(contents, 'xl/worksheets/sheet4.xml')

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Résumé',
      'Transactions',
      'Par jour',
      'Par catégorie',
    ])
    expect(worksheet).toBeDefined()
    expect(workbook.getWorksheet('Résumé')?.getCell('A1').value).toBe(
      'Mon espace · Période sélectionnée',
    )
    expect(categorySheet?.getCell('D2').value).toMatchObject({
      formula: '0+0',
    })
    expect(categoryXml).toMatch(/<c\b[^>]*r="D2"[^>]*><f>0\+0<\/f><v>0<\/v><\/c>/u)
    if (!worksheet) throw new Error('Transactions worksheet was not created.')

    expect(worksheet.getCell('A1').value).toBe('Date')
    expect(worksheet.getCell('C1').value).toBe('Type')
    expect(worksheet.getCell('G1').value).toBe('Saisi par')
    expect(worksheet.getCell('A2').value).toBeInstanceOf(Date)
    expect(worksheet.getCell('A2').numFmt).toBe('dd/mm/yyyy')
    expect(worksheet.getCell('H2').value).toBe(3000)
    expect(worksheet.getCell('H2').numFmt).toBe('#,##0" Ar"')
    expect(worksheet.getCell('D2').value).toMatchObject({
      richText: [{ text: '● ', font: { color: { argb: 'FF15803D' } } }, { text: 'Alimentation' }],
    })
    expect(worksheet.getCell('H4').value).toMatchObject({
      formula: 'SUBTOTAL(109,H2:H3)',
      result: 3000 - 1250,
    })
    expect(worksheet.autoFilter).toBe('A1:I3')
    expect(worksheet.views[0]).toMatchObject({
      state: 'frozen',
      ySplit: 1,
      topLeftCell: 'A2',
    })
    expect(worksheet.pageSetup).toMatchObject({
      paperSize: 9,
      orientation: 'landscape',
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:1',
    })
    expect(worksheet.headerFooter.oddFooter).toBe('Page &P / &N')
    expect(worksheet.getCell('I3').font).toMatchObject({
      italic: true,
      color: { argb: 'FF78716C' },
    })
  })

  it('omits the Type column when all rows are expenses', async () => {
    const model = buildExportModel([transaction()], [category], new Map([[memberId, 'Laro']]), {
      period: { start: '2026-11-01', end: '2026-11-30' },
    })
    const contents = await buildTransactionXlsx(model)
    const workbook = await new ExcelJS.Workbook().xlsx.load(contents)
    const worksheet = workbook.getWorksheet('Transactions')

    expect(worksheet?.getCell('A1').value).toBe('Date')
    expect(worksheet?.getCell('C1').value).toBe('Catégorie')
    expect(worksheet?.getCell('F1').value).toBe('Montant')
    expect(worksheet?.getCell('G1').value).toBe('Origine')
    expect(worksheet?.getCell('H1').value).toBeNull()
    expect(transactionXlsxFilename('2026-11-01', '2026-11-30')).toBe(
      'cashflowplus_transactions_2026-11-01_2026-11-30.xlsx',
    )
  })

  it('rejects empty periods instead of downloading a blank workbook', async () => {
    const model = buildExportModel([], [category], new Map([[memberId, 'Laro']]), {
      period: { start: '2026-11-01', end: '2026-11-30' },
    })

    await expect(buildTransactionXlsx(model)).rejects.toThrow('Aucune transaction à exporter.')
  })

  it('writes cached summary formulas matching screen totals for 39 expenses, one forfait, and two members', async () => {
    const secondMemberId = '00000000-0000-4000-8000-000000000009'
    const everydayExpenses = Array.from({ length: 39 }, (_, index) =>
      transaction({
        id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
        amount: 1000,
        occurred_on: `2026-11-${String((index % 28) + 1).padStart(2, '0')}`,
        created_at: `2026-11-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
        paid_by: index < 20 ? memberId : secondMemberId,
        created_by: index < 20 ? memberId : secondMemberId,
      }),
    )
    const forfait = transaction({
      id: '00000000-0000-4000-8000-000000000099',
      amount: 170000,
      occurred_on: '2026-11-30',
      note: 'Forfait mensuel',
      recurring_id: '8c4e5b00-4e90-4ef1-a8ce-12c23a182c2a',
      paid_by: memberId,
      created_by: memberId,
    })
    const transactions = [...everydayExpenses, forfait]
    const members = new Map([
      [memberId, 'Laro'],
      [secondMemberId, 'Membre 2'],
    ])
    const model = buildExportModel(transactions, [category], members, {
      period: { start: '2026-11-01', end: '2026-11-30' },
    })
    const screenSummary = calculateTransactionHistorySummary(transactions)
    const screenMemberSummaries = new Map(
      [...members].map(([id, name]) => {
        const memberTransactions = transactions.filter((row) => row.paid_by === id)
        return [
          name,
          {
            all: calculateTransactionHistorySummary(memberTransactions),
            recurring: calculateTransactionHistorySummary(
              memberTransactions.filter((row) => row.recurring_id !== null),
            ),
            nonRecurring: calculateTransactionHistorySummary(
              memberTransactions.filter((row) => row.recurring_id === null),
            ),
          },
        ]
      }),
    )
    const contents = await buildTransactionXlsx(model, {
      title: 'Mensuel Ankadifotsy · novembre 2026',
      includeMemberBreakdown: true,
      generatedAt: new Date('2026-11-30T12:00:00.000Z'),
    })
    const workbook = await new ExcelJS.Workbook().xlsx.load(contents)
    const summary = workbook.getWorksheet('Résumé')
    const summaryXml = await zipEntryText(contents, 'xl/worksheets/sheet1.xml')
    const workbookXml = await zipEntryText(contents, 'xl/workbook.xml')

    expect(summary).toBeDefined()
    if (!summary) throw new Error('Résumé worksheet was not created.')
    expect(summary.getCell('A1').value).toBe('Mensuel Ankadifotsy · novembre 2026')
    expect(workbookXml).toMatch(/<calcPr\b[^>]*fullCalcOnLoad="1"/u)

    expect(summary.getCell('A4').value).toBe('Dépenses totales')
    expect(summary.getCell('B4').value).toMatchObject({
      formula: expect.stringContaining('SUM('),
      result: screenSummary.netExpenses,
    })
    expect(summary.getCell('A5').value).toBe('Dont forfaits')
    expect(summary.getCell('B5').value).toMatchObject({
      formula: expect.stringContaining('Forfait'),
      result: 170000,
    })
    expect(summary.getCell('A6').value).toBe('Dépenses hors forfaits')
    expect(summary.getCell('B6').value).toMatchObject({
      formula: expect.stringContaining('Manuelle'),
      result: 39000,
    })
    expect(summary.getCell('A7').value).toBe('Revenus')
    expect(summary.getCell('B7').value).toMatchObject({
      formula: expect.stringContaining('*0'),
    })
    expect(screenSummary.income).toBe(0)
    expect(summaryXml).toMatch(/<c\b[^>]*r="B7"[^>]*><f>[^<]+<\/f><v>0<\/v><\/c>/u)
    expect(summary.getCell('A8').value).toBe('Net')
    expect(summary.getCell('B8').value).toMatchObject({
      formula: expect.stringContaining('SUM('),
      result: screenSummary.net,
    })
    expect(summary.getCell('A9').value).toBe('Nombre de transactions')
    expect(summary.getCell('B9').value).toMatchObject({
      formula: "COUNTA('Transactions'!$A$2:$A$41)",
      result: screenSummary.count,
    })

    expect(summary.getCell('A11').value).toBe('Répartition par membre')
    expect(summary.getCell('A12').value).toBe('Membre')
    expect(summary.getCell('A13').value).toBe('Laro')
    expect(summary.getCell('B13').value).toMatchObject({
      formula: expect.stringContaining('COUNTIF'),
      result: screenMemberSummaries.get('Laro')?.all.count,
    })
    expect(summary.getCell('C13').value).toMatchObject({
      formula: expect.stringContaining('SUMIFS'),
      result: screenMemberSummaries.get('Laro')?.all.netExpenses,
    })
    expect(summary.getCell('D13').value).toMatchObject({
      formula: expect.stringContaining('Forfait'),
      result: screenMemberSummaries.get('Laro')?.recurring.netExpenses,
    })
    expect(summary.getCell('E13').value).toMatchObject({
      formula: expect.stringContaining('Manuelle'),
      result: screenMemberSummaries.get('Laro')?.nonRecurring.netExpenses,
    })
    expect(summary.getCell('A14').value).toBe('Membre 2')
    expect(summary.getCell('B14').value).toMatchObject({
      formula: expect.stringContaining('COUNTIF'),
      result: screenMemberSummaries.get('Membre 2')?.all.count,
    })
    expect(summary.getCell('C14').value).toMatchObject({
      formula: expect.stringContaining('SUMIFS'),
      result: screenMemberSummaries.get('Membre 2')?.all.netExpenses,
    })
    expect(summary.getCell('D14').value).toMatchObject({
      formula: expect.stringContaining('Forfait'),
    })
    expect(summaryXml).toMatch(/<c\b[^>]*r="D14"[^>]*><f>[^<]+<\/f><v>0<\/v><\/c>/u)
    expect(summary.getCell('E14').value).toMatchObject({
      formula: expect.stringContaining('Manuelle'),
      result: screenMemberSummaries.get('Membre 2')?.nonRecurring.netExpenses,
    })
  })

  it('exports grouped weeks and days plus category totals with outline and data bars', async () => {
    const transactions = [
      transaction({
        id: '00000000-0000-4000-8000-000000000011',
        amount: 1000,
        occurred_on: '2026-11-07',
        created_at: '2026-11-07T12:00:00.000Z',
      }),
      transaction({
        id: '00000000-0000-4000-8000-000000000012',
        kind: 'refund',
        amount: 200,
        occurred_on: '2026-11-07',
        created_at: '2026-11-07T11:00:00.000Z',
      }),
      transaction({
        id: '00000000-0000-4000-8000-000000000013',
        amount: 500,
        recurring_id: '8c4e5b00-4e90-4ef1-a8ce-12c23a182c2a',
        occurred_on: '2026-11-07',
        created_at: '2026-11-07T10:00:00.000Z',
      }),
      transaction({
        id: '00000000-0000-4000-8000-000000000014',
        amount: 300,
        category_id: null,
        occurred_on: '2026-11-06',
        created_at: '2026-11-06T10:00:00.000Z',
      }),
      transaction({
        id: '00000000-0000-4000-8000-000000000015',
        kind: 'income',
        amount: 2000,
        category_id: null,
        occurred_on: '2026-11-05',
        created_at: '2026-11-05T10:00:00.000Z',
      }),
      transaction({
        id: '00000000-0000-4000-8000-000000000016',
        kind: 'adjustment',
        amount: 100,
        category_id: null,
        occurred_on: '2026-11-05',
        created_at: '2026-11-05T09:00:00.000Z',
      }),
      transaction({
        id: '00000000-0000-4000-8000-000000000017',
        amount: 50,
        category_id: null,
        occurred_on: '2026-11-01',
        created_at: '2026-11-01T10:00:00.000Z',
      }),
    ]
    const model = buildExportModel(transactions, [category], new Map([[memberId, 'Laro']]), {
      period: { start: '2026-11-01', end: '2026-11-30' },
    })
    const contents = await buildTransactionXlsx(model)
    const workbook = await new ExcelJS.Workbook().xlsx.load(contents)
    const byDay = workbook.getWorksheet('Par jour')
    const byCategory = workbook.getWorksheet('Par catégorie')
    if (!byDay || !byCategory) throw new Error('Les feuilles de regroupement sont absentes.')
    const byDayXml = await zipEntryText(contents, 'xl/worksheets/sheet3.xml')
    const byCategoryXml = await zipEntryText(contents, 'xl/worksheets/sheet4.xml')
    const screenSummary = calculateTransactionHistorySummary(transactions)

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Résumé',
      'Transactions',
      'Par jour',
      'Par catégorie',
    ])
    expect(byDay.getRow(2).getCell(1).value).toBe('Semaine du 2 nov au 8 nov')
    expect(byDay.getCell('B2').value).toMatchObject({ result: 1100 })
    expect(byDay.getCell('C2').value).toMatchObject({ result: 500 })
    expect(byDay.getCell('D2').value).toMatchObject({ result: 6 })
    expect(byDay.getCell('A3').value).toBeInstanceOf(Date)
    expect(byDay.getCell('B3').value).toMatchObject({ result: 800 })
    expect(byDay.getCell('B3').value).toMatchObject({
      formula: expect.stringContaining('-SUMIFS'),
    })
    expect(byDay.getCell('C3').value).toMatchObject({ result: 500 })
    expect(byDay.getCell('D3').value).toMatchObject({ result: 3 })
    expect(byDay.getRow(3).outlineLevel).toBe(1)
    expect(byDay.getRow(3).hidden).toBe(false)
    expect(byDay.getRow(7).hidden).toBe(true)
    expect(byDayXml).toMatch(/outlineLevel="1"/u)
    expect(byDay.getCell('B8').value).toMatchObject({ result: model.totals.nonRecurringExpenses })
    expect(byDay.getCell('C8').value).toMatchObject({ result: model.totals.recurringExpenses })
    expect(byDay.getCell('D8').value).toMatchObject({ result: screenSummary.count })
    expect(formulaResult(byDay.getCell('B8')) + formulaResult(byDay.getCell('C8'))).toBe(
      screenSummary.netExpenses,
    )

    expect(byCategory.getCell('A2').value).toMatchObject({
      richText: [{ text: '● ', font: { color: { argb: 'FF15803D' } } }, { text: 'Alimentation' }],
    })
    expect(byCategory.getCell('B2').value).toMatchObject({ result: 2 })
    expect(byCategory.getCell('C2').value).toMatchObject({ result: 800 })
    expect(byCategory.getCell('C2').value).toMatchObject({
      formula: expect.stringContaining('-SUMIFS'),
    })
    expect(byCategory.getCell('D2').value).toMatchObject({ result: 800 / 1150 })
    expect(byCategory.getCell('A3').value).toMatchObject({
      richText: [{ text: 'Sans catégorie', font: { color: { argb: 'FF78716C' } } }],
    })
    expect(byCategory.getCell('B3').value).toMatchObject({ result: 2 })
    expect(byCategory.getCell('C3').value).toMatchObject({ result: 350 })
    expect(byCategory.getCell('A4').value).toBe('Forfaits')
    expect(byCategory.getCell('C4').value).toMatchObject({ result: 500 })
    expect(byCategory.getCell('A5').value).toBe('Total des dépenses')
    expect(byCategory.getCell('C5').value).toMatchObject({
      formula: 'SUM(C2:C4)',
      result: model.totals.expenses,
    })
    expect(
      formulaResult(byCategory.getCell('C2')) +
        formulaResult(byCategory.getCell('C3')) +
        formulaResult(byCategory.getCell('C4')),
    ).toBe(screenSummary.netExpenses)
    expect(byCategoryXml).toMatch(/<conditionalFormatting sqref="C2:C3">/u)
    expect(byCategoryXml).toMatch(/<dataBar/u)
    expect(byCategoryXml).toMatch(/<color rgb="FF004E33"\/>/u)
  })

  it('rejects empty exports instead of creating a misleading workbook', async () => {
    const model = buildExportModel([], [category], new Map([[memberId, 'Laro']]), {
      period: { start: '2026-11-01', end: '2026-11-30' },
    })

    await expect(buildTransactionXlsx(model)).rejects.toThrow('Aucune transaction à exporter.')
  })
})
