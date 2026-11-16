#!/usr/bin/env node
'use strict';

const REQUEST_COUNT = 10;
const BYTES_IN_MB = 1_000_000;
const BITS_IN_MBIT = 1_000_000;

/**
 * Скачивает адрес целиком и возвращает размер ответа и время запроса.
 * Время считается от отправки запроса до последнего байта тела.
 */
async function download(url) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    // Без сжатия: считаем байты, которые реально прошли по сети.
    headers: { 'Accept-Encoding': 'identity' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`сервер ответил ${response.status} ${response.statusText}`.trim());
  }

  let bytes = 0;
  for await (const chunk of response.body ?? []) {
    bytes += chunk.byteLength;
  }

  return { bytes, ms: performance.now() - startedAt };
}

/** Делает запросы строго по очереди: следующий стартует после полного ответа на предыдущий. */
async function measure(url, count = REQUEST_COUNT, onResult = () => {}) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const result = await download(url);
    results.push(result);
    onResult(result, i);
  }
  return results;
}

function summarize(results) {
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const totalMs = results.reduce((sum, r) => sum + r.ms, 0);

  return {
    totalBytes,
    averageMs: totalMs / results.length,
    // Скорость = весь объём / всё время скачивания.
    mbitPerSecond: totalMs > 0 ? (totalBytes * 8) / BITS_IN_MBIT / (totalMs / 1000) : 0,
  };
}

const toMb = (bytes) => (bytes / BYTES_IN_MB).toFixed(2);

async function main() {
  const [address] = process.argv.slice(2);
  if (!address) {
    console.error('Использование: node speedtest.js <адрес>');
    process.exit(1);
  }

  let url;
  try {
    url = new URL(address);
  } catch {
    console.error(`Некорректный адрес: ${address}`);
    process.exit(1);
  }

  console.log(`Скачиваю ${url.href} — ${REQUEST_COUNT} запросов подряд\n`);

  const results = await measure(url, REQUEST_COUNT, ({ bytes, ms }, i) => {
    const number = String(i + 1).padStart(2);
    console.log(`Запрос ${number}/${REQUEST_COUNT}: ${ms.toFixed(0)} мс, ${toMb(bytes)} МБ`);
  });

  const { totalBytes, averageMs, mbitPerSecond } = summarize(results);

  console.log(`\nСреднее время запроса: ${averageMs.toFixed(0)} мс`);
  console.log(`Всего скачано: ${toMb(totalBytes)} МБ (${totalBytes} байт)`);
  console.log(
    `Скорость скачивания: ${mbitPerSecond.toFixed(2)} Мбит/с (${(mbitPerSecond / 8).toFixed(2)} МБ/с)`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    const reason = error.cause?.message ?? error.message;
    console.error(`Не удалось измерить скорость: ${reason}`);
    process.exit(1);
  });
}

module.exports = { download, measure, summarize };
