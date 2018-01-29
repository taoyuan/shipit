#!/usr/bin/env node

const chalk = require('chalk');
const interpret = require('interpret');
const v8flags = require('v8flags');
const Liftoff = require('liftoff');
const program = require('caporal');
const PromiseA = require('bluebird');

const Shipr = require('../lib/shipr');
const pkg = require('../package.json');

module.exports = function (argv) {
  argv = argv || process.argv;

  program
    .version(pkg.version)
    .argument('[tasks...]', 'tasks to run', program.ARRAY)
    .option('-e, --env <env>', 'environment to run tasks', program.STRING, 'default')
    .option('--cwd <cwd>', 'change to working directory', program.STRING)
    .option('-f, --shiprfile <shiprfile>', 'the shiprfile location', program.STRING)
    .option('--shipitfile <shipitfile>', 'alternative for shiprfile', program.STRING)
    .option('-r, --require <require>', 'require the given module', program.STRING)
    .option('--completion <shipitfile>', 'require the given module', program.STRING)
    .action(run);

  program.parse(argv);
};

/**
 *
 * @param {Object} args
 * @param {Object} options
 * @param {String} [options.env]
 * @param {String} [options.cwd]
 * @param {String} [options.shiprfile]
 * @param {String} [options.shipitfile]
 * @param {String} [options.require]
 * @param {String} [options.completion]
 * @param logger
 */
function run(args, options, logger) {
  options = options || {};
  const env = options.env || 'default';


  // Initialize cli.
  const cli = new Liftoff({
    name: 'shipr',
    extensions: interpret.jsVariants,
    v8flags: v8flags
  });

// Launch cli.
  cli.launch({
    cwd: options.cwd,
    configPath: options.shiprfile || options.shipitfile,
    require: options.require,
    completion: options.completion
  }, async ctx => {
    const shiprfile = ctx.configPath;
    if (!shiprfile) {
      console.error(chalk.red('shiprfile not found'));
      exit(1);
    }

    // Run the 'default' task if no task is specified
    const tasks = args.tasks || [];
    if (tasks.length === 0) {
      tasks.push('default');
    }

    try {
      const shipr = new Shipr({environment: env});
      await require(shiprfile)(shipr);
      // Initialize shipr.
      shipr.initialize();
      // Run tasks.
      shipr.start(tasks);
      shipr.on('task_err', () => exit(1));
      shipr.on('task_not_found', () => exit(1));
    } catch (e) {
      console.error(chalk.red(e.message));
      exit(1);
    }
  });
}


/**
 * Properly exit.
 * Even on Windows.
 *
 * @param {number} code Exit code
 */
function exit(code) {
  if (process.platform === 'win32' && process.stdout.bufferSize) {
    process.stdout.once('drain', () => process.exit(code));
    return;
  }

  process.exit(code);
}
