import { createHash, randomUUID } from 'node:crypto';
import { Resend } from 'resend';

const HELP = new Set(['strategy', 'website', 'product', 'development']);
const BUDGET = new Set(['', 'under-20k', '20k-50k', '50k-100k', '100k-200k', '200k-plus']);
const LIMITS = { name: 120, company: 160, email: 254, message: 4000 };

interface ContactRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ContactResponse {
  status(code: number): { json(body: { ok: boolean }): void };
}

function header(headers: ContactRequest['headers'], name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'becomes.co' ||
      hostname === 'www.becomes.co' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.vercel.app')
    );
  } catch {
    return false;
  }
}

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async function handler(req: ContactRequest, res: ContactResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }

  if (!originAllowed(header(req.headers, 'origin'))) {
    res.status(403).json({ ok: false });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  if (clip(body.website, 200)) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = clip(body.name, LIMITS.name);
  const company = clip(body.company, LIMITS.company);
  const email = clip(body.email, LIMITS.email);
  const message = clip(body.message, LIMITS.message);
  const helpRaw = Array.isArray(body.help) ? body.help : body.help == null ? [] : [body.help];
  const help = helpRaw.map(String).filter((item) => HELP.has(item));
  const budget = typeof body.budget === 'string' && BUDGET.has(body.budget) ? body.budget : '';

  if (!name || !emailOk(email) || !message) {
    res.status(400).json({ ok: false });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({ ok: false });
    return;
  }

  const to = process.env.CONTACT_TO ?? 'inquiry@becomes.co';
  const from = process.env.CONTACT_FROM ?? 'Becomes <forms@send.becomes.co>';
  const helpLine = help.length ? help.join(', ') : '—';
  const budgetLine = budget || '—';
  const companyLine = company || '—';
  const idempotencyKey = `contact/${createHash('sha256').update(`${email}\n${name}\n${message}`).digest('hex').slice(0, 32)}`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from,
      to: [to],
      replyTo: email,
      subject: `Brief from ${name}`,
      text: `${message}\n\nHelp: ${helpLine}\nBudget: ${budgetLine}\n${name} <${email}>\n${companyLine}`,
      html: `<p>${escapeHtml(message).replace(/\n/g, '<br />')}</p><p>Help: ${escapeHtml(helpLine)}<br />Budget: ${escapeHtml(budgetLine)}<br />${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;<br />${escapeHtml(companyLine)}</p>`,
      headers: { 'X-Entity-Ref-ID': randomUUID() },
    },
    { idempotencyKey },
  );

  if (error) {
    res.status(502).json({ ok: false });
    return;
  }

  res.status(200).json({ ok: true });
}
