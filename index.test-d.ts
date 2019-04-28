import {expectType} from 'tsd';
import termSize = require('.');

const size: termSize.TermSize = termSize();
expectType<number>(size.columns);
expectType<number>(size.rows);
