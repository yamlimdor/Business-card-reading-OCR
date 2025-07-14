// script.js (全文をこちらに置き換えてください)

// --- DOM要素の取得 ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const switchCameraBtn = document.getElementById('switch-camera');
const snapBtn = document.getElementById('snap');
const recognizeBtn = document.getElementById('recognize');
const resultText = document.getElementById('result');
const statusText = document.getElementById('status');

// --- グローバル変数 ---
let currentStream;
let currentFacingMode = 'environment';
let captured = false;
let cvReady = false; // OpenCVの準備ができたかどうかのフラグ

// OpenCVがロードされたら呼ばれる関数
function onOpenCvReady() {
    console.log("OpenCV is ready.");
    cvReady = true;
    // 準備ができたら認識ボタンを有効化するなどの処理も可能
}


// --- 関数定義 ---
function updateStatus(message, type) {
    statusText.textContent = message;
    statusText.className = `status-${type}`;
}

async function startCamera(facingMode) {
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
        });
    }
    const constraints = { video: { facingMode: { exact: facingMode } } };
    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        await video.play();
        updateStatus("準備完了", "info");
        captured = false;
        canvas.style.display = 'none';
    } catch (err) {
        console.error("カメラの起動に失敗:", err);
        if (err.name === "OverconstrainedError" && facingMode === 'environment') {
            currentFacingMode = 'user';
            startCamera('user');
        } else {
            updateStatus("カメラにアクセスできません。", "error");
        }
    }
}

// --- イベントリスナー ---
switchCameraBtn.addEventListener('click', () => {
    currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
    startCamera(currentFacingMode);
});

snapBtn.addEventListener('click', () => {
    if (!currentStream || !currentStream.active) {
        alert("カメラが起動していません。");
        return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.style.display = 'block';
    captured = true;
    updateStatus("撮影しました。「テキスト認識」ボタンを押してください。", "success");
});

recognizeBtn.addEventListener('click', () => {
    if (!captured) {
        alert("先に名刺を撮影してください。");
        return;
    }
    const selectedEngine = document.querySelector('input[name="ocr-engine"]:checked').value;
    resultText.value = '';
    updateStatus('認識処理中...', 'progress');
    if (selectedEngine === 'tesseract') {
        runTesseractWithCv(); // ★★★ OpenCVを使う関数を呼び出す ★★★
    } else if (selectedEngine === 'vision-ai') {
        runVisionAI();
    }
});


// ★★★ OpenCVで前処理を行うTesseract実行関数 ★★★
async function runTesseractWithCv() {
    if (!cvReady) {
        updateStatus("画像処理ライブラリの準備ができていません。少し待ってから再度お試しください。", "error");
        return;
    }

    try {
        updateStatus('画像の前処理をしています...', 'progress');
        
        // 1. canvasから画像を読み込む
        let src = cv.imread(canvas);
        let processed = new cv.Mat();

        // 2. グレースケール化
        cv.cvtColor(src, processed, cv.COLOR_RGBA2GRAY, 0);

        // 3. 二値化（背景と文字をくっきり分ける）
        // この閾値(11, 2)は調整が必要な場合があります
        cv.adaptiveThreshold(processed, processed, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

        // (任意) 処理後の画像をcanvasに表示して確認する
        // cv.imshow(canvas, processed);

        // 4. Tesseract.jsで認識実行
        updateStatus('Tesseract.js: テキストを認識中...', 'progress');
        const { data: { text } } = await Tesseract.recognize(
            processed.data, // 加工後の画像データを渡す
            processed.cols, // 幅
            processed.rows, // 高さ
            {
                lang: 'jpn+eng',
                logger: m => {
                    if (m.status === 'recognizing text') {
                        updateStatus(`認識中... (${Math.floor(m.progress * 100)}%)`, 'progress');
                    }
                }
            }
        );

        updateStatus('Tesseract.js で認識完了', 'success');
        resultText.value = text;
        
        // メモリ解放
        src.delete();
        processed.delete();

    } catch (error) {
        console.error("Tesseract/OpenCV Error:", error);
        updateStatus("認識処理中にエラーが発生しました。", "error");
    }
}


// --- Vision AIの関数 (変更なし) ---
async function runVisionAI() {
    // ... (既存のコードのまま)
    const API_KEY = 'YOUR_GOOGLE_CLOUD_VISION_API_KEY';
    const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;
    const base64ImageData = canvas.toDataURL('image/jpeg').replace(/^data:image\/jpeg;base64,/, '');
    const requestBody = { requests: [ { image: { content: base64ImageData }, features: [{ type: 'TEXT_DETECTION' }] } ] };
    try {
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
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


// --- 初期化処理 ---
startCamera(currentFacingMode);