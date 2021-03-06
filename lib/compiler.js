var fnToString = require('./bemxjst/utils').fnToString;
var readFileSync = require('fs').readFileSync;
var engines = {
  bemhtml: require('./bemhtml'),
  bemtree: require('./bemtree')
};
var bundles = {
  bemhtml: readFileSync(require.resolve('./bemhtml/bundle'), 'utf8'),
  bemtree: readFileSync(require.resolve('./bemtree/bundle'), 'utf8')
};
var EOL = require('os').EOL;

function Compiler(engineName) {
  this.engineName = engineName;
}

function getCode(code, isRuntimeLint) {
  return fnToString(code) +
    ';' +
    (isRuntimeLint ? fnToString(require('../runtime-lint')) : '');
}

function getDeps(requires) {
  var deps = {
    global: {},
    globalNames: [],
    commonJS: {},
    commonJSNames: [],
    ym: [],
    ymVars: [],
    ymLibs: []
  };

  if (!requires)
    return deps;

  for (var lib in requires) {
    if (requires.hasOwnProperty(lib)) {
      if (requires[lib].globals) {
        deps.global[lib] = requires[lib].globals;
        deps.globalNames.push(lib);
      }

      if (requires[lib].commonJS) {
        deps.commonJS[lib] = requires[lib].commonJS;
        deps.commonJSNames.push(lib);
      }

      if (requires[lib].ym) {
        deps.ym.push(lib);
        deps.ymVars.push(lib);
        deps.ymLibs.push(lib);
      }
    }
  }

  if (deps.ymLibs.length) {
    deps.ymLibs = 'engine.libs = {' + deps.ymLibs.map(function(item) {
      return '"' + item + '":' + item;
    }).join() + '};';
  }

  if (deps.ymVars.length) {
    deps.ymVars = ',' + deps.ymVars.map(function(item) {
      return item.toString();
    }).join();
  }

  return deps;
}

Compiler.prototype.compile = function compile(code, options) {
  options = options || {};
  var api = new engines[this.engineName](options);
  return api.getTemplate(getCode(code, options.runtimeLint), options);
};

Compiler.prototype.generate = function generate(code, options) {
  options = options || {};
  code = fnToString(code);

  var exportName = options.exportName || this.engineName;

  code = [
    code + ';',
    'oninit(function(exports, context) {',
      'var BEMContext = exports.BEMContext || context.BEMContext;',
      // Provides third-party libraries from different modular systems
      'BEMContext.prototype.require = function(lib) {',
        'return this._libs[lib];',
      '};',
    '});'
  ].join('');

  var deps = getDeps(options.requires);

  var source = [
    'var ' + exportName + ';',
    '(function(global) {',
      'function buildBemXjst(libs) {',
        'var exports;',

        '/* BEM-XJST Runtime Start */',
        'var ' + exportName + ' = function(module, exports) {',
           bundles[this.engineName] + ';',
          'return module.exports || exports.' + exportName + ';',
        '}({}, {});',

        'var api = new ' + exportName + '(' + JSON.stringify(options) + ');',

        '/* BEM-XJST User-code Start */',
        'api.compile(function(' +
          require('./bemxjst').prototype.locals.join(', ') +
        ') {',
          getCode(code, options.runtimeLint) + ';' +
        '});',

        'exports = api.exportApply(exports);',
        'if (libs) exports.BEMContext.prototype._libs = libs;',

        'return exports;',
      '};',

      options.commonJSModules,

      'var glob = this.window || this.global || this;',
      'var exp = typeof exports !== "undefined" ? exports : global;',

      // Provide with CommonJS
      deps.commonJSNames.length === 0 || (
        'if (typeof module==="object" && typeof module.exports==="object") {' +
        'exp["' + exportName + '"] = buildBemXjst();' +
        'exp["' + exportName + '"].libs = {};' + (
          deps.commonJSNames.map(function(dep) {
            return 'exp["' + exportName + '"].libs["' + dep + '"] = ' +
              'glob && typeof glob["' + dep + '"] ' +
              '!== "undefined" ? ' +
              'glob["' + dep + '"] : require("' + dep + '");';
          })
        ) + '}'),

      // Provide to YModules
     'if (typeof modules === "object") {',
       'modules.define("' + exportName + '",' +
         JSON.stringify(deps.ym) + ',' +
         'function(provide' + deps.ymVars + ') { ' +
           'var engine = buildBemXjst();' +
           deps.ymLibs +
           'provide(engine);' +
         '}' +
       ');',
     '}',

      // Provide to global scope
      deps.globalNames.length !== 0 ? (
        exportName + ' = buildBemXjst(glob);' +
        'exp["' + exportName + '"] = ' + exportName + ';' +
        'exp["' + exportName + '"].libs = {};' +
        deps.commonJSNames.map(function(dep) {
          return 'typeof glob["' + dep + '"] !== "undefined" && (' +
            'exp["' + exportName + '"].libs["' + dep + '"] = ' +
            'glob["' + dep + '"]);';
        }).join('')
      ) : (
        exportName + '= buildBemXjst(this.global);' +
        'global["' + exportName + '"] = ' + exportName + ';'
      ),

    '})(typeof window !== "undefined" ? ' +
      'window : typeof global !== "undefined" ? global : this);'

  ].join(EOL);

  return source;
};

module.exports = Compiler;
