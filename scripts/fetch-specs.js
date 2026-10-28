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
 * Cloudflare Turnstile / 체크박스 챌린지가 떴을 경우 자동으로 감지 및 클릭하여 통과 시도
 */
async function tryPassCloudflare(page) {
    for (let attempt = 1; attempt <= 6; attempt++) {
        const title = await page.title().catch(() => '');
        const bodySnippet = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 400) : '')).catch(() => '');

        const isCloudflare =
            /Just a moment|Attention Required|Cloudflare|보안 확인|잠시만 기다려/i.test(title) ||
            /Verify you are human|Enable JavaScript and cookies to continue|Ray ID/i.test(bodySnippet);

        if (!isCloudflare) {
            return true;
        }

        console.log(`[Cloudflare 감지 - 시도 ${attempt}/6] 페이지 제목: "${title}"`);

        try {
            for (const frame of page.frames()) {
                const url = frame.url();
                if (url.includes('cloudflare') || url.includes('turnstile') || url.includes('challenges')) {
                    const cb = frame.locator('input[type="checkbox"], .cb-lb, #challenge-stage').first();
                    if ((await cb.count()) > 0) {
                        await cb.click({ force: true, timeout: 2000 }).catch(() => {});
                    } else {
                        await frame.locator('body').click({ position: { x: 30, y: 30 }, force: true, timeout: 2000 }).catch(() => {});
                    }
                }
            }
            const mainBox = await page
                .locator('iframe[src*="cloudflare"], iframe[src*="challenges"], #turnstile-wrapper')
                .first()
                .boundingBox()
                .catch(() => null);
            if (mainBox) {
                await page.mouse.click(mainBox.x + 35, mainBox.y + mainBox.height / 2);
            }
        } catch (e) {}

        await page.waitForTimeout(3500);
    }
    return false;
}

/**
 * 상단 헤더 검색창('닉네임을 입력하세요' + 달력 아이콘)을 절대 건드리지 않고,
 * 본문 좌측 '1 파티원 검색' 컨테이너 내부의 전용 인풋창만 정확히 타겟팅
 */
async function findPartyMemberSearchInput(page) {
    const selectors = [
        // 1순위: '파티원 닉네임을 (",")로 구분해서 입력해주세요' 안내 문구가 포함된 컨테이너 내부의 input
        'xpath=//*[contains(text(), "파티원 닉네임을")]/ancestor::div[.//input][1]//input',
        // 2순위: '파티원 검색' 제목 텍스트가 포함된 카드/박스 컨테이너 내부의 input
        'xpath=//*[contains(text(), "파티원 검색")]/ancestor::div[.//input][1]//input',
        // 3순위: 우측에 돋보기 아이콘(svg.lucide-search) 버튼을 가진 relative 래퍼 안의 input (상단 헤더는 lucide-calendar 사용)
        'div.relative:has(svg.lucide-search) > input',
        // 4순위: Playwright has-text 필터로 '파티원 검색' 섹션 내부의 마지막 input
        'div:has-text("파티원 닉네임을") input'
    ];

    for (const sel of selectors) {
        const loc = page.locator(sel).last();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
            return loc;
        }
    }
    return null;
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

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--window-size=1440,950'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 950 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        extraHTTPHeaders: {
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Upgrade-Insecure-Requests': '1'
        }
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    const page = await context.newPage();
    console.log('2. https://maplescouter.com/ko/multi-result 접속 중...');
    await page.goto('https://maplescouter.com/ko/multi-result', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    await tryPassCloudflare(page);

    // 30초 동안 '1 파티원 검색' 전용 인풋창이 렌더링될 때까지 폴링 대기
    let partySearchInput = null;
    const waitStart = Date.now();
    while (Date.now() - waitStart < 30000) {
        partySearchInput = await findPartyMemberSearchInput(page);
        if (partySearchInput) break;
        await tryPassCloudflare(page);
        await page.waitForTimeout(1000);
    }

    if (!partySearchInput) {
        const pageTitle = await page.title().catch(() => '(제목 읽기 실패)');
        const pageUrl = page.url();
        const bodyPreview = await page
            .evaluate(() => (document.body ? document.body.innerText.slice(0, 1200) : '(본문 없음)'))
            .catch(() => '(본문 읽기 실패)');
        const htmlPreview = await page
            .evaluate(() => (document.body ? document.body.innerHTML.slice(0, 1500) : '(HTML 없음)'))
            .catch(() => '(HTML 읽기 실패)');

        console.error('====================================================');
        console.error('❌ [디버깅 로그] 30초 내에 "1 파티원 검색" 전용 입력창을 찾지 못했습니다.');
        console.error('현재 URL:', pageUrl);
        console.error('현재 페이지 제목(Title):', pageTitle);
        console.error('현재 페이지 본문 일부(Body):', bodyPreview);
        console.error('현재 페이지 HTML 구조 일부:', htmlPreview);
        try {
            await page.screenshot({ path: 'debug-search-input-fail.png', fullPage: true });
            console.error('디버그 스크린샷 저장 완료: debug-search-input-fail.png');
        } catch (shotErr) {}
        console.error('====================================================');

        await browser.close();
        throw new Error(`파티원 검색 전용 입력창 탐색 실패 (페이지 제목: ${pageTitle})`);
    }

    await page.waitForTimeout(1000);

    // 기존 DB의 캐릭터별 배율 데이터를 초기값으로 복사하여 누적
    const collectedSpecs = { ...existingSpecs };

    // 동일한 참여자 조합(정렬 기준)에 대해 이미 검색한 적이 있는지 캐시하여 불필요한 중복 검색 방지
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

        const queryStr = partyChars.join(',');
        console.log(`\n[파티 ${idx + 1}/${validParties.length}] "${party.title}" (${queryStr}) -> 대상 보스: ${partyBosses.join(', ')}`);

        // 1. '1 파티원 검색' 전용 인풋창 클릭 -> 기존 텍스트 전체 삭제(fill('')) -> 파티 캐릭터 쉼표 연결 입력
        const inputLocator = (await findPartyMemberSearchInput(page)) || partySearchInput;
        await inputLocator.click();
        await inputLocator.fill('');
        await inputLocator.fill(queryStr);

        // 인풋창 바로 옆의 돋보기 버튼(button 또는 svg) 클릭 및 Enter 키 실행
        const searchBtn = inputLocator.locator('xpath=following-sibling::button[1] | parent::div/button[1]').first();
        if ((await searchBtn.count().catch(() => 0)) > 0) {
            await searchBtn.click().catch(() => {});
        }
        await inputLocator.press('Enter').catch(() => {});

        // 검색 후 2단계 보스 선택 버튼 활성화 및 3단계 파티격 분석실 결과 로드 대기
        let loaded = false;
        for (let waitStep = 0; waitStep < 20; waitStep++) {
            await page.waitForTimeout(500);
            loaded = await page.evaluate((names) => {
                const bodyText = document.body.innerText || '';
                const step3Text = bodyText.split('파티격 분석실').pop() || '';
                return names.some(n => step3Text.includes(n)) && step3Text.includes('솔플배율');
            }, partyChars);
            if (loaded) {
                await page.waitForTimeout(500);
                break;
            }
        }

        if (!loaded) {
            console.warn(`  ⚠️ "${party.title}" 파티원(${queryStr}) 검색 결과가 로드되지 않았거나 지원 스펙 미달입니다.`);
            continue;
        }

        // 2. 해당 파티가 가는 보스들(party.bosses)을 순회하며 '2 보스 선택' 영역에서 일치하는 버튼 클릭
        for (const bossKey of partyBosses) {
            const target = resolveBossTarget(bossKey);
            if (!target) {
                console.warn(`  ⚠️ 매핑되지 않은 보스 이름 건너뜀: ${bossKey}`);
                continue;
            }

            const clicked = await page.evaluate(({ diffEng, bossKor }) => {
                const candidates = [...document.querySelectorAll('div, button')].filter(el => {
                    const lines = (el.innerText || '')
                        .trim()
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean);
                    return lines.length === 2 && lines[0] === diffEng && lines[1] === bossKor;
                });
                // 가장 안쪽의 실제 보스 버튼 카드 선택
                candidates.sort((a, b) => a.innerHTML.length - b.innerHTML.length);
                if (candidates.length > 0) {
                    candidates[0].click();
                    return true;
                }
                return false;
            }, { diffEng: target.diff, bossKor: target.boss });

            if (!clicked) {
                console.warn(`  ⚠️ 보스 선택 버튼을 찾을 수 없음: ${bossKey} (${target.diff} ${target.boss})`);
                continue;
            }

            // 보스 클릭 후 3단계 '파티격 분석실' 수치 갱신 대기
            await page.waitForTimeout(400);

            // 3. '3 파티격 분석실'의 각 캐릭터 카드에서 닉네임과 '솔플배율'(%) 추출
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

                    const lines = cardText
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean);
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

            const extractedLog = [];
            for (const [charName, multVal] of Object.entries(parsedCards)) {
                if (!collectedSpecs[charName]) collectedSpecs[charName] = {};
                collectedSpecs[charName][bossKey] = multVal;
                extractedLog.push(`${charName}: ${multVal}%`);
            }
            console.log(`  ✔ [${bossKey}] 추출 완료 -> ${extractedLog.join(', ') || '데이터 없음'}`);
        }

        // 4. 다음 파티 검색을 위해 인풋창 비우기
        await inputLocator.fill('').catch(() => {});
    }

    await browser.close();

    const nowIso = new Date().toISOString();
    const rowsToUpsert = Object.entries(collectedSpecs).map(([char_name, multipliers]) => ({
        char_name,
        multipliers,
        updated_at: nowIso
    }));

    console.log(`\n3. 총 ${rowsToUpsert.length}명의 캐릭터 배율 데이터를 Supabase character_specs 테이블에 일괄 Upsert 중...`);
    if (rowsToUpsert.length > 0) {
        await upsertSpecsToSupabase(rowsToUpsert);
        console.log('✅ 모든 파티 배율 업데이트 완료!');
    } else {
        console.warn('⚠️ 저장할 배율 데이터가 없습니다.');
    }
}

main().catch(err => {
    console.error('❌ 스크립트 실행 중 오류 발생:', err);
    process.exit(1);
});
