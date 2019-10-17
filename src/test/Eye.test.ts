import Eye from '../eye';
import * as path from 'path';
import * as fs from 'fs';

const context = path.join(__dirname, '/data/context.n3');
const rules = path.join(__dirname, '/data/rules.n3');
const output = path.join(__dirname, '/data/output.n3');

test('Eye instance', () => {
  expect(new Eye()).toBeInstanceOf(Eye);

});

test('call should return a promise', () => {
  const eye = new Eye();
  return expect(eye.call([context], rules)).resolves.toBe(fs.readFileSync(output, { encoding: 'UTF-8' }));
});

test('callTmp should return temp file', () => {
  const eye = new Eye();
  return expect(eye.callTmp([context], rules)).resolves.toHaveProperty('path');
});