/* ============================================
   Художник Анна Ладыженко — App Logic
   ============================================ */

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : '';  // In production, API is on the same domain via nginx proxy

let DATA = { profile: {}, posts: [] };
let filteredPosts = [];
let displayedCount = 0;
const BATCH = 30;
let currentModalIndex = -1;
let currentCarouselIndex = 0;
let currentUser = null;

// ---- API helpers ----
async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok && res.status !== 401) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res;
}

// ---- Auth ----
async function checkSession() {
  try {
    const res = await api('/api/auth/me');
    if (res.ok) {
      currentUser = await res.json();
    }
  } catch { /* not logged in */ }
  renderAuthUI();
}

function renderAuthUI() {
  const container = document.getElementById('authContainer');
  const signInBtn = document.getElementById('googleSignInBtn');
  const userInfo = document.getElementById('userInfo');

  if (currentUser) {
    signInBtn.style.display = 'none';
    userInfo.style.display = 'flex';
    document.getElementById('userAvatar').src = currentUser.avatar_url || '';
    document.getElementById('userName').textContent = currentUser.name;
    // Hide guest name field in comment form
    const guestInput = document.getElementById('commentGuestName');
    if (guestInput) guestInput.style.display = 'none';
  } else {
    userInfo.style.display = 'none';
    signInBtn.style.display = '';
    initGoogleSignIn();
    const guestInput = document.getElementById('commentGuestName');
    if (guestInput) guestInput.style.display = '';
  }
}

function initGoogleSignIn() {
  const clientId = document.querySelector('meta[name="google-client-id"]')?.content;
  if (!clientId || typeof google === 'undefined') return;

  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredential,
  });
  google.accounts.id.renderButton(
    document.getElementById('googleSignInBtn'),
    { theme: 'outline', size: 'medium', text: 'signin_with', locale: 'ru' }
  );
}

async function handleGoogleCredential(response) {
  try {
    const res = await api('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential }),
    });
    currentUser = await res.json();
    renderAuthUI();
  } catch (err) {
    console.error('Auth failed:', err);
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  currentUser = null;
  renderAuthUI();
}

// ---- Load Data ----
async function init() {
  try {
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
  checkSession();
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
    if (activeFilter === 'image' && (post.media.length > 1 || post.media[0]?.type === 'video')) return false;
    if (activeFilter === 'video' && !post.media.some(m => m.type === 'video')) return false;
    if (activeFilter === 'carousel' && post.media.length <= 1) return false;
    if (search && !post.caption.toLowerCase().includes(search)) return false;
    return true;
  });

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
  const newCodes = [];

  for (let i = displayedCount; i < end; i++) {
    gallery.appendChild(createCard(filteredPosts[i], i));
    newCodes.push(filteredPosts[i].code);
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

  // Bulk fetch like counts for displayed cards
  if (newCodes.length > 0) {
    fetchBulkLikes(newCodes);
  }
}

async function fetchBulkLikes(codes) {
  try {
    const res = await api('/api/posts/likes?codes=' + codes.join(','));
    const data = await res.json();
    for (const [code, info] of Object.entries(data)) {
      const card = document.querySelector(`.card[data-code="${code}"]`);
      if (card) {
        const likeSpan = card.querySelector('.card-like-count');
        if (likeSpan) likeSpan.textContent = info.total_likes;
      }
    }
  } catch { /* API unavailable, keep original counts */ }
}

// ---- Card ----
function createCard(post, index) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.index = index;
  card.dataset.code = post.code;

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
        <span>&#x2764; <span class="card-like-count">${post.like_count}</span></span>
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

  history.replaceState(null, '', '#post=' + post.code);

  renderModalMedia(post, 0);
  document.getElementById('modalDate').textContent = formatDate(post.taken_at);
  document.getElementById('modalCaption').textContent = post.caption || '';
  document.getElementById('modalStats').innerHTML = `&#x1F4AC; ${post.comment_count} (Instagram)`;

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

  // Load likes and comments from API
  loadPostLikes(post.code);
  loadComments(post.code);
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
  const vid = document.querySelector('.modal-media video');
  if (vid) vid.pause();
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

function navigateModal(dir) {
  const post = filteredPosts[currentModalIndex];
  if (post.media.length > 1) {
    const next = currentCarouselIndex + dir;
    if (next >= 0 && next < post.media.length) {
      currentCarouselIndex = next;
      renderModalMedia(post, next);
      updateCarouselDots();
      return;
    }
  }
  const newIndex = currentModalIndex + dir;
  if (newIndex >= 0 && newIndex < filteredPosts.length) {
    openModal(newIndex);
  }
}

// ---- Post Likes ----
async function loadPostLikes(postCode) {
  const btn = document.getElementById('modalLikeBtn');
  const heartIcon = document.getElementById('modalHeartIcon');
  const countEl = document.getElementById('modalLikeCount');

  try {
    const res = await api('/api/posts/' + postCode + '/likes');
    const data = await res.json();
    countEl.textContent = data.total_likes;
    btn.classList.toggle('liked', data.liked);
    heartIcon.innerHTML = data.liked ? '&#x2764;' : '&#x2661;';
  } catch {
    // API unavailable — show Instagram count
    const post = filteredPosts[currentModalIndex];
    countEl.textContent = post?.like_count || 0;
  }

  // Set up click handler (replace to avoid duplicates)
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => togglePostLike(postCode));
}

async function togglePostLike(postCode) {
  const btn = document.getElementById('modalLikeBtn');
  const heartIcon = document.getElementById('modalHeartIcon');
  const countEl = document.getElementById('modalLikeCount');
  const isLiked = btn.classList.contains('liked');

  // Optimistic update
  btn.classList.toggle('liked');
  heartIcon.innerHTML = isLiked ? '&#x2661;' : '&#x2764;';
  btn.classList.add('heart-pop');
  setTimeout(() => btn.classList.remove('heart-pop'), 300);

  try {
    const res = await api('/api/posts/' + postCode + '/like', {
      method: isLiked ? 'DELETE' : 'POST',
    });
    const data = await res.json();
    countEl.textContent = data.total_likes;
    btn.classList.toggle('liked', data.liked);
    heartIcon.innerHTML = data.liked ? '&#x2764;' : '&#x2661;';

    // Update gallery card
    const card = document.querySelector(`.card[data-code="${postCode}"]`);
    if (card) {
      const likeSpan = card.querySelector('.card-like-count');
      if (likeSpan) likeSpan.textContent = data.total_likes;
    }
  } catch {
    // Rollback
    btn.classList.toggle('liked');
    heartIcon.innerHTML = isLiked ? '&#x2764;' : '&#x2661;';
  }
}

// ---- Comments ----
async function loadComments(postCode) {
  const list = document.getElementById('commentsList');
  const countEl = document.getElementById('commentsCount');
  list.innerHTML = '<div class="comments-loading">Загрузка...</div>';

  try {
    const res = await api('/api/posts/' + postCode + '/comments');
    const comments = await res.json();
    list.innerHTML = '';

    let totalCount = 0;
    function countAll(arr) { arr.forEach(c => { totalCount++; countAll(c.replies || []); }); }
    countAll(comments);
    countEl.textContent = totalCount > 0 ? `(${totalCount})` : '';

    if (comments.length === 0) {
      list.innerHTML = '<div class="comments-empty">Пока нет комментариев. Будьте первым!</div>';
      return;
    }

    comments.forEach(c => list.appendChild(renderComment(c, postCode, 0)));
  } catch {
    list.innerHTML = '<div class="comments-empty">Не удалось загрузить комментарии</div>';
    countEl.textContent = '';
  }
}

function renderComment(comment, postCode, depth) {
  const el = document.createElement('div');
  el.className = 'comment-item' + (depth > 0 ? ' comment-reply' : '');
  el.dataset.id = comment.id;

  const authorName = comment.user ? comment.user.name : (comment.guest_name || 'Гость');
  const authorAvatar = comment.user?.avatar_url;
  const dateStr = formatDate(comment.created_at);

  el.innerHTML = `
    <div class="comment-main">
      <div class="comment-author-row">
        ${authorAvatar ? `<img class="comment-avatar" src="${authorAvatar}" alt="" />` : '<div class="comment-avatar-placeholder"></div>'}
        <span class="comment-author">${escapeHtml(authorName)}</span>
        <span class="comment-date">${dateStr}</span>
      </div>
      <div class="comment-text">${escapeHtml(comment.text)}</div>
      <div class="comment-actions">
        <button class="comment-like-btn ${comment.liked_by_me ? 'liked' : ''}" data-id="${comment.id}">
          ${comment.liked_by_me ? '&#x2764;' : '&#x2661;'} <span class="comment-like-count">${comment.likes || ''}</span>
        </button>
        ${depth === 0 ? `<button class="comment-reply-btn" data-id="${comment.id}">Ответить</button>` : ''}
      </div>
    </div>
  `;

  // Like handler
  el.querySelector('.comment-like-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCommentLike(comment.id, el.querySelector('.comment-like-btn'));
  });

  // Reply handler
  const replyBtn = el.querySelector('.comment-reply-btn');
  if (replyBtn) {
    replyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showReplyForm(el, comment.id, postCode);
    });
  }

  // Render replies
  if (comment.replies && comment.replies.length > 0) {
    const repliesContainer = document.createElement('div');
    repliesContainer.className = 'comment-replies';
    comment.replies.forEach(r => repliesContainer.appendChild(renderComment(r, postCode, depth + 1)));
    el.appendChild(repliesContainer);
  }

  return el;
}

function showReplyForm(commentEl, parentId, postCode) {
  // Remove existing reply forms
  const existing = commentEl.querySelector('.reply-form');
  if (existing) { existing.remove(); return; }

  const form = document.createElement('div');
  form.className = 'reply-form';
  form.innerHTML = `
    ${!currentUser ? '<input type="text" class="reply-guest-name" placeholder="Ваше имя" maxlength="50" />' : ''}
    <div class="reply-form-row">
      <textarea class="reply-textarea" placeholder="Ответить..." maxlength="2000"></textarea>
      <button class="reply-submit">Отправить</button>
    </div>
  `;

  form.querySelector('.reply-submit').addEventListener('click', async () => {
    const text = form.querySelector('.reply-textarea').value.trim();
    const guestInput = form.querySelector('.reply-guest-name');
    const guestName = guestInput ? guestInput.value.trim() : null;

    if (!text) return;
    if (!currentUser && !guestName) {
      guestInput.classList.add('input-error');
      return;
    }

    try {
      await api('/api/posts/' + postCode + '/comments', {
        method: 'POST',
        body: JSON.stringify({ text, guest_name: guestName, parent_id: parentId }),
      });
      loadComments(postCode);
    } catch (err) {
      console.error('Failed to post reply:', err);
    }
  });

  commentEl.querySelector('.comment-main').after(form);
  form.querySelector('.reply-textarea').focus();
}

async function toggleCommentLike(commentId, btnEl) {
  const isLiked = btnEl.classList.contains('liked');
  const countEl = btnEl.querySelector('.comment-like-count');

  btnEl.classList.toggle('liked');
  btnEl.innerHTML = `${isLiked ? '&#x2661;' : '&#x2764;'} <span class="comment-like-count">${countEl?.textContent || ''}</span>`;

  try {
    const res = await api('/api/comments/' + commentId + '/like', {
      method: isLiked ? 'DELETE' : 'POST',
    });
    const data = await res.json();
    btnEl.classList.toggle('liked', data.liked);
    btnEl.innerHTML = `${data.liked ? '&#x2764;' : '&#x2661;'} <span class="comment-like-count">${data.total_likes || ''}</span>`;
  } catch {
    // Rollback
    btnEl.classList.toggle('liked');
    btnEl.innerHTML = `${isLiked ? '&#x2764;' : '&#x2661;'} <span class="comment-like-count">${countEl?.textContent || ''}</span>`;
  }
}

async function submitComment() {
  const post = filteredPosts[currentModalIndex];
  if (!post) return;

  const textEl = document.getElementById('commentText');
  const guestEl = document.getElementById('commentGuestName');
  const text = textEl.value.trim();
  const guestName = guestEl ? guestEl.value.trim() : null;

  if (!text) return;
  if (!currentUser && !guestName) {
    guestEl.classList.add('input-error');
    return;
  }

  const submitBtn = document.getElementById('commentSubmit');
  submitBtn.disabled = true;

  try {
    await api('/api/posts/' + post.code + '/comments', {
      method: 'POST',
      body: JSON.stringify({ text, guest_name: guestName }),
    });
    textEl.value = '';
    loadComments(post.code);
  } catch (err) {
    console.error('Failed to post comment:', err);
  } finally {
    submitBtn.disabled = false;
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
  let index = filteredPosts.findIndex(p => p.code === code);
  if (index !== -1) {
    while (displayedCount <= index) {
      loadMore();
    }
    openModal(index);
    return;
  }
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

  // Browser back/forward
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#post=')) {
      openPostFromHash();
    } else if (document.getElementById('modalOverlay').classList.contains('open')) {
      closeModal();
    }
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Comment submit
  document.getElementById('commentSubmit').addEventListener('click', submitComment);

  // Submit comment on Ctrl+Enter
  document.getElementById('commentText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      submitComment();
    }
  });
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
