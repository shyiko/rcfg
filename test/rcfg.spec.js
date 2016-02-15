var $HOME = require('os-homedir')();
var mock = require('mock-fs');
var path = require('path');
var expect = require('chai').expect;
var rcfg = require('../src/rcfg');

describe('rcfg', function () {
  beforeEach(function () {
    Object.keys(process.env).forEach(function (key) {
      if (!key.indexOf('app_')) {
        delete process.env[key];
      }
    });
  });
  describe('#()', function () {
    it('should merge in correct order',
      function (cb) {
        var fs = {};
        fs[$HOME] = {
          '.app.json': JSON.stringify({
            foo: {from_json: 'value'},
            shared: 'json'
          }),
          'project': {
            'package.json': JSON.stringify({app: {
              foo: {from_package_json: 'value'},
              shared: 'package.json'
            }}),
            '.apprc': [
              '#comment',
              'foo:',
              '  from_yml: value',
              'shared: yml'
            ].join('\n'),
            src: {}
          }
        };
        mock(fs, {createCwd: false});
        var o = {
          cwd: path.join($HOME, 'project', 'src'),
          def: {
            foo: {
              from_def: 'value'
            },
            shared: 'def'
          }
        };
        process.env.app_foo__from_env = 'value';
        rcfg('app', o, function (err, cfg) {
          expect(err).to.not.exist;
          expect(rcfg('app', o)).to.be.deep.equal(cfg);
          expect(cfg).to.be.deep.equal({
            foo: {
              from_json: 'value',
              from_package_json: 'value',
              from_yml: 'value',
              from_def: 'value',
              from_env: 'value'
            },
            shared: 'yml'
          });
          cb();
        });
      });
    it('should return empty object if no rc|s have been found',
      function (cb) {
        mock({});
        rcfg('app', function (err, cfg) {
          expect(err).to.not.exist;
          expect(cfg).to.be.deep.equal({});
          cb();
        });
      });
  });
  afterEach(function () {
    mock.restore();
  });
});
