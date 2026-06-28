import { Pipeline } from '../core/pipeline.js';
import { extractFromCurrentTab } from '../core/extractor.js';
import { normalize } from '../core/normalize.js';
import { validate } from '../core/validate.js';
import { detectCompany } from '../core/companyDetector.js';
import { detectRole } from '../core/roleDetector.js';
import { generateTags } from '../core/tagGenerator.js';
import { deduplicate } from '../core/deduplicator.js';
import { cleanup } from '../core/cleanup.js';
import { storage } from '../core/storage.js';

const extractBtn = document.getElementById("extractBtn");
const dashboardBtn = document.getElementById("dashboardBtn");
const statusDiv = document.getElementById("status");

const pipeline = new Pipeline()
    .use(normalize)
    .use(validate)
    .use(detectCompany)
    .use(detectRole)
    .use(generateTags)
    .use(deduplicate)
    .use(cleanup);

extractBtn.onclick = async () => {
    try {
        extractBtn.disabled = true;
        statusDiv.innerText = "Extracting...";
        
        const rawPosts = await extractFromCurrentTab();
        statusDiv.innerText = `Found ${rawPosts.length} posts. Processing...`;
        
        const settings = await storage.loadSettings();
        
        // Execute pipeline
        const finalJobs = await pipeline.execute(rawPosts, { settings });
        
        // Save via storage
        await storage.saveJobs(finalJobs);
        
        statusDiv.innerText = "Saved successfully!";
        
        // Open dashboard
        chrome.tabs.create({ url: 'dashboard/dashboard.html' });
    } catch (e) {
        statusDiv.innerText = "Error: " + e.message;
        statusDiv.style.color = "#f87171";
    } finally {
        extractBtn.disabled = false;
    }
};

dashboardBtn.onclick = () => {
    chrome.tabs.create({ url: 'dashboard/dashboard.html' });
};
