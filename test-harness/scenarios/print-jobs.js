// Regression: automatic print failures must become durable, cashier-visible jobs.
const path = require('path')
const { bootSeededPos } = require('../lib/boot')
const { artifactsDir, saveText, log, sleep } = require('../lib/util')

exports.run = async () => {
  const out = artifactsDir('print-jobs')
  const { app, win } = await bootSeededPos()
  try {
    await win.evaluate(() =>
      window.api.settings.setMultiple({
        auto_print_receipt: 'true',
        auto_print_kitchen: 'true',
        split_kitchen_tickets: 'false',
        printer_name: '',
        kitchen_printer_name: ''
      })
    )

    const menu = await win.evaluate(() => window.api.menu.getAll())
    const order = await win.evaluate(
      (menuItemId) => window.api.orders.create({
        order_type: 'takeout',
        items: [{ menu_item_id: menuItemId, quantity: 1 }]
      }),
      menu[0].id
    )

    await sleep(3500)
    const jobs = await win.evaluate(() => window.api.printer.getPrintJobs())
    saveText(out, 'jobs.json', JSON.stringify({ order, jobs }, null, 2))
    await win.screenshot({ path: path.join(out, 'cashier-print-alert.png') })

    const orderJobs = jobs.filter((job) => job.order_id === order.id)
    if (orderJobs.length !== 2) {
      throw new Error('expected durable receipt and kitchen jobs, got ' + orderJobs.length)
    }
    if (orderJobs.some((job) => job.status !== 'attention')) {
      throw new Error('missing-printer jobs did not stop in staff-attention state')
    }
    if (orderJobs.some((job) => !/No printer configured/i.test(job.last_error || ''))) {
      throw new Error('print jobs did not retain their concrete failure reason')
    }

    const body = await win.evaluate(() => document.body.innerText)
    if (!/not confirmed/i.test(body) || !/Retry after checking/i.test(body)) {
      throw new Error('cashier did not receive the persistent print-attention controls')
    }

    const dismissed = await win.evaluate(
      (id) => window.api.printer.cancelPrintJob(id),
      orderJobs[0].id
    )
    if (!dismissed.success) throw new Error('staff could not dismiss a verified print alert')

    log('✔ missing printers produced two durable attention jobs with visible retry/dismiss controls')
    return { artifacts: out }
  } finally {
    await app.close().catch(() => {})
  }
}
