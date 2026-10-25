  // Shows the generator version (src/VERSION.json) in the footer; clicking it opens src/CHANGELOG.md.
  (function() {
    let slot = document.getElementById('proVersion');
    if(!slot) return;
    function openChangelog(text) {
      let shell = createModalShell('changelog-modal-ctn', '\u{1F4DD} Changelog');
      let close = function() { shell.backdrop.remove(); };
      let closeBtn = makeModalButton('<i class="bi bi-x-lg"></i> Close', '#555');
      closeBtn.onclick = close;
      shell.header.appendChild(closeBtn);
      addModalDismiss(shell.backdrop, close);
      let box = document.createElement('div');
      box.style.cssText = 'max-width:760px;width:100%;color:#ddd;font-family:sans-serif;font-size:0.9rem;line-height:1.45;white-space:pre-wrap;';
      String(text || '').split('\n').forEach(line => {
        let row = document.createElement('div');
        if(/^#{1,3}\s/.test(line)) { row.textContent = line.replace(/^#{1,3}\s+/, ''); row.style.cssText = 'font-weight:bold;color:#fff;margin-top:0.8rem;'; }
        else row.textContent = line;
        box.appendChild(row);
      });
      shell.imgCtn.appendChild(box);
    }
    fetch('src/VERSION.json', {cache: 'no-store'}).then(r => r.ok ? r.json() : Promise.reject(new Error('no VERSION.json'))).then(v => {
      let a = document.createElement('a');
      a.href = '#';
      a.textContent = 'v' + v.version;
      a.title = 'Last edit ' + (v.lastEdit || '?') + ' — click for the changelog';
      a.onclick = function(e) {
        e.preventDefault();
        fetch('src/CHANGELOG.md', {cache: 'no-store'}).then(r => r.ok ? r.text() : Promise.reject(new Error('no CHANGELOG'))).then(openChangelog)
          .catch(() => showToast('Changelog not available.', true));
      };
      slot.textContent = ' · ';
      slot.appendChild(a);
    }).catch(() => {});
  })();
