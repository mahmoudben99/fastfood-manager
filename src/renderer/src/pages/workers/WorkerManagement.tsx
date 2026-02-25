import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Calendar } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { formatCurrency } from '../../utils/formatCurrency'
import { VirtualKeyboard } from '../../components/VirtualKeyboard'

export function WorkerManagement() {
  const { t } = useTranslation()
  const { foodLanguage, inputMode } = useAppStore()
  const isTouch = inputMode === 'touchscreen'
  const [workers, setWorkers] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [tab, setTab] = useState<'workers' | 'attendance'>('workers')
  const [showForm, setShowForm] = useState(false)
  const [editWorker, setEditWorker] = useState<any>(null)

  // Form
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState('cook')
  const [formPayFull, setFormPayFull] = useState('')
  const [formPayHalf, setFormPayHalf] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formCategories, setFormCategories] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  // Virtual keyboard
  const [keyboardTarget, setKeyboardTarget] = useState<{ field: string; type: 'numeric' | 'text' } | null>(null)

  const getKeyboardValue = (): string => {
    if (!keyboardTarget) return ''
    switch (keyboardTarget.field) {
      case 'formName': return formName
      case 'formPayFull': return formPayFull
      case 'formPayHalf': return formPayHalf
      case 'formPhone': return formPhone
      default: return ''
    }
  }

  const handleKeyboardChange = (val: string) => {
    if (!keyboardTarget) return
    switch (keyboardTarget.field) {
      case 'formName': setFormName(val); break
      case 'formPayFull': setFormPayFull(val); break
      case 'formPayHalf': setFormPayHalf(val); break
      case 'formPhone': setFormPhone(val); break
    }
  }

  // Attendance
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0])
  const [attendance, setAttendance] = useState<any[]>([])
  const [schedule, setSchedule] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (tab === 'attendance') loadAttendance()
  }, [tab, attendanceDate])

  const loadData = async () => {
    const [w, c, sched] = await Promise.all([
      window.api.workers.getAll(),
      window.api.categories.getAll(),
      window.api.settings.getSchedule()
    ])
    setWorkers(w)
    setCategories(c)
    setSchedule(sched)
  }

  const loadAttendance = async () => {
    const [att, sched] = await Promise.all([
      window.api.workers.getAttendance(attendanceDate),
      window.api.settings.getSchedule()
    ])
    setSchedule(sched)

    // Auto-fill attendance based on schedule for workers without records
    if (att.length === 0 && workers.length > 0) {
      const dayOfWeek = new Date(attendanceDate + 'T00:00:00').getDay()
      // JS getDay(): 0=Sunday. Our schedule: 0=Sunday(or Saturday depending on setup)
      const daySchedule = sched.find((s: any) => s.day_of_week === dayOfWeek)

      if (daySchedule && daySchedule.status !== 'closed') {
        // Auto-set all workers to the schedule's shift type
        const shiftType = daySchedule.status === 'half' ? 'half' : 'full'
        for (const worker of workers) {
          const pay = shiftType === 'full' ? worker.pay_full_day : worker.pay_half_day
          await window.api.workers.setAttendance(worker.id, attendanceDate, shiftType, pay)
        }
        // Reload after auto-fill
        const updatedAtt = await window.api.workers.getAttendance(attendanceDate)
        setAttendance(updatedAtt)
        return
      }
    }

    setAttendance(att)
  }

  const getScheduleForDate = (date: string) => {
    const dayOfWeek = new Date(date + 'T00:00:00').getDay()
    return schedule.find((s: any) => s.day_of_week === dayOfWeek)
  }

  const getName = (item: any) => {
    if (foodLanguage === 'ar' && item.name_ar) return item.name_ar
    if (foodLanguage === 'fr' && item.name_fr) return item.name_fr
    return item.name
  }

  const roles = ['cook', 'server', 'cleaner', 'cashier', 'other']

  const openForm = (worker?: any) => {
    if (worker) {
      setEditWorker(worker)
      setFormName(worker.name)
      setFormRole(worker.role)
      setFormPayFull(String(worker.pay_full_day))
      setFormPayHalf(String(worker.pay_half_day))
      setFormPhone(worker.phone || '')
      setFormCategories(worker.category_ids || [])
    } else {
      setEditWorker(null)
      setFormName('')
      setFormRole('cook')
      setFormPayFull('')
      setFormPayHalf('')
      setFormPhone('')
      setFormCategories([])
    }
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const data = {
      name: formName,
      role: formRole,
      pay_full_day: Number(formPayFull),
      pay_half_day: Number(formPayHalf),
      phone: formPhone || undefined,
      category_ids: formRole === 'cook' ? formCategories : []
    }
    if (editWorker) {
      await window.api.workers.update(editWorker.id, data)
    } else {
      await window.api.workers.create(data)
    }
    setShowForm(false)
    setSaving(false)
    loadData()
  }

  const handleDelete = async (id: number) => {
    await window.api.workers.delete(id)
    loadData()
  }

  const handleSetAttendance = async (workerId: number, shiftType: string) => {
    const worker = workers.find((w) => w.id === workerId)
    if (!worker) return
    const pay = shiftType === 'full' ? worker.pay_full_day : shiftType === 'half' ? worker.pay_half_day : 0
    await window.api.workers.setAttendance(workerId, attendanceDate, shiftType, pay)
    loadAttendance()
  }

  const toggleCategory = (catId: number) => {
    setFormCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('workers.title')}</h1>
        <Button onClick={() => openForm()}>
          <Plus className="h-4 w-4" />
          {t('workers.addWorker')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('workers')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'workers' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t('workers.title')}
        </button>
        <button
          onClick={() => setTab('attendance')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
            tab === 'attendance' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <Calendar className="h-4 w-4" />
          {t('workers.attendance')}
        </button>
      </div>

      {tab === 'workers' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <Card key={worker.id} className="group">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{worker.name}</h3>
                  <Badge variant="info" className="mt-1">{t(`workers.roles.${worker.role}`)}</Badge>
                </div>
                <div className={`flex gap-1 transition-opacity ${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  <button onClick={() => openForm(worker)} className={`${isTouch ? 'p-2.5' : 'p-1.5'} hover:bg-gray-100 rounded`}>
                    <Pencil className={`${isTouch ? 'h-5 w-5' : 'h-4 w-4'} text-gray-500`} />
                  </button>
                  <button onClick={() => handleDelete(worker.id)} className={`${isTouch ? 'p-2.5' : 'p-1.5'} hover:bg-red-50 rounded`}>
                    <Trash2 className={`${isTouch ? 'h-5 w-5' : 'h-4 w-4'} text-red-500`} />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-gray-600">
                <p>{t('workers.payFullDay')}: <strong>{formatCurrency(worker.pay_full_day)}</strong></p>
                <p>{t('workers.payHalfDay')}: <strong>{formatCurrency(worker.pay_half_day)}</strong></p>
                {worker.phone && <p>{t('workers.phone')}: {worker.phone}</p>}
              </div>
              {worker.role === 'cook' && worker.category_ids?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {worker.category_ids.map((catId: number) => {
                    const cat = categories.find((c: any) => c.id === catId)
                    return cat ? (
                      <Badge key={catId} variant="default">{getName(cat)}</Badge>
                    ) : null
                  })}
                </div>
              )}
            </Card>
          ))}
          {workers.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400">{t('workers.noWorkers')}</div>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-center gap-4">
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            {(() => {
              const daySched = getScheduleForDate(attendanceDate)
              if (!daySched) return null
              const statusColor = daySched.status === 'closed' ? 'bg-red-100 text-red-700' : daySched.status === 'half' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
              const statusLabel = daySched.status === 'closed' ? t('setup.schedule.closed') : daySched.status === 'half' ? t('setup.schedule.halfDay') : t('setup.schedule.fullDay')
              return (
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                  {t('workers.scheduleStatus', { defaultValue: 'Schedule' })}: {statusLabel}
                  {daySched.status !== 'closed' && ` (${daySched.open_time} - ${daySched.close_time})`}
                </span>
              )
            })()}
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('workers.name')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('workers.role')}</th>
                  <th className="text-start px-4 py-3 font-medium text-gray-600">{t('workers.attendance')}</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => {
                  const att = attendance.find((a) => a.worker_id === worker.id)
                  return (
                    <tr key={worker.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{worker.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="info">{t(`workers.roles.${worker.role}`)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {(['full', 'half', 'absent'] as const).map((type) => (
                            <button
                              key={type}
                              onClick={() => handleSetAttendance(worker.id, type)}
                              className={`${isTouch ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs'} rounded-lg font-medium transition-colors ${
                                att?.shift_type === type
                                  ? type === 'absent'
                                    ? 'bg-red-500 text-white'
                                    : 'bg-green-500 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {t(`workers.shifts.${type}`)}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Worker Modal */}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setKeyboardTarget(null) }} title={editWorker ? t('workers.editWorker') : t('workers.addWorker')}>
        <div className="space-y-4">
          <Input label={t('workers.name')} value={formName} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'formName', type: 'text' }) : undefined} onChange={isTouch ? undefined : (e) => setFormName(e.target.value)} />
          <Select
            label={t('workers.role')}
            value={formRole}
            onChange={(e) => setFormRole(e.target.value)}
            options={roles.map((r) => ({ value: r, label: t(`workers.roles.${r}`) }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('workers.payFullDay')} type={isTouch ? 'text' : 'number'} inputMode="numeric" value={formPayFull} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'formPayFull', type: 'numeric' }) : undefined} onChange={isTouch ? undefined : (e) => setFormPayFull(e.target.value)} />
            <Input label={t('workers.payHalfDay')} type={isTouch ? 'text' : 'number'} inputMode="numeric" value={formPayHalf} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'formPayHalf', type: 'numeric' }) : undefined} onChange={isTouch ? undefined : (e) => setFormPayHalf(e.target.value)} />
          </div>
          <Input label={t('workers.phone')} value={formPhone} readOnly={isTouch} onClick={isTouch ? () => setKeyboardTarget({ field: 'formPhone', type: 'numeric' }) : undefined} onChange={isTouch ? undefined : (e) => setFormPhone(e.target.value)} />

          {formRole === 'cook' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('workers.categories')}</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat: any) => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`${isTouch ? 'px-5 py-3 text-base rounded-xl border-2 font-medium' : 'px-3 py-1.5 rounded-lg text-sm'} transition-colors ${
                      formCategories.includes(cat.id)
                        ? 'bg-orange-500 text-white border-orange-500'
                        : isTouch
                          ? 'bg-gray-100 text-gray-700 border-gray-200 hover:border-orange-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {getName(cat)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">{t('common.cancel')}</Button>
            <Button onClick={handleSave} loading={saving} disabled={!formName || !formPayFull || !formPayHalf} className="flex-1">{t('common.save')}</Button>
          </div>
        </div>
      </Modal>

      {/* Virtual Keyboard for touchscreen mode */}
      {isTouch && keyboardTarget && (
        <VirtualKeyboard
          visible
          type={keyboardTarget.type}
          value={getKeyboardValue()}
          onChange={handleKeyboardChange}
          onClose={() => setKeyboardTarget(null)}
        />
      )}
    </div>
  )
}
