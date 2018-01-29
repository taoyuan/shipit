const childProcess = require('child_process');
const sshPool = require('ssh-pool');
const _ = require('lodash');
const LineWrapper = require('stream-line-wrapper');
const Orchestrator = require('orchestrator');
const chalk = require('chalk');
const prettyTime = require('pretty-hrtime');
const Promise = require('bluebird');

class Shipr extends Orchestrator {

  /**
   * Initialize a new `Shipit`.
   */
  constructor(options) {
    super();
    this.options = _.defaults(options || {}, {
      stdout: process.stdout,
      stderr: process.stderr,
      log: console.log.bind(console)
    });
    this.environment = this.options.environment;

    this.initializeEvents();

    if (this.options.stdout === process.stdout)
      process.stdout.setMaxListeners(100);

    if (this.options.stderr === process.stderr)
      process.stderr.setMaxListeners(100);
  }

  /**
   * Initialize the `Shipr`.
   *
   * @returns {Shipr} for chaining
   */

  initialize() {
    this.emit('init');
    return this.initSshPool();
  };

  /**
   * Initialize events.
   */
  initializeEvents() {
    this.on('task_start', (e) => {
      // Specific log for noop functions.
      if (this.tasks[e.task].fn.toString() === 'function () {}')
        return;

      this.log('\nRunning', '\'' + chalk.cyan(e.task) + '\' task...');
    });

    this.on('task_stop', (e) => {
      const task = this.tasks[e.task];
      // Specific log for noop functions.
      if (task.fn.toString() === 'function () {}')
        return this.log(
          'Finished', '\'' + chalk.cyan(e.task) + '\'',
          chalk.cyan('[ ' + task.dep.join(', ') + ' ]')
        );

      const time = prettyTime(e.hrDuration);
      this.log(
        'Finished', '\'' + chalk.cyan(e.task) + '\'',
        'after', chalk.magenta(time)
      );
    });

    this.on('task_err', (e) => {
      const msg = formatError(e);
      const time = prettyTime(e.hrDuration);
      this.log('\'' + chalk.cyan(e.task) + '\'',
        chalk.red('errored after'),
        chalk.magenta(time));
      this.log(msg);
    });

    this.on('task_not_found', function (err) {
      this.log(chalk.red('Task \'' + err.task + '\' is not in your shipitfile'));
      this.log('Please check the documentation for proper shipitfile formatting');
    });
  };

  /**
   * Initialize SSH connections.
   *
   * @returns {Shipr} for chaining
   */
  initSshPool() {
    if (!this.config.servers)
      throw new Error('Servers not filled');

    const servers = _.isArray(this.config.servers) ? this.config.servers : [this.config.servers];
    this.pool = new sshPool.ConnectionPool(servers, _.extend({}, this.options, _.pick(this.config, 'key', 'strict')));
    return this;
  };

  /**
   * Initialize shipr configuration.
   *
   * @param {Object} config
   * @returns {Shipr} for chaining
   */
  initConfig(config) {
    config = config || {};

    if (!config[this.environment])
      throw new Error('Environment "' + this.environment + '" not found in config');

    this.config = _.assign({
      branch: 'master',
      keepReleases: 5,
      shallowClone: false
    }, config.default || {}, config[this.environment]);
    return this;
  };

  /**
   * Run a command locally.
   *
   * @param {String} command
   * @param {Object|Function} options
   * @param {Function} [cb]
   * @returns {Promise}
   */
  local(command, options, cb) {
    if (_.isFunction(options)) {
      cb = options;
      options = undefined;
    }

    return new Promise((resolve, reject) => {
      this.log('Running "%s" on local.', command);

      options = _.defaults(options || {}, {
        maxBuffer: 1000 * 1024
      });

      const stdoutWrapper = new LineWrapper({prefix: '@ '});
      const stderrWrapper = new LineWrapper({prefix: '@ '});

      const child = childProcess.exec(command, options, function (err, stdout, stderr) {
        if (err) {
          return reject({
            child: child,
            stdout: stdout,
            stderr: stderr,
            err: err
          });
        }

        resolve({
          child: child,
          stdout: stdout,
          stderr: stderr
        });
      });

      if (this.options.stdout)
        child.stdout.pipe(stdoutWrapper).pipe(this.options.stdout);

      if (this.options.stderr)
        child.stderr.pipe(stderrWrapper).pipe(this.options.stderr);
    }).nodeify(cb);
  };

  /**
   * Run a command remotely.
   *
   * @param {String} command
   * @param {Object} [options]
   * @param {Function} [cb]
   * @returns {Promise}
   */
  remote(command, options, cb) {
    if (options && options.cwd) {
      command = 'cd "' + options.cwd.replace(/"/g, '\\"') + '" && ' + command;
      delete options.cwd;
    }
    return this.pool.run(command, options, cb);
  };

  /**
   * Copy from local to remote or vice versa.
   *
   * @param {String} src
   * @param {String} dest
   * @param {Object|Function} [options]
   * @param {Function} [callback]
   * @returns {Promise}
   */

  remoteCopy(src, dest, options, callback) {
    if (_.isFunction(options)) {
      callback = options;
      options = undefined;
    }

    options = _.defaults(options || {}, {
      ignores: this.config && this.config.ignores ? this.config.ignores : [],
      rsync: this.config && this.config.rsync ? this.config.rsync : []
    });

    return this.pool.copy(src, dest, options, callback);
  };

  /**
   * Log.
   *
   * @see console.log
   */

  log() {
    this.options.log.call(null, ...arguments);
  };

  /**
   * Create a new blocking task.
   *
   * @see shipr.task
   */

  blTask(name) {
    this.task.call(this, ...arguments);

    const task = this.tasks[name];
    task.blocking = true;
    return task;
  };

  /**
   * Test if we are ready to run a task.
   * Implement blocking task.
   */

  _readyToRunTask() {
    if (_.find(this.tasks, {running: true, blocking: true})) {
      return false;
    }
    return Orchestrator.prototype._readyToRunTask.call(this, ...arguments);
  };
}

// Expose module.
module.exports = Shipr;

/**
 * Format orchestrator error.
 *
 * @param {Error} e
 * @returns {String}
 */

function formatError(e) {
  if (!e.err) {
    return e.message;
  }

  // PluginError
  if (typeof e.err.showStack === 'boolean') {
    return e.err.toString();
  }

  // normal error
  if (e.err.stack) {
    return e.err.stack;
  }

  // unknown (string, number, etc.)
  return new Error(String(e.err)).stack;
}
