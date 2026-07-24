import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import terminalSize from './index.js';

if (process.argv.includes('--measure')) {
	const countFileDescriptors = () => fs.readdirSync('/dev/fd').length;
	let size = terminalSize();
	await new Promise(resolve => {
		setImmediate(resolve);
	});

	const before = countFileDescriptors();

	for (let index = 0; index < 20; index++) {
		size = terminalSize();
	}

	await new Promise(resolve => {
		setImmediate(resolve);
	});

	const after = countFileDescriptors();
	fs.writeFileSync(process.env.RESULT_PATH, JSON.stringify({before, after, size}));
} else {
	const environment = {...process.env};
	delete environment.COLUMNS;
	delete environment.LINES;

	const {status} = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--measure'], {
		env: environment,
		stdio: 'ignore',
	});

	process.exitCode = status ?? 1;
}
