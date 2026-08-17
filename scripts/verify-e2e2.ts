// Staged E2E diagnostic: discover → probe → createSession → prompt.
// Simulates Obsidian Electron's minimal PATH to reproduce the plugin's view.
import {
  discoverHarnessBaseUrl,
  HarnessRpcClient,
} from '../src/providers/deepseek/harness/HarnessRpcClient';

// Polyfill window for node (probe uses window.setTimeout; Obsidian has window).
(globalThis as Record<string, unknown>).window = globalThis;

process.env.PATH = '/usr/bin:/bin'; // Obsidian Electron inherits a minimal PATH

async function main(): Promise<void> {
  console.log('simulated PATH:', process.env.PATH);

  // Stage 1: discover the harness port
  const url = await discoverHarnessBaseUrl();
  console.log('1. discover →', url);
  if (!url) {
    console.log('FAIL at discover');
    process.exit(1);
  }

  // Stage 2: probe the endpoint
  const client = new HarnessRpcClient(url);
  const probeOk = await client.probe(2000);
  console.log('2. probe →', probeOk);
  if (!probeOk) {
    console.log('FAIL at probe');
    process.exit(1);
  }

  // Stage 3: create a session
  const created = await client.createSession({}, undefined);
  console.log('3. createSession →', created.sessionId, 'preset:', created.agentPreset);
  if (!created.sessionId) {
    console.log('FAIL at createSession');
    process.exit(1);
  }

  // Stage 4: prompt the session
  try {
    const result = await client.prompt(created.sessionId, '只回复 OK', undefined);
    console.log('4. prompt → accepted:', result.accepted);
    console.log('PASS: all stages completed');
    process.exit(0);
  } catch (err) {
    console.log('FAIL at prompt:', (err as Error).message);
    process.exit(1);
  }
}

void main();
