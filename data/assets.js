/* ============================================================
   data/assets.js : the image manifest.
   name -> path relative to index.html. Images are OPTIONAL everywhere: anything that names an
   asset (enemy/boss `art`, stage `backdrop`, title/victory `backdrop`) falls back to procedural
   art while the image is loading, and for good if the file is missing or fails to load.
   ============================================================ */
(function () {
  'use strict';
  const XD = window.XD;

  XD.defineAssets({
    // the flagship concept art: used for the final boss sprite, the title backdrop and the victory wreck
    flagship: 'Gemini_Generated_Image_lzbbd7lzbbd7lzbb.jpg'
  });
})();
