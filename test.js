import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import test from 'ava';
import {execa} from 'execa';
import terminalSize from './index.js';

const ffi = process.getBuiltinModule?.('node:ffi');

// A pty is the only way to test the native path, and `node:ffi` is the only way to allocate one without extra dependencies.
const openpty = ffi && process.platform !== 'win32'
	? ffi.dlopen(null, {
		openpty: {return: 'int32', arguments: ['pointer', 'pointer', 'pointer', 'pointer', 'pointer']},
	}).functions.openpty
	: undefined;

// The native tests need `node:ffi` to allocate a pty, which is only possible off Windows.
const nativeTest = openpty ? test : test.skip;

/**
Create a pty with the given size. The descriptors stay open for the rest of the test run, so that the pty lives as long as the tests that use it.
*/
const createPty = (columns, rows) => {
	// The two ends of the pty that `openpty` returns. Typed arrays are used so that the fields follow the byte order of the host.
	const main = new Int32Array(1);
	const secondary = new Int32Array(1);
	// `openpty` requires at least 128 bytes.
	const name = new Uint8Array(128);
	// A `winsize` struct, which holds `ws_row` and `ws_col` as 16-bit integers.
	const size = new Uint16Array(4);
	size[0] = rows;
	size[1] = columns;

	if (openpty(main, secondary, name, null, size) !== 0) {
		throw new Error('Could not create a pty');
	}

	return {
		// `openpty` writes a null-terminated path into the buffer.
		name: new TextDecoder().decode(name.subarray(0, name.indexOf(0))),
		secondaryDescriptor: secondary[0],
	};
};

/**
Run `fixture-pty.js` in a fresh pty. The fixture stays a session leader and opens the pty from `name`, so the pty becomes its controlling terminal while its standard streams stay pipes. `PATH` is emptied so `tput` and `resize` can never answer instead.
*/
const runInPty = async (columns, rows, {iterations = 1, useControllingTerminal = true, stdoutIsTerminal = false, execArgv = []} = {}) => {
	const pty = createPty(columns, rows);
	const child = await execa(process.execPath, [
		...execArgv,
		'fixture-pty.js',
		useControllingTerminal ? pty.name : '',
		String(iterations),
	], {
		detached: true,
		env: {...process.env, PATH: ''},
		reject: false,
		stdio: ['ignore', stdoutIsTerminal ? pty.secondaryDescriptor : 'pipe', 'pipe'],
	});

	const report = child.stderr.split('\n').find(line => line.startsWith('report '));

	if (!report) {
		throw new Error(`The fixture did not report a size: ${child.stderr}`);
	}

	return {child, report: JSON.parse(report.slice('report '.length))};
};

// The native path loads `node:ffi`, and Node.js warns when that module is loaded.
const isFfiLoaded = child => child.stderr.includes('FFI is an experimental feature');

test('main', t => {
	const size = terminalSize();
	console.log('Main size:', size);
	t.true(size.columns > 0);
	t.true(size.rows > 0);
});

test('resize is skipped when there is no controlling tty on linux', async t => {
	if (process.platform !== 'linux') {
		t.pass();
		return;
	}

	const temporaryDirectoryRoot = path.join(process.cwd(), 'temporary');
	await fsPromises.mkdir(temporaryDirectoryRoot, {recursive: true});
	const temporaryDirectory = await fsPromises.mkdtemp(path.join(temporaryDirectoryRoot, 'terminal-size-'));
	const resizeMarkerPath = path.join(temporaryDirectory, 'resize-marker');
	const resizePath = path.join(temporaryDirectory, 'resize');
	const childScriptPath = path.join(temporaryDirectory, 'child-script.js');

	const resizeScript = `#!/bin/sh
if [ -n "$RESIZE_MARKER_PATH" ]; then
	printf '%s' called > "$RESIZE_MARKER_PATH"
fi
printf '80 24'
`;

	try {
		await fsPromises.writeFile(resizePath, resizeScript, {mode: 0o755});
		await fsPromises.chmod(resizePath, 0o755);

		const terminalSizeModuleUrl = pathToFileURL(path.join(process.cwd(), 'index.js')).href;
		const childScript = `import terminalSize from ${JSON.stringify(terminalSizeModuleUrl)};
terminalSize();
`;

		await fsPromises.writeFile(childScriptPath, childScript);

		await execa(process.execPath, [childScriptPath], {
			detached: true,
			stdio: 'ignore',
			env: {
				...process.env,
				PATH: temporaryDirectory,
				RESIZE_MARKER_PATH: resizeMarkerPath,
			},
		});

		const resizeWasCalled = fs.existsSync(resizeMarkerPath);
		t.false(resizeWasCalled);
	} finally {
		await fsPromises.rm(temporaryDirectory, {recursive: true, force: true});
	}
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

nativeTest('native: reads the controlling terminal when the standard streams are redirected', async t => {
	const {child, report} = await runInPty(120, 40);

	t.false(report.isStdoutTty);
	t.deepEqual(report.sizes, ['120x40']);
	t.is(child.exitCode, 0);
	t.true(isFfiLoaded(child));
});

nativeTest('native: reads the size of each terminal separately', async t => {
	const first = await runInPty(121, 41);
	const second = await runInPty(77, 33);

	t.deepEqual(first.report.sizes, ['121x41']);
	t.deepEqual(second.report.sizes, ['77x33']);
});

nativeTest('native: reads unusual sizes', async t => {
	const tiny = await runInPty(1, 1);
	const wide = await runInPty(255, 65);
	const huge = await runInPty(1000, 500);

	t.deepEqual(tiny.report.sizes, ['1x1']);
	t.deepEqual(wide.report.sizes, ['255x65']);
	t.deepEqual(huge.report.sizes, ['1000x500']);
});

nativeTest('native: returns a stable size and does not leak file descriptors', async t => {
	const native = await runInPty(120, 40, {iterations: 50});

	t.deepEqual(native.report.sizes, ['120x40']);
	t.is(native.report.descriptorsAfter, native.report.descriptorsBefore);

	// `devTty` opens a stream for every call and never closes it, so the stable count above is what proves the native path did the reads.
	const fallback = await runInPty(120, 40, {iterations: 50, execArgv: ['--no-experimental-ffi']});

	t.deepEqual(fallback.report.sizes, ['120x40']);
	t.true(fallback.report.descriptorsAfter > fallback.report.descriptorsBefore);
});

nativeTest('native: is not loaded when the size is available from standard output', async t => {
	const {child, report} = await runInPty(121, 41, {stdoutIsTerminal: true});

	t.true(report.isStdoutTty);
	t.deepEqual(report.sizes, ['121x41']);
	t.false(isFfiLoaded(child));
});

nativeTest('native: falls back to the other sources with `--no-experimental-ffi`', async t => {
	const {child, report} = await runInPty(120, 40, {execArgv: ['--no-experimental-ffi']});

	t.deepEqual(report.sizes, ['120x40']);
	t.false(isFfiLoaded(child));
});

nativeTest('native: falls back to the default size when there is no controlling terminal', async t => {
	const {child, report} = await runInPty(120, 40, {useControllingTerminal: false});

	t.deepEqual(report.sizes, ['80x24']);
	t.is(child.exitCode, 0);
});

nativeTest('native: does not throw when the permission model blocks it', async t => {
	const child = await execa(process.execPath, ['--permission', `--allow-fs-read=${process.cwd()}`, 'fixture.js'], {
		env: {...process.env, PATH: ''},
		reject: false,
	});

	// The native path is blocked, but the module still returns a usable size.
	t.true(isFfiLoaded(child));
	t.is(child.exitCode, 0);
	const [columns, rows] = child.stdout.split('\n').map(line => Number.parseInt(line, 10));
	t.true(columns > 0);
	t.true(rows > 0);
});
