const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')
const generators = [
  'src/main/tablet/display-ui.ts',
  'admin/lib/display-ui.ts'
]

for (const relativePath of generators) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
  if (!source.includes('<title>Display</title>')) {
    throw new Error(`${relativePath} no longer provides the Android TV title marker`)
  }
  if (!source.includes('id="panelStage"')) {
    throw new Error(`${relativePath} no longer provides the Android TV panelStage marker`)
  }
}

const activity = fs.readFileSync(
  path.join(repoRoot, 'tv-app/app/src/main/java/com/fastfood/tv/MainActivity.kt'),
  'utf8'
)
if (!activity.includes("document.title === 'Display'")) {
  throw new Error('MainActivity no longer checks the display title marker')
}
if (!activity.includes("document.getElementById('panelStage') !== null")) {
  throw new Error('MainActivity no longer checks the display root marker')
}

console.log('Android/LAN/cloud display marker contract verified')
