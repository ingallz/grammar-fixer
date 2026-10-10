// Grabs text from the focused field (or the selected part), sends it for fixing, writes the result back.
// Guard against double registration when the script is injected on demand.
if (!window.__grammarFixerLoaded) {
window.__grammarFixerLoaded = true;
let busy = false;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'grab' || busy || !document.hasFocus()) return;
  const target = captureTarget();
  if (!target || !target.text.trim()) return; // no focused field here (maybe in another frame) or empty
  run(target);
});

// Returns { el, text, restore() } describing what to replace, or null if no editable field is focused.
function captureTarget() {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement; // dive into Shadow DOM
  if (!el) return null;

  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search|)$/.test(el.type))) {
    let start = el.selectionStart, end = el.selectionEnd;
    if (start === end) { start = 0; end = el.value.length; } // no selection -> whole field
    const original = el.value;
    return {
      text: original.slice(start, end),
      unchanged: () => el.value === original,
      restore: () => { el.focus(); el.setSelectionRange(start, end); },
    };
  }

  const root = el.isContentEditable ? el : null;
  if (!root) return null;
  const sel = (root.getRootNode().getSelection?.() || window.getSelection());
  let range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  if (!range || range.collapsed || !root.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(root);
  }
  const original = root.innerText;
  const text = range.toString() === root.textContent ? root.innerText : range.toString();
  return {
    text,
    unchanged: () => root.innerText === original,
    restore: () => { root.focus(); sel.removeAllRanges(); sel.addRange(range); },
  };
}

async function run(target) {
  busy = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'fix', text: target.text });
    if (res?.error) return console.warn('[Grammar Fixer]', res.error);
    if (!target.unchanged()) return console.warn('[Grammar Fixer] text changed while waiting, skipped');
    if (res.text === target.text) return;
    target.restore();
    // execCommand keeps native undo (Cmd+Z) and fires input events for React/Vue editors.
    document.execCommand('insertText', false, res.text);
  } catch (e) {
    console.warn('[Grammar Fixer]', e);
  } finally {
    busy = false;
  }
}
}
