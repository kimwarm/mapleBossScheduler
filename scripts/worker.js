/**
 * 실시간 파티별 배율 새로고침 로컬 워커 (scripts/worker.js)
 * 웹사이트 상세 모달에서 [🔄 배율 갱신] 클릭 시,
 * 내 컴퓨터에서 크롬을 열어 해당 파티의 배율만 조회하고 DB에 저장한 뒤 크롬을 자동으로 닫습니다.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wwtlccjhiearimyuquwh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_cJRd9WgKIcPA1xGGuXO4gA_6geEwGGD';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 워커 중복 실행 방지 (새 워커 실행 시 기존 워커 프로세스를 자동 교체)
const fs = require('fs');
const LOCK_FILE = path.join(__dirname, '.worker.lock');
const LOG_FILE = path.join(__dirname, 'worker.log');

const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);
function writeLogLine(args) {
    const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    try {
        fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
    } catch (e) {}
}
console.log = (...args) => { origLog(...args); writeLogLine(args); };
console.warn = (...args) => { origWarn(...args); writeLogLine(args); };
console.error = (...args) => { origError(...args); writeLogLine(args); };

try {
    const prevPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
    if (prevPid && prevPid !== process.pid) {
        process.kill(prevPid);
    }
} catch (e) {
    // 락 파일이 없거나 이전 프로세스가 이미 종료된 상태
}
fs.writeFileSync(LOCK_FILE, String(process.pid));
const releaseLock = () => {
    try {
        if (fs.readFileSync(LOCK_FILE, 'utf8') === String(process.pid)) fs.unlinkSync(LOCK_FILE);
    } catch (e) {}
};
process.on('exit', releaseLock);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

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

function resolveBossTarget(bossStr) {
    const trimmed = bossStr.trim();
    if (BOSS_BUTTON_MAP[trimmed]) return BOSS_BUTTON_MAP[trimmed];
    const diffMap = { 익스: 'EXTREME', 하드: 'HARD', 카오스: 'CHAOS', 노말: 'NORMAL', 이지: 'EASY' };
    const match = trimmed.match(/^(.+?)\((.+?)\)$/);
    if (match) {
        let bossName = match[1].trim();
        const diffKor = match[2].trim();
        if (bossName === '검은마법사') bossName = '검은 마법사';
        if (diffMap[diffKor]) return { diff: diffMap[diffKor], boss: bossName };
    }
    return null;
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

/**
 * CDP를 이용해 크롬 창을 화면 밖으로 숨기거나(기본), 캡챠 발생 시 화면 중앙으로 띄우는 헬퍼
 */
async function setBrowserWindowVisible(page, visible) {
    try {
        const cdp = await page.context().newCDPSession(page);
        const { windowId } = await cdp.send('Browser.getWindowForTarget');
        await cdp.send('Browser.setWindowBounds', {
            windowId,
            bounds: { windowState: 'normal' }
        }).catch(() => {});

        if (visible) {
            await cdp.send('Browser.setWindowBounds', {
                windowId,
                bounds: { left: 200, top: 100, width: 1200, height: 860 }
            });
            await page.bringToFront().catch(() => {});
        } else {
            await cdp.send('Browser.setWindowBounds', {
                windowId,
                bounds: { left: -32000, top: -32000, width: 1440, height: 950 }
            });
        }
        await cdp.detach().catch(() => {});
    } catch (e) {}
}

/**
 * 현재 페이지에 캡챠("사람 확인이 필요해요" 등)나 결과("솔플배율")가 떴는지 상태 확인
 */
async function inspectPageState(page) {
    return await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const title = document.title || '';

        const hasCaptchaText =
            bodyText.includes('사람 확인이 필요해요') ||
            bodyText.includes('보안 확인을 완료해 주세요') ||
            bodyText.includes('보안 확인 수행 중') ||
            bodyText.includes('사람인지 확인하십시오') ||
            title.includes('Just a moment');

        const hasTurnstileIframe = [...document.querySelectorAll('iframe')].some(f => {
            const src = f.getAttribute('src') || '';
            const r = f.getBoundingClientRect();
            return (src.includes('cloudflare') || src.includes('turnstile')) && r.width > 0 && r.height > 0;
        });

        const hasResult = bodyText.includes('솔플배율');

        return {
            captchaActive: hasCaptchaText || hasTurnstileIframe,
            hasResult
        };
    }).catch(() => ({ captchaActive: false, hasResult: false }));
}

/**
 * 초기 페이지 접속 시 캡챠가 뜨면 창을 화면에 띄워 수동 클릭을 대기
 */
async function waitForVerificationPass(page, timeoutMs = 90000) {
    const start = Date.now();
    let hadChallenge = false;
    let windowShown = false;

    while (Date.now() - start < timeoutMs) {
        const { captchaActive } = await inspectPageState(page);

        if (!captchaActive) {
            if (windowShown) {
                console.log('  ✅ [캡챠 인증 완료] 창을 다시 화면 밖으로 숨깁니다.');
                await setBrowserWindowVisible(page, false);
            }
            await dismissAdPopups(page);
            return { passed: true, clickedChallenge: hadChallenge };
        }

        hadChallenge = true;
        if (!windowShown) {
            windowShown = true;
            console.log('  🛡️ [캡챠 감지] 수동 인증을 위해 크롬 창을 화면에 띄웁니다. 체크박스를 클릭해주세요!');
            await setBrowserWindowVisible(page, true);
        }

        await page.waitForTimeout(800);
    }

    if (windowShown) {
        await setBrowserWindowVisible(page, false);
    }
    await dismissAdPopups(page);
    return { passed: false, clickedChallenge: hadChallenge };
}

/**
 * 파티원 검색(Enter) 후:
 * - 캡챠 없이 '솔플배율' 결과가 뜨면 즉시 진행
 * - '사람 확인이 필요해요' 캡챠가 뜨면 크롬 창을 화면 앞으로 띄워 사용자가 직접 클릭할 때까지 대기 후,
 *   통과되면 다시 창을 숨기고 검색 결과를 기다림
 */
async function waitForSearchResultOrManualCaptcha(page, inputLoc, queryStr, timeoutMs = 90000) {
    const start = Date.now();
    let windowShown = false;
    let hadCaptcha = false;

    while (Date.now() - start < timeoutMs) {
        await dismissAdPopups(page);
        const { captchaActive, hasResult } = await inspectPageState(page);

        if (captchaActive) {
            hadCaptcha = true;
            if (!windowShown) {
                windowShown = true;
                console.log('  🛡️ [캡챠 감지] 수동 인증을 위해 크롬 창을 화면에 띄웁니다. 체크박스를 직접 클릭해주세요!');
                await setBrowserWindowVisible(page, true);
            }
            await page.waitForTimeout(800);
            continue;
        }

        // 캡챠가 방금 풀린 직후라면 창을 다시 숨기고 검색 Enter 재전송
        if (hadCaptcha && windowShown) {
            console.log('  ✅ [캡챠 인증 완료] 크롬 창을 다시 숨기고 파티원 검색을 이어서 진행합니다.');
            windowShown = false;
            await setBrowserWindowVisible(page, false);
            await inputLoc.click({ force: true }).catch(() => {});
            await inputLoc.fill(queryStr).catch(() => {});
            await inputLoc.press('Enter').catch(() => {});
            await page.waitForTimeout(2500);
            continue;
        }

        if (hasResult) {
            return true;
        }

        // 아직 로딩 중인 경우 (최대 10초까지만 단순 로딩 대기, 그 이후에도 결과/캡챠 둘 다 없으면 재검색 1회 시도)
        const elapsed = Date.now() - start;
        if (!hadCaptcha && elapsed > 6000 && elapsed < 7000) {
            await inputLoc.press('Enter').catch(() => {});
        }
        if (!hadCaptcha && elapsed > 12000) {
            break;
        }

        await page.waitForTimeout(600);
    }

    if (windowShown) {
        await setBrowserWindowVisible(page, false);
    }
    return false;
}

let isProcessing = false;
const pendingQueue = [];

/**
 * 요청이 들어왔을 때만 브라우저를 열고, 배율 수집 및 저장 후 즉시 브라우저를 종료합니다.
 * 평소에는 창을 화면 밖(-32000, -32000)으로 숨겨두고 캡챠가 뜰 때만 화면에 표시합니다.
 */
async function launchTempBrowser() {
    const profilePath = path.join(__dirname, '.chrome-profile');
    const context = await chromium.launchPersistentContext(profilePath, {
        channel: 'chrome',
        headless: false,
        viewport: { width: 1440, height: 950 },
        args: [
            '--disable-blink-features=AutomationControlled',
            '--window-position=-32000,-32000',
            '--window-size=1440,950',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    await setBrowserWindowVisible(page, false);
    return { context, page };
}

/**
 * 단일 파티 배율 스크래핑 및 DB 반영
 */
async function processQueueItem(item) {
    // 여러 워커가 동시에 켜져 있을 때 중복 실행 방지 (pending 상태일 때만 선점)
    const { data: claimed } = await supabase
        .from('refresh_queue')
        .update({ status: 'processing' })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select('id');

    if (!claimed || claimed.length === 0) {
        return;
    }

    console.log(`\n⚡ [갱신 요청 수신] 파티: "${item.party_title}" (ID: ${item.id})`);
    const startTime = Date.now();

    let context = null;
    try {
        const partyChars = (item.chars || '').split(',').map(c => c.trim()).filter(Boolean);
        const partyBosses = (item.bosses || '').split(',').map(b => b.trim()).filter(Boolean);

        if (partyChars.length === 0 || partyBosses.length === 0) {
            throw new Error('파티원 또는 보스 목록이 비어있습니다.');
        }

        // 1. 기존 DB에 저장된 캐릭터별 배율 먼저 조회 (다른 보스 배율이 덮어씌워지지 않도록 병합)
        const collectedSpecs = {};
        const { data: existingRows } = await supabase
            .from('character_specs')
            .select('char_name, multipliers')
            .in('char_name', partyChars);

        if (existingRows && existingRows.length > 0) {
            for (const row of existingRows) {
                if (row.char_name && row.multipliers && typeof row.multipliers === 'object') {
                    collectedSpecs[row.char_name.trim()] = { ...row.multipliers };
                }
            }
        }

        // 2. 크롬 실행 및 사이트 접속
        const launched = await launchTempBrowser();
        context = launched.context;
        const page = launched.page;

        await page.goto('https://maplescouter.com/ko/multi-result', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await page.waitForTimeout(2000);
        await waitForVerificationPass(page, 90000);

        // 3. 파티원 닉네임 검색 (Enter 키만 사용)
        const queryStr = partyChars.join(', ');
        const inputLoc = page.locator('input[placeholder*="파티원"], input[placeholder*="구분"], input[placeholder*="닉네임"]').last();

        await inputLoc.waitFor({ state: 'visible', timeout: 8000 });
        await inputLoc.click({ force: true });
        await inputLoc.fill('');
        await inputLoc.fill(queryStr);
        await inputLoc.press('Enter');

        // 검색 결과('솔플배율') 로딩 대기 — 캡챠가 뜨면 즉시 크롬 창을 화면 앞으로 띄워 수동 클릭을 기다림
        await waitForSearchResultOrManualCaptcha(page, inputLoc, queryStr, 90000);
        await dismissAdPopups(page);

        // 4. 해당 파티의 보스만 클릭하여 솔플배율 추출
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

            await page.waitForTimeout(1800);
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

        // 5. character_specs 테이블 Upsert
        const nowIso = new Date().toISOString();
        const rowsToUpsert = Object.entries(collectedSpecs).map(([char_name, multipliers]) => ({
            char_name,
            multipliers,
            updated_at: nowIso
        }));

        if (rowsToUpsert.length > 0) {
            const { error: upsertErr } = await supabase
                .from('character_specs')
                .upsert(rowsToUpsert, { onConflict: 'char_name' });
            if (upsertErr) throw upsertErr;
        }

        // 6. 큐 완료 상태 변경
        await supabase
            .from('refresh_queue')
            .update({ status: 'done' })
            .eq('id', item.id);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ [완료] "${item.party_title}" 배율 DB 반영 완료! (소요시간: ${elapsed}초)`);
    } catch (err) {
        console.error(`❌ [실패] "${item.party_title}" 처리 중 오류:`, err.message);
        try {
            await supabase
                .from('refresh_queue')
                .update({ status: 'failed' })
                .eq('id', item.id);
        } catch (updateErr) {}
    } finally {
        if (context) {
            try {
                await context.close();
                console.log('🔒 크롬 창이 자동으로 종료되었습니다.');
            } catch (closeErr) {}
        }
    }
}

async function drainQueue() {
    if (isProcessing) return;
    isProcessing = true;
    while (pendingQueue.length > 0) {
        const nextItem = pendingQueue.shift();
        await processQueueItem(nextItem);
    }
    isProcessing = false;
}

function enqueueIfUnique(item) {
    const duplicateIdx = pendingQueue.findIndex(
        q => (q.party_id && q.party_id === item.party_id) || q.party_title === item.party_title
    );
    if (duplicateIdx !== -1) {
        console.log(`⏭️ [중복 스킵] 이미 대기열에 있는 파티("${item.party_title}")의 이전 요청을 완료 처리합니다.`);
        const skipped = pendingQueue.splice(duplicateIdx, 1)[0];
        supabase.from('refresh_queue').update({ status: 'done' }).eq('id', skipped.id).then(() => {}, () => {});
    }
    pendingQueue.push(item);
    drainQueue();
}

async function startWorker() {
    console.log('🚀 로컬 배율 새로고침 워커 시작 중...');

    // 시작 시 3분 이상 지난 오래된 pending 요청은 만료 처리하고 최근 요청만 처리
    const { data: waitingItems } = await supabase
        .from('refresh_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (waitingItems && waitingItems.length > 0) {
        const now = Date.now();
        const freshItems = [];
        const staleIds = [];

        for (const item of waitingItems) {
            const ageMs = item.created_at ? now - new Date(item.created_at).getTime() : 0;
            if (ageMs > 180000) {
                staleIds.push(item.id);
            } else {
                freshItems.push(item);
            }
        }

        if (staleIds.length > 0) {
            console.log(`🧹 3분 이상 지난 오래된 대기 요청 ${staleIds.length}건을 자동 정리했습니다.`);
            await supabase.from('refresh_queue').update({ status: 'failed' }).in('id', staleIds);
        }

        if (freshItems.length > 0) {
            console.log(`📦 최근 대기 중인 요청 ${freshItems.length}건을 순차 처리합니다...`);
            for (const item of freshItems) {
                enqueueIfUnique(item);
            }
        }
    }

    // Supabase Realtime 구독
    supabase
        .channel('refresh-queue-worker')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'refresh_queue' },
            payload => {
                if (payload.new && payload.new.status === 'pending') {
                    enqueueIfUnique(payload.new);
                }
            }
        )
        .subscribe(status => {
            if (status === 'SUBSCRIBED') {
                console.log('🟢 [실시간 대기 중] 웹사이트 상세 모달에서 [🔄 배율 갱신] 버튼을 누르면 즉시 크롬이 열려 수집 후 자동으로 닫힙니다.');
            }
        });
}

startWorker().catch(err => {
    console.error('워커 치명적 오류:', err);
});
