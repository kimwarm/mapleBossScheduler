/**
 * Supabase Realtime 대기열(refresh_queue) 감시 및 단일 파티 실시간 크롤링 워커
 * - 브라우저 상주 재사용(싱글톤) 아키텍처: ProcessSingleton Lock 파일 충돌 원천 방지
 * - 화면 밖 백그라운드 구동: 작업 중 화면 가림 없음
 * - 5초 내외 초고속 배율 갱신
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');

// Cloudflare 봇 감지 우회를 위한 Stealth 플러그인 등록
chromium.use(stealth);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wwtlccjhiearimyuquwh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_cJRd9WgKIcPA1xGGuXO4gA_6geEwGGD';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// 현재 실행 중인 브라우저 컨텍스트 추적
let currentBrowserContext = null;

async function launchCrawlerBrowser() {
    console.log('🌐 크롤러 브라우저 실행 중...');
    const profilePath = path.join(__dirname, '.chrome-profile');

    const context = await chromium.launchPersistentContext(profilePath, {
        channel: 'chrome',
        headless: false,
        viewport: { width: 1440, height: 950 },
        args: [
            '--window-position=-3000,-3000', // 모니터 화면 밖으로 배치
            '--window-size=1440,950',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    currentBrowserContext = context;
    return context;
}

/**
 * 단일 파티에 대해서만 배율 크롤링 수행
 */
async function crawlSingleParty(charsStr, bossesStr) {
    const partyChars = charsStr.split(',').map(c => c.trim()).filter(Boolean);
    const partyBosses = bossesStr.split(',').map(b => b.trim()).filter(Boolean);

    if (partyChars.length === 0 || partyBosses.length === 0) {
        throw new Error('파티 캐릭터 또는 보스 목록이 비어 있습니다.');
    }

    const queryStr = partyChars.join(', ');
    console.log(`[크롤링 시작] 파티원: ${queryStr} | 대상 보스: ${partyBosses.join(', ')}`);

    let context = null;

    try {
        context = await launchCrawlerBrowser();
        const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

        console.log('1. https://maplescouter.com/ko/multi-result 접속 중...');
        await page.goto('https://maplescouter.com/ko/multi-result', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2500);

        // Turnstile 챌린지가 실제로 보일 때만 클릭
        for (const f of page.frames()) {
            if (f.url().includes('challenges') || f.url().includes('turnstile')) {
                const box = await f.locator('body').boundingBox().catch(() => null);
                if (box && box.width > 0) {
                    await page.mouse.click(box.x + 28, box.y + box.height / 2).catch(() => {});
                }
            }
        }

        // 혹시 다른 페이지로 이동했다면 다시 복귀
        if (!page.url().includes('multi-result')) {
            await page.goto('https://maplescouter.com/ko/multi-result', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
        }

        // 파티원 검색창 찾기
        const inputLoc = page.locator('input[placeholder*="닉네임"]').last();
        await inputLoc.waitFor({ state: 'visible', timeout: 10000 });
        await inputLoc.click({ force: true });
        await inputLoc.fill(queryStr);
        await inputLoc.press('Enter');

        console.log('2. 검색 결과 대기 중...');
        await page.waitForTimeout(3500);

        // 혹시라도 엔터로 인해 후원창 등으로 튕겼다면 원복
        if (!page.url().includes('multi-result')) {
            console.warn('⚠️ URL 이탈 감지, 파티 보스컷 페이지로 재이동');
            await page.goto('https://maplescouter.com/ko/multi-result', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2500);
        }

        // 기존 DB 배율 데이터 조회
        const { data: existingRows } = await supabase
            .from('character_specs')
            .select('*')
            .in('char_name', partyChars);

        const specsMap = {};
        for (const c of partyChars) {
            specsMap[c] = {};
        }
        for (const row of (existingRows || [])) {
            if (row.char_name && row.multipliers && typeof row.multipliers === 'object') {
                specsMap[row.char_name.trim()] = { ...row.multipliers };
            }
        }

        // 보스별 버튼 클릭 및 배율 수집
        for (const bossKey of partyBosses) {
            const target = resolveBossTarget(bossKey);
            if (!target) {
                console.warn(`  ⚠️ 매핑되지 않은 보스: ${bossKey}`);
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

            // 전면 광고 '닫기' 시도
            await page.evaluate(() => {
                const closeBtns = [...document.querySelectorAll('*')].filter(el => (el.innerText || '').trim() === '닫기');
                for (const b of closeBtns) { try { b.click(); } catch (e) {} }
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
                if (!specsMap[charName]) specsMap[charName] = {};
                specsMap[charName][bossKey] = multVal;
                logItems.push(`${charName}: ${multVal}%`);
            }
            console.log(`  ✔ [${bossKey}] -> ${logItems.join(', ') || '배율 없음'}`);
        }

        // DB에 upsert 저장
        const nowIso = new Date().toISOString();
        const upsertRows = Object.entries(specsMap).map(([char_name, multipliers]) => ({
            char_name,
            multipliers,
            updated_at: nowIso
        }));

        if (upsertRows.length > 0) {
            const { error } = await supabase
                .from('character_specs')
                .upsert(upsertRows, { onConflict: 'char_name' });
            if (error) throw error;
            console.log(`  💾 ${upsertRows.length}명 캐릭터 배율 character_specs 저장 완료!`);
        }
    } finally {
        if (context) {
            console.log('🚪 크롤링 완료: 크롬 브라우저를 종료합니다.');
            await context.close().catch(() => {});
            currentBrowserContext = null;
            await new Promise(r => setTimeout(r, 600)); // 파일 락 해제 안전 대기
        }
    }
}

let isProcessing = false;
const queue = [];

async function processQueue() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;

    const item = queue.shift();
    console.log(`\n▶ [새로고침 요청 수신] ID: ${item.id} (${item.party_title || '파티'})`);

    try {
        await supabase
            .from('refresh_queue')
            .update({ status: 'processing' })
            .eq('id', item.id);

        await crawlSingleParty(item.chars, item.bosses);

        await supabase
            .from('refresh_queue')
            .update({ status: 'done' })
            .eq('id', item.id);

        console.log(`✅ [새로고침 완료] ID: ${item.id} (${item.party_title || '파티'})`);
    } catch (err) {
        console.error(`❌ [새로고침 실패] ID: ${item.id}:`, err);
        try {
            await supabase
                .from('refresh_queue')
                .update({ status: 'failed' })
                .eq('id', item.id);
        } catch (_) {}
    } finally {
        isProcessing = false;
        if (queue.length > 0) {
            processQueue();
        }
    }
}

function enqueueItem(item) {
    if (!item || !item.id) return;
    if (queue.some(q => q.id === item.id)) return;

    // 만약 동일한 파티(party_title 또는 chars)에 대한 대기 중인 항목이 이미 큐에 있다면
    // 이전 요청은 중복이므로 스킵 처리하고 최신 요청만 유지
    const duplicateIdx = queue.findIndex(q => 
        (q.party_id && q.party_id === item.party_id) || 
        (q.party_title && q.party_title === item.party_title)
    );
    if (duplicateIdx !== -1) {
        const oldItem = queue.splice(duplicateIdx, 1)[0];
        console.log(`⏩ [중복 요청 스킵] ${oldItem.party_title || oldItem.id} (최신 요청으로 대체)`);
        supabase.from('refresh_queue').update({ status: 'done' }).eq('id', oldItem.id).then(() => {}, () => {});
    }

    queue.push(item);
    processQueue();
}

async function startWorker() {
    console.log('========================================================');
    console.log('🚀 메이플 파티보스 배율 실시간 워커 (Realtime Worker) 가동 중');
    console.log('   - 웹사이트에서 [🔄 배율 새로고침] 버튼을 누르면 크롬 실행');
    console.log('   - 배율 수집 완료 시 크롬창이 자동으로 꺼집니다.');
    console.log('========================================================');

    // 1. 서버 켜기 전 쌓여있던 오래된(3분 이상) pending 작업은 정리하고, 최신 것만 처리
    const { data: pendingItems, error: selectError } = await supabase
        .from('refresh_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (!selectError && pendingItems && pendingItems.length > 0) {
        const now = Date.now();
        const validPending = [];

        for (const item of pendingItems) {
            const ageMs = now - new Date(item.created_at).getTime();
            // 3분(180,000ms) 이상 지난 이전 요청은 만료 처리
            if (ageMs > 180000) {
                console.log(`🧹 [만료된 이전 대기열 정리] ${item.party_title || item.id} (${Math.round(ageMs / 1000)}초 전 요청)`);
                await supabase.from('refresh_queue').update({ status: 'done' }).eq('id', item.id);
            } else {
                validPending.push(item);
            }
        }

        if (validPending.length > 0) {
            console.log(`최근 유효 대기열 ${validPending.length}건 큐에 등록...`);
            for (const item of validPending) {
                enqueueItem(item);
            }
        }
    }

    // 2. Realtime INSERT 구독
    supabase
        .channel('refresh_queue_realtime')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'refresh_queue'
        }, (payload) => {
            console.log('🔔 신규 새로고침 요청 감지:', payload.new.party_title || payload.new.id);
            if (payload.new && payload.new.status === 'pending') {
                enqueueItem(payload.new);
            }
        })
        .subscribe((status) => {
            console.log(`[Realtime 채널 상태]: ${status}`);
        });
}

// 안전한 프로세스 종료 처리
process.on('SIGINT', async () => {
    console.log('\n워커를 안전하게 종료하는 중...');
    if (currentBrowserContext) await currentBrowserContext.close().catch(() => {});
    process.exit(0);
});
process.on('SIGTERM', async () => {
    if (currentBrowserContext) await currentBrowserContext.close().catch(() => {});
    process.exit(0);
});

startWorker().catch(async err => {
    console.error('워커 초기화 오류:', err);
    if (currentBrowserContext) await currentBrowserContext.close().catch(() => {});
    process.exit(1);
});
