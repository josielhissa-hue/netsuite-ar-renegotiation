'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'FileCabinet', 'SuiteScripts', 'jh_ar_renegotiation');

function load(file, mocks = {}) {
  const full = path.join(SRC, file.endsWith('.js') ? file : `${file}.js`);
  let exported;
  const define = (deps, factory) => {
    const resolved = deps.map((d) => {
      if (d.startsWith('./')) return load(d.slice(2), mocks);
      if (!(d in mocks)) throw new Error(`Missing mock for ${d}`);
      return mocks[d];
    });
    exported = factory(...resolved);
  };
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), { define, Math, Date, JSON, Number, String, Set, Map, Array, Object, Error, parseInt, parseFloat, isFinite }, { filename: full });
  return exported;
}

module.exports = { load };
