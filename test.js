import test from 'ava';
import execa from 'execa';
import termSize from '.';

test('main', t => {
	const size = termSize();
	console.log('Main size:', size);
	t.true(size.columns > 0);
	t.true(size.rows > 0);
});

test('child', async t => {
	const {stdout} = await execa('node', ['fixture.js']);
	const [columns, rows] = stdout.split('\n').map(Number);
	console.log('Child size:', {columns, rows});
	t.true(parseInt(columns, 10) > 0);
	t.true(parseInt(rows, 10) > 0);
});

test('no TERM environment variable', t => {
	const envTerm = process.env.TERM;
	process.env.TERM = undefined;
	const size = termSize();
	process.env.TERM = envTerm;

	console.log('Size with no $TERM:', size);
	t.true(size.columns > 0);
	t.true(size.rows > 0);
});
