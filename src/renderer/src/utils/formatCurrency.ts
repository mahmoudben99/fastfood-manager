import { useAppStore } from '../store/appStore'

export function formatCurrency(amount: number): string {
  const { currencySymbol } = useAppStore.getState()
  return `${amount.toFixed(2)} ${currencySymbol}`
}

export function formatNumber(num: number, decimals: number = 2): string {
  return num.toFixed(decimals)
}
