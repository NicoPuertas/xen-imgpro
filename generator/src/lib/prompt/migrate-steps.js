
  // ============================================================
  // One-time cleanup of the old steps tag
  //
  // Earlier versions wrote a "(steps:::N)" tag directly into the prompt
  // textarea. The tag is now appended when the image is generated (see
  // `settings.imageOptions.prompt` in main.pjs), so a previously-saved prompt
  // may still have a stale tag sitting in it. Strip any leftover tag from the
  // remembered prompt, and adopt the value it held into the Steps dropdown.
  // ============================================================
  (function() {
    function migrate() {
      let ta = document.querySelector('textarea[data-name="description"]');
      let sel = document.querySelector('select[data-name="steps"]');
      if(!ta || !sel) return false; // UI not built yet
      if(!ta.value) return false; // remembered prompt not restored yet
      let m = String(ta.value).match(/\(steps:::\s*([0-9]+)\s*\)/);
      if(m) {
        let opt = [...sel.options].find(o => o.textContent.trim() === m[1]);
        if(opt && sel.value !== opt.value) {
          sel.value = opt.value;
          sel.onchange({});
        }
        ta.value = String(ta.value).replace(/\s*\(steps:::\s*[0-9]+\s*\)/g, "").trim();
        ta.oninput({});
      }
      return true;
    }
    // Retry via the central dispatcher as the UI builds (remembered prompt
    // restores asynchronously), with a deadline so the handler doesn't
    // linger forever. Replaces the old 250ms polling timer.
    let onChange = () => { if(migrate()) offProDomChange(onChange); };
    if(migrate()) return;
    onProDomChange(onChange);
    setTimeout(() => offProDomChange(onChange), 15000);
  })();
