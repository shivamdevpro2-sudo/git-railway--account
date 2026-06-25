chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== "extract") return;

    (async () => {
        try {
            // Send status update to popup
            chrome.runtime.sendMessage({ status: "Scrolling to load all posts..." });

            // Auto-scroll logic
            let previousHeight = 0;
            let currentHeight = document.body.scrollHeight;
            
            while (previousHeight !== currentHeight) {
                window.scrollTo(0, document.body.scrollHeight);
                await new Promise(r => setTimeout(r, 2000));
                previousHeight = currentHeight;
                currentHeight = document.body.scrollHeight;
            }

            chrome.runtime.sendMessage({ status: "Expanding posts..." });

            // Expand every "...more"
            document
                .querySelectorAll('[data-testid="expandable-text-button"]')
                .forEach(btn => btn.click());

            await new Promise(r => setTimeout(r, 1500));

            chrome.runtime.sendMessage({ status: "Extracting data..." });

            const posts = document.querySelectorAll('[data-testid="expandable-text-box"]');

            const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
            const phoneRegex = /(\+?\d[\d\s()-]{8,}\d)/g;
            const urlRegex = /(https?:\/\/[^\s]+)/g;

            const result = [];
            const seenHashes = new Set();

            posts.forEach(post => {
                const text = post.innerText;

                const company = post.closest('[role="listitem"]')
                        ?.querySelector('p span')
                        ?.innerText || "Unknown";

                // Hash: company + first 100 chars
                const hash = (company + text.substring(0, 100)).trim();

                if (!seenHashes.has(hash)) {
                    seenHashes.add(hash);
                    
                    result.push({
                        company,
                        post: text,
                        emails: [...new Set(text.match(emailRegex) || [])],
                        phones: [...new Set(text.match(phoneRegex) || [])],
                        urls: [...new Set(text.match(urlRegex) || [])]
                    });
                }
            });

            chrome.runtime.sendMessage({ status: `Sending ${result.length} unique posts to n8n...` });

            // POST to n8n Webhook
            const webhookUrl = "http://localhost:5678/webhook/linkedin";
            const response = await fetch(webhookUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(result)
            });

            if (response.ok) {
                chrome.runtime.sendMessage({ status: "Successfully sent to n8n workflow!", complete: true });
            } else {
                chrome.runtime.sendMessage({ status: `Failed to send to n8n. Status: ${response.status}`, complete: true });
            }

        } catch (error) {
            chrome.runtime.sendMessage({ status: `Error: ${error.message}`, complete: true });
        }
    })();

    return true;
});
