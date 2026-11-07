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

const form = document.getElementById("card-form");

form.addEventListener("submit", (event) => {
    event.preventDefault();

    const card = buildCard();
    console.log(JSON.stringify(card, null, 2));
    downloadJson(card);    // ← 追加
});