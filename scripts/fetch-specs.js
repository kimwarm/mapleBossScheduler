/**
 * 환산주스탯(maplescouter.com/ko/multi-result) 파티격 분석실 DOM 크롤링 및
 * Supabase character_specs 테이블 자동 업데이트 스크립트 (Playwright 기반 로컬 최적화)
 */

require('dotenv').config();
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');

// Cloudflare 봇 감지 우회를 위한 Stealth 플러그인 등록
chromium.use(stealth);

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
 * 전면 배너 광고 모달("오늘 다시 보지 않기" / "닫기") 닫기 헬퍼
 */
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

/**
 * Cloudflare 보안 확인("사람 확인이 필요해요" 모달 및 Turnstile 체크박스) 정밀 감지 및 자동 클릭 통과
 * @returns {Promise<{ passed: boolean, clickedChallenge: boolean }>}
 */
async function waitForVerificationPass(page, timeoutMs = 45000) {
    const start = Date.now();
    let clickedChallenge = false;

    while (Date.now() - start < timeoutMs) {
        // 1. 현재 화면에 "사람 확인이 필요해요" 모달이나 Cloudflare 보안 확인 창이 떠 있는지 정밀 검사
        const challengeState = await page.evaluate(() => {
            const bodyText = document.body ? document.body.innerText : '';
            const title = document.title || '';

            // "사람 확인이 필요해요" 텍스트 요소 탐색
            const allEls = [...document.querySelectorAll('*')];
            const promptEl = allEls.find(el => {
                if (el.children.length > 2) return false;
                const t = (el.innerText || '').trim();
                if (!t.includes('사람 확인이 필요해요') && !t.includes('보안 확인을 완료해 주세요')) return false;
                const style = window.getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.2 && r.width > 0;
            });

            if (promptEl) {
                // 모달 카드 컨테이너로 거슬러 올라가 위치 파악
                let card = promptEl.parentElement;
                while (card && card !== document.body) {
                    const r = card.getBoundingClientRect();
                    const style = window.getComputedStyle(card);
                    if (
                        r.width >= 280 && r.width <= 620 &&
                        r.height >= 160 && r.height <= 550 &&
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        parseFloat(style.opacity || '1') > 0.2
                    ) {
                        // 카드 내부에서 Turnstile 위젯 컨테이너(약 300x65) 탐색
                        const innerEls = [...card.querySelectorAll('div, iframe')];
                        const widgetEl = innerEls.find(c => {
                            const wr = c.getBoundingClientRect();
                            return wr.width >= 250 && wr.width <= 340 && wr.height >= 45 && wr.height <= 90;
                        });
                        if (widgetEl) {
                            const wr = widgetEl.getBoundingClientRect();
                            return {
                                active: true,
                                source: 'widget-div',
                                x: wr.left + 28,
                                y: wr.top + wr.height / 2
                            };
                        }

                        // 위젯 div를 직접 못 찾은 경우: 상단 문구와 하단("다시 묻지 않아요") 문구 사이 중심 계산
                        const footerEl = innerEls.find(c => (c.innerText || '').includes('다시 묻지 않아요'));
                        const promptRect = promptEl.getBoundingClientRect();
                        if (footerEl) {
                            const footerRect = footerEl.getBoundingClientRect();
                            return {
                                active: true,
                                source: 'between-texts',
                                x: (r.left + r.width / 2) - 150 + 28,
                                y: (promptRect.bottom + 24 + footerRect.top) / 2
                            };
                        }

                        return {
                            active: true,
                            source: 'card-estimate',
                            x: (r.left + r.width / 2) - 150 + 28,
                            y: r.top + r.height * 0.60
                        };
                    }
                    card = card.parentElement;
                }
            }

            // 전체 화면 Cloudflare 챌린지 검사
            if (
                bodyText.includes('보안 확인 수행 중') ||
                bodyText.includes('사람인지 확인하십시오') ||
                title.includes('Just a moment')
            ) {
                return { active: true, source: 'fullpage', x: null, y: null };
            }

            return { active: false };
        }).catch(() => ({ active: false }));

        if (!challengeState.active) {
            // 보안 창이 없으면 이벤트/광고 팝업("오늘 다시 보지 않기", "닫기") 정리 후 통과
            await dismissAdPopups(page);
            return { passed: true, clickedChallenge };
        }

        clickedChallenge = true;
        console.log(`  🛡️ [보안 확인 감지: ${challengeState.source}] Turnstile 체크박스 자동 클릭 시도...`);

        let frameClicked = false;
        // 1순위: Playwright 프레임 목록에서 Turnstile iframe 직접 타겟팅
        for (const f of page.frames()) {
            const u = f.url();
            if (u.includes('challenges.cloudflare.com') || u.includes('turnstile')) {
                try {
                    const box = await f.locator('body').boundingBox();
                    if (box && box.width > 50 && box.height > 30) {
                        const targetX = box.x + 28;
                        const targetY = box.y + box.height / 2;
                        await page.mouse.move(targetX, targetY, { steps: 12 });
                        await page.waitForTimeout(100);
                        await f.locator('body').click({ position: { x: 28, y: Math.round(box.height / 2) }, delay: 60 });
                        frameClicked = true;
                        console.log(`  ✅ Turnstile iframe 체크박스 클릭 완료 (${Math.round(targetX)}, ${Math.round(targetY)})`);
                        break;
                    }
                } catch (e) {}
            }
        }

        // 2순위: Closed Shadow DOM 등으로 iframe 접근이 막힌 경우 모달 내 계산된 좌표로 정밀 클릭
        if (!frameClicked && challengeState.x && challengeState.y) {
            await page.mouse.move(challengeState.x, challengeState.y, { steps: 15 });
            await page.waitForTimeout(120);
            await page.mouse.down();
            await page.waitForTimeout(70);
            await page.mouse.up();
            console.log(`  ✅ 모달 내 체크박스 좌표 클릭 완료 (${Math.round(challengeState.x)}, ${Math.round(challengeState.y)})`);
        }

        // 클릭 후 Cloudflare 인증 스피너가 완료되고 모달이 닫힐 때까지 충분히 대기 (중복 클릭 방지)
        await page.waitForTimeout(3500);
    }

    await dismissAdPopups(page);
    return { passed: false, clickedChallenge };
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

    const targetPartyId = (process.env.TARGET_PARTY_ID || '').trim();
    const targetChars = (process.env.TARGET_CHARS || '').trim();
    const targetBosses = (process.env.TARGET_BOSSES || '').trim();
    const targetTitle = (process.env.TARGET_PARTY_TITLE || '').trim();

    let partiesToProcess = [];

    if (targetChars && targetBosses) {
        console.log(`🎯 [단일 파티 타겟팅 모드] "${targetTitle || '지정 파티'}" (파티원: ${targetChars} | 보스: ${targetBosses})`);
        partiesToProcess = [{
            id: targetPartyId || 'target',
            title: targetTitle || '지정 파티',
            chars: targetChars,
            bosses: targetBosses
        }];
    } else if (targetPartyId) {
        const found = (parties || []).find(p => String(p.id) === targetPartyId);
        if (found) {
            console.log(`🎯 [단일 파티 타겟팅 모드] ID ${targetPartyId} ("${found.title}")`);
            partiesToProcess = [found];
        } else {
            console.warn(`⚠️ ID ${targetPartyId} 파티를 DB에서 찾을 수 없어 전체 파티를 진행합니다.`);
            partiesToProcess = (parties || []).filter(p => p.chars && p.chars.trim().length > 0 && p.bosses && p.bosses.trim().length > 0);
        }
    } else {
        partiesToProcess = (parties || []).filter(p => p.chars && p.chars.trim().length > 0 && p.bosses && p.bosses.trim().length > 0);
        console.log(`🌐 [전체 파티 모드] 총 ${partiesToProcess.length}개 유효 파티 순차 갱신`);
    }

    if (partiesToProcess.length === 0) {
        console.log('추출할 파티가 없습니다.');
        return;
    }

    const isCI = !!process.env.CI;
    // GitHub Actions에서도 xvfb-run 가상 디스플레이를 통해 Headed(headless: false) 모드로 실행하여 Turnstile 통과율을 극대화
    const isHeadless = process.env.HEADLESS === 'true';
    console.log(`브라우저 실행 모드: ${isHeadless ? 'Headless' : 'Headed (실제/가상 디스플레이)'} (CI 환경: ${isCI ? 'YES' : 'NO'})`);

    const profilePath = path.join(__dirname, '.chrome-profile');
    const launchOptions = {
        headless: isHeadless,
        viewport: { width: 1440, height: 950 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--window-size=1440,950'
        ]
    };

    if (process.env.USE_CHROME_CHANNEL !== 'false') {
        launchOptions.channel = 'chrome';
    }

    let context;
    try {
        context = await chromium.launchPersistentContext(profilePath, launchOptions);
    } catch (launchErr) {
        if (launchOptions.channel) {
            console.warn(`⚠️ 'chrome' 채널 실행 실패 (${launchErr.message}), 기본 Chromium으로 재시도합니다...`);
            delete launchOptions.channel;
            context = await chromium.launchPersistentContext(profilePath, launchOptions);
        } else {
            throw launchErr;
        }
    }

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
    for (let idx = 0; idx < partiesToProcess.length; idx++) {
        const party = partiesToProcess[idx];
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
        console.log(`\n[파티 ${idx + 1}/${partiesToProcess.length}] "${party.title}" (${queryStr}) -> 대상 보스: ${partyBosses.join(', ')}`);

        // 만약 화면이 메인이나 다른 페이지로 이동했다면 다시 파티 보스컷으로 이동
        if (!page.url().includes('multi-result')) {
            await page.goto('https://maplescouter.com/ko/multi-result', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2500);
            await waitForVerificationPass(page, 25000);
        } else {
            await dismissAdPopups(page);
        }

        // 1단계: 파티원 검색창 찾기 및 입력 (Enter 키만 사용하여 하단 배너 오클릭 방지)
        const inputLoc = page.locator('input[placeholder*="파티원"], input[placeholder*="구분"], input[placeholder*="닉네임"]').last();
        try {
            await inputLoc.waitFor({ state: 'visible', timeout: 10000 });
            await inputLoc.click({ force: true });
            await inputLoc.fill('');
            await inputLoc.fill(queryStr);
            await inputLoc.press('Enter');
        } catch (err) {
            console.warn(`  ⚠️ 검색창 입력 실패, 페이지 새로고침 시도: ${err.message}`);
            await page.goto('https://maplescouter.com/ko/multi-result', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            await waitForVerificationPass(page, 25000);
            continue;
        }

        console.log('  검색 결과 로딩 및 보안 확인 대기...');
        await page.waitForTimeout(2500);
        const verifyAfterSearch = await waitForVerificationPass(page, 30000);

        // 만약 검색 직후 "사람 확인이 필요해요" 모달이 떠서 방금 체크박스를 클릭해 통과했다면,
        // 막혔던 검색 요청을 다시 실행하기 위해 Enter를 한 번 더 입력
        if (verifyAfterSearch.clickedChallenge) {
            console.log('  🔄 보안 확인 통과 완료 -> 파티원 검색 재실행...');
            if (!page.url().includes('multi-result')) {
                await page.goto('https://maplescouter.com/ko/multi-result', { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(2000);
                await dismissAdPopups(page);
            }
            await inputLoc.click({ force: true }).catch(() => {});
            await inputLoc.fill(queryStr).catch(() => {});
            await inputLoc.press('Enter').catch(() => {});
            await page.waitForTimeout(3500);
        } else {
            await page.waitForTimeout(1500);
        }

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
