import { DebugConfiguration } from '@aurelia/debug';
import { resolve } from 'path';
import { TestRunner } from './test-runner';
import { IDevServerConfig, DevServer } from "./dev-server";

interface TestCommandArgs extends IDevServerConfig {
  cmd: 'test';
}
interface DevCommandArgs extends IDevServerConfig {
  cmd: 'dev';
}
type ParsedArgs = TestCommandArgs | DevCommandArgs;

const keyMap = {
  entryfile: 'entryFile',
  scratchdir: 'scratchDir',
} as const;

function parseArgs(args: readonly string[]): ParsedArgs {
  const cmd = args[0];
  args = args.slice(1);

  if (args.length % 2 === 1) {
    throw new Error(`Uneven amount of args: ${args}. Args must come in pairs of --key value`);
  }

  switch (cmd) {
    case 'dev':
    case 'test': {
      const parsed = {
        cmd,
        entryFile: '',
        scratchDir: '',
      };
      for (let i = 0, ii = args.length; i < ii; i += 2) {
        let key = args[i].trim().replace(/-/g, '').toLowerCase();
        if (!(key in keyMap)) {
          throw new Error(`Unknown key: ${key}. Possible keys are: ${Object.keys(keyMap)}`);
        }

        key = keyMap[key as keyof typeof keyMap];
        switch (key) {
          case 'entryFile':
            parsed.entryFile = resolve(process.cwd(), args[i + 1]);
            break;
          case 'scratchDir':
            parsed.scratchDir = resolve(process.cwd(), args[i + 1]);
            break;
        }
      }

      return parsed;
    }
  }

  throw new Error(`Unknown command: ${cmd}`);
}

(async function () {
  DebugConfiguration.register();

  const args = parseArgs(process.argv.slice(2));
  switch (args.cmd) {
    case 'test': {
      const runner = TestRunner.create();
      await runner.runOnce(args);
      break;
    }
    case 'dev': {
      const server = DevServer.create();
      await server.run(args);
      break;
    }
  }

})().catch(err => {
  console.error(err);
  process.exit(1);
});
