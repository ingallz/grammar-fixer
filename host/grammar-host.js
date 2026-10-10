#!/usr/bin/env node
// Chrome native messaging host: receives {text}, asks `agy -p` to fix grammar, returns {text} or {error}.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AGY = process.env.AGY_BIN || path.join(os.homedir(), '.local/bin/agy');
const MODEL = process.env.AGY_MODEL || 'gemini-3.8-flash-low';
// Empty working dir so the agent has no project files to read or touch.
const WORKDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'grammar-fixer-'));

const PROMPT = `You are an English proofreader for a student's writing.
Fix ONLY: grammar, spelling, punctuation, word form, verb tense agreement, and clearly awkward or broken sentence structure.
Rules:
- Keep the author's ideas, meaning, vocabulary level, tone, and paragraph/line breaks.
- Do NOT add or remove ideas, do NOT rewrite whole sentences that are already correct, do NOT make it sound more advanced.
- Change as few words as possible.
- If the text is already correct, return it unchanged.
- Output ONLY the corrected text. No quotes, no explanations, no markdown.
Text to correct is between <text> tags:
<text>
`;

// --- native messaging framing: 4-byte little-endian length + UTF-8 JSON ---
function send(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

let buf = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  if (buf.length < 4) return;
  const len = buf.readUInt32LE(0);
  if (buf.length < 4 + len) return;
  const msg = JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
  handle(msg);
});

function handle({ text }) {
  if (!text || !text.trim()) return finish({ error: 'Empty text' });
  const args = [
    '-p', PROMPT + text + '\n</text>',
    '--model', MODEL,
    '--output-format', 'json',
    '--disable-slash-commands',
    '--print-timeout', '120s',
  ];
  execFile(AGY, args, { cwd: WORKDIR, maxBuffer: 10 * 1024 * 1024, timeout: 130000 }, (err, stdout, stderr) => {
    if (err && !stdout) return finish({ error: `agy failed: ${(stderr || err.message).slice(0, 300)}` });
    try {
      const out = JSON.parse(stdout);
      if (out.status !== 'SUCCESS' || typeof out.response !== 'string') {
        return finish({ error: `agy status: ${out.status}` });
      }
      finish({ text: cleanup(out.response, text) });
    } catch (e) {
      finish({ error: `Cannot parse agy output: ${stdout.slice(0, 300)}` });
    }
  });
}

// Strip stray tags/fences and keep original leading/trailing whitespace.
function cleanup(response, original) {
  let t = response.replace(/^\s*```[a-z]*\n?|\n?```\s*$/g, '').replace(/<\/?text>/g, '').trim();
  const lead = original.match(/^\s*/)[0];
  const trail = original.match(/\s*$/)[0];
  return lead + t + trail;
}

function finish(obj) {
  send(obj);
  fs.rmSync(WORKDIR, { recursive: true, force: true });
  process.exit(0);
}
