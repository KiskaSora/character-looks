/**
 * Внешности персонажей — отдельная расширка (без каталога гардероба).
 * Теги внешности → текстовый пункт в Context Builder блока ExtBlocks.
 * Источники: свои внешности (хранятся в настройках, сайт не нужен)
 * и, по желанию, раздел «Внешности» с сайта (wardrobe.json → looks).
 */

import { openLooks } from './src/looksUi.js';
import { DEFAULT_TEMPLATE } from './src/extblocks.js';
import { normalizeMine, upsertMine, removeMine } from './src/looks.js';

const KEY = 'character_looks';
const OLD_KEY = 'wardrobe_catalog'; // настройки прежнего «Каталога образов» — только читаем, чтобы перенести

const defaults = () => ({
    looksUrl: '',          // пусто = без сайта
    mine: [],              // свои внешности: [{ id, name, desc }]
    ebBlockName: 'nai_imagen',
    ebBlockRef: '',
    lookTemplate: '',
});

function ctx() { return SillyTavern.getContext(); }
function save() { ctx().saveSettingsDebounced(); }
function uid() { return 'my:' + (ctx().uuidv4 ? ctx().uuidv4() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); }

function getSettings() {
    const store = ctx().extensionSettings;
    if (!store[KEY]) {
        store[KEY] = defaults();
        // один раз подхватываем ссылку/блок/шаблон из старой расширки, если она стояла
        const old = store[OLD_KEY];
        if (old && typeof old === 'object') {
            if (typeof old.looksUrl === 'string') store[KEY].looksUrl = old.looksUrl;
            if (typeof old.ebBlockName === 'string' && old.ebBlockName) store[KEY].ebBlockName = old.ebBlockName;
            if (typeof old.ebBlockRef === 'string') store[KEY].ebBlockRef = old.ebBlockRef;
            if (typeof old.lookTemplate === 'string') store[KEY].lookTemplate = old.lookTemplate;
        }
    }
    const s = store[KEY];
    if (typeof s.looksUrl !== 'string') s.looksUrl = '';
    s.mine = normalizeMine(s.mine);
    if (typeof s.ebBlockName !== 'string' || !s.ebBlockName.trim()) s.ebBlockName = 'nai_imagen';
    if (typeof s.ebBlockRef !== 'string') s.ebBlockRef = '';
    if (typeof s.lookTemplate !== 'string') s.lookTemplate = '';
    return s;
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;left:-999px';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { /* ignore */ }
        ta.remove();
        return ok;
    }
}

export function openLooksWindow() {
    const s = getSettings();
    openLooks({
        getUrl: () => s.looksUrl,
        getMine: () => s.mine,
        upsert: (data) => {
            const { list, look } = upsertMine(s.mine, data, uid);
            s.mine = list; save();
            return look;
        },
        deleteMine: (id) => { s.mine = removeMine(s.mine, id); save(); },
        getBlockRef: () => s.ebBlockRef,
        getBlockName: () => s.ebBlockName,
        onBlock: (ref) => { s.ebBlockRef = ref || ''; save(); },
        getTemplate: () => s.lookTemplate || DEFAULT_TEMPLATE,
        onTemplate: (text) => { s.lookTemplate = text || ''; save(); },
        copy: copyText,
    });
}

function renderSettings(root) {
    const s = getSettings();
    root.innerHTML = `
        <label class="wlook-target-row">Блок ExtBlocks (его Context Builder):
            <input type="text" class="text_pole wlook-eb-name" placeholder="nai_imagen">
        </label>
        <label class="wlook-target-row">Сайт с внешностями (необязательно):
            <input type="text" class="text_pole wlook-looks-url" placeholder="https://…/wardrobe/ — можно оставить пустым">
        </label>
        <div class="flex-container">
            <div class="menu_button wlook-open"><i class="fa-solid fa-face-smile"></i> Открыть внешности</div>
        </div>
        <small>Сайт не нужен: свои внешности добавляются прямо в окне и хранятся в настройках. Если сайт есть — его раздел «Внешности» (wardrobe.json → looks) покажется рядом.</small>`;
    const lu = root.querySelector('.wlook-looks-url');
    lu.value = s.looksUrl;
    lu.addEventListener('input', e => { s.looksUrl = e.target.value.trim(); save(); });
    const en = root.querySelector('.wlook-eb-name');
    en.value = s.ebBlockName;
    en.addEventListener('input', e => { s.ebBlockName = e.target.value.trim(); s.ebBlockRef = ''; save(); });
    root.querySelector('.wlook-open').addEventListener('click', () => openLooksWindow());
}

function addSettingsPanel() {
    if (document.getElementById('wlook_settings')) return;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.id = 'wlook_settings';
    wrap.className = 'extension_container';
    wrap.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Внешности персонажей</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content"><div id="wlook_settings_body"></div></div>
        </div>`;
    host.appendChild(wrap);
    renderSettings(wrap.querySelector('#wlook_settings_body'));
}

function addMenuButton() {
    if (document.getElementById('wlook_menu_button')) return;
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    const btn = document.createElement('div');
    btn.id = 'wlook_menu_button';
    btn.className = 'list-group-item flex-container flexGap5';
    btn.innerHTML = '<div class="fa-solid fa-face-smile extensionsMenuExtensionButton"></div><span>Внешности персонажей</span>';
    btn.addEventListener('click', () => openLooksWindow());
    menu.appendChild(btn);
}

(function init() {
    const c = ctx();
    getSettings();
    window.CharacterLooks = { openLooks: openLooksWindow };
    c.eventSource.on(c.event_types.APP_READY, () => {
        try { addMenuButton(); } catch (e) { console.error('[LOOKS] menu button', e); }
        try { addSettingsPanel(); } catch (e) { console.error('[LOOKS] settings panel', e); }
    });
    console.log('[LOOKS] Внешности персонажей загружены');
})();
