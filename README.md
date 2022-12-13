# EYE.js: the TypeScript wrapper for the EYE reasoner

Executes the [Eye N3 reasoner]() and returns the result as a promise.

## Installation

First install Eye from https://github.com/josd/eye.

Install from npm with `npm install eyereasonerjs`.

```typescript


import Eye from 'eyereasonerjs'

const eye = new Eye();

await eye.query(['context.n3'], 'query.n3q', ['--pass-all-ground']); //Returns query result as a string and --pass-all-ground flag
await eye.queryFile(['context.n3'], 'query.n3q', 'someFile.n3'); //Writes the result to a file (e.g. someFile.n3) and returns the file path.
await eye.queryTmp(['context.n3'], 'query.n3q'); //Writes the result to a temporary file and returns a {fd, path, cleanup} object (https://www.npmjs.com/package/tmp-promise).

await eye.pass(['context.n3']); //Returns closure result as a string

```
