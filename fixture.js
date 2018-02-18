'use strict';
const termSize = require('.');

const size = termSize();
console.log(`${size.columns}\n${size.rows}`);
