export async function extractFromCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
            const phoneRegex = /(\+?\d[\d\s()-]{8,}\d)/g;
            const urlRegex = /https?:\/\/[^\s]+/g;
            
            const posts = document.querySelectorAll('[data-testid="expandable-text-box"]');
            
            return [...posts].map(post => {
                const text = post.innerText.trim();
                const parent = post.closest('[role="listitem"]');
                const companyNodeText = parent ? parent.querySelector('p span')?.innerText || "" : "";
                
                return {
                    text,
                    companyNodeText,
                    emails: [...new Set(text.match(emailRegex) || [])],
                    phones: [...new Set(text.match(phoneRegex) || [])],
                    links: [...new Set(text.match(urlRegex) || [])]
                };
            });
        }
    });

    return result || [];
}
