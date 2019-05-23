'use strict';
const {spawnSync} = require('child_process');
const path = require('path');
const stripEof = require('strip-eof');

const spawn = (cmd, args) => stripEof(spawnSync(cmd, args || [], {encoding: 'utf8'}).stdout);

const spawnSh = cmd => spawn('/bin/sh', ['-c', `"${cmd}"`]);

const create = (columns, rows) => ({
	columns: parseInt(columns, 10),
	rows: parseInt(rows, 10)
});

module.exports = () => {
	const {env, stdout, stderr} = process;

	if (stdout && stdout.columns && stdout.rows) {
		return create(stdout.columns, stdout.rows);
	}

	if (stderr && stderr.columns && stderr.rows) {
		return create(stderr.columns, stderr.rows);
	}

	// These values are static, so not the first choice
	if (env.COLUMNS && env.LINES) {
		return create(env.COLUMNS, env.LINES);
	}

	if (process.platform === 'win32') {
		try {
			// Binary: https://github.com/sindresorhus/win-term-size
			const size = spawn(path.join(__dirname, 'vendor/windows/term-size.exe')).split(/\r?\n/);

			if (size.length === 2) {
				return create(size[0], size[1]);
			}
		} catch (_) {}
	} else {
		if (process.platform === 'darwin') {
			try {
				// Binary: https://github.com/sindresorhus/macos-term-size
				const size = spawnSh(path.join(__dirname, 'vendor/macos/term-size')).split(/\r?\n/);

				if (size.length === 2) {
					return create(size[0], size[1]);
				}
			} catch (_) {}
		}

		// `resize` is preferred as it works even when all file descriptors are redirected
		// https://linux.die.net/man/1/resize
		try {
			const size = spawn('resize', ['-u']).match(/\d+/g);

			if (size.length === 2) {
				return create(size[0], size[1]);
			}
		} catch (_) {}

		try {
			const columns = spawn('tput', ['cols']);
			const rows = spawn('tput', ['lines']);

			if (columns && rows) {
				return create(columns, rows);
			}
		} catch (_) {}
	}

	return create(80, 24);
};
