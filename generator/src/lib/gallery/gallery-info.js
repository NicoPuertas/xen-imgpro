
(function(){
  function valColor(v){
    v = String(v == null ? "" : v).trim();
    if(/^(true|false|null)$/i.test(v)) return "#569cd6";
    if(/^-?\d+(\.\d+)?$/.test(v)) return "#b5cea8";
    if(/^https?:\/\//i.test(v)) return "#4ec9b0";
    return "#ce9178";
  }
  function paintVal(ta){
    ta.classList.add("pro-gallery-info-val");
    ta.style.color = valColor(ta.value);
  }
  function paintRow(row){
    if(!row || row.dataset.proRow) return;
    row.dataset.proRow = "1";
    row.classList.add("pro-gallery-info-row");
    row.classList.remove("pro-gallery-info-modal", "pro-gallery-info-list", "pro-gallery-info-overlay");
    var key = row.querySelector("input"), ta = row.querySelector("textarea");
    if(key) key.classList.add("pro-gallery-info-key");
    if(ta){
      paintVal(ta);
      if(!ta.dataset.proPainted){
        ta.dataset.proPainted = "1";
        ta.addEventListener("input", function(){ paintVal(ta); });
      }
      if(!row.querySelector(":scope > .pro-gallery-info-bar")){
        var bar = document.createElement("div");
        bar.className = "pro-gallery-info-bar";
        bar.style.cssText = "display:flex;gap:4px;justify-content:flex-end;margin:0;padding:0;";
        var cb = document.createElement("button");
        cb.type = "button";
        cb.textContent = "⧉ copy";
        cb.onclick = function(e){
          e.stopPropagation();
          var done = function(ok){ cb.textContent = ok ? "✅" : "❌"; setTimeout(function(){ cb.textContent = "⧉ copy"; }, 1200); };
          if(typeof copyTextToClipboard === "function") copyTextToClipboard(ta.value).then(done, function(){ done(false); });
          else { try { ta.select(); done(document.execCommand("copy")); } catch(err){ done(false); } }
        };
        var db = document.createElement("button");
        db.type = "button";
        db.textContent = "🗑 delete entry";
        db.onclick = function(e){ e.stopPropagation(); row.remove(); };
        bar.appendChild(cb);
        bar.appendChild(db);
        row.appendChild(bar);
      }
    }
  }
  function paintFromTextarea(ta){
    var row = ta.parentElement;
    if(!row) return;
    paintRow(row);
    var list = row.parentElement;
    if(list && list.tagName === "DIV"){
      list.classList.add("pro-gallery-info-list");
      list.classList.remove("pro-gallery-info-modal");
    }
    var modal = list ? list.parentElement : null;
    if(modal && modal.tagName === "DIV" && !modal.dataset.proPainted){
      modal.dataset.proPainted = "1";
      modal.classList.add("pro-gallery-info-modal");
      modal.classList.remove("pro-gallery-info-row", "pro-gallery-info-list");
      if(modal.parentElement) modal.parentElement.classList.add("pro-gallery-info-overlay");
    }
  }
  function cleanup(){
    document.querySelectorAll(".pro-gallery-info-row.pro-gallery-info-modal").forEach(function(el){
      el.classList.remove("pro-gallery-info-modal");
    });
    document.querySelectorAll(".pro-gallery-info-list.pro-gallery-info-modal").forEach(function(el){
      el.classList.remove("pro-gallery-info-modal");
    });
  }
  function scan(root){
    root = root || document;
    cleanup();
    if(root.querySelectorAll){
      root.querySelectorAll('textarea[placeholder="entry content"]').forEach(paintFromTextarea);
      root.querySelectorAll("button").forEach(function(b){
        var t = String(b.textContent || "").trim();
        if(t === "✖️" || t === "✖" || t === "✕"){
          b.classList.add("pro-gallery-close-btn");
          if(t !== "✕") b.textContent = "✕";
        }
      });
    }
    if(root.tagName === "TEXTAREA" && root.getAttribute("placeholder") === "entry content") paintFromTextarea(root);
  }
  scan(document);
  onProDomChange(function(muts){
    (muts || []).forEach(function(m){
      m.addedNodes.forEach(function(n){
        if(n.nodeType !== 1 || !n.querySelector) return;
        if(n.matches && n.matches('textarea[placeholder="entry content"]')) { scan(n); return; }
        if(n.querySelector('textarea[placeholder="entry content"], [data-local-media-gallery-lightbox], [data-local-media-gallery-item]')) scan(n);
        else if(n.matches && n.matches('button') && /^\s*[✖✕️]+\s*$/.test(n.textContent || '')) scan(n);
      });
    });
  });
})();
