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
	const [columns, rows] = (await execa.stdout('node', ['fixture.js'])).split('\n').map(Number);
	console.log('Child size:', {columns, rows});
	t.true(parseInt(columns, 10) > 0);
	t.true(parseInt(rows, 10) > 0);
});

test('no TERM env var', t => {
	process.env.TERM = undefined;
	const size = termSize();
	console.log('no TERM size:', size);
	t.true(size.columns > 0);
	t.true(size.rows > 0);
});
