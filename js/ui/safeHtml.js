export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\u0022']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    [String.fromCharCode(34)]: '&quot;',
    [String.fromCharCode(39)]: '&#39;'
  })[character]);
}

export function safeTextList(values, separator = '<br>') {
  return (values || []).map(escapeHtml).join(separator);
}
