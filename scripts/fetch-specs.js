/**
 * 환산주스탯(maplescouter.com/ko/multi-result) 전체 파티 배율 일괄 크롤링 및
 * Supabase character_specs 테이블 업데이트 스크립트 (로컬 PC 실행용)
 */

require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wwtlccjhiearimyuquwh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_cJRd9WgKIcPA1xGGuXO4gA_6geEwGGD';

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

async function dismissAdPopups(page) {
    await page.evaluate(() => {
        const targets = ['오늘 다시 보지 않기', '닫기'];
        const els = [...document.querySelectorAll('button, div, span, a')].filter(el => {
            if (el.children.length > 0) return false;
            const text = (el.innerText || el.textContent || '').trim();
            if (!targets.includes(text)) return false;
            const style = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        });
        for (const btn of els) {
            try { btn.click(); } catch (e) {}
        }
    }).catch(() => {});
}

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
    if (validParties.length === 0) {
        console.log('추출할 파티가 없습니다.');
        return;
    }

    const profilePath = path.join(__dirname, '.chrome-profile');
    let context = null;

    try {
        context = await chromium.launchPersistentContext(profilePath, {
            channel: 'chrome',
            headless: false,
            viewport: { width: 1440, height: 950 },
            args: [
                '--window-position=-3000,-3000',
                '--window-size=1440,950',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
        console.log('2. https://maplescouter.com/ko/multi-result 접속 중...');
        await page.goto('https://maplescouter.com/ko/multi-result', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await page.waitForTimeout(2500);
        await dismissAdPopups(page);

        const collectedSpecs = { ...existingSpecs };

        for (let idx = 0; idx < validParties.length; idx++) {
            const party = validParties[idx];
            const partyChars = party.chars.split(',').map(c => c.trim()).filter(Boolean);
            const partyBosses = party.bosses.split(',').map(b => b.trim()).filter(Boolean);

            if (partyChars.length === 0 || partyBosses.length === 0) continue;

            const queryStr = partyChars.join(', ');
            console.log(`\n[파티 ${idx + 1}/${validParties.length}] "${party.title}" (${queryStr}) -> 대상 보스: ${partyBosses.join(', ')}`);

            if (!page.url().includes('multi-result')) {
                await page.goto('https://maplescouter.com/ko/multi-result', { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(2500);
            }
            await dismissAdPopups(page);

            const inputLoc = page.locator('input[placeholder*="파티원"], input[placeholder*="구분"], input[placeholder*="닉네임"]').last();
            await inputLoc.waitFor({ state: 'visible', timeout: 8000 });
            await inputLoc.click({ force: true });
            await inputLoc.fill('');
            await inputLoc.fill(queryStr);
            await inputLoc.press('Enter');

            await page.waitForTimeout(3000);
            await dismissAdPopups(page);

            for (const bossKey of partyBosses) {
                const target = resolveBossTarget(bossKey);
                if (!target) continue;

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
                    console.warn(`  ⚠️ 보스 버튼 미발견: ${bossKey}`);
                    continue;
                }

                await page.waitForTimeout(2000);
                await dismissAdPopups(page);

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
        }
    } finally {
        if (context) {
            try {
                await context.close();
                console.log('🔒 크롬 창이 자동으로 종료되었습니다.');
            } catch (e) {}
        }
    }
}

main().catch(err => {
    console.error('❌ 스크립트 실행 중 오류 발생:', err);
    process.exit(1);
});
