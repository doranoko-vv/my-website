console.log("script.js 読み込みOK");

const form = document.getElementById("card-form");


form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = document.getElementById("name").value;
    console.log("名前:", name);
});