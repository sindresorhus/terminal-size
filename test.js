import test from 'ava';
import execa from 'execa';
import m from '.';

test('main', t => {
	const size = m();
	console.log('main size:', size);
	t.true(size.columns > 0);
	t.true(size.rows > 0);
});

test('child', async t => {
	const [columns, rows] = (await execa.stdout('node', ['fixture.js'])).split('\n').map(Number);
	console.log('child size:', {columns, rows});
	t.true(parseInt(columns, 10) > 0);
	t.true(parseInt(rows, 10) > 0);
});
