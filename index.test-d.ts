import {expectType} from 'tsd';
import terminalSize, {type TerminalSize} from './index.js';

const size: TerminalSize = terminalSize();
expectType<number>(size.columns);
expectType<number>(size.rows);
