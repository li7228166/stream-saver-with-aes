/**
 * 文件名：sw.js
 * 作　者：Bryce.Li
 * 创　建：2021/6/15 16:16
 * 描　述：Bryce.Li
 * */
let map = new Map()
let messagePort;
let readCountMap = new Map();

/**
 * 已加密流的监控阀值 20
 * 未加密流的监控阀值阀值 500
 * zip密流的监控阀值阀值 50
 * @param {boolean} encrypted 是否加密
 * @param {boolean} zip 是否是zip流
 * @returns {number}
 * */
function getThreshold(encrypted, zip) {
    return encrypted ? 20 : (zip ? 50 : 500);
}

/**
 * 接收消息
 * @param {MessageEvent} event
 * */
function onmessage(event) {
    const {url, type, uniqLink, chunk, uuid, filename, size, password, zip} = event.data;
    if (type === 'DOWNLOAD_REGISTER') {
        const uniqLink = self.registration.scope + uuid + '/' + filename;
        const [readableStream, controller] = createReadableStream(uniqLink, uuid);
        map.set(uniqLink, {readableStream, controller, filename, size, uuid});
        messagePort.postMessage({url, uuid, uniqLink, password, type: 'DOWNLOAD_REGISTER_SUCCESS'});
    } else if (type === 'DOWNLOAD_END') {
        const payload = map.get(uniqLink);
        if (payload) {
            map.delete(uniqLink)
            payload.controller.close()
        }
    } else if (type === 'DOWNLOAD_ABORT') {
        const payload = map.get(uniqLink);
        if (payload) {
            map.delete(uniqLink)
            payload.controller.error('Aborted the download')
        }
    } else if (type === 'DOWNLOADING') {
        // chunk 测试发现单次2k的数据
        const payload = map.get(uniqLink);
        if (payload) {
            let {count, next, done} = readCountMap.get(uniqLink) || {count: 0, next: 0, done: false};
            if (done) return;
            if (count >= getThreshold(!!password, zip)) {
                readCountMap.set(uniqLink, {count: 0, next: 0, done: true});
                messagePort.postMessage({uuid: payload.uuid, type: 'USER_CANCEL_DOWNLOAD'});
            } else {
                if (next > payload.controller.desiredSize && next < 1) {
                    readCountMap.set(uniqLink, {count: ++count, next: payload.controller.desiredSize, done: false});
                } else {
                    readCountMap.set(uniqLink, {count: 0, next: 0, done: false});
                }
                payload.controller.enqueue(chunk);
            }
            messagePort.postMessage({count, next, done, type: 'BROWSER_THRESHOLD'});
        }
    }
}

/**
 *  创建可读流
 *  @param {string} uniqLink
 *  @param {string} uuid
 *  @return {[ReadableStream,ReadableStreamDefaultController]}
 * */
function createReadableStream(uniqLink, uuid) {
    let controller;
    const stream = new ReadableStream({
        start(ctrl) {
            controller = ctrl;
        },
        cancel() {
            // only firefox need
            messagePort.postMessage({uuid, type: 'USER_CANCEL_DOWNLOAD'});
        }
    });
    return [stream, controller]
}

self.addEventListener('install', () => {
    self.skipWaiting()
})

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim())
})

self.addEventListener('message', function (event) {
    if (event.data === 'SW_INIT') {
        messagePort = event.ports[0]
        messagePort.onmessage = onmessage
    } else if (event.data === 'ping') {
        // console.log('pong');
    }
})

self.addEventListener('fetch', function (event) {
    const url = event.request.url
    if (!map.has(url)) return;
    const {readableStream, filename, size} = map.get(url);
    const responseHeaders = new Headers({
        'Content-Type': 'application/octet-stream; charset=utf-8',
        'Content-Disposition': "attachment; filename*=UTF-8''" + filename,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        'X-Content-Security-Policy': "default-src 'none'",
        'X-WebKit-CSP': "default-src 'none'",
        'X-XSS-Protection': '1; mode=block'
    })
    if (size) {
        responseHeaders.append('Content-Length', size)
    }
    event.respondWith(new Response(readableStream, {headers: responseHeaders}))
})
