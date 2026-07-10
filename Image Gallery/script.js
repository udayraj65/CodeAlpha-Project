/* ==========================================================================
   LUMEN IMAGE GALLERY
   Vanilla JS — no frameworks, no backend, no build tools.
   Loads local image files selected by the user (no hardcoded paths).
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     1. DOM REFERENCES
     ------------------------------------------------------------------------ */
  const fileInput      = document.getElementById('fileInput');
  const galleryGrid    = document.getElementById('galleryGrid');
  const emptyState     = document.getElementById('emptyState');
  const noResultsState = document.getElementById('noResultsState');
  const filterBar      = document.querySelector('.filter-bar');
  const filterButtons  = document.querySelectorAll('.filter-btn');

  const categoryModal   = document.getElementById('categoryModal');
  const modalList       = document.getElementById('modalList');
  const modalCloseBtn   = document.getElementById('modalCloseBtn');
  const modalCancelBtn  = document.getElementById('modalCancelBtn');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');

  const lightbox         = document.getElementById('lightbox');
  const lightboxImage    = document.getElementById('lightboxImage');
  const lightboxTitle    = document.getElementById('lightboxTitle');
  const lightboxCounter  = document.getElementById('lightboxCounter');
  const lightboxClose    = document.getElementById('lightboxClose');
  const lightboxPrev     = document.getElementById('lightboxPrev');
  const lightboxNext     = document.getElementById('lightboxNext');

  /* ------------------------------------------------------------------------
     2. STATE
     ------------------------------------------------------------------------ */
  const state = {
    images: [],            // [{ id, url, name, category }]
    activeFilter: 'all',
    pendingFiles: [],       // files staged in the category-assignment modal
    lightboxItems: [],      // currently visible (filtered) images shown in lightbox
    lightboxIndex: -1,
  };

  const CATEGORY_LABELS = {
    nature: 'Nature',
    city: 'City',
    animals: 'Animals',
    technology: 'Technology',
  };

  /* ------------------------------------------------------------------------
     3. UTILITY FUNCTIONS
     ------------------------------------------------------------------------ */
  function uniqueId() {
    return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Basic HTML escaping so filenames can never break markup
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function stripExtension(fileName) {
    return fileName.replace(/\.[^/.]+$/, '');
  }

  /* ------------------------------------------------------------------------
     4. FILE UPLOAD → CATEGORY ASSIGNMENT MODAL
     ------------------------------------------------------------------------ */
  fileInput.addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    state.pendingFiles = files;
    renderCategoryModal();
    openModal();

    // Reset input so selecting the same file(s) again still fires 'change'
    fileInput.value = '';
  });

  function renderCategoryModal() {
    modalList.innerHTML = '';

    const fragment = document.createDocumentFragment();

    state.pendingFiles.forEach((file, index) => {
      const previewUrl = URL.createObjectURL(file);

      const row = document.createElement('div');
      row.className = 'modal-row';
      row.dataset.index = index;

      row.innerHTML = `
        <img class="modal-row-thumb" src="${previewUrl}" alt="" />
        <span class="modal-row-name">${escapeHtml(file.name)}</span>
        <select class="modal-row-select" data-index="${index}">
          <option value="nature">Nature</option>
          <option value="city">City</option>
          <option value="animals">Animals</option>
          <option value="technology">Technology</option>
        </select>
      `;

      fragment.appendChild(row);
    });

    modalList.appendChild(fragment);
  }

  function openModal() {
    categoryModal.classList.add('open');
  }

  function closeModal() {
    categoryModal.classList.remove('open');
    // Revoke the temporary preview URLs used only inside the modal
    modalList.querySelectorAll('.modal-row-thumb').forEach((img) => {
      URL.revokeObjectURL(img.src);
    });
    state.pendingFiles = [];
    modalList.innerHTML = '';
  }

  modalCloseBtn.addEventListener('click', closeModal);
  modalCancelBtn.addEventListener('click', closeModal);

  // Clicking the dark backdrop (outside the modal card) also cancels
  categoryModal.addEventListener('click', (e) => {
    if (e.target === categoryModal) closeModal();
  });

  modalConfirmBtn.addEventListener('click', () => {
    const rows = modalList.querySelectorAll('.modal-row');

    rows.forEach((row) => {
      const index = Number(row.dataset.index);
      const file = state.pendingFiles[index];
      const select = row.querySelector('.modal-row-select');
      const category = select.value;

      state.images.push({
        id: uniqueId(),
        url: URL.createObjectURL(file), // permanent gallery copy (separate from modal preview)
        name: stripExtension(file.name),
        category,
      });
    });

    closeModal();
    renderGallery();
  });

  /* ------------------------------------------------------------------------
     5. GALLERY RENDERING
     ------------------------------------------------------------------------ */
  function renderGallery() {
    // Clear existing rendered cards (keep the empty-state node for reuse)
    galleryGrid.querySelectorAll('.gallery-item').forEach((el) => el.remove());

    if (state.images.length === 0) {
      emptyState.hidden = false;
      noResultsState.hidden = true;
      return;
    }
    emptyState.hidden = true;

    const fragment = document.createDocumentFragment();

    state.images.forEach((image, index) => {
      const card = document.createElement('div');
      card.className = 'gallery-item';
      card.dataset.category = image.category;
      card.dataset.id = image.id;
      card.style.animationDelay = `${Math.min(index, 12) * 0.04}s`;

      card.innerHTML = `
        <img src="${image.url}" alt="${escapeHtml(image.name)}" loading="lazy" />
        <div class="gallery-item-overlay">
          <span class="gallery-item-badge">${CATEGORY_LABELS[image.category] || image.category}</span>
          <span class="gallery-item-name">${escapeHtml(image.name)}</span>
        </div>
        <button class="gallery-item-remove" title="Remove image" aria-label="Remove image">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;

      // Open lightbox when the card itself is clicked (but not the remove button)
      card.addEventListener('click', (e) => {
        if (e.target.closest('.gallery-item-remove')) return;
        openLightbox(image.id);
      });

      card.querySelector('.gallery-item-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeImage(image.id);
      });

      fragment.appendChild(card);
    });

    galleryGrid.appendChild(fragment);
    applyFilter(state.activeFilter, { animate: false });
  }

  function removeImage(id) {
    const index = state.images.findIndex((img) => img.id === id);
    if (index === -1) return;

    URL.revokeObjectURL(state.images[index].url);
    state.images.splice(index, 1);
    renderGallery();
  }

  /* ------------------------------------------------------------------------
     6. CATEGORY FILTERING (with smooth fade/scale animation)
     ------------------------------------------------------------------------ */
  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;

    filterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    state.activeFilter = btn.dataset.filter;
    applyFilter(state.activeFilter, { animate: true });
  });

  function applyFilter(filter, { animate = true } = {}) {
    const cards = Array.from(galleryGrid.querySelectorAll('.gallery-item'));
    let visibleCount = 0;

    cards.forEach((card) => {
      const matches = filter === 'all' || card.dataset.category === filter;

      if (matches) {
        visibleCount += 1;
        card.style.display = '';
        // Trigger a reflow so the fade-in transition actually plays
        if (animate) {
          card.classList.add('hide');
          // eslint-disable-next-line no-unused-expressions
          card.offsetHeight;
          requestAnimationFrame(() => card.classList.remove('hide'));
        } else {
          card.classList.remove('hide');
        }
      } else {
        card.classList.add('hide');
        if (animate) {
          setTimeout(() => {
            if (card.classList.contains('hide')) card.style.display = 'none';
          }, 350);
        } else {
          card.style.display = 'none';
        }
      }
    });

    noResultsState.hidden = !(state.images.length > 0 && visibleCount === 0);
  }

  /* ------------------------------------------------------------------------
     7. LIGHTBOX
     ------------------------------------------------------------------------ */
  function getVisibleImages() {
    // Lightbox navigation respects whatever the active filter currently shows
    return state.activeFilter === 'all'
      ? state.images
      : state.images.filter((img) => img.category === state.activeFilter);
  }

  function openLightbox(imageId) {
    state.lightboxItems = getVisibleImages();
    const index = state.lightboxItems.findIndex((img) => img.id === imageId);
    if (index === -1) return;

    state.lightboxIndex = index;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    showLightboxImage();
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    lightboxImage.classList.remove('show');
  }

  function showLightboxImage() {
    const image = state.lightboxItems[state.lightboxIndex];
    if (!image) return;

    lightboxImage.classList.remove('show');

    // Small delay lets the fade-out finish before swapping the source
    setTimeout(() => {
      lightboxImage.src = image.url;
      lightboxImage.alt = image.name;
      lightboxTitle.textContent = image.name;
      lightboxCounter.textContent = `${state.lightboxIndex + 1} / ${state.lightboxItems.length}`;
      lightboxImage.classList.add('show');
    }, 120);
  }

  function showNextImage() {
    if (state.lightboxItems.length === 0) return;
    state.lightboxIndex = (state.lightboxIndex + 1) % state.lightboxItems.length;
    showLightboxImage();
  }

  function showPrevImage() {
    if (state.lightboxItems.length === 0) return;
    state.lightboxIndex =
      (state.lightboxIndex - 1 + state.lightboxItems.length) % state.lightboxItems.length;
    showLightboxImage();
  }

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxNext.addEventListener('click', showNextImage);
  lightboxPrev.addEventListener('click', showPrevImage);

  // Clicking the dark backdrop (outside the image/controls) also closes it
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  /* ------------------------------------------------------------------------
     8. KEYBOARD SHORTCUTS
     ------------------------------------------------------------------------ */
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;

    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showPrevImage();
    if (e.key === 'ArrowRight') showNextImage();
  });

  /* ------------------------------------------------------------------------
     9. INITIALIZATION
     ------------------------------------------------------------------------ */
  function init() {
    renderGallery();
  }

  init();
})();
