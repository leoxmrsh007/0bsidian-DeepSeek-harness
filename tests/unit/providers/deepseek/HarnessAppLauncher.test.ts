import type { HarnessAppLauncher as HarnessAppLauncherClass } from '../../../../src/providers/deepseek/harness/HarnessAppLauncher';

interface LauncherMocks {
  findCliBinaryPath?: jest.Mock;
  nodeHttpRequest?: jest.Mock;
}

interface LauncherBundle {
  Launcher: typeof HarnessAppLauncherClass;
  spawn: jest.Mock;
}

const launcherPath = '../../../../src/providers/deepseek/harness/HarnessAppLauncher';

async function loadLauncher(mocks: LauncherMocks = {}): Promise<LauncherBundle> {
  jest.resetModules();

  const spawn = jest.fn();
  jest.doMock('child_process', () => ({ spawn }));
  jest.doMock('../../../../src/utils/cliBinaryLocator', () => ({
    findCliBinaryPath: mocks.findCliBinaryPath ?? jest.fn(() => null),
  }));
  jest.doMock('../../../../src/providers/deepseek/harness/nodeHttp', () => ({
    nodeHttpRequest: mocks.nodeHttpRequest ?? jest.fn(() => Promise.reject(new Error('down'))),
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module registry needs require to reload the singleton.
  const mod = require(launcherPath) as {
    HarnessAppLauncher: typeof HarnessAppLauncherClass;
  };
  return { Launcher: mod.HarnessAppLauncher, spawn };
}

function makeChild(): {
  pid: number;
  exitCode: null;
  stderr: { on: jest.Mock };
  once: jest.Mock;
  kill: jest.Mock;
} {
  return {
    pid: 42,
    exitCode: null,
    stderr: { on: jest.fn() },
    once: jest.fn(),
    kill: jest.fn(),
  };
}

const CONFIG = {
  autoLaunch: true,
  dshPath: '',
  environmentText: '',
};

describe('HarnessAppLauncher', () => {
  it('prefers an explicit dsh path over PATH lookup', async () => {
    const { Launcher } = await loadLauncher({
      findCliBinaryPath: jest.fn(() => '/usr/local/bin/dsh'),
    });

    const launcher = Launcher.get();
    expect(launcher.detectDshPath({ ...CONFIG, dshPath: '/opt/dsh/bin/dsh' })).toBe('/opt/dsh/bin/dsh');
  });

  it('falls back to PATH lookup when no explicit path is configured', async () => {
    const { Launcher } = await loadLauncher({
      findCliBinaryPath: jest.fn(() => '/usr/local/bin/dsh'),
    });

    const launcher = Launcher.get();
    expect(launcher.detectDshPath(CONFIG)).toBe('/usr/local/bin/dsh');
  });

  it('starts offline', async () => {
    const { Launcher } = await loadLauncher();
    expect(Launcher.get().getStatus()).toEqual({ kind: 'offline' });
  });

  it('records dsh-not-found when the binary cannot be resolved', async () => {
    const { Launcher, spawn } = await loadLauncher({
      findCliBinaryPath: jest.fn(() => null),
      nodeHttpRequest: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    });

    const launcher = Launcher.get();
    await expect(launcher.ensureRunning('http://127.0.0.1:3080', CONFIG)).resolves.toBe(false);
    expect(launcher.getStatus()).toEqual({ kind: 'failed', reason: 'dsh-not-found' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('reports online after a successful probe', async () => {
    const { Launcher } = await loadLauncher({
      nodeHttpRequest: jest.fn(() => Promise.resolve({ status: 200 })),
    });

    const launcher = Launcher.get();
    await expect(launcher.check('http://127.0.0.1:3080')).resolves.toBe(true);
    expect(launcher.getStatus()).toEqual({ kind: 'online' });
  });

  it('clears a previous failure after a successful restart', async () => {
    const { Launcher } = await loadLauncher({
      findCliBinaryPath: jest.fn(() => null),
      nodeHttpRequest: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    });

    const launcher = Launcher.get();
    await launcher.ensureRunning('http://127.0.0.1:3080', CONFIG);
    expect(launcher.getStatus()).toEqual({ kind: 'failed', reason: 'dsh-not-found' });

    const { nodeHttpRequest } = jest.requireMock('../../../../src/providers/deepseek/harness/nodeHttp') as {
      nodeHttpRequest: jest.Mock;
    };
    nodeHttpRequest.mockResolvedValue({ status: 200 });

    await expect(launcher.check('http://127.0.0.1:3080')).resolves.toBe(true);
    expect(launcher.getStatus()).toEqual({ kind: 'online' });
  });

  it('injects DSH_PERMISSION_MODE into the launch environment', async () => {
    const nodeHttpRequest = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ status: 200 });
    const { Launcher, spawn } = await loadLauncher({
      findCliBinaryPath: jest.fn(() => '/usr/bin/dsh'),
      nodeHttpRequest,
    });
    spawn.mockReturnValue(makeChild());

    const launcher = Launcher.get();
    await expect(launcher.ensureRunning(
      'http://127.0.0.1:3080',
      { ...CONFIG, safeMode: 'acceptEdits' },
    )).resolves.toBe(true);

    const env = spawn.mock.calls[0][2].env as Record<string, string | undefined>;
    expect(env.DSH_PERMISSION_MODE).toBe('acceptEdits');
  });
});
