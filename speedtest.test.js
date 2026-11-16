'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');

const { measure, summarize } = require('./speedtest');

const BODY = Buffer.alloc(256 * 1024, 'a');
let server;
let baseUrl;
let activeRequests = 0;
let maxActiveRequests = 0;
let requestCount = 0;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/missing') {
      res.writeHead(404).end();
      return;
    }
    requestCount++;
    activeRequests++;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    res.on('close', () => activeRequests--);
    setTimeout(() => res.end(BODY), 5);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('делает 10 запросов по очереди и считает все байты', async () => {
  const results = await measure(`${baseUrl}/file`);

  assert.equal(results.length, 10);
  assert.equal(requestCount, 10);
  assert.equal(maxActiveRequests, 1);
  assert.equal(summarize(results).totalBytes, BODY.length * 10);
});

test('считает среднее время и скорость', () => {
  const summary = summarize([
    { bytes: 1_000_000, ms: 1000 },
    { bytes: 3_000_000, ms: 3000 },
  ]);

  assert.equal(summary.totalBytes, 4_000_000);
  assert.equal(summary.averageMs, 2000);
  assert.equal(summary.mbitPerSecond, 8);
});

test('падает с понятной ошибкой, если сервер ответил не 2xx', async () => {
  await assert.rejects(measure(`${baseUrl}/missing`), /сервер ответил 404/);
});
