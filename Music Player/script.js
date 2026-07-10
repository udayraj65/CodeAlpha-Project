/* ==========================================================================
   WAVELENGTH MUSIC PLAYER
   Vanilla JS — no frameworks, no backend, no build tools.
   Loads local MP3 files selected by the user (no hardcoded paths).
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     1. DOM REFERENCES
     ------------------------------------------------------------------------ */
  const fileInput      = document.getElementById('fileInput');
  const playlistList   = document.getElementById('playlistList');
  const emptyState     = document.getElementById('emptyState');
  const trackCountEl   = document.getElementById('trackCount');

  const audioPlayer     = document.getElementById('audioPlayer');
  const trackTitleEl    = document.getElementById('trackTitle');
  const trackArtistEl   = document.getElementById('trackArtist');
  const defaultCover    = document.getElementById('defaultCover');
  const coverArt        = document.getElementById('coverArt');
  const spinningDisc    = document.getElementById('spinningDisc');

  const progressBar     = document.getElementById('progressBar');
  const currentTimeEl   = document.getElementById('currentTime');
  const totalDurationEl = document.getElementById('totalDuration');

  const playBtn      = document.getElementById('playBtn');
  const playIcon     = document.getElementById('playIcon');
  const prevBtn      = document.getElementById('prevBtn');
  const nextBtn      = document.getElementById('nextBtn');
  const shuffleBtn   = document.getElementById('shuffleBtn');
  const repeatBtn    = document.getElementById('repeatBtn');

  const muteBtn       = document.getElementById('muteBtn');
  const volumeIcon    = document.getElementById('volumeIcon');
  const volumeSlider  = document.getElementById('volumeSlider');

  /* ------------------------------------------------------------------------
     2. STATE
     ------------------------------------------------------------------------ */
  const state = {
    playlist: [],          // [{ id, name, artist, url, file }]
    currentIndex: -1,      // index of currently loaded track
    isPlaying: false,
    isShuffle: false,
    repeatMode: 'off',     // 'off' | 'all' | 'one'
    lastVolume: 1,         // remembers volume level before muting
    shuffleHistory: [],    // indices already played this shuffle cycle
  };

  /* ------------------------------------------------------------------------
     3. UTILITY FUNCTIONS
     ------------------------------------------------------------------------ */

  // Formats seconds into m:ss (handles NaN / Infinity gracefully)
  function formatTime(seconds) {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Derives a readable title/artist pair from a raw file name.
  // Supports common "Artist - Title.mp3" naming, otherwise falls back gracefully.
  function parseFileName(fileName) {
    const nameNoExt = fileName.replace(/\.[^/.]+$/, '');
    const parts = nameNoExt.split(' - ');
    if (parts.length >= 2) {
      return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
    }
    return { artist: 'Unknown Artist', title: nameNoExt.trim() };
  }

  function uniqueId() {
    return `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /* ------------------------------------------------------------------------
     4. FILE LOADING — builds the playlist from user-selected local files
     ------------------------------------------------------------------------ */
  fileInput.addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const wasEmpty = state.playlist.length === 0;

    files.forEach((file) => {
      const { artist, title } = parseFileName(file.name);
      state.playlist.push({
        id: uniqueId(),
        name: title,
        artist,
        url: URL.createObjectURL(file), // local blob URL — no server needed
        file,
      });
    });

    renderPlaylist();

    // Auto-load (but don't force-play) the first track if nothing was playing
    if (wasEmpty && state.playlist.length > 0) {
      loadTrack(0, { autoplay: false });
    }

    // Reset input so selecting the same file(s) again still fires 'change'
    fileInput.value = '';
  });

  /* ------------------------------------------------------------------------
     5. PLAYLIST RENDERING
     ------------------------------------------------------------------------ */
  function renderPlaylist() {
    // Clear existing rendered items (keep emptyState node around for reuse)
    playlistList.querySelectorAll('.playlist-item').forEach((el) => el.remove());

    trackCountEl.textContent = `${state.playlist.length} track${state.playlist.length === 1 ? '' : 's'}`;

    if (state.playlist.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }
    emptyState.style.display = 'none';

    const fragment = document.createDocumentFragment();

    state.playlist.forEach((track, index) => {
      const li = document.createElement('li');
      li.className = 'playlist-item';
      li.dataset.index = index;
      if (index === state.currentIndex) li.classList.add('active');

      const isActivePlaying = index === state.currentIndex && state.isPlaying;

      li.innerHTML = `
        <span class="item-index">
          ${isActivePlaying
            ? '<span class="eq-bars"><span></span><span></span><span></span></span>'
            : index + 1}
        </span>
        <span class="item-thumb"><i class="fa-solid fa-music"></i></span>
        <span class="item-meta">
          <span class="item-title">${escapeHtml(track.name)}</span>
          <span class="item-sub">${escapeHtml(track.artist)}</span>
        </span>
        <button class="item-remove" title="Remove from playlist" aria-label="Remove track">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;

      // Click anywhere on the row (except remove button) plays that track
      li.addEventListener('click', (e) => {
        if (e.target.closest('.item-remove')) return;
        loadTrack(index, { autoplay: true });
      });

      // Remove button
      li.querySelector('.item-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeTrack(index);
      });

      fragment.appendChild(li);
    });

    playlistList.appendChild(fragment);
  }

  // Basic HTML escaping so filenames can never break markup
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function removeTrack(index) {
    const removingCurrent = index === state.currentIndex;
    URL.revokeObjectURL(state.playlist[index].url);
    state.playlist.splice(index, 1);

    if (state.playlist.length === 0) {
      state.currentIndex = -1;
      audioPlayer.pause();
      audioPlayer.removeAttribute('src');
      resetNowPlayingUI();
      renderPlaylist();
      return;
    }

    if (removingCurrent) {
      const nextIndex = Math.min(index, state.playlist.length - 1);
      loadTrack(nextIndex, { autoplay: state.isPlaying });
    } else if (index < state.currentIndex) {
      state.currentIndex -= 1;
      renderPlaylist();
    } else {
      renderPlaylist();
    }
  }

  function resetNowPlayingUI() {
    trackTitleEl.textContent = 'No song loaded';
    trackArtistEl.textContent = 'Load your music to get started';
    totalDurationEl.textContent = '0:00';
    currentTimeEl.textContent = '0:00';
    progressBar.value = 0;
    updateProgressFill(0);
    setPlayingIcon(false);
  }

  /* ------------------------------------------------------------------------
     6. TRACK LOADING & PLAYBACK
     ------------------------------------------------------------------------ */
  function loadTrack(index, { autoplay = true } = {}) {
    if (index < 0 || index >= state.playlist.length) return;

    state.currentIndex = index;
    const track = state.playlist[index];

    audioPlayer.src = track.url;
    trackTitleEl.textContent = track.name;
    trackArtistEl.textContent = track.artist;

    // No custom artwork is ever uploaded — always show the animated default cover
    defaultCover.style.display = 'grid';

    progressBar.value = 0;
    updateProgressFill(0);
    currentTimeEl.textContent = '0:00';

    renderPlaylist();

    if (autoplay) {
      playTrack();
    } else {
      setPlayingIcon(false);
    }
  }

  function playTrack() {
    if (state.currentIndex === -1) {
      if (state.playlist.length > 0) {
        loadTrack(0, { autoplay: true });
      }
      return;
    }
    const playPromise = audioPlayer.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          state.isPlaying = true;
          setPlayingIcon(true);
          renderPlaylist();
        })
        .catch(() => {
          // Autoplay could be blocked by the browser — fail silently, stay paused
          state.isPlaying = false;
          setPlayingIcon(false);
        });
    }
  }

  function pauseTrack() {
    audioPlayer.pause();
    state.isPlaying = false;
    setPlayingIcon(false);
    renderPlaylist();
  }

  function togglePlayPause() {
    if (state.playlist.length === 0) return;
    state.isPlaying ? pauseTrack() : playTrack();
  }

  function setPlayingIcon(isPlaying) {
    playIcon.classList.toggle('fa-play', !isPlaying);
    playIcon.classList.toggle('fa-pause', isPlaying);
    playBtn.setAttribute('title', isPlaying ? 'Pause' : 'Play');

    // Rotate the cover image while playing, pause rotation (without snapping back) when paused
    spinningDisc.classList.toggle('is-playing', isPlaying);

    // Soft glowing shadow around the cover while playing, fades out smoothly when paused
    coverArt.style.boxShadow = isPlaying
      ? '0 0 55px 12px rgba(108, 123, 255, 0.55), 0 25px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--glass-border)'
      : '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--glass-border)';
  }

  /* ------------------------------------------------------------------------
     7. NEXT / PREVIOUS / SHUFFLE / REPEAT
     ------------------------------------------------------------------------ */
  function playNext({ fromEnded = false } = {}) {
    if (state.playlist.length === 0) return;

    // Repeat-one: replay the same track
    if (fromEnded && state.repeatMode === 'one') {
      loadTrack(state.currentIndex, { autoplay: true });
      return;
    }

    let nextIndex;

    if (state.isShuffle) {
      nextIndex = getShuffledNextIndex();
    } else {
      nextIndex = state.currentIndex + 1;
      if (nextIndex >= state.playlist.length) {
        if (state.repeatMode === 'all') {
          nextIndex = 0;
        } else if (fromEnded) {
          // Reached the end naturally with no repeat — stop playback
          pauseTrack();
          return;
        } else {
          nextIndex = 0; // manual "next" click wraps around
        }
      }
    }

    loadTrack(nextIndex, { autoplay: true });
  }

  function playPrevious() {
    if (state.playlist.length === 0) return;

    // If more than 3 seconds into the song, restart it instead of going back
    if (audioPlayer.currentTime > 3) {
      audioPlayer.currentTime = 0;
      return;
    }

    let prevIndex;
    if (state.isShuffle) {
      prevIndex = getShuffledNextIndex();
    } else {
      prevIndex = state.currentIndex - 1;
      if (prevIndex < 0) prevIndex = state.playlist.length - 1;
    }
    loadTrack(prevIndex, { autoplay: true });
  }

  // Picks a random track index, avoiding immediate repeats until the
  // whole playlist has been cycled through once.
  function getShuffledNextIndex() {
    if (state.playlist.length === 1) return 0;

    if (state.shuffleHistory.length >= state.playlist.length - 1) {
      state.shuffleHistory = [];
    }

    let candidate;
    do {
      candidate = Math.floor(Math.random() * state.playlist.length);
    } while (
      candidate === state.currentIndex ||
      state.shuffleHistory.includes(candidate)
    );

    state.shuffleHistory.push(candidate);
    return candidate;
  }

  function toggleShuffle() {
    state.isShuffle = !state.isShuffle;
    state.shuffleHistory = [];
    shuffleBtn.classList.toggle('active-state', state.isShuffle);
    shuffleBtn.title = state.isShuffle ? 'Shuffle: On' : 'Shuffle: Off';
  }

  // Cycles: off -> all -> one -> off
  function cycleRepeatMode() {
    const modes = ['off', 'all', 'one'];
    const currentModeIndex = modes.indexOf(state.repeatMode);
    state.repeatMode = modes[(currentModeIndex + 1) % modes.length];

    repeatBtn.classList.toggle('active-state', state.repeatMode !== 'off');

    // Repeat-one uses fa-repeat plus a small "1" badge (added via CSS ::after using data-mode)
    if (state.repeatMode === 'one') {
      repeatBtn.setAttribute('data-mode', 'one');
    } else {
      repeatBtn.removeAttribute('data-mode');
    }

    const labels = { off: 'Repeat: Off', all: 'Repeat: All', one: 'Repeat: One' };
    repeatBtn.title = labels[state.repeatMode];
  }

  /* ------------------------------------------------------------------------
     8. PROGRESS BAR & TIME
     ------------------------------------------------------------------------ */
  function updateProgressFill(percent) {
    progressBar.style.background =
      `linear-gradient(90deg, var(--accent-violet) 0%, var(--accent-teal) ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
  }

  audioPlayer.addEventListener('loadedmetadata', () => {
    totalDurationEl.textContent = formatTime(audioPlayer.duration);
    progressBar.max = audioPlayer.duration || 0;
  });

  audioPlayer.addEventListener('timeupdate', () => {
    if (!isSeeking) {
      progressBar.max = audioPlayer.duration || 100;
      progressBar.value = audioPlayer.currentTime;
      const percent = audioPlayer.duration
        ? (audioPlayer.currentTime / audioPlayer.duration) * 100
        : 0;
      updateProgressFill(percent);
    }
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  });

  let isSeeking = false;

  progressBar.addEventListener('input', () => {
    isSeeking = true;
    const percent = audioPlayer.duration
      ? (progressBar.value / audioPlayer.duration) * 100
      : 0;
    updateProgressFill(percent);
    currentTimeEl.textContent = formatTime(progressBar.value);
  });

  progressBar.addEventListener('change', () => {
    audioPlayer.currentTime = progressBar.value;
    isSeeking = false;
  });

  // Autoplay the next song when the current one finishes
  audioPlayer.addEventListener('ended', () => {
    playNext({ fromEnded: true });
  });

  /* ------------------------------------------------------------------------
     9. VOLUME & MUTE
     ------------------------------------------------------------------------ */
  function updateVolumeIcon() {
    if (audioPlayer.muted || audioPlayer.volume === 0) {
      volumeIcon.className = 'fa-solid fa-volume-xmark';
    } else if (audioPlayer.volume < 0.5) {
      volumeIcon.className = 'fa-solid fa-volume-low';
    } else {
      volumeIcon.className = 'fa-solid fa-volume-high';
    }
  }

  function updateVolumeFill() {
    const percent = audioPlayer.muted ? 0 : audioPlayer.volume * 100;
    volumeSlider.style.background =
      `linear-gradient(90deg, var(--accent-teal) ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
  }

  volumeSlider.addEventListener('input', () => {
    audioPlayer.volume = parseFloat(volumeSlider.value);
    audioPlayer.muted = audioPlayer.volume === 0;
    if (audioPlayer.volume > 0) state.lastVolume = audioPlayer.volume;
    updateVolumeIcon();
    updateVolumeFill();
  });

  function toggleMute() {
    if (audioPlayer.muted || audioPlayer.volume === 0) {
      audioPlayer.muted = false;
      audioPlayer.volume = state.lastVolume || 1;
      volumeSlider.value = audioPlayer.volume;
    } else {
      state.lastVolume = audioPlayer.volume;
      audioPlayer.muted = true;
      volumeSlider.value = 0;
    }
    updateVolumeIcon();
    updateVolumeFill();
  }

  /* ------------------------------------------------------------------------
     10. EVENT LISTENERS — main controls
     ------------------------------------------------------------------------ */
  playBtn.addEventListener('click', togglePlayPause);
  nextBtn.addEventListener('click', () => playNext());
  prevBtn.addEventListener('click', playPrevious);
  shuffleBtn.addEventListener('click', toggleShuffle);
  repeatBtn.addEventListener('click', cycleRepeatMode);
  muteBtn.addEventListener('click', toggleMute);

  // Keyboard shortcut: Spacebar toggles play/pause (ignored while typing in inputs)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      togglePlayPause();
    }
  });

  /* ------------------------------------------------------------------------
     11. INITIALIZATION
     ------------------------------------------------------------------------ */
  function init() {
    updateVolumeFill();
    updateVolumeIcon();
    updateProgressFill(0);
    resetNowPlayingUI();

    // Smooth, gradual transition for the glow shadow and rotation stop
    coverArt.style.transition = 'box-shadow 0.6s ease-in-out, transform 0.35s ease-in-out';
  }

  init();
})();
