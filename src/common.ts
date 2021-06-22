export class Uint8ArrayStack {
    stack = new Uint8Array([]);

    get length() {
        return this.stack.byteLength;
    }

    /**
     * 入栈数据
     * @param uint8Array:Uint8Array
     * */
    push(uint8Array) {
        const uint8Arrays = [this.stack, uint8Array];
        const size = uint8Arrays.reduce((total, next) => total + next.byteLength, 0)
        const result = new Uint8Array(size);
        let offset = 0;
        for (let uint8Array of uint8Arrays) {
            result.set(uint8Array, offset);
            offset += uint8Array.byteLength;
        }
        this.stack = result;
    }

    /**
     * 出栈数据
     * @param len:number
     * */
    readBytes(len) {
        if (len) {
            const outBytes = this.stack.subarray(0, len);
            this.stack = this.stack.subarray(len);
            return outBytes;
        } else {
            return null;
        }
    }
}

/**
 * 加解密工具
 * */
export class CryptoUtil {
    static ITER = 10000;
    static DECRYPT_BLOCK_SIZE = 16 * 1024 * 64 * 2;
    static AES_BLOCK_SIZE = 16;

    static getKeyIv = (content, password) => {
        const salt = content.slice(8, 16);
        return CryptoUtil.getKeyAndIv(password, salt, 'decrypt');
    }

    static decrypt = (content, key, iv) => {
        return window.crypto.subtle.decrypt({name: "AES-CBC", iv}, key, content);
    };

    static chunkDecrypt = async (chunk, key, iv) => {
        const nextIv = chunk.subarray(chunk.byteLength - CryptoUtil.AES_BLOCK_SIZE);
        const padding = await crypto.subtle.encrypt({
            name: 'AES-CBC',
            iv: nextIv
        }, key, new Uint8Array(0));
        const uint8ArrayStack = new Uint8ArrayStack();
        uint8ArrayStack.push(chunk);
        uint8ArrayStack.push(new Uint8Array(padding));
        const paddedData = uint8ArrayStack.readBytes(uint8ArrayStack.length);
        const content = await CryptoUtil.decrypt(paddedData, key, iv);
        return {chunkPlain: new Uint8Array(content), nextIv};
    }

    static getKeyAndIv = async (password, salt, keyUsages = 'encrypt') => {
        const passphraseBytes = new Uint8Array(32);
        const passwordBytes = new TextEncoder().encode(password).slice(0, 32);
        passphraseBytes.set(passwordBytes);
        const passphraseKey = await window.crypto.subtle.importKey('raw', passphraseBytes, {name: 'PBKDF2'}, false, ['deriveBits']);
        let pbkdf2Bytes = await window.crypto.subtle.deriveBits({
            name: 'PBKDF2',
            salt: salt,
            iterations: CryptoUtil.ITER,
            hash: 'SHA-256'
        }, passphraseKey, 384);
        pbkdf2Bytes = new Uint8Array(pbkdf2Bytes);
        const keyBytes = pbkdf2Bytes.slice(0, 32);
        const ivBytes = pbkdf2Bytes.slice(32);
        const key = await window.crypto.subtle.importKey('raw', keyBytes, {
            name: 'AES-CBC',
            length: 256
        }, false, ['encrypt', 'decrypt']);
        return {
            key,
            iv: ivBytes
        };
    };
}
