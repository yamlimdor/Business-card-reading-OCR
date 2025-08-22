// --- DOM要素の取得 ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const switchCameraBtn = document.getElementById('switch-camera');
const snapBtn = document.getElementById('snap');
const recognizeBtn = document.getElementById('recognize');
const resultText = document.getElementById('result');
const statusText = document.getElementById('status');

// --- 新しいUI要素の取得 ---
const preprocessingControls = document.getElementById('preprocessing-controls');
const blockSizeSlider = document.getElementById('block-size');
const cValueSlider = document.getElementById('c-value');
const blockSizeValue = document.getElementById('block-size-value');
const cValueValue = document.getElementById('c-value-value');
const showProcessedCheckbox = document.getElementById('show-processed');
const visionAiRadio = document.getElementById('vision-ai');
const tesseractRadio = document.getElementById('tesseract');


// --- グローバル変数 ---
let currentStream;
let currentFacingMode = 'environment';
let captured = false;
let cvReady = false;
let originalImage = null; // 撮影したオリジナル画像を保持する変数

// --- 関数定義 ---

// OpenCVの準備ができたかどうかのフラグ
function onOpenCvReady() {
    console.log("OpenCV is ready.");
    cvReady = true;
    recognizeBtn.disabled = false;
    updateStatus("準備完了", "info");
}

// ステータスメッセージを更新する
function updateStatus(message, type) {
    statusText.textContent = message;
    statusText.className = `status-${type}`;
}

// カメラを起動する
async function startCamera(facingMode) {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    const constraints = { video: { facingMode: { exact: facingMode } } };
    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        await video.play();
        updateStatus("カメラで名刺を撮影してください。", "info");
        captured = false;
        originalImage = null;
        canvas.style.display = 'none';
        togglePreprocessingControls(); // カメラ起動時は非表示
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

// 前処理コントロールの表示/非表示を切り替える
function togglePreprocessingControls() {
    const tesseractSelected = tesseractRadio.checked;
    if (captured && tesseractSelected) {
        preprocessingControls.style.display = 'block';
    } else {
        preprocessingControls.style.display = 'none';
    }
}

// オリジナル画像をキャンバスに復元する
function restoreOriginalImage() {
    if (originalImage) {
        const context = canvas.getContext('2d');
        canvas.width = originalImage.width;
        canvas.height = originalImage.height;
        context.putImageData(originalImage, 0, 0);
    }
}

// 現在のパラメータで前処理を適用し、結果をキャンバスに表示する
function applyAndShowPreprocessing() {
    if (!cvReady || !originalImage) return;
    try {
        const blockSize = parseInt(blockSizeSlider.value);
        const C = parseInt(cValueSlider.value);

        let src = cv.matFromImageData(originalImage);
        let processed = new cv.Mat();
        cv.cvtColor(src, processed, cv.COLOR_RGBA2GRAY, 0);
        cv.adaptiveThreshold(processed, processed, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize, C);
        cv.imshow(canvas, processed);
        src.delete();
        processed.delete();
    } catch (error) {
        console.error("Pre-processing error:", error);
        updateStatus("画像処理プレビュー中にエラーが発生しました。", "error");
        restoreOriginalImage();
    }
}

// Tesseract.jsで認識を実行する (OpenCVによる前処理込み)
async function runTesseractWithCv() {
    if (!cvReady || !originalImage) {
        updateStatus("画像処理ライブラリまたは撮影画像がありません。", "error");
        return;
    }

    let worker; // finallyブロックでアクセスするためにここで定義

    try {
        updateStatus('画像の前処理をしています...', 'progress');
        const blockSize = parseInt(blockSizeSlider.value);
        const C = parseInt(cValueSlider.value);

        let src = cv.matFromImageData(originalImage);
        let processed = new cv.Mat();
        cv.cvtColor(src, processed, cv.COLOR_RGBA2GRAY, 0);
        cv.adaptiveThreshold(processed, processed, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize, C);
        cv.imshow(canvas, processed);
        src.delete();
        processed.delete(); // canvasに描画後はmatを解放して良い

        updateStatus('Tesseract.js: ワーカーを準備しています...', 'progress');
        worker = await Tesseract.createWorker('jpn+eng', 1, {
            logger: m => {
                let statusMessage = m.status;
                // 'recognizing text' の場合のみ進捗率を追記
                if (m.status === 'recognizing text' && m.progress) {
                    statusMessage += ` (${Math.floor(m.progress * 100)}%)`;
                }
                updateStatus(`認識中: ${statusMessage}`, 'progress');
                console.log(m); // 詳細なログをコンソールに出力
            }
        });

        updateStatus('Tesseract.js: テキストを認識中...', 'progress');
        const { data: { text } } = await worker.recognize(canvas);

        updateStatus('Tesseract.js で認識完了', 'success');
        resultText.value = text;

    } catch (error) {
        console.error("Tesseract/OpenCV Error:", error);
        updateStatus("認識処理中にエラーが発生しました。", "error");
    } finally {
        if (worker) {
            await worker.terminate();
            console.log("Tesseract worker terminated.");
        }
        // 認識後、チェックボックスの状態に基づいて表示を復元
        if (!showProcessedCheckbox.checked) {
            restoreOriginalImage();
        }
    }
}

// Google Cloud Vision AIで認識を実行する
async function runVisionAI() {
    const API_KEY = 'YOUR_GOOGLE_CLOUD_VISION_API_KEY'; // ここにAPIキーを設定
    if (API_KEY === 'YOUR_GOOGLE_CLOUD_VISION_API_KEY') {
        updateStatus("Vision AIのAPIキーが設定されていません。", "error");
        return;
    }
    const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;
    const base64ImageData = canvas.toDataURL('image/jpeg').replace(/^data:image\/jpeg;base64,/, '');
    const requestBody = { requests: [ { image: { content: base64ImageData }, features: [{ type: 'TEXT_DETECTION' }] } ] };
    try {
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        const result = await response.json();
        if (result.error) {
            updateStatus(`Vision AIエラー: ${result.error.message}`, 'error');
            return;
        }
        if (result.responses && result.responses[0] && result.responses[0].fullTextAnnotation) {
            updateStatus('Google Cloud Vision AI で認識完了', 'success');
            resultText.value = result.responses[0].fullTextAnnotation.text;
        } else {
            updateStatus('テキストを検出できませんでした。', 'info');
            resultText.value = '';
        }
    } catch (error) {
        updateStatus('APIサーバーへの接続中にエラーが発生しました。', 'error');
    }
}


// --- イベントリスナー ---

// カメラ切り替え
switchCameraBtn.addEventListener('click', () => {
    currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
    startCamera(currentFacingMode);
});

// 撮影
snapBtn.addEventListener('click', () => {
    if (!currentStream || !currentStream.active) {
        alert("カメラが起動していません。");
        return;
    }
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    originalImage = context.getImageData(0, 0, canvas.width, canvas.height);

    canvas.style.display = 'block';
    captured = true;

    // スライダーとチェックボックスをリセット
    showProcessedCheckbox.checked = false;
    blockSizeSlider.value = 11;
    blockSizeValue.textContent = '11';
    cValueSlider.value = 2;
    cValueValue.textContent = '2';

    togglePreprocessingControls();
    updateStatus("撮影しました。画像を調整し「テキスト認識」を押してください。", "success");
});

// テキスト認識
recognizeBtn.addEventListener('click', () => {
    if (!captured) {
        alert("先に名刺を撮影してください。");
        return;
    }
    const selectedEngine = document.querySelector('input[name="ocr-engine"]:checked').value;
    resultText.value = '';
    updateStatus('認識処理中...', 'progress');

    if (selectedEngine === 'tesseract') {
        runTesseractWithCv();
    } else if (selectedEngine === 'vision-ai') {
        runVisionAI();
    }
});

// OCRエンジン変更
visionAiRadio.addEventListener('change', togglePreprocessingControls);
tesseractRadio.addEventListener('change', togglePreprocessingControls);

// --- 前処理パラメータ変更 ---
blockSizeSlider.addEventListener('input', () => {
    blockSizeValue.textContent = blockSizeSlider.value;
    if (showProcessedCheckbox.checked) {
        applyAndShowPreprocessing();
    }
});

cValueSlider.addEventListener('input', () => {
    cValueValue.textContent = cValueSlider.value;
    if (showProcessedCheckbox.checked) {
        applyAndShowPreprocessing();
    }
});

showProcessedCheckbox.addEventListener('change', () => {
    if (showProcessedCheckbox.checked) {
        applyAndShowPreprocessing();
    } else {
        restoreOriginalImage();
    }
});


// --- 初期化処理 ---
updateStatus("画像処理ライブラリを読込中...", "progress");
recognizeBtn.disabled = true;
startCamera(currentFacingMode);