# stream saver with aes
基于Service Worker的文件流式下载，避免下载大文件时内存使用过大导致浏览器崩溃。

## 功能简介
* 流式文件下载
  * 支持ASE256解密(兼容OpenSSL: openssl aes-256-cbc -d -salt -pbkdf2 -iter 10000 -in encryptedFile -out decryptedFile)

## 引入

支持以下几种安装方式

    * 工程项目推荐使用es module引入，以便利用工程进行tree shaking优化

* 使用 NPM 安装(Yarn同理)
  ```
  npm install stream-saver-with-aes
  ```
  ```Javascript
  import FileSaveRegister from 'stream-saver-with-aes'
  // or
  const FileSaveRegister = require('stream-saver-with-aes')
  ```
  
---
## 使用
```Javascript
  const fileSave = new FileSaveRegister('/');
  fileSave.download(...);
  ```
  *** 需手动拷贝sswa-sw.js文件到站点根目录，以便获得全局Service Worker权限
  
  
## 【类】FileSaveRegister
```JavaScript
export default class FileSaveRegister {
    constructor(scope?: string, options?: {
        confirmMessage?: string;
        onMessage?: (data: any) => void;
    });

    download(filename: string, url: string | {path: string;url: string;}[], size?: number, options?: Partial<{
        password: string;
        cancel: (canceler: any) => void;
        onProgress: (loaded: number, size: number) => void;
    }>): void;
}
```
