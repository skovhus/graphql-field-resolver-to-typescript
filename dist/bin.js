#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = require(".");
const meow = require("meow");
const fs = require("fs");
const util_1 = require("util");
const getStdin = require("get-stdin");
const cli = meow([
    'Usage:',
    '  $ gqlfr2ts <input>',
    '',
    'Options:',
    '  --output, -o path  Specifies the name and location of the output file. If not specified, stdout is used.',
    '',
    'Examples:',
    '  $ gqlfr2ts schema.graphql',
    '    Processes the file schema.graphql and prints to stdout',
    '  $ cat schema.graphql | gqlfr2ts --output schema.d.ts',
    '    Processes the input from stdin and writes output to schema.d.ts',
    '  $ gqlfr2ts RootQuery.graphql User.graphql --output schema.d.ts',
    '    Stitch a schema together and output a complete typescript definition for all the related resolvers',
    '  $ cat **/*.graphql | gqlfr2ts > schema.d.ts',
    '    Stitch a schema together from stdin and pipe it to stdout and use the shell to write output to file.',
    '    This is the fastest way to do it when you have a lot of files that combine to a big schema.',
], {
    string: ['output'],
    alias: { o: 'output', h: 'help' },
});
const readFileAsync = util_1.promisify(fs.readFile);
const writeFileAsync = util_1.promisify(fs.writeFile);
// most amazing trick ever, since node don't allow `await` on the top level 😜
const run = async () => {
    let schema;
    if (cli.input.length > 0) {
        const schemas = await Promise.all(cli.input.map(async (file) => {
            const buffer = await readFileAsync(file);
            return buffer.toString();
        }));
        schema = schemas.join('\n\n');
    }
    else {
        schema = await getStdin();
    }
    if (!schema.trim()) {
        cli.showHelp();
    }
    const converter = new _1.Converter();
    const output = await converter.convert(schema);
    if (cli.flags.output) {
        return await writeFileAsync(cli.flags.output, output);
    }
    else {
        console.log(output);
    }
};
// Run, Forrest, run!!! 🏃
run();
