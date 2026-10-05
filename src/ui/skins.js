import './skins.css';
import './skins-hotfix.css';

const STORAGE_KEY = 'lunar-sim-ui-skin';
const SKINS = {
  A: { name: '静海', note: '清晰悬浮' },
  B: { name: '阿波罗', note: '工业仪表' },
  C: { name: '月相', note: '摄影编辑' }
};

function svg(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

const icons = {
  palette: 'M4 5h16v14H4zM8 9h8M8 13h5',
  chevron: 'm8 10 4 4 4-4',
  layers: 'm4 8 8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4',
  camera: 'M4 7h3l2-2h6l2 2h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v6l4 2',
  focus: 'M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M9 12h6',
  tune: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  export: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  save: 'M5 3h12l3 3v15H4V3zM8 3v6h8V3M8 16h8'
};

function icon(name) {
  return `<span class="skin-icon">${svg(icons[name])}</span>`;
}

function createSkinPicker() {
  const tools = document.querySelector('#global-tools');
  if (!tools || document.querySelector('#skin-control')) return;
  const label = document.createElement('label');
  label.id = 'skin-control';
  label.innerHTML = `${icon('palette')}<span>皮肤</span><select id="skin-select" aria-label="界面皮肤"></select>`;
  const select = label.querySelector('select');
  Object.entries(SKINS).forEach(([value, skin]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = `${value} · ${skin.name}`;
    select.append(option);
  });
  const saved = localStorage.getItem(STORAGE_KEY);
  select.value = SKINS[saved] ? saved : 'A';
  const apply = value => {
    document.body.dataset.skin = SKINS[value] ? value : 'A';
    localStorage.setItem(STORAGE_KEY, document.body.dataset.skin);
    label.title = `${SKINS[document.body.dataset.skin].name} · ${SKINS[document.body.dataset.skin].note}`;
  };
  select.addEventListener('change', event => apply(event.currentTarget.value));
  tools.prepend(label);
  apply(select.value);
}

function setBrowseCollapsed(panel, collapsed = true) {
  if (!panel) return;
  panel.classList.toggle('is-collapsed', collapsed);
  const toggle = panel.querySelector('.browse-panel-collapse');
  if (toggle) toggle.setAttribute('aria-expanded', String(!collapsed));
  const label = panel.querySelector('.browse-panel-collapse-label');
  if (label) label.textContent = collapsed ? '选址与图层' : '收起设置';
}

function createBrowseCollapse() {
  const panel = document.querySelector('#browse-panel');
  const title = panel?.querySelector('h1');
  const drive = document.querySelector('#drive-selected');
  if (!panel || !title) return;

  let head = panel.querySelector('.browse-panel-head');
  let toggle = panel.querySelector('.browse-panel-collapse');

  if (!head) {
    head = document.createElement('div');
    head.className = 'browse-panel-head';
    title.before(head);
    head.append(title);
  }

  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'browse-panel-collapse';
    toggle.innerHTML = `${icon('layers')}<span class="browse-panel-collapse-label">选址与图层</span>${icon('chevron')}`;
    head.append(toggle);
  }

  drive?.parentElement?.classList.add('browse-actions');

  if (!toggle.dataset.skinBound) {
    toggle.addEventListener('click', () => {
      setBrowseCollapsed(panel, !panel.classList.contains('is-collapsed'));
    });
    toggle.dataset.skinBound = 'true';
  }

  if (!panel.dataset.skinEscapeBound) {
    panel.addEventListener('keydown', event => {
      if (event.code === 'Escape' && !panel.classList.contains('is-collapsed')) {
        event.stopPropagation();
        setBrowseCollapsed(panel, true);
        toggle.focus();
      }
    });
    panel.dataset.skinEscapeBound = 'true';
  }

  setBrowseCollapsed(panel, true);
}

function watchBrowseVisibility() {
  const panel = document.querySelector('#browse-panel');
  const photoButton = document.querySelector('#photo-button');
  if (!panel) return;

  const syncPhotoButton = () => {
    if (photoButton) photoButton.hidden = !panel.hidden;
  };

  panel._skinBrowseObserver?.disconnect?.();
  let wasHidden = panel.hidden;
  syncPhotoButton();

  const observer = new MutationObserver(() => {
    const nowHidden = panel.hidden;
    if (wasHidden && !nowHidden) setBrowseCollapsed(panel, true);
    wasHidden = nowHidden;
    syncPhotoButton();
  });

  observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  panel._skinBrowseObserver = observer;
}

function createPresetButtons(container) {
  const preset = document.querySelector('#photo-preset');
  if (!preset) return;

  container.querySelectorAll('#skin-photo-presets').forEach(node => node.remove());

  const block = document.createElement('div');
  block.id = 'skin-photo-presets';
  block.innerHTML = '<div class="skin-kicker">画面预设</div><div class="skin-preset-grid"></div>';
  const grid = block.querySelector('.skin-preset-grid');
  const labels = { raw: '原始', cinema: '电影', warm: '暖色', mono: '黑白' };

  [...preset.options].forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `skin-preset skin-preset-${option.value}`;
    button.dataset.value = option.value;
    button.innerHTML = `<i></i><span>${labels[option.value] || option.textContent}</span>`;
    button.addEventListener('click', () => {
      preset.value = option.value;
      preset.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    });
    grid.append(button);
  });

  const sync = () => {
    const currentGrid = document.querySelector('#skin-photo-presets .skin-preset-grid');
    if (!currentGrid) return;
    currentGrid.querySelectorAll('button').forEach(button => {
      button.classList.toggle('active', button.dataset.value === preset.value);
    });
  };

  if (preset._skinPresetSync) preset.removeEventListener('change', preset._skinPresetSync);
  preset._skinPresetSync = sync;
  preset.addEventListener('change', sync);

  sync();
  container.append(block);
}

function photoScaffoldIsValid(panel) {
  return panel.dataset.skinReady === 'true'
    && panel.querySelectorAll(':scope > #skin-photo-modebar').length === 1
    && panel.querySelectorAll(':scope > #skin-photo-scroll').length === 1
    && panel.querySelectorAll(':scope > #skin-photo-footer').length === 1
    && panel.querySelectorAll('#skin-photo-presets').length === 1
    && panel.querySelectorAll('#skin-photo-folds').length === 1;
}

function normalizePhotoMode(panel) {
  const sectionFor = selector => panel.querySelector(selector)?.closest('.photo-section') || null;
  const camera = sectionFor('#photo-fov');
  const time = sectionFor('#photo-scene-time');
  const depth = sectionFor('#photo-dof');
  const look = sectionFor('#photo-preset');
  const exportSection = sectionFor('#photo-sticker');
  const sections = [camera, time, depth, look, exportSection];

  if (sections.some(section => !section) || new Set(sections).size !== sections.length) return null;

  const save = panel.querySelector('#photo-save');
  const status = panel.querySelector('#photo-status');

  sections.forEach(section => panel.append(section));
  if (save && !exportSection.contains(save)) exportSection.append(save);
  if (status && !exportSection.contains(status)) exportSection.append(status);

  const keep = new Set(sections);
  panel.querySelectorAll('.photo-section').forEach(section => {
    if (!keep.has(section)) section.remove();
  });

  panel.querySelectorAll('#skin-photo-modebar,#skin-photo-scroll,#skin-photo-footer,#skin-photo-presets,#skin-photo-folds').forEach(node => node.remove());
  sections.forEach(section => section.classList.remove('skin-photo-primary'));
  panel.dataset.skinReady = '';

  return {
    sections,
    actions: panel.querySelector('.photo-actions'),
    hideHudRow: panel.querySelector('.photo-row:has(#photo-hide-hud)')
  };
}

function enhancePhotoMode() {
  const panel = document.querySelector('#photo-mode');
  if (!panel) return;
  if (photoScaffoldIsValid(panel)) return;

  const head = panel.querySelector('.photo-head');
  const normalized = normalizePhotoMode(panel);
  if (!head || !normalized) return;

  const { sections, actions, hideHudRow } = normalized;
  const [camera] = sections;

  const modebar = document.createElement('div');
  modebar.id = 'skin-photo-modebar';
  modebar.innerHTML = `${icon('camera')}<span>相机工作区</span><b>LIVE</b>`;
  head.after(modebar);

  const scroll = document.createElement('div');
  scroll.id = 'skin-photo-scroll';
  modebar.after(scroll);

  camera.classList.add('skin-photo-primary');
  if (actions) camera.prepend(actions);
  if (hideHudRow) camera.insertBefore(hideHudRow, camera.querySelector('.photo-section-title'));
  scroll.append(camera);
  createPresetButtons(scroll);

  const foldWrap = document.createElement('div');
  foldWrap.id = 'skin-photo-folds';
  scroll.append(foldWrap);

  const foldData = [
    [sections[1], 'clock', '时间与模拟', '日期 · 慢动作 · 逐帧'],
    [sections[2], 'focus', '景深', '焦点 · 光圈 · 虚化'],
    [sections[3], 'tune', '高级调色', '曝光 · 色温 · 颗粒'],
    [sections[4], 'export', '贴纸与导出', '文字 · 分辨率']
  ];

  foldData.forEach(([section, iconName, label, meta], index) => {
    const details = document.createElement('details');
    details.className = 'skin-photo-fold';
    details.dataset.fold = ['time', 'depth', 'look', 'export'][index];
    details.innerHTML = `<summary>${icon(iconName)}<span>${label}<small>${meta}</small></span>${icon('chevron')}</summary>`;
    details.append(section);
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      foldWrap.querySelectorAll('details[open]').forEach(other => {
        if (other !== details) other.open = false;
      });
    });
    foldWrap.append(details);
  });

  const save = document.querySelector('#photo-save');
  const status = document.querySelector('#photo-status');
  if (save) {
    const footer = document.createElement('footer');
    footer.id = 'skin-photo-footer';
    if (!save.querySelector('.skin-icon')) save.insertAdjacentHTML('afterbegin', icon('save'));
    footer.append(save);
    if (status) footer.append(status);
    panel.append(footer);
  }

  panel.dataset.skinReady = 'true';
}

function watchPhotoMode() {
  const panel = document.querySelector('#photo-mode');
  if (!panel) return;

  panel._skinPhotoObserver?.disconnect?.();

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!photoScaffoldIsValid(panel)) enhancePhotoMode();
    });
  });

  observer.observe(panel, { childList: true, subtree: true });
  panel._skinPhotoObserver = observer;
}

function promotePhotoButton() {
  const photoButton = document.querySelector('#photo-button');
  if (!photoButton) return;
  if (photoButton.parentElement !== document.body) document.body.append(photoButton);
  photoButton.classList.add('skin-top-photo-button');
}

function decorateControls() {
  const entries = [
    ['#browse-toggle', 'layers'], ['#photo-button', 'camera'],
    ['#browse-home', 'layers'], ['#photo-save', 'save']
  ];
  entries.forEach(([selector, name]) => {
    const element = document.querySelector(selector);
    if (element && !element.querySelector('.skin-icon')) element.insertAdjacentHTML('afterbegin', icon(name));
  });
}

export function initSkinSystem() {
  document.documentElement.style.setProperty(
    '--skin-preset-image',
    `url("${import.meta.env.BASE_URL}moon/albedo/browse-2048.webp")`
  );
  createSkinPicker();
  createBrowseCollapse();
  watchBrowseVisibility();
  promotePhotoButton();
  enhancePhotoMode();
  watchPhotoMode();
  decorateControls();
}
