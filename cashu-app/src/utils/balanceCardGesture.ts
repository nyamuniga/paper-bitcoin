export type BalanceTab = 'btc' | 'usd';
export function isHorizontalSwipe(dx: number, dy: number, threshold = 48): boolean {
  return Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.5;
}
export function balanceTabAfterSwipe(current: BalanceTab, dx: number, dy: number): BalanceTab {
  return isHorizontalSwipe(dx, dy) ? dx < 0 ? 'usd' : 'btc' : current;
}
