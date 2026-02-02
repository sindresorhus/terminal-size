import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import test from 'ava';
import {execa} from 'execa';
import terminalSize from './index.js';

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
