import process from 'node:process';
import test from 'ava';
import {execa} from 'execa';
import terminalSize from './index.js';

test('main', t => {
	const size = terminalSize();
	console.log('Main size:', size);
	t.true(size.columns > 0);
	t.true(size.rows > 0);
});

test('child', async t => {
	const {stdout} = await execa('node', ['fixture.js']);
	const [columns, rows] = stdout.split('\n').map(line => Number.parseInt(line, 10));
	console.log('Child size:', {columns, rows});
	t.true(Number.parseInt(columns, 10) > 0);
	t.true(Number.parseInt(rows, 10) > 0);
});

test('no TERM environment variable', t => {
	const envTerm = process.env.TERM;
	process.env.TERM = undefined;
	const size = terminalSize();
	process.env.TERM = envTerm;

	console.log('Size with no $TERM:', size);
	t.true(size.columns > 0);
	t.true(size.rows > 0);
});
