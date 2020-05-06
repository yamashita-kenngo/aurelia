// @ts-check
const { createSecureServer, constants } = require("http2");
const { readFileSync, existsSync, statSync, openSync, readdirSync, closeSync } = require("fs");
const url = require("url");
const { join, resolve, relative } = require("path");
const {
  HTTP2_HEADER_CONTENT_LENGTH,
  HTTP2_HEADER_LAST_MODIFIED,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_PATH,
} = constants;

// const root = join(process.cwd(), "public");
const root = join(process.cwd(), "dist");

/**
 * @param {string} path
 */
function getFile(path) {
  const fd = openSync(path, 'r');
  const contentType = getContentType(path);
  const stat = statSync(path);
  const headers = {
    [HTTP2_HEADER_CONTENT_LENGTH]: stat.size,
    [HTTP2_HEADER_LAST_MODIFIED]: stat.mtime.toUTCString(),
    [HTTP2_HEADER_CONTENT_TYPE]: contentType
  };
  return { fd, headers };
}

/** @type {Map<string, {fd: number, headers: Record<string, any>}>} */
const fdMap = new Map();
function prepare($root = root) {
  for (const item of readdirSync($root)) {
    const path = join($root, item);
    const stats = statSync(path);
    if (stats.isFile()) {
      fdMap.set(path, getFile(path));
    } else {
      prepare(path);
    }
  }
}

/**
 * @param {string | string[]} path
 */
function getContentType(path) {
  const i = path.lastIndexOf('.');
  if (i >= 0) {
    switch (path.slice(i)) {
      case '.js': return 'application/javascript; charset=utf-8';
      case '.html': return 'text/html; charset=utf-8';
    }
  }
}

/**
 * @param {import("http2").Http2ServerRequest} request
 * @param {import("http2").Http2ServerResponse} response
 */
function requestHandler(request, response) {
  const parsedUrl = url.parse(request.url);
  const parsedPath = parsedUrl.path;
  console.log(`parsedPath: ${parsedPath}`);
  const path = join(root, parsedPath);

  const file = fdMap.get(path);
  if (file) {
    console.log(`Serving file "${path}"`);

    const stream = response.stream;
    if (parsedPath === '/index.html') {
      console.log('pushingAll');
      pushAll(stream);
      // push(stream, "examples/vanilla-ts/src/startup.js")
    }
    stream.respondWithFD(file.fd, file.headers);
    // stream.on('end', () => { closeSync(fd); });

  } else {
    console.log(`file "${path}" not found`);
    response.writeHead(400);
    response.end();
  }
}

/**
 * @param {import("http2").ServerHttp2Stream} stream
 */
function pushAll(stream) {
  for (const [path, info] of fdMap) {
    if (!path.endsWith('index.html')) {
      push(stream, path, info);
    }
  }
}

/**
 * @param {import("http2").ServerHttp2Stream} stream
 * @param {string} filePath
 */
function push(stream, filePath, { fd, headers }) {
  filePath = `/${relative(root, filePath)}`;
  const pushHeaders = { [HTTP2_HEADER_PATH]: filePath };

  // console.log(`preparing for pushing ${filePath}`);
  stream.pushStream(pushHeaders, (_err, pushStream) => {
    // console.log(`pushing ${filePath}`);
    pushStream.respondWithFD(fd, headers);
    // pushStream.on('end', () => { closeSync(fd); });
  });
}

prepare();
// console.log(fdMap);
const server = createSecureServer(
  {
    key: readFileSync("key.pem"),
    cert: readFileSync("cert.pem")
  },
  requestHandler
).listen(443, () => {
  console.log("server is running");
});
