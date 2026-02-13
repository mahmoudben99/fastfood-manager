/**
 * FFM Serial Key Generator — Standalone Tool
 * Compile with: npx pkg scripts/keygen.js --target node18-win-x64 --output KeyGen.exe
 */

const { createHmac } = require('crypto')
const readline = require('readline')

const SECRET_KEY = 'FFM-2024-SERIAL-KEY-DO-NOT-SHARE'

function generateSerialCode(machineId) {
  const hmac = createHmac('sha256', SECRET_KEY).update(machineId.toUpperCase()).digest('hex')
  const code = hmac.substring(0, 20).toUpperCase()
  return `${code.slice(0, 5)}-${code.slice(5, 10)}-${code.slice(10, 15)}-${code.slice(15, 20)}`
}

function printHeader() {
  console.clear()
  console.log('='.repeat(50))
  console.log('   Fast Food Manager — Key Generator')
  console.log('='.repeat(50))
  console.log()
}

function prompt(rl) {
  printHeader()
  rl.question('  Enter Machine ID (or "q" to quit): ', (input) => {
    const trimmed = input.trim()

    if (trimmed.toLowerCase() === 'q') {
      console.log('\n  Goodbye!\n')
      rl.close()
      return
    }

    if (!trimmed) {
      console.log('\n  [!] Machine ID cannot be empty.\n')
      rl.question('  Press Enter to continue...', () => prompt(rl))
      return
    }

    if (trimmed.length !== 16 || !/^[A-Fa-f0-9]+$/.test(trimmed)) {
      console.log(`\n  [!] Invalid Machine ID: "${trimmed}"`)
      console.log('  Machine ID should be 16 hex characters (e.g. A1B2C3D4E5F67890)\n')
      rl.question('  Press Enter to continue...', () => prompt(rl))
      return
    }

    const serial = generateSerialCode(trimmed)

    console.log()
    console.log('  ' + '-'.repeat(46))
    console.log(`  Machine ID:    ${trimmed.toUpperCase()}`)
    console.log(`  Serial Code:   ${serial}`)
    console.log('  ' + '-'.repeat(46))
    console.log()

    rl.question('  Press Enter to generate another key...', () => prompt(rl))
  })
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

prompt(rl)
