import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const RECIPIENTS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'recipients.json');
const RESULTS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'results.json');

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

const app = express();

// Fix: Allow Chrome Extension and all origins (needed for chrome-extension:// requests)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors()); // Handle preflight requests

app.use(express.json());

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('ERROR: Set EMAIL_USER and EMAIL_PASS environment variables.');
  console.error('Create a .env file in the project root with:');
  console.error('  EMAIL_USER=your-email@gmail.com');
  console.error('  EMAIL_PASS=your-app-password');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 1,
  rateDelta: 2000,
  rateLimit: 5,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify credentials on startup
transporter.verify((err) => {
  if (err) console.error('❌ Gmail auth failed:', err.message);
  else console.log('✅ Gmail transporter ready');
});

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
      list.push({
        email: item.email,
        name: item.name || '',
        categories: item.categories || [],
        addedAt: new Date().toISOString(),
      });
      added++;
    }
  }

  writeRecipients(list);
  console.log(`[+] Recipients: ${added} new, ${merged} merged. Total: ${list.length}`);
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
        if (r.categories.some(c => cr.re.test(c))) {
          matched.push(r.email);
          break;
        }
      }
    }
    targetEmails = [...new Set(matched)];
  }

  if (!targetEmails?.length) {
    return res.status(400).json({ error: 'No recipients found. Provide emails array or categories to filter.' });
  }

  const labelPrefix = buildSubjectLabel(matchedCategories);
  const finalSubject = labelPrefix + subject;
  const total = targetEmails.length;

  console.log(`\n[${new Date().toISOString()}] Queuing ${total} emails`);
  console.log(`  Subject: ${finalSubject}`);

  // ✅ Immediately respond so extension doesn't timeout
  res.status(202).json({
    status: 'queued',
    sent: total,
    failed: 0,
    message: `${total} email(s) queued for delivery`,
    results: targetEmails.map(e => ({ email: e, status: 'queued' })),
  });

  // Send emails in background after response
  (async () => {
    const results = [];
    for (const email of targetEmails) {
      try {
        console.log(`  Sending to: ${email}...`);
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: finalSubject,
          text: body,
        });
        console.log(`  ✓ Sent to ${email}`);
        results.push({ email, status: 'sent' });
      } catch (err) {
        console.log(`  ✗ Failed ${email}: ${err.message}`);
        results.push({ email, status: 'failed', error: err.message });
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;

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
    console.log(`  ✅ Done: ${sent} sent, ${failed} failed`);
  })();
});

app.get('/results', (req, res) => {
  const history = readResults();
  res.json({ total: history.length, results: history });
});

app.get(['/', '/health'], (req, res) => {
  res.json({
    status: 'running',
    port: process.env.PORT || 3457,
    emailUser: process.env.EMAIL_USER,
    recipientsFile: RECIPIENTS_FILE,
    resultsFile: RESULTS_FILE,
  });
});

const PORT = process.env.PORT || 3457;
app.listen(PORT, () => {
  console.log(`\n✓ Email server running on http://localhost:${PORT}`);
  console.log(`  Test it: curl http://localhost:${PORT}/health`);
  console.log(`  Recipients: ${RECIPIENTS_FILE}`);
  console.log(`  Results: ${RESULTS_FILE}\n`);
});
