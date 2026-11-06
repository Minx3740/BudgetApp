export interface DatePeriod {
  start: string
  end: string
}

function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid local date: ${value}`)
  }
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid local date: ${value}`)
  }
  return date
}

function toLocalDate(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + amount)
  return result
}

export function isLocalDate(value: string): boolean {
  try {
    parseLocalDate(value)
    return true
  } catch {
    return false
  }
}

export function getDayPeriod(date: string): DatePeriod {
  parseLocalDate(date)
  return { start: date, end: date }
}

export function getWeekPeriod(date: string): DatePeriod {
  const parsed = parseLocalDate(date)
  const mondayOffset = (parsed.getUTCDay() + 6) % 7
  return {
    start: toLocalDate(addDays(parsed, -mondayOffset)),
    end: toLocalDate(addDays(parsed, 6 - mondayOffset)),
  }
}

export function getMonthPeriod(month: string): DatePeriod {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(month)
  if (!match) throw new Error(`Invalid month: ${month}`)
  if (month.length === 10) parseLocalDate(month)
  const year = Number(match[1])
  const monthNumber = Number(match[2])
  const start = `${match[1]}-${match[2]}-01`
  parseLocalDate(start)
  if (monthNumber < 1 || monthNumber > 12) throw new Error(`Invalid month: ${month}`)
  const end = new Date(0)
  end.setUTCFullYear(year, monthNumber, 0)
  end.setUTCHours(0, 0, 0, 0)
  return { start, end: toLocalDate(end) }
}

export function getMonthWeekPeriods(month: string): DatePeriod[] {
  const monthPeriod = getMonthPeriod(month)
  const lastDay = parseLocalDate(monthPeriod.end)
  const weeks: DatePeriod[] = []

  for (
    let cursor = parseLocalDate(monthPeriod.start);
    cursor <= lastDay;
    cursor = addDays(cursor, 7)
  ) {
    const fullWeek = getWeekPeriod(toLocalDate(cursor))
    weeks.push({
      start: fullWeek.start < monthPeriod.start ? monthPeriod.start : fullWeek.start,
      end: fullWeek.end > monthPeriod.end ? monthPeriod.end : fullWeek.end,
    })
  }

  return weeks
}

export function isDatePeriod(value: DatePeriod): boolean {
  return isLocalDate(value.start) && isLocalDate(value.end) && value.start <= value.end
}
