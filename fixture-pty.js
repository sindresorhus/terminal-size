import process from 'node:process';
import fs from 'node:fs';
import terminalSize from './index.js';

// The terminal size must come from the terminal, not from the environment.
delete process.env.COLUMNS;
delete process.env.LINES;

// The test runner spawns this fixture as a session leader. Opening the pty makes it the controlling terminal, so `/dev/tty` points at it.
if (process.argv[2]) {
	fs.openSync(process.argv[2]);
}

const countDescriptors = () => fs.readdirSync('/dev/fd').length;
const descriptorsBefore = countDescriptors();
const iterations = Number(process.argv[3]) || 1;
const sizes = [];

for (let index = 0; index < iterations; index++) {
	const {columns, rows} = terminalSize();
	sizes.push(`${columns}x${rows}`);
}

// Standard output can be the terminal itself, so the report goes to standard error.
process.stderr.write(`report ${JSON.stringify({
	descriptorsAfter: countDescriptors(),
	descriptorsBefore,
	isStdoutTty: Boolean(process.stdout.isTTY),
	sizes: [...new Set(sizes)],
})}\n`);
