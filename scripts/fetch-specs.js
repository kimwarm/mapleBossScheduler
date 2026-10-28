/**
 * 환산주스탯(maplescouter.com/ko/multi-result) 파티격 분석실 DOM 크롤링 및
 * Supabase character_specs 테이블 자동 업데이트 스크립트 (Playwright 기반 로컬 최적화)
 */

require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');

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
    '익스우': { diff: 'EXTREME', boss: '스우' },
    '하스우': { diff: 'HARD', boss: '스우' }
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

async function fetchExistingSpecsFromSupabase() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/character_specs?select=*`, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
            }
        });
        if (!res.ok) return {};
        const rows = await res.json();
        const map = {};
        for (const r of rows) {
            if (r.char_name && r.multipliers && typeof r.multipliers === 'object') {
                map[r.char_name.trim()] = { ...r.multipliers };
            }
        }
        return map;
    } catch (e) {
        return {};
    }
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

/**
 * Cloudflare 보안 확인 자동 시도 및 사용자 수동 클릭 대기
 */
async function waitForVerificationPass(page, timeoutMs = 60000) {
    const start = Date.now();
    let noticed = false;

    while (Date.now() - start < timeoutMs) {
        const isChallenge = await page.evaluate(() => {
            const body = document.body ? document.body.innerText : '';
            const dialog = document.querySelector('div[role="dialog"]');
            const hasDialog = dialog && window.getComputedStyle(dialog).display !== 'none' && parseFloat(window.getComputedStyle(dialog).opacity || '1') > 0.2;
            return body.includes('보안 확인 수행 중') || hasDialog || document.title.includes('Just a moment');
        }).catch(() => false);

        if (!isChallenge) {
            return true;
        }

        if (!noticed) {
            console.log('👉 [보안 확인 필요] 화면에 [사람인지 확인하십시오] 체크박스가 보이면 마우스로 한 번 클릭해주세요!');
            noticed = true;
        }

        // 봇 자동 클릭 시도
        for (const f of page.frames()) {
            const u = f.url();
            if (u.includes('challenges') || u.includes('turnstile')) {
                try {
                    const box = await f.locator('body').boundingBox();
                    if (box && box.width > 0) {
                        await page.mouse.click(box.x + 28, box.y + box.height / 2);
                    }
                } catch (e) {}
            }
        }
        await page.mouse.click(605, 540).catch(() => {});
        await page.mouse.click(202, 355).catch(() => {});

        await page.waitForTimeout(1500);
    }
    return false;
}

/**
 * DB에 저장된 보스 이름(예: '세렌(익스)', '익스우')을 { diff, boss } 객체로 변환
 */
function resolveBossTarget(bossStr) {
    const trimmed = bossStr.trim();
    if (BOSS_BUTTON_MAP[trimmed]) return BOSS_BUTTON_MAP[trimmed];

    const diffMap = {
        익스: 'EXTREME',
        하드: 'HARD',
        카오스: 'CHAOS',
        노말: 'NORMAL',
        이지: 'EASY'
    };
    const match = trimmed.match(/^(.+?)\((.+?)\)$/);
    if (match) {
        let bossName = match[1].trim();
        const diffKor = match[2].trim();
        if (bossName === '검은마법사') bossName = '검은 마법사';
        if (diffMap[diffKor]) {
            return { diff: diffMap[diffKor], boss: bossName };
        }
    }
    return null;
}

async function main() {
    console.log('1. Supabase에서 등록된 파티 목록 및 기존 배율 데이터 조회 중...');
    const [parties, existingSpecs] = await Promise.all([
        fetchPartiesFromSupabase(),
        fetchExistingSpecsFromSupabase()
    ]);

    const validParties = (parties || []).filter(p => p.chars && p.chars.trim().length > 0 && p.bosses && p.bosses.trim().length > 0);
    console.log(`총 ${validParties.length}개의 유효 파티 발견`);
    if (validParties.length === 0) {
        console.log('추출할 파티가 없습니다.');
        return;
    }

    const isHeadless = process.env.HEADLESS === 'true';
    console.log(`브라우저 실행 모드: ${isHeadless ? 'Headless' : 'Headed (실제 브라우저 창 표시)'}`);

    const profilePath = path.join(__dirname, '.chrome-profile');
    const context = await chromium.launchPersistentContext(profilePath, {
        channel: 'chrome',
        headless: isHeadless,
        viewport: { width: 1440, height: 950 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1440,950'
        ]
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    console.log('2. https://maplescouter.com/ko/multi-result 접속 중...');
    await page.goto('https://maplescouter.com/ko/multi-result', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    await page.waitForTimeout(3000);
    await waitForVerificationPass(page, 45000);

    const collectedSpecs = { ...existingSpecs };

    // 파티 단위 순회
    for (let idx = 0; idx < validParties.length; idx++) {
        const party = validParties[idx];
        const partyChars = party.chars
            .split(',')
            .map(c => c.trim())
            .filter(Boolean);
        const partyBosses = party.bosses
            .split(',')
            .map(b => b.trim())
            .filter(Boolean);

        if (partyChars.length === 0 || partyBosses.length === 0) continue;

        const queryStr = partyChars.join(', ');
        console.log(`\n[파티 ${idx + 1}/${validParties.length}] "${party.title}" (${queryStr}) -> 대상 보스: ${partyBosses.join(', ')}`);

        // 만약 화면이 메인으로 튕겼다면 다시 파티 보스컷으로 이동
        if (!page.url().includes('multi-result')) {
            await page.goto('https://maplescouter.com/ko/multi-result', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
            await waitForVerificationPass(page, 15000);
        }

        // 1단계: 파티원 검색창 찾기 및 입력
        const inputLoc = page.locator('div:has-text("파티원 검색")').locator('input').last();
        try {
            await inputLoc.waitFor({ state: 'visible', timeout: 10000 });
            await inputLoc.click({ force: true });
            await inputLoc.fill(queryStr);
            await page.keyboard.press('Enter');

            const searchBtn = page.locator('div:has-text("파티원 검색")').locator('button, svg').last();
            if ((await searchBtn.count()) > 0) {
                await searchBtn.click({ force: true }).catch(() => {});
            }
        } catch (err) {
            console.warn(`  ⚠️ 검색창 입력 실패, 페이지 새로고침 시도: ${err.message}`);
            await page.goto('https://maplescouter.com/ko/multi-result', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            await waitForVerificationPass(page, 20000);
            continue;
        }

        console.log('  검색 결과 로딩 대기...');
        await page.waitForTimeout(3500);
        await waitForVerificationPass(page, 10000);

        // 2단계 & 3단계: 보스 버튼 클릭 및 배율 수집
        for (const bossKey of partyBosses) {
            const target = resolveBossTarget(bossKey);
            if (!target) {
                console.warn(`  ⚠️ 매핑되지 않은 보스 표기: ${bossKey}`);
                continue;
            }

            const clicked = await page.evaluate(({ diff, boss }) => {
                const elements = [...document.querySelectorAll('div, button')];
                const match = elements.find(el => {
                    const lines = (el.innerText || '').trim().split('\n').map(s => s.trim()).filter(Boolean);
                    return lines.length === 2 && lines[0].toUpperCase() === diff && lines[1] === boss;
                });
                if (match) {
                    match.click();
                    return true;
                }
                return false;
            }, target);

            if (!clicked) {
                console.warn(`  ⚠️ 보스 버튼 미발견: ${bossKey} (${target.diff} ${target.boss})`);
                continue;
            }

            await page.waitForTimeout(2500);

            // 전면 광고 닫기 시도
            await page.evaluate(() => {
                const closeBtns = [...document.querySelectorAll('*')].filter(el => (el.innerText || '').trim() === '닫기');
                for (const b of closeBtns) {
                    try { b.click(); } catch (e) {}
                }
            });

            // 3단계: 솔플배율 파싱
            const extracted = await page.evaluate(() => {
                const result = {};
                const soloSpans = [...document.querySelectorAll('*')].filter(
                    el => el.children.length === 0 && (el.textContent || '').trim() === '솔플배율'
                );
                for (const span of soloSpans) {
                    let card = span.parentElement;
                    let cardText = '';
                    for (let up = 0; up < 8 && card; up++) {
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

            const logItems = [];
            for (const [charName, multVal] of Object.entries(extracted)) {
                if (!collectedSpecs[charName]) collectedSpecs[charName] = {};
                collectedSpecs[charName][bossKey] = multVal;
                logItems.push(`${charName}: ${multVal}%`);
            }

            console.log(`  ✔ [${bossKey}] -> ${logItems.join(', ') || '배율 없음'}`);
        }
    }

    // 브라우저 닫기
    await context.close();

    // Supabase 저장
    const nowIso = new Date().toISOString();
    const rowsToUpsert = Object.entries(collectedSpecs).map(([char_name, multipliers]) => ({
        char_name,
        multipliers,
        updated_at: nowIso
    }));

    console.log(`\n3. 총 ${rowsToUpsert.length}명의 캐릭터 배율 데이터를 Supabase character_specs 테이블에 저장 중...`);
    if (rowsToUpsert.length > 0) {
        await upsertSpecsToSupabase(rowsToUpsert);
        console.log('🎉 모든 파티 배율 Supabase 업데이트 완료!');
    } else {
        console.warn('⚠️ 저장할 배율 데이터가 없습니다.');
    }
}

main().catch(err => {
    console.error('❌ 스크립트 실행 중 오류 발생:', err);
    process.exit(1);
});
