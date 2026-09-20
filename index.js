import process from 'node:process';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import tty from 'node:tty';

const defaultColumns = 80;
const defaultRows = 24;

// eslint-disable-next-line no-bitwise
const ttyOpenFlags = process.platform === 'darwin' ? fs.constants.O_EVTONLY | fs.constants.O_NONBLOCK : fs.constants.O_NONBLOCK;

const exec = (command, arguments_, {shell, env} = {}) =>
	execFileSync(command, arguments_, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
		timeout: 500,
		shell,
		env,
	}).trim();

const create = (columns, rows) => ({
	columns: Number.parseInt(columns, 10),
	rows: Number.parseInt(rows, 10),
});

const createIfNotDefault = (maybeColumns, maybeRows) => {
	const {columns, rows} = create(maybeColumns, maybeRows);

	if (Number.isNaN(columns) || Number.isNaN(rows)) {
		return;
	}

	if (columns === defaultColumns && rows === defaultRows) {
		return;
	}

	return {columns, rows};
};

const isForegroundProcess = () => {
	if (process.platform !== 'linux') {
		return true;
	}

	try {
		const statContents = fs.readFileSync('/proc/self/stat', 'utf8');
		const closingParenthesisIndex = statContents.lastIndexOf(') ');

		if (closingParenthesisIndex === -1) {
			return false;
		}

		const statFields = statContents.slice(closingParenthesisIndex + 2).trim().split(/\s+/);
		const processGroupId = Number.parseInt(statFields[2], 10);
		const foregroundProcessGroupId = Number.parseInt(statFields[5], 10);

		if (Number.isNaN(processGroupId) || Number.isNaN(foregroundProcessGroupId)) {
			return false;
		}

		if (foregroundProcessGroupId <= 0) {
			return false;
		}

		return processGroupId === foregroundProcessGroupId;
	} catch {
		return false;
	}
};

/**
Read the terminal size from the controlling terminal with the `ioctl` syscall.
*/
const createTtySizeReader = ffi => {
	// `node:ffi` passes arguments in registers, but Darwin passes variadic arguments on the stack, so `ioctl` cannot be called. `__ioctl` is the non-variadic syscall stub.
	const symbol = process.platform === 'darwin' ? '__ioctl' : 'ioctl';
	// `TIOCGWINSZ` asks for the `winsize` struct. The request value differs per platform.
	const request = process.platform === 'darwin' ? 0x40_08_74_68n : 0x54_13n;

	const {functions} = ffi.dlopen(null, {
		[symbol]: {return: 'int32', arguments: ['int32', 'uint64', 'pointer']},
	});

	const ioctl = functions[symbol];
	// One `winsize` struct for the whole process. The kernel writes the size into it and it is read back right after the call, so nothing can free it in between. It starts with `ws_row` and `ws_col` as 16-bit integers, which the typed array reads in the native byte order.
	const size = new Uint16Array(4);

	return () => {
		let descriptor;

		try {
			descriptor = fs.openSync('/dev/tty', ttyOpenFlags);
		} catch {
			// There is no controlling terminal, or the path is not readable.
			return;
		}

		try {
			if (ioctl(descriptor, request, size) !== 0) {
				return;
			}

			const [rows, columns] = size;

			if (columns === 0 || rows === 0) {
				return;
			}

			return {columns, rows};
		} finally {
			fs.closeSync(descriptor);
		}
	};
};

/**
Read the terminal size from the console with `kernel32`. `CONOUT$` is the Windows equivalent of `/dev/tty`.
*/
const createConsoleSizeReader = ffi => {
	const {functions} = ffi.dlopen('kernel32.dll', {
		CreateFileA: {return: 'pointer', arguments: ['string', 'uint32', 'uint32', 'pointer', 'uint32', 'uint32', 'pointer']},
		GetConsoleScreenBufferInfo: {return: 'int32', arguments: ['pointer', 'pointer']},
		CloseHandle: {return: 'int32', arguments: ['pointer']},
	});

	const {CreateFileA: createFileA, GetConsoleScreenBufferInfo: getConsoleScreenBufferInfo, CloseHandle: closeHandle} = functions;

	// `CONSOLE_SCREEN_BUFFER_INFO` is 22 bytes of 16-bit fields, and `srWindow` is the fifth field, so the typed array indexes it from 5. Windows is always little-endian.
	const info = new Int16Array(11);
	const genericRead = 0x80_00_00_00;
	const shareReadWrite = 3;
	const openExisting = 3;

	return () => {
		const handle = createFileA('CONOUT$', genericRead, shareReadWrite, null, openExisting, 0, null);

		if (handle === 0n || handle === 0xFF_FF_FF_FF_FF_FF_FF_FFn) {
			return;
		}

		try {
			if (getConsoleScreenBufferInfo(handle, info) === 0) {
				return;
			}

			// `srWindow` is the visible window inside the screen buffer.
			const [left, top, right, bottom] = info.subarray(5, 9);
			const columns = right - left + 1;
			const rows = bottom - top + 1;

			if (columns <= 0 || rows <= 0) {
				return;
			}

			return {columns, rows};
		} finally {
			closeHandle(handle);
		}
	};
};

const createNativeSizeReader = () => {
	const ffi = process.getBuiltinModule?.('node:ffi');

	if (!ffi) {
		// `node:ffi` is enabled by default in Node.js 26.9.0 or later, needs `--experimental-ffi` in earlier releases, and is turned off with `--no-experimental-ffi`.
		return;
	}

	return process.platform === 'win32' ? createConsoleSizeReader(ffi) : createTtySizeReader(ffi);
};

let nativeSizeReader;

const nativeSize = () => {
	try {
		// `node:ffi` is loaded on first use, so that its experimental warning only shows when this path is needed.
		nativeSizeReader ??= createNativeSizeReader();

		return nativeSizeReader?.();
	} catch {
		// The native symbols are not available in every build, the permission model blocks loading them without `--allow-ffi`, and the fallbacks below handle the rest.
	}
};

export default function terminalSize() {
	const {env, stdout, stderr} = process;

	if (stdout?.columns && stdout?.rows) {
		return create(stdout.columns, stdout.rows);
	}

	if (stderr?.columns && stderr?.rows) {
		return create(stderr.columns, stderr.rows);
	}

	// These values are static, so not the first choice.
	if (env.COLUMNS && env.LINES) {
		return create(env.COLUMNS, env.LINES);
	}

	const fallback = {
		columns: defaultColumns,
		rows: defaultRows,
	};

	if (process.platform === 'win32') {
		// We include `tput` for Windows users using Git Bash, where the process can have a hidden console that is not the terminal the user sees.
		return tput() ?? nativeSize() ?? fallback;
	}

	if (process.platform === 'darwin') {
		return nativeSize() ?? devTty() ?? tput() ?? fallback;
	}

	return nativeSize() ?? devTty() ?? tput() ?? resize() ?? fallback;
}

const devTty = () => {
	try {
		// eslint-disable-next-line new-cap
		const {columns, rows} = tty.WriteStream(fs.openSync('/dev/tty', ttyOpenFlags));
		return {columns, rows};
	} catch {}
};

// On macOS, this only returns correct values when stdout is not redirected.
const tput = () => {
	try {
		// `tput` requires the `TERM` environment variable to be set.
		const columns = exec('tput', ['cols'], {env: {TERM: 'dumb', ...process.env}});
		const rows = exec('tput', ['lines'], {env: {TERM: 'dumb', ...process.env}});

		if (columns && rows) {
			return createIfNotDefault(columns, rows);
		}
	} catch {}
};

// Only exists on Linux.
const resize = () => {
	// `resize` is preferred as it works even when all file descriptors are redirected
	// https://linux.die.net/man/1/resize
	try {
		if (!isForegroundProcess()) {
			return;
		}

		const size = exec('resize', ['-u']).match(/\d+/g);

		if (size.length === 2) {
			return createIfNotDefault(size[0], size[1]);
		}
	} catch {}
};
