import { Registration, IContainer, LogLevel, LoggerConfiguration, ColorOptions } from '@aurelia/kernel';
import { IFileSystem, IHttpServer, IHttpServerOptions, ISystem, IRequestHandler } from './interfaces';
import { NodeFileSystem } from './file-system';
import { HttpServer, Http2Server } from './http-server';
import { System } from './system';
import { FileServer, Http2FileServer } from './request-handlers/file-server';

const defaultOpts: IHttpServerOptions = {
  hostName: '0.0.0.0',
  port: 8080,
  root: './',
  level: LogLevel.info,
  useHttp2: false
};

export const RuntimeNodeConfiguration = {
  create(opts: Partial<IHttpServerOptions>) {
    opts = { ...defaultOpts, ...opts };
    return {
      register(container: IContainer): IContainer {
        container.register(
          Registration.singleton(IFileSystem, NodeFileSystem),
          Registration.singleton(ISystem, System),
          Registration.instance(IHttpServerOptions, opts),
          LoggerConfiguration.create(console, opts.level, ColorOptions.colors)
        );

        if (opts.useHttp2) {
          container.register(
            Registration.singleton(IHttpServer, Http2Server),
            Registration.singleton(IRequestHandler, Http2FileServer)
          );
        } else {
          container.register(
            Registration.singleton(IHttpServer, HttpServer),
            Registration.singleton(IRequestHandler, FileServer)
          );
        }

        return container;
      },
    };
  }
};
