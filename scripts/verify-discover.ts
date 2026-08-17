// Runtime verification: discover must work when PATH lacks /usr/sbin
// (the exact condition that broke Obsidian Electron before).
import { discoverHarnessBaseUrl } from '../src/providers/deepseek/harness/HarnessRpcClient';

const ORIGINAL_PATH = process.env.PATH ?? '';

async function main(): Promise<void> {
  // Simulate the minimal PATH a macOS GUI app (Obsidian) inherits.
  process.env.PATH = '/usr/bin:/bin';

  console.log('original PATH:', ORIGINAL_PATH);
  console.log('simulated PATH:', process.env.PATH);

  const url = await discoverHarnessBaseUrl();
  console.log('discovered base url:', url);

  if (!url) {
    console.error('FAIL: no port discovered under minimal PATH');
    process.exit(1);
  }

  const res = await fetch(url + '/');
  console.log('probe status:', res.status);
  console.log(res.status === 200 ? 'PASS' : 'FAIL');
  process.exit(res.status === 200 ? 0 : 1);
}

void main();
