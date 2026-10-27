// Pixel Party - shared helpers for player names and 1 / 2 player mode, used by the menu and every game.
// Loaded with a plain <script src> tag. (Not type="module": modules are blocked
// when you open a page by double-clicking it, because of file:// security rules.)
const Players = (() => {
  const MAX_LEN = 8;
  const DEFAULTS = ['P1', 'P2'];
  const STORAGE_KEY = 'pixelParty.names';
  const SETUP_KEY = 'pixelParty.setup';
  // 1 player mode: player 2 is the computer, called "CPU". Its level travels in the
  // page address too: ?p1=VIRAJ&cpu=normal (2 players: ?p1=VIRAJ&p2=KASUN)
  const CPU_NAME = 'CPU';
  const LEVELS = ['easy', 'normal', 'hard'];

  // Forgiving clean-up for names that arrive from outside (page URL, storage):
  // uppercase, drop anything that is not A-Z or 0-9, cut to 8, fall back to P1/P2.
  function clean(raw, index) {
    const name = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_LEN);
    return name || DEFAULTS[index];
  }

  // Reads ?p1=VIRAJ&p2=KASUN from the current page address.
  // Returns null if the address has no names in it.
  function fromURL() {
    const q = new URLSearchParams(location.search);
    if (!q.has('p1') && !q.has('p2')) return null;
    if (cpuFromURL()) return [clean(q.get('p1'), 0), CPU_NAME];
    return [clean(q.get('p1'), 0), clean(q.get('p2'), 1)];
  }

  // 1 player mode? Returns the CPU level from the address ('easy', 'normal', 'hard'),
  // or null when two people are playing.
  function cpuFromURL() {
    const v = new URLSearchParams(location.search).get('cpu');
    return LEVELS.includes(v) ? v : null;
  }

  // Builds "?p1=VIRAJ&p2=KASUN" (or "?p1=VIRAJ&cpu=normal") to put on the end of a link.
  function toQuery(names, cpu) {
    const first = '?p1=' + encodeURIComponent(names[0]);
    return cpu ? first + '&cpu=' + cpu : first + '&p2=' + encodeURIComponent(names[1]);
  }

  // localStorage can be blocked (private mode, strict settings), and then
  // using it throws an error. try/catch means the game just carries on without it.
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved)) return [clean(saved[0], 0), clean(saved[1], 1)];
    } catch (e) { /* storage blocked or broken: ignore */ }
    return null;
  }
  function save(names) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(names)); } catch (e) { /* ignore */ }
  }
  // 1 or 2 players and the CPU level, remembered for next time: { solo: true/false, level: 'normal' }
  function loadSetup() {
    try {
      const s = JSON.parse(localStorage.getItem(SETUP_KEY));
      if (s) return { solo: !!s.solo, level: LEVELS.includes(s.level) ? s.level : 'normal' };
    } catch (e) { /* ignore */ }
    return { solo: false, level: 'normal' };
  }
  function saveSetup(setup) {
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch (e) { /* ignore */ }
  }

  return { MAX_LEN, DEFAULTS, CPU_NAME, LEVELS, clean, fromURL, cpuFromURL, toQuery, load, save, loadSetup, saveSetup };
})();
