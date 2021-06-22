import {CryptoUtil, Uint8ArrayStack} from "./common";
import ZIP from "./zip";

/**
 * 文件名：FileSaveRegister
 * 作　者：Bryce.Li
 * 创　建：2021/6/16 11:28
 * 描　述：Bryce.Li
 * */

export default class FileSaveRegister {
    private aborterMap = {};
    private progressMap = {};
    private completeMap = {};
    private errorMap = {};
    private messagePort: MessagePort;
    private active: boolean = false;

    constructor(scope: string = '/', private options: { confirmMessage?: string; onMessage?: (data: any) => void } = {
        confirmMessage: '',
        onMessage: (data: any) => {
        }
    }) {
        // 注册service worker，并初始化逻辑
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', {scope}).then(swReg => {
                if (swReg.installing) {
                    window.location.reload();
                } else if (swReg.active) {
                    this.active = true;
                    return swReg;
                }
                return Promise.reject();
            }).then((reg) => {
                const messageChannel = new MessageChannel();
                reg.active.postMessage("SW_INIT", [messageChannel.port2]);
                this.messagePort = messageChannel.port1;
                // keepAlive 保存sw存活，firefox在30s后会关闭不活动的service worker
                // 通过postMessage ping pong方式使其不被关闭
                setInterval(() => reg.active.postMessage('ping'), 10000);
            }).then(() => {
                this.messagePort.onmessage = this._getMessage.bind(this);
            }).catch(err => {
            });
        }

        // 刷新或关闭页面时，清除\取消 所有下载任务
        window.addEventListener('beforeunload', () => this.abort('user refresh page'));
    }

    /**
     *  下载文件
     *  @param {string} filename 文件名
     *  @param {string | {name:string,url:string}[]} url
     *  @param {number} size 文件总大小 byte
     *  @param options
     * */
    public download(filename: string, url: string | { path: string, url: string }[], size?: number, options: Partial<{
        password: string,
        cancel: (canceler) => void,
        onProgress: (loaded: number, size: number) => void,
        onComplete: () => void,
        onError: (message: string) => void,
    }> = {}) {
        if (this.active) {
            const uuid = Math.random().toString().slice(-10);
            this.aborterMap[uuid] = null;
            this.messagePort.postMessage({
                type: 'DOWNLOAD_REGISTER', uuid, url, filename, size, password: options.password
            });
            options.cancel && options.cancel(() => {
                this.abort('cancel by canceler', uuid);
            });
            this.progressMap[uuid] = (loaded) => {
                options.onProgress && options.onProgress(loaded, size);
            };
            this.completeMap[uuid] = () => {
                options.onComplete && options.onComplete();
            };
            this.errorMap[uuid] = (message: string) => {
                options.onError && options.onError(message);
            };
        } else {
            console.error('service worker is not register or active');
            const bl = confirm(this.options.confirmMessage || 'sw服务未注册或激活，是否立即刷新浏览器？');
            if (bl) window.location.reload();
        }
    }

    /**
     * 终止下载
     * @param {string} message
     * @param {string} uuid
     * @return {boolean} 是否终止成功
     * */
    abort(message: string, uuid: string = null) {
        if (uuid) {
            if (this.aborterMap[uuid]) {
                this.aborterMap[uuid](message);
                return true;
            }
        } else {
            for (const uuid in this.aborterMap) {
                this.abort('user refresh page', uuid);
            }
        }
        return false;
    }

    /**
     *  MessageChannel 监听事件
     *  @param {MessageEvent} event
     * */
    private _getMessage(event: MessageEvent) {
        const {url, type, uniqLink, uuid, password} = event.data;
        this.options.onMessage && this.options.onMessage(event.data);
        if (type === 'DOWNLOAD_REGISTER_SUCCESS') {
            const iframe = document.createElement("iframe");
            iframe.src = uniqLink;
            iframe.hidden = true;
            document.body.appendChild(iframe);
            setTimeout(() => document.body.removeChild(iframe), 1000);
            if (Array.isArray(url)) {
                this._batchFetchFile(url, uniqLink, uuid, password);
            } else {
                this._fetchFile(url, uniqLink, uuid, password);
            }
        } else if (type === 'USER_CANCEL_DOWNLOAD') {
            this.abort('cancel by browser', uuid);
        }
    }

    /**
     * 连接 stream 数据流
     * @param {string} uniqLink:string
     * @param {number} uuid:number
     * @param {ReadableStream} readableStream
     * @param {string} password
     * @param zip
     * */
    private _pipStream(uniqLink: string, uuid: string, readableStream: ReadableStream, password: string, zip: boolean = false) {
        let loaded = 0;
        const reader = readableStream.getReader();
        this.messagePort.postMessage({type: 'DOWNLOAD_START', uniqLink});
        const pump = () => reader.read().then(res => {
            if (res.done) {
                this.messagePort.postMessage({type: 'DOWNLOAD_END', uniqLink});
                this.completeMap[uuid]();
            } else {
                const chunk = res.value;
                loaded += chunk.length;
                this.messagePort.postMessage({type: 'DOWNLOADING', chunk, uniqLink, uuid, password, zip});
                this.progressMap[uuid](loaded);
                pump();
            }
        });
        pump();
    }

    /**
     * 增强 Fetch，具有中断及解密功能
     * _fetch
     * @param {string} url
     * @param {string} password
     * @param {string} uuid
     * @param options
     * @returns {Promise}
     * */
    private _fetch(url: string, password: string, uuid: string, options) {
        const abort = options.canceler || function () {
        };
        let uint8ArrayStack = new Uint8ArrayStack();
        const abortHandler = (res) => {
            const reader = res.body.getReader();
            const stream = new ReadableStream({
                start: (controller) => {
                    let aborted = false, keyIV;
                    const push = async () => {
                        try {
                            // 增加网络异常reader.read()捕获-abort
                            const {value, done} = await reader.read();
                            if (!done) {
                                if (!password) {
                                    controller.enqueue(value);
                                    push();
                                    return;
                                }
                                uint8ArrayStack.push(value);
                                const loopDecrypt = async () => {
                                    // 循环解密
                                    if (uint8ArrayStack.length > CryptoUtil.DECRYPT_BLOCK_SIZE) {
                                        const inBytes = uint8ArrayStack.readBytes(CryptoUtil.DECRYPT_BLOCK_SIZE);
                                        let {chunkPlain, nextIv} = await CryptoUtil.chunkDecrypt(inBytes, keyIV.key, keyIV.iv);
                                        try {
                                            controller.enqueue(chunkPlain);
                                        } catch (e) {
                                        }
                                        keyIV.iv = nextIv;
                                        await loopDecrypt();
                                    } else {
                                        push();
                                    }
                                };
                                // 获取原始key和iv
                                if (uint8ArrayStack.length >= CryptoUtil.AES_BLOCK_SIZE && !keyIV) {
                                    const inBytes = uint8ArrayStack.readBytes(CryptoUtil.AES_BLOCK_SIZE);
                                    keyIV = await CryptoUtil.getKeyIv(inBytes, password);
                                }
                                await loopDecrypt();
                            } else {
                                if (!aborted) {
                                    if (!password) {
                                        controller.close();
                                        return;
                                    }
                                    if (uint8ArrayStack.length > 0) {
                                        // 解密剩余部分
                                        try {
                                            const plain = await CryptoUtil.decrypt(uint8ArrayStack.readBytes(uint8ArrayStack.length), keyIV.key, keyIV.iv);
                                            controller.enqueue(new Uint8Array(plain));
                                            controller.close();
                                        } catch (e) {
                                            // 解密失败捕获-abort
                                            this.abort('decrypt error', uuid);
                                        }
                                    } else {
                                        controller.close();
                                    }
                                }
                            }
                        } catch (err) {
                            this.abort(err, uuid);
                        }
                    };
                    abort(() => {
                        reader.cancel();
                        controller.error('forced interrupt fetch');
                        aborted = true;
                    });
                    push();
                }
            });
            return new Response(stream, {headers: res.headers});
        };
        return fetch(url).then(abortHandler);
    }

    /**
     * _fetchFile
     * 单文件下载
     * @param {string} url
     * @param {string} uniqLink
     * @param {string} uuid
     * @param {string} password
     * */
    private _fetchFile(url: string, uniqLink: string, uuid: string, password: string) {
        this._fetch(url, password, uuid, {
            canceler: (canceler) => {
                this.aborterMap[uuid] = (message: string = 'abort') => {
                    canceler();
                    this.messagePort.postMessage({uniqLink, type: 'DOWNLOAD_ABORT'});
                    this.errorMap[uuid](message);
                };
            }
        }).then(response => {
            const readableStream = response.body;
            this._pipStream(uniqLink, uuid, readableStream, password);
        }).catch((err) => {
            if (!this.abort(uuid, err)) {
                this.messagePort.postMessage({uniqLink, type: 'DOWNLOAD_ABORT'});
                this.errorMap[uuid](err);
            }
        });
    }

    /**
     * _batchFetchFile
     * @param {{name:string,url:string}[]} fileList
     * @param {string} uniqLink
     * @param {string} uuid
     * @param password
     * */
    private _batchFetchFile(fileList, uniqLink, uuid, password) {
        let fetchCanceler;
        const files = fileList.map(item => [item.path, item.url]).values();
        // @ts-ignore
        const {readableZipStream, abort} = new ZIP({
            pull: (ctrl) => {
                const it = files.next();
                if (it.done) {
                    ctrl.close();
                } else {
                    // TODO 这里直接捕获了异常是否影响pull
                    const [name, url] = it.value;
                    return this._fetch(url, password, uuid, {
                        canceler: canceler => fetchCanceler = canceler
                    }).then(res => {
                        ctrl.enqueue({name, stream: () => res.body});
                    }).catch((err) => {
                        if (!this.abort(uuid, err)) {
                            this.messagePort.postMessage({uniqLink, type: 'DOWNLOAD_ABORT'});
                            this.errorMap[uuid](err);
                        }
                    });
                }
            }
        });
        this.aborterMap[uuid] = (message: string = 'abort') => {
            abort();
            fetchCanceler();
            this.messagePort.postMessage({uniqLink, type: 'DOWNLOAD_ABORT'});
            this.errorMap[uuid](message);
        };
        this._pipStream(uniqLink, uuid, readableZipStream, password, true);
    }

}




