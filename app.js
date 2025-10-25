// ========================================
// DOM要素の取得
// ========================================
const channelInput = document.getElementById('channelInput');
const fetchModeRadios = document.getElementsByName('fetchMode');
const maxVideosInput = document.getElementById('maxVideos');
const fetchButton = document.getElementById('fetchButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const outputSection = document.getElementById('outputSection');
const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');
const urlsOutput = document.getElementById('urlsOutput');
const titlesOutput = document.getElementById('titlesOutput');
const datesOutput = document.getElementById('datesOutput');

// ========================================
// 初期設定
// ========================================
// ラジオボタンの変更を監視して、数値入力の有効/無効を切り替え
fetchModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        maxVideosInput.disabled = radio.value === 'all';
    });
});

// コピーボタンの設定
document.querySelectorAll('.copy-button').forEach(button => {
    button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-target');
        const targetElement = document.getElementById(targetId);
        const text = targetElement.textContent;

        navigator.clipboard.writeText(text).then(() => {
            const originalText = button.textContent;
            button.textContent = 'コピー完了!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('コピーに失敗しました:', err);
            alert('コピーに失敗しました。手動でコピーしてください。');
        });
    });
});

// ========================================
// メイン処理：動画情報取得
// ========================================
fetchButton.addEventListener('click', async () => {
    // 入力値の取得
    const inputText = channelInput.value.trim();
    if (!inputText) {
        showError('チャンネルIDまたはURLを入力してください。');
        return;
    }

    // チャンネルIDを抽出
    const channelIds = extractChannelIds(inputText);
    if (channelIds.length === 0) {
        showError('有効なチャンネルIDまたはURLが見つかりませんでした。');
        return;
    }

    // 取得モードの確認
    const fetchMode = document.querySelector('input[name="fetchMode"]:checked').value;
    const maxVideos = fetchMode === 'latest' ? parseInt(maxVideosInput.value, 10) : null;

    // UI状態の更新
    fetchButton.disabled = true;
    loadingIndicator.style.display = 'flex';
    errorSection.style.display = 'none';
    outputSection.style.display = 'none';

    try {
        // 各チャンネルから動画情報を取得
        const allVideos = [];
        for (const channelId of channelIds) {
            const videos = await fetchVideosFromChannel(channelId);
            allVideos.push(...videos);
        }

        if (allVideos.length === 0) {
            showError('動画が見つかりませんでした。チャンネルIDを確認してください。');
            return;
        }

        // 公開日でソート（新しい順）
        allVideos.sort((a, b) => new Date(b.published) - new Date(a.published));

        // 件数制限を適用
        const filteredVideos = maxVideos ? allVideos.slice(0, maxVideos) : allVideos;

        // 結果を表示
        displayResults(filteredVideos);

    } catch (error) {
        showError(`エラーが発生しました: ${error.message}`);
    } finally {
        fetchButton.disabled = false;
        loadingIndicator.style.display = 'none';
    }
});

// ========================================
// 関数：チャンネルIDを抽出
// ========================================
function extractChannelIds(inputText) {
    const lines = inputText.split('\n').map(line => line.trim()).filter(line => line);
    const channelIds = [];

    lines.forEach(line => {
        // チャンネルIDのパターン: UCで始まる24文字
        const idMatch = line.match(/UC[\w-]{22}/);
        if (idMatch) {
            channelIds.push(idMatch[0]);
        }
    });

    return [...new Set(channelIds)]; // 重複を除去
}

// ========================================
// 関数：チャンネルから動画情報を取得
// ========================================
async function fetchVideosFromChannel(channelId) {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

    // CORS対策: corsproxy.io を使用
    // 注意: 本番環境では独自のプロキシまたはバックエンドを使用することを推奨
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error(`チャンネル ${channelId} の取得に失敗しました (HTTP ${response.status})`);
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // パースエラーのチェック
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error(`XML パースエラー: ${parserError.textContent}`);
    }

    // <entry>要素から動画情報を抽出
    const entries = xmlDoc.querySelectorAll('entry');
    const videos = [];

    entries.forEach(entry => {
        const videoId = entry.querySelector('videoId')?.textContent;
        const title = entry.querySelector('title')?.textContent;
        const published = entry.querySelector('published')?.textContent;

        if (videoId && title && published) {
            videos.push({
                videoId,
                title,
                published,
                url: `https://www.youtube.com/watch?v=${videoId}`
            });
        }
    });

    return videos;
}

// ========================================
// 関数：結果を表示
// ========================================
function displayResults(videos) {
    // URLs
    const urls = videos.map(v => v.url).join('\n');
    urlsOutput.textContent = urls;

    // Titles
    const titles = videos.map(v => v.title).join('\n');
    titlesOutput.textContent = titles;

    // Published Dates
    const dates = videos.map(v => v.published).join('\n');
    datesOutput.textContent = dates;

    // 出力セクションを表示
    outputSection.style.display = 'block';

    // スクロール
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ========================================
// 関数：エラー表示
// ========================================
function showError(message) {
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    outputSection.style.display = 'none';
    fetchButton.disabled = false;
    loadingIndicator.style.display = 'none';
}
