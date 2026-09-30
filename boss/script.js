function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-' + tabId).classList.add('active');
    document.getElementById('btn-' + tabId).classList.add('active');
}

const bossConfig = [
    { key: '익스우', name: '익스우', diffs: ['선택'] },
    { key: '세렌', name: '세렌', diffs: ['노말', '하드', '익스'] },
    { key: '칼로스', name: '칼로스', diffs: ['노말', '카오스', '익스'] },
    { key: '대적자', name: '대적자', diffs: ['이지', '노말', '하드', '익스'] },
    { key: '카링', name: '카링', diffs: ['이지', '노말', '하드', '익스'] },
    { key: '흉성', name: '흉성', diffs: ['노말', '하드'] },
    { key: '벨로나', name: '벨로나', diffs: ['이지', '노말', '하드'] },
    { key: '림보', name: '림보', diffs: ['노말', '하드'] },
    { key: '발드릭스', name: '발드릭스', diffs: ['노말', '하드'] },
    { key: '검은마법사', name: '검은마법사', diffs: ['하드', '익스'] }
];

let currentBossState = {}; 
let editingCardId = null; 

function initBosses() {
    bossConfig.forEach(b => currentBossState[b.key] = -1);
    renderBossToggles();
}

function renderBossToggles() {
    const container = document.getElementById('bossToggles');
    container.innerHTML = bossConfig.map(b => {
        const stateIdx = currentBossState[b.key];
        const isSelected = stateIdx > -1;
        const currentDiff = isSelected ? b.diffs[stateIdx] : null;
        
        const diffText = isSelected && currentDiff !== '선택' ? `(${currentDiff})` : '';
        
        let bgClass = 'bg-slate-100 text-slate-500';
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
    }).join('');
}

function toggleBoss(key) {
    const config = bossConfig.find(b => b.key === key);
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

function openModal() {
    editingCardId = null; 
    document.getElementById('modalTitle').innerText = '새 파티 추가';
    document.getElementById('submitBtn').innerText = '추가하기';
    document.getElementById('partyModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('partyModal').classList.add('hidden');
    document.getElementById('addPartyForm').reset(); 
    initBosses(); 
}

let currentSelectedCardId = null; 
let partiesData = []; 

function renderKanban() {
    const container = document.getElementById('kanbanContainer');
    const emptyMsg = document.getElementById('emptyKanbanMsg');
    
    container.innerHTML = '';
    
    if (partiesData.length === 0) {
        emptyMsg.style.display = 'block';
        return;
    } else {
        emptyMsg.style.display = 'none';
    }

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
        const dayParties = partiesData.filter(p => p.day === dayKey);
        
        if (dayParties.length > 0) {
            const cardsHtml = dayParties.map(p => {
                const charListHtml = p.chars.split(',').map(char => `
                    <div class="text-sm text-slate-600">${char.trim()}</div>
                `).join('');

                const bossTagsHtml = p.bosses ? p.bosses.split(',').map(b => 
                    `<span class="text-[10px] px-1.5 py-0.5 rounded mr-1 ${getBadgeColor(b)} font-bold inline-block mt-1">${b}</span>`
                ).join('') : '';

                return `
                    <div id="${p.id}" onclick="showDetailModal('${p.title}', '${p.time}', '${p.bosses}', '${p.chars}', '${p.id}')" 
                         class="bg-slate-50 border border-slate-200 p-3 rounded cursor-pointer hover:border-blue-400 hover:shadow-md transition">
                        <div class="flex justify-between items-start mb-1">
                            <span class="font-bold text-slate-800">${p.title}</span>
                            <span class="text-xs bg-slate-200 px-2 py-1 rounded font-mono">${p.time}</span>
                        </div>
                        <div class="mb-2">${bossTagsHtml}</div>
                        <div class="space-y-1 mt-2 border-t pt-2 border-slate-200">
                            ${charListHtml}
                        </div>
                    </div>
                `;
            }).join('');

            const colHtml = `
                <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200 h-[600px] flex flex-col">
                    <div class="font-bold text-lg mb-4 border-b pb-2 text-center shrink-0 ${dayInfo[dayKey].color}">
                        ${dayInfo[dayKey].name}
                    </div>
                    <div class="space-y-3 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                        ${cardsHtml}
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', colHtml);
        }
    });
}

document.getElementById('addPartyForm').addEventListener('submit', function(e) {
    e.preventDefault(); 

    const title = document.getElementById('inputTitle').value;
    const chars = document.getElementById('inputChar').value;
    const day = document.getElementById('inputDay').value;
    const time = document.getElementById('inputTime').value;
    const bossesString = getSelectedBossesString(); 

    if (editingCardId) {
        const partyIndex = partiesData.findIndex(p => p.id === editingCardId);
        if (partyIndex > -1) {
            partiesData[partyIndex].title = title;
            partiesData[partyIndex].chars = chars;
            partiesData[partyIndex].day = day;
            partiesData[partyIndex].time = time;
            partiesData[partyIndex].bosses = bossesString;
        }
    } else {
        const uniqueCardId = 'party-' + Date.now();
        partiesData.push({
            id: uniqueCardId,
            title: title,
            chars: chars,
            day: day,
            time: time,
            bosses: bossesString
        });
    }

    renderKanban(); 
    closeModal();
});

function showDetailModal(title, time, bossesStr, charsStr, cardId) {
    currentSelectedCardId = cardId; 
    document.getElementById('detailTitle').innerText = title;
    document.getElementById('detailTime').innerText = `출발 시간: ${time}`;

    const bosses = bossesStr ? bossesStr.split(',') : [];
    const bossHtml = bosses.length > 0 
        ? bosses.map(b => `<span class="px-2 py-1 text-xs font-bold rounded ${getBadgeColor(b)} mr-1 inline-block mb-1">${b}</span>`).join('')
        : `<span class="text-sm text-slate-400">선택된 보스 없음</span>`;
    document.getElementById('detailBosses').innerHTML = bossHtml;

    const chars = charsStr ? charsStr.split(',') : [];
    document.getElementById('detailChars').innerHTML = chars.map(c => `<div>- ${c.trim()}</div>`).join('');

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
    document.getElementById('inputDay').value = partyToEdit.day;
    document.getElementById('inputTime').value = partyToEdit.time;

    initBosses(); 
    if (partyToEdit.bosses) {
        const bossList = partyToEdit.bosses.split(',');
        bossList.forEach(b => {
            const bName = b.split('(')[0];
            const bDiff = b.includes('(') ? b.split('(')[1].replace(')', '') : '선택';
            
            const config = bossConfig.find(c => c.name === bName);
            if (config) {
                currentBossState[config.key] = config.diffs.indexOf(bDiff);
            }
        });
    }
    renderBossToggles();

    document.getElementById('partyModal').classList.remove('hidden');
}

function deleteParty() {
    if (confirm("이 파티 일정을 삭제할까요?")) {
        partiesData = partiesData.filter(p => p.id !== currentSelectedCardId);
        
        renderKanban(); 
        closeDetailModal();
        searchCharacter(); 
    }
}

function searchCharacter() {
    const keyword = document.getElementById('searchInput').value.trim();
    const resultArea = document.getElementById('searchResultArea');
    
    if (!keyword) {
        resultArea.innerHTML = '<div class="text-center text-slate-400 mt-10">검색할 닉네임을 입력해주세요.</div>';
        return;
    }

    const filtered = partiesData.filter(p => p.chars.includes(keyword));

    if (filtered.length === 0) {
        resultArea.innerHTML = '<div class="text-center text-slate-400 mt-10">해당 캐릭터가 소속된 파티가 없습니다.</div>';
        return;
    }

    const dayMap = { mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일', fri: '금요일', sat: '토요일', sun: '일요일' };

    const resultHtml = filtered.map(p => {
        const bosses = p.bosses ? p.bosses.split(',') : [];
        const bossBadges = bosses.length > 0 
            ? bosses.map(b => `<span class="px-2 py-1 text-xs font-bold rounded mr-1 ${getBadgeColor(b)} inline-block mb-1">${b}</span>`).join('')
            : `<span class="text-sm text-slate-400">선택된 보스 없음</span>`;

        return `
            <div onclick="switchTab('kanban')" class="bg-white border border-slate-200 p-4 rounded-lg shadow-sm hover:border-blue-400 transition cursor-pointer">
                <div class="flex justify-between items-center mb-3">
                    <span class="font-bold text-lg text-slate-800">${p.title}</span>
                    <span class="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold">${dayMap[p.day]} ${p.time}</span>
                </div>
                <div class="mb-3">
                    ${bossBadges}
                </div>
                <div class="text-sm text-slate-600 border-t pt-3 border-slate-100">
                    <span class="font-bold text-slate-700">참여 명단:</span> ${p.chars}
                </div>
            </div>
        `;
    }).join('');

    resultArea.innerHTML = resultHtml;
}

document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchCharacter();
    }
});

window.onload = function() {
    initBosses();
    renderKanban(); 
};