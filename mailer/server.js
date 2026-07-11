import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const RECIPIENTS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'recipients.json');
const RESULTS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'results.json');

// ─── In-Memory Log Store ───────────────────────────────────────────────────
const LOG_STORE = [];
const MAX_LOGS = 200;

function log(level, msg, data = null) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data ? { data } : {}),
  };
  LOG_STORE.push(entry);
  if (LOG_STORE.length > MAX_LOGS) LOG_STORE.shift();
  const prefix = { INFO: '🔵', OK: '✅', WARN: '⚠️', ERROR: '❌' }[level] || '•';
  console.log(`${prefix} [${entry.ts}] ${msg}`, data ? JSON.stringify(data) : '');
}

// ─── Label Rules ──────────────────────────────────────────────────────────
const LABEL_RULES = [
  { pattern: /unpaid/i, label: '[Unpaid Intern]' },
  { pattern: /paid/i, label: '[Paid Intern]' },
  { pattern: /onsite|on.?site/i, label: '[On-site]' },
  { pattern: /remote/i, label: '[Remote]' },
  { pattern: /hybrid/i, label: '[Hybrid]' },
  { pattern: /full.?time|fulltime/i, label: '[Full-time]' },
];

function matchLabel(category) {
  for (const rule of LABEL_RULES) {
    if (rule.pattern.test(category)) return rule.label;
  }
  return `[${category}]`;
}

function buildSubjectLabel(categories) {
  if (!categories?.length) return '';
  const labels = [...new Set(categories.map(matchLabel))];
  return labels.join(' ') + ' ';
}

function readRecipients() {
  if (!existsSync(RECIPIENTS_FILE)) return [];
  return JSON.parse(readFileSync(RECIPIENTS_FILE, 'utf-8'));
}

function writeRecipients(data) {
  writeFileSync(RECIPIENTS_FILE, JSON.stringify(data, null, 2));
}

function readResults() {
  if (!existsSync(RESULTS_FILE)) return [];
  return JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
}

function writeResults(data) {
  writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2));
}

// ─── Express Setup ────────────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json());

// ─── Email Sender Setup (Dual Mode) ─────────────────────────────────────────
// Railway blocks SMTP → use Resend API. Local → use Gmail SMTP.
const USE_RESEND = !!process.env.RESEND_API_KEY;

let resendClient = null;
let transporter = null;

if (USE_RESEND) {
  resendClient = new Resend(process.env.RESEND_API_KEY);
  log('OK', '📨 Using Resend API (Railway mode)');
} else {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    log('ERROR', 'Missing EMAIL_USER or EMAIL_PASS — set in .env or Railway Variables');
    process.exit(1);
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  transporter.verify((err, success) => {
    if (err) log('ERROR', 'Gmail SMTP verification FAILED', { error: err.message, code: err.code });
    else log('OK', 'Gmail SMTP verified — transporter ready');
  });
  log('OK', '📧 Using Gmail SMTP (local mode)');
}

// ─── Unified Send Function ────────────────────────────────────────────────────
async function sendEmail({ to, subject, text, from }) {
  const fromAddr = from || process.env.EMAIL_USER || 'onboarding@resend.dev';

  if (USE_RESEND) {
    const { data, error } = await resendClient.emails.send({
      from: `Shivam Gupta <${fromAddr}>`,
      to: [to],
      subject,
      text,
    });
    if (error) throw Object.assign(new Error(error.message), { code: error.name });
    return { messageId: data.id, response: 'Resend OK' };
  } else {
    const info = await transporter.sendMail({ from: fromAddr, to, subject, text });
    return { messageId: info.messageId, response: info.response };
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────

// Health check
app.get(['/', '/health'], (req, res) => {
  log('INFO', 'Health check requested');
  res.json({
    status: 'running',
    port: process.env.PORT || 3457,
    emailUser: process.env.EMAIL_USER,
    logCount: LOG_STORE.length,
    recipientsFile: RECIPIENTS_FILE,
    resultsFile: RESULTS_FILE,
  });
});

// ─── NEW: View logs endpoint ───────────────────────────────────────────────
app.get('/logs', (req, res) => {
  const last = parseInt(req.query.last) || 50;
  res.json({
    total: LOG_STORE.length,
    logs: LOG_STORE.slice(-last),
  });
});

// ─── NEW: Synchronous test-email endpoint (shows real error) ──────────────
app.post('/test-email', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Provide { to: "email@example.com" }' });

  log('INFO', `[TEST] Sending test email to ${to} via ${USE_RESEND ? 'Resend' : 'Gmail SMTP'}`);
  try {
    const info = await sendEmail({
      to,
      subject: '✅ Test Email from Railway Server',
      text: `Hello!\n\nYeh test email Railway server se successfully bheja gaya.\nMode: ${USE_RESEND ? 'Resend API' : 'Gmail SMTP'}\n\n- Shivam Gupta\n9305302337`,
    });
    log('OK', `[TEST] Email sent successfully to ${to}`, info);
    return res.json({ success: true, to, mode: USE_RESEND ? 'resend' : 'smtp', ...info });
  } catch (err) {
    log('ERROR', `[TEST] Email send FAILED to ${to}`, { error: err.message, code: err.code });
    return res.status(500).json({
      success: false,
      error: err.message,
      code: err.code,
      mode: USE_RESEND ? 'resend' : 'smtp',
      hint: USE_RESEND
        ? 'Check RESEND_API_KEY in Railway Variables'
        : 'Check EMAIL_USER / EMAIL_PASS. Railway blocks SMTP — add RESEND_API_KEY instead.',
    });
  }
});

// ─── Recipients ───────────────────────────────────────────────────────────
app.get('/recipients', (req, res) => {
  let list = readRecipients();
  const { category } = req.query;
  if (category) {
    const re = new RegExp(category, 'i');
    list = list.filter(r => r.categories.some(c => re.test(c)));
  }
  res.json({ total: list.length, recipients: list });
});

app.post('/recipients', (req, res) => {
  const { recipients } = req.body;
  if (!recipients?.length) {
    return res.status(400).json({ error: 'Missing recipients array' });
  }

  let list = readRecipients();
  let added = 0, merged = 0;
  for (const item of recipients) {
    if (!item.email) continue;
    const emailKey = item.email.toLowerCase();
    const existing = list.find(r => r.email.toLowerCase() === emailKey);
    if (existing) {
      if (item.name && !existing.name) existing.name = item.name;
      const cats = item.categories || [];
      for (const c of cats) {
        if (!existing.categories.includes(c)) existing.categories.push(c);
      }
      merged++;
    } else {
      list.push({ email: item.email, name: item.name || '', categories: item.categories || [], addedAt: new Date().toISOString() });
      added++;
    }
  }

  writeRecipients(list);
  log('INFO', `Recipients updated: +${added} new, ${merged} merged. Total: ${list.length}`);
  res.json({ added, merged, total: list.length });
});

app.delete('/recipients', (req, res) => {
  const { email, category } = req.query;
  let list = readRecipients();
  if (email) {
    list = list.filter(r => r.email !== email);
  } else if (category) {
    const re = new RegExp(category, 'i');
    list = list.filter(r => !r.categories.some(c => re.test(c)));
  } else {
    return res.status(400).json({ error: 'Provide ?email= or ?category=' });
  }
  writeRecipients(list);
  res.json({ total: list.length });
});

app.get('/stats', (req, res) => {
  const list = readRecipients();
  const categoryCount = {};
  for (const r of list) {
    for (const c of r.categories) {
      categoryCount[c] = (categoryCount[c] || 0) + 1;
    }
  }
  res.json({ total: list.length, byCategory: categoryCount });
});

// ─── Send Emails ──────────────────────────────────────────────────────────
app.post(['/send-emails', '/api/send-emails'], async (req, res) => {
  const { emails, categories, subject, body } = req.body;

  if (!subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: subject, body' });
  }

  let targetEmails = emails;
  let matchedCategories = categories;

  if (!targetEmails && categories?.length) {
    const list = readRecipients();
    const reList = categories.map(c => ({ raw: c, re: new RegExp(c, 'i') }));
    const matched = [];
    for (const r of list) {
      for (const cr of reList) {
        if (r.categories.some(c => cr.re.test(c))) { matched.push(r.email); break; }
      }
    }
    targetEmails = [...new Set(matched)];
  }

  if (!targetEmails?.length) {
    log('WARN', 'send-emails called with 0 recipients');
    return res.status(400).json({ error: 'No recipients found. Provide emails array or categories to filter.' });
  }

  const labelPrefix = buildSubjectLabel(matchedCategories);
  const finalSubject = labelPrefix + subject;
  const total = targetEmails.length;

  log('INFO', `Queuing ${total} emails`, { subject: finalSubject, recipients: targetEmails });

  // Respond immediately — don't timeout extension
  res.status(202).json({
    status: 'queued',
    sent: total,
    failed: 0,
    message: `${total} email(s) queued for delivery`,
    results: targetEmails.map(e => ({ email: e, status: 'queued' })),
  });

  // Background send
  (async () => {
    const results = [];
    for (const email of targetEmails) {
      try {
        log('INFO', `Sending to: ${email}`);
        const info = await sendEmail({ to: email, subject: finalSubject, text: body });
        log('OK', `Sent to ${email}`, { messageId: info.messageId });
        results.push({ email, status: 'sent', messageId: info.messageId });
      } catch (err) {
        log('ERROR', `Failed to send to ${email}`, { error: err.message, code: err.code });
        results.push({ email, status: 'failed', error: err.message });
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;
    log('OK', `Batch complete: ${sent} sent, ${failed} failed`);

    const history = readResults();
    history.push({
      timestamp: new Date().toISOString(),
      categories: matchedCategories || null,
      emails: targetEmails,
      subject: finalSubject,
      sent,
      failed,
      results,
    });
    writeResults(history);
  })();
});

app.get('/results', (req, res) => {
  const history = readResults();
  res.json({ total: history.length, results: history });
});

// ─── Start ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3457;
app.listen(PORT, () => {
  log('OK', `Server started on port ${PORT}`);
});
