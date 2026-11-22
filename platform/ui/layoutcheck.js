// ?layoutcheck=1 のときだけ、横スクロールの有無を <pre id="layout-result"> に出す（自動テスト用）。
if (/[?&]layoutcheck=1/.test(location.search)) {
  addEventListener('load', () => {
    const d = document.documentElement;
    const pre = document.createElement('pre');
    pre.id = 'layout-result';
    pre.textContent = JSON.stringify({ overflow: d.scrollWidth > innerWidth + 1, scrollWidth: d.scrollWidth, innerWidth });
    document.body.append(pre);
  });
}
