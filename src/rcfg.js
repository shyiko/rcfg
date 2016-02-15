var async = require('async');
var deepMerge = require('lodash.merge');
var flatten = require('lodash.flattendeep');
var uniq = require('lodash.uniq');
var pluck = require('lodash.pluck');
var up = require('findup');
var obj = require('object-path');
var $HOME = require('os-homedir')();
var yaml = require('yaml-js').load;
var json = JSON.parse;
var def = Boolean;
var path = require('path');
var fs = require('fs');
var util = require('util');

var debug = util.debuglog('rcfg');

/**
 * @param {string} name application name
 *
 * @param {Object} [o] options
 * @param {string} [o.cwd] working dir (default - process.cwd())
 * @param {Source[]|function(default: Source[]): Source[]} [o.src] sources
 * @param {Format[]|function(default: Format[]): Format[]} [o.fmt] formats
 * @param {Object} [o.def] defaults
 * @param {Object} [o.pkgField] field name in package.json (default -
 *   application name)
 * @param {function({meta: {source: string}, data: Object}[]): Object} [o.merge]
 *   function used to merge data from the resolved sources
 *
 * @param {function(err: Error, cfg: Object)} [cb]
 *   callback (if not provided - function will be executed synchronously)
 *
 * @return result (if executed synchronously)
 *
 * @typedef {(string|Object|function(name, o, cb)|Source[])} Source
 * @typedef {{ext: string, parser: function(input): output}} Format
 */
module.exports = function (name, o, cb) {
  typeof o === 'function' && (cb = o, o = {});
  o.cwd || (o.cwd = process.cwd());
  o.fmt = aro(o.fmt, [{ext: 'json', parser: json},
    {ext: ['yml', 'yaml'], parser: yaml}]);
  var ext = uniq(flatten(pluck(o.fmt, 'ext')));
  var _nm = '.' + name;
  var _rc = '.' + name + 'rc';
  var src = flatten(aro(o.src, [
    env, // ${name}_key(__anotherkey)?
    cli, // --config <file>
    loc(vry(_rc, [_rc, _nm], ext)), // closest .${name}rc
    pkg, // package.json[name]
    vry(path.join($HOME, _rc), [_rc, _nm], ext),
    vry(path.join($HOME, _nm, 'config'), ext),
    vry(path.join($HOME, '.config', name + 'rc'), [name + 'rc', name], ext),
    vry(path.join($HOME, '.config', name, 'config'), ext),
    process.platform !== 'win32' && [
      vry('/etc/' + name + 'rc', [name + 'rc', name], ext),
      vry('/etc/' + name + '/config', ext)
    ],
    o.def && {meta: {source: 'def'}, data: o.def}
  ])).filter(def);
  var mrg = (function (mrg) {
    return function (arr) {
      debug('Merging ' + JSON.stringify(arr));
      return mrg(arr);
    };
  }(o.merge || merge));
  if (cb) {
    async.waterfall([
      // resolve dynamic sources (function(o,cb))
      function (cb) {
        async.map(src,
          function (v, cb) {
            typeof v === 'function' ? v(name, o, cb) : cb(null, v);
          },
          cb);
      },
      // load files (represented as strings)
      function (rs, cb) {
        async.map(flatten(rs),
          function (v, cb) {
            typeof v === 'string' ? file(v, o, cb) : cb(null, v);
          },
          cb);
      }
    ], function (err, ar) {
      err ? cb(err) : cb(null, mrg(ar.filter(def)));
    });
  } else {
    var rs = src
      .map(function (v) { return typeof v === 'function' ? v(name, o) : v; });
    var ar = flatten(rs)
      .map(function (v) { return typeof v === 'string' ? file(v, o) : v; });
    return mrg(ar.filter(def));
  }
};

module.exports.vry = vry;
module.exports.env = env;
module.exports.cli = cli;
module.exports.loc = loc;
module.exports.pkg = pkg;
module.exports.merge = merge;
module.exports.file = file;

/**
 * if val is a function - decorate, otherwise return val
 * (or def if val is undefined)
 */
function aro(val, def) {
  return val ? (typeof val === 'function' ? val(def) : [].concat(val)) : def;
}

/**
 * variate src based on possible extensions
 */
function vry(src, basename, ext) {
  ext || (ext = basename, basename = path.basename(src));
  var base = [].concat(basename);
  return flatten([src].concat(base.map(function (base) {
    return ext.map(function (ext) {
      return path.join(path.dirname(src), base + '.' + ext);
    });
  })));
}

function env(name, o, cb) {
  var r = {meta: {source: 'env'}, data: {}};
  var prefix = name + '_';
  Object.keys(process.env).forEach(function (key) {
    if (!key.indexOf(prefix)) {
      obj.set(r.data, key.slice(prefix.length).split('__').join('.'),
        process.env[key]);
    }
  });
  return cb ? cb(null, r) : r;
}

function cli(name, o, cb) {
  var i = process.argv.indexOf('--config');
  var f = ~i && process.argv[i + 1];
  if (!f) { return cb && cb(); }
  if (cb) {
    file(f, o, function (err, rs) {
      err || !rs ? cb(err || new Error('Failed to load ' + f))
        : (rs.source = 'cli', cb(null, rs));
    });
  } else {
    var rs = file(f, o);
    if (!rs) { throw new Error('Failed to load ' + f); }
    rs.source = 'cli';
    return rs;
  }
}

/**
 * @param {string|string[]} filename
 * @returns {Function} function which emits file closest to o.cwd (search stops
 * on package.json (if any))
 */
function loc(filename) {
  var f = [].concat(filename);
  return function loc(name, o, cb) {
    if (cb) {
      up(o.cwd, 'package.json',
        function (err, pkgdir) { // eslint-disable-line handle-callback-err
          var res;
          async.some(f,
            function (f, cb) {
              up(o.cwd, f, function (err, d) {
                cb(!err && (!pkgdir || pkgdir <= d) && (res = path.join(d, f)));
              });
            },
            function () { cb(null, res); });
        });
    } else {
      try { var pkgdir = up.sync(o.cwd, 'package.json'); } catch (e) {}
      var res;
      return f.some(function (f) {
        try {
          var d = up.sync(o.cwd, f);
        } catch (e) {
          return false;
        }
        return (!pkgdir || pkgdir <= d) && (res = path.join(d, f));
      }) && res;
    }
  };
}

function pkg(name, o, cb) {
  function unwrap(rs) {
    if (rs) {
      rs.source = 'pkg';
      rs.data = rs.data[o.pkgField || name] || {};
    }
    return rs;
  }
  if (cb) {
    up(o.cwd, 'package.json', function (err, pkgdir) {
      if (err) {
        debug('package.json wasn\'t loaded (' + err.message + ')');
        return cb();
      }
      file(path.join(pkgdir, 'package.json'), o,
        function (err, rs) { cb(err, unwrap(rs)); });
    });
  } else {
    try {
      var pkgdir = up.sync(o.cwd, 'package.json');
    } catch (e) {
      debug('package.json wasn\'t loaded (' + e.message + ')');
      return;
    }
    return unwrap(file(path.join(pkgdir, 'package.json'), o));
  }
}

function merge(arr) {
  return deepMerge.apply(null, [{}].concat(pluck(arr, 'data').reverse()));
}

/**
 * error emitted only in case of failed parsing (and only after all possible
 * parsers have been tried)
 */
function file(file, o, cb) {
  if (cb) {
    fs.readFile(file, 'utf8', function (err, data) {
      if (err) {
        debug(err.message);
        return cb();
      }
      var r = parse(data, file, o);
      if (!r) {
        return cb(new Error('Failed to parse ' + file));
      }
      debug('Loaded ' + file);
      cb(null, r);
    });
  } else {
    try {
      var data = fs.readFileSync(file, 'utf8');
    } catch (e) {
      debug(e.message);
      return;
    }
    var r = parse(data, file, o);
    if (!r) {
      throw new Error('Failed to parse ' + file);
    }
    debug('Loaded ' + file);
    return r;
  }
}

function parse(data, file, o) {
  var ext = path.extname(file).slice(1);
  var fmt = o.fmt.filter(function (fmt) {
    return !fmt.ext || ~[].concat(fmt.ext).indexOf(ext);
  });
  fmt.length || (fmt = o.fmt);
  var r = {meta: {source: 'file', file: file}};
  return fmt.some(function (fmt) {
    try { r.data = fmt.parser(data); return true; } catch (e) { return false; }
  }) && r;
}
