/**
 * Virtual Explorer — Main App
 */
(function() {
  'use strict';

  // State
  let allPlaces = [];
  let filteredPlaces = [];
  let currentView = 'map';
  let currentPlace = null;
  let map = null;
  let markers = [];

  // localStorage keys
  const VISITED_KEY = 've_visited';

  // Tour type icons
  const tourIcons = {
    streetview: '📍',
    video: '🎬',
    web: '🌐',
    default: '🔗'
  };

  // ===== INIT =====
  async function init() {
    // Explicitly hide modal on init
    document.getElementById('placeModal').style.display = 'none';

    // Load data
    try {
      const res = await fetch('data/places.json');
      allPlaces = await res.json();
    } catch (e) {
      console.error('Failed to load places:', e);
      return;
    }

    filteredPlaces = [...allPlaces];
    updateStats();

    // Init map
    initMap();

    // Init events
    initEvents();

    // Render
    render();
    
    // Init AOS for list view animations
    AOS.init({ duration: 400, easing: 'ease-out-cubic', once: true });
  }

  // ===== MAP =====
  function initMap() {
    map = L.map('map', {
      center: [25, 10],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false
    });

    // Dark tile layer - no attribution overlay
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: false
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
  }

  function updateMapMarkers() {
    // Clear existing
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    filteredPlaces.forEach(place => {
      const visited = isVisited(place.id);
      const marker = L.marker([place.coordinates.lat, place.coordinates.lng], {
        icon: L.divIcon({
          className: `custom-marker ${visited ? 'visited' : ''}`,
          html: `<span>${getTypeEmoji(place.type[0])}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      });

      marker.bindPopup(`
        <div class="marker-popup">
          <h3>${place.name}</h3>
          <p>${place.location}</p>
          <button class="popup-btn" onclick="window.openPlace('${place.id}')">
            View Tours →
          </button>
        </div>
      `, { closeButton: true, className: 'dark-popup' });

      markers.push(marker);
      marker.addTo(map);
    });
  }

  // ===== LIST =====
  function renderList() {
    const container = document.getElementById('listContainer');
    container.innerHTML = '';

    filteredPlaces.forEach((place, i) => {
      const visited = isVisited(place.id);
      const card = document.createElement('div');
      card.className = `place-card ${visited ? 'visited' : ''}`;
      card.setAttribute('data-aos', 'fade-up');
      card.setAttribute('data-aos-delay', Math.min(i * 50, 300));
      card.onclick = () => openPlace(place.id);

      card.innerHTML = `
        <div class="card-image" style="background-image: url('${place.image}')">
          <span class="card-badge">${place.region}</span>
          ${visited ? '<span class="card-visited-badge">✅ Explored</span>' : ''}
        </div>
        <div class="card-body">
          <h3>${place.name}</h3>
          <div class="card-location">📍 ${place.location}</div>
          <div class="card-tags">
            ${place.type.slice(0, 3).map(t => `<span class="card-tag">${t}</span>`).join('')}
          </div>
          <div class="card-tours">🌐 ${place.tours.length} virtual tour${place.tours.length > 1 ? 's' : ''}</div>
        </div>
      `;

      container.appendChild(card);
    });

    AOS.refresh();
  }

  // ===== FILTERS =====
  function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const typeFilter = document.querySelector('.chip.active')?.dataset.filter || 'all';
    const regionFilter = document.getElementById('regionFilter').value;
    const visitFilter = document.getElementById('visitFilter').value;

    filteredPlaces = allPlaces.filter(place => {
      // Search
      const matchSearch = !search ||
        place.name.toLowerCase().includes(search) ||
        place.location.toLowerCase().includes(search) ||
        place.country.toLowerCase().includes(search) ||
        place.description.toLowerCase().includes(search);

      // Type
      const matchType = typeFilter === 'all' || place.type.includes(typeFilter);

      // Region
      const matchRegion = regionFilter === 'all' || place.region === regionFilter;

      // Visit status
      const visited = isVisited(place.id);
      const matchVisit = visitFilter === 'all' ||
        (visitFilter === 'visited' && visited) ||
        (visitFilter === 'unvisited' && !visited);

      return matchSearch && matchType && matchRegion && matchVisit;
    });

    render();
  }

  function render() {
    if (currentView === 'map') {
      updateMapMarkers();
    } else {
      renderList();
    }
  }

  // ===== EVENTS =====
  function initEvents() {
    // View switcher
    document.getElementById('mapViewBtn').addEventListener('click', () => switchView('map'));
    document.getElementById('listViewBtn').addEventListener('click', () => switchView('list'));

    // Search
    document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 200));

    // Type chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        applyFilters();
      });
    });

    // Dropdowns
    document.getElementById('regionFilter').addEventListener('change', applyFilters);
    document.getElementById('visitFilter').addEventListener('change', applyFilters);

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`${view}View`).classList.add('active');

    if (view === 'map') {
      setTimeout(() => map.invalidateSize(), 100);
      updateMapMarkers();
    } else {
      renderList();
    }
  }

  // ===== PLACE MODAL =====
  window.openPlace = function(id) {
    const place = allPlaces.find(p => p.id === id);
    if (!place) {
      console.warn('Place not found:', id);
      return;
    }
    currentPlace = place;

    const visited = isVisited(id);
    const visitData = getVisitData(id);

    document.getElementById('modalImage').style.backgroundImage = `url('${place.image}')`;
    document.getElementById('modalName').textContent = place.name;
    document.getElementById('modalLocation').textContent = `📍 ${place.location}`;
    document.getElementById('modalDescription').textContent = place.description;

    // Tags
    document.getElementById('modalTags').innerHTML = place.type
      .map(t => `<span class="modal-tag">${t}</span>`).join('');

    // Tours
    document.getElementById('modalTours').innerHTML = place.tours.map(tour => `
      <a href="${tour.url}" target="_blank" rel="noopener" class="tour-link" onclick="window.trackVisit('${id}')">
        <span class="tour-icon">${tourIcons[tour.type] || tourIcons.default}</span>
        <span class="tour-info">
          <span class="tour-provider">${tour.provider}</span>
          <span class="tour-type">${tour.type}</span>
        </span>
        <span class="tour-arrow">→</span>
      </a>
    `).join('');

    // Visit button
    updateVisitButton(id);

    // Visit history
    if (visitData) {
      document.getElementById('visitHistory').hidden = false;
      document.getElementById('firstVisit').textContent = formatDate(visitData.first);
      document.getElementById('visitCount').textContent = visitData.count;
    } else {
      document.getElementById('visitHistory').hidden = true;
    }

    document.getElementById('placeModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.closeModal = function() {
    document.getElementById('placeModal').style.display = 'none';
    document.body.style.overflow = '';
    currentPlace = null;
  };

  // ===== VISIT TRACKING =====
  function isVisited(id) {
    const data = getVisitData(id);
    return data !== null;
  }

  function getVisitData(id) {
    try {
      const all = JSON.parse(localStorage.getItem(VISITED_KEY) || '{}');
      return all[id] || null;
    } catch {
      return null;
    }
  }

  window.trackVisit = function(id) {
    try {
      const all = JSON.parse(localStorage.getItem(VISITED_KEY) || '{}');
      if (!all[id]) {
        all[id] = { first: Date.now(), last: Date.now(), count: 1 };
      } else {
        all[id].last = Date.now();
        all[id].count++;
      }
      localStorage.setItem(VISITED_KEY, JSON.stringify(all));
      updateStats();
      updateVisitButton(id);

      // Update list if visible
      if (currentView === 'list') {
        renderList();
      }

      // Update map markers
      updateMapMarkers();
    } catch (e) {
      console.error('Failed to save visit:', e);
    }
  };

  window.toggleVisited = function() {
    if (!currentPlace) return;
    const id = currentPlace.id;
    const data = getVisitData(id);

    if (data) {
      // Mark as unvisited
      try {
        const all = JSON.parse(localStorage.getItem(VISITED_KEY) || '{}');
        delete all[id];
        localStorage.setItem(VISITED_KEY, JSON.stringify(all));
        showToast('Marked as not visited');
      } catch (e) {
        console.error(e);
      }
    } else {
      // Mark as visited
      trackVisit(id);
      showToast('Marked as explored! ✅');
    }

    updateStats();
    updateVisitButton(id);
    updateMapMarkers();
    if (currentView === 'list') renderList();

    // Update history display
    const visitData = getVisitData(id);
    if (visitData) {
      document.getElementById('visitHistory').hidden = false;
      document.getElementById('firstVisit').textContent = formatDate(visitData.first);
      document.getElementById('visitCount').textContent = visitData.count;
    } else {
      document.getElementById('visitHistory').hidden = true;
    }
  };

  function updateVisitButton(id) {
    const btn = document.getElementById('visitBtn');
    const visited = isVisited(id);
    btn.className = `btn ${visited ? 'btn-primary visited' : 'btn-primary'}`;
    btn.innerHTML = visited ? '✅ Explored' : '📌 Mark as Explored';
  }

  // ===== STATS =====
  function updateStats() {
    const visited = Object.keys(JSON.parse(localStorage.getItem(VISITED_KEY) || '{}')).length;
    document.getElementById('visitedCount').textContent = visited;
    document.getElementById('totalCount').textContent = allPlaces.length;
  }

  // ===== UTILS =====
  function getTypeEmoji(type) {
    const map = {
      'Ancient': '🏛️',
      'Architecture': '🏗️',
      'UNESCO': '🏛️',
      'Wonders': '⭐',
      'Religious': '⛪',
      'Museum': '🎨',
      'Art': '🖼️',
      'Renaissance': '🎨',
      'Mughal': '🕌',
      'Byzantine': '⛪',
      'Iconic': '📸',
      'Royal': '👑',
      'Mayan': '🗿',
      'Archaeological': '⛏️',
      'Mystery': '❓',
      'Medieval': '🏰',
      'Castle': '🏰',
      'Temple': '🛕',
      'Imperial': '🏯',
      'Sculpture': '🗿',
      'Monument': '🗽'
    };
    return map[type] || '📍';
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 2500);
  }

  window.copyShareLink = function() {
    if (!currentPlace) return;
    const url = `${location.href}#${currentPlace.id}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied! 📋');
    });
  };

  // ===== HASH ROUTING =====
  function checkHash() {
    const hash = location.hash.slice(1);
    if (hash) {
      const place = allPlaces.find(p => p.id === hash);
      if (place) {
        setTimeout(() => openPlace(hash), 300);
      }
    }
  }

  window.addEventListener('hashchange', checkHash);

  // ===== START =====
  init().then(checkHash);
})();
