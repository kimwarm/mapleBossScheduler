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

        // Turnstile iframe 내부 체크박스 클릭 시도
        try {
            const frames = page.frames();
            for (const frame of frames) {
                const url = frame.url();
                if (url.includes('cloudflare') || url.includes('turnstile') || url.includes('challenges')) {
                    const cb = frame.locator('input[type="checkbox"], .cb-lb, #challenge-stage').first();
                    if (await cb.count() > 0) {
                        await cb.click({ force: true, timeout: 2000 }).catch(() => {});
                    } else {
                        await frame.locator('body').click({ position: { x: 30, y: 30 }, force: true, timeout: 2000 }).catch(() => {});
                    }
                }
            }
            // 메인 페이지 내 turnstile 컨테이너 좌표 클릭 시도
            const mainBox = await page.locator('iframe[src*="cloudflare"], iframe[src*="challenges"], #turnstile-wrapper').first().boundingBox().catch(() => null);
            if (mainBox) {
                await page.mouse.click(mainBox.x + 35, mainBox.y + mainBox.height / 2);
            }
        } catch (e) {}

        await page.waitForTimeout(3500);
    }
    return false;
}

/**
 * 화면 내 '1 파티원 검색' 영역의 텍스트 입력창 Locator를 유연하게 탐색
 */
async function findPartySearchInputLocator(page) {
    // 1순위: 돋보기(lucide-search) 버튼과 함께 있는 텍스트 인풋 또는 pr-8 클래스를 가진 검색 인풋
    const candidates = [
        'input.pr-8',
        'div:has(svg.lucide-search) > input',
        'input[placeholder*="입력해주세요"]',
        'input[placeholder*="닉네임"]',
        'form input[type="text"]',
        'input[type="text"]:visible',
        'input:not([type="hidden"]):visible'
    ];

    for (const sel of candidates) {
        const loc = page.locator(sel);
        const count = await loc.count().catch(() => 0);
        if (count > 0) {
            // 여러 개일 경우(상단 헤더 검색창 등 제외), '1 파티원 검색' 섹션에 해당하는 마지막 visible 인풋 또는 첫 번째 매칭 선택
            for (let i = 0; i < count; i++) {
                const nth = loc.nth(i);
                if (await nth.isVisible().catch(() => false)) {
                    // 만약 일반 input[type="text"] 후보군이라면 파티원 검색란(보통 3번째 또는 pr-8 포함) 우선 확인
                    const cls = (await nth.getAttribute('class').catch(() => '')) || '';
                    if (cls.includes('pr-8') || sel.includes('pr-8') || sel.includes('lucide-search')) {
                        return nth;
                    }
                }
            }
            // pr-8이 없더라도 보이는 첫 번째/적절한 텍스트 인풋 반환
            for (let i = count - 1; i >= 0; i--) {
                const nth = loc.nth(i);
                if (await nth.isVisible().catch(() => false)) {
                    return nth;
                }
            }
        }
    }
    return null;
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

    // navigator.webdriver 등 자동화 탐지 속성 숨김 처리
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

    // Cloudflare 대기 화면이 있으면 통과 시도
    await tryPassCloudflare(page);

    // 30초 동안 유연한 선택자로 텍스트 인풋이 나타날 때까지 폴링 대기
    let searchInput = null;
    const waitStart = Date.now();
    while (Date.now() - waitStart < 30000) {
        searchInput = await findPartySearchInputLocator(page);
        if (searchInput) break;
        await tryPassCloudflare(page);
        await page.waitForTimeout(1000);
    }

    if (!searchInput) {
        const pageTitle = await page.title().catch(() => '(제목 읽기 실패)');
        const pageUrl = page.url();
        const bodyPreview = await page
            .evaluate(() => (document.body ? document.body.innerText.slice(0, 1000) : '(본문 없음)'))
            .catch(() => '(본문 읽기 실패)');

        console.error('====================================================');
        console.error('❌ [디버깅 로그] 30초 내에 파티원 검색 입력창을 찾지 못했습니다.');
        console.error('현재 URL:', pageUrl);
        console.error('현재 페이지 제목(Title):', pageTitle);
        console.error('현재 페이지 본문 일부(Body):', bodyPreview);
        console.error('====================================================');

        await browser.close();
        throw new Error(`입력창 탐색 타임아웃 (페이지 제목: ${pageTitle})`);
    }

    await page.waitForTimeout(1000);
    const collectedSpecs = {};

    for (const group of charGroups) {
        const queryStr = group.join(',');
        console.log(`\n[검색 그룹] "${queryStr}" 검색 중...`);

        // 1단계: 인풋 필드를 찾아 focus() 후 fill(nicknames.join(',')) 처리 + Enter 키 및 우측 검색 버튼 클릭 모두 시도
        const currentInput = (await findPartySearchInputLocator(page)) || searchInput;
        await currentInput.focus();
        await currentInput.fill(queryStr);
        await page.keyboard.press('Enter');

        // 우측 돋보기 검색 버튼 클릭도 함께 시도
        await page.evaluate(() => {
            const inputs = [...document.querySelectorAll('input:not([type="hidden"])')];
            const target =
                inputs.find(el => (el.className || '').includes('pr-8')) ||
                inputs.find(el => (el.placeholder || '').includes('닉네임')) ||
                inputs[inputs.length - 1];
            if (target && target.parentElement) {
                const btn = target.parentElement.querySelector('button, [role="button"], svg');
                if (btn && typeof btn.click === 'function') {
                    btn.click();
                }
            }
        }).catch(() => {});

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
    if (rowsToUpsert.length === 0) {
        console.warn('⚠️ 추출된 캐릭터 배율 데이터가 0건입니다. 사이트 응답 또는 캐릭터 검색 조건을 확인해주세요.');
    } else {
        await upsertSpecsToSupabase(rowsToUpsert);
        console.log('✅ 업데이트 완료!');
    }
}

main().catch(err => {
    console.error('❌ 스크립트 실행 중 오류 발생:', err);
    process.exit(1);
});
