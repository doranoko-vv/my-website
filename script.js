console.log("script.js 読み込みOK");

// 入力欄から、そのまま文字列として読み取る項目の一覧
// （HTMLの id と、CCv2の項目名をそろえてある）
// 項目を増やすときは、HTMLに欄を足して、ここに名前を足すだけでOK
const TEXT_FIELDS = [
    "name",
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
    "creator_notes",
    "system_prompt",
    "post_history_instructions",
    "creator",
    "character_version",
];

// フォームの入力内容を読み取って、オブジェクトにまとめる
function readForm() {
    const data = {};
    for (const key of TEXT_FIELDS) {
        data[key] = document.getElementById(key).value;
    }

    // タグは「カンマ区切りの文字列」→「配列」に変換する
    const tagsText = document.getElementById("tags").value;
    data.tags = tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "");

    return data;
}

// カードの中身を、フォームに入れる（readForm の逆）
function fillForm(data) {
    for (const key of TEXT_FIELDS) {
        document.getElementById(key).value = data[key] ?? "";
    }
    document.getElementById("tags").value = (data.tags ?? []).join(", ");
}

// CCv2の形に組み立てる
function buildCard() {
    // 読み込んだカードを土台にして、フォームの内容で上書きする
    // （フォームにない項目も、消さずに残すため）
    const data = { ...importedData, ...readForm() };

    // まだ入力欄がない項目は、なければ空の値を入れておく（CCv2で必須のため）
    data.alternate_greetings ??= [];
    data.extensions ??= {};

    return {
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: data,
    };

}

// Blob（メモリ上のファイル）を、ダウンロードさせる
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// カードをJSONファイルとしてダウンロードさせる
function downloadJson(card) {
    const json = JSON.stringify(card, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, `${card.data.name || "character"}.json`);
}

// カードをPNGファイルとしてダウンロードさせる
function downloadPng(card, pngBytes) {
    const blob = embedCard(pngBytes, card);
    downloadBlob(blob, `${card.data.name || "character"}.png`);
}


// 読み込んだ画像のバイト列（まだ読み込んでいなければ null）
let imageBytes = null;

// 読み込んだカードの data（フォームにない項目も含めて、まるごと持っておく）
let importedData = {};


// PNGファイルの最初の8バイト（シグネチャ）
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

// バイト列がPNGかどうかを、シグネチャで確かめる
function isPng(bytes) {
    return PNG_SIGNATURE.every((value, i) => bytes[i] === value);
}

// Canvasに描いた絵を、PNGのバイトにする
async function canvasToPngBytes(canvas) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
}

// PNG以外の画像（JPEGなど）を、Canvasで描き直してPNGのバイトにする
// ※ Canvasは tEXt を消すが、JPEGにはカードのデータがないので問題ない
async function convertToPng(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    return canvasToPngBytes(canvas);
}

//提出する画像がない人向けに、サンプル画像（シルエット）を描いて、PNGのバイト列にする
async function makeSampleImage(){
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    //背景は色相をランダムとして、パステル色に明度と彩度を調整したものにする
    const hue = Math.floor(Math.random() * 360);
    ctx.fillStyle = `hsl(${hue}, 50%, 80%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    //シルエットは背景と同じ色相で、濃い色にする
    ctx.fillStyle = `hsl(${hue}, 40%, 40%)`;

    // 横の中心（キャンバスの幅の半分）
    const cx = canvas.width / 2;

    // 頭：中心 (cx, 220)、半径 70 → 下端は y = 290
    ctx.beginPath();
    ctx.arc(cx, 220, 70, 0, Math.PI * 2);
    ctx.fill();

    // 体：首のすき間を10pxあけて y = 300 から、画像の下端まで
    // roundRect は「左上の角」で指定するので、中心から幅の半分だけ左にずらす
    const bodyW = 220;
    ctx.beginPath();
    ctx.roundRect(cx - bodyW / 2, 300, bodyW, canvas.height - 300, [bodyW / 2, bodyW / 2, 0, 0]);
    ctx.fill();

    return canvasToPngBytes(canvas);
}

// PNGのバイト列を、チャンクの配列に分解する
// 各チャンクは { type: "IHDR", data: (中身のバイト列) } の形
function readChunks(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks = [];
    let pos = 8; // 最初の8バイトはシグネチャなので飛ばす

    while (pos < bytes.length) {
        // [長さ 4バイト][種類 4バイト][データ][CRC 4バイト]
        const length = view.getUint32(pos);
        const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
        const data = bytes.subarray(pos + 8, pos + 8 + length);
        chunks.push({ type, data });

        // 次のチャンクへ（長さ4 + 種類4 + データ + CRC4）
        pos += 4 + 4 + length + 4;
    }

    return chunks;
}

// CRC32の計算用の表（最初に1回だけ作っておく）
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

// CRC32を計算する（Pythonの zlib.crc32 と同じ）
function crc32(bytes) {
    let crc = 0xffffffff;
    for (const b of bytes) {
        crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// チャンクを組み立てる：[長さ 4バイト][種類 4バイト][データ][CRC 4バイト]
function makeChunk(type, data) {
    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const view = new DataView(chunk.buffer);

    view.setUint32(0, data.length);
    chunk.set(new TextEncoder().encode(type), 4);
    chunk.set(data, 8);

    // CRCは「種類＋データ」の部分から計算する
    const crc = crc32(chunk.subarray(4, 8 + data.length));
    view.setUint32(8 + data.length, crc);

    return chunk;
}

// 文字列（日本語OK）をBase64にする
function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    return btoa(binary);
}

// tEXt チャンクのキーワード（区切りの0より前の部分）を取り出す
function getTextKeyword(data) {
    const end = data.indexOf(0);
    return String.fromCharCode(...data.subarray(0, end));
}

// 画像にカードのJSONを埋め込んだ、新しいPNGを作る
function embedCard(pngBytes, card) {
    // tEXt の中身：「chara」＋ 区切りの0 ＋ JSONをBase64にしたもの
    const keyword = new TextEncoder().encode("chara");
    const text = new TextEncoder().encode(toBase64(JSON.stringify(card)));
    const textData = new Uint8Array(keyword.length + 1 + text.length);
    textData.set(keyword, 0);
    textData.set(text, keyword.length + 1); // 間の1バイトは 0 のまま（区切り）

    const parts = [pngBytes.subarray(0, 8)]; // シグネチャ
    for (const chunk of readChunks(pngBytes)) {
        // 元から入っているカードのデータは捨てる（古いデータが優先されないように）
        if (chunk.type === "tEXt" && ["chara", "ccv3"].includes(getTextKeyword(chunk.data))) {
            continue;
        }
        // IEND の直前に、新しい tEXt を差し込む
        if (chunk.type === "IEND") {
            parts.push(makeChunk("tEXt", textData));
        }
        parts.push(makeChunk(chunk.type, chunk.data));
    }

    return new Blob(parts, { type: "image/png" });
}

// Base64を、元の文字列（日本語OK）に戻す（toBase64 の逆）
function fromBase64(base64) {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

// PNGに埋め込まれたカードのデータを取り出す（カードでなければ null）
function readCardFromPng(pngBytes) {
    // tEXt チャンクを { キーワード: 中身 } の形に集める
    const texts = {};
    for (const chunk of readChunks(pngBytes)) {
        if (chunk.type === "tEXt") {
            const keyword = getTextKeyword(chunk.data);
            texts[keyword] = new TextDecoder().decode(chunk.data.subarray(keyword.length + 1));
        }
    }

    // ccv3（新しい規格）を優先して、なければ chara を使う
    const base64 = texts["ccv3"] ?? texts["chara"];
    if (base64 === undefined) {
        return null;
    }
    return JSON.parse(fromBase64(base64));
}

// 読み込んだ画像を外して、「画像なし」の状態に戻す
// ※ フォームの中身（importedData）はそのまま残す
function clearImage() {
    imageBytes = null;

    const preview = document.getElementById("preview");
    URL.revokeObjectURL(preview.src); // プレビュー用に作ったURLを片付ける
    preview.removeAttribute("src");
    preview.hidden = true;

    // 選択状態を空にする（これがないと、同じ画像を選び直したときに change が起きない）
    document.getElementById("image").value = "";
    document.getElementById("clear-image").hidden = true;
}

// 画像ファイルを読み込んで、バイト列をとっておく
async function loadImage(file) {
    const buffer = await file.arrayBuffer();
    let bytes = new Uint8Array(buffer);

    // PNGでなければ、PNGに変換する
    if (!isPng(bytes)) {
        // HEIC（iPhoneの写真）は、多くのブラウザが読めないので案内する
        if (/\.(heic|heif)$/.test(file.name.toLowerCase())) {
            alert("HEIC形式（iPhoneの写真）は、このブラウザでは読み込めません。\nJPEGやPNGに変換してから読み込んでください。\n（iPhoneから直接このサイトで写真を選ぶと、自動でJPEGになることが多いです）");
            return;
        }
        if (!file.type.startsWith("image/")) {
            alert("画像ファイルではないようです。PNG、JPEG、WebPなどの画像を読み込んでください。");
            return;
        }
        try {
            bytes = await convertToPng(file);
        } catch (error) {
            console.warn("画像をPNGに変換できませんでした:", error);
            alert("この画像は読み込めませんでした。別の画像を試してみてください。");
            return;
        }
    }

    imageBytes = bytes;

    // カードのデータが入っていたら、フォームに読み込むか聞く
    let card = null;
    try {
        card = readCardFromPng(bytes);
    } catch (error) {
        console.warn("カードのデータを読み取れませんでした:", error);
    }

    if (card !== null && confirm("この画像には、キャラカードのデータが入っています。\nフォームに読み込みますか？（今入力している内容は上書きされます）")) {
        const data = card.data ?? card; // data がない古い形式（V1）にも対応する
        importedData = data;
        fillForm(data);
    }

    // プレビューを表示する
    const preview = document.getElementById("preview");
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
        document.getElementById("clear-image").hidden = false;

    console.log("画像を読み込みました:", file.name, bytes.length, "バイト");
    console.log(readChunks(bytes).map((c) => `${c.type}: ${c.data.length} バイト`));

}

// 「ファイルを選択」ボタンで選んだとき
document.getElementById("image").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
        loadImage(file);
    }
});

// ページにドラッグしているとき（これを止めないと、ドロップできない）
document.addEventListener("dragover", (event) => {
    event.preventDefault();
});

// ページにドロップしたとき
document.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
        loadImage(file);
    }
});

const form = document.getElementById("card-form");

// 「PNGカードを作成」ボタン
form.addEventListener("submit", async (event) => {
    event.preventDefault(); // ※ await より前に書く（後だと、ページが再読み込みされてしまう）

    let pngBytes = imageBytes;

    // 画像がなければ、サンプル画像で作るか聞く
    if (pngBytes === null) {
        if (!confirm("画像が読み込まれていないようです。\nサンプル画像（シルエット）でカードを作成できますが、よろしいですか？")) {
            return;
        }
        pngBytes = await makeSampleImage();
    }

    downloadPng(buildCard(), pngBytes);
});

// 「JSONだけ書き出す」ボタン
document.getElementById("export-json").addEventListener("click", () => {
    downloadJson(buildCard());
});

// 「画像を外す」ボタン
document.getElementById("clear-image").addEventListener("click", clearImage);

