import {Component} from '@angular/core';
import FileSaveRegister from "stream-saver-with-aes/index";


@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css']
})
export class AppComponent {
    fileSaveRegister = new FileSaveRegister('/', {
        onMessage: (data) => {
            if (data.type === 'BROWSER_THRESHOLD') {
                document.getElementById('test').innerText = JSON.stringify(data);
            }
        }
    });


    download(filename: string, size: number, password?: string) {
        this.fileSaveRegister.download(filename, 'http://localhost:8000/examples/' + filename, size, {
            password,
            cancel: (canceler) => {
                /*setTimeout(() => {
                    canceler();
                    console.log('cancel');
                }, 3000);*/
            },
            onProgress: (total, loaded) => {
                // console.log(total, loaded);
            },
            onComplete: () => {
                console.log('download success');
            },
            onError: (message) => {
                console.log('download error:' + message);
            }
        });
    }

    batchDownload() {
        // @ts-ignore
        this.fileSaveRegister.download('test.zip', [
            {
                path: 'some-folder/cat.jpg',
                url: 'http://localhost:8000/examples/16-4M.jpg'
            },
            {
                path: 'some-folder/status.mp4',
                url: 'http://localhost:8000/examples/test.txt'
            },
            {
                path: 'some-folder/teapot.jpg',
                url: 'http://localhost:8000/examples/16-4M.jpg'
            }
        ], 11111111111, {
            onComplete: () => {
                console.log('download success');
            },
            onError: (message) => {
                console.log('download error:' + message);
            }
        });
    }

    batchDownload1() {
        // @ts-ignore
        this.fileSaveRegister.download('test.zip', [
            {
                path: 'some-folder/cat.jpg',
                url: 'http://localhost:8000/examples/test_jiami.mp4'
            },
            {
                path: 'some-folder/status.mp4',
                url: 'http://localhost:8000/examples/test_jiami.mp4'
            },
            {
                path: 'some-folder/teapot.jpg',
                url: 'http://localhost:8000/examples/test.mp4'
            }
        ], 11111111111, {
            password: "1",
            onComplete: () => {
                console.log('download success');
            },
            onError: (message) => {
                console.log('download error:' + message);
            }
        });
    }

    getData() {
        fetch('http://localhost:8000/examples/test.txt').then(response => {
            const reader = response.body.getReader();
            reader.read().then(() => {
            });
            return response.blob();
        }).then(data => {
            console.log(data);
        }).catch(err => {
            console.log(err);
        });
    }

    ngOnInit(): void {
    }
}
