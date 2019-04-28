declare namespace termSize {
	interface TermSize {
		columns: number;
		rows: number;
	}
}

/**
Reliably get the terminal window size.

@example
```
import termSize = require('term-size');

termSize();
//=> {columns: 143, rows: 24}
```
*/
declare function termSize(): termSize.TermSize;

export = termSize;
