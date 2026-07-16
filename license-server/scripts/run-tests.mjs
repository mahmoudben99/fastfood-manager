#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(projectDir, 'wrangler.toml')
const keysPath = path.join(projectDir, 'test', 'fixtures', 'keys.local.json')
const wranglerBin = path.join(projectDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const databaseName = process.env.TEST_D1_DATABASE_NAME || 'ffm_license_test'
const workerPort = Number(process.env.TEST_LICENSE_SERVER_PORT || 8787)
const workerUrl = process.env.TEST_LICENSE_SERVER_URL || `http://127.0.0.1:${workerPort}`
const adminKey = process.env.TEST_ADMIN_API_KEY || 'test-admin-key-CHANGE-ME'
const persistPath = path.resolve(process.env.TEST_WRANGLER_PERSIST_TO || path.join(projectDir, '.wrangler', 'state'))
const originalConfig = readFileSync(configPath, 'utf8')
const wranglerEnvironment = {
  ...process.env,
  CI: 'true',
  TEST_WRANGLER_PERSIST_TO: persistPath,
  XDG_CONFIG_HOME: path.join(projectDir, '.wrangler', 'xdg-config')
}
let worker

function wrangler(args, options = {}) {
  execFileSync(process.execPath, [wranglerBin, ...args], {
    cwd: projectDir,
    env: wranglerEnvironment,
    stdio: 'inherit',
    ...options
  })
}

function restoreConfig() {
  if (readFileSync(configPath, 'utf8') !== originalConfig) writeFileSync(configPath, originalConfig)
}

function stopWorker() {
  if (!worker) return
  if (worker.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], {
        stdio: 'ignore',
        timeout: 10_000,
        windowsHide: true
      })
    } else {
      worker.kill('SIGTERM')
    }
  }
  worker.stdout?.destroy()
  worker.stderr?.destroy()
  worker.unref()
}

async function waitForWorker(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(`wrangler dev exited early with code ${worker.exitCode}`)
    try {
      const response = await fetch(`${workerUrl}/health`)
      if (response.ok) return
    } catch {
      // The dev server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`wrangler dev did not become ready at ${workerUrl}`)
}

function testConfigFor(dbName) {
  return originalConfig.replace(
    /^database_name\s*=\s*"[^"]+"/m,
    `database_name = ${JSON.stringify(dbName)}`
  )
}

function findLocalD1Sqlite() {
  const d1Directory = path.join(persistPath, 'v3', 'd1', 'miniflare-D1DatabaseObject')
  const candidates = readdirSync(d1Directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sqlite') && entry.name !== 'metadata.sqlite')
    .map((entry) => path.join(d1Directory, entry.name))
  if (candidates.length !== 1) {
    throw new Error(`Expected one local D1 SQLite database in ${d1Directory}; found ${candidates.length}`)
  }
  return candidates[0]
}

function installSignalCleanup() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopWorker()
      restoreConfig()
      process.exit(1)
    })
  }
}

installSignalCleanup()

try {
  if (!existsSync(wranglerBin)) throw new Error('Wrangler is not installed; run `npm install` inside license-server first')
  if (!existsSync(keysPath)) {
    execFileSync(process.execPath, ['test/fixtures/gen-keys.mjs'], {
      cwd: projectDir,
      stdio: ['ignore', 'ignore', 'inherit']
    })
  }
  const fixture = JSON.parse(readFileSync(keysPath, 'utf8'))
  const testConfig = testConfigFor(databaseName)
  if (testConfig !== originalConfig) writeFileSync(configPath, testConfig)

  for (const table of ['rate_limits', 'admin_log', 'licenses', 'd1_migrations']) {
    wrangler([
      'd1',
      'execute',
      databaseName,
      '--local',
      '--persist-to',
      persistPath,
      '--command',
      `DROP TABLE IF EXISTS ${table}`
    ])
  }
  wrangler(['d1', 'migrations', 'apply', databaseName, '--local', '--persist-to', persistPath])
  const d1SqlitePath = findLocalD1Sqlite()

  const devArgs = [
    wranglerBin,
    'dev',
    '--local',
    '--persist-to',
    persistPath,
    '--port',
    String(workerPort),
    '--test-scheduled',
    '--var',
    `ADMIN_API_KEY:${adminKey}`,
    '--var',
    `LICENSE_PRIVATE_KEY:${fixture.current.privatePkcs8Base64}`,
    '--var',
    `LICENSE_KID:${fixture.current.kid}`,
    '--var',
    `SUPABASE_URL:http://127.0.0.1:${process.env.TEST_SUPABASE_MOCK_PORT || 8788}`,
    '--var',
    'SUPABASE_ANON_KEY:test-anon-key',
    '--var',
    `TRIAL_DAYS:${process.env.TEST_TRIAL_DAYS || 7}`,
    '--var',
    `TOKEN_TTL_DAYS:${process.env.TEST_TOKEN_TTL_DAYS || 7}`
  ]
  worker = spawn(process.execPath, devArgs, {
    cwd: projectDir,
    env: wranglerEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  let workerOutput = ''
  worker.stdout.on('data', (chunk) => {
    workerOutput = (workerOutput + chunk.toString()).slice(-20_000)
  })
  worker.stderr.on('data', (chunk) => {
    workerOutput = (workerOutput + chunk.toString()).slice(-20_000)
  })

  try {
    await waitForWorker()
  } catch (error) {
    throw new Error(`${error.message}\n${workerOutput}`)
  }

  const defaultTestFiles = [
    'test/01-health.test.mjs',
    'test/02-trial-start.test.mjs',
    'test/03-license-check.test.mjs',
    'test/04-admin.test.mjs',
    'test/05-key-rotation.test.mjs',
    'test/06-cron.test.mjs'
  ]
  const testFiles = process.env.TEST_FILES
    ? process.env.TEST_FILES.split(',').map((file) => file.trim()).filter(Boolean)
    : defaultTestFiles
  const tests = spawnSync(
    process.execPath,
    ['--test', '--test-force-exit', '--test-concurrency=1', ...testFiles],
    {
    cwd: projectDir,
    env: {
      ...wranglerEnvironment,
      TEST_D1_DATABASE_NAME: databaseName,
      TEST_D1_SQLITE_PATH: d1SqlitePath,
      TEST_LICENSE_SERVER_URL: workerUrl,
      TEST_ADMIN_API_KEY: adminKey
    },
      stdio: 'inherit'
    }
  )
  if (tests.error) throw tests.error
  if (tests.status !== 0) {
    if (workerOutput) process.stderr.write(`\n--- wrangler dev output ---\n${workerOutput}\n`)
    process.exitCode = tests.status || 1
  }
} finally {
  stopWorker()
  restoreConfig()
}
