// script.js

// --- DOM要素の取得 ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const switchCameraBtn = document.getElementById('switch-camera');
const snapBtn = document.getElementById('snap');
const recognizeBtn = document.getElementById('recognize');
const resultText = document.getElementById('result');
const statusText = document.getElementById('status');

// --- グローバル変数 ---
let currentStream; // 現在のカメラストリームを保持
let currentFacingMode = 'environment'; // 'environment'はアウトカメラ, 'user'はインカメラ
let captured = false;

// --- 関数定義 ---

/**
 * ステータスメッセージを更新し、対応するCSSクラスを適用する
 * @param {string} message 表示するメッセージ
 * @param {'info'|'progress'|'success'|'error'} type メッセージの種類
 */
function updateStatus(message, type) {
    statusText.textContent = message;
    statusText.className = `status-${type}`;
}

/**
 * 指定されたカメラモードでカメラを起動する
 * @param {'environment' | 'user'} facingMode 起動するカメラの向き
 */
async function startCamera(facingMode) {
    // 既存のストリームがあれば停止する
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
        });
    }

    const constraints = {
        video: {
            facingMode: { exact: facingMode }
        }
    };

    try {
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        await video.play();
        updateStatus("準備完了", "info");
        captured = false;
        canvas.style.display = 'none';

    } catch (err) {
        console.error("カメラの起動に失敗しました:", err);
        if (err.name === "OverconstrainedError" && facingMode === 'environment') {
            console.log("アウトカメラが見つかりません。インカメラを試します。");
            currentFacingMode = 'user';
            startCamera('user');
        } else {
            updateStatus("カメラにアクセスできません。ブラウザの権限設定を確認してください。", "error");
        }
    }
}

// --- イベントリスナー ---

// 1. カメラ切替ボタン
switchCameraBtn.addEventListener('click', () => {
    currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
    console.log(`カメラを切り替えます: ${currentFacingMode}`);
    startCamera(currentFacingMode);
});

// 2. 撮影ボタン
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

// 3. テキスト認識ボタン
recognizeBtn.addEventListener('click', () => {
    if (!captured) {
        alert("先に名刺を撮影してください。");
        return;
    }

    const selectedEngine = document.querySelector('input[name="ocr-engine"]:checked').value;
    resultText.value = '';
    updateStatus('認識処理中...', 'progress');

    if (selectedEngine === 'tesseract') {
        runTesseract();
    } else if (selectedEngine === 'vision-ai') {
        runVisionAI();
    }
});

// --- OCR実行関数 ---

// script.js の runTesseract 関数内
async function runTesseract() {
    try {
        updateStatus('Tesseract.js: 認識準備中...', 'progress');
        const { data: { text } } = await Tesseract.recognize(
            canvas,
            'jpn+eng', // ★★★ 日本語と英語を両方指定 ★★★
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

async function runVisionAI() {
    // ★★★【超重要】★★★
    // 以下のAPIキーは絶対にこのまま公開しないでください。
    // クライアントサイドにAPIキーを置くのはセキュリティ上非常に危険です。
    // 必ずサーバーサイドでAPIキーを管理し、サーバー経由でVision AIを呼び出すように実装してください。
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