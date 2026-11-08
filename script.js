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

// CCv2の形に組み立てる
function buildCard() {
    const data = readForm();

    // まだ入力欄がない項目は、空の値を入れておく（CCv2で必須のため）
    data.alternate_greetings = [];
    data.extensions = {};

    return {
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: data,
    };
    
}

// カードをJSONファイルとしてダウンロードさせる
function downloadJson(card) {
    const json = JSON.stringify(card, null, 2);

    // ① JSON文字列を、メモリ上のファイル（Blob）にする
    const blob = new Blob([json], { type: "application/json" });

    // ② そのファイルを指す、一時的なURLを作る
    const url = URL.createObjectURL(blob);

    // ③ ダウンロード用のリンクを作って、クリックしたことにする
    const a = document.createElement("a");
    a.href = url;
    a.download = `${card.data.name || "character"}.json`;
    a.click();

    // ④ 使い終わったURLを片付ける
    URL.revokeObjectURL(url);
}

// 読み込んだ画像のバイト列（まだ読み込んでいなければ null）
let imageBytes = null;

// PNGファイルの最初の8バイト（シグネチャ）
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

// バイト列がPNGかどうかを、シグネチャで確かめる
function isPng(bytes) {
    return PNG_SIGNATURE.every((value, i) => bytes[i] === value);
}

// 画像ファイルを読み込んで、バイト列をとっておく
async function loadImage(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (!isPng(bytes)) {
        alert("PNG画像を選んでください。");
        return;
    }

    imageBytes = bytes;

    // プレビューを表示する
    const preview = document.getElementById("preview");
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;

    console.log("画像を読み込みました:", file.name, bytes.length, "バイト");
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

form.addEventListener("submit", (event) => {
    event.preventDefault();

    const card = buildCard();
    console.log(JSON.stringify(card, null, 2));
    downloadJson(card);    // ← 追加
});