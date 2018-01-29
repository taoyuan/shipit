const sinon = require('sinon');
const expect = require('chai').use(require('sinon-chai')).expect;
const stream = require('mock-utf8-stream');
const ConnectionPool = require('ssh-pool').ConnectionPool;
const Shipit = require('../lib/shipr');

describe('Shipit', function () {
  let shipr, stdout, stderr;

  beforeEach(function () {
    stdout = new stream.MockWritableStream();
    stderr = new stream.MockWritableStream();
    shipr = new Shipit({
      stdout: stdout,
      stderr: stderr,
      environment: 'stage'
    });
    shipr.stage = 'stage';
  });

  describe('#initialize', function () {
    beforeEach(function () {
      sinon.stub(shipr, 'initSshPool').returns(shipr);
    });

    afterEach(function () {
      shipr.initSshPool.restore();
    });

    it('should add stage and initialize shipr', function () {
      shipr.initialize();
      expect(shipr.initSshPool).to.be.called;
    });
  });

  describe('#initSshPool', function () {
    it('should initialize an ssh pool', function () {
      shipr.config = {servers: ['deploy@my-server']};
      shipr.initSshPool();

      expect(shipr.pool).to.be.instanceOf(ConnectionPool);
      expect(shipr.pool).to.have.nested.property('connections[0].remote.user', 'deploy');
      expect(shipr.pool).to.have.nested.property('connections[0].remote.host', 'my-server');
    });
  });

  describe('#initConfig', function () {
    it('should initialize config', function () {
      shipr.initConfig({default: {foo: 'bar', servers: ['1', '2']}, stage: {kung: 'foo', servers: ['3']}});

      expect(shipr.config).to.be.deep.equal({
        branch: 'master',
        keepReleases: 5,
        foo: 'bar',
        kung: 'foo',
        servers: ['3'],
        shallowClone: false
      });
    });
  });

  describe('#local', function () {
    it('should wrap and log to stdout', function () {
      stdout.startCapture();
      return shipr.local('echo "hello"').then(function (res) {
        expect(stdout.capturedData).to.equal('@ hello\n');
        expect(res).to.have.property('stdout');
        expect(res).to.have.property('stderr');
        expect(res).to.have.property('child');
      });
    });
  });

  describe('#remote', function () {
    beforeEach(function () {
      shipr.pool = {run: sinon.stub()};
    });

    it('should run command on pool', function () {
      shipr.remote('my-command');

      expect(shipr.pool.run).to.be.calledWith('my-command');
    });

    it('should cd and run command on pool', function () {
      shipr.remote('my-command', {cwd: '/my-directory'});

      expect(shipr.pool.run).to.be.calledWith('cd "/my-directory" && my-command', {});
    });
  });

  describe('#remoteCopy', function () {
    beforeEach(function () {
      shipr.pool = {copy: sinon.stub()};
    });

    it('should run command on pool', function () {
      shipr.remoteCopy('src', 'dest');

      expect(shipr.pool.copy).to.be.calledWith('src', 'dest');
    });

    it('should accept options for shipr.pool.copy', function () {
      shipr.remoteCopy('src', 'dest', {
        direction: 'remoteToLocal'
      });

      expect(shipr.pool.copy).to.be.calledWith('src', 'dest', {
        direction: 'remoteToLocal',
        ignores: [],
        rsync: []
      });
    });

    it('should support options specified in config', function () {
      shipr.config = {
        ignores: ['foo'],
        rsync: ['--bar']
      };

      shipr.remoteCopy('src', 'dest', {
        direction: 'remoteToLocal'
      });

      expect(shipr.pool.copy).to.be.calledWith('src', 'dest', {
        direction: 'remoteToLocal',
        ignores: ['foo'],
        rsync: ['--bar']
      });
    });
  });
});
