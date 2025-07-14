// script.js (デザイン対応版)

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const snapBtn = document.getElementById('snap');
const recognizeBtn = document.getElementById('recognize');
const resultText = document.getElementById('result');
const statusText = document.getElementById('status');
let captured = false;

// 1. カメラ機能
// `playsinline`を追加することでiPhoneのSafariで全画面になるのを防ぐ
navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        video.srcObject = stream;
    })
    .catch(err => {
        console.error("カメラへのアクセスに失敗しました:", err);
        updateStatus("カメラにアクセスできません。", "error");
    });

// ステータス更新用のヘルパー関数
function updateStatus(message, type) {
    statusText.textContent = message;
    statusText.className = `status-${type}`; // 例: status-info, status-progress, ...
}


// 2. 撮影処理
snapBtn.addEventListener('click', () => {
    // 撮影した画像をcanvasに表示
    canvas.style.display = 'block';
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    captured = true;
    updateStatus("撮影しました。「テキスト認識」ボタンを押してください。", "success");
});

// 3. テキスト認識ボタンのイベント
recognizeBtn.addEventListener('click', () => {
    if (!captured) {
        alert("先に名刺を撮影してください。");
        return;
    }

    const selectedEngine = document.querySelector('input[name="ocr-engine"]:checked').value;
    resultText.value = '';
    updateStatus('認識処理中...', 'progress');

    // 処理の分岐
    if (selectedEngine === 'tesseract') {
        runTesseract();
    } else if (selectedEngine === 'vision-ai') {
        runVisionAI();
    }
});

// 5-A. Tesseract.jsを実行する関数
async function runTesseract() {
    try {
        const { data: { text } } = await Tesseract.recognize(
            canvas,
            'jpn',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        updateStatus(`認識中... (${Math.floor(m.progress * 100)}%)`, 'progress');
                    }
                }
            }
        );
        updateStatus('Tesseract.js で認識完了', 'success');
        resultText.value = text;
    } catch (error) {
        console.error("Tesseract Error:", error);
        updateStatus("Tesseractでの認識中にエラーが発生しました。", "error");
    }
}

// 5-B. Google Cloud Vision AIを実行する関数
async function runVisionAI() {
    // ★★★ 重要 ★★★
    // APIキーはサーバーサイドで管理することを強く推奨します。
    // ここではデモのためクライアントサイドに記述しています。
    const API_KEY = 'YOUR_GOOGLE_CLOUD_VISION_API_KEY';
    const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;

    const base64ImageData = canvas.toDataURL('image/jpeg').replace(/^data:image\/jpeg;base64,/, '');

    const requestBody = {
        requests: [
            {
                image: { content: base64ImageData },
                features: [{ type: 'TEXT_DETECTION' }]
            }
        ]
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        const result = await response.json();
        
        if (result.error) {
            console.error('Vision AI API Error:', result.error.message);
            updateStatus(`Vision AIエラー: ${result.error.message}`, 'error');
            return;
        }

        if (result.responses && result.responses[0].fullTextAnnotation) {
            updateStatus('Google Cloud Vision AI で認識完了', 'success');
            resultText.value = result.responses[0].fullTextAnnotation.text;
        } else {
            updateStatus('テキストを検出できませんでした。', 'info');
            resultText.value = '';
        }

    } catch (error) {
        console.error('Fetch Error:', error);
        updateStatus('APIサーバーへの接続中にエラーが発生しました。', 'error');
    }
}