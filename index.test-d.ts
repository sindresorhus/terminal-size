import {expectType} from 'tsd';
import terminalSize = require('.');

const size: terminalSize.Size = terminalSize();
expectType<number>(size.columns);
expectType<number>(size.rows);
