export interface DayCell {
  date: Date;
  inMonth: boolean;
}

// Returns weeks of 7 cells each, Sunday-first, covering the full month plus
// leading/trailing days from adjacent months to fill the grid.
export function buildMonthGrid(year: number, month: number): DayCell[][] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const gridStart = new Date(year, month, 1 - startOffset);
  const weeks: DayCell[][] = [];
  const cursor = new Date(gridStart);

  for (let i = 0; i < totalCells; i += 7) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({ date: new Date(cursor), inMonth: cursor.getMonth() === month });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
