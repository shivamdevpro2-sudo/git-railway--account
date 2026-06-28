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

async function init() {
    await storage.cleanup();
    state.jobs = await storage.loadJobs();
    state.settings = await storage.loadSettings();
    state.filtered = [...state.jobs];
    
    bindEvents();
    render();
}

function bindEvents() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.filtered = searchJobs(state.jobs, e.target.value);
        state.page = 1;
        state.selected.clear();
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
    document.getElementById('modalPost').innerText = job.post;
    document.getElementById('viewModal').classList.remove('hidden');
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
            <td>${job.emails.join(', ')}</td>
            <td>${job.phones.join(', ')}</td>
            <td>${job.tags.map(t => `<span class="tag">${t}</span>`).join('')}</td>
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
