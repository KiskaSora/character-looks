import { siteUrls, parseLooks, loadSiteJson } from './looks.js';
import { extBlocksInstalled, listTargetBlocks, pickTarget, sendLook, removeLook, toggleLook, hasLook, isLookDisabled, renderTemplate, DEFAULT_TEMPLATE } from './extblocks.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Окно «Внешности»: свои внешности (хранятся в настройках, сайт не нужен)
 * + необязательный список с сайта (wardrobe.json → looks) → Context Builder блока ExtBlocks.
 * adapters: { getUrl, getMine, saveMine(list), upsert(data) → look, getBlockRef, getBlockName,
 *             onBlock(ref), getTemplate, onTemplate(text), copy(text) }
 */
export function openLooks(adapters) {
    const { getUrl, getMine, deleteMine, upsert, getBlockRef, getBlockName, onBlock, getTemplate, onTemplate, copy } = adapters;
    const urls = siteUrls(getUrl());
    document.getElementById('wlook-l-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wlook-l-overlay';
    overlay.className = 'wlook-s-overlay wlook-l-overlay';
    overlay.innerHTML = `
        <div class="wlook-s-modal wlook-l-modal">
            <div class="wlook-s-modal-head">
                <span class="wlook-s-modal-title"><i class="fa-solid fa-face-smile"></i> Внешности</span>
                ${urls ? `<a class="wlook-s-source-link" href="${esc(urls.site)}" target="_blank" rel="noopener" title="Открыть сайт"><i class="fa-solid fa-arrow-up-right-from-square"></i> Сайт</a>
                <div class="wlook-s-refresh menu_button wlook-l-refresh" title="Обновить с сайта"><i class="fa-solid fa-rotate"></i></div>` : ''}
                <div class="wlook-s-refresh menu_button wlook-l-close" title="Закрыть"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="wlook-l-targetrow"><span>Context Builder блока:</span><select class="text_pole wlook-l-block"></select></div>
            <details class="wlook-l-tpl">
                <summary><i class="fa-solid fa-pen-to-square"></i> Шаблон записи</summary>
                <textarea class="text_pole wlook-l-tpl-text" rows="5"></textarea>
                <small>{{name}} — имя персонажа, {{desc}} — все теги внешности целиком.</small>
                <div class="menu_button wlook-l-tpl-reset"><i class="fa-solid fa-rotate-left"></i> Вернуть стандартный</div>
            </details>
            <details class="wlook-l-custom" open>
                <summary class="wlook-l-form-title"><i class="fa-solid fa-user-plus"></i> Добавить внешность</summary>
                <input type="text" class="text_pole wlook-l-c-name" placeholder="Имя персонажа">
                <textarea class="text_pole wlook-l-c-desc" rows="4" placeholder="Теги внешности — вставятся целиком"></textarea>
                <div class="wlook-l-mine-actions">
                    <div class="menu_button wlook-l-c-save"><i class="fa-solid fa-floppy-disk"></i> <span>Сохранить</span></div>
                    <div class="menu_button wlook-l-c-send"><i class="fa-solid fa-paper-plane"></i> Сохранить и в Context Builder</div>
                    <div class="menu_button wlook-l-c-cancel" style="display:none"><i class="fa-solid fa-xmark"></i> Отмена</div>
                </div>
            </details>
            <div class="wlook-s-body wlook-l-body"><div class="wlook-s-loading">Загрузка…</div></div>
        </div>`;
    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.wlook-l-modal');
    const bodyEl = overlay.querySelector('.wlook-l-body');
    const blockSel = overlay.querySelector('.wlook-l-block');
    const nameEl = overlay.querySelector('.wlook-l-c-name');
    const descEl = overlay.querySelector('.wlook-l-c-desc');
    const cancelBtn = overlay.querySelector('.wlook-l-c-cancel');
    const saveLabel = overlay.querySelector('.wlook-l-c-save span');
    const formTitle = overlay.querySelector('.wlook-l-form-title');
    let siteLooks = [];
    let siteError = '';
    let siteLoading = !!urls;
    let editId = '';

    const tplEl = overlay.querySelector('.wlook-l-tpl-text');
    tplEl.value = getTemplate() || DEFAULT_TEMPLATE;
    tplEl.addEventListener('input', () => { onTemplate(tplEl.value); });
    tplEl.addEventListener('change', () => render());
    overlay.querySelector('.wlook-l-tpl-reset').addEventListener('click', () => { tplEl.value = DEFAULT_TEMPLATE; onTemplate(''); render(); });
    const tpl = () => tplEl.value;

    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
    function close() { document.removeEventListener('keydown', onKey, true); overlay.remove(); }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    for (const t of ['click', 'mousedown', 'pointerdown', 'pointerup']) modal.addEventListener(t, e => e.stopPropagation());
    for (const t of ['touchstart', 'touchend']) modal.addEventListener(t, e => e.stopPropagation(), { passive: true });
    overlay.querySelector('.wlook-l-close').addEventListener('click', close);

    const target = () => pickTarget(blockSel.value || getBlockRef(), getBlockName());

    function fillBlocks() {
        if (!extBlocksInstalled()) {
            blockSel.innerHTML = '<option value="">ExtBlocks не найден</option>';
            blockSel.disabled = true;
            return;
        }
        const list = listTargetBlocks();
        const cur = pickTarget(getBlockRef(), getBlockName());
        blockSel.innerHTML = list.length
            ? list.map(t => `<option value="${esc(t.ref)}" ${cur && cur.ref === t.ref ? 'selected' : ''}>${esc(t.label)}</option>`).join('')
            : '<option value="">Нет блоков</option>';
        blockSel.disabled = !list.length;
    }
    blockSel.addEventListener('change', () => { onBlock(blockSel.value); render(); });

    function card(l, mine) {
        const t = target();
        const inBlock = !!(t && hasLook(t.block, l));
        const off = inBlock && isLookDisabled(t.block, l);
        return `<article class="wlook-l-card ${inBlock ? (off ? 'wlook-l-off' : 'wlook-l-in') : ''}" data-id="${esc(l.id)}" data-mine="${mine ? 1 : 0}">
            <div class="wlook-l-head">
                <b class="wlook-l-name">${esc(l.name)}</b>
                ${inBlock ? `<span class="wlook-l-state"><i class="fa-solid ${off ? 'fa-eye-slash' : 'fa-circle-check'}"></i> ${off ? 'выключена' : 'в блоке'}</span>` : ''}
            </div>
            <div class="wlook-l-desc" data-act="expand" title="Показать целиком">${l.desc ? esc(renderTemplate(tpl(), l)) : '<i>Описания пока нет</i>'}</div>
            <div class="wlook-l-actions">
                <button type="button" class="menu_button wlook-l-send" data-act="send" ${l.desc && t ? '' : 'disabled'}><i class="fa-solid fa-paper-plane"></i> ${inBlock ? 'Обновить в блоке' : 'В Context Builder'}</button>
                ${inBlock ? `<button type="button" class="menu_button" data-act="toggle" title="${off ? 'Включить пункт' : 'Выключить пункт'}"><i class="fa-solid ${off ? 'fa-eye' : 'fa-eye-slash'}"></i></button>
                <button type="button" class="menu_button" data-act="remove" title="Убрать из блока"><i class="fa-solid fa-trash"></i></button>` : ''}
                <button type="button" class="menu_button" data-act="copy" title="Копировать запись целиком" ${l.desc ? '' : 'disabled'}><i class="fa-solid fa-copy"></i></button>
                ${mine ? `<button type="button" class="menu_button" data-act="edit" title="Изменить"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="menu_button" data-act="delete" title="Удалить из моего списка"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </div>
        </article>`;
    }

    function render() {
        const mine = getMine();
        let html = '';
        if (mine.length) html += `<div class="wlook-l-section">Мои внешности</div><div class="wlook-l-list">${mine.map(l => card(l, true)).join('')}</div>`;
        if (urls) {
            html += '<div class="wlook-l-section">С сайта</div>';
            if (siteLoading) html += '<div class="wlook-s-loading">Загрузка внешностей…</div>';
            else if (siteError) html += `<p class="hint" style="padding:8px 16px;">Не удалось загрузить (${esc(urls.data)}): ${esc(siteError)}</p>`;
            else if (!siteLooks.length) html += '<div class="wlook-l-empty">На сайте пока нет внешностей (раздел «Внешности»)</div>';
            else html += `<div class="wlook-l-list">${siteLooks.map(l => card(l, false)).join('')}</div>`;
        }
        if (!mine.length && !urls) html = '<div class="wlook-l-empty">Пока пусто.<br>Впиши имя и теги выше и нажми «Сохранить» — внешность останется в списке, сайт не нужен.</div>';
        bodyEl.innerHTML = html;
        for (const el of bodyEl.querySelectorAll('.wlook-l-card')) {
            const isMine = el.dataset.mine === '1';
            const look = (isMine ? getMine() : siteLooks).find(x => x.id === el.dataset.id);
            if (!look) continue;
            el.querySelector('[data-act="expand"]').addEventListener('click', e => e.currentTarget.classList.toggle('wlook-l-open'));
            el.querySelector('[data-act="copy"]').addEventListener('click', async () => {
                const ok = await copy(renderTemplate(tpl(), look));
                ok ? toastr.success('Запись скопирована', 'Внешности', { timeOut: 1800 }) : toastr.error('Не удалось скопировать', 'Внешности');
            });
            el.querySelector('[data-act="send"]').addEventListener('click', () => push(look));
            el.querySelector('[data-act="toggle"]')?.addEventListener('click', async () => {
                const t = target();
                if (t) { await toggleLook(t, look); render(); }
            });
            el.querySelector('[data-act="remove"]')?.addEventListener('click', async () => {
                const t = target();
                if (t) { await removeLook(t, look); toastr.info('Убрана из Context Builder', 'Внешности', { timeOut: 1800 }); render(); }
            });
            el.querySelector('[data-act="edit"]')?.addEventListener('click', () => startEdit(look));
            el.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
                const t = target();
                if (t && hasLook(t.block, look)) await removeLook(t, look); // вместе с пунктом в блоке, чтобы не висел сиротой
                deleteMine(look.id);
                if (editId === look.id) resetForm();
                toastr.info(`«${look.name}» удалена из списка`, 'Внешности', { timeOut: 1800 });
                render();
            });
        }
    }

    async function push(look) {
        const t = target();
        if (!t) return toastr.error('Не выбран блок ExtBlocks', 'Внешности');
        try {
            const res = await sendLook(t, look, tpl());
            onBlock(t.ref);
            toastr.success(res === 'added' ? `«${look.name}» добавлена в Context Builder` : `«${look.name}» обновлена в Context Builder`, 'Внешности', { timeOut: 2500 });
            render();
        } catch (e) { toastr.error('Не удалось: ' + String(e.message || e), 'Внешности'); }
    }

    function resetForm() {
        editId = '';
        nameEl.value = '';
        descEl.value = '';
        cancelBtn.style.display = 'none';
        saveLabel.textContent = 'Сохранить';
        formTitle.innerHTML = '<i class="fa-solid fa-user-plus"></i> Добавить внешность';
    }

    function startEdit(look) {
        editId = look.id;
        nameEl.value = look.name;
        descEl.value = look.desc;
        cancelBtn.style.display = '';
        saveLabel.textContent = 'Сохранить изменения';
        formTitle.innerHTML = '<i class="fa-solid fa-pen"></i> Изменение внешности';
        overlay.querySelector('.wlook-l-custom').open = true;
        nameEl.scrollIntoView({ block: 'nearest' });
    }

    async function save(alsoSend) {
        try {
            const look = upsert({ id: editId, name: nameEl.value, desc: descEl.value });
            const wasEdit = !!editId;
            resetForm();
            toastr.success(wasEdit ? `«${look.name}» изменена` : `«${look.name}» сохранена`, 'Внешности', { timeOut: 1800 });
            if (alsoSend) await push(look); else render();
        } catch (e) { toastr.error(String(e.message || e), 'Внешности'); }
    }
    overlay.querySelector('.wlook-l-c-save').addEventListener('click', () => save(false));
    overlay.querySelector('.wlook-l-c-send').addEventListener('click', () => save(true));
    cancelBtn.addEventListener('click', resetForm);

    async function load(force = false) {
        if (!urls) return;
        siteLoading = true; siteError = '';
        render();
        try {
            siteLooks = parseLooks(await loadSiteJson(urls.data, force));
        } catch (e) { siteError = String(e.message || e); }
        siteLoading = false;
        if (overlay.isConnected) { fillBlocks(); render(); }
    }
    overlay.querySelector('.wlook-l-refresh')?.addEventListener('click', () => load(true));

    fillBlocks();
    render();
    load();
    return { close };
}
