import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LockKeyhole, MonitorSmartphone, Printer, Send, Zap } from 'lucide-react'
import { Button, Card, toast } from '../../components/ui'
import { usePrepActions } from '../insights/shared/usePrepActions'

interface QuickActionsProps {
  shiftOpen: boolean
  className?: string
}

/** The four things an owner does from home: sell, print the prep list, send it, close the day. */
export function QuickActions({ shiftOpen, className = '' }: QuickActionsProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { print, send, busy } = usePrepActions()

  return (
    <Card className={className} icon={<Zap />} title={t('dashboard.actions.title')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
        <Button size="lg" fullWidth icon={<MonitorSmartphone />} onClick={() => navigate('/orders')}>
          {t('dashboard.actions.pos')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          icon={<Printer />}
          cooldownMs={800}
          loading={busy === 'print'}
          onClick={() => void print()}
        >
          {t('dashboard.actions.print')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          icon={<Send />}
          cooldownMs={800}
          loading={busy === 'send'}
          onClick={() => void send()}
        >
          {t('dashboard.actions.send')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          icon={<LockKeyhole />}
          onClick={() => {
            if (!shiftOpen) toast.info(t('dashboard.actions.noShift'))
            navigate('/orders')
          }}
        >
          {t('dashboard.actions.closeShift')}
        </Button>
      </div>
    </Card>
  )
}
