module.exports = function (shipr) {
  shipr.initConfig({
    default: {},
    staging: {
      servers: 'myserver.com'
    }
  });

  shipr.task('test', async function () {
    const res = await shipr.local('echo "hello"');
    if (res.stdout !== 'hello\n') {
      throw new Error('test not passing');
    }
  });

  shipr.task('default', ['test'], function () {
    console.log("Using default task that depends on 'test'");
  });
};
