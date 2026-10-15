/* Трава — всё поведение сайта, версия 2.
   Сверху интерфейс: меню из трёх ярлыков, карусель проектов, граф экспериментов, панель.
   Ниже 3D: небо, земля, трава, горы, цветы, камера, божья коровка. Внизу — запуск. */
'use strict';

// ========== общее ==========

const stage = document.getElementById('stage');

// в системе включено «уменьшить движение» — не возим камеру и не качаем траву
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

// общее состояние сайта: его читают и меню, и 3D-сцена
const state = {
  view: 'top',                   // 'top' — смотрим сверху, 'low' — с луга
  sceneReady: false,             // 3D запустилось и нарисовало первый кадр
  cameraMoves: false,            // камера умеет опускаться сама
  wind: { speed: 4, from: 270 }, // ветер: метры в секунду и откуда дует (270° — с запада)
  open: null,                    // открытый раздел под ярлыками: 'projects', 'lab' или null
  scape: 'field',                // пейзаж: 'field' — поле у моря, 'alps' — горы с озером
};

// помощники: смешать два числа, удержать число в рамках, плавная «ступенька» от 0 до 1
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// кривая для «наезда»: быстрый старт и долгое мягкое торможение
const EASE_OUT = 'cubic-bezier(0.16, 0.84, 0.26, 1)';

// ========== часы и ветер Петербурга ==========

const clock = document.getElementById('clock');
const windLine = document.getElementById('wind');
const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' });

function tick() {
  const now = new Date();
  clock.textContent = `Петербург ${timeFormat.format(now)} · ${dateFormat.format(now)}`;
}

const WIND_URL = 'https://api.open-meteo.com/v1/forecast?latitude=59.94&longitude=30.31'
  + '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms';
const SIDES = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];

async function loadWind() {
  try {
    const response = await fetch(WIND_URL);
    if (!response.ok) return;
    const data = await response.json();
    const speed = data.current.wind_speed_10m;
    const from = data.current.wind_direction_10m;
    if (typeof speed !== 'number' || typeof from !== 'number') return;
    state.wind = { speed, from };
    windLine.textContent = `ветер ${Math.round(speed)} м/с, ${SIDES[Math.round(from / 45) % 8]}`;
    windLine.hidden = false;
  } catch (error) {
    // нет сети или запросы закрыты — трава качается от ветра по умолчанию
  }
}

// ========== меню: три ярлыка ==========

const cats = [...document.querySelectorAll('.cat')];
const hint = document.getElementById('hint');
const upButton = document.getElementById('up');
const scapeButton = document.getElementById('scape');
const shelf = document.getElementById('shelf');
const lab = document.getElementById('lab');

let menuShown = false;
let focusMenuOnShow = false;

const catOf = (name) => cats.find((cat) => cat.dataset.open === name);
const panelOf = (name) => (name === 'projects' ? shelf : lab);

// ярлыки стоят посередине экрана. Когда раздел открыт, они уезжают наверх, в небо,
// а раздел встаёт по центру чуть выше горизонта: нижний край карточек еле касается травы.
// Здесь считаем, на сколько опустить ряд в покое и на сколько опустить открытый раздел
const xmb = document.querySelector('.xmb');
const xmbRow = xmb.querySelector('.xmb__row');
// границы самого текста внутри элемента: ячейка сетки и абзацы шире текста, поэтому меряем строки
function textBox(el) {
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let box = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (!r.width) continue;
    box = box
      ? { left: Math.min(box.left, r.left), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
      : { left: r.left, right: r.right, bottom: r.bottom };
  }
  return box;
}

function placeMenu() {
  // где верх ряда без сдвига: offsetTop не учитывает сдвиг, складываем по цепочке родителей
  let top = 0;
  for (let el = xmbRow; el; el = el.offsetParent) top += el.offsetTop;
  const rowH = xmbRow.offsetHeight;
  xmb.style.setProperty('--lift', `${Math.round(Math.max(0, innerHeight * 0.47 - top - rowH / 2))}px`);

  const panel = state.open ? panelOf(state.open) : null;
  if (!panel || panel.hidden) return;
  // раздел начинается сразу под ярлыками; опускаться ему можно до нижних углов
  const start = top + rowH + (parseFloat(getComputedStyle(xmb).rowGap) || 0);
  const floor = Math.min(...[...document.querySelectorAll('.corner--bl, .corner--br')].map((el) => el.getBoundingClientRect().top), innerHeight) - 8;
  const grass = grassLine() * innerHeight;           // где на экране начинается трава (это считает 3D-сцена)
  // если места мало, ярлыки поднимаются выше — но не залезают на надписи в верхних углах
  const row = xmbRow.getBoundingClientRect();
  const corners = [...document.querySelectorAll('.corner--tl, .corner--tr')].map(textBox).filter(Boolean);
  const clash = corners.some((c) => c.right > row.left - 40 && c.left < row.right + 40);
  const ceiling = clash ? Math.max(...corners.map((c) => c.bottom)) + 10 : 14;
  const need = panel === shelf ? start - (grass - cards[0].offsetHeight) : start - (grass - 234);
  const rise = clamp(need, 0, Math.max(0, top - ceiling));
  xmb.style.setProperty('--lift-open', `${-Math.round(rise)}px`);
  const from = start - rise;
  if (panel === shelf) {
    // карточки опускаем, пока их нижний край не коснётся травы
    const drop = Math.min(grass - cards[0].offsetHeight - from, floor - from - shelf.offsetHeight);
    shelf.style.marginTop = `${Math.round(Math.max(0, drop))}px`;
  } else {
    // граф занимает всё небо между ярлыками и травой (подсказка внизу ложится на траву)
    const h = clamp(grass - from + 26, Math.min(260, floor - from), Math.min(460, floor - from));
    lab.style.height = `${Math.round(h)}px`;
  }
}
addEventListener('resize', placeMenu);
if (document.fonts) document.fonts.ready.then(placeMenu);   // со шрифтом подписи чуть другой высоты

// с клавиатуры в ряд ярлыков попадаем одной клавишей Tab, дальше — стрелками
function rove(k) {
  cats.forEach((cat, i) => { cat.tabIndex = i === k ? 0 : -1; });
}

function showMenu(on) {
  if (menuShown === on) return;
  menuShown = on;
  stage.classList.toggle('menu-on', on);
  if (on && focusMenuOnShow) {
    focusMenuOnShow = false;
    cats[0].focus();
  }
}

// вниз, на луг
function goLow() {
  if (state.view === 'low') return;
  state.view = 'low';
  stage.classList.replace('is-top', 'is-low');
  hint.hidden = true;
  upButton.hidden = false;
  scapeButton.hidden = !state.sceneReady;
  // если камера умеет ехать, меню покажет она, когда почти опустится; иначе — сразу
  if (!state.cameraMoves || calm) showMenu(true);
}

// обратно наверх
function goTop() {
  if (state.view === 'top') return;
  closeSection(true);
  state.view = 'top';
  stage.classList.replace('is-low', 'is-top');
  showMenu(false);
  upButton.hidden = true;
  scapeButton.hidden = true;
  hint.hidden = false;
}
upButton.addEventListener('click', goTop);

// раскрыть под ярлыком его раздел: карусель проектов или граф экспериментов
function openSection(name) {
  if (state.open === name) return;
  closeSection(true);
  const cat = catOf(name);
  const panel = panelOf(name);
  const glass = cat.querySelector('.glass');
  if (panel.closing) { panel.closing.cancel(); panel.closing = null; }
  state.open = name;
  panel.hidden = false;
  placeMenu();                      // где встанет раздел — считаем до того, как меню поедет
  stage.classList.add('has-open');
  cat.classList.add('is-open');
  cat.setAttribute('aria-expanded', 'true');
  if (name === 'projects') shelfOpened(); else labOpened(glass);
  burst(glass);
  if (!calm) zoomIn(panel, glass);
  icoRefresh();
}

function closeSection(instant) {
  const name = state.open;
  if (!name) return;
  state.open = null;
  const cat = catOf(name);
  const panel = panelOf(name);
  stage.classList.remove('has-open');
  cat.classList.remove('is-open');
  cat.setAttribute('aria-expanded', 'false');
  icoRefresh();
  const done = () => {
    panel.closing = null;
    panel.hidden = true;
    if (name === 'lab') labClosed();
  };
  if (instant || calm) { done(); return; }
  panel.closing = panel.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.92) translateY(-12px)' }],
    { duration: 240, easing: 'ease-in' },
  );
  panel.closing.onfinish = done;
}

cats.forEach((cat, k) => {
  cat.addEventListener('click', () => {
    rove(k);
    const name = cat.dataset.open;
    if (name === 'about') openSheet('me', cat.querySelector('.glass'));
    else if (state.open === name) closeSection();
    else openSection(name);
  });
});

// клик по пустому месту: сверху — спуститься на луг, внизу — свернуть открытый раздел.
// Просто водить курсором можно сколько угодно: вид меняется только по клику
let pressAt = null;
stage.addEventListener('pointerdown', (event) => { pressAt = { x: event.clientX, y: event.clientY }; }, true);
const wasDrag = (event) => pressAt && Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > 8;

stage.addEventListener('click', (event) => {
  if (wasDrag(event) || event.target.closest('button, a, .shelf, .lab')) return;
  if (state.view === 'top') goLow();
  else if (state.open) closeSection();
});

// клавиатура как у приставки: ←/→ — ярлыки, Enter — открыть, ↓ — внутрь раздела, Esc — свернуть
addEventListener('keydown', (event) => {
  if (sheet.open || event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key;
  if (state.view === 'top') {
    if (key === 'Enter' || key === ' ' || key === 'ArrowDown') {
      event.preventDefault();
      focusMenuOnShow = true;
      goLow();
    }
    return;
  }
  if (!menuShown) return;
  if (key === 'Escape' && state.open) {
    event.preventDefault();
    const cat = catOf(state.open);
    closeSection();
    cat.focus();
    return;
  }
  const k = cats.indexOf(document.activeElement);
  if (k < 0) return;
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    event.preventDefault();
    const next = clamp(k + (key === 'ArrowRight' ? 1 : -1), 0, cats.length - 1);
    rove(next);
    cats[next].focus();
  } else if (key === 'ArrowDown' && state.open) {
    event.preventDefault();
    if (state.open === 'projects') focusFrontCard(); else focusFirstNode();
  }
});

// ========== «наезд», как на приставке ==========

// копия ярлыка летит на зрителя и тает — как обложка игры, когда её запускаешь
function burst(glass) {
  if (calm || !glass) return;
  const box = glass.getBoundingClientRect();
  const ghost = glass.cloneNode(true);
  ghost.classList.add('ghost');
  Object.assign(ghost.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  document.body.append(ghost);
  ghost.animate(
    [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(3.2)', opacity: 0 }],
    { duration: 720, easing: EASE_OUT },
  ).onfinish = () => ghost.remove();
}

// раздел или панель вырастает из того, по чему нажали, и наезжает на зрителя:
// в начале он размером с ярлык и стоит на его месте, в конце — на своём месте во весь размер
function zoomIn(el, origin) {
  const from = origin.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const s = Math.max(from.width / box.width, 0.05);
  const dx = from.left + from.width / 2 - (box.left + box.width / 2);
  const dy = from.top + from.height / 2 - (box.top + box.height / 2);
  return el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 },
      { opacity: 1, offset: 0.3 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 700, easing: EASE_OUT },
  );
}

// ========== панель: белый лист на 80% экрана ==========

const sheet = document.getElementById('sheet');
const sheetBody = document.getElementById('sheet-body');

// панель с текстом из <template id="sheet-…"> вырастает из того, по чему нажали
function openSheet(name, origin) {
  const template = document.getElementById('sheet-' + name);
  if (!template || sheet.open) return;
  sheetBody.replaceChildren(template.content.cloneNode(true));
  const title = sheetBody.querySelector('h2');
  if (title) title.id = 'sheet-title';
  sheet.showModal();
  const text = sheetBody.querySelector('.sheet__text');
  if (text) text.scrollTop = 0;
  // пока панель открыта, 3D за ней стоит на паузе (sceneRunning — в разделе про 3D)
  const pause = () => { if (sheet.open && !sheet.closing) sceneRunning(false); };
  if (calm || !origin) { pause(); return; }
  if (origin.classList.contains('glass')) burst(origin);
  zoomIn(sheet, origin).finished.then(pause, () => {});
  sheetBody.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
}

function closeSheet() {
  if (!sheet.open || sheet.closing) return;
  sceneRunning(true);
  if (calm) { sheet.close(); return; }
  sheet.closing = sheet.animate(
    [{ transform: 'none', opacity: 1 }, { transform: 'scale(0.94)', opacity: 0 }],
    { duration: 200, easing: 'ease-in' },
  );
  sheet.closing.onfinish = () => {
    sheet.closing = null;
    sheet.close();
  };
}

// как бы панель ни закрылась, 3D оживает
sheet.addEventListener('close', () => sceneRunning(true));
document.getElementById('sheet-close').addEventListener('click', closeSheet);
// клик по затемнению вокруг панели тоже закрывает её
sheet.addEventListener('click', (event) => {
  if (event.target === sheet) closeSheet();
});
// Esc закрывает панель — но красиво, с анимацией
sheet.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeSheet();
});

// ========== проекты: карусель по кругу ==========

const ring = document.getElementById('ring');
const cards = [...ring.querySelectorAll('.card')];
const shelfDots = document.getElementById('shelf-dots');
const STEP = 34;          // угол между соседними карточками, в градусах
let ringPos = 0;          // где карусель сейчас: номер карточки по центру, дробный
let ringGoal = 0;         // куда она едет
let ringRaf = 0;
let ringLast = 0;
let cardW = 300;
let ringDrag = null;
let ringDragged = false;
let wheelSnap = 0;
let wheelLock = false;

cards.forEach(() => shelfDots.append(document.createElement('span')));

// карточки стоят на боку цилиндра: центральная смотрит на нас, боковые уходят назад и разворачиваются
function ringLayout() {
  const radius = (cardW * 0.98) / Math.sin((STEP * Math.PI) / 180);
  const front = clamp(Math.round(ringPos), 0, cards.length - 1);
  cards.forEach((card, i) => {
    const angle = (i - ringPos) * STEP;
    const a = (angle * Math.PI) / 180;
    const far = Math.abs(angle);
    const x = radius * Math.sin(a);
    const z = radius * (Math.cos(a) - 1);
    card.style.transform = `translate3d(${x.toFixed(1)}px, 0, ${z.toFixed(1)}px) rotateY(${angle.toFixed(2)}deg)`;
    card.style.opacity = clamp(1.5 - far / (STEP * 1.6), 0, 1).toFixed(3);
    card.style.zIndex = String(100 - Math.round(far));
    card.style.visibility = far > STEP * 2.5 ? 'hidden' : 'visible';
    card.classList.toggle('is-front', i === front);
    card.tabIndex = i === front ? 0 : -1;
  });
  [...shelfDots.children].forEach((dot, i) => dot.classList.toggle('is-on', i === front));
}

function ringTick(now) {
  const dt = Math.min((now - ringLast) / 1000, 0.05);
  ringLast = now;
  ringPos += (ringGoal - ringPos) * (1 - Math.exp(-dt * 10));
  if (Math.abs(ringGoal - ringPos) < 0.0005) ringPos = ringGoal;
  ringLayout();
  ringRaf = ringPos === ringGoal ? 0 : requestAnimationFrame(ringTick);
}

// повернуть карусель; snap — встать ровно на ближайшую карточку
function ringTo(goal, snap) {
  const last = cards.length - 1;
  ringGoal = snap ? clamp(Math.round(goal), 0, last) : clamp(goal, -0.35, last + 0.35);
  if (calm) {
    ringPos = ringGoal;
    ringLayout();
    return;
  }
  if (!ringRaf) {
    ringLast = performance.now();
    ringRaf = requestAnimationFrame(ringTick);
  }
}

function shelfOpened() {
  cardW = cards[0].offsetWidth || 300;    // ширина карточки на этом экране
  ringLayout();
}

function focusFrontCard() {
  cards[clamp(Math.round(ringGoal), 0, cards.length - 1)].focus({ preventScroll: true });
}

// клик по боковой карточке поворачивает к ней карусель, по центральной — открывает проект
cards.forEach((card, i) => {
  card.addEventListener('click', () => {
    if (ringDragged) return;
    if (i !== Math.round(ringGoal)) { ringTo(i, true); return; }
    openSheet(card.dataset.sheet, card);
  });
});

ring.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    ringTo(Math.round(ringGoal) + (event.key === 'ArrowRight' ? 1 : -1), true);
    focusFrontCard();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    catOf('projects').focus();
  }
});

// колесо мыши и тачпад: пока открыты проекты, прокрутка вращает карусель
stage.addEventListener('wheel', (event) => {
  if (state.open !== 'projects' || sheet.open) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1;
  const d = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
  clearTimeout(wheelSnap);
  if (Math.abs(d) >= 50) {
    // колесо щёлкает крупными шагами — по одной карточке за щелчок
    if (!wheelLock) {
      wheelLock = true;
      setTimeout(() => { wheelLock = false; }, 220);
      ringTo(Math.round(ringGoal) + Math.sign(d), true);
    }
    return;
  }
  // тачпад шлёт много мелких шагов — едем плавно, потом встаём на ближайшую карточку
  ringTo(ringGoal + d / 240);
  wheelSnap = setTimeout(() => ringTo(ringGoal, true), 140);
}, { passive: false });

// мышью или пальцем: потянуть карусель за любую карточку
ring.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  ringDrag = { id: event.pointerId, x: event.clientX, from: ringGoal, moved: false, lastX: event.clientX, lastT: event.timeStamp, v: 0 };
});
ring.addEventListener('pointermove', (event) => {
  const d = ringDrag;
  if (!d || event.pointerId !== d.id) return;
  const dx = event.clientX - d.x;
  if (!d.moved) {
    if (Math.abs(dx) < 6) return;
    d.moved = true;
    ring.setPointerCapture(event.pointerId);
  }
  const last = cards.length - 1;
  let goal = d.from - dx / (cardW * 0.98);
  if (goal < 0) goal /= 3;                                // за краем карусель тянется туго, как резинка
  else if (goal > last) goal = last + (goal - last) / 3;
  ringGoal = goal;
  ringPos = goal;
  ringLayout();
  d.v = (event.clientX - d.lastX) / Math.max(event.timeStamp - d.lastT, 1);
  d.lastX = event.clientX;
  d.lastT = event.timeStamp;
});
function ringRelease(event) {
  const d = ringDrag;
  if (!d || event.pointerId !== d.id) return;
  ringDrag = null;
  if (!d.moved) return;
  // клик, которым закончилось перетаскивание, карточку не открывает
  ringDragged = true;
  setTimeout(() => { ringDragged = false; }, 0);
  ringTo(ringGoal - (d.v * 160) / (cardW * 0.98), true);   // бросок: чем быстрее вели, тем дальше уедет
}
ring.addEventListener('pointerup', ringRelease);
ring.addEventListener('pointercancel', ringRelease);

// ========== эксперименты: граф, как в Obsidian ==========

const labSvg = lab.querySelector('.lab__links');
const nodes = [...lab.querySelectorAll('.node')].map((el, i) => ({
  el, id: el.dataset.id, r: 10, half: 10, below: 10, x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0, phase: i * 1.9 + 0.4,
}));
const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
const links = lab.dataset.links.split(/\s+/).filter(Boolean).map((pair) => {
  const [a, b] = pair.split(':');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  labSvg.append(line);
  return { a: nodeById[a], b: nodeById[b], line };
});
const labButtons = nodes.filter((n) => n.el.dataset.sheet).map((n) => n.el);
let labW = 0;
let labH = 0;
let labRaf = 0;
let labLast = 0;
let labClock = 0;
let labAge = 0;           // сколько секунд граф открыт: сначала узлы разлетаются свободно
let labPointer = null;    // где курсор внутри графа
let labDrag = null;       // какой узел тащим

function measureLab() {
  labW = lab.clientWidth;
  labH = lab.clientHeight;
  for (const n of nodes) {
    n.r = n.el.offsetWidth / 2;
    // подпись висит под кружком и бывает шире его: её тоже держим внутри графа
    const label = n.el.querySelector('.node__label');
    n.half = Math.max(n.r, label ? label.offsetWidth / 2 : 0);
    n.below = label ? label.offsetTop + label.offsetHeight - n.r : n.r;
  }
}

// узлы вылетают из ярлыка и разбегаются по своим местам
function labOpened(origin) {
  measureLab();
  const box = lab.getBoundingClientRect();
  const from = origin.getBoundingClientRect();
  const ox = from.left + from.width / 2 - box.left;
  const oy = from.top + from.height / 2 - box.top;
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 + 0.7;
    n.x = ox + Math.cos(a) * 4;
    n.y = oy + Math.sin(a) * 4;
    n.vx = Math.cos(a) * 420;
    n.vy = Math.sin(a) * 300 + 300;
  });
  labAge = 0;
  if (calm) {
    // без движения: сразу считаем, где узлы успокоятся, и рисуем один раз
    for (let k = 0; k < 900; k++) labStep(1 / 60, false);
    labRender();
    return;
  }
  labLast = performance.now();
  cancelAnimationFrame(labRaf);
  labRaf = requestAnimationFrame(labTick);
}

function labClosed() {
  cancelAnimationFrame(labRaf);
  labRaf = 0;
  labPointer = null;
  labDrag = null;
  light(null);
}

function labTick(now) {
  const dt = Math.min((now - labLast) / 1000, 0.05);
  labLast = now;
  labStep(dt / 2, true);
  labStep(dt / 2, true);
  labRender();
  labRaf = requestAnimationFrame(labTick);
}

// одна «физическая» секунда графа: узлы отталкиваются, связи тянут как пружинки,
// всё слегка стягивается к центру, а курсор расталкивает узлы вокруг себя
function labStep(dt, alive) {
  labClock += dt;
  labAge += dt;
  const cx = labW / 2;
  const cy = labH * 0.45;
  for (const n of nodes) {
    n.fx = (cx - n.x) * 1.1;
    n.fy = (cy - n.y) * 1.7;
    if (alive) {
      // узлы немного бродят сами по себе
      n.fx += Math.sin(labClock * 0.6 + n.phase) * 30;
      n.fy += Math.cos(labClock * 0.47 + n.phase * 1.3) * 24;
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = 1; dy = 0.5; d2 = 1.25; }
      const d = Math.sqrt(d2);
      const f = Math.min(6e6 / d2, 5000);
      a.fx -= (f * dx) / d; a.fy -= (f * dy) / d;
      b.fx += (f * dx) / d; b.fy += (f * dy) / d;
    }
  }
  for (const { a, b } of links) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.max(Math.hypot(dx, dy), 1);
    const f = (d - (70 + (a.r + b.r) * 1.6)) * 9;
    a.fx += (f * dx) / d; a.fy += (f * dy) / d;
    b.fx -= (f * dx) / d; b.fy -= (f * dy) / d;
  }
  if (labPointer && !labDrag) {
    for (const n of nodes) {
      const dx = n.x - labPointer.x;
      const dy = n.y - labPointer.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const reach = 100 + n.r;
      if (d < reach) {
        const f = 900 * (1 - d / reach);
        n.fx += (f * dx) / d; n.fy += (f * dy) / d;
      }
    }
  }
  const damp = Math.exp(-3.2 * dt);
  for (const n of nodes) {
    if (labDrag && labDrag.node === n) continue;
    n.vx = (n.vx + n.fx * dt) * damp;
    n.vy = (n.vy + n.fy * dt) * damp;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    if (labAge > 0.5) {
      // стенки: узлы с подписями не уходят за края графа и не наезжают на подсказку снизу
      n.x = clamp(n.x, n.half + 6, labW - n.half - 6);
      n.y = clamp(n.y, n.r + 8, labH - n.below - 26);
    }
  }
}

function labRender() {
  for (const n of nodes) n.el.style.transform = `translate(${(n.x - n.r).toFixed(1)}px, ${(n.y - n.r).toFixed(1)}px)`;
  for (const { a, b, line } of links) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.max(Math.hypot(dx, dy), 1);
    const ux = dx / d;
    const uy = dy / d;
    line.setAttribute('x1', (a.x + ux * (a.r + 3)).toFixed(1));
    line.setAttribute('y1', (a.y + uy * (a.r + 3)).toFixed(1));
    line.setAttribute('x2', (b.x - ux * (b.r + 3)).toFixed(1));
    line.setAttribute('y2', (b.y - uy * (b.r + 3)).toFixed(1));
  }
}

// подсветить узел и его связи, остальное приглушить
function light(node) {
  lab.classList.toggle('is-focus', Boolean(node));
  const near = new Set(node ? [node] : []);
  for (const { a, b } of links) {
    if (a === node || b === node) { near.add(a); near.add(b); }
  }
  for (const n of nodes) n.el.classList.toggle('is-lit', near.has(n));
  for (const { a, b, line } of links) line.classList.toggle('is-lit', Boolean(node) && (a === node || b === node));
}

lab.addEventListener('pointermove', (event) => {
  const box = lab.getBoundingClientRect();
  labPointer = { x: event.clientX - box.left, y: event.clientY - box.top };
  const d = labDrag;
  if (!d || event.pointerId !== d.id) return;
  const dx = event.clientX - d.x0;
  const dy = event.clientY - d.y0;
  if (!d.moved && Math.hypot(dx, dy) > 5) d.moved = true;
  if (d.moved) {
    d.node.x = d.nx + dx;
    d.node.y = d.ny + dy;
    d.node.vx = 0;
    d.node.vy = 0;
    if (calm) labRender();
  }
});
lab.addEventListener('pointerleave', () => { labPointer = null; });
lab.addEventListener('pointerdown', (event) => {
  const el = event.target.closest('.node');
  if (!el || event.button !== 0) return;
  const node = nodes.find((n) => n.el === el);
  labDrag = { node, id: event.pointerId, x0: event.clientX, y0: event.clientY, nx: node.x, ny: node.y, moved: false };
  el.setPointerCapture(event.pointerId);
  light(node);
});
function labRelease(event) {
  const d = labDrag;
  if (!d || event.pointerId !== d.id) return;
  labDrag = null;
  // не тащили, а просто нажали — открываем эксперимент
  if (!d.moved && d.node.el.dataset.sheet) openSheet(d.node.el.dataset.sheet, d.node.el.querySelector('.node__dot'));
  if (event.pointerType !== 'mouse' || !d.node.el.matches(':hover')) light(null);
}
lab.addEventListener('pointerup', labRelease);
lab.addEventListener('pointercancel', labRelease);

for (const n of nodes) {
  n.el.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse' && !labDrag) light(n); });
  n.el.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse' && !labDrag) light(null); });
  n.el.addEventListener('focus', () => light(n));
  n.el.addEventListener('blur', () => light(null));
  // Enter с клавиатуры (у клика мышью detail больше нуля — его ловит pointerup)
  if (n.el.dataset.sheet) {
    n.el.addEventListener('click', (event) => {
      if (event.detail === 0) openSheet(n.el.dataset.sheet, n.el.querySelector('.node__dot'));
    });
  }
}

function focusFirstNode() {
  if (labButtons[0]) labButtons[0].focus();
}

lab.addEventListener('keydown', (event) => {
  const k = labButtons.indexOf(document.activeElement);
  if (k < 0) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    labButtons[(k + (event.key === 'ArrowRight' ? 1 : labButtons.length - 1)) % labButtons.length].focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    catOf('lab').focus();
  }
});

addEventListener('resize', () => {
  if (state.open === 'projects') shelfOpened();
  if (state.open === 'lab') measureLab();
});

// ========== значок экспериментов: кружки бродят ==========

const labCat = catOf('lab');
const icoDots = [...labCat.querySelectorAll('.ico circle')];
const icoLines = [...labCat.querySelectorAll('.ico line')];
const ICO_BASE = icoDots.map((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);
const ICO_PAIRS = [[0, 1], [1, 2], [0, 2]];
let icoHover = false;
let icoFocus = false;
let icoActive = false;
let icoAmp = 0;
let icoRaf = 0;
let icoLast = 0;
let icoTime = 0;

function icoTick(now) {
  const dt = Math.min((now - icoLast) / 1000, 0.05);
  icoLast = now;
  icoTime += dt;
  icoAmp += ((icoActive ? 1 : 0) - icoAmp) * (1 - Math.exp(-dt * 5));
  const pts = ICO_BASE.map(([x, y], i) => [
    x + icoAmp * (Math.sin(icoTime * (1.3 + i * 0.37) + i * 2.1) * 2.6 + Math.sin(icoTime * 2.9 + i) * 0.9),
    y + icoAmp * (Math.cos(icoTime * (1.1 + i * 0.29) + i * 1.3) * 2.6 + Math.cos(icoTime * 2.3 + i * 2) * 0.9),
  ]);
  pts.forEach(([x, y], i) => {
    icoDots[i].setAttribute('cx', x.toFixed(2));
    icoDots[i].setAttribute('cy', y.toFixed(2));
  });
  ICO_PAIRS.forEach(([a, b], k) => {
    const [x1, y1] = pts[a];
    const [x2, y2] = pts[b];
    const d = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / d;
    const uy = (y2 - y1) / d;
    icoLines[k].setAttribute('x1', (x1 + ux * 4.1).toFixed(2));
    icoLines[k].setAttribute('y1', (y1 + uy * 4.1).toFixed(2));
    icoLines[k].setAttribute('x2', (x2 - ux * 4.1).toFixed(2));
    icoLines[k].setAttribute('y2', (y2 - uy * 4.1).toFixed(2));
  });
  icoRaf = icoActive || icoAmp > 0.002 ? requestAnimationFrame(icoTick) : 0;
}

// кружки двигаются, пока на ярлык навели, выбрали его с клавиатуры или открыли граф
function icoRefresh() {
  icoActive = !calm && (icoHover || icoFocus || state.open === 'lab');
  if (icoActive && !icoRaf) {
    icoLast = performance.now();
    icoRaf = requestAnimationFrame(icoTick);
  }
}
labCat.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') { icoHover = true; icoRefresh(); } });
labCat.addEventListener('pointerleave', () => { icoHover = false; icoRefresh(); });
labCat.addEventListener('focus', () => { icoFocus = true; icoRefresh(); });
labCat.addEventListener('blur', () => { icoFocus = false; icoRefresh(); });

// ========== 3D: загрузка, небо и земля ==========

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

// телефон или планшет: травы сажаем меньше, картинку считаем мельче
const phone = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

// цвета сцены: меняйте здесь (цвета второго пейзажа — в разделе «пейзажи»)
const COLORS = {
  grassBase: '#163a0e',   // трава у земли
  grassMid: '#3b7a1c',    // середина травинки
  grassTip: '#b0d64e',    // кончики
  grassDry: '#d2c468',    // сухие травинки и пятна
  ground: '#10260b',      // земля в тени травы
  groundLight: '#1f4216',
  groundFar: '#4c8526',   // так поле выглядит издалека
  horizon: '#e2f0f7',     // небо у горизонта
  sky: '#79b4e0',         // небо посередине
  zenith: '#2a5ca9',      // небо над головой
  haze: '#d3e8f1',        // дымка, в которой тонет дальнее поле
  sun: '#fff1d2',
  cloudShade: '#cfdae7',  // облака снизу, в тени
  sand: '#e6d6ab',        // пляж
  sea: '#1f5d78',         // толща воды
  seaShallow: '#6fc8c0',  // дно у берега сквозь воду
  seaDeep: '#1d5c78',     // дно в глубине
};

// общий кусок шейдеров: «шум» — плавные случайные пятна, из них сделаны порывы, облака и земля
const NOISE = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

// дымка: чем дальше точка, тем больше её цвет уходит в цвет воздуха. Где она начинается
// и густеет, задают uFogNear и uFogFar; uMist — туман, который накрывает всё при смене пейзажа
const FOG = /* glsl */ `
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogMax;
  uniform float uMist;

  float hazeAt(float dist) {
    // туман густой: в самый плотный момент уже в нескольких метрах всё белое
    return max(uFogMax * smoothstep(uFogNear, uFogFar, dist), uMist * (1.0 - exp(-dist / 3.2)));
  }
`;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;

  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// небо: градиент от горизонта к зениту, облака, которые плывут по ветру, солнце
const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uSky;
  uniform vec3 uZenith;
  uniform vec3 uHaze;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec2 uCloudFlow;    // насколько облака уплыли по ветру
  uniform float uCloudy;      // 0 — редкие белые облака, 1 — плотные, с тенью снизу
  uniform vec3 uCloudShade;   // цвет облака в тени
  uniform float uMist;        // туман при смене пейзажа
  varying vec3 vDir;

  ${NOISE}

  float clouds(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 color = mix(uHorizon, uSky, smoothstep(0.0, 0.22, y));
    color = mix(color, uZenith, smoothstep(0.22, 0.9, y));

    if (y > 0.0) {
      vec2 p = d.xz / (y + 0.1) * 0.8 - uCloudFlow;
      float c = clouds(p);
      float edge = mix(0.52, 0.45, uCloudy);
      float amount = smoothstep(edge, edge + 0.26, c) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.5, 0.85, y));
      // свет: край облака, обращённый к солнцу, светлее, глубина и низ — темнее
      vec2 toSun = normalize(uSunDir.xz + vec2(0.0001));
      float lit = clamp(0.66 + (c - clouds(p + toSun * 0.2)) * 4.0 - (c - edge) * 0.8 * uCloudy, 0.0, 1.0);
      vec3 cloud = mix(uCloudShade, vec3(1.0), lit);
      color = mix(color, cloud, amount * 0.92);
    }

    float sun = max(dot(d, uSunDir), 0.0);
    color += uSunColor * (pow(sun, 900.0) * 1.4 + pow(sun, 24.0) * 0.32 + pow(sun, 4.0) * 0.1);
    color = mix(color, uHaze, 1.0 - smoothstep(-0.04, 0.015, y));
    color = mix(color, uHaze, uMist * (1.0 - 0.3 * smoothstep(0.15, 0.9, y)));
    gl_FragColor = vec4(min(color, vec3(1.0)), 1.0);
  }
`;

let THREE = null;           // сама библиотека — появится, когда загрузится
let renderer = null;        // художник: рисует сцену на холсте
let scene = null;           // всё, что есть в 3D-мире
let camera = null;          // откуда смотрим
let common = null;          // настройки шейдеров, общие для травы, цветов и земли
let sunDir = null;          // куда смотреть, чтобы увидеть солнце
let sky = null;
let skyUniforms = null;     // настройки неба: их меняют облака и пейзажи
let time = 12;              // «часы» ветра в секундах
let last = 0;               // когда был прошлый кадр
let raf = 0;                // номер заказанного кадра

const sceneParts = [];      // что построить, когда three.js загрузится
const everyFrame = [];      // что делать в каждом кадре

// небо — огромный шар вокруг камеры, раскрашенный изнутри
function buildSky() {
  skyUniforms = {
    uHaze: common.uHaze,
    uHorizon: { value: new THREE.Color(COLORS.horizon) },
    uSky: { value: new THREE.Color(COLORS.sky) },
    uZenith: { value: new THREE.Color(COLORS.zenith) },
    uSunColor: { value: new THREE.Color(COLORS.sun) },
    uSunDir: { value: sunDir },
    uCloudFlow: { value: new THREE.Vector2(0, 0) },
    uCloudy: { value: 0 },
    uCloudShade: { value: new THREE.Color(COLORS.cloudShade) },
    uMist: common.uMist,
  };
  sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  // шар всегда вокруг камеры, куда бы она ни уехала
  everyFrame.push(() => sky.position.copy(camera.position));
}

sceneParts.push(buildSky);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

async function startScene() {
  THREE = await import(THREE_URL);
  THREE.ColorManagement.enabled = false;   // цвета из кода попадают на экран как есть

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('scene'),
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.5 : 1.75));
  let shaderFailed = false;
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    shaderFailed = true;
    console.error(gl.getShaderInfoLog(vertexShader) || gl.getShaderInfoLog(fragmentShader));
  };

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.15, 1500);   // ближе 15 см и дальше 1,5 км не рисуем
  camera.position.set(0, 1.4, 11.5);   // стоим на лугу…
  camera.lookAt(0, 2.6, -8);           // …и смотрим вдаль, на горизонт

  // солнце справа, низко над горизонтом: светит сквозь траву и не слепит текст
  sunDir = new THREE.Vector3(0.5, 0.12, -0.86).normalize();

  // настройки, общие для травы, цветов и земли: меняются каждый кадр
  common = {
    uTime: { value: 0 },
    uFlow: { value: new THREE.Vector2() },          // насколько уплыли порывы
    uWind: { value: 0.45 },                         // сила ветра от 0 до 1
    uWindDir: { value: new THREE.Vector2(1, 0) },   // куда дует
    uPush: { value: new THREE.Vector3(0, 0, 999) }, // точка под курсором
    uPushRadius: { value: 1.6 },
    uPushAmount: { value: 0 },
    uFogNear: { value: 16 },                        // дымка: где начинается,
    uFogFar: { value: 80 },                         // где густеет
    uFogMax: { value: 1 },                          // и насколько густая
    uMist: { value: 0 },                            // туман при смене пейзажа
    uHaze: { value: new THREE.Color(COLORS.haze) },
  };

  for (const build of sceneParts) build();
  addEventListener('resize', resize);
  resize();

  // первый кадр готовим так же, как все остальные, и рисуем сразу:
  // если шейдер не собрался, покажем картинку вместо 3D
  for (const step of everyFrame) step(0, performance.now());
  renderer.render(scene, camera);
  if (shaderFailed) throw new Error('шейдер не собрался');

  state.sceneReady = true;
  stage.classList.add('is-ready');
  if (state.view === 'low') scapeButton.hidden = false;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

// цикл кадров: примерно 60 раз в секунду
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);   // сколько секунд прошло с прошлого кадра
  last = now;
  if (!calm) time += dt;
  common.uTime.value = time;
  for (const step of everyFrame) step(dt, now);
  renderer.render(scene, camera);
}

// пустить или остановить цикл кадров. Стоит он, когда вкладка свёрнута
// и когда открыта белая панель: сцена за ней размыта, а батарея целее
function sceneRunning(on) {
  if (!state.sceneReady) return;
  cancelAnimationFrame(raf);
  raf = 0;
  if (on && !document.hidden) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

// ========== земля: поле у моря и горное плато ==========

// Поле — большой остров: трава, за ней пляж и море до горизонта. Море видно с высоты, в виде сверху.
// В горах трава растёт на плато; за его краем обрыв, внизу долина с озером, вокруг горы —
// их вершины чуть ниже взгляда. Обе земли — сетки «по кругу»: кольца вокруг центра,
// частые там, где рельеф меняется, и редкие там, где ровно.

// шум для рельефа считаем в JavaScript один раз, когда строим сетку
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x, y, z) {
  const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
  const xf = x - xi; const yf = y - yi; const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf); const w = zf * zf * (3 - 2 * zf);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u); const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u); const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
// «гребни»: перевёрнутый шум даёт острые хребты, как у настоящих гор
function ridges(x, y, z) {
  let sum = 0;
  let amp = 0.55;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    const n = 1 - Math.abs(noise3(x * f, y * f, z * f) * 2 - 1);
    sum += n * n * amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum;
}
// шум по кругу: своё число для каждого направления, без шва
const ringNoise = (a, freq, seed) => noise3(Math.cos(a) * freq + seed, Math.sin(a) * freq + seed * 1.7, seed * 0.31);

// ---------- поле у моря ----------

const SEA_LEVEL = -0.7;

// от центра поля до кромки воды, в метрах, для направления a. Впереди берег ближе — его видно сверху
function coastRadius(a) {
  return 128 + 20 * Math.cos(a) + 26 * (ringNoise(a, 1.3, 3) - 0.5) + 10 * (ringNoise(a, 4.1, 9) - 0.5);
}

// высота земли у моря: ровный луг, пологий пляж и дно, которое уходит вглубь
function fieldHeight(x, z) {
  const t = Math.hypot(x, z) - coastRadius(Math.atan2(x, z));   // больше нуля — уже за линией берега
  if (t < -18) return 0;
  if (t < 0) return -1.1 * smoothstep(-18, 0, t);
  return -1.1 - Math.min(t * 0.09, 18);
}

// ---------- горы: плато над долиной ----------

const HC = { x: 0, z: 19 };              // центр плато: камера стоит у его переднего края
const VALLEY = 104;                      // насколько дно долины ниже плато
const LAKE_LEVEL = -112.5;               // уровень озера
const LAKE = { x: 0, z: -430, rx: 230, rz: 120 };

// радиус плато для направления a: край неровный, как у настоящего уступа
function plateauRadius(a) {
  return 14.5 + 4.4 * (ringNoise(a, 2.2, 4) - 0.5);
}

// 1 — точка на плато, 0 — за обрывом; у самого края трава постепенно сходит на нет
function alpsKeep(x, z) {
  const dx = x - HC.x;
  const dz = z - HC.z;
  return smoothstep(0, 1.4, plateauRadius(Math.atan2(dx, dz)) - Math.hypot(dx, dz));
}

function alpsHeight(x, z) {
  const dx = x - HC.x;
  const dz = z - HC.z;
  const r = Math.hypot(dx, dz);
  const a = Math.atan2(dx, dz);
  const s = r - plateauRadius(a);                    // сколько метров за краем плато
  if (s <= 0) return 0;
  let h = -VALLEY * (1 - Math.exp(-s / 42));         // обрыв, потом склон выполаживается в долину
  h += 8 * (noise3(x * 0.012 + 3, z * 0.012 - 2, 1.5) - 0.5) * smoothstep(60, 170, s);   // холмики на дне
  // озеро — впадина в долине прямо перед нами; берег неровный
  const la = Math.atan2(x - LAKE.x, z - LAKE.z);
  const q = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) + 0.24 * (ringNoise(la, 1.8, 6) - 0.5);
  h -= 18 * (1 - smoothstep(0.45, 1, q));
  // горы кольцом вокруг долины
  const ring = smoothstep(560, 720, r) * (1 - smoothstep(1260, 1430, r));
  if (ring > 0) {
    const u = Math.cos(a) * 3.1;
    const v = Math.sin(a) * 3.1;
    h += ring * (20 + 100 * Math.pow(ridges(u + 11, v + 7, r * 0.004), 1.5));
  }
  return h;
}

// ---------- сетка «по кругу» ----------

// ringCount колец по seg направлений; radiusAt(j, a) — радиус кольца j, heightAt(x, z) — высота
function polarGrid(cx, cz, ringCount, seg, radiusAt, heightAt) {
  const perRing = seg + 1;
  const pos = new Float32Array(ringCount * perRing * 3);
  let p = 0;
  for (let j = 0; j < ringCount; j++) {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const r = radiusAt(j, a);
      const x = cx + Math.sin(a) * r;
      const z = cz + Math.cos(a) * r;
      pos[p++] = x;
      pos[p++] = heightAt(x, z);
      pos[p++] = z;
    }
  }
  // треугольники обходим против часовой стрелки, если смотреть сверху: так земля «смотрит» вверх
  const index = new Uint32Array((ringCount - 1) * seg * 6);
  let k = 0;
  for (let j = 0; j < ringCount - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * perRing + i;
      const b = a + perRing;
      index[k++] = a; index[k++] = b; index[k++] = a + 1;
      index[k++] = a + 1; index[k++] = b; index[k++] = b + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  return geometry;
}

// ---------- шейдеры земли ----------

const LAND_VERTEX = /* glsl */ `
  varying vec3 vSpot;
  varying vec3 vNormal;

  void main() {
    vSpot = position;
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// общее для обеих земель: земля под травой, вблизи тёмная, вдали — цвета травы
const UNDER_GRASS = /* glsl */ `
  uniform vec3 uGround;
  uniform vec3 uGroundLight;
  uniform vec3 uGroundFar;
  uniform vec3 uShallow;
  uniform vec3 uDeep;

  vec3 underGrass(vec3 spot, float dist) {
    float n = noise(spot.xz * 0.4) * 0.6 + noise(spot.xz * 2.1) * 0.4;
    vec3 color = mix(uGround, uGroundLight, n);
    return mix(color, uGroundFar * (0.9 + 0.2 * n), smoothstep(12.0, 34.0, dist));
  }

  // под водой: у берега дно светлое бирюзовое, глубже — тёмное
  vec3 underWater(vec3 color, float depth) {
    color = mix(color, uShallow, smoothstep(-0.05, 1.3, depth) * 0.85);
    return mix(color, uDeep, smoothstep(1.2, 10.0, depth));
  }
`;

// поле: луг, песок у воды и дно моря
const FIELD_FRAGMENT = /* glsl */ `
  uniform vec3 uHaze;
  uniform vec3 uSand;
  uniform float uWaterLevel;
  varying vec3 vSpot;
  varying vec3 vNormal;

  ${NOISE}
  ${FOG}
  ${UNDER_GRASS}

  void main() {
    float dist = distance(vSpot, cameraPosition);
    vec3 color = underGrass(vSpot, dist);
    float y = vSpot.y;
    float n = noise(vSpot.xz * 0.3);
    vec3 sand = uSand * (0.9 + 0.14 * n);
    sand *= 1.0 - 0.2 * (1.0 - smoothstep(-0.75, -0.45, y));   // у самой воды песок мокрый и темнее
    color = mix(color, sand, 1.0 - smoothstep(-0.3, -0.03, y));
    color = underWater(color, uWaterLevel - y);
    gl_FragColor = vec4(mix(color, uHaze, hazeAt(dist)), 1.0);
  }
`;

// горы: плато под травой, обрыв, луга долины, берег озера, камень и снег на вершинах
const ALPS_FRAGMENT = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uHaze;
  uniform float uWaterLevel;
  uniform float uValley;
  uniform vec3 uPlateau;                  // центр плато (x, z) и до какого расстояния от него трава
  varying vec3 vSpot;
  varying vec3 vNormal;

  ${NOISE}
  ${FOG}
  ${UNDER_GRASS}

  void main() {
    vec3 n = normalize(vNormal);
    float steep = 1.0 - n.y;              // 0 — ровно, ближе к 1 — отвесно
    float y = vSpot.y;
    float hv = y + uValley;               // высота над дном долины
    float k = noise(vSpot.xz * 0.05) * 0.6 + noise(vSpot.xz * 0.23) * 0.4;
    float dist = distance(vSpot, cameraPosition);
    float fromPlateau = length(vSpot.xz - uPlateau.xy);
    float peaks = smoothstep(380.0, 560.0, fromPlateau);   // кольцо гор: там камень и снег по высоте

    // луга в долине пятнами: где темнее, где светлее
    float blot = noise(vSpot.xz * 0.012 + 4.0);
    vec3 meadow = mix(vec3(0.17, 0.33, 0.1), vec3(0.36, 0.49, 0.18), clamp(k * 0.7 + blot * 0.6 - 0.15, 0.0, 1.0));
    vec3 rock = mix(vec3(0.36, 0.34, 0.36), vec3(0.5, 0.46, 0.42), k);
    vec3 snow = vec3(0.97, 0.98, 1.0);
    float rocky = peaks * smoothstep(40.0, 72.0, hv + k * 20.0) + smoothstep(0.38, 0.62, steep);
    vec3 color = mix(meadow, rock, clamp(rocky, 0.0, 1.0));
    float snowLine = 88.0 + k * 22.0;
    color = mix(color, snow, peaks * smoothstep(snowLine, snowLine + 6.0, hv) * (1.0 - smoothstep(0.5, 0.75, steep)));
    // берег озера — светлая галька
    float shore = 1.0 - smoothstep(0.3, 1.5, abs(y - uWaterLevel - 0.6));
    color = mix(color, vec3(0.64, 0.61, 0.55) * (0.9 + 0.2 * k), shore * 0.75);
    color = underWater(color, uWaterLevel - y);

    // склон к солнцу тёплый и светлый, склон в тени — голубоватый: его подсвечивает небо
    float light = max(dot(n, normalize(uSunDir)), 0.0);
    color *= mix(vec3(0.34, 0.39, 0.48), uSunColor * 1.15, light);

    // плато под травой — та же земля, что на поле
    float onPlateau = step(-0.05, y) * (1.0 - step(0.25, steep)) * (1.0 - step(uPlateau.z, fromPlateau));
    color = mix(color, underGrass(vSpot, dist), onPlateau);
    gl_FragColor = vec4(mix(color, uHaze, hazeAt(dist)), 1.0);
  }
`;

// ---------- вода: море и озеро ----------

const WATER_VERTEX = /* glsl */ `
  uniform float uWaterLevel;
  varying vec3 vSpot;

  void main() {
    vec3 p = vec3(position.x, uWaterLevel, position.z);
    vSpot = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

// вода отражает небо — тем сильнее, чем более косо на неё смотрим, — блестит на солнце
// и слегка просвечивает: у берега видно светлое дно
const WATER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uHorizon;
  uniform vec3 uSky;
  uniform vec3 uZenith;
  uniform vec3 uHaze;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uWater;
  varying vec3 vSpot;

  ${NOISE}
  ${FOG}

  // волны — три слоя шума, каждый повёрнут, чтобы рябь не шла ровными полосами
  const mat2 TURN = mat2(0.8, -0.6, 0.6, 0.8);
  float waves(vec2 p) {
    float w = noise(p * 0.08 + vec2(uTime * 0.05, uTime * 0.031)) * 0.55;
    p = TURN * p;
    w += noise(p * 0.27 - vec2(uTime * 0.07, -uTime * 0.043)) * 0.3;
    p = TURN * p;
    w += noise(p * 0.71 + vec2(uTime * 0.11, uTime * 0.09)) * 0.15;
    return w;
  }

  void main() {
    vec3 toEye = cameraPosition - vSpot;
    float dist = length(toEye);
    vec3 v = toEye / dist;
    // наклон волн: разница высот в двух соседних точках. Вдали волны сглаживаем, чтобы не рябило
    vec2 q = vSpot.xz;
    float w = waves(q);
    vec3 n = normalize(vec3((w - waves(q + vec2(0.7, 0.0))) * 1.6, 1.0, (w - waves(q + vec2(0.0, 0.7))) * 1.6));
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(60.0, 480.0, dist)));
    float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 r = reflect(-v, n);
    r.y = abs(r.y);
    vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.22, r.y));
    sky = mix(sky, uZenith, smoothstep(0.22, 0.9, r.y));
    vec3 color = mix(uWater, sky, fresnel);
    float glint = pow(max(dot(r, normalize(uSunDir)), 0.0), 260.0);
    color += uSunColor * glint * 1.8;
    float haze = hazeAt(dist);
    float alpha = clamp(mix(0.5, 0.96, fresnel) + glint, 0.0, 1.0);
    gl_FragColor = vec4(mix(color, uHaze, haze), mix(alpha, 1.0, haze));
  }
`;

let fieldLand = null;
let alpsLand = null;
let water = null;
let landUniforms = null;    // общие настройки земли и воды: цвета дна, уровень воды

// поле у моря строим сразу: оно видно с первого кадра
function buildField() {
  landUniforms = {
    uGround: { value: new THREE.Color(COLORS.ground) },
    uGroundLight: { value: new THREE.Color(COLORS.groundLight) },
    uGroundFar: { value: new THREE.Color(COLORS.groundFar) },
    uSand: { value: new THREE.Color(COLORS.sand) },
    uShallow: { value: new THREE.Color(COLORS.seaShallow) },
    uDeep: { value: new THREE.Color(COLORS.seaDeep) },
    uWater: { value: new THREE.Color(COLORS.sea) },
    uWaterLevel: { value: SEA_LEVEL },
    uValley: { value: VALLEY },
  };
  // кольца: внутри поля — редкие (там ровно), у берега — частые, дальше в море — всё реже
  const radii = [0, 30, 60, 80];
  for (let r = 88; r < 185; r += phone ? 2.5 : 1.5) radii.push(r);
  for (let r = 185; r < 1450; r *= 1.07) radii.push(r);
  radii.push(1450);
  const geometry = polarGrid(0, 0, radii.length, phone ? 256 : 512, (j) => radii[j], fieldHeight);
  fieldLand = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: { ...common, ...landUniforms },
    vertexShader: LAND_VERTEX,
    fragmentShader: FIELD_FRAGMENT,
  }));
  fieldLand.frustumCulled = false;
  scene.add(fieldLand);

  // вода — огромный круг; где земля выше воды, его просто не видно
  water = new THREE.Mesh(
    new THREE.CircleGeometry(1450, 160).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { ...common, ...landUniforms, ...skyUniforms },
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      transparent: true,
      depthWrite: false,
    }),
  );
  water.frustumCulled = false;
  scene.add(water);
}

// горы строим, только когда их впервые попросили: так сайт быстрее открывается
function buildAlps() {
  const near = [0, 0.35, 0.6, 0.8, 0.93, 1];                   // доли радиуса плато
  const out = [0.6, 1.5, 2.8, 4.5, 6.5, 9, 12, 16, 21, 27, 34, 42, 51, 61, 72, 85, 100, 117, 136, 157, 180];
  for (let s = 196; s < 1430; s += phone ? 18 : 10) out.push(s);
  out.push(1430);
  const geometry = polarGrid(HC.x, HC.z, near.length + out.length, phone ? 360 : 720, (j, a) => {
    const edge = plateauRadius(a);
    return j < near.length ? edge * near[j] : edge + out[j - near.length];
  }, alpsHeight);
  alpsLand = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: {
      ...common,
      ...landUniforms,
      uSunDir: skyUniforms.uSunDir,
      uSunColor: skyUniforms.uSunColor,
      uPlateau: { value: new THREE.Vector3(HC.x, HC.z, 24) },
    },
    vertexShader: LAND_VERTEX,
    fragmentShader: ALPS_FRAGMENT,
  }));
  alpsLand.frustumCulled = false;
  alpsLand.visible = false;
  scene.add(alpsLand);
}

sceneParts.push(buildField);

// ========== трава ==========

// травинка: каждая вершина считает, куда её гнут ветер и курсор
const GRASS_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec2 uFlow;
  uniform float uWind;
  uniform vec2 uWindDir;
  uniform vec3 uPush;
  uniform float uPushRadius;
  uniform float uPushAmount;
  uniform vec2 uSunFlat;
  uniform float uAlps;      // 1 — горы: трава растёт только на плато
  uniform vec2 uLowSpot;    // где стоит камера на лугу
  uniform float uLowness;   // 0 — камера сверху, 1 — на лугу

  attribute vec4 aInst;   // x, z, поворот, случайное число
  attribute vec3 aShape;  // высота, ширина, сухость
  attribute float aAlps;  // 1 — травинка на плато, 0 — за обрывом

  varying float vHeight;
  varying float vDry;
  varying float vLight;
  varying float vFog;

  ${NOISE}
  ${FOG}

  void main() {
    float h = position.y;               // 0 у корня, 1 на кончике
    vec2 root = aInst.xy;
    float turn = aInst.z;
    float rnd = aInst.w;
    float keep = mix(1.0, aAlps, uAlps);   // в горах травинки за обрывом исчезают
    // у самой камеры на лугу трава ниже, чтобы не заслонять вид; сверху — обычная
    float atCamera = 0.2 + 0.8 * smoothstep(0.3, 3.0, distance(root, uLowSpot));
    float height = aShape.x * keep * mix(1.0, atCamera, uLowness);
    float width = aShape.y * keep;

    // 1. травинка в своих координатах: сужается к кончику и чуть изогнута
    vec3 p = vec3(position.x * width * (1.0 - 0.45 * h), h * height, 0.0);
    p.z += (0.1 + 0.3 * rnd) * height * h * h;
    float c = cos(turn);
    float s = sin(turn);
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);

    // 2. ветер: порывы — это пятна шума, которые плывут по полю вдоль ветра
    vec2 flow = root * 0.11 - uFlow;
    float gust = noise(flow) * 0.65 + noise(flow * 2.3 + 7.1) * 0.35;
    gust = smoothstep(0.3, 0.85, gust);
    float flutter = sin(uTime * (1.7 + 2.3 * rnd) + rnd * 6.2831 + dot(root, vec2(0.7, 0.4)));
    float bend = uWind * 0.25 + gust * (0.2 + 0.85 * uWind) + flutter * 0.05 * (0.4 + uWind);
    vec2 lean = uWindDir * bend;

    // 3. курсор раздвигает траву вокруг себя
    vec2 away = root - uPush.xz;
    float dist = length(away);
    float push = uPushAmount * (1.0 - smoothstep(0.0, uPushRadius, dist));
    lean += away / max(dist, 0.001) * push * 1.3;

    // 4. гнётся сильнее к кончику, а кончик опускается, чтобы длина не менялась
    float k = h * h;
    float amount = min(length(lean), 1.2);
    p.xz += lean * k * height * 0.9;
    p.y *= 1.0 - 0.35 * amount * amount * h;

    // 5. свет: наклонённая порывом трава светлее, повёрнутая к солнцу — тоже
    float sunSide = abs(dot(vec2(s, c), uSunFlat));
    vLight = 0.78 + 0.34 * gust + 0.16 * sunSide + 0.12 * (rnd - 0.5) + 0.2 * push;
    vHeight = h;
    vDry = aShape.z;

    vec4 view = modelViewMatrix * vec4(root.x + p.x, p.y, root.y + p.z, 1.0);
    vFog = hazeAt(length(view.xyz));
    gl_Position = projectionMatrix * view;
    if (keep < 0.001) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);   // исчезнувшую травинку не рисуем совсем
  }
`;

// цвет травинки: тёмная у земли, светлая на кончике, вдали тонет в дымке
const GRASS_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uMid;
  uniform vec3 uTip;
  uniform vec3 uDry;
  uniform vec3 uHaze;

  varying float vHeight;
  varying float vDry;
  varying float vLight;
  varying float vFog;

  void main() {
    vec3 color = mix(uBase, uMid, smoothstep(0.0, 0.45, vHeight));
    color = mix(color, uTip, smoothstep(0.45, 1.0, vHeight));
    color = mix(color, uDry, vDry * smoothstep(0.15, 0.9, vHeight) * 0.75);
    color *= vLight;
    color = mix(color, uHaze, vFog);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// одна травинка: четыре ряда по две точки и острый кончик — 7 треугольников
const BLADE = [
  -0.5, 0, 0, 0.5, 0, 0,
  -0.5, 0.3, 0, 0.5, 0.3, 0,
  -0.5, 0.58, 0, 0.5, 0.58, 0,
  -0.5, 0.82, 0, 0.5, 0.82, 0,
  0, 1, 0,
];
const BLADE_INDEX = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6, 6, 5, 7, 6, 7, 8];

// где стоит камера «из травы»: у самого объектива трава короткая, чтобы не заслонять всё,
// а сверху это место не видно — оно за нижним краем кадра
const LOW_SPOT = { x: 0, z: 11.5 };
const fromLowSpot = (x, z) => Math.hypot(x - LOW_SPOT.x, z - LOW_SPOT.z);

// трава гуще всего у камеры и реже вдали: плотность падает с расстоянием, зато вдали травинки крупнее.
// Так поле одинаково плотное на экране — и с луга, и с высоты, — и нигде не видно, где кончается густое.
// inner — круг постоянной плотности, mid — до сюда трава во все стороны, outer — дальше только впереди
const MEADOW = { inner: 9, mid: 20, outer: 92, density: phone ? 31 : 71 };   // метры и травинок на м²
const meadowRing = (a, b) => MEADOW.density * Math.pow(MEADOW.inner, 1.5) * 4 * Math.PI * (Math.sqrt(b) - Math.sqrt(a));
const meadowDisc = MEADOW.density * Math.PI * MEADOW.inner * MEADOW.inner;
const COUNTS = {
  near: Math.round(meadowDisc + meadowRing(MEADOW.inner, MEADOW.mid)),
  far: Math.round(meadowRing(MEADOW.mid, MEADOW.outer) * 0.55),
};

// расстояние от камеры, при котором плотность падает как 1 / r^1.5: так выбираем радиус между a и b
const radiusBetween = (a, b) => Math.pow(Math.sqrt(a) + random() * (Math.sqrt(b) - Math.sqrt(a)), 2);

// плавные пятна на поле: число от 0 до 1, которое медленно меняется от места к месту
const patches = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.13 + Math.sin(z * 0.09) * 2) * Math.cos(z * 0.11 + Math.sin(x * 0.07) * 2);

// предсказуемый «случайный» генератор: поле одно и то же при каждом заходе
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(7);

let grassMaterial = null;
let near = null;            // ближний круг травы
let far = null;             // дальний круг
let stubble = null;         // низкая трава у камеры

// поле: одна травинка, повторённая count раз, у каждой копии свои место, поворот и размер.
// pick() выбирает место: { x, z, grow, scale } или null — тогда пробуем ещё раз.
// grow — во сколько раз травинка шире обычной, scale — во сколько выше
function makeField(count, pick, size) {
  const inst = new Float32Array(count * 4);
  const alps = new Float32Array(count);       // в горах: на плато ли травинка
  const shape = new Float32Array(count * 3);
  for (let n = 0; n < count;) {
    const spot = pick();
    if (!spot) continue;
    const { x, z, grow = 1, scale = 1 } = spot;
    const tall = random() < size.tallShare;
    let height = tall ? lerp(size.tall[0], size.tall[1], random()) : lerp(size.h[0], size.h[1], Math.pow(random(), 1.3));
    height *= (0.75 + 0.5 * patches(x, z)) * scale;       // где-то трава выше, где-то ниже
    const dryPatch = smoothstep(0.7, 0.95, patches(x + 37, z - 21)) * (0.5 + 0.5 * random());
    const dry = tall ? 0.85 + 0.15 * random() : Math.max(0.3 * random(), dryPatch);
    inst.set([x, z, random() * Math.PI * 2, random()], n * 4);
    alps[n] = alpsKeep(x, z);
    shape.set([height, lerp(size.w[0], size.w[1], random()) * grow, dry], n * 3);
    n += 1;
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(BLADE, 3));
  geometry.setIndex(BLADE_INDEX);
  geometry.setAttribute('aInst', new THREE.InstancedBufferAttribute(inst, 4));
  geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(shape, 3));
  geometry.setAttribute('aAlps', new THREE.InstancedBufferAttribute(alps, 1));
  geometry.instanceCount = count;
  const mesh = new THREE.Mesh(geometry, grassMaterial);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// травинка на расстоянии r от камеры: вдали шире и чуть выше
function meadowSpot(r, a) {
  return {
    x: LOW_SPOT.x + Math.sin(a) * r,
    z: LOW_SPOT.z + Math.cos(a) * r,
    grow: Math.pow(Math.max(1, r / MEADOW.inner), 0.75),
    scale: 1 + 0.38 * smoothstep(MEADOW.inner, MEADOW.outer, r),
  };
}

function buildGrass() {
  grassMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...common,
      uSunFlat: { value: new THREE.Vector2(sunDir.x, sunDir.z).normalize() },
      uBase: { value: new THREE.Color(COLORS.grassBase) },
      uMid: { value: new THREE.Color(COLORS.grassMid) },
      uTip: { value: new THREE.Color(COLORS.grassTip) },
      uDry: { value: new THREE.Color(COLORS.grassDry) },
      uAlps: { value: 0 },
      uLowSpot: { value: new THREE.Vector2(LOW_SPOT.x, LOW_SPOT.z) },
      uLowness: { value: 0 },
    },
    vertexShader: GRASS_VERTEX,
    fragmentShader: GRASS_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const size = { h: [0.42, 0.95], w: [0.035, 0.065], tall: [1.1, 1.65], tallShare: 0.05 };

  // ближний круг: у камеры густо во все стороны — его видно и с луга, и сверху
  const discShare = meadowDisc / COUNTS.near;
  near = makeField(COUNTS.near, () => {
    const r = random() < discShare ? MEADOW.inner * Math.sqrt(random()) : radiusBetween(MEADOW.inner, MEADOW.mid);
    return r < 0.25 ? null : meadowSpot(r, random() * Math.PI * 2);
  }, size);

  // низкая густая трава прямо у камеры: прикрывает землю внизу кадра и не заслоняет небо.
  // Нужна только на лугу — сверху её прячем
  stubble = makeField(phone ? 4000 : 6000, () => {
    const x = LOW_SPOT.x + (random() * 2 - 1) * 3;
    const z = LOW_SPOT.z + random() * 4 - 3;
    const r = fromLowSpot(x, z);
    return r > 3 || r < 0.2 ? null : { x, z };
  }, { h: [0.12, 0.3], w: [0.03, 0.05], tall: [0.3, 0.4], tallShare: 0 });

  // дальний круг: впереди и по бокам, всё реже и крупнее; у самого края редеет до нуля
  far = makeField(COUNTS.far, () => {
    const r = radiusBetween(MEADOW.mid, MEADOW.outer);
    if (random() < smoothstep(70, MEADOW.outer, r)) return null;
    return meadowSpot(r, Math.PI + (random() * 2 - 1) * 1.75);   // ±100° от взгляда вперёд
  }, size);
}

sceneParts.push(buildGrass);

// ========== ветер в траве ==========

// плавно подходим к настоящему ветру, а порывы уплывают по ветру
function updateWind(dt) {
  const power = clamp(0.15 + state.wind.speed / 10, 0.15, 1);
  common.uWind.value += (power - common.uWind.value) * Math.min(1, dt * 0.6);

  // ветер «откуда» превращаем в стрелку «куда»: 270° (с запада) → дует на восток, вправо
  const angle = (state.wind.from * Math.PI) / 180;
  const dir = common.uWindDir.value;
  dir.x += (-Math.sin(angle) - dir.x) * Math.min(1, dt * 0.6);
  dir.y += (Math.cos(angle) - dir.y) * Math.min(1, dt * 0.6);
  dir.normalize();

  if (!calm) common.uFlow.value.addScaledVector(dir, dt * (0.25 + 0.7 * common.uWind.value));
}

everyFrame.push(updateWind);

// ========== облака плывут по ветру ==========

// узор облаков сдвигается туда же, куда дует ветер в Петербурге, и тем быстрее, чем он сильнее
function updateClouds(dt) {
  if (calm) return;
  const speed = 0.02 + 0.06 * common.uWind.value;   // долей узора в секунду
  skyUniforms.uCloudFlow.value.addScaledVector(common.uWindDir.value, dt * speed);
}

everyFrame.push(updateClouds);

// ========== цветы на горном плато ==========

// цветок: пять лепестков вокруг жёлтой серединки. aPart: 0 — серединка, 1 — край лепестка
const FLOWER_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec2 uFlow;
  uniform float uWind;
  uniform vec2 uWindDir;
  uniform vec3 uPush;
  uniform float uPushRadius;
  uniform float uPushAmount;
  uniform float uBloom;

  attribute float aPart;
  attribute vec4 aSpot;   // x, z, высота, случайное число
  attribute vec4 aLook;   // ось наклона, наклон, размер, цвет

  varying float vPart;
  varying float vTint;
  varying float vLight;
  varying float vFog;

  ${NOISE}
  ${FOG}

  void main() {
    vec2 root = aSpot.xy;
    float height = aSpot.z;
    float rnd = aSpot.w;
    // распускаются волной: у каждого цветка своя задержка
    float open = smoothstep(rnd * 0.6, rnd * 0.6 + 0.4, uBloom);

    // ветер и курсор — тот же расчёт, что у кончика травинки
    vec2 flow = root * 0.11 - uFlow;
    float gust = noise(flow) * 0.65 + noise(flow * 2.3 + 7.1) * 0.35;
    gust = smoothstep(0.3, 0.85, gust);
    float flutter = sin(uTime * (1.7 + 2.3 * rnd) + rnd * 6.2831 + dot(root, vec2(0.7, 0.4)));
    float bend = uWind * 0.25 + gust * (0.2 + 0.85 * uWind) + flutter * 0.05 * (0.4 + uWind);
    vec2 lean = uWindDir * bend;
    vec2 away = root - uPush.xz;
    float dist = length(away);
    float push = uPushAmount * (1.0 - smoothstep(0.0, uPushRadius, dist));
    lean += away / max(dist, 0.001) * push * 1.3;
    float amount = min(length(lean), 1.2);
    vec3 head = vec3(root.x, height * (1.0 - 0.35 * amount * amount), root.y);
    head.xz += lean * height * 0.9;

    // головка цветка повёрнута вверх и к нам — так её видно и сверху, и с луга
    vec3 p = position * aLook.z * open;
    vec3 axis = vec3(cos(aLook.x), 0.0, sin(aLook.x));
    float ct = cos(aLook.y);
    float st = sin(aLook.y);
    p = p * ct + cross(axis, p) * st + axis * dot(axis, p) * (1.0 - ct);

    vec4 view = modelViewMatrix * vec4(head + p, 1.0);
    vFog = hazeAt(length(view.xyz));
    vPart = aPart;
    vTint = aLook.w;
    vLight = 0.86 + 0.24 * gust;
    gl_Position = projectionMatrix * view;
  }
`;

// цвет лепестков по номеру: 0 — белые, 1 — жёлтые, 2 — лиловые, 3 — розовые
const FLOWER_FRAGMENT = /* glsl */ `
  uniform vec3 uHaze;
  varying float vPart;
  varying float vTint;
  varying float vLight;
  varying float vFog;

  void main() {
    vec3 petal = vec3(0.97, 0.97, 0.93);
    petal = mix(petal, vec3(0.99, 0.82, 0.24), step(0.5, vTint));
    petal = mix(petal, vec3(0.6, 0.47, 0.92), step(1.5, vTint));
    petal = mix(petal, vec3(0.96, 0.56, 0.74), step(2.5, vTint));
    vec3 heart = vec3(0.95, 0.74, 0.2);
    vec3 color = mix(heart, petal, smoothstep(0.2, 0.55, vPart)) * vLight;
    gl_FragColor = vec4(mix(color, uHaze, vFog), 1.0);
  }
`;

let flowers = null;
let flowerTotal = 0;

function flowerHead() {
  const points = [0, 0, 0];
  const part = [0];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    for (const [da, r] of [[-0.42, 0.42], [0, 1], [0.42, 0.42]]) {
      points.push(Math.cos(a + da) * r, 0, Math.sin(a + da) * r);
      part.push(r);
    }
  }
  const index = [];
  for (let i = 0; i < 5; i++) {
    const s = 1 + i * 3;
    index.push(0, s, s + 1, 0, s + 1, s + 2);
  }
  return { points, part, index };
}

// цветы растут пятнами, как на настоящем лугу, чуть выше травы — и только на плато
function buildFlowers() {
  flowerTotal = phone ? 1500 : 3400;
  const spot = new Float32Array(flowerTotal * 4);
  const look = new Float32Array(flowerTotal * 4);
  const rand = seededRandom(23);
  for (let n = 0; n < flowerTotal;) {
    const x = HC.x + (rand() * 2 - 1) * 19;
    const z = HC.z + (rand() * 2 - 1) * 19;
    if (alpsKeep(x, z) < 0.95 || fromLowSpot(x, z) < 1.6) continue;
    // пятна: где «пятно» слабое, цветок чаще выкидываем
    if (rand() > 0.2 + 0.8 * smoothstep(0.35, 0.8, patches(x * 1.7 + 13, z * 1.7 - 9))) continue;
    spot.set([x, z, lerp(0.55, 1.0, rand()), rand()], n * 4);
    // ось наклона — примерно поперёк взгляда, наклон 25–60°: головка повёрнута к камере
    const tint = rand();
    look.set([(rand() - 0.5) * 1.4, lerp(0.45, 1.05, rand()), lerp(0.04, 0.07, rand()), tint < 0.5 ? 0 : tint < 0.76 ? 1 : tint < 0.9 ? 2 : 3], n * 4);
    n += 1;
  }
  const head = flowerHead();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(head.points, 3));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(head.part, 1));
  geometry.setIndex(head.index);
  geometry.setAttribute('aSpot', new THREE.InstancedBufferAttribute(spot, 4));
  geometry.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4));
  geometry.instanceCount = Math.floor(flowerTotal * [1, 0.55, 0.35][speedCheck.level]);   // если сайт уже экономит силы
  flowers = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: { ...common, uBloom: { value: 0 } },
    vertexShader: FLOWER_VERTEX,
    fragmentShader: FLOWER_FRAGMENT,
    side: THREE.DoubleSide,
  }));
  flowers.frustumCulled = false;
  flowers.visible = false;
  scene.add(flowers);
}

// ========== пейзажи ==========

// два пейзажа: поле у моря и горы с озером. Кнопка «пейзаж →» по кругу переключает их:
// наползает туман, в тумане меняется земля, камера поднимается на край плато, туман уходит
const SCAPES = [
  {
    horizon: COLORS.horizon, sky: COLORS.sky, zenith: COLORS.zenith, haze: COLORS.haze,
    sun: COLORS.sun, cloudShade: COLORS.cloudShade, sunDir: [0.5, 0.12, -0.86], cloudy: 0,
    water: COLORS.sea, shallow: COLORS.seaShallow, deep: COLORS.seaDeep, level: SEA_LEVEL,
  },
  {
    horizon: '#dde8ef', sky: '#5f95cf', zenith: '#173b77', haze: '#c6d6e3',
    sun: '#fff0d6', cloudShade: '#8a9bb2', sunDir: [-0.8, 0.42, -0.25], cloudy: 1,
    water: '#1e5864', shallow: '#5fae9f', deep: '#194a56', level: LAKE_LEVEL,
  },
];
const SCAPE_TIME = 3.4;     // секунды на смену пейзажа
let scapeIndex = 0;         // какой пейзаж сейчас (или к какому едем)
let scapeT = 1;             // сколько пройдено смены: от 0 до 1
let scapeFrom = null;
let scapeTo = null;
let scapeSwapped = true;    // земля уже сменилась

function scapeColors(s) {
  return {
    horizon: new THREE.Color(s.horizon),
    sky: new THREE.Color(s.sky),
    zenith: new THREE.Color(s.zenith),
    haze: new THREE.Color(s.haze),
    sun: new THREE.Color(s.sun),
    cloudShade: new THREE.Color(s.cloudShade),
    sunDir: new THREE.Vector3(...s.sunDir).normalize(),
    cloudy: s.cloudy,
  };
}

// небо, солнце и облака плавно переходят от одного пейзажа к другому
function applyColors(k) {
  const a = scapeFrom;
  const b = scapeTo;
  skyUniforms.uHorizon.value.lerpColors(a.horizon, b.horizon, k);
  skyUniforms.uSky.value.lerpColors(a.sky, b.sky, k);
  skyUniforms.uZenith.value.lerpColors(a.zenith, b.zenith, k);
  common.uHaze.value.lerpColors(a.haze, b.haze, k);
  skyUniforms.uSunColor.value.lerpColors(a.sun, b.sun, k);
  skyUniforms.uCloudShade.value.lerpColors(a.cloudShade, b.cloudShade, k);
  skyUniforms.uCloudy.value = lerp(a.cloudy, b.cloudy, k);
  sunDir.copy(a.sunDir).lerp(b.sunDir, k).normalize();
  grassMaterial.uniforms.uSunFlat.value.set(sunDir.x, sunDir.z).normalize();
}

// в самом густом тумане меняем землю и воду — этого момента не видно
function swapLand() {
  const s = SCAPES[scapeIndex];
  const alps = scapeIndex === 1;
  fieldLand.visible = !alps;
  alpsLand.visible = alps;
  landUniforms.uWaterLevel.value = s.level;
  landUniforms.uWater.value.set(s.water);
  landUniforms.uShallow.value.set(s.shallow);
  landUniforms.uDeep.value.set(s.deep);
  flowers.visible = alps;
  // открытый раздел переезжает к новой кромке травы
  placeMenu();
  if (state.open === 'lab') measureLab();
  // божья коровка, если сидела, тихо улетает в тумане: на новом месте травы под ней может не быть
  if (bug && bugState.mode !== 'away') {
    bug.visible = false;
    bugState.mode = 'away';
    bugState.lastActive = performance.now();
  }
  scapeSwapped = true;
}

function switchScape() {
  if (!state.sceneReady || scapeT < 1) return;
  // горы и цветы строим, только когда они впервые понадобились: так сайт быстрее открывается
  if (!alpsLand) buildAlps();
  if (!flowers) buildFlowers();
  scapeFrom = scapeColors(SCAPES[scapeIndex]);
  scapeIndex = (scapeIndex + 1) % SCAPES.length;
  scapeTo = scapeColors(SCAPES[scapeIndex]);
  state.scape = scapeIndex === 1 ? 'alps' : 'field';
  scapeT = 0;
  scapeSwapped = false;
  if (calm) {
    // без движения: сразу новый пейзаж
    scapeT = 1;
    swapLand();
    applyColors(1);
    alpsK = scapeIndex;
    grassMaterial.uniforms.uAlps.value = scapeIndex;
    flowers.material.uniforms.uBloom.value = scapeIndex;
  }
}

function updateScape(dt) {
  if (scapeT >= 1) return;
  scapeT = Math.min(1, scapeT + dt / SCAPE_TIME);
  const t = scapeT;
  const toAlps = scapeIndex === 1;
  // туман наползает, держится и уходит
  common.uMist.value = t < 0.34 ? smoothstep(0, 0.34, t) : 1 - smoothstep(0.46, 1, t);
  // трава за краем плато плавно уходит в землю ещё до смены земли, а возвращается — сразу после,
  // пока туман густой: так нигде ничего не обрывается
  grassMaterial.uniforms.uAlps.value = toAlps ? smoothstep(0.2, 0.4, t) : 1 - smoothstep(0.4, 0.6, t);
  // цветы: в горах распускаются, пока туман уходит; на пути обратно закрываются, пока он густеет
  flowers.material.uniforms.uBloom.value = toAlps ? smoothstep(0.5, 1, t) : 1 - smoothstep(0.14, 0.36, t);
  if (!scapeSwapped && t >= 0.4) swapLand();
  const k = smoothstep(0, 1, t);
  applyColors(k);
  alpsK = toAlps ? k : 1 - k;
}

scapeButton.addEventListener('click', switchScape);
everyFrame.push(updateScape);

// ========== камера: вид сверху и спуск на луг ==========

// где стоит камера (pos), куда смотрит (look) и угол обзора (fov, в градусах) — для каждого пейзажа.
// Сверху — как с дрона, узким объективом: видна только трава. Внизу — с луга, широким, с горизонтом;
// в горах — с края плато и чуть выше, чтобы долина с озером и горы были под нами
const VIEWS = {
  field: {
    top: { pos: [0, 15, 8.5], look: [0, 0, -1.5], fov: 38 },
    low: { pos: [LOW_SPOT.x, 1.4, LOW_SPOT.z], look: [0, 2.6, -8], fov: 55 },
  },
  alps: {
    top: { pos: [0, 15, 25], look: [0, 0, 15], fov: 38 },
    low: { pos: [LOW_SPOT.x, 3.2, LOW_SPOT.z], look: [0, 0.2, -8], fov: 55 },
  },
};

// дымка для каждого вида: [где начинается, где густеет, насколько густая].
// Пока камера спускается, воздух прозрачный: когда показывается горизонт, за полем видно море.
// Внизу, в траве, даль тонет в дымке. В горах воздух прозрачный всегда
const FOGS = {
  field: { top: [60, 1000, 1], low: [16, 80, 1] },
  alps: { top: [120, 1500, 0.62], low: [120, 1500, 0.62] },
};

let TOP = null;             // вид сверху — смесь видов двух пейзажей
let LOW = null;             // вид с луга
let look = null;            // точка, куда смотрит камера
let camT = 0;               // где камера сейчас: 0 — сверху, 1 — внизу
let alpsK = 0;              // какой пейзаж: 0 — поле, 1 — горы; при смене плавно едет от одного к другому
let portrait = 0;           // 0 — экран лежит, до 1 — высокий телефон
const parallax = { x: 0, y: 0 };   // сдвиг взгляда за мышью

function setupCamera() {
  TOP = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 0 };
  LOW = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 0 };
  look = new THREE.Vector3();
  camT = state.view === 'low' ? 1 : 0;
  state.cameraMoves = true;
  measurePortrait();
  addEventListener('resize', measurePortrait);
}

function measurePortrait() {
  portrait = clamp((innerHeight / innerWidth - 1) / 1.2, 0, 1);
}

// смешать вид поля и вид гор: k = 0 — поле, 1 — горы
function blendView(out, a, b, k) {
  out.pos.set(lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k));
  out.look.set(lerp(a.look[0], b.look[0], k), lerp(a.look[1], b.look[1], k), lerp(a.look[2], b.look[2], k));
  out.fov = lerp(a.fov, b.fov, k);
}

function placeCamera(t) {
  blendView(TOP, VIEWS.field.top, VIEWS.alps.top, alpsK);
  blendView(LOW, VIEWS.field.low, VIEWS.alps.low, alpsK);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;  // плавный старт и финиш
  const g = smoothstep(0.25, 1, t);                                      // взгляд поднимается позже
  camera.position.lerpVectors(TOP.pos, LOW.pos, e);
  look.lerpVectors(TOP.look, LOW.look, g);
  // внизу камера чуть «дышит» и поворачивается вслед за мышью
  camera.position.x += Math.sin(time * 0.31) * 0.05 * e;
  camera.position.y += Math.sin(time * 0.43) * 0.02 * e;
  look.x += parallax.x * 0.8 * e;
  look.y -= parallax.y * 0.35 * e;
  look.y += portrait * 1.2 * g;   // на телефоне чуть больше неба
  camera.lookAt(look);
  // на вертикальном экране угол обзора шире, иначе поле видно как в замочную скважину
  camera.fov = lerp(TOP.fov, LOW.fov, e) * (1 + 0.4 * portrait);
  camera.updateProjectionMatrix();
  // трава у самой камеры: на лугу ниже, сверху обычная
  grassMaterial.uniforms.uLowness.value = e;
  stubble.visible = e > 0.5;
  // дымка густеет только в самом конце спуска — до этого успевает показаться море
  const f = FOGS;
  const k = smoothstep(0.8, 1, t);
  common.uFogNear.value = lerp(lerp(f.field.top[0], f.field.low[0], k), lerp(f.alps.top[0], f.alps.low[0], k), alpsK);
  common.uFogFar.value = lerp(lerp(f.field.top[1], f.field.low[1], k), lerp(f.alps.top[1], f.alps.low[1], k), alpsK);
  common.uFogMax.value = lerp(lerp(f.field.top[2], f.field.low[2], k), lerp(f.alps.top[2], f.alps.low[2], k), alpsK);
}

// где на экране начинается трава в виде снизу — доля высоты экрана сверху.
// В поле это горизонт, в горах — кромка травы на краю плато. Меню кладёт сюда нижний край
// открытого раздела. Считаем по «камере-примерке», без покачивания и поворота за мышью
let probe = null;
function grassLine() {
  if (!state.sceneReady || !LOW) return 0.55;        // 3D нет — на картинке-заглушке горизонт здесь
  if (!probe) probe = new THREE.PerspectiveCamera();
  const alps = state.scape === 'alps';
  const view = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 0 };
  blendView(view, VIEWS.field.low, VIEWS.alps.low, alps ? 1 : 0);
  probe.position.copy(view.pos);
  probe.fov = view.fov * (1 + 0.4 * portrait);
  probe.aspect = innerWidth / innerHeight;
  probe.updateProjectionMatrix();
  view.look.y += portrait * 1.2;
  probe.lookAt(view.look);
  probe.updateMatrixWorld();
  const edge = alps
    ? new THREE.Vector3(0, 0.6, HC.z - plateauRadius(Math.PI))   // кромка плато прямо перед нами
    : new THREE.Vector3(view.pos.x, view.pos.y, view.pos.z - 2000);  // горизонт
  return (1 - edge.project(probe).y) / 2;
}

// камера едет к нужному виду: вниз за 2,6 секунды, вверх за 2
function moveCamera(dt) {
  const goal = state.view === 'low' ? 1 : 0;
  if (calm) camT = goal;
  else if (camT < goal) camT = Math.min(goal, camT + dt / 2.6);
  else if (camT > goal) camT = Math.max(goal, camT - dt / 2);
  placeCamera(camT);
  if (state.view === 'low' && camT > 0.62) showMenu(true);
}

sceneParts.push(setupCamera);
everyFrame.push(moveCamera);

// ========== курсор раздвигает траву ==========

let raycaster = null;
let groundPlane = null;
let pushGoal = null;        // точка на земле под курсором
let hit = null;
let lastMove = -10;         // когда мышь двигалась в последний раз, в секундах
const parallaxGoal = { x: 0, y: 0 };

function setupPointer() {
  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  pushGoal = new THREE.Vector3(0, 0, 999);
  hit = new THREE.Vector3();
  addEventListener('pointermove', onPointerMove);
}

// находим точку на земле под курсором — вокруг неё трава расступится
function onPointerMove(event) {
  const x = (event.clientX / innerWidth) * 2 - 1;
  const y = -(event.clientY / innerHeight) * 2 + 1;
  if (event.pointerType === 'mouse') {
    parallaxGoal.x = x;
    parallaxGoal.y = -y;
  }
  raycaster.setFromCamera({ x, y }, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
  if (lastMove < 0) common.uPush.value.copy(hit);   // первое движение — без проезда через всё поле
  pushGoal.copy(hit);
  lastMove = performance.now() / 1000;
}

// трава расступается, пока мышь двигается, и выпрямляется через секунду
function updatePointer(dt, now) {
  const moving = now / 1000 - lastMove < 1.2 ? 1 : 0;
  common.uPushAmount.value += (moving - common.uPushAmount.value) * Math.min(1, dt * 3);
  common.uPush.value.lerp(pushGoal, Math.min(1, dt * 10));
  common.uPushRadius.value = 3.0 - 2.2 * camT;
  parallax.x += (parallaxGoal.x - parallax.x) * Math.min(1, dt * 2);
  parallax.y += (parallaxGoal.y - parallax.y) * Math.min(1, dt * 2);
}

sceneParts.push(setupPointer);
everyFrame.push(updatePointer);

// ========== божья коровка ==========

// если пять минут ничего не трогать, на траву прилетает божья коровка.
// Курсор или палец рядом с ней — улетает. Не трогать — так и будет сидеть
const IDLE_MS = 5 * 60 * 1000;

const BUG_VERTEX = /* glsl */ `
  varying vec3 vUnit;
  varying vec3 vNormalView;

  void main() {
    vUnit = normalize(position / vec3(0.8, 0.62, 1.0));   // точка на круглой «спинке» до сплющивания
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// красные надкрылья с семью чёрными пятнами, шов посередине и блик
const BUG_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vUnit;
  varying vec3 vNormalView;

  float spot(vec3 p, vec3 c, float r) {
    return 1.0 - smoothstep(r - 0.03, r, distance(p, normalize(c)));
  }

  void main() {
    vec3 p = vUnit;
    vec3 q = vec3(abs(p.x), p.y, p.z);      // пятна симметричны: считаем на одной половине
    float dark = spot(q, vec3(0.42, 0.7, -0.42), 0.2) + spot(q, vec3(0.66, 0.55, 0.16), 0.19)
               + spot(q, vec3(0.32, 0.62, 0.66), 0.17) + spot(p, vec3(0.0, 0.82, -0.62), 0.2);
    dark += 1.0 - smoothstep(0.015, 0.035, abs(p.x));
    vec3 color = mix(vec3(0.84, 0.1, 0.07), vec3(0.03, 0.03, 0.035), clamp(dark, 0.0, 1.0));
    vec3 n = normalize(vNormalView);
    vec3 l = normalize(vec3(-0.35, 0.8, 0.5));
    float diffuse = max(dot(n, l), 0.0);
    float shine = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 36.0);
    color = color * (0.38 + 0.75 * diffuse) + vec3(1.0) * shine * 0.55;
    gl_FragColor = vec4(color, uOpacity);
  }
`;

let bug = null;
const bugParts = {};
const bugState = {
  mode: 'away',            // 'away' — нет, 'land' — садится, 'sit' — сидит, 'fly' — улетает
  t: 0,
  anchor: null,            // где села
  pos: null,
  heading: 0,
  size: 0.1,
  from: null,
  to: null,
  vel: null,
  lastActive: performance.now(),
};

function buildLadybug() {
  bug = new THREE.Group();
  const shell = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 } },
    vertexShader: BUG_VERTEX,
    fragmentShader: BUG_FRAGMENT,
    transparent: true,
  });
  const black = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true });
  const white = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true });
  const wing = new THREE.MeshBasicMaterial({ color: 0x9a7d6a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  // два надкрылья — половинки сплющенной полусферы. Петля у каждой — на шве сверху:
  // на взлёте половинки поднимаются в стороны
  const half = (start) => new THREE.SphereGeometry(1, 22, 12, start, Math.PI, 0, Math.PI / 2).scale(0.8, 0.62, 1);
  const hinge = (start) => {
    const pivot = new THREE.Group();
    pivot.position.y = 0.62;
    const mesh = new THREE.Mesh(half(start), shell);
    mesh.position.y = -0.62;
    pivot.add(mesh);
    return pivot;
  };
  bugParts.left = hinge(-Math.PI / 2);
  bugParts.right = hinge(Math.PI / 2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10).scale(1, 0.72, 0.8), black);
  head.position.set(0, 0.1, -0.95);
  const eyeGeo = new THREE.SphereGeometry(0.08, 8, 6);
  const eyeL = new THREE.Mesh(eyeGeo, white);
  const eyeR = new THREE.Mesh(eyeGeo, white);
  eyeL.position.set(-0.17, 0.17, -1.25);
  eyeR.position.set(0.17, 0.17, -1.25);
  const belly = new THREE.Mesh(new THREE.CircleGeometry(0.78, 20).scale(1, 1.25, 1).rotateX(Math.PI / 2), black);
  // прозрачные крылья: видны только в полёте, крепятся внутренним краем
  const wingGeo = (side) => new THREE.CircleGeometry(1, 18).scale(0.45, 1.15, 1).rotateX(-Math.PI / 2).translate(side * 0.45, 0, 0.45);
  bugParts.wingL = new THREE.Mesh(wingGeo(-1), wing);
  bugParts.wingR = new THREE.Mesh(wingGeo(1), wing);
  bugParts.wingL.position.set(-0.1, 0.55, -0.5);
  bugParts.wingR.position.set(0.1, 0.55, -0.5);
  bugParts.wingL.visible = false;
  bugParts.wingR.visible = false;
  bugParts.materials = [shell, black, white];
  bug.add(bugParts.left, bugParts.right, head, eyeL, eyeR, belly, bugParts.wingL, bugParts.wingR);
  bug.visible = false;
  scene.add(bug);
}

// размер в мире, при котором коровка на экране всегда около 22 пикселей в длину
function bugSizeAt(pos) {
  const d = camera.position.distanceTo(pos);
  const worldPerPx = (2 * d * Math.tan((camera.fov * Math.PI) / 360)) / innerHeight;
  return (phone ? 10 : 11) * worldPerPx;
}

function setBugOpacity(o) {
  bugParts.materials[0].uniforms.uOpacity.value = o;
  bugParts.materials[1].opacity = o;
  bugParts.materials[2].opacity = o;
}

function setWings(open, flap) {
  // надкрылья поднимаются в стороны, крылья под ними машут
  bugParts.left.rotation.z = -open * 0.95;
  bugParts.right.rotation.z = open * 0.95;
  const showWings = open > 0.3;
  bugParts.wingL.visible = showWings;
  bugParts.wingR.visible = showWings;
  bugParts.wingL.rotation.z = -(0.35 + flap);
  bugParts.wingR.rotation.z = 0.35 + flap;
}

// точка на верхушках травы под этим местом экрана (sx, sy — доли ширины и высоты) или null
function grassSpotAt(sx, sy) {
  raycaster.setFromCamera({ x: sx * 2 - 1, y: -(sy * 2 - 1) }, camera);
  const top = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.75);   // примерно по верхушкам травы
  const spot = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(top, spot)) return null;
  // трава густая рядом с камерой; в горах — только на плато
  const onGrass = fromLowSpot(spot.x, spot.z) < 45 && (state.scape !== 'alps' || alpsKeep(spot.x, spot.z) > 0.9);
  return onGrass ? spot : null;
}

// коровка садится на траву в правой нижней части кадра
function spawnLadybug() {
  if (!bug || bugState.mode !== 'away' || !state.sceneReady) return;
  const tries = state.view === 'low'
    ? [[0.66, 0.8], [0.6, 0.86], [0.4, 0.84], [0.5, 0.92]]
    : [[0.66, 0.7], [0.62, 0.8], [0.4, 0.78], [0.5, 0.9]];
  let spot = null;
  for (const [sx, sy] of tries) {
    spot = grassSpotAt(sx, sy);
    if (spot) break;
  }
  if (!spot) return;
  bugState.anchor = spot.clone();
  bugState.pos = spot.clone();
  bugState.size = bugSizeAt(spot);
  bugState.heading = Math.random() * Math.PI * 2;
  bugState.from = spot.clone().add(new THREE.Vector3(bugState.size * 14, bugState.size * 18, -bugState.size * 6));
  bugState.mode = calm ? 'sit' : 'land';
  bugState.t = 0;
  setBugOpacity(1);
  setWings(calm ? 0 : 1, 0);
  bug.visible = true;
}

// спугнуть: коровка раскрывает крылья и улетает вверх, в сторону от курсора
function scareLadybug(event) {
  if (bugState.mode !== 'sit' && bugState.mode !== 'land') return;
  const s = bugState.size;
  const side = event && event.clientX > innerWidth * 0.66 ? -1 : 1;
  bugState.vel = new THREE.Vector3(side * s * 10, s * 16, -s * 8);
  bugState.mode = 'fly';
  bugState.t = 0;
  if (calm) {
    bug.visible = false;
    bugState.mode = 'away';
  }
}

function updateLadybug(dt) {
  if (!bug || bugState.mode === 'away') return;
  const st = bugState;
  st.t += dt;
  if (st.mode === 'land') {
    // подлетает по дуге и складывает крылья
    const k = smoothstep(0, 1, st.t / 1.3);
    st.pos.lerpVectors(st.from, st.anchor, k);
    st.pos.y += Math.sin(k * Math.PI) * st.size * 4;
    setWings(1 - smoothstep(0.8, 1, k), Math.sin(st.t * 60) * 0.5);
    if (st.t >= 1.3) {
      st.mode = 'sit';
      st.t = 0;
      setWings(0, 0);
    }
  } else if (st.mode === 'sit') {
    // ползает понемногу и иногда поворачивается, но далеко от места не уходит
    st.size = bugSizeAt(st.anchor);
    if (!calm) {
      const turn = Math.sin(st.t * 0.9 + 1.3) * 0.8 + Math.sin(st.t * 0.37) * 0.6;
      const toHome = st.anchor.clone().sub(st.pos);
      if (toHome.length() > st.size * 4) {
        const want = Math.atan2(-toHome.x, -toHome.z);
        st.heading += Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading)) * dt * 1.5;
      } else {
        st.heading += turn * dt;
      }
      const speed = st.size * 0.9 * Math.max(0, Math.sin(st.t * 0.7));
      st.pos.x -= Math.sin(st.heading) * speed * dt;
      st.pos.z -= Math.cos(st.heading) * speed * dt;
    }
  } else if (st.mode === 'fly') {
    st.vel.multiplyScalar(1 + dt * 1.2);
    st.pos.addScaledVector(st.vel, dt);
    setWings(1, Math.sin(st.t * 70) * 0.55);
    setBugOpacity(1 - smoothstep(0.9, 1.6, st.t));
    if (st.t > 1.6) {
      bug.visible = false;
      st.mode = 'away';
      st.lastActive = performance.now();
      return;
    }
  }
  bug.position.copy(st.pos);
  bug.position.y += Math.sin(time * 2.3) * st.size * 0.08;   // покачивается вместе с травой
  bug.rotation.y = st.heading;
  bug.scale.setScalar(st.size);
}

function bugIsNear(event) {
  if (!bug || (bugState.mode !== 'sit' && bugState.mode !== 'land')) return false;
  const p = bug.position.clone().project(camera);
  if (p.z > 1) return false;
  const x = ((p.x + 1) / 2) * innerWidth;
  const y = ((1 - p.y) / 2) * innerHeight;
  return Math.hypot(event.clientX - x, event.clientY - y) < (event.pointerType === 'mouse' ? 46 : 64);
}

// любое движение — значит, человек здесь: пятиминутный отсчёт начинается заново
for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel']) {
  addEventListener(type, (event) => {
    bugState.lastActive = performance.now();
    if ((type === 'pointermove' || type === 'pointerdown') && bugIsNear(event)) scareLadybug(event);
  }, { passive: true });
}
// пока открыта панель, коровка не прилетает: трава за панелью не видна
setInterval(() => {
  if (bugState.mode === 'away' && !sheet.open && performance.now() - bugState.lastActive > IDLE_MS) spawnLadybug();
}, 4000);

sceneParts.push(buildLadybug);
everyFrame.push(updateLadybug);

// ========== экономия сил ==========

// если кадры идут медленно, сажаем травы меньше
const speedCheck = { frames: 0, total: 0, level: 0 };

function watchSpeed(dt) {
  if (speedCheck.level === 2) return;
  speedCheck.frames += 1;
  if (speedCheck.frames <= 20) return;   // первые кадры всегда медленнее
  speedCheck.total += dt;
  if (speedCheck.frames < 110) return;
  const average = speedCheck.total / 90;
  speedCheck.frames = 0;
  speedCheck.total = 0;
  if (average < 0.028) return;           // быстрее 35 кадров в секунду — всё хорошо
  speedCheck.level += 1;
  const share = speedCheck.level === 1 ? 0.55 : 0.35;
  near.geometry.instanceCount = Math.floor(COUNTS.near * share);
  far.geometry.instanceCount = Math.floor(COUNTS.far * share);
  if (flowers) flowers.geometry.instanceCount = Math.floor(flowerTotal * share);
  renderer.setPixelRatio(1);
  resize();
}

everyFrame.push(watchSpeed);

// вкладку свернули — не тратим батарею
document.addEventListener('visibilitychange', () => sceneRunning(!document.hidden && !sheet.open));

// ========== запуск ==========

// часы и ветер
tick();
setInterval(tick, 10000);
loadWind();
setInterval(loadWind, 15 * 60 * 1000);

// меню: вниз на луг — только по клику. Кто попросил меньше движения, сразу видит луг и меню
rove(0);
placeMenu();
if (calm) goLow();

// 3D
startScene().catch((error) => {
  console.warn('3D не запустилось, показываю картинку:', error);
  stage.classList.add('no-gl');
  state.cameraMoves = false;
  goLow();
  showMenu(true);
});
