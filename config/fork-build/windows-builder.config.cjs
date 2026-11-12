const { join } = require('node:path')
const base = require(join(process.cwd(), 'config/electron-builder.config.cjs'))
const signtoolOptions = { ...base.win.signtoolOptions }
delete signtoolOptions.publisherName

module.exports = {
  ...base,
  artifactName: 'orca-windows-x64.${ext}',
  win: {
    ...base.win,
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] }
    ],
    signtoolOptions,
    verifyUpdateCodeSignature: false,
    extraResources: [
      ...base.win.extraResources,
      { from: join(process.cwd(), '.git/orca-personal-build.json'), to: 'orca-personal-build.json' }
    ]
  }
}
