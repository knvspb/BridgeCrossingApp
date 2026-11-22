// Подключение ядра в Node: те же файлы, что и в браузере, в том же порядке.
const path = require('path');
['bca', 'soils', 'soildb', 'soilcat', 'catalogs', 'profile', 'hydraulics', 'hydrology', 'topo', 'schema', 'export', 'dataio'].forEach(f => {
  try { require(path.join(__dirname, '..', 'core', f + '.js')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
});
module.exports = globalThis.BCA;
