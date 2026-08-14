export const parseWholeRupees = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export const formatRupees = (value: number): string =>
  new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));

export const formatCentsAsRupees = (value: number): string =>
  formatRupees((Number(value) || 0) / 100);
