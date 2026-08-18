import { spawn } from 'child_process';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import type { HarnessAppLauncher as HarnessAppLauncherClass } from '../../../../src/providers/deepseek/harness/HarnessAppLauncher';

interface LauncherMocks {
  findCliBinaryPath?: jest.Mock;
  nodeHttpRequest?: jest.Mock;
}

const launcherPath = '../../../../src/providers/deepseek/harness/HarnessAppLauncher';

async function loadLauncher(mocks: LauncherMocks = {}): Promise<typeof HarnessAppLauncherClass> {
  jest.resetModules();

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
  return mod.HarnessAppLauncher;
}

const CONFIG = {
  autoLaunch: true,
  dshPath: '',
  environmentText: '',
};

describe('HarnessAppLauncher', () => {
  it('prefers an explicit dsh path over PATH lookup', async () => {
    const Launcher = await loadLauncher({
      findCliBinaryPath: jest.fn(() => '/usr/local/bin/dsh'),
    });

    const launcher = Launcher.get();
    expect(launcher.detectDshPath({ ...CONFIG, dshPath: '/opt/dsh/bin/dsh' })).toBe('/opt/dsh/bin/dsh');
  });

  it('falls back to PATH lookup when no explicit path is configured', async () => {
    const Launcher = await loadLauncher({
      findCliBinaryPath: jest.fn(() => '/usr/local/bin/dsh'),
    });

    const launcher = Launcher.get();
    expect(launcher.detectDshPath(CONFIG)).toBe('/usr/local/bin/dsh');
  });

  it('starts offline', async () => {
    const Launcher = await loadLauncher();
    expect(Launcher.get().getStatus()).toEqual({ kind: 'offline' });
  });

  it('records dsh-not-found when the binary cannot be resolved', async () => {
    const Launcher = await loadLauncher({
      findCliBinaryPath: jest.fn(() => null),
      nodeHttpRequest: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    });

    const launcher = Launcher.get();
    await expect(launcher.ensureRunning('http://127.0.0.1:3080', CONFIG)).resolves.toBe(false);
    expect(launcher.getStatus()).toEqual({ kind: 'failed', reason: 'dsh-not-found' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('reports online after a successful probe', async () => {
    const Launcher = await loadLauncher({
      nodeHttpRequest: jest.fn(() => Promise.resolve({ status: 200 })),
    });

    const launcher = Launcher.get();
    await expect(launcher.check('http://127.0.0.1:3080')).resolves.toBe(true);
    expect(launcher.getStatus()).toEqual({ kind: 'online' });
  });

  it('clears a previous failure after a successful restart', async () => {
    const Launcher = await loadLauncher({
      findCliBinaryPath: jest.fn(() => null),
      nodeHttpRequest: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    });

    const launcher = Launcher.get();
    await launcher.ensureRunning('http://127.0.0.1:3080', CONFIG);
    expect(launcher.getStatus()).toEqual({ kind: 'failed', reason: 'dsh-not-found' });

    // After the harness becomes reachable, a fresh check clears the failure.
    const { nodeHttpRequest } = jest.requireMock('../../../../src/providers/deepseek/harness/nodeHttp') as {
      nodeHttpRequest: jest.Mock;
    };
    nodeHttpRequest.mockResolvedValue({ status: 200 });

    await expect(launcher.check('http://127.0.0.1:3080')).resolves.toBe(true);
    expect(launcher.getStatus()).toEqual({ kind: 'online' });
  });
});
