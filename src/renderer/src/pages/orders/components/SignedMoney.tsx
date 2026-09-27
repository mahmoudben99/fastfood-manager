import { Money, cn } from '../../../components/ui'
import { moneyDecimals } from './MenuTile'

/** "+50 DA" / "−152 DA" kept in one LTR run, so the sign never drifts to the far side in Arabic. */
export function SignedMoney({ value, sign, styledSymbol = false, className }: {
  value: number
  sign: '+' | '−'
  styledSymbol?: boolean
  className?: string
}) {
  const amount = Math.abs(value)
  return (
    <bdi dir="ltr" className={cn('num whitespace-nowrap', className)}>
      {sign}
      <Money value={amount} decimals={moneyDecimals(amount)} styledSymbol={styledSymbol} />
    </bdi>
  )
}
