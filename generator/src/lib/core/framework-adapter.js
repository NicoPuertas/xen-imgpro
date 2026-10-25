var PRO_FRAMEWORK = {
  privateGalleryCtnId: 'privateGalleryCtn97364827',
  generateButtonId: 'generateButtonEl',
  imageCtnSelector: '.t2i-image-ctn',
  settingsKey: '___userSettings746291937',
  commentsCtnId: 'commentsPluginCtn654732',
  galleryCtnId: 'imageGalleryCtn8569284'
};
function getFrameworkSettings() {
  return window[PRO_FRAMEWORK.settingsKey] || null;
}
function getPrivateGalleryCtn() {
  return document.getElementById(PRO_FRAMEWORK.privateGalleryCtnId);
}
function getPrivateGalleryButton() {
  let docked = document.querySelector('#bottomDockCtn [data-dock="gallery"]');
  if (docked) return docked;
  let ctn = getPrivateGalleryCtn();
  return ctn ? ctn.querySelector('button') : null;
}
function getGenerateButton() {
  return document.getElementById(PRO_FRAMEWORK.generateButtonId);
}
function getPrivateGallery() {
  return window.t2i_privateGallery || null;
}
function getUserInputEl(name) {
  let s = getFrameworkSettings();
  let u = s && s.userInputs && s.userInputs[name];
  if (u && u._element) return u._element;
  return document.querySelector('#userInputsCtn8462746262 [data-name="' + name + '"]')
    || document.querySelector('[data-name="' + name + '"]')
    || null;
}
function getCommentsCtn() {
  return document.getElementById(PRO_FRAMEWORK.commentsCtnId);
}
function getGalleryCtn() {
  return document.getElementById(PRO_FRAMEWORK.galleryCtnId);
}
