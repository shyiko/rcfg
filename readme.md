# rcfg

[![Build Status](https://travis-ci.org/shyiko/rcfg.svg?branch=master)](https://travis-ci.org/shyiko/rcfg)

Search for configurable package.json-aware sync/async [rc](https://github.com/dominictarr/rc) alternative ends here.

## Installation

```
npm i rcfg --save
```

## Usage

```javascript
var rc = require('rcfg');

// load synchronously (looks for .apprc, <package.json as JSON>['app'], ...)
// (for complete list of sources see "Defaults" -> "Load order"))
var cfg = rc('app');

// load asynchronously
rc('app', function (err, cfg) { ... })
rc('app', {cwd: '/something/other/than/process.cwd()'}, function (err, cfg) { ... })
```

You might want to use `rcfg` together with 
[object-path](https://github.com/mariocasciaro/object-path) (or similar), like so:

```javascript
var cfg = require("object-path")(require('rcfg')('app'));

// check that path exists
cfg.has('key.nested_key.another_nested_key');

// get deep property (with optional default value)
cfg.get('key.nested_key.another_nested_key', 'default_value')

// get the first non-undefined value
cfg.coalesce(['a.b', 'a.c.d'], 'default_value');
```

### Defaults

#### Load order

> sources higher in the list take precedence over those located lower

* env variables: `${name}_key(__anotherkey)?`

  > example: `name_foo__bar__baz=qux` translates to `{foo: {bar: {baz: "qux"}}}`

* command line: `--config <file>`
* closest `.${name}rc`\* (search will stop on reaching `package.json`)
* closest `package.json` (content of `[pkgField || name]`)
* `~/.${name}rc`\*
* `~/.${name}/config`\***
* `~/.config/${name}rc`\**
* `~/.config/${name}/config`\***
* `/etc/${name}rc`\**
* `/etc/${name}/config`\***
* defaults (`rcfg('name', {def: {foo: {bar: "baz"}}})`)

\* or `.${name}rc.{json,yml,yaml}`, `.${name}.{json,yml,yaml}`  
\** or `${name}rc.{json,yml,yaml}`, `${name}.{json,yml,yaml}`  
\*** `config.json`, `config.{yml,yaml}` will be tried too

This list is controlled by `src` option.

#### Formats

Config files can be written in `json` or `yaml`. Additional file types 
can be registered using `fmt` option. For example, in order to support 
[toml](https://github.com/toml-lang/toml) all you need to do is:

```javascript
var toml = require('toml');

var cfg = rc('name', {
  fmt: function (def) {
    return def.concat({ext: 'toml', parser: toml.parse});
  }
});
```

#### Merge strategy

[deep](https://www.youtube.com/watch?v=GBFwXoyjU2E) (e.g. ~/.apprc 
`{foo: {bar: {baz: 1}}, dox: -3}` + .apprc `{foo: {bar: {qux: 2}}, dox: 3}` = 
`{foo: {bar: {baz: 1, qux: 2}}, dox: 3}`). Can be overwritten with `merge` option.

## License

[MIT License](https://github.com/shyiko/rcfg/blob/master/mit.license)
