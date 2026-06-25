const button = document.getElementById("extractBtn");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
    button.disabled = true;
    status.innerText = "Starting extraction...";

    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    chrome.tabs.sendMessage(tab.id, { action: "extract" });
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.status) {
        status.innerText = message.status;
    }
    if (message.complete) {
        button.disabled = false;
    }
});
