  // ============================================================
  // AI image inspector: best-of-N retries per frame (same seed)
  // ============================================================
  // The "Retries" dropdown (userInputs.passes, 1-10, default 1) turns on a
  // per-frame loop. Try 1 is the framework's own generation; when it posts
  // `finished` we capture its seed, score it with a vision model
  // (root.aiTextPlugin, imported in model.txt) and, while the score stays
  // under INSP_ACCEPT_SCORE, regenerate with the SAME seed in a hidden embed
  // iframe (same protocol as makeEmbed) up to N tries. The best try stays on
  // screen; the others are reduced to small thumbnails kept in memory on the
  // frame (ctn.__inspRun) so the attempts viewer (attempts-modal.js) can show
  // what was accepted / rejected and why. Retries = 1 never touches a frame.

  var INSP_MAX = 10;
  var INSP_ACCEPT_SCORE = 8;
  var INSP_GEN_TIMEOUT_MS = 150000;
  var INSP_JUDGE_TIMEOUT_MS = 90000;
  var INSP_THUMB_PX = 320;

  function inspTimeout(promise, ms, message) {
    let timer = null;
    let gate = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message || 'Timed out.')), ms);
    });
    return Promise.race([Promise.resolve(promise), gate]).then(
      (v) => { clearTimeout(timer); return v; },
      (e) => { clearTimeout(timer); throw e; }
    );
  }

  function inspReadPasses() {
    let v = null;
    try {
      let el = getUserInputEl('passes');
      if(el && el.value != null && el.value !== '') v = el.value;
    } catch(e) {}
    if(v == null && window.input && window.input.passes != null) v = window.input.passes;
    let n = parseInt(String(v == null ? '1' : v), 10);
    if(!isFinite(n) || n < 1) return 1;
    return Math.min(INSP_MAX, n);
  }

  // Progress fraction 0..1: each try owns a 1/max slice (generation opens
  // it, inspection moves it on, the verdict closes it).
  function inspFrac(n, max, phase) {
    let part = phase === 'done' ? 1 : (phase === 'judge' ? 0.6 : 0.1);
    return Math.min(1, ((n - 1) + part) / Math.max(1, max));
  }

  // Second opinion, run only on a try that would be accepted: a hands-only specialist prompt.
  // Returns a problem string, or '' (also '' if the check itself fails: the main verdict stands).
  async function inspHandsCheck(dataUrl) {
    try {
      if(typeof root === 'undefined' || !root.aiTextPlugin) return '';
      let blob = await (await fetch(dataUrl)).blob();
      let instruction = 'You inspect AI-painted images for ONE thing: hands. Look at every visible hand. For each, count the digits one by one (four fingers plus the thumb = 5) and check that none is fused, merged, doubled, bent the wrong way, twisted, blob-like, or the wrong length. Hands cut off by the frame edge or fully hidden are NOT problems.\n'
        + 'Reply in exactly this format:\nHANDS: <for each visible hand: "left/right hand: N digits, normal" or the problem; or "none visible">\nVERDICT: <OK if every visible hand is normal or no hand is visible, otherwise BAD>';
      let res = await inspTimeout(root.aiTextPlugin({ instruction: [instruction, blob], startWith: 'HANDS:' }), INSP_JUDGE_TIMEOUT_MS, 'Hands check timed out.');
      let text = String(res && res.text != null ? res.text : res);
      let handsLine = (text.match(/^\s*([^\n]*)/) || [, ''])[1];
      let problem = inspHandsProblem(handsLine);
      if(problem) return problem;
      if(/VERDICT:\s*BAD/i.test(text)) return 'hands check: ' + (handsLine.trim().slice(0, 120) || 'BAD');
      return '';
    } catch(e) {
      console.error('hands check:', e);
      return '';
    }
  }

  // True when the judge listed no defects ("none visible", "none", empty).
  function inspIsClean(defects) {
    let d = String(defects == null ? '' : defects).trim().toLowerCase().replace(/[."']/g, '');
    return d === '' || /^(none|no defects?|nothing)( visible| found| detected)?$/.test(d);
  }

  // Ordering of tries. Hand severity comes first (0 correct > 1 wrong finger count only > 2 malformed:
  // fused / blobby / sausage-like / distorted), then the score, then a defect-free verdict.
  function inspRank(a) {
    return (2 - (a.handTier || 0)) * 100 + a.score * 2 + (a.clean ? 1 : 0);
  }

  function inspThumb(dataUrl) {
    return new Promise((resolve) => {
      let img = new Image();
      img.onload = () => {
        try {
          let scale = Math.min(1, INSP_THUMB_PX / Math.max(img.width, img.height));
          let c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.8));
        } catch(e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Wrong NUMBER of fingers (tier 1) vs wrong SHAPE of fingers (tier 2).
  var INSP_COUNT_WORDS = 'extra|additional|duplicate|six|seven|eight|missing|too many|too few|fewer';
  var INSP_SHAPE_WORDS = 'fused|merged|webbed|malformed|deformed|distorted|mangled|twisted|blob|blobby|blob-like|claw|stump|stubby|swollen|sausage|sausage-like|melted|unnatural|impossible|asymmetric|too long|too short|wrong|bent|not clearly separated';
  var INSP_BAD_WORDS = '(' + INSP_COUNT_WORDS + '|' + INSP_SHAPE_WORDS + '|abnormal|not normal)';

  // Severity of the hand problems described in some text: 0 none, 1 only the finger count is wrong,
  // 2 malformed hands. Only the clauses that talk about hands/fingers count.
  function inspHandTier() {
    let text = Array.prototype.slice.call(arguments).join(';');
    let tier = 0;
    for(let clause of text.split(/[;\n]/)) {
      let ctx = false; // inside a hand description: "left hand: 6 digits, merged/blob-like"
      for(let item of clause.split(',')) {
        if(/hand|finger|digit|thumb|knuckle|palm/i.test(item)) ctx = true;
        else if(/face|eye|nose|mouth|ear|neck|leg|foot|feet|torso|body|hair|shoulder|\barm|background|dress|cloth/i.test(item)) ctx = false;
        if(!ctx) continue;
        let t = item.replace(new RegExp('\\b(no|not|without|zero|never)\\s+(\\w+\\s+)?' + INSP_BAD_WORDS + '\\b', 'gi'), '');
        if(new RegExp('\\b(' + INSP_SHAPE_WORDS + ')\\b', 'i').test(t)) return 2;
        let re = /(\d+)\s*(?:visible\s*)?(?:digits?|fingers?)(?![^.;,]{0,14}thumb)/gi, m;
        while((m = re.exec(t))) { if(parseInt(m[1], 10) !== 5) tier = Math.max(tier, 1); }
        if(new RegExp('\\b(' + INSP_COUNT_WORDS + '|abnormal|not normal)\\b', 'i').test(t)) tier = Math.max(tier, 1);
      }
    }
    return tier;
  }

  // Hand-boost prompt wording for retries, escalating with the number of earlier tries whose hands failed.
  // Kept gentle on purpose (weights <= 1.2, a few words): the same seed is reused, and a heavy prompt change
  // would repaint the whole picture instead of fixing the hands.
  var INSP_HAND_BOOST = [
    null,
    { pos: 'detailed hands, five fingers on each hand', neg: 'extra fingers, fused fingers' },
    { pos: '(detailed hands:1.1), (five fingers on each hand:1.1), natural relaxed hand pose', neg: 'extra fingers, fused fingers, six fingers, malformed hands, mutated hands' },
    { pos: '(perfect hands:1.2), (anatomically correct hands, five fingers on each hand:1.2), simple relaxed hands', neg: 'extra fingers, fused fingers, six fingers, malformed hands, mutated hands, deformed hands, extra digits, poorly drawn hands' }
  ];

  // {prompt, negative} for a hand-boost level (0 = unchanged). Negative terms already present are not repeated.
  function inspBoostPrompts(level, prompt, negative) {
    let b = INSP_HAND_BOOST[Math.max(0, Math.min(INSP_HAND_BOOST.length - 1, level))];
    if(!b) return null;
    let have = String(negative || '').toLowerCase();
    let extra = b.neg.split(',').map(x => x.trim()).filter(x => x && have.indexOf(x.toLowerCase()) < 0);
    return {
      prompt: String(prompt || '').replace(/[,\s]+$/, '') + ', ' + b.pos,
      negative: String(negative || '') + (extra.length ? (negative ? ', ' : '') + extra.join(', ') : '')
    };
  }

  // Problem text found in the judge's HANDS line (digit counts other than 5, or bad words), or ''.
  function inspHandsProblem(line) {
    let t = String(line || '').replace(/^\s*hands:\s*/i, '').trim();
    if(!t || /^(none|no hands?|not visible|no visible)/i.test(t) || /hands? (is|are) (not visible|out of|below|hidden)/i.test(t)) return '';
    // "no extra fingers", "not fused" are good news, not problems.
    let cleaned = t.replace(new RegExp('\\b(no|not|without|zero|never)\\s+(\\w+\\s+)?' + INSP_BAD_WORDS + '\\b', 'gi'), '');
    let re = /(\d+)\s*(?:visible\s*)?(?:digits?|fingers?)(?![^.;,]{0,14}thumb)/gi, m;
    while((m = re.exec(cleaned))) {
      let n = parseInt(m[1], 10);
      if(n !== 5) return 'hand with ' + n + ' fingers';
    }
    let w = cleaned.match(new RegExp('\\b' + INSP_BAD_WORDS + '\\b', 'i'));
    return w ? 'malformed hand (' + w[1].toLowerCase() + ')' : '';
  }

  // FACE / OTHER lines: anything other than "ok"-like text is a problem.
  function inspLineProblem(line, label) {
    let t = String(line || '').trim().replace(/[."']/g, '').toLowerCase();
    if(!t || /^(ok|okay|fine|good|normal|none|none visible|no problems?|no issues?)\b/.test(t)) return '';
    return label + ': ' + String(line).trim().slice(0, 80);
  }

  // Vision judge. The negative prompt is the checklist of unwanted traits;
  // the anatomy rubric is always on. Never throws: returns {error} on failure.
  async function inspCritique(dataUrl, negative, prompt) {
    let neg = String(negative || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    let brief = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    let instruction = 'You are a quality inspector for AI-generated images. Judge ONLY what is visible in this image.\n'
      + (neg ? '1. It must NOT show any of these unwanted traits: ' + neg + '.\n' : '')
      + '2. Any visible human or creature anatomy must look right: hands and fingers (count, shape, fusion), face (symmetric eyes, nose, mouth, ears), neck, shoulders, arms and legs. Parts below or outside the frame edge are NOT defects — never penalize what you cannot see — but a head or face cut off by the frame edge IS a defect.\n'
      + (brief ? '3. It should reasonably match what was requested: ' + brief + '\n' : '')
      + 'Be strict: AI painters very often draw hands wrong. Before scoring, inspect every visible hand one finger at a time. Also say when fingers are not clearly separated (sausage-like, blobby, stubby, fused) or oddly long/bent.\n'
      + 'Reply in exactly this format:\n'
      + 'HANDS: <for EACH visible hand: "left/right hand: N digits (thumb included), normal" or the problem, e.g. "6 digits", "two fingers fused", "finger too long", "bent wrong"; or "none visible">\n'
      + 'FACE: <ok, or the problem>\n'
      + 'OTHER: <ok, or any other anatomy problem or unwanted trait found>\n'
      + 'SCORE: <integer 0-10; 10 only if flawless; at most 5 if any hand does not have exactly 5 digits or has fused/merged/distorted fingers; at most 4 if two or more problems>\n'
      + 'DEFECTS: <short list of every problem found, or the words none visible>';
    let lastErr = null;
    for(let tryNo = 0; tryNo < 2; tryNo++) {
      try {
        if(typeof root === 'undefined' || !root.aiTextPlugin) throw new Error('aiTextPlugin is not available');
        let blob = await (await fetch(dataUrl)).blob();
        let res = await inspTimeout(root.aiTextPlugin({ instruction: [instruction, blob], startWith: 'HANDS:' }), INSP_JUDGE_TIMEOUT_MS, 'Inspection timed out.');
        let text = String(res && res.text != null ? res.text : res);
        let m = text.match(/SCORE:\s*(\d{1,2})/);
        if(!m) throw new Error('Unreadable inspector reply: ' + text.slice(0, 80));
        let d = text.match(/DEFECTS:\s*([^\n]+)/);
        let score = Math.max(0, Math.min(10, parseInt(m[1], 10)));
        let defects = d ? d[1].trim().slice(0, 240) : '';
        // Do not trust the number alone: enforce what the judge itself wrote about the hands/face.
        let handsLine = (text.match(/^\s*([^\n]*)/) || [, ''])[1];
        let problems = [inspHandsProblem(handsLine), inspLineProblem((text.match(/FACE:\s*([^\n]+)/) || [, ''])[1], 'face'),
          inspLineProblem((text.match(/OTHER:\s*([^\n]+)/) || [, ''])[1], 'other')].filter(Boolean);
        if(problems.length) {
          score = Math.min(score, problems.length > 1 ? 4 : 5);
          if(inspIsClean(defects)) defects = problems.join('; ');
        }
        return { score: score, defects: defects.slice(0, 240), hands: handsLine };
      } catch(e) {
        lastErr = e;
        console.error('image inspector:', e);
      }
    }
    return { error: String(lastErr && lastErr.message || lastErr) };
  }

  // One extra generation with the given params in a hidden (but in-viewport,
  // so the embed is not throttled) iframe. Resolves {dataUrl, seedUsed}.
  function inspGenerate(base, seed, tweak) {
    return new Promise((resolve, reject) => {
      let d = JSON.parse(JSON.stringify(base));
      if(tweak) { d.prompt = tweak.prompt; d.negativePrompt = tweak.negative; }
      d.seed = seed;
      d.requestId = Math.random().toString();
      d.iframeId = 'inspAttempt' + Math.random().toString().replace('.', '');
      let holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;';
      let ifr = document.createElement('iframe');
      ifr.style.cssText = iframeSizeFor(d.resolution);
      holder.appendChild(ifr);
      let timer = null;
      // On success keep the iframe alive a moment after `finished`: removing it mid-download made the embed log AbortErrors.
      let done = function(lingerMs) {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        if(lingerMs) setTimeout(() => holder.remove(), lingerMs); else holder.remove();
      };
      function onMsg(event) {
        let m = event.data;
        if(!m || m.type !== 'finished' || m.id !== d.iframeId) return;
        done(2000);
        if(!m.dataUrl) reject(new Error('Empty image'));
        else resolve({ dataUrl: m.dataUrl, seedUsed: m.seedUsed });
      }
      window.addEventListener('message', onMsg);
      timer = setTimeout(() => { done(); reject(new Error('Generation timed out.')); }, INSP_GEN_TIMEOUT_MS);
      document.body.appendChild(holder);
      ifr.src = 'https://image-generation.perchance.org/embed#' + encodeURIComponent(JSON.stringify(d));
    });
  }

  // ---------- UI: progress strip, chip, winner swap ----------

  function inspHost(ctn) {
    let ifr = ctn.querySelector('iframe');
    return ifr ? ifr.parentElement : null;
  }

  function inspClearUi(ctn) {
    let ifr = ctn.querySelector('iframe');
    if(ifr) ifr.style.display = '';
    ctn.querySelectorAll('.insp-strip, .insp-chip, .insp-winner').forEach(el => el.remove());
  }

  function inspUpdateStrip(ctn, run, label, frac) {
    let host = inspHost(ctn);
    let ifr = ctn.querySelector('iframe');
    if(!host || !ifr) return;
    if(getComputedStyle(host).position === 'static') host.style.position = 'relative';
    let strip = host.querySelector(':scope > .insp-strip');
    if(!strip) {
      strip = document.createElement('div');
      strip.className = 'insp-strip';
      strip.innerHTML = '<span class="insp-spin"></span><div class="insp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="insp-bar-fill"></div></div><div class="insp-label"></div>';
      host.appendChild(strip);
    }
    strip.style.left = ifr.offsetLeft + 'px';
    strip.style.width = ifr.offsetWidth + 'px';
    let pct = Math.round(Math.min(1, Math.max(0.04, frac)) * 100);
    strip.querySelector('.insp-bar').setAttribute('aria-valuenow', String(pct));
    strip.querySelector('.insp-bar-fill').style.width = pct + '%';
    strip.querySelector('.insp-label').textContent = label;
  }

  function inspNotify(run) {
    if(typeof run.onChange === 'function') { try { run.onChange(); } catch(e) {} }
  }

  function inspAddAttemptsButton(ctn) {
    if(ctn.querySelector('.insp-attempts-button')) return;
    let under = ctn.querySelector('.t2i-under-each-image-ctn > div');
    if(!under) return;
    let btn = makeImageActionButton('insp-attempts-button', '\u{1F50D}', 'Review the retries of this image (accepted / rejected)', function() {
      openInspectorAttempts(ctn);
    });
    under.insertBefore(btn, under.firstChild);
  }

  function inspFinish(ctn, run) {
    let ifr = ctn.querySelector('iframe');
    let host = inspHost(ctn);
    ctn.querySelectorAll('.insp-strip').forEach(el => el.remove());
    if(!ifr || !host) return;
    let win = run.attempts[run.winner];
    if(win && run.winner > 0 && win.dataUrl) {
      // Show the winning retry in place of the framework's iframe (which stays
      // in the DOM, hidden: the other buttons read its seed/output).
      let w = ifr.offsetWidth, h = ifr.offsetHeight;
      let wrap = document.createElement('div');
      wrap.className = 'insp-winner';
      wrap.style.cssText = 'position:relative;display:inline-block;';
      let img = document.createElement('img');
      img.src = win.dataUrl;
      img.alt = 'Selected retry ' + win.n;
      img.style.cssText = 'display:block;border:0;width:' + w + 'px;height:' + h + 'px;object-fit:contain;';
      wrap.appendChild(img);
      let out = ifr.textToImagePluginOutput;
      let inputs = (out && out.inputs) || { prompt: run.prompt, negativePrompt: run.negative, seed: run.seed, guidanceScale: run.base.guidanceScale };
      // A retry painted with the hand-boost wording is saved with the prompt that actually made it.
      if(win.promptUsed) inputs = Object.assign({}, inputs, { prompt: win.promptUsed, negativePrompt: win.negativeUsed });
      if(out) out.dataUrl = win.dataUrl; else ifr.textToImagePluginOutput = { dataUrl: win.dataUrl, inputs: inputs };
      let saveBtn = makeSaveButton(async () => { await saveToGalleryWithFly(win.dataUrl, inputs, wrap); });
      saveBtn.style.opacity = '0.4';
      wrap.appendChild(saveBtn);
      host.insertBefore(wrap, ifr);
      ifr.style.display = 'none';
    }
    if(getComputedStyle(host).position === 'static') host.style.position = 'relative';
    let chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'insp-chip';
    let sel = run.attempts[run.winner];
    chip.textContent = '\u{1F50D} ' + (sel ? 'try ' + sel.n + '/' + run.max + (typeof sel.score === 'number' ? ' · ' + sel.score + '/10' : '') : 'no result');
    chip.title = 'Review the retries of this image';
    chip.onclick = () => openInspectorAttempts(ctn);
    host.appendChild(chip);
  }

  // ---------- the run ----------

  async function inspRun(ctn, first, passes) {
    let ifr = ctn.querySelector('iframe');
    let base = getImageData(ctn);
    if(!ifr || !base) return;
    let token = Math.random();
    inspClearUi(ctn);
    let seed = Number(first.seedUsed);
    if(!isFinite(seed) || seed < 0) seed = Number(base.seed);
    if(!isFinite(seed) || seed < 0) seed = Math.floor(Math.random() * 1000000);
    let negative = String(base.negativePrompt || '');
    if(ctn.__negative && negative.indexOf(ctn.__negative) < 0) negative = (negative ? negative + ', ' : '') + ctn.__negative;
    let run = ctn.__inspRun = {
      token: token, max: passes, accept: INSP_ACCEPT_SCORE, seed: seed,
      prompt: String(base.prompt || ''), negative: negative, base: base,
      attempts: [], winner: -1, running: true, stoppedEarly: false, note: ''
    };
    inspAddAttemptsButton(ctn);
    let live = () => ctn.__inspRun === run && ctn.isConnected;
    let bestIdx = -1;

    for(let n = 1; n <= passes; n++) {
      let a = { n: n, status: 'generating', seed: seed, score: null, defects: '', thumb: null, dataUrl: null, error: '', startedAt: Date.now(), ms: 0, selected: false };
      run.attempts.push(a);
      inspUpdateStrip(ctn, run, 'Try ' + n + '/' + passes + ' · ' + (n === 1 ? 'inspecting…' : 'painting…'), inspFrac(n, passes, 'gen'));
      inspNotify(run);
      try {
        if(n === 1) a.dataUrl = first.dataUrl;
        else {
          // Every earlier try whose hands were wrong raises the hand-boost level by one (max 3).
          let level = run.attempts.filter(x => x !== a && (x.handTier || 0) > 0).length;
          let tweak = inspBoostPrompts(level, base.prompt, negative);
          if(tweak) { a.boost = Math.min(level, INSP_HAND_BOOST.length - 1); a.promptUsed = tweak.prompt; a.negativeUsed = tweak.negative; }
          a.dataUrl = (await inspGenerate(base, seed, tweak)).dataUrl;
        }
      } catch(e) {
        a.status = 'failed';
        a.error = String(e && e.message || e);
      }
      if(!live()) return;
      if(!a.dataUrl) { a.ms = Date.now() - a.startedAt; inspNotify(run); continue; }

      a.status = 'judging';
      inspUpdateStrip(ctn, run, 'Try ' + n + '/' + passes + ' · inspecting…', inspFrac(n, passes, 'judge'));
      inspNotify(run);
      let verdict = await inspCritique(a.dataUrl, negative, run.prompt);
      if(!live()) return;
      a.ms = Date.now() - a.startedAt;
      if(verdict.error) {
        // Inspector down: do not burn the remaining tries blind.
        a.status = 'unjudged';
        a.error = verdict.error;
        run.note = 'The inspector could not score this try (' + verdict.error + '), so retrying stopped.';
        if(bestIdx < 0) bestIdx = n - 1;
        break;
      }
      a.score = verdict.score;
      a.defects = verdict.defects;
      if(a.score >= INSP_ACCEPT_SCORE && inspIsClean(a.defects)) {
        inspUpdateStrip(ctn, run, 'Try ' + n + '/' + passes + ' · checking hands…', inspFrac(n, passes, 'judge'));
        let handsProblem = await inspHandsCheck(a.dataUrl);
        if(!live()) return;
        if(handsProblem) { a.score = Math.min(a.score, 5); a.defects = handsProblem; a.handTier = Math.max(1, inspHandTier(handsProblem)); }
        a.ms = Date.now() - a.startedAt;
      }
      // The judge sometimes scores 8 while still listing defects ("bad hands…"); a try is only
      // accepted when the score is high enough AND no defects are listed.
      a.clean = inspIsClean(a.defects);
      a.handTier = inspHandTier(verdict.hands, a.defects);
      a.status = (a.score >= INSP_ACCEPT_SCORE && a.clean && a.handTier === 0) ? 'accepted' : 'rejected';
      let prev = bestIdx >= 0 ? run.attempts[bestIdx] : null;
      let isBest = !prev || typeof prev.score !== 'number' || inspRank(a) > inspRank(prev);
      a.thumb = await inspThumb(a.dataUrl);
      if(!live()) return;
      if(isBest) {
        if(prev) prev.dataUrl = null; // discard the previous best's full image
        bestIdx = n - 1;
      } else {
        a.dataUrl = null; // worse than the one we keep: thumbnail only
      }
      inspUpdateStrip(ctn, run, 'Try ' + n + '/' + passes + ' · ' + a.score + '/10 ' + (a.status === 'accepted' ? 'accepted' : 'rejected'), inspFrac(n, passes, 'done'));
      inspNotify(run);
      if(a.status === 'accepted') { run.stoppedEarly = n < passes; break; }
    }

    run.running = false;
    run.winner = bestIdx;
    if(bestIdx >= 0) run.attempts[bestIdx].selected = true;
    if(bestIdx < 0) run.note = run.note || 'No try produced an image.';
    inspFinish(ctn, run);
    inspNotify(run);
  }

  // ---------- entry point: the framework frame finished ----------

  function inspFindFrame(id) {
    for(let ctn of document.querySelectorAll(PRO_FRAMEWORK.imageCtnSelector)) {
      let data = getImageData(ctn);
      if(data && data.iframeId === id) return ctn;
    }
    return null;
  }

  window.addEventListener('message', function(event) {
    let m = event.data;
    if(!m || m.type !== 'finished' || !m.id || typeof m.dataUrl !== 'string' || m.dataUrl.indexOf('data:image/') !== 0) return;
    if(String(m.id).indexOf('inspAttempt') === 0) return;
    let passes = inspReadPasses();
    let ctn = inspFindFrame(m.id);
    if(!ctn) return;
    if(passes <= 1) {
      // Retries off: leave the frame exactly as the framework made it.
      if(ctn.__inspRun) { ctn.__inspRun = null; inspClearUi(ctn); }
      return;
    }
    inspRun(ctn, m, passes).catch(e => console.error('image inspector run:', e));
  });

  window.proInspector = { INSP_MAX: INSP_MAX, INSP_ACCEPT_SCORE: INSP_ACCEPT_SCORE, readPasses: inspReadPasses };
