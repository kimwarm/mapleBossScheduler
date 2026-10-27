/**
 * 환산주스탯(maplescouter.com/ko/multi-result) 파티격 분석실 DOM 크롤링 및
 * Supabase character_specs 테이블 자동 업데이트 스크립트 (Playwright 기반)
 */

const { chromium } = require('playwright');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wwtlccjhiearimyuquwh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_cJRd9WgKIcPA1xGGuXO4gA_6geEwGGD';

// 우리 DB의 보스 표기법 -> 환산주스탯 2단계 보스 선택 버튼(난이도 영문 + 보스 한글명) 매핑
const BOSS_BUTTON_MAP = {
    '세렌(익스)': { diff: 'EXTREME', boss: '세렌' },
    '세렌(하드)': { diff: 'HARD', boss: '세렌' },
    '세렌(노말)': { diff: 'NORMAL', boss: '세렌' },
    '칼로스(익스)': { diff: 'EXTREME', boss: '칼로스' },
    '칼로스(카오스)': { diff: 'CHAOS', boss: '칼로스' },
    '칼로스(노말)': { diff: 'NORMAL', boss: '칼로스' },
    '칼로스(이지)': { diff: 'EASY', boss: '칼로스' },
    '대적자(익스)': { diff: 'EXTREME', boss: '대적자' },
    '대적자(하드)': { diff: 'HARD', boss: '대적자' },
    '대적자(노말)': { diff: 'NORMAL', boss: '대적자' },
    '대적자(이지)': { diff: 'EASY', boss: '대적자' },
    '카링(익스)': { diff: 'EXTREME', boss: '카링' },
    '카링(하드)': { diff: 'HARD', boss: '카링' },
    '카링(노말)': { diff: 'NORMAL', boss: '카링' },
    '카링(이지)': { diff: 'EASY', boss: '카링' },
    '흉성(하드)': { diff: 'HARD', boss: '흉성' },
    '흉성(노말)': { diff: 'NORMAL', boss: '흉성' },
    '벨로나(하드)': { diff: 'HARD', boss: '벨로나' },
    '벨로나(노말)': { diff: 'NORMAL', boss: '벨로나' },
    '벨로나(이지)': { diff: 'EASY', boss: '벨로나' },
    '림보(익스)': { diff: 'EXTREME', boss: '림보' },
    '림보(하드)': { diff: 'HARD', boss: '림보' },
    '림보(노말)': { diff: 'NORMAL', boss: '림보' },
    '발드릭스(익스)': { diff: 'EXTREME', boss: '발드릭스' },
    '발드릭스(하드)': { diff: 'HARD', boss: '발드릭스' },
    '발드릭스(노말)': { diff: 'NORMAL', boss: '발드릭스' },
    '검은마법사(익스)': { diff: 'EXTREME', boss: '검은 마법사' },
    '검은마법사(하드)': { diff: 'HARD', boss: '검은 마법사' },
    '익스우': { diff: 'EXTREME', boss: '스우' }
};

async function fetchPartiesFromSupabase() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/parties?select=*`, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
        }
    });
    if (!res.ok) {
        throw new Error(`Supabase parties 조회 실패: ${res.status} ${await res.text()}`);
    }
    return await res.json();
}

async function upsertSpecsToSupabase(rows) {
    if (!rows || rows.length === 0) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/character_specs?on_conflict=char_name`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(rows)
    });
    if (!res.ok) {
        throw new Error(`Supabase character_specs 저장 실패: ${res.status} ${await res.text()}`);
    }
}

function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

async function main() {
    console.log('1. Supabase에서 등록된 파티 목록 및 캐릭터 조회 중...');
    const parties = await fetchPartiesFromSupabase();

    const uniqueCharsSet = new Set();
    for (const p of parties) {
        if (!p.chars) continue;
        p.chars
            .split(',')
            .map(c => c.trim())
            .filter(Boolean)
            .forEach(c => uniqueCharsSet.add(c));
    }

    const allChars = [...uniqueCharsSet];
    console.log(`총 ${allChars.length}명의 캐릭터 발견:`, allChars.join(', '));
    if (allChars.length === 0) {
        console.log('추출할 캐릭터가 없습니다.');
        return;
    }

    // 2인 제한 보스(익스우, 벨로나 등) 버튼이 사라지지 않도록 2명씩 묶어서 검색
    const charGroups = chunkArray(allChars, 2);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 950 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'ko-KR'
    });

    const page = await context.newPage();
    console.log('2. https://maplescouter.com/ko/multi-result 접속 중...');
    await page.goto('https://maplescouter.com/ko/multi-result', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    // 입력창이 렌더링될 때까지 대기
    await page.waitForSelector('input[placeholder*="닉네임"]', { timeout: 30000 });
    await page.waitForTimeout(1500);

    const collectedSpecs = {};

    for (const group of charGroups) {
        const queryStr = group.join(', ');
        console.log(`\n[검색 그룹] "${queryStr}" 검색 중...`);

        // 1단계: 파티원 검색 입력란에 닉네임 입력 후 돋보기 버튼 클릭 / 엔터
        await page.evaluate((q) => {
            const inputs = [...document.querySelectorAll('input')];
            const input =
                inputs.find(el => el.placeholder && el.placeholder.includes('닉네임을 입력해주세요')) ||
                inputs.find(el => el.className && el.className.includes('pr-8')) ||
                inputs[2];
            if (!input) throw new Error('파티원 검색 입력창을 찾을 수 없습니다.');

            input.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, q);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

            const btn = input.parentElement ? input.parentElement.querySelector('button') : null;
            if (btn) btn.click();
        }, queryStr);

        // 검색 결과(캐릭터 카드 및 '솔플배율' 텍스트)가 3단계 영역에 로드될 때까지 대기
        for (let i = 0; i < 16; i++) {
            await page.waitForTimeout(500);
            const isLoaded = await page.evaluate((names) => {
                const bodyText = document.body.innerText || '';
                const step3Text = bodyText.split('파티격 분석실').pop() || '';
                return names.some(n => step3Text.includes(n)) && step3Text.includes('솔플배율');
            }, group);
            if (isLoaded) {
                await page.waitForTimeout(500);
                break;
            }
        }

        // 2단계 & 3단계: 각 보스 선택 버튼을 클릭하고 하단 캐릭터 카드의 '솔플배율' 추출
        for (const [bossKey, { diff, boss }] of Object.entries(BOSS_BUTTON_MAP)) {
            const clicked = await page.evaluate(({ diffEng, bossKor }) => {
                const candidates = [...document.querySelectorAll('div, button')].filter(el => {
                    const lines = (el.innerText || '').trim().split('\n').map(s => s.trim()).filter(Boolean);
                    return lines.length === 2 && lines[0] === diffEng && lines[1] === bossKor;
                });
                candidates.sort((a, b) => a.innerHTML.length - b.innerHTML.length);
                if (candidates.length > 0) {
                    candidates[0].click();
                    return true;
                }
                return false;
            }, { diffEng: diff, bossKor: boss });

            if (!clicked) continue;

            await page.waitForTimeout(200);

            const parsedCards = await page.evaluate(() => {
                const result = {};
                const soloSpans = [...document.querySelectorAll('span, div')].filter(
                    el => el.children.length === 0 && (el.textContent || '').trim() === '솔플배율'
                );
                for (const span of soloSpans) {
                    let card = span.parentElement;
                    let cardText = '';
                    for (let up = 0; up < 7 && card; up++) {
                        const t = card.innerText || '';
                        if (t.includes('Lv.') && t.includes('솔플배율')) {
                            cardText = t;
                            break;
                        }
                        card = card.parentElement;
                    }
                    if (!cardText) continue;

                    const lines = cardText.split('\n').map(s => s.trim()).filter(Boolean);
                    const lvIdx = lines.findIndex(l => l.startsWith('Lv.'));
                    const soloIdx = lines.findIndex(l => l === '솔플배율');
                    if (lvIdx >= 1 && soloIdx >= 0 && soloIdx + 1 < lines.length) {
                        const charName = lines[lvIdx - 1];
                        const multRaw = lines[soloIdx + 1].replace('%', '').trim();
                        const multVal = parseFloat(multRaw);
                        if (charName && !isNaN(multVal)) {
                            result[charName] = multVal;
                        }
                    }
                }
                return result;
            });

            for (const [charName, multVal] of Object.entries(parsedCards)) {
                if (!collectedSpecs[charName]) collectedSpecs[charName] = {};
                collectedSpecs[charName][bossKey] = multVal;
            }
        }
    }

    await browser.close();

    const nowIso = new Date().toISOString();
    const rowsToUpsert = Object.entries(collectedSpecs).map(([char_name, multipliers]) => ({
        char_name,
        multipliers,
        updated_at: nowIso
    }));

    console.log(`\n3. 총 ${rowsToUpsert.length}명의 캐릭터 배율 데이터를 Supabase에 저장 중...`);
    await upsertSpecsToSupabase(rowsToUpsert);
    console.log('✅ 업데이트 완료!');
}

main().catch(err => {
    console.error('❌ 스크립트 실행 중 오류 발생:', err);
    process.exit(1);
});

