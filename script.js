// ====== Supabase 설정 ======
const supabaseUrl = 'https://wwtlccjhiearimyuquwh.supabase.co';
// 주의: 따옴표 안에 아까 복사한 sb_publishable_... 키를 전부 붙여넣어!
const supabaseKey = 'sb_publishable_cJRd9WgKIcPA1xGGuXO4gA_6geEwGGD'; 
// 변수 이름을 supabase에서 db로 변경
const db = window.supabase.createClient(supabaseUrl, supabaseKey);
// ===========================

const ORDER_STORAGE_KEY = 'mapleBossPartyOrder_v1';
const CLEARED_BOSSES_FALLBACK_KEY = 'mapleBossClearedBosses_v1';

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-' + tabId).classList.add('active');
    document.getElementById('btn-' + tabId).classList.add('active');
}

const bossConfig = [
    { key: '익스우', name: '익스우', diffs: ['선택'], isMonthly: false },
    { key: '세렌', name: '세렌', diffs: ['노말', '하드', '익스'], isMonthly: false },
    { key: '칼로스', name: '칼로스', diffs: ['노말', '카오스', '익스'], isMonthly: false },
    { key: '대적자', name: '대적자', diffs: ['이지', '노말', '하드', '익스'], isMonthly: false },
    { key: '카링', name: '카링', diffs: ['이지', '노말', '하드', '익스'], isMonthly: false },
    { key: '흉성', name: '흉성', diffs: ['노말', '하드'], isMonthly: false },
    { key: '벨로나', name: '벨로나', diffs: ['이지', '노말', '하드'], isMonthly: false },
    { key: '림보', name: '림보', diffs: ['노말', '하드'], isMonthly: false },
    { key: '발드릭스', name: '발드릭스', diffs: ['노말', '하드'], isMonthly: false },
    { key: '검은마법사', name: '검은마법사', diffs: ['하드', '익스'], isMonthly: true }
];

let currentBossState = {}; 
let editingCardId = null; 
let currentSelectedCardId = null; 
let partiesData = []; 
let characterSpecsMap = new Map(); 
let sortableInstances = [];
let isDraggingCard = false;

function initBosses() {
    bossConfig.forEach(b => currentBossState[b.key] = -1);
    renderBossToggles();
}

// 현재 모달에서 월간 보스(검은마법사)가 선택되어 있는지 확인
function isMonthlyBossSelectedInModal() {
    return bossConfig.some(b => b.isMonthly && currentBossState[b.key] > -1);
}

// 주간 보스 vs 월간 보스 선택 상태에 따라 좌측 일정 입력창(요일+시간 vs 날짜/메모) 전환
function syncScheduleInputMode() {
    const isMonthly = isMonthlyBossSelectedInModal();
    const weeklyInputs = document.getElementById('weeklyScheduleInputs');
    const monthlyInputs = document.getElementById('monthlyScheduleInputs');

    if (!weeklyInputs || !monthlyInputs) return;

    if (isMonthly) {
        weeklyInputs.classList.add('hidden');
        monthlyInputs.classList.remove('hidden');
    } else {
        weeklyInputs.classList.remove('hidden');
        monthlyInputs.classList.add('hidden');
    }
}

function getBossToggleButtonHtml(b) {
    const stateIdx = currentBossState[b.key];
    const isSelected = stateIdx > -1;
    const currentDiff = isSelected ? b.diffs[stateIdx] : null;
    
    const diffText = isSelected && currentDiff !== '선택' ? `(${currentDiff})` : '';
    
    let bgClass = 'bg-slate-100 text-slate-500 hover:bg-slate-200';
    if (isSelected) {
        if (currentDiff === '이지') bgClass = 'bg-[#98a3ab] text-white shadow-sm';
        else if (currentDiff === '노말') bgClass = 'bg-[#47a8c9] text-white shadow-sm';
        else if (currentDiff === '하드') bgClass = 'bg-[#d65e86] text-white shadow-sm';
        else if (currentDiff === '카오스') bgClass = 'bg-[#474546] text-[#e0c39a] ring-1 ring-[#e0c39a] shadow-sm';
        else if (currentDiff === '익스' || currentDiff === '선택') bgClass = 'bg-[#3b3b3b] text-[#e56041] ring-1 ring-[#e14251] shadow-sm';
    }
    
    return `
        <button type="button" onclick="toggleBoss('${b.key}')" oncontextmenu="cancelBoss(event, '${b.key}')"
                class="w-full px-1 py-2 rounded-md text-[13px] font-medium transition-all whitespace-nowrap ${bgClass}">
            ${b.name}${diffText}
        </button>
    `;
}

function renderBossToggles() {
    const container = document.getElementById('bossToggles');
    const weeklyBosses = bossConfig.filter(b => !b.isMonthly);
    const monthlyBosses = bossConfig.filter(b => b.isMonthly);

    const weeklyHtml = weeklyBosses.map(b => getBossToggleButtonHtml(b)).join('');
    const monthlyHtml = monthlyBosses.map(b => getBossToggleButtonHtml(b)).join('');

    container.innerHTML = `
        <div class="text-xs font-bold text-slate-500 mb-1.5">[ 주간 보스 ]</div>
        <div class="grid grid-cols-3 gap-2 mb-3">
            ${weeklyHtml}
        </div>
        <div class="border-t border-dashed border-slate-300 pt-3 mt-2">
            <div class="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                <span>[ 👑 월간 보스 ]</span>
                <span class="text-[11px] font-normal text-slate-400">(선택 시 일정 입력창이 날짜/메모로 전환됨)</span>
            </div>
            <div class="grid grid-cols-3 gap-2">
                ${monthlyHtml}
            </div>
        </div>
    `;

    syncScheduleInputMode();
}

function toggleBoss(key) {
    const config = bossConfig.find(b => b.key === key);
    if (!config) return;

    // 주간 보스와 월간 보스('검은마법사') 상호 배타적 선택 제어
    if (config.isMonthly) {
        bossConfig.filter(b => !b.isMonthly).forEach(b => {
            currentBossState[b.key] = -1;
        });
    } else {
        bossConfig.filter(b => b.isMonthly).forEach(b => {
            currentBossState[b.key] = -1;
        });
    }

    currentBossState[key]++;
    
    if (currentBossState[key] >= config.diffs.length) {
        currentBossState[key] = -1;
    }
    renderBossToggles();
}

function cancelBoss(event, key) {
    event.preventDefault(); 
    currentBossState[key] = -1; 
    renderBossToggles(); 
}

function getSelectedBossesString() {
    let selected = [];
    bossConfig.forEach(b => {
        const stateIdx = currentBossState[b.key];
        if (stateIdx > -1) {
            if (b.diffs[stateIdx] === '선택') {
                selected.push(b.name); 
            } else {
                selected.push(`${b.name}(${b.diffs[stateIdx]})`);
            }
        }
    });
    return selected.join(',');
}

function getBadgeColor(bossName) {
    if(bossName.includes('이지')) return 'bg-[#98a3ab] text-white';
    if(bossName.includes('노말')) return 'bg-[#47a8c9] text-white';
    if(bossName.includes('하드')) return 'bg-[#d65e86] text-white';
    if(bossName.includes('카오스')) return 'bg-[#474546] text-[#e0c39a] ring-1 ring-[#e0c39a]';
    if(bossName.includes('익스')) return 'bg-[#3b3b3b] text-[#e56041] ring-1 ring-[#e14251]';
    return 'bg-slate-200 text-slate-700';
}

// DB에 cleared_bosses 컬럼이 없거나 반영 전일 때를 대비한 로컬 보조 저장소
function getLocalClearedFallbackMap() {
    try {
        const raw = localStorage.getItem(CLEARED_BOSSES_FALLBACK_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveLocalClearedFallback(partyId, clearedStr) {
    try {
        const map = getLocalClearedFallbackMap();
        map[partyId] = clearedStr;
        localStorage.setItem(CLEARED_BOSSES_FALLBACK_KEY, JSON.stringify(map));
    } catch (e) {}
}

// Supabase 업데이트 시 cleared_bosses 컬럼 에러가 나면 자동으로 기본 컬럼만으로 재시도하는 안전 래퍼
async function safeInsertParty(newParty) {
    let { error } = await db.from('parties').insert([newParty]);
    if (error && error.message && error.message.includes('cleared_bosses')) {
        const { cleared_bosses, ...fallbackParty } = newParty;
        const retry = await db.from('parties').insert([fallbackParty]);
        error = retry.error;
    }
    return { error };
}

async function safeUpdateParty(partyId, payload) {
    if ('cleared_bosses' in payload) {
        saveLocalClearedFallback(partyId, payload.cleared_bosses);
    }
    let { error } = await db.from('parties').update(payload).eq('id', partyId);
    if (error && error.message && error.message.includes('cleared_bosses')) {
        const { cleared_bosses, ...fallbackPayload } = payload;
        if (Object.keys(fallbackPayload).length > 0) {
            const retry = await db.from('parties').update(fallbackPayload).eq('id', partyId);
            error = retry.error;
        } else {
            error = null;
        }
    }
    return { error };
}

// 파티의 보스 목록과 클리어한 보스 목록을 배열로 파싱하는 헬퍼 함수
function getBossList(bossesStr) {
    if (!bossesStr) return [];
    return bossesStr.split(',').map(b => b.trim()).filter(b => b.length > 0);
}

function getClearedBossList(party) {
    const allBosses = getBossList(party.bosses);
    let sourceStr = party.cleared_bosses;

    if (sourceStr === undefined || sourceStr === null) {
        const fallbackMap = getLocalClearedFallbackMap();
        if (party.id in fallbackMap) {
            sourceStr = fallbackMap[party.id];
        } else if (party.is_cleared === true) {
            return [...allBosses];
        }
    }

    if (!sourceStr) return [];
    const rawCleared = sourceStr.split(',').map(b => b.trim()).filter(b => b.length > 0);
    return rawCleared.filter(b => allBosses.includes(b));
}

function isPartyAllCleared(party) {
    const allBosses = getBossList(party.bosses);
    const clearedBosses = getClearedBossList(party);
    return allBosses.length > 0 ? clearedBosses.length === allBosses.length : party.is_cleared === true;
}

// 카드 테두리 및 배경 색상 결정 (미진행 / 진행 중 / 완료)
function getCardStatusClasses(party) {
    const allBosses = getBossList(party.bosses);
    const clearedBosses = getClearedBossList(party);

    if (allBosses.length === 0) {
        return party.is_cleared ? 'border-green-500 bg-green-50' : 'border-red-400 bg-slate-50';
    }

    if (clearedBosses.length === 0) {
        return 'border-red-400 bg-slate-50'; // 0개 클리어 (미진행)
    } else if (clearedBosses.length < allBosses.length) {
        return 'border-amber-400 bg-amber-50/30'; // 일부 클리어 (진행 중)
    } else {
        return 'border-green-500 bg-green-50'; // 전부 클리어 (완료)
    }
}

// 캐릭터가 특정 보스에 대해 가진 솔플배율(%) 조회 헬퍼
function getCharBossMultiplier(charName, bossName) {
    if (!charName || !bossName) return null;
    const specs = characterSpecsMap.get(charName.trim());
    if (!specs || typeof specs !== 'object') return null;

    if (specs[bossName] !== undefined && specs[bossName] !== null && !isNaN(Number(specs[bossName]))) {
        return Number(specs[bossName]);
    }

    // 별칭 호환 (예: '익스우' <-> '스우(익스)', '검은마법사(하드)' <-> '검은 마법사(하드)' 등)
    const normalizedTarget = bossName.replace(/\s+/g, '');
    for (const [k, v] of Object.entries(specs)) {
        if (v === undefined || v === null || isNaN(Number(v))) continue;
        const normalizedKey = k.replace(/\s+/g, '');
        if (normalizedKey === normalizedTarget) return Number(v);
        if (bossName === '익스우' && (normalizedKey === '스우(익스)' || normalizedKey === '익스스우')) {
            return Number(v);
        }
    }
    return null;
}

// 파티의 특정 보스에 대한 참여 캐릭터들의 배율 총합(파티배율) 텍스트 반환
function getPartyBossTotalMultiplierText(party, bossName) {
    if (!party || !party.chars) return '-';
    const chars = party.chars.split(',').map(c => c.trim()).filter(c => c.length > 0);
    if (chars.length === 0) return '-';

    let sum = 0;
    let hasAny = false;
    chars.forEach(c => {
        const val = getCharBossMultiplier(c, bossName);
        if (val !== null) {
            sum += val;
            hasAny = true;
        }
    });

    if (!hasAny) return '-';
    const rounded = Math.round(sum * 10) / 10;
    return `${rounded}%`;
}

// 개별 보스 뱃지 HTML 생성 (클리어 시 무난하고 깔끔한 슬레이트 회색 + 취소선 스타일, 바로 아래에 합산 배율 표시)
function renderBossBadgesHtml(party, sizeClass = 'text-xs px-2 py-0.5') {
    const allBosses = getBossList(party.bosses);
    if (allBosses.length === 0) {
        return `<span class="text-xs text-slate-400">선택된 보스 없음</span>`;
    }
    const clearedBosses = getClearedBossList(party);

    return allBosses.map(b => {
        const isBossCleared = clearedBosses.includes(b);
        const safeBossName = b.replace(/'/g, "\\'");
        
        // 안 깬 보스는 원래의 선명한 색상, 깬 보스는 깔끔한 회색 톤 + 취소선으로 차분하게 표현
        const badgeStyle = isBossCleared 
            ? 'bg-slate-200 text-slate-400 line-through font-medium' 
            : `${getBadgeColor(b)} font-bold hover:brightness-110`;

        const totalMultText = getPartyBossTotalMultiplierText(party, b);

        return `<div class="inline-flex flex-col items-center shrink-0">
                    <span onclick="toggleBossClear(event, '${party.id}', '${safeBossName}')" 
                          oncontextmenu="toggleBossClear(event, '${party.id}', '${safeBossName}')"
                          title="클릭하여 '${b}' 클리어 상태 변경"
                          class="${sizeClass} rounded ${badgeStyle} shrink-0 cursor-pointer select-none transition inline-flex items-center">${b}</span>
                    <span class="text-xs font-mono text-slate-500 mt-0.5 leading-none">${totalMultText}</span>
                </div>`;
    }).join('');
}

// 참여자 명단 컴팩트 가로 나열 HTML 생성 (검색 키워드 하이라이트 지원)
function renderCompactCharsHtml(charsStr, highlightKeywords = []) {
    if (!charsStr) return '';
    const chars = charsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
    return chars.map(c => {
        const isMatched = highlightKeywords.length > 0 && highlightKeywords.some(kw => c.includes(kw));
        if (isMatched) {
            return `<span class="inline-block font-bold text-blue-600 bg-blue-50 px-1.5 rounded ring-1 ring-blue-200">${c}</span>`;
        }
        return `<span class="inline-block">${c}</span>`;
    }).join('<span class="text-slate-300 mx-1">·</span>');
}

// ====== 카드 순서 저장 및 불러오기 (드래그 앤 드롭 정렬 유지) ======
function getSavedOrderMap() {
    try {
        const raw = localStorage.getItem(ORDER_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveContainerOrder(groupKey, orderedIds) {
    try {
        const map = getSavedOrderMap();
        map[groupKey] = orderedIds;
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
        console.error('순서 저장 실패:', e);
    }
}

function sortPartiesBySavedOrder(parties, groupKey) {
    const map = getSavedOrderMap();
    const savedIds = map[groupKey] || [];
    if (savedIds.length === 0) return parties;

    return [...parties].sort((a, b) => {
        const idxA = savedIds.indexOf(a.id);
        const idxB = savedIds.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });
}
// ==============================================================

function openModal() {
    editingCardId = null; 
    document.getElementById('modalTitle').innerText = '새 파티 추가';
    document.getElementById('submitBtn').innerText = '추가하기';
    document.getElementById('partyModal').classList.remove('hidden');
    syncScheduleInputMode();
}

function closeModal() {
    document.getElementById('partyModal').classList.add('hidden');
    document.getElementById('addPartyForm').reset(); 
    initBosses(); 
}

function renderPartyCardHtml(p) {
    const charListHtml = renderCompactCharsHtml(p.chars);
    const bossTagsHtml = renderBossBadgesHtml(p, 'text-xs px-2 py-0.5');
    const borderClass = getCardStatusClasses(p);
    const timeLabel = p.time || '일정 미정';

    return `
        <div id="${p.id}" data-party-id="${p.id}" onclick="handleCardClick(event, '${p.id}')" 
             oncontextmenu="handleCardRightClick(event, '${p.id}')"
             class="party-card ${borderClass} border-2 p-2.5 rounded cursor-pointer hover:shadow-md transition flex flex-col w-full select-none">
            <div class="flex justify-between items-start mb-2 shrink-0 gap-2">
                <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span class="font-bold text-sm text-slate-800 break-words leading-tight" title="${p.title}">${p.title}</span>
                    ${bossTagsHtml}
                </div>
                <span class="text-[11px] bg-slate-200/90 text-slate-700 px-1.5 py-0.5 rounded font-mono shrink-0 mt-0.5">${timeLabel}</span>
            </div>
            <div class="border-t pt-1.5 border-slate-200/80 mt-auto">
                <div class="flex flex-wrap items-center gap-y-0.5 text-xs text-slate-700 leading-snug">${charListHtml}</div>
            </div>
        </div>
    `;
}

// 좌클릭: 전체 완료/미완료 토글 (드래그 직후 클릭은 무시)
function handleCardClick(event, partyId) {
    if (isDraggingCard) return;
    toggleCardColor(event, partyId);
}

// 우클릭: 파티 상세/수정 모달 열기
function handleCardRightClick(event, partyId) {
    event.preventDefault();
    event.stopPropagation();
    if (isDraggingCard) return;
    showDetailModal(partyId);
}

// SortableJS를 이용해 카드를 꾹 눌러 위아래(또는 다른 요일 기둥)로 순서 이동
function initSortableLists() {
    sortableInstances.forEach(inst => inst.destroy());
    sortableInstances = [];

    if (typeof Sortable === 'undefined') return;

    // 1. 주간 요일별 기둥 드래그 앤 드롭
    document.querySelectorAll('.kanban-day-list').forEach(listEl => {
        const instance = new Sortable(listEl, {
            group: 'weekly-parties',
            animation: 180,
            delay: 140,
            delayOnTouchOnly: false,
            touchStartThreshold: 5,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            filter: 'button, span[onclick]',
            preventOnFilter: false,
            onStart: function () {
                isDraggingCard = true;
            },
            onEnd: async function (evt) {
                setTimeout(() => { isDraggingCard = false; }, 50);

                const fromDay = evt.from.dataset.day;
                const toDay = evt.to.dataset.day;
                const movedPartyId = evt.item.dataset.partyId;

                const toIds = Array.from(evt.to.querySelectorAll('.party-card')).map(el => el.dataset.partyId);
                saveContainerOrder(toDay, toIds);

                if (fromDay && toDay && fromDay !== toDay) {
                    const fromIds = Array.from(evt.from.querySelectorAll('.party-card')).map(el => el.dataset.partyId);
                    saveContainerOrder(fromDay, fromIds);

                    const party = partiesData.find(p => p.id === movedPartyId);
                    if (party) {
                        party.day = toDay;
                        await safeUpdateParty(movedPartyId, { day: toDay });
                    }
                }
            }
        });
        sortableInstances.push(instance);
    });

    // 2. 월간 보스(검은마법사) 구역 드래그 앤 드롭 순서 변경
    const monthlyContainer = document.getElementById('monthlyBossContainer');
    if (monthlyContainer && monthlyContainer.querySelectorAll('.party-card').length > 0) {
        const monthlySortable = new Sortable(monthlyContainer, {
            group: 'monthly-parties',
            animation: 180,
            delay: 140,
            delayOnTouchOnly: false,
            touchStartThreshold: 5,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            filter: 'button, span[onclick]',
            preventOnFilter: false,
            onStart: function () {
                isDraggingCard = true;
            },
            onEnd: function () {
                setTimeout(() => { isDraggingCard = false; }, 50);
                const orderedIds = Array.from(monthlyContainer.querySelectorAll('.party-card')).map(el => el.dataset.partyId);
                saveContainerOrder('monthly', orderedIds);
            }
        });
        sortableInstances.push(monthlySortable);
    }
}

function renderKanban() {
    const container = document.getElementById('kanbanContainer');
    const emptyMsg = document.getElementById('emptyKanbanMsg');
    const monthlySection = document.getElementById('monthlyBossSection');
    const monthlyContainer = document.getElementById('monthlyBossContainer');
    
    container.innerHTML = '';
    if (monthlyContainer) monthlyContainer.innerHTML = '';
    
    if (partiesData.length === 0) {
        emptyMsg.style.display = 'block';
        if (monthlySection) monthlySection.classList.add('hidden');
        return;
    } else {
        emptyMsg.style.display = 'none';
    }

    // 주간 보스 파티와 월간 보스('검은마법사' 포함) 파티 분리
    const weeklyParties = partiesData.filter(p => !(p.bosses && p.bosses.includes('검은마법사')));
    const monthlyParties = partiesData.filter(p => p.bosses && p.bosses.includes('검은마법사'));

    const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const dayInfo = {
        'mon': { name: '월요일', color: 'text-slate-800' },
        'tue': { name: '화요일', color: 'text-slate-800' },
        'wed': { name: '수요일', color: 'text-slate-800' },
        'thu': { name: '목요일', color: 'text-slate-800' },
        'fri': { name: '금요일', color: 'text-slate-800' },
        'sat': { name: '토요일', color: 'text-blue-500' },
        'sun': { name: '일요일', color: 'text-red-500' }
    };

    dayOrder.forEach(dayKey => {
        const rawDayParties = weeklyParties.filter(p => p.day === dayKey);
        
        if (rawDayParties.length > 0) {
            const sortedDayParties = sortPartiesBySavedOrder(rawDayParties, dayKey);
            const cardsHtml = sortedDayParties.map(p => renderPartyCardHtml(p)).join('');

            const colHtml = `
                <div class="flex-1 min-w-[300px] bg-white p-4 rounded-lg shadow-sm border border-slate-200 h-[720px] flex flex-col">
                    <div class="font-bold text-lg mb-4 border-b pb-2 text-center shrink-0 ${dayInfo[dayKey].color}">
                        ${dayInfo[dayKey].name}
                    </div>
                    <div data-day="${dayKey}" class="kanban-day-list flex flex-col gap-2.5 overflow-y-auto flex-1 pr-1 custom-scrollbar content-start">
                        ${cardsHtml}
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', colHtml);
        }
    });

    // 하단 월간 보스(검은마법사) 구역 렌더링
    if (monthlySection && monthlyContainer) {
        monthlySection.classList.remove('hidden');
        if (monthlyParties.length > 0) {
            const sortedMonthly = sortPartiesBySavedOrder(monthlyParties, 'monthly');
            monthlyContainer.innerHTML = sortedMonthly.map(p => renderPartyCardHtml(p)).join('');
        } else {
            monthlyContainer.innerHTML = `
                <div class="col-span-full text-center text-sm text-slate-400 py-6">
                    아직 등록된 월간 보스(검은마법사) 파티가 없습니다.
                </div>
            `;
        }
    }

    initSortableLists();
}

// DB에서 캐릭터별 배율(character_specs) 불러오기
async function loadCharacterSpecs() {
    try {
        const { data, error } = await db.from('character_specs').select('*');
        if (error) {
            console.warn('character_specs 불러오기 에러:', error.message);
            return;
        }
        characterSpecsMap.clear();
        (data || []).forEach(row => {
            if (row.char_name && row.multipliers) {
                characterSpecsMap.set(row.char_name.trim(), row.multipliers);
            }
        });
    } catch (e) {
        console.warn('character_specs 로드 예외:', e);
    }
}

// DB에서 데이터 불러오기 (db 객체 사용)
async function loadParties() {
    const [partiesRes] = await Promise.all([
        db.from('parties').select('*'),
        loadCharacterSpecs()
    ]);
    const { data, error } = partiesRes;
    if (error) {
        console.error('DB 불러오기 에러:', error);
        return;
    }
    partiesData = data || [];
    renderKanban();
}

// 파티 추가 및 수정 (db 객체 사용)
document.getElementById('addPartyForm').addEventListener('submit', async function(e) {
    e.preventDefault(); 
    
    const title = document.getElementById('inputTitle').value.trim();
    const chars = document.getElementById('inputChar').value.trim();
    const bossesString = getSelectedBossesString(); 
    const isMonthly = bossesString.includes('검은마법사');

    const day = isMonthly ? 'monthly' : document.getElementById('inputDay').value;
    const time = isMonthly 
        ? document.getElementById('inputMonthlyMemo').value.trim() 
        : document.getElementById('inputTime').value.trim();

    if (!title) {
        alert('파티 이름을 입력해주세요.');
        document.getElementById('inputTitle').focus();
        return;
    }
    if (!chars) {
        alert('참여 캐릭터를 입력해주세요.');
        document.getElementById('inputChar').focus();
        return;
    }
    if (!time) {
        alert(isMonthly ? '월간 보스 일정(날짜/메모)을 입력해주세요.' : '출발 시간을 입력해주세요.');
        document.getElementById(isMonthly ? 'inputMonthlyMemo' : 'inputTime').focus();
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerText = '저장 중...';

    if (editingCardId) {
        const existingParty = partiesData.find(p => p.id === editingCardId);
        const newBossList = getBossList(bossesString);
        const prevCleared = existingParty ? getClearedBossList(existingParty) : [];
        const validCleared = prevCleared.filter(b => newBossList.includes(b));
        const newClearedBossesStr = validCleared.join(',');
        const newIsCleared = newBossList.length > 0 && validCleared.length === newBossList.length;

        const updatePayload = { 
            title, 
            chars, 
            day, 
            time, 
            bosses: bossesString,
            cleared_bosses: newClearedBossesStr,
            is_cleared: newIsCleared
        };

        const { error } = await safeUpdateParty(editingCardId, updatePayload);

        if (!error) {
            const partyIndex = partiesData.findIndex(p => p.id === editingCardId);
            if (partyIndex > -1) {
                partiesData[partyIndex] = { 
                    ...partiesData[partyIndex],
                    id: editingCardId, 
                    ...updatePayload
                };
            }
        } else {
            console.error('수정 에러:', error);
            alert('파티 수정 중 오류가 발생했습니다: ' + error.message);
        }
    } else {
        const uniqueCardId = 'party-' + Date.now();
        const newParty = { 
            id: uniqueCardId, 
            title, 
            chars, 
            day, 
            time, 
            bosses: bossesString, 
            cleared_bosses: '',
            is_cleared: false 
        };
        
        const { error } = await safeInsertParty(newParty);

        if (!error) {
            saveLocalClearedFallback(uniqueCardId, '');
            partiesData.push(newParty);
        } else {
            console.error('추가 에러:', error);
            alert('파티 추가 중 오류가 발생했습니다: ' + error.message);
        }
    }

    renderKanban(); 
    if (document.getElementById('searchInput').value.trim()) {
        searchCharacter();
    }
    closeModal();
    
    submitBtn.disabled = false;
});

function updateDetailModalView(party) {
    const dayMap = { mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일', fri: '금요일', sat: '토요일', sun: '일요일', monthly: '월간 일정' };
    const isMonthly = party.bosses && party.bosses.includes('검은마법사');

    document.getElementById('detailTitle').innerText = party.title;
    if (isMonthly) {
        document.getElementById('detailTime').innerText = `일정/메모: ${party.time}`;
    } else {
        document.getElementById('detailTime').innerText = `출발 시간: ${dayMap[party.day] || ''} ${party.time}`;
    }

    document.getElementById('detailBosses').innerHTML = renderBossBadgesHtml(party, 'px-2.5 py-1 text-xs');

    // 상세 모달 내 '전체 완료 / 완료 해제' 버튼 (무난하고 깔끔한 슬레이트 스타일)
    const toggleAllBtn = document.getElementById('detailToggleAllBtn');
    if (toggleAllBtn) {
        const allCleared = isPartyAllCleared(party);
        toggleAllBtn.innerText = allCleared ? '완료 해제' : '전체 완료';
        toggleAllBtn.className = allCleared
            ? 'text-xs font-medium px-2.5 py-1 rounded border border-slate-300 bg-slate-200 hover:bg-slate-300 text-slate-700 transition whitespace-nowrap shrink-0'
            : 'text-xs font-medium px-2.5 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition whitespace-nowrap shrink-0';
    }

    const chars = party.chars ? party.chars.split(',') : [];
    const partyBosses = getBossList(party.bosses);
    document.getElementById('detailChars').innerHTML = chars.map(c => {
        const charName = c.trim();
        if (!charName) return '';
        if (partyBosses.length === 0) {
            return `<div>· ${charName}</div>`;
        }
        const bossMultItems = partyBosses.map(b => {
            const shortBossName = b.split('(')[0].trim();
            const val = getCharBossMultiplier(charName, b);
            const valStr = val !== null ? `${Math.round(val * 10) / 10}%` : '-';
            return `${shortBossName} ${valStr}`;
        });
        const hasAnyVal = partyBosses.some(b => getCharBossMultiplier(charName, b) !== null);
        const detailSubText = hasAnyVal
            ? `<span class="text-xs text-slate-400 font-mono ml-1.5">(${bossMultItems.join(' / ')})</span>`
            : `<span class="text-xs text-slate-400 font-mono ml-1.5">(-)</span>`;
        return `<div class="flex flex-wrap items-baseline"><span>· ${charName}</span>${detailSubText}</div>`;
    }).join('');
}

// 상세 모달 내 '🔄 배율 새로고침' 버튼 클릭 시 동작
async function refreshPartySpecs() {
    const btn = document.getElementById('detailRefreshSpecsBtn');
    const origText = btn ? btn.innerText : '🔄 배율 새로고침';
    if (btn) {
        btn.disabled = true;
        btn.innerText = '⏳ 갱신 중...';
    }

    try {
        await loadCharacterSpecs();
        refreshAllViews();

        const party = partiesData.find(p => p.id === currentSelectedCardId);
        const partyNames = party && party.chars ? party.chars.split(',').map(c => c.trim()).filter(Boolean).join(', ') : '';
        alert(
            `DB에서 최신 배율 데이터를 다시 불러왔습니다!\n\n` +
            `💡 환산주스탯(maplescouter.com) 사이트는 브라우저 렌더링이 필수이므로, 실시간 크롤링 갱신은 GitHub Actions의 'Update Character Boss Specs' 워크플로우(수동 실행 또는 정기 스케줄)를 통해 자동으로 DB에 반영됩니다.` +
            (partyNames ? `\n\n현재 파티원: ${partyNames}` : '')
        );
    } catch (e) {
        console.error('배율 새로고침 에러:', e);
        alert('배율 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = origText;
        }
    }
}

function showDetailModal(cardId) {
    const party = partiesData.find(p => p.id === cardId);
    if (!party) return;

    currentSelectedCardId = cardId; 
    updateDetailModalView(party);
    document.getElementById('detailModal').classList.remove('hidden');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.add('hidden');
    currentSelectedCardId = null;
}

function editParty() {
    const partyToEdit = partiesData.find(p => p.id === currentSelectedCardId);
    if (!partyToEdit) return;

    closeDetailModal();
    
    editingCardId = partyToEdit.id;
    document.getElementById('modalTitle').innerText = '파티 수정';
    document.getElementById('submitBtn').innerText = '수정하기';

    document.getElementById('inputTitle').value = partyToEdit.title;
    document.getElementById('inputChar').value = partyToEdit.chars;

    initBosses(); 
    if (partyToEdit.bosses) {
        const bossList = partyToEdit.bosses.split(',');
        bossList.forEach(b => {
            const bName = b.split('(')[0].trim();
            const bDiff = b.includes('(') ? b.split('(')[1].replace(')', '').trim() : '선택';
            
            const config = bossConfig.find(c => c.name === bName);
            if (config) {
                currentBossState[config.key] = config.diffs.indexOf(bDiff);
            }
        });
    }
    renderBossToggles();

    if (isMonthlyBossSelectedInModal()) {
        document.getElementById('inputMonthlyMemo').value = partyToEdit.time || '';
        document.getElementById('inputDay').value = 'mon';
        document.getElementById('inputTime').value = '';
    } else {
        document.getElementById('inputDay').value = partyToEdit.day && partyToEdit.day !== 'monthly' ? partyToEdit.day : 'mon';
        document.getElementById('inputTime').value = partyToEdit.time || '';
        document.getElementById('inputMonthlyMemo').value = '';
    }

    document.getElementById('partyModal').classList.remove('hidden');
}

// DB에서 파티 삭제 (db 객체 사용)
async function deleteParty() {
    if (confirm("이 파티 일정을 삭제할까요?")) {
        const idToDelete = currentSelectedCardId;
        
        const { error } = await db
            .from('parties')
            .delete()
            .eq('id', idToDelete);

        if (!error) {
            partiesData = partiesData.filter(p => p.id !== idToDelete);
            renderKanban(); 
            closeDetailModal();
            if (document.getElementById('searchInput').value.trim()) {
                searchCharacter(); 
            }
        } else {
            console.error('삭제 에러:', error);
        }
    }
}

function searchCharacter() {
    const rawInput = document.getElementById('searchInput').value;
    const resultArea = document.getElementById('searchResultArea');
    
    const keywords = rawInput
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

    if (keywords.length === 0) {
        resultArea.innerHTML = '<div class="w-full text-center text-slate-400 mt-4">검색할 닉네임을 입력해주세요.</div>';
        return;
    }

    const filtered = partiesData.filter(p => 
        keywords.some(keyword => p.chars.includes(keyword))
    );

    if (filtered.length === 0) {
        resultArea.innerHTML = '<div class="w-full text-center text-slate-400 mt-4">해당 캐릭터가 소속된 파티가 없습니다.</div>';
        return;
    }

    const dayMap = { mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일', fri: '금요일', sat: '토요일', sun: '일요일', monthly: '월간' };

    const resultHtml = filtered.map(p => {
        const bossBadges = renderBossBadgesHtml(p, 'px-2 py-1 text-xs');
        const borderClass = getCardStatusClasses(p);
        const compactChars = renderCompactCharsHtml(p.chars, keywords);
        const isMonthly = p.bosses && p.bosses.includes('검은마법사');
        const scheduleBadgeText = isMonthly ? `${p.time}` : `${dayMap[p.day] || ''} ${p.time}`;
        const scheduleBadgeColor = isMonthly ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-600';

        return `
            <div id="search-${p.id}" onclick="handleCardClick(event, '${p.id}')" 
                 oncontextmenu="handleCardRightClick(event, '${p.id}')" 
                 class="${borderClass} border-2 p-4 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer flex flex-col w-fit min-w-[250px] max-w-full select-none">
                <div class="flex justify-between items-start mb-3 gap-2 shrink-0">
                    <span class="font-bold text-lg text-slate-800 break-words leading-snug">${p.title}</span>
                    <span class="text-xs ${scheduleBadgeColor} px-2 py-1 rounded-full font-bold shrink-0 mt-0.5">${scheduleBadgeText}</span>
                </div>
                <div class="flex flex-wrap gap-1.5 mb-3 shrink-0">
                    ${bossBadges}
                </div>
                <div class="text-xs text-slate-600 border-t pt-2.5 border-slate-200/80 mt-auto">
                    <span class="font-bold text-slate-700 mr-1">참여:</span>
                    <span class="leading-relaxed break-words">${compactChars}</span>
                </div>
            </div>
        `;
    }).join('');

    resultArea.innerHTML = resultHtml;
}

// 모든 뷰(주간 캘린더, 캐릭터 검색 현황판, 상세 모달) 갱신
function refreshAllViews() {
    renderKanban();
    if (document.getElementById('searchInput').value.trim()) {
        searchCharacter();
    }
    if (currentSelectedCardId) {
        const party = partiesData.find(p => p.id === currentSelectedCardId);
        if (party) {
            updateDetailModalView(party);
        }
    }
}

// 개별 보스 뱃지 클릭/우클릭 시 해당 보스만 클리어 토글
async function toggleBossClear(event, partyId, bossName) {
    event.preventDefault();
    event.stopPropagation();

    const party = partiesData.find(p => p.id === partyId);
    if (!party) return;

    const allBosses = getBossList(party.bosses);
    let clearedList = getClearedBossList(party);

    if (clearedList.includes(bossName)) {
        clearedList = clearedList.filter(b => b !== bossName);
    } else {
        clearedList.push(bossName);
    }

    const newClearedBossesStr = clearedList.join(',');
    const newIsCleared = allBosses.length > 0 && clearedList.length === allBosses.length;

    party.cleared_bosses = newClearedBossesStr;
    party.is_cleared = newIsCleared;
    refreshAllViews();

    const { error } = await safeUpdateParty(partyId, { 
        cleared_bosses: newClearedBossesStr,
        is_cleared: newIsCleared
    });

    if (error) {
        console.error('보스 개별 상태 업데이트 에러:', error);
        alert('보스 클리어 상태 저장에 실패했습니다.');
    }
}

// 카드 전체 우클릭 또는 상세모달 버튼 클릭 시 모든 보스 일괄 완료/미완료 토글
async function toggleCardColor(event, partyId) {
    if (event) {
        event.preventDefault(); 
        event.stopPropagation(); 
    }
    if (!partyId) return;

    const party = partiesData.find(p => p.id === partyId);
    if (!party) return;

    const allBosses = getBossList(party.bosses);
    const isCurrentlyAllCleared = isPartyAllCleared(party);

    const newIsCleared = !isCurrentlyAllCleared;
    const newClearedBossesStr = newIsCleared ? allBosses.join(',') : '';

    party.is_cleared = newIsCleared;
    party.cleared_bosses = newClearedBossesStr;
    refreshAllViews();

    const { error } = await safeUpdateParty(partyId, { 
        is_cleared: newIsCleared,
        cleared_bosses: newClearedBossesStr
    });

    if (error) {
        console.error('상태 업데이트 에러:', error);
        alert('상태 저장에 실패했습니다.');
    }
}

document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchCharacter();
    }
});

window.onload = function() {
    initBosses();
    loadParties(); 
};
