export interface TerminalSize {
	columns: number;
	rows: number;
}

/**
Reliably get the terminal window size.

@example
```
import terminalSize from 'term-size';

terminalSize();
//=> {columns: 143, rows: 24}
```
*/
export default function terminalSize(): TerminalSize;
