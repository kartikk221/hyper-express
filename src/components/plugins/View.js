'use strict';

const {resolve, extname, dirname, basename, join} = require('path')
const {statSync} = require('fs')

class View {
    #options
    #defaultEngine;
    #name;
    #root;
    #extension;
    #path;
    constructor(name, options) {
        this.#options = {...this.#options, ...options}
        this.#defaultEngine = options.defaultEngine
        this.#root = options.root;
        this.#extension = extname(name)    
        let fileName = name;
        if (!this.#extension) {
            // get extension from default engine name
            this.#extension = this.#defaultEngine[0] !== '.'
              ? '.' + this.#defaultEngine
              : this.#defaultEngine;
            fileName += this.#extension;
          } 
        this.#name = fileName
        if (!this.#options.engines[this.#extension]) {
          const mod = this.#extension.slice(1);
          const fn = require(mod).__express;
          if (typeof fn !== 'function') {
            throw new Error('HyperExpress: Module "' + mod + '" does not provide a view engine.')
          }
          this.#options.engines[this.#extension] = fn
        }
      this.engine = this.#options.engines[this.#extension]
      this.#path = this.lookup();
    } 
    
    /**
     * Lookup view by the constructored `this.#name`
     *
     * @private
     * @returns {String|undefined}
     */
    lookup() {
      var path;
      var roots = [].concat(this.#root);
      for (var i = 0; i < roots.length && !path; i++) {
        var root = roots[i];
    
        // resolve the path
        var loc = resolve(root, this.#name);
        var dir = dirname(loc);
        var file = basename(loc);
    
        // resolve the file
        path = this.resolve(dir, file);
      }
    
      return path;
    }
    /**
     * Resolve the file within the given directory.
     * @param {String} dir 
     * @param {String} file 
     * @returns the absolute path to the file or undefined.
     */
    resolve(dir, file) {
      const ext = this.#extension;
    
      // <path>.<ext>
      let path = join(dir, file);
      var stat = tryStat(path);
    
      if (stat && stat.isFile()) {
        return path;
      }
    
      // <path>/index.<ext>
      path = join(dir, basename(file, ext), 'index' + ext);
      stat = tryStat(path);
    
      if (stat && stat.isFile()) {
        return path;
      }
    };
    /**
     * 
     * @param {Object} renderOptions 
     * @param {*} callback 
     */
    render(renderOptions, callback) {
      const opts = {...this.#options, ...renderOptions}
      this.engine(this.path, opts, callback);
    }
    // renderPromise(renderOptions) {
    //   return new Promise((res, rej) => {
    //     this.engine(this.path,opts, (err, html) => {
    //       if (err) rej(err)
    //       res(html)
    //     })
    //   })
    // }

    
    // Getting View's base path.
    get root() {
      return this.#root
    }
    // Getting View's base path.
    get path() {
      return this.#path
    }
}

/**
 * Return a stat, maybe.
 *
 * @param {String} path
 * @return {fs.Stats}
 * @private
 */
function tryStat(path) {
  try {
    return statSync(path);
  } catch (e) {
    return undefined;
  }
}

module.exports = View