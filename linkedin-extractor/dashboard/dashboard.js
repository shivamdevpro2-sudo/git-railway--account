import { storage } from '../core/storage.js';
import { searchJobs } from '../utils/search.js';
import { exporter } from '../core/exporter.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { showToast } from '../utils/toast.js';
import { sendToN8n } from '../core/webhook.js';

const state = {
    jobs: [],
    filtered: [],
    selected: new Set(),
    page: 1,
    pageSize: 20,
    settings: {},
    stats: {}
};

function mergeDuplicates(jobs) {
    const seen = new Map();
    const merged = [];
    let removed = 0;

    for (const job of jobs) {
        const key = `${(job.company || '').toLowerCase().trim()}|${(job.role || '').toLowerCase().trim()}`;
        if (seen.has(key)) {
            const existing = seen.get(key);
            existing.emails = [...new Set([...(existing.emails || []), ...(job.emails || [])])];
            existing.phones = [...new Set([...(existing.phones || []), ...(job.phones || [])])];
            existing.links = [...new Set([...(existing.links || []), ...(job.links || [])])];
            existing.tags = [...new Set([...(existing.tags || []), ...(job.tags || [])])];
            if (job.payout && (!existing.payout || extractPayoutNumber(job.payout) > extractPayoutNumber(existing.payout))) {
                existing.payout = job.payout;
            }
            if (job.notes && !existing.notes) existing.notes = job.notes;
            removed++;
        } else {
            seen.set(key, job);
            merged.push(job);
        }
    }
    return { merged, removed };
}

async function init() {
    try {
        await storage.cleanup();
        state.jobs = await storage.loadJobs();

        const { merged, removed } = mergeDuplicates(state.jobs);
        if (removed > 0) {
            state.jobs = merged;
            await storage.saveJobs(state.jobs);
            console.log(`[Dedup] Merged ${removed} duplicate(s)`);
        }

        state.settings = await storage.loadSettings();
        state.filtered = [...state.jobs];
        
        sortJobs('payout');
        
        bindEvents();
        render();
    } catch (e) {
        console.error('Init error:', e);
        document.body.innerHTML = `<div style="padding:20px;color:#f87171;"><h2>Error</h2><pre>${e.message}\n${e.stack}</pre></div>`;
    }
}

function sortJobs(mode) {
    const sortFn = {
        newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        payout: (a, b) => extractPayoutNumber(b.payout) - extractPayoutNumber(a.payout),
        company: (a, b) => (a.company || '').localeCompare(b.company || '')
    }[mode] || ((a, b) => 0);
    
    state.filtered.sort(sortFn);
}

function bindEvents() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.filtered = searchJobs(state.jobs, e.target.value);
        sortJobs(document.getElementById('sortSelect').value);
        state.page = 1;
        state.selected.clear();
        render();
    });

    document.getElementById('sortSelect').addEventListener('change', (e) => {
        sortJobs(e.target.value);
        state.page = 1;
        render();
    });

    document.getElementById('selectAll').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            if (e.target.checked) state.selected.add(cb.value);
            else state.selected.delete(cb.value);
        });
    });

    document.getElementById('btnExportAll').addEventListener('click', () => {
        exporter.downloadCSV(state.jobs);
        showToast('Exported All as CSV');
    });

    document.getElementById('btnExportSelected').addEventListener('click', () => {
        const selectedJobs = state.filtered.filter(j => state.selected.has(j.id));
        if(selectedJobs.length === 0) return showToast('No jobs selected', 'error');
        exporter.downloadExcel(selectedJobs);
        showToast('Exported Selected as Excel');
    });

    document.getElementById('btnCopyEmails').addEventListener('click', async () => {
        const selectedJobs = state.filtered.filter(j => state.selected.has(j.id));
        const emails = selectedJobs.flatMap(j => j.emails);
        if(emails.length === 0) return showToast('No emails found in selection', 'error');
        await copyToClipboard(emails.join(', '));
        showToast('Copied emails to clipboard');
    });

    document.getElementById('btnSendN8n').addEventListener('click', async () => {
        const selectedJobs = state.filtered.filter(j => state.selected.has(j.id));
        if(selectedJobs.length === 0) return showToast('No jobs selected', 'error');
        if(!state.settings.webhook) return showToast('Webhook URL not configured in Settings', 'error');
        try {
            await sendToN8n(selectedJobs, state.settings.webhook);
            showToast('Sent to n8n successfully');
        } catch(e) {
            showToast(e.message, 'error');
        }
    });

    document.getElementById('btnSettings').addEventListener('click', () => {
        document.getElementById('settingsWebhook').value = state.settings.webhook || '';
        document.getElementById('settingsEmailUrl').value = state.settings.emailServerUrl || 'https://git-railway-account-production.up.railway.app';
        document.getElementById('settingsModal').classList.remove('hidden');
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.add('hidden');
    });

    document.getElementById('btnSaveSettings').addEventListener('click', async () => {
        state.settings.webhook = document.getElementById('settingsWebhook').value.trim();
        state.settings.emailServerUrl = document.getElementById('settingsEmailUrl').value.trim();
        await storage.saveSettings(state.settings);
        document.getElementById('settingsModal').classList.add('hidden');
        showToast('Settings saved');
    });

    document.getElementById('btnMergeDuplicates').addEventListener('click', async () => {
        const { merged, removed } = mergeDuplicates(state.jobs);
        if (removed === 0) return showToast('No duplicates found');
        state.jobs = merged;
        state.filtered = [...state.jobs];
        await storage.saveJobs(state.jobs);
        render();
        showToast(`Merged ${removed} duplicate(s) into ${merged.length} entries`);
    });

    document.getElementById('btnSendEmail').addEventListener('click', () => {
        console.log('Send Email clicked, jobs:', state.jobs.length);
        const allEmails = [...new Set(state.jobs.flatMap(j => j.emails || []))];
        if (!allEmails.length) return showToast('No emails found in any job', 'error');
        document.getElementById('emailCount').textContent = `Sending to ${allEmails.length} recipient(s)`;
        document.getElementById('emailSubject').value = '';
        document.getElementById('emailBody').value = '';
        document.getElementById('emailProgress').textContent = '';
        document.getElementById('sendEmailModal').classList.remove('hidden');
    });

    // ⚡ Auto-Fill Internship Application
    document.getElementById('btnAutoFill').addEventListener('click', () => {
        document.getElementById('emailSubject').value = '🚀 Internship Application — 2 Years Paid Experience | Backend, Server & Cost Optimization';

        document.getElementById('emailBody').value = `Hello Hiring Team,

I hope this message finds you well.

My name is Shivam Gupta, and I'm reaching out to express my strong interest in an internship opportunity with your organization.

Over the past 2 years, I have worked as a paid intern across multiple product-based companies, gaining hands-on, real-world experience in:

✅ Backend System Optimization — Improved API response times and database performance
✅ Deployment Cost Cutting — Reduced cloud infrastructure costs significantly
✅ Server Management — Managed Linux servers, CI/CD pipelines, and uptime monitoring
✅ Management System Development — Built scalable admin & operations tools end-to-end


🏢 Medzillo        → https://medzillo.in
   Backend dev, server management & deployment optimization

🏢 SMC             → System design & backend optimization
🏢 Curozip         → Full-stack backend engineering
🏢 NF3             → Infrastructure management & cost reduction

━━━━━━━━━━━━━━━━━━━━━━━━
  MY WORK
━━━━━━━━━━━━━━━━━━━━━━━━

🌐 Portfolio  →  https://port-folio-9ob2.onrender.com
💻 GitHub     →  https://github.com/shivam543210
🔗 LinkedIn   →  https://www.linkedin.com/in/shivam-gupta-bb1767304/
📄 Resume   https://drive.google.com/file/d/1fQIY4hAmjvNPYYL0aMkMVBF2FngFNVH2/view?usp=sharing



I bring practical experience, not just theory — having already contributed to real products used by real users. I am a fast learner, proactive problem-solver, and highly motivated to make an impact from day one.

I would love the opportunity to discuss how I can contribute to your team.

Looking forward to hearing from you!

Warm regards,
Shivam Gupta
9305302337
📧 shivam.dev.pro.2@gmail.com
🔗 linkedin.com/in/shivam-gupta-bb1767304`;

        showToast('✅ Auto-filled! Review and send.');
    });

    // 💻 Auto-Fill Full Stack Developer Application
    document.getElementById('btnAutoFillFullStack').addEventListener('click', () => {
        document.getElementById('emailSubject').value = '💻 Full Stack Developer Application — 2 Years Paid Experience | React, Node.js & Backend Systems';

        document.getElementById('emailBody').value = `Hello Hiring Team,

I hope this message finds you well.

My name is Shivam Gupta, and I'm reaching out to express my strong interest in a Full Stack Developer opportunity with your organization.

Over the past 2 years, I have worked as a paid intern across multiple product-based companies, building and shipping real-world full stack applications from scratch:

✅ Frontend Development — Built responsive UIs using React.js & modern JavaScript
✅ Backend Engineering — Developed REST APIs, optimized databases, handled server-side logic
✅ Deployment & DevOps — Managed CI/CD pipelines, cloud deployments, and server infrastructure
✅ Cost Optimization — Reduced cloud/deployment costs significantly across projects
✅ End-to-End Ownership — Delivered complete features independently, from design to production


🏢 Medzillo        → https://medzillo.in
   Full stack development, backend APIs & server management

🏢 SMC             → System architecture & backend optimization
🏢 Curozip         → Full-stack product engineering
🏢 NF3             → Infrastructure, deployment & cost reduction

━━━━━━━━━━━━━━━━━━━━━━━━
  MY WORK
━━━━━━━━━━━━━━━━━━━━━━━━

🌐 Portfolio  →  https://port-folio-9ob2.onrender.com
💻 GitHub     →  https://github.com/shivam543210
🔗 LinkedIn   →  https://www.linkedin.com/in/shivam-gupta-bb1767304/
📄 Resume     →  https://drive.google.com/file/d/1fQIY4hAmjvNPYYL0aMkMVBF2FngFNVH2/view?usp=sharing



I bring practical, shipped experience — not just theory. I have worked on real products used by real users, and I'm highly motivated to contribute to your team from day one.

Looking forward to hearing from you!

Warm regards,
Shivam Gupta
9305302337
📧 shivam.dev.pro.2@gmail.com
🔗 linkedin.com/in/shivam-gupta-bb1767304`;

        showToast('✅ Full Stack template filled! Review and send.');
    });


    document.getElementById('closeSendEmail').addEventListener('click', () => {
        document.getElementById('sendEmailModal').classList.add('hidden');
    });

    document.getElementById('btnSendEmailsSubmit').addEventListener('click', async () => {
        const allEmails = [...new Set(state.jobs.flatMap(j => j.emails))];
        const subject = document.getElementById('emailSubject').value.trim();
        const body = document.getElementById('emailBody').value.trim();
        if (!subject || !body) return showToast('Subject and body are required', 'error');

        const progress = document.getElementById('emailProgress');
        progress.textContent = 'Sending...';

        const serverUrl = state.settings.emailServerUrl || 'https://git-railway-account-production.up.railway.app';
        try {
            const res = await fetch(`${serverUrl}/send-emails`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails: allEmails, subject, body }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            progress.textContent = `Done: ${data.sent} sent, ${data.failed} failed`;
            showToast(`Sent to ${data.sent} recipient(s)`);
        } catch (e) {
            progress.textContent = `Error: ${e.message}`;
            showToast(e.message, 'error');
        }
    });

    document.getElementById('btnPrev').addEventListener('click', () => {
        if (state.page > 1) { state.page--; render(); }
    });

    document.getElementById('btnNext').addEventListener('click', () => {
        const maxPage = Math.ceil(state.filtered.length / state.pageSize);
        if (state.page < maxPage) { state.page++; render(); }
    });

    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('viewModal').classList.add('hidden');
    });

    document.getElementById('btnOpenPost').addEventListener('click', () => {
        const url = document.getElementById('btnOpenPost').dataset.url;
        if (url) chrome.tabs.create({ url });
    });

    // Delegated events for dynamic table rows
    document.getElementById('tableBody').addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-view')) {
            const id = e.target.dataset.id;
            const job = state.jobs.find(j => j.id === id);
            if (job) showModal(job);
        }
    });

    document.getElementById('tableBody').addEventListener('change', async (e) => {
        if (e.target.classList.contains('row-checkbox')) {
            if (e.target.checked) state.selected.add(e.target.value);
            else state.selected.delete(e.target.value);
        } else if (e.target.classList.contains('select-status')) {
            const id = e.target.dataset.id;
            const job = state.jobs.find(j => j.id === id);
            if (job) {
                job.status = e.target.value;
                await storage.saveJobs(state.jobs);
            }
        }
    });
}

function showModal(job) {
    document.getElementById('modalCompany').innerText = job.company;
    document.getElementById('modalRole').innerText = job.role;
    document.getElementById('modalPost').innerText = job.post || 'No content found.';

    const meta = [];
    if (job.payout) meta.push(`<strong>Payout:</strong> ${job.payout}`);
    if (job.location) meta.push(`<strong>Location:</strong> ${job.location}`);
    if (job.experience) meta.push(`<strong>Experience:</strong> ${job.experience}`);
    if (job.postingTime || job.postedAt) meta.push(`<strong>Posted:</strong> ${job.postingTime || job.postedAt}`);
    document.getElementById('modalMeta').innerHTML = meta.join(' &bull; ');

    const links = [];
    if (job.postUrl) links.push(`<a href="${job.postUrl}" target="_blank">View LinkedIn Post</a>`);
    if (job.applyLink) links.push(`<a href="${job.applyLink}" target="_blank">Apply Here</a>`);
    if (job.links && job.links.length) {
        job.links.forEach(l => {
            if (l !== job.postUrl && l !== job.applyLink) {
                links.push(`<a href="${l}" target="_blank">${l.length > 50 ? l.substring(0, 50) + '...' : l}</a>`);
            }
        });
    }
    document.getElementById('modalLinks').innerHTML = links.length ? links.join(' | ') : '';

    const openBtn = document.getElementById('btnOpenPost');
    const postUrl = job.postUrl || job.applyLink || (job.links && job.links[0]) || '';
    if (postUrl) {
        openBtn.style.display = 'inline-block';
        openBtn.dataset.url = postUrl;
        openBtn.innerText = postUrl === job.postUrl ? 'Open LinkedIn Post' : 'Open Link';
    } else {
        openBtn.style.display = 'none';
    }

    document.getElementById('viewModal').classList.remove('hidden');
}

function extractPayoutNumber(payoutStr) {
    if (!payoutStr) return 0;
    let numStr = payoutStr.replace(/[^0-9.]/g, '');
    let num = parseFloat(numStr) || 0;
    let lowerStr = payoutStr.toLowerCase();
    if (lowerStr.includes('lpa') || lowerStr.includes('lakh')) num *= 100000;
    if (lowerStr.includes('cr') || lowerStr.includes('crore')) num *= 10000000;
    if (lowerStr.includes('k')) num *= 1000;
    if (lowerStr.includes('m') && !lowerStr.includes('mo')) num *= 1000000;
    return num;
}

function render() {
    renderMetrics();
    renderTable();
    renderPagination();
}

function renderMetrics() {
    const total = state.jobs.length;
    const emails = state.jobs.reduce((sum, j) => sum + j.emails.length, 0);
    const phones = state.jobs.reduce((sum, j) => sum + j.phones.length, 0);
    const remote = state.jobs.filter(j => j.tags.includes('Remote')).length;

    document.getElementById('metricsCards').innerHTML = `
        <div class="metric-card"><h3>Posts</h3><p>${total}</p></div>
        <div class="metric-card"><h3>Emails</h3><p>${emails}</p></div>
        <div class="metric-card"><h3>Phones</h3><p>${phones}</p></div>
        <div class="metric-card"><h3>Remote</h3><p>${remote}</p></div>
    `;
}

function renderTable() {
    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;
    const paginated = state.filtered.slice(start, end);

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = paginated.map(job => `
        <tr>
            <td><input type="checkbox" class="row-checkbox" value="${job.id}" ${state.selected.has(job.id) ? 'checked' : ''}></td>
            <td>${job.company}</td>
            <td>${job.role}</td>
            <td>${job.emails ? job.emails.join(', ') : ''}</td>
            <td>${job.phones ? job.phones.join(', ') : ''}</td>
            <td>${job.links ? job.links.map(l => `<a href="${l}" target="_blank" title="${l}">Apply</a>`).join(' ') : ''}</td>
            <td>${job.payout || ''}</td>
            <td>${job.postingTime || job.postedAt || ''}</td>
            <td>${job.tags ? job.tags.map(t => `<span class="tag">${t}</span>`).join('') : ''}</td>
            <td>
                <select class="select-status" data-id="${job.id}">
                    <option value="New" ${job.status==='New'?'selected':''}>New</option>
                    <option value="Applied" ${job.status==='Applied'?'selected':''}>Applied</option>
                    <option value="Exported" ${job.status==='Exported'?'selected':''}>Exported</option>
                </select>
            </td>
            <td><input type="text" value="${job.notes || ''}" placeholder="Add notes..." disabled></td>
            <td><button class="btn-view" data-id="${job.id}">View</button></td>
        </tr>
    `).join('');
}

function renderPagination() {
    const maxPage = Math.ceil(state.filtered.length / state.pageSize) || 1;
    document.getElementById('pageInfo').innerText = `Page ${state.page} of ${maxPage}`;
    document.getElementById('btnPrev').disabled = state.page === 1;
    document.getElementById('btnNext').disabled = state.page === maxPage;
}

init();
