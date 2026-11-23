// DOM を作る小さな部品（innerHTML は使わない）。
export function h(tag, cls, content) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (content !== undefined && content !== null) {
    if (Array.isArray(content)) for (const c of content) { if (c) e.append(c); }
    else if (content instanceof Node) e.append(content);
    else e.textContent = String(content);
  }
  return e;
}
export function btn(label, cls, fn) {
  const b = h('button', 'btn ' + (cls || ''), label);
  b.type = 'button';
  if (fn) b.addEventListener('click', fn);
  return b;
}
export const clear = (e) => { while (e.firstChild) e.removeChild(e.firstChild); return e; };
