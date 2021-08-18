import terminalSize from './index.js';

const {columns, rows} = terminalSize();
console.log(`${columns}\n${rows}`);
