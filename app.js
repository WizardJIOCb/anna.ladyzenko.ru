/* ============================================
   Художник Анна Ладыженко — App Logic
   ============================================ */

let DATA = { profile: {}, posts: [] };
let filteredPosts = [];
let displayedCount = 0;
const BATCH = 30;
let currentModalIndex = -1;
let currentCarouselIndex = 0;

// ---- Load Data ----
async function init() {
  try {
    // Try local version first (has downloaded media paths), fallback to original
    let resp = await fetch('data/instagram_data_local.json');
    if (!resp.ok) resp = await fetch('data/instagram_data.json');
    DATA = await resp.json();
  } catch (e) {
    console.error('Failed to load data:', e);
    document.getElementById('gallery').innerHTML = '<p style="text-align:center;padding:2rem;color:#999;">Не удалось загрузить данные. Убедитесь, что файл data/instagram_data.json существует.</p>';
    return;
  }

  renderProfile();
  applyFilters();
  setupListeners();
  openPostFromHash();
}

// ---- Profile ----
function renderProfile() {
  const p = DATA.profile;
  document.getElementById('profilePic').src = p.local_profile_pic || p.profile_pic_url;
  document.getElementById('heroBio').textContent = p.biography;
  document.getElementById('heroStats').innerHTML = `
    <div class="stat-item"><span class="stat-num">${p.posts_count}</span><span class="stat-label">публикаций</span></div>
    <div class="stat-item"><span class="stat-num">734</span><span class="stat-label">подписчиков</span></div>
    <div class="stat-item"><span class="stat-num">852</span><span class="stat-label">подписки</span></div>
  `;
  document.getElementById('modalAvatar').src = p.local_profile_pic || p.profile_pic_url;
}

// ---- Filters & Sort ----
function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
  const sort = document.getElementById('sortSelect').value;

  filteredPosts = DATA.posts.filter(post => {
    // Type filter
    if (activeFilter === 'image' && (post.media.length > 1 || post.media[0]?.type === 'video')) return false;
    if (activeFilter === 'video' && !post.media.some(m => m.type === 'video')) return false;
    if (activeFilter === 'carousel' && post.media.length <= 1) return false;

    // Search
    if (search && !post.caption.toLowerCase().includes(search)) return false;

    return true;
  });

  // Sort
  if (sort === 'newest') filteredPosts.sort((a, b) => b.taken_at - a.taken_at);
  else if (sort === 'oldest') filteredPosts.sort((a, b) => a.taken_at - b.taken_at);
  else if (sort === 'popular') filteredPosts.sort((a, b) => b.like_count - a.like_count);

  displayedCount = 0;
  document.getElementById('gallery').innerHTML = '';
  document.getElementById('postCount').textContent = `Показано ${Math.min(BATCH, filteredPosts.length)} из ${filteredPosts.length} публикаций`;
  loadMore();
}

function loadMore() {
  const gallery = document.getElementById('gallery');
  const end = Math.min(displayedCount + BATCH, filteredPosts.length);

  for (let i = displayedCount; i < end; i++) {
    gallery.appendChild(createCard(filteredPosts[i], i));
  }

  displayedCount = end;
  document.getElementById('postCount').textContent = `Показано ${displayedCount} из ${filteredPosts.length} публикаций`;

  const btn = document.getElementById('loadMoreBtn');
  if (displayedCount >= filteredPosts.length) {
    btn.disabled = true;
    btn.textContent = 'Все публикации загружены';
  } else {
    btn.disabled = false;
    btn.textContent = `Загрузить ещё (осталось ${filteredPosts.length - displayedCount})`;
  }
}

// ---- Card ----
function createCard(post, index) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.index = index;

  const firstMedia = post.media[0];
  const isVideo = firstMedia?.type === 'video';
  const isCarousel = post.media.length > 1;
  const thumbUrl = firstMedia?.local_image || firstMedia?.image_url || '';

  let badge = '';
  if (isCarousel) badge = `<span class="card-badge">${post.media.length} файлов</span>`;
  else if (isVideo) badge = '<span class="card-badge">Видео</span>';

  const date = formatDate(post.taken_at);
  const caption = post.caption ? escapeHtml(post.caption.substring(0, 200)) : '';

  const placeholderSvg = `<div class="placeholder"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`;

  card.innerHTML = `
    <div class="card-media">
      ${thumbUrl ? `<img src="${thumbUrl}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>` : placeholderSvg}
      ${badge}
    </div>
    <div class="card-body">
      <div class="card-date">${date}</div>
      <div class="card-caption">${caption}</div>
    </div>
    <div class="card-footer">
      <div class="card-stats">
        <span>&#x2764; ${post.like_count}</span>
        <span>&#x1F4AC; ${post.comment_count}</span>
      </div>
      <button class="card-download" onclick="event.stopPropagation(); downloadPostMedia(${index})">&#x2B07; Скачать</button>
    </div>
  `;

  card.style.animationDelay = `${(index % BATCH) * 0.04}s`;
  card.addEventListener('click', () => openModal(index));
  return card;
}

// ---- Modal ----
function openModal(index) {
  currentModalIndex = index;
  currentCarouselIndex = 0;
  const post = filteredPosts[index];

  // Update URL hash for sharing
  history.replaceState(null, '', '#post=' + post.code);

  renderModalMedia(post, 0);
  document.getElementById('modalDate').textContent = formatDate(post.taken_at);
  document.getElementById('modalCaption').textContent = post.caption || '';
  document.getElementById('modalStats').innerHTML = `&#x2764; ${post.like_count} &nbsp;&bull;&nbsp; &#x1F4AC; ${post.comment_count}`;

  // Download buttons
  const dlContainer = document.getElementById('modalDownloads');
  dlContainer.innerHTML = '';
  post.media.forEach((m, i) => {
    const url = m.type === 'video'
      ? (m.local_video || m.video_url)
      : (m.local_image || m.image_url);
    if (!url) return;
    const label = m.type === 'video' ? `Видео ${i + 1}` : `Фото ${i + 1}`;
    const a = document.createElement('a');
    a.className = 'modal-dl-btn';
    a.href = url;
    a.download = '';
    a.textContent = `\u2B07 ${label}`;
    dlContainer.appendChild(a);
  });

  // Share button
  const shareContainer = document.getElementById('modalShare');
  shareContainer.innerHTML = '';
  const shareBtn = document.createElement('button');
  shareBtn.className = 'modal-share-btn';
  shareBtn.innerHTML = '\u{1F517} Скопировать ссылку';
  shareBtn.addEventListener('click', () => {
    const url = window.location.origin + window.location.pathname + '#post=' + post.code;
    navigator.clipboard.writeText(url).then(() => {
      shareBtn.textContent = '\u2714 Ссылка скопирована!';
      setTimeout(() => { shareBtn.innerHTML = '\u{1F517} Скопировать ссылку'; }, 2000);
    }).catch(() => {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      shareBtn.textContent = '\u2714 Ссылка скопирована!';
      setTimeout(() => { shareBtn.innerHTML = '\u{1F517} Скопировать ссылку'; }, 2000);
    });
  });
  shareContainer.appendChild(shareBtn);

  // Carousel dots
  const controls = document.getElementById('carouselControls');
  controls.innerHTML = '';
  if (post.media.length > 1) {
    post.media.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => {
        currentCarouselIndex = i;
        renderModalMedia(post, i);
        updateCarouselDots();
      });
      controls.appendChild(dot);
    });
  }

  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderModalMedia(post, mediaIndex) {
  const container = document.getElementById('modalMedia');
  const m = post.media[mediaIndex];
  if (!m) return;

  const imgSrc = m.local_image || m.image_url;
  const vidSrc = m.local_video || m.video_url;

  if (m.type === 'video') {
    container.innerHTML = `<video src="${vidSrc}" controls autoplay playsinline poster="${imgSrc || ''}" style="max-width:100%;max-height:85vh;"></video>`;
  } else {
    container.innerHTML = `<img src="${imgSrc}" alt="" />`;
  }
}

function updateCarouselDots() {
  document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === currentCarouselIndex);
  });
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  // Stop any playing video
  const vid = document.querySelector('.modal-media video');
  if (vid) vid.pause();
  // Clear URL hash
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

function navigateModal(dir) {
  const post = filteredPosts[currentModalIndex];
  if (post.media.length > 1) {
    // Navigate within carousel first
    const next = currentCarouselIndex + dir;
    if (next >= 0 && next < post.media.length) {
      currentCarouselIndex = next;
      renderModalMedia(post, next);
      updateCarouselDots();
      return;
    }
  }
  // Navigate between posts
  const newIndex = currentModalIndex + dir;
  if (newIndex >= 0 && newIndex < filteredPosts.length) {
    openModal(newIndex);
  }
}

// ---- Downloads ----
function downloadPostMedia(index) {
  const post = filteredPosts[index];
  post.media.forEach(m => {
    const url = m.type === 'video'
      ? (m.local_video || m.video_url)
      : (m.local_image || m.image_url);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      a.click();
    }
  });
}

function downloadAllScript() {
  // Generate a simple download list as text file with all URLs
  let content = '# Список всех медиафайлов из аккаунта anna_ladyzenko\n';
  content += '# Для скачивания используйте wget или любой менеджер загрузок\n\n';

  DATA.posts.forEach((post, i) => {
    const date = formatDate(post.taken_at);
    content += `# Пост ${i + 1} — ${date}\n`;
    if (post.caption) content += `# ${post.caption.substring(0, 80).replace(/\n/g, ' ')}\n`;
    post.media.forEach((m, j) => {
      if (m.type === 'video') {
        content += `${m.local_video || m.video_url}\n`;
      }
      if (m.local_image || m.image_url) {
        content += `${m.local_image || m.image_url}\n`;
      }
    });
    content += '\n';
  });

  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anna_ladyzenko_media_urls.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Deep Link ----
function openPostFromHash() {
  const hash = window.location.hash;
  if (!hash.startsWith('#post=')) return;
  const code = hash.substring(6);
  // Find the post index in filteredPosts by code
  let index = filteredPosts.findIndex(p => p.code === code);
  if (index !== -1) {
    // Make sure the post is rendered in the gallery (load enough batches)
    while (displayedCount <= index) {
      loadMore();
    }
    openModal(index);
    return;
  }
  // If not found in filtered, reset filters to show all and try again
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
  if (allBtn) allBtn.classList.add('active');
  document.getElementById('searchInput').value = '';
  document.getElementById('sortSelect').value = 'newest';
  applyFilters();
  index = filteredPosts.findIndex(p => p.code === code);
  if (index !== -1) {
    while (displayedCount <= index) {
      loadMore();
    }
    openModal(index);
  }
}

// ---- Helpers ----
function formatDate(ts) {
  const d = new Date(ts * 1000);
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---- Event Listeners ----
function setupListeners() {
  // Filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });

  // Search (debounced)
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(applyFilters, 300);
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', applyFilters);

  // Load more
  document.getElementById('loadMoreBtn').addEventListener('click', loadMore);

  // Download all
  document.getElementById('downloadAllBtn').addEventListener('click', downloadAllScript);

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('modalPrev').addEventListener('click', () => navigateModal(-1));
  document.getElementById('modalNext').addEventListener('click', () => navigateModal(1));

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('modalOverlay').classList.contains('open')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') navigateModal(-1);
    if (e.key === 'ArrowRight') navigateModal(1);
  });

  // Handle browser back/forward
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#post=')) {
      openPostFromHash();
    } else if (document.getElementById('modalOverlay').classList.contains('open')) {
      closeModal();
    }
  });
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
