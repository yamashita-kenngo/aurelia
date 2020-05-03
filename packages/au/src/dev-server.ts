import { ServiceHost } from '@aurelia/aot';
import { IFileSystem, Encoding, RuntimeNodeConfiguration, normalizePath, IHttpServer, IHttpServerOptions } from '@aurelia/runtime-node';
import { ILogger, IContainer, LogLevel, DI } from '@aurelia/kernel';
import { join } from 'path';
import { ChromeBrowser } from './browser/chrome';
import { BrowserHost } from './browser/host';

export interface IDevServerConfig {
  readonly entryFile: string;
  readonly scratchDir: string;
  readonly wipeScratchDir?: boolean;
  readonly logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'none';
}

export function getLogLevel(str: IDevServerConfig['logLevel']): LogLevel {
  switch (str) {
    case 'trace': return LogLevel.trace;
    case 'debug': return LogLevel.debug;
    case 'info': return LogLevel.info;
    case 'warn': return LogLevel.warn;
    case 'error': return LogLevel.error;
    case 'fatal': return LogLevel.fatal;
    case 'none': return LogLevel.none;
  }
  return LogLevel.info;
}

export class DevServer {
  public constructor(
    @IContainer
    protected readonly container: IContainer
  ) { }

  public static create(container = DI.createContainer()): DevServer {
    return new DevServer(container);
  }

  public async run({
    entryFile,
    scratchDir,
    wipeScratchDir,
    logLevel,
  }: IDevServerConfig): Promise<void> {

    entryFile = normalizePath(entryFile);
    scratchDir = normalizePath(scratchDir);

    // wireup
    const container = this.container.createChild();
    container.register(RuntimeNodeConfiguration.create(this.getNodeConfigurationOptions(logLevel, scratchDir)));
    const fs = container.get(IFileSystem);
    const serviceHost = container.get(ServiceHost);
    const logger = container.get(ILogger);
    logger.info(`Starting test runner with scratchDir ${scratchDir} and entryFile ${entryFile}`);

    // compile/bundle
    const result = await serviceHost.execute({ entries: [{ file: entryFile }] });
    if (await fs.isReadable(scratchDir) && wipeScratchDir) {
      await fs.rimraf(scratchDir);
    }
    await result.ws.emit({ outDir: scratchDir });

    // start the http/file/websocket server
    const server = container.get(IHttpServer);
    const { realPort } = await server.start();

    // TODO: this template need to come from the user-space, and just inject the script.
    // generate html file to run
    const outFile = join(scratchDir, 'index.html');
    const html = `
    <!DOCTYPE html>
    <html>
      <head>
      </head>
      <body>
        <app></app>
        <script type="module">
          import '.${entryFile.replace(result.ws.lastCommonRootDir, '').replace(/\.ts$/, '.js')}';
        </script>
      </body>
    </html>
    `;
    await fs.writeFile(outFile, html, Encoding.utf8);
    // navigate to the html file
    const browser = container.get(ChromeBrowser);
    const browserHost = container.get(BrowserHost);
    await browserHost.open(browser, `http://localhost:${realPort}/index.html`);
  }

  protected getNodeConfigurationOptions(logLevel: IDevServerConfig['logLevel'], scratchDir: string): Partial<IHttpServerOptions> {
    return {
      // port: 3000,
      level: getLogLevel(logLevel),
      root: scratchDir,
      useHttp2: true,
    };
  }
}
