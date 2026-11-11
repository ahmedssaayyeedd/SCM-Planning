import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'https://github.com/ahmedssaayyeedd/SCM-Planning.git'
const BRANCH = 'main'
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const replace = args.includes('--replace')
const message = args.find(arg => !arg.startsWith('--'))
  || `Update PharmaPlan ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

function runGit(gitArgs) {
  console.log(`> git ${gitArgs.join(' ')}`)
  const result = spawnSync('git', gitArgs, { cwd: PROJECT_ROOT, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`git ${gitArgs[0]} failed with exit code ${result.status}.`)
}

function gitOutput(gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function gitSucceeds(gitArgs) {
  return spawnSync('git', gitArgs, {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
  }).status === 0
}

function isEnvironmentFile(file) {
  const name = file.split(/[\\/]/).pop()
  return /^\.env(?:$|\.)/.test(name) && name !== '.env.example'
}

function publish() {
  if (!existsSync(resolve(PROJECT_ROOT, 'package.json'))) {
    throw new Error('Could not find package.json. Run this task from the PharmaPlan project.')
  }

  if (!gitSucceeds(['--version'])) {
    throw new Error('Git is not installed. Install it from https://git-scm.com and retry.')
  }

  if (!existsSync(resolve(PROJECT_ROOT, '.git'))) {
    runGit(['init'])
  }
  runGit(['branch', '-M', BRANCH])

  const origin = gitSucceeds(['remote', 'get-url', 'origin'])
    ? gitOutput(['remote', 'get-url', 'origin'])
    : null
  if (origin && origin.replace(/\.git$/, '') !== REPO.replace(/\.git$/, '')) {
    throw new Error(`origin points to ${origin}, not ${REPO}. Update the REPO value before publishing.`)
  }
  if (!origin) runGit(['remote', 'add', 'origin', REPO])

  const trackedEnvironmentFiles = gitOutput(['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .filter(isEnvironmentFile)
  if (trackedEnvironmentFiles.length > 0) {
    throw new Error(`Refusing to publish environment file(s): ${trackedEnvironmentFiles.join(', ')}`)
  }

  runGit(['add', '-A'])
  const stagedEnvironmentFiles = gitOutput(['diff', '--cached', '--name-only', '-z'])
    .split('\0')
    .filter(Boolean)
    .filter(isEnvironmentFile)
  if (stagedEnvironmentFiles.length > 0) {
    throw new Error(`Refusing to publish environment file(s): ${stagedEnvironmentFiles.join(', ')}`)
  }

  if (!gitSucceeds(['diff', '--cached', '--quiet'])) {
    runGit(['commit', '-m', message])
  } else {
    console.log('Nothing new to commit.')
  }

  runGit(['fetch', 'origin'])
  runGit(['branch', '-M', BRANCH])

  const pushArgs = ['push', '-u', 'origin', BRANCH]
  if (replace) pushArgs.push('--force-with-lease')
  try {
    runGit(pushArgs)
  } catch (error) {
    if (!replace) {
      console.error('\nPush failed. Check the Git output above.')
      console.error('If it was rejected because remote history differs, use the replace task only if you intend to overwrite remote main.')
    }
    throw error
  }

  console.log(`\nPublished to ${REPO.replace(/\.git$/, '')}.`)
}

publish().catch(error => {
  console.error(`\nPublish failed: ${error.message}`)
  process.exitCode = 1
})
