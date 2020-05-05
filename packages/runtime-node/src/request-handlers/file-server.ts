import { IncomingMessage, ServerResponse } from "http";
import * as url from 'url';
import { join, resolve, relative } from 'path';

import { ILogger } from '@aurelia/kernel';

import { IRequestHandler, IHttpServerOptions, IFileSystem, Encoding, IHttp2FileServer } from '../interfaces';
import { IHttpContext, HttpContextState } from '../http-context';
import { getContentType, HTTPStatusCode } from '../http-utils';
import { ServerHttp2Stream, constants, IncomingHttpHeaders, Http2ServerRequest, Http2ServerResponse } from 'http2';

const {
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_LENGTH,
  HTTP2_HEADER_LAST_MODIFIED,
  HTTP2_HEADER_CONTENT_TYPE,
} = constants;

export class FileServer implements IRequestHandler {
  private readonly root: string;

  public constructor(
    @IHttpServerOptions
    private readonly opts: IHttpServerOptions,
    @ILogger
    private readonly logger: ILogger,
    @IFileSystem
    private readonly fs: IFileSystem,
  ) {
    this.logger = logger.root.scopeTo('FileServer');

    this.root = resolve(opts.root);

    this.logger.debug(`Now serving files from: "${this.root}"`);
  }

  public async handleRequest(context: IHttpContext): Promise<void> {
    const request = context.request;
    const response = context.response;

    if (!(request instanceof IncomingMessage && response instanceof ServerResponse)) { return; }
    const parsedUrl = url.parse(request.url!);
    const path = join(this.root, parsedUrl.path!);

    if (await this.fs.isReadable(path)) {
      this.logger.debug(`Serving file "${path}"`);

      const content = await this.fs.readFile(path, Encoding.utf8);
      const contentType = getContentType(path);

      response.writeHead(HTTPStatusCode.OK, {
        'Content-Type': contentType,
      });

      await new Promise(function (resolve) {
        response.end(content, resolve);
      });

    } else {
      this.logger.debug(`File "${path}" could not be found`);

      response.writeHead(HTTPStatusCode.NotFound);

      await new Promise(function (resolve) {
        response.end(resolve);
      });
    }

    context.state = HttpContextState.end;
  }

}

/**
 * File server with HTTP/2 push support
 */
export class Http2FileServer implements IHttp2FileServer {
  private readonly root: string;

  public constructor(
    @IHttpServerOptions
    private readonly opts: IHttpServerOptions,
    @ILogger
    private readonly logger: ILogger,
    @IFileSystem
    private readonly fs: IFileSystem,
  ) {
    this.logger = logger.root.scopeTo('FileServer');

    this.root = resolve(opts.root);

    this.logger.debug(`Now serving files from: "${this.root}"`);
  }

  public handleRequest(context: IHttpContext): void {
    const request = context.request;
    const response = context.response;

    if (!(request instanceof Http2ServerRequest && response instanceof Http2ServerResponse)) { return; }
    const parsedUrl = url.parse(request.url!);
    const parsedPath = parsedUrl.path!;
    const path = join(this.root, parsedPath);

    if (this.fs.isReadableSync(path)) {
      this.logger.debug(`Serving file "${path}"`);

      const stream = response.stream;
      // make this configurable
      if (parsedPath === '/index.html') {
        this.pushAll(stream);
      }

      const { fd, headers } = this.getFile(path);
      // stream.on('close', () => this.fs.closeSync(fd));
      stream.respondWithFD(fd, headers);

    } else {
      this.logger.debug(`File "${path}" could not be found`);

      response.writeHead(HTTPStatusCode.NotFound);
      response.end();
    }

    context.state = HttpContextState.end;
  }

  public handleStream(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, flags: number): void {
    this.logger.info('Http2FileServer#handleRequest');

    const parsedUrl = url.parse(headers[HTTP2_HEADER_PATH] as string);
    const parsedPath = parsedUrl.path!;
    const path = join(this.root, parsedPath);

    if (this.fs.isReadableSync(path)) {
      this.logger.debug(`Serving file "${path}"`);

      // make this configurable
      if (parsedPath === '/index.html') {
        // this.pushAll(stream);
        // TODO fix this
        this.push(stream, '/examples/vanilla-ts/src/startup.js');
        this.push(stream, '/examples/vanilla-ts/src/app.js');
      }

      const fileInfo = this.getFile(path);
      const fd = fileInfo.fd;
      stream.respondWithFD(fd, fileInfo.headers);
      // stream.on('close', () => this.fs.closeSync(fd));
      // stream.respondWithFile(path);
      // stream.respond(fileInfo.headers);
      // stream.write(this.fs.readFileSync(path, Encoding.utf8));

    } else {
      this.logger.debug(`File "${path}" could not be found`);

      stream.respond({ [HTTP2_HEADER_STATUS]: HTTPStatusCode.NotFound });
    }

  }

  private getFile(path: string) {
    const fs = this.fs;
    const fd = fs.openSync(path, 'r');
    const contentType = getContentType(path);
    const stat = fs.statSync(path);
    const headers = {
      // [HTTP2_HEADER_STATUS]: HTTPStatusCode.OK,
      [HTTP2_HEADER_CONTENT_LENGTH]: stat.size,
      [HTTP2_HEADER_LAST_MODIFIED]: stat.mtime.toUTCString(),
      [HTTP2_HEADER_CONTENT_TYPE]: contentType
    };
    return { fd, headers };
  }

  private pushAll(stream: ServerHttp2Stream, root = this.root) {
    const fs = this.fs;
    for (const item of fs.readdirSync(root)) {
      const path = join(root, item);
      if (!path.endsWith('index.html')) {
        if (fs.statSync(path).isFile()) {
          this.push(stream, path);
        } else {
          this.pushAll(stream, path);
        }
      }
    }
  }

  private push(stream: ServerHttp2Stream, filePath: string) {
    const { fd, headers } = this.getFile(resolve(this.root, filePath));
    const pushHeaders = { [HTTP2_HEADER_PATH]: filePath };

    stream.pushStream(pushHeaders, (_err, pushStream) => {
      // this.logger.info(`pushing ${filePath}`);
      console.log(`pushing ${filePath}`);
      // TODO handle error
      pushStream.respondWithFD(fd, headers);
      // pushStream.on('close', () => this.fs.closeSync(fd));
    });
  }
}
