const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const PORT = Number(process.env.PORT) || 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

async function readState() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('读取 state.json 失败:', error.message);
    return { version: 1, settings: {}, actual: {} };
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': MIME_TYPES['.json'], 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1024 * 1024) throw new Error('请求数据过大');
  }
  return JSON.parse(body || '{}');
}

async function serveFile(response, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(ROOT, relative);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) return sendJson(response, 403, { error: 'Forbidden' });
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    sendJson(response, error.code === 'ENOENT' ? 404 : 500, { error: '文件不存在' });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/state' && request.method === 'GET') return sendJson(response, 200, await readState());
    if (url.pathname === '/api/state' && request.method === 'PUT') {
      const state = await readBody(request);
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(DATA_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      return sendJson(response, 200, { ok: true });
    }
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method Not Allowed' });
    return serveFile(response, url.pathname);
  } catch (error) {
    return sendJson(response, 400, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`加班时间安排已启动：http://localhost:${PORT}`));
