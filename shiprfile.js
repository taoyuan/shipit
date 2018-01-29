module.exports = function (shipr) {
  shipr.initConfig({
    default: {},
    staging: {
      servers: 'myserver.com'
    }
  });

  shipr.task('test', async function () {
    let res = await shipr.local('echo "hello"');
    if (res.stdout !== 'hello\n') {
      throw new Error('[local] test not passing');
    }

    res = await shipr.run({
      name: 'Clone seciod repository',
      command: `
        echo "hello"
      `,
      local: true,
      batch: true,
      cwd: '/tmp'
    });
    if (res.stdout !== 'hello\n') {
      throw new Error('[run|local] test not passing');
    }
  });

  shipr.task('default', ['test'], function () {
    console.log("Using default task that depends on 'test'");
  });
};
