// Bridges the keyboard shortcut and content script to the local native host (agy -p).
const HOST = 'com.ingall.grammar_fixer';

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fix-grammar') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'grab' });
  } catch {
    // Tab was open before the extension was installed: inject the content script now, then retry.
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] });
    chrome.tabs.sendMessage(tab.id, { type: 'grab' }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'fix') return false;
  chrome.runtime.sendNativeMessage(HOST, { text: msg.text }, (res) => {
    if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
    else sendResponse(res || { error: 'No response from host' });
  });
  return true; // async response
});
