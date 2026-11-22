// ストアの絞り込み（ジャンル・プラットフォーム・検索）。JS が無くても全件が見える。
const bar = document.querySelector('[data-filters]');
const grid = document.querySelector('[data-grid]');
if (bar && grid) {
  bar.hidden = false;
  const cards = [...grid.querySelectorAll('.card')];
  const empty = document.querySelector('[data-empty]');
  const state = { genre: '', kind: '', q: '' };
  const apply = () => {
    let shown = 0;
    for (const c of cards) {
      const ok = (!state.genre || c.dataset.genre === state.genre) && (!state.kind || c.dataset.kind === state.kind) && (!state.q || c.dataset.title.includes(state.q));
      c.hidden = !ok;
      if (ok) shown += 1;
    }
    if (empty) empty.hidden = shown !== 0;
  };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const key = 'genre' in b.dataset ? 'genre' : 'kind';
    state[key] = b.dataset[key];
    for (const o of b.parentElement.querySelectorAll('.chip')) o.classList.toggle('is-on', o === b);
    apply();
  });
  bar.querySelector('.search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); apply(); });
}
