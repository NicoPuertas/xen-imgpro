
  // Central DOM-change dispatcher. This page used to have one
  // MutationObserver per feature (image buttons, dock, bootstrap enhance,
  // gallery paint) plus a polling timer — each scanning the whole subtree
  // on every mutation. Now there is exactly one observer, batching work
  // to once per animation frame; features subscribe via onProDomChange.
  // Handlers receive the MutationRecord list (may ignore it); one-shot
  // tasks can unsubscribe via offProDomChange.
  let __proChangeHandlers = [];
  function onProDomChange(fn) {
    __proChangeHandlers.push(fn);
    return fn;
  }
  function offProDomChange(fn) {
    let i = __proChangeHandlers.indexOf(fn);
    if(i >= 0) __proChangeHandlers.splice(i, 1);
  }
  (function() {
    let scheduled = false, pending = null;
    function run() {
      scheduled = false;
      let muts = pending;
      pending = null;
      for(let fn of __proChangeHandlers.slice()) {
        try { fn(muts); } catch(e) { console.error(e); }
      }
    }
    new MutationObserver(muts => {
      pending = pending ? pending.concat(muts) : muts.slice();
      if(scheduled) return;
      scheduled = true;
      requestAnimationFrame(run);
    }).observe(document.body, {childList: true, subtree: true});
  })();
