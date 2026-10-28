import { runProcessSync } from '@orca/process-host'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

it('uses recorded imports in both runtimes and retains cold, new, and global-input tests', () => {
  const root = process.cwd()
  mkdirSync(join(root, '.tmp'), { recursive: true })
  const directory = mkdtempSync(join(root, '.tmp', 'vitest-affected-'))
  const config = join(directory, 'vitest.config.mjs')
  const report = join(directory, 'report.json')
  const transformed = join(directory, 'transformed.jsonl')
  const input = join(directory, 'value.ts')
  const runtimes = ['bun', 'node-runtime']
  const localPath = (file) => relative(root, file).replaceAll('\\', '/')
  function writeTest(runtime, name, imported = false) {
    const file = join(directory, runtime, `${name}.test.ts`)
    writeFileSync(
      file,
      `
      import { expect, it } from 'vitest'
      ${imported ? "import { value } from './value'" : 'const value = 1'}
      it('runs under ${runtime}', () => {
        expect(value).toBe(1)
        expect(Boolean(process.versions.bun)).toBe(${runtime === 'bun'})
      })
    `
    )
    return file
  }
  try {
    writeFileSync(input, 'export const value = 1')
    const affected = []
    const unrelated = []
    const runtimeSources = []
    for (const runtime of runtimes) {
      mkdirSync(join(directory, runtime))
      const source = join(directory, runtime, 'value.ts')
      writeFileSync(source, "export { value } from '../value'")
      runtimeSources.push(source)
      affected.push(writeTest(runtime, 'affected', true))
      unrelated.push(writeTest(runtime, 'unrelated'))
    }
    writeFileSync(
      config,
      `
      import base from ${JSON.stringify(pathToFileURL(resolve('config/vitest.config.ts')).href)}
      import { appendFileSync } from 'node:fs'
      export default {
        ...base,
        cacheDir: ${JSON.stringify(join(directory, 'cache'))},
        define: {
          ...base.define,
          ORCA_AFFECTED_CONTEXT: JSON.stringify(process.env.ORCA_AFFECTED_CONTEXT ?? 'good')
        },
        test: {
          ...base.test,
          maxWorkers: 1,
          projects: base.test.projects
            .filter(project => ${JSON.stringify(runtimes)}.includes(project.test.name))
            .map(project => ({
              ...project,
              plugins: [...project.plugins, {
                name: 'observe-affected-test-transforms',
                transform(code, id) {
                  const file = id.split('?')[0].replaceAll('\\\\', '/')
                  if (file.startsWith(${JSON.stringify(`${directory.replaceAll('\\', '/')}/`)})) {
                    appendFileSync(${JSON.stringify(transformed)}, JSON.stringify({
                      runtime: project.test.name,
                      file
                    }) + '\\n')
                  }
                }
              }],
              define: {
                ...project.define,
                ORCA_AFFECTED_CONTEXT: JSON.stringify(process.env.ORCA_AFFECTED_CONTEXT ?? 'good')
              },
              test: {
                ...project.test,
                include: [${JSON.stringify(localPath(directory))} + '/' + project.test.name + '/*.test.ts'],
                exclude: []
              }
            }))
        }
      }
    `
    )
    function run(changed, { args, env, code = 0 } = {}) {
      writeFileSync(transformed, '')
      const result = runProcessSync({
        program: process.env.ORCA_TEST_NODE_EXECUTABLE ?? process.execPath,
        args: [
          resolve('config/scripts/run-vitest.mjs'),
          ...(args ?? ['related', '--run', localPath(changed)]),
          '--config',
          config,
          '--reporter=json',
          '--outputFile',
          report
        ],
        cwd: root,
        env: { ...process.env, CI: '', ORCA_BACKGROUND_LAUNCH: '1', ...env },
        timeoutMs: 60_000
      })
      expect(result.timedOut, result.stderr).toBe(false)
      expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(code)
      const output = JSON.parse(readFileSync(report, 'utf8'))
      expect(output.success).toBe(code === 0)
      return output.testResults.map(({ name }) => name.replaceAll('\\', '/')).sort()
    }
    const normalize = (files) => files.map((file) => file.replaceAll('\\', '/')).sort()
    const readTransforms = () =>
      readFileSync(transformed, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    function expectKnownTransforms() {
      const observed = readTransforms()
      for (const [index, runtime] of runtimes.entries()) {
        expect(observed).toEqual(
          expect.arrayContaining(
            normalize([affected[index], runtimeSources[index]]).map((file) => ({ runtime, file }))
          )
        )
      }
      expect(observed.map(({ file }) => file)).toContain(normalize([input])[0])
      return observed
    }
    expect(run(input)).toEqual(normalize([...affected, ...unrelated]))
    expectKnownTransforms()
    expect(run(input)).toEqual(normalize(affected))
    // Force observable work in both warm projects while unrelated records stay reusable.
    for (const file of [...affected, ...runtimeSources, input]) {
      writeFileSync(file, `${readFileSync(file, 'utf8')}\n`)
    }
    expect(run(input)).toEqual(normalize(affected))
    const transforms = expectKnownTransforms().map(({ file }) => file)
    for (const file of unrelated) {
      expect(transforms).not.toContain(file.replaceAll('\\', '/'))
    }
    const fresh = writeTest(runtimes[0], 'new')
    expect(run(input)).toEqual(normalize([...affected, fresh]))
    expect(run(join(root, 'pnpm-lock.yaml'))).toEqual(normalize([...affected, ...unrelated, fresh]))
    const coldAffected = writeTest(runtimes[0], 'cold-affected', true)
    const coldUnrelated = []
    for (let index = 0; index < 101; index += 1) {
      const runtime = runtimes[index % runtimes.length]
      coldUnrelated.push({
        runtime,
        file: writeTest(runtime, `cold-unrelated-${index}`).replaceAll('\\', '/')
      })
    }
    expect(run(input)).toEqual(normalize([...affected, coldAffected]))
    const coldTransforms = readTransforms()
    expect(coldTransforms).toEqual(expect.arrayContaining(coldUnrelated))
    expect(coldTransforms).toContainEqual({
      runtime: runtimes[0],
      file: coldAffected.replaceAll('\\', '/')
    })

    const knownArgs = ['run', ...affected.map(localPath)]
    for (const file of affected) {
      writeFileSync(
        file,
        `
        import { expect, it } from 'vitest'
        it('loads a computed dependency', async () => {
          if (process.env.ORCA_AFFECTED_EARLY_FAIL === '1') throw Error('early failure')
          const source = '../value'
          expect((await import(source)).value).toBe(1)
        })
      `
      )
    }
    expect(run(input, { args: knownArgs })).toEqual(expect.arrayContaining(normalize(affected)))
    expect(
      run(input, { args: knownArgs, env: { ORCA_AFFECTED_EARLY_FAIL: '1' }, code: 1 })
    ).toEqual(expect.arrayContaining(normalize(affected)))
    writeFileSync(input, 'export const value = 2')
    // Incomplete specs must run even beside >100 cold files and without a static import edge.
    expect(run(input, { code: 1 })).toEqual(expect.arrayContaining(normalize(affected)))
    expect(run(join(directory, 'unrelated.ts'), { code: 1 })).toEqual(
      expect.arrayContaining(normalize(affected))
    )
    writeFileSync(input, 'export const value = 1')
    run(input, { args: knownArgs })
    expect(run(input, { args: [...knownArgs, '--testNamePattern=absent'] })).toEqual(
      expect.arrayContaining(normalize(affected))
    )
    writeFileSync(input, 'export const value = 2')
    expect(run(input, { code: 1 })).toEqual(expect.arrayContaining(normalize(affected)))
    writeFileSync(input, 'export const value = 1')
    run(input, { args: knownArgs })

    const importer = join(directory, 'importer.ts')
    writeFileSync(importer, 'export const value = 1')
    function importerGit(...args) {
      const result = runProcessSync({ program: 'git', args, cwd: directory })
      expect(result.code, result.stderr).toBe(0)
    }
    importerGit('init', '-q')
    importerGit('config', 'user.email', 'test@example.com')
    importerGit('config', 'user.name', 'Test')
    importerGit('add', 'importer.ts')
    importerGit('commit', '-qm', 'initial importer')
    for (const file of affected) {
      writeFileSync(
        file,
        `
        import { expect, it } from 'vitest'
        import { value } from '../importer'
        it('uses an importer', () => expect(value).toBe(1))
      `
      )
    }
    run(input, { args: knownArgs })
    writeFileSync(importer, "export { value } from './value'")
    importerGit('add', 'importer.ts')
    importerGit('commit', '-qm', 'importer now depends on value')
    writeFileSync(input, 'export const value = 2')
    expect(run(input, { code: 1 })).toEqual(expect.arrayContaining(normalize(affected)))
    writeFileSync(input, 'export const value = 1')
    run(input, { args: knownArgs })

    for (const file of affected) {
      writeFileSync(
        file,
        `
        import { expect, it } from 'vitest'
        it('uses the resolved config context', () => expect(ORCA_AFFECTED_CONTEXT).toBe('good'))
      `
      )
    }
    run(input, { args: knownArgs })
    expect(run(input, { env: { ORCA_AFFECTED_CONTEXT: 'bad' }, code: 1 })).toEqual(
      expect.arrayContaining(normalize(affected))
    )

    for (const [index, file] of affected.entries()) {
      const runtimeImporter = join(directory, `mutated-importer-${index}.ts`)
      writeFileSync(runtimeImporter, 'export const value = 1')
      writeFileSync(
        file,
        `
        import { expect, it } from 'vitest'
        import { writeFileSync } from 'node:fs'
        import { value } from '../mutated-importer-${index}'
        it('edits an importer while its old graph is executing', () => {
          expect(value).toBe(1)
          writeFileSync(${JSON.stringify(runtimeImporter)}, "export { value } from './value'")
        })
      `
      )
    }
    run(input, { args: knownArgs })
    writeFileSync(input, 'export const value = 2')
    expect(run(input, { code: 1 })).toEqual(expect.arrayContaining(normalize(affected)))
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 })
  }
}, 180_000)
