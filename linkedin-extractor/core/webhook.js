export async function sendToN8n(jobs, webhookUrl) {
    if (!webhookUrl || (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://'))) {
        throw new Error('Invalid Webhook URL');
    }

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(jobs)
    });

    if (!response.ok) {
        throw new Error(`Webhook failed with status: ${response.status}`);
    }

    return response;
}
