import { IncomingMessage, ServerResponse } from "http";
import * as url from 'url';
import { join, resolve } from 'path';

import { ILogger } from '@aurelia/kernel';

import { IRequestHandler, IHttpServerOptions, IFileSystem, Encoding } from '../interfaces';
import { IHttpContext, HttpContextState } from '../http-context';
import { getContentType, HTTPStatusCode } from '../http-utils';
import { Http2ServerRequest, Http2ServerResponse, ServerHttp2Stream, constants } from 'http2';

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
export class Http2FileServer implements IRequestHandler {
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

    if (!(request instanceof Http2ServerRequest && response instanceof Http2ServerResponse)) { return; }
    const parsedUrl = url.parse(request.url!);
    const parsedPath = parsedUrl.path!;
    const path = join(this.root, parsedPath);

    if (await this.fs.isReadable(path)) {
      this.logger.debug(`Serving file "${path}"`);

      const stream = response.stream;
      const { fd, headers } = this.getFile(path);
      stream.on('close', () => this.fs.closeSync(fd));
      stream.respondWithFD(fd, headers);

      // make this configurable
      if (parsedPath === '/index.html') {
        this.pushAll(stream);
      }

    } else {
      this.logger.debug(`File "${path}" could not be found`);

      response.writeHead(HTTPStatusCode.NotFound);

      await new Promise(function (resolve) {
        response.end(resolve);
      });
    }

    context.state = HttpContextState.end;
  }

  private getFile(path: string) {
    const fs = this.fs;
    const fd = fs.openSync(path, 'r');
    const contentType = getContentType(path);
    const stat = fs.statSync(path);
    const headers = {
      ':status': HTTPStatusCode.OK,
      'content-length': stat.size,
      'last-modified': stat.mtime.toUTCString(),
      'content-type': contentType
    };
    return { fd, headers };
  }

  private pushAll(stream: ServerHttp2Stream, root = this.root) {
    const fs = this.fs;
    for (const item of fs.readdirSync(root)) {
      const path = join(root, item);
      if (fs.isReadableSync(path)) {
        if (fs.statSync(path).isFile()) {
          this.push(stream, path);
        } else {
          this.pushAll(stream, path);
        }
      }
    }
  }
  private push(stream: ServerHttp2Stream, filePath: string) {
    const { fd, headers } = this.getFile(filePath);
    const pushHeaders = { [constants.HTTP2_HEADER_PATH]: filePath };

    stream.pushStream(pushHeaders, (_err, pushStream) => {
      // TODO handle error
      pushStream.respondWithFD(fd, headers);
    });
  }
}
