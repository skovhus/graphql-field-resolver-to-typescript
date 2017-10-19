#!/usr/bin/env node

// @TODO simplify, a lot

import program = require('commander')
import { runCli } from './runCli'

function stringArray(arg: any, message: string): string[] {
  if (!arg) {
    throw new Error(`${message}: Value not set`)
  }
  if (
    (arg instanceof Array && arg.length === 0) ||
    typeof arg[0] === 'string'
  ) {
    return arg
  }
  throw new Error(message + ': Not a string[]')
}

program
  .version(require('../package.json').version)
  .description(
    'Convert all .graphql schema-files in the current directory tree into typescript\n' +
      'interfaces that can be used to implement a graphql-root for this schema.'
  )
  .option(
    '-x, --exclude <dirs>',
    'a list of directories to exclude',
    (current, last) => last.concat([current]),
    ['node_modules']
  )
  .option(
    '--dont-save-same-file',
    'do not save a file if the contents has not changed. ' +
      'This read each target file prior to loading'
  )
  .option(
    '-i, --input <files>',
    'a list of files to parse instead of globbing *.graphql',
    (current, last) => last.concat([current]),
    []
  )
  .parse(process.argv)

runCli({
  input: stringArray(program['input'], "Verification of 'input'-parameter"),
  exclude: stringArray(
    program['exclude'],
    "Verification of 'exclude'-parameter"
  ),
  dontSaveSameFile: Boolean(program['dontSaveSameFile']),
}).then(() => console.log('done'))
