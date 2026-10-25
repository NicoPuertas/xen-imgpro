  // ============================================================
  // Attempts viewer: every retry of one frame, with its verdict
  // ============================================================
  // Opened from the 🔍 button / chip on a frame. Shows, per try, a thumbnail,
  // ACCEPTED / REJECTED (or FAILED / UNJUDGED), the 0-10 score, the inspector's
  // defect list, the seed and the time taken, and marks the try that was kept.
  // Live: while a run is still going the cards update as tries finish.

  var INSP_STATUS_LABEL = {
    generating: ['painting…', '#6c757d'],
    judging: ['inspecting…', '#0d6efd'],
    accepted: ['ACCEPTED', '#2bbb00'],
    rejected: ['REJECTED', '#d9534f'],
    failed: ['FAILED', '#6c757d'],
    unjudged: ['UNJUDGED', '#b8860b']
  };

  // Full-size view of one try (its real generated resolution, click the image to fit/unfit), with "Use this image".
  function inspOpenLightbox(ctn, a, run) {
    let old = document.getElementById('insp-lightbox');
    if(old && old.__close) old.__close();
    let lb = document.createElement('div');
    lb.id = 'insp-lightbox';
    lb.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:100000;background:rgba(0,0,0,0.94);display:flex;flex-direction:column;font-family:sans-serif;color:#fff;';
    let bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;flex-wrap:wrap;';
    let title = document.createElement('span');
    title.style.cssText = 'flex:1;font-weight:bold;';
    title.textContent = 'Try ' + a.n + '/' + run.max + (typeof a.score === 'number' ? ' \u00B7 ' + a.score + '/10' : '') + ' \u00B7 seed ' + a.seed;
    bar.appendChild(title);
    let close = function() {
      document.removeEventListener('keydown', onKey, true);
      lb.remove();
    };
    lb.__close = close;
    function onKey(e) { if(e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } }
    document.addEventListener('keydown', onKey, true);
    if(!run.running && !a.selected) {
      let use = makeModalButton('\u2714 Use this image', '#2bbb00');
      use.title = 'Show this try in the frame instead of the current one';
      use.onclick = function() {
        if(window.proInspector && window.proInspector.select(ctn, a.n - 1)) { showToast('Showing try ' + a.n + ' in the frame'); close(); }
      };
      bar.appendChild(use);
    }
    let fitBtn = makeModalButton('Fit to screen', '#555');
    bar.appendChild(fitBtn);
    let closeBtn = makeModalButton('<i class="bi bi-x-lg"></i> Close', '#555');
    closeBtn.onclick = close;
    bar.appendChild(closeBtn);
    lb.appendChild(bar);
    let area = document.createElement('div');
    area.style.cssText = 'flex:1;overflow:auto;display:flex;padding:0.5rem;';
    let img = document.createElement('img');
    img.src = a.dataUrl || a.thumb;
    img.alt = 'Try ' + a.n;
    let fit = false;
    let apply = function() {
      img.style.cssText = fit ? 'margin:auto;max-width:100%;max-height:100%;object-fit:contain;cursor:zoom-in;' : 'margin:auto;max-width:none;cursor:zoom-out;';
      fitBtn.textContent = fit ? 'Actual size' : 'Fit to screen';
    };
    img.onload = function() { title.textContent += ' \u00B7 ' + img.naturalWidth + '\u00D7' + img.naturalHeight + ' px'; };
    img.onclick = fitBtn.onclick = function() { fit = !fit; apply(); };
    apply();
    area.appendChild(img);
    lb.appendChild(area);
    document.body.appendChild(lb);
  }

  function inspCardFor(a, run, ctn) {
    let card = document.createElement('div');
    card.style.cssText = 'width:300px;background:#1b1d21;border:2px solid ' + (a.selected ? '#ffc107' : '#33363c') + ';border-radius:8px;padding:8px;color:#e5e5e5;font-family:sans-serif;font-size:0.8rem;display:flex;flex-direction:column;gap:6px;';
    let src = a.thumb || a.dataUrl;
    if(src) {
      let img = document.createElement('img');
      img.src = src;
      img.alt = 'Try ' + a.n;
      img.title = 'Click to open at full size';
      img.style.cssText = 'width:100%;border-radius:4px;background:#000;display:block;cursor:zoom-in;';
      if(a.dataUrl) img.onclick = () => inspOpenLightbox(ctn, a, run);
      card.appendChild(img);
    } else {
      let ph = document.createElement('div');
      ph.style.cssText = 'width:100%;height:120px;border-radius:4px;background:#111;display:flex;align-items:center;justify-content:center;color:#777;';
      ph.textContent = a.status === 'failed' ? 'no image' : '…';
      card.appendChild(ph);
    }
    let st = INSP_STATUS_LABEL[a.status] || [a.status, '#6c757d'];
    let head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
    let title = document.createElement('b');
    title.textContent = 'Try ' + a.n + '/' + run.max;
    head.appendChild(title);
    let badge = document.createElement('span');
    badge.textContent = st[0];
    badge.style.cssText = 'background:' + st[1] + ';color:#fff;border-radius:4px;padding:0 6px;font-weight:bold;font-size:0.72rem;';
    head.appendChild(badge);
    if(typeof a.score === 'number') {
      let sc = document.createElement('span');
      sc.textContent = a.score + '/10';
      sc.style.cssText = 'margin-left:auto;font-weight:bold;';
      head.appendChild(sc);
    }
    card.appendChild(head);
    if(a.selected) {
      let kept = document.createElement('div');
      kept.textContent = run.autoWinner === a.n - 1 ? '⭐ Kept: this is the image on screen' : '⭐ Shown: picked by you';
      kept.style.cssText = 'color:#ffc107;font-weight:bold;';
      card.appendChild(kept);
    }
    let body = document.createElement('div');
    body.style.cssText = 'opacity:0.85;line-height:1.35;';
    if(a.error) body.textContent = a.error;
    else if(typeof a.score === 'number') body.textContent = 'Defects: ' + (a.defects || 'none visible');
    card.appendChild(body);
    if(typeof a.score === 'number') {
      let tierLabel = ['Hands: no problem found', 'Hands: wrong finger count', 'Hands: malformed'][a.handTier || 0];
      let tierEl = document.createElement('div');
      tierEl.textContent = tierLabel;
      tierEl.style.cssText = 'font-size:0.75rem;color:' + ['#2bbb00', '#e0a800', '#d9534f'][a.handTier || 0] + ';';
      card.appendChild(tierEl);
    }
    if(a.boost) {
      let boostEl = document.createElement('div');
      boostEl.textContent = '\u270D Hand-boost prompt, level ' + a.boost;
      boostEl.title = a.promptUsed || '';
      boostEl.style.cssText = 'font-size:0.72rem;opacity:0.7;';
      card.appendChild(boostEl);
    }
    if(!run.running && a.dataUrl && !a.selected) {
      let use = makeModalButton('\u2714 Use this image', '#2bbb00');
      use.title = 'Show this try in the frame instead of the current one';
      use.style.alignSelf = 'flex-start';
      use.onclick = function() {
        if(window.proInspector && window.proInspector.select(ctn, a.n - 1)) showToast('Showing try ' + a.n + ' in the frame');
      };
      card.appendChild(use);
    }
    let meta = document.createElement('div');
    meta.style.cssText = 'opacity:0.55;font-size:0.72rem;';
    meta.textContent = 'seed ' + a.seed + (a.ms ? ' · ' + Math.round(a.ms / 1000) + 's' : '');
    card.appendChild(meta);
    return card;
  }

  function openInspectorAttempts(ctn) {
    let run = ctn && ctn.__inspRun;
    if(!run) { showToast('No retries were recorded for this image.'); return; }
    let shell = createModalShell('insp-attempts-modal-ctn', '\u{1F50D} Retries — seed ' + run.seed);
    let backdrop = shell.backdrop, header = shell.header, imgCtn = shell.imgCtn;
    let close = function() {
      run.onChange = null;
      let lb = document.getElementById('insp-lightbox');
      if(lb && lb.__close) lb.__close();
      backdrop.remove();
    };
    let closeBtn = makeModalButton('<i class="bi bi-x-lg"></i> Close', '#555');
    closeBtn.onclick = close;
    header.appendChild(closeBtn);
    addModalDismiss(backdrop, close);

    function render() {
      imgCtn.textContent = '';
      let sum = document.createElement('div');
      sum.style.cssText = 'flex-basis:100%;color:#ddd;font-family:sans-serif;font-size:0.85rem;text-align:center;';
      let kept = run.attempts[run.winner];
      let line = run.running
        ? 'Running… ' + run.attempts.length + ' of up to ' + run.max + ' tries so far.'
        : run.attempts.length + ' of up to ' + run.max + ' tries'
          + (run.stoppedEarly ? ' (stopped early: a try was accepted)' : '')
          + (kept ? ' · kept try ' + kept.n : '') + '.';
      sum.textContent = line + ' Accepted means a score of ' + run.accept + '/10 or more with correct hands. When none is accepted, the best hands win: correct > wrong finger count > malformed. Click an image to see it at full size and use it.' + (run.note ? ' ' + run.note : '');
      imgCtn.appendChild(sum);
      let neg = document.createElement('div');
      neg.style.cssText = 'flex-basis:100%;color:#999;font-family:sans-serif;font-size:0.75rem;text-align:center;max-height:3.2em;overflow:hidden;';
      neg.textContent = run.negative ? 'Checked against: ' + run.negative : 'No negative prompt: only the anatomy check applied.';
      imgCtn.appendChild(neg);
      run.attempts.forEach(a => imgCtn.appendChild(inspCardFor(a, run, ctn)));
    }
    render();
    run.onChange = render;
  }
