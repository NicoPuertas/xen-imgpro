
(function(){
  var META_KEYS = ["prompt", "negativePrompt", "seed", "guidanceScale"];
  function isBad(v){
    return v === undefined || v === null || String(v) === "undefined";
  }
  function sanitizeInfo(info){
    let out = {};
    for(let [k, v] of Object.entries(info || {})){
      if(isBad(v)) continue;
      out[k] = v;
    }
    return out;
  }
  function pickGood(src){
    let out = {};
    for(let k of META_KEYS){
      try{ if(src && !isBad(src[k])) out[k] = src[k]; }catch(e){}
    }
    return out;
  }
  function snapshotMeta(imageCtn){
    let meta = {};
    try{
      let fr = imageCtn && imageCtn.querySelector ? imageCtn.querySelector("iframe") : null;
      let o = fr && fr.textToImagePluginOutput;
      if(o && o.inputs) meta = pickGood(o.inputs);
    }catch(e){}
    if(isBad(meta.prompt) && typeof getImageData === "function"){
      try{
        let d = getImageData(imageCtn, true);
        if(d){
          let fb = pickGood(d);
          for(let k of META_KEYS) if(isBad(meta[k]) && !isBad(fb[k])) meta[k] = fb[k];
        }
      }catch(e){}
    }
    return meta;
  }
  function recoverInputs(result, output){
    let inputs = output && output.inputs ? output.inputs : null;
    if(inputs && !isBad(inputs.prompt)) return output;
    let meta = {};
    try{
      let pending = result && result.context !== undefined && window.t2i_pendingUpscales
        ? window.t2i_pendingUpscales.get(result.context) : null;
      if(pending && pending.__proMeta) meta = Object.assign({}, pending.__proMeta);
      if(isBad(meta.prompt) && pending && pending.imageCtn) meta = Object.assign(meta, snapshotMeta(pending.imageCtn));
    }catch(e){}
    if(isBad(meta.prompt)){
      try{
        let ctrs = document.querySelectorAll(".t2i-image-ctn");
        for(let c of ctrs){
          let fr = c.querySelector("iframe");
          let o = fr && fr.textToImagePluginOutput;
          if(o && o.inputs && !isBad(o.inputs.prompt)){
            if(!output || !output.dataUrl || o.dataUrl === output.dataUrl){ meta = Object.assign(meta, pickGood(o.inputs)); break; }
          }
        }
      }catch(e){}
    }
    let merged = Object.assign({}, meta, pickGood(inputs));
    if(output) output.inputs = merged;
    else output = {inputs: merged};
    return output;
  }
  function installStartWrap(){
    if(window.__proUpscaleStartWrapInstalled) return true;
    if(typeof window.t2i_startUpscale !== "function") return false;
    let orig = window.t2i_startUpscale;
    window.t2i_startUpscale = function(imageCtn){
      let r = orig.call(this, imageCtn);
      try{
        if(window.t2i_pendingUpscales) for(let [, p] of window.t2i_pendingUpscales){
          if(p && p.imageCtn === imageCtn && !p.__proMeta) p.__proMeta = snapshotMeta(imageCtn);
        }
      }catch(e){}
      return r;
    };
    window.__proUpscaleStartWrapInstalled = true;
    return true;
  }
  function installUpscaleWrap(){
    if(window.__proUpscaleWrapInstalled) return true;
    if(typeof window.t2i_showUpscaleLightbox !== "function") return false;
    let orig = window.t2i_showUpscaleLightbox;
    window.t2i_showUpscaleLightbox = function(result, output){
      try{ output = recoverInputs(result, output); }catch(e){}
      return orig.call(this, result, output);
    };
    window.__proUpscaleWrapInstalled = true;
    return true;
  }
  function installAddWrap(){
    if(window.__proGalleryAddWrapInstalled) return true;
    let g = window.t2i_privateGallery;
    if(!g || typeof g.add !== "function") return false;
    let origAdd = g.add.bind(g);
    g.add = function(blob, opts){
      try{
        opts = opts || {};
        if(opts.info) opts = Object.assign({}, opts, {info: sanitizeInfo(opts.info)});
      }catch(e){}
      return origAdd(blob, opts);
    };
    window.__proGalleryAddWrapInstalled = true;
    return true;
  }
  function install(){
    installStartWrap();
    installUpscaleWrap();
    installAddWrap();
    return window.__proUpscaleStartWrapInstalled && window.__proUpscaleWrapInstalled && window.__proGalleryAddWrapInstalled;
  }
  if(!install()){
    let tries = 0;
    let attempt = () => { if(install() || ++tries > 100) offProDomChange(attempt); };
    onProDomChange(attempt);
    setTimeout(() => offProDomChange(attempt), 20000);
  }
})();
