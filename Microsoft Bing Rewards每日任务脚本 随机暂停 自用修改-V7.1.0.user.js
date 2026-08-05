// ==UserScript==
// @name         Microsoft Bing Rewards每日任务脚本 随机暂停 自用修改
// @name:zh-TW   Microsoft Bing Rewards每日任務腳本 隨機暫停 自用修改
// @name:en      Microsoft Bing Rewards Daily Task Script (Personal Edition)
// @version      V7.1.0
// @description  自动完成微软Rewards每日搜索任务，随机搜索次数，随机暂停时间，每日0点重新计数搜索次数,避免使用同样的搜索词被封号，悬浮搜索进度显示。
// @description:zh-TW 自動完成微軟Rewards每日搜尋任務，隨機搜尋次數，隨機暫停時間，每日0點重新計數搜尋次數,避免帳號因重複詞被封，新增浮動搜尋進度顯示。
// @description:en  Automatically completes Microsoft Rewards daily search tasks and prevents account bans from repeated queries. Added floating search progress display (top-right, large font).
// @note         更新于 2025年09月14日
// @author       789cn
// @match        https://*.bing.com/*
// @exclude      https://rewards.bing.com/*
// @license      GNU GPLv3
// @icon         https://www.bing.com/favicon.ico
// @connect      luqion.cn
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @namespace    https://greasyfork.org/zh-TW/scripts/496117
// @downloadURL https://update.greasyfork.org/scripts/496117/Microsoft%20Bing%20Rewards%E6%AF%8F%E6%97%A5%E4%BB%BB%E5%8A%A1%E8%84%9A%E6%9C%AC%20%E9%9A%8F%E6%9C%BA%E6%9A%82%E5%81%9C%20%E8%87%AA%E7%94%A8%E4%BF%AE%E6%94%B9.user.js
// @updateURL https://update.greasyfork.org/scripts/496117/Microsoft%20Bing%20Rewards%E6%AF%8F%E6%97%A5%E4%BB%BB%E5%8A%A1%E8%84%9A%E6%9C%AC%20%E9%9A%8F%E6%9C%BA%E6%9A%82%E5%81%9C%20%E8%87%AA%E7%94%A8%E4%BF%AE%E6%94%B9.meta.js
// ==/UserScript==

var cached_max = GM_getValue('max_rewards_cache', 0);
var max_rewards = cached_max || Math.floor(Math.random() * (33 - 28 + 1)) + 28; // 随机每次搜索总次数
var pause_time = Math.floor(Math.random() * (900000 - 360000 + 1)) + 360000; // 随机暂停时间（6到15分钟）
var Hot_words_apis = "https://keywords.luqion.cn/api/keywords?count=";
var scriptState = 'idle'; // 'idle' | 'running' | 'paused' | 'error'
var countdownTarget = null; // 下次搜索跳转的目标时间戳(ms)
var runToken = 0; // 运行令牌：暂停/停止时递增，使旧的定时器失效，避免重复计数
var pendingRefill = null; // 正在进行的搜索词补货请求

const POOL_KEY = 'kw_pool'; // 关键字缓存池(本地存储)，脚本中断时避免浪费服务器已标记的关键字
const REFILL_BATCH = 10; // 池快空时每次从服务器补货的数量
const REFILL_THRESHOLD = 5; // 池中剩余少于该数量时后台补货

// ================== 每日重置 ==================
function checkAndResetDaily() {
    const today = new Date().toDateString();
    const lastReset = GM_getValue('lastReset', '');
    if (lastReset !== today) {
        GM_setValue('Cnt', 0);
        GM_setValue('lastReset', today);
        GM_setValue('stopped', false);
        max_rewards = Math.floor(Math.random() * (33 - 28 + 1)) + 28;
        GM_setValue('max_rewards_cache', max_rewards);
        return true;
    }
    return false;
}

// ================== 获取热门搜索词 ==================
async function fetchKeywords(count) {
    let url = Hot_words_apis + count;
    var result = await new Promise(function(resolve, reject) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function(resp) {
                if (resp.status >= 200 && resp.status < 300) resolve(resp);
                else reject(new Error('HTTP error! status: ' + resp.status));
            },
            onerror: function(err) { reject(err || new Error('GM_xmlhttpRequest network error')); }
        });
    });
    var data = JSON.parse(result.responseText);
    if (data.data && data.data.some(item => item)) {
        GM_setValue('max_rewards_cache', max_rewards);
        return data.data.map(item => item.title);
    }
    throw new Error('搜索词API返回数据为空');
}

// ================== 关键字缓存池 ==================
// 服务器每次下发都会标记关键字已使用，脚本又经常中断。
// 所以每次搜索只从本地池取一个，池快空时才后台补货，池空时阻塞补一次，把浪费降到最低。
async function getNextKeyword() {
    let pool = GM_getValue(POOL_KEY, []);
    if (pool.length === 0) {
        await refillKeywords(); // 池空：等待补货完成（失败会抛出）
        pool = GM_getValue(POOL_KEY, []);
        if (pool.length === 0) throw new Error('搜索词池为空：补货失败');
    }
    const kw = pool.shift();
    GM_setValue(POOL_KEY, pool);
    if (pool.length < REFILL_THRESHOLD) {
        refillKeywords().catch(function() {}); // 后台补货，失败静默（下次池空时再补）
    }
    return kw;
}

function refillKeywords() {
    if (pendingRefill) return pendingRefill;
    pendingRefill = fetchKeywords(REFILL_BATCH)
        .then(function(words) {
            if (words && words.length > 0) {
                var pool = GM_getValue(POOL_KEY, []);
                GM_setValue(POOL_KEY, pool.concat(words));
                log('补货 ' + words.length + ' 个搜索词，池内共 ' + (pool.length + words.length) + ' 个');
            }
        })
        .finally(function() { pendingRefill = null; });
    return pendingRefill;
}

// ================== 菜单 ==================
GM_registerMenuCommand('开始', function () {
    GM_setValue('stopped', false);
    // ✅ 不再强制清零，保持计数器延续
    checkAndResetDaily();
    location.href = "https://www.bing.com/?br_msg=Please-Wait";
}, 'o');

GM_registerMenuCommand('停止', function () {
    doPause();
}, 'o');

GM_registerMenuCommand('重置', function () {
    GM_setValue('Cnt', 0);
    setScriptState('idle');
    log('↺ 已重置');
}, 'o');

// ================== 工具函数 ==================
function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += characters.charAt(Math.floor(Math.random() * characters.length));
    return result;
}

// ================== 悬浮搜索进度提示 ==================
(function () {
    'use strict';
    const floatDiv = document.createElement('div');
    floatDiv.id = 'bingSearchProgress';
    floatDiv.innerHTML = `
        <div class="bingProgressRow">
            <span id="bingProgressText">[0 / ${max_rewards}]</span>
            <span id="bingCountdown" class="bingCountdown"></span>
        </div>
        <div id="bingButtons">
            <button id="bingBtnToggle">▶ 开始</button>
            <button id="bingBtnStop">⏹ 停止</button>
        </div>
    `;
    document.body.appendChild(floatDiv);

    var logPanel = document.createElement('div');
    logPanel.id = 'bingLogPanel';
    logPanel.innerHTML = '<div id="bingLogHeader"><span id="bingLogTitle">日志 (0)</span><span><span id="bingLogClear" title="清除日志">✕</span> <span id="bingLogToggle">▶</span></span></div><div id="bingLogContent" style="display:none"></div>';
    document.body.appendChild(logPanel);

    GM_addStyle(`
        #bingSearchProgress {
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            background: rgba(0,0,0,0.6);
            color: #fff;
            font-size: 18px;
            font-weight: bold;
            padding: 12px 18px;
            border-radius: 10px;
            box-shadow: 0 0 12px rgba(0,0,0,0.5);
            text-align: center;
        }
        .bingProgressRow {
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 10px;
        }
        .bingCountdown {
            font-size: 14px;
            font-weight: normal;
            white-space: nowrap;
        }
        .bingCountdown.warning { color: #ffeb3b; }
        .bingCountdown.info { color: #4caf50; }
        #bingButtons {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-top: 10px;
        }
        #bingButtons button {
            padding: 4px 16px;
            font-size: 13px;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,0.25);
            background: rgba(255,255,255,0.1);
            color: #fff;
            border-radius: 4px;
            line-height: 1;
            transition: background 0.2s;
        }
        #bingButtons button:hover {
            background: rgba(255,255,255,0.3);
        }
        #bingBtnToggle.running { color: #ffeb3b; }
        #bingLogPanel {
            position: fixed;
            left: 20px;
            bottom: 20px;
            z-index: 9999;
            background: rgba(0,0,0,0.75);
            color: #fff;
            font-size: 13px;
            font-family: monospace;
            border-radius: 10px;
            box-shadow: 0 0 12px rgba(0,0,0,0.5);
            min-width: 280px;
            max-width: 90vw;
        }
        #bingLogHeader {
            padding: 8px 12px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 10px 10px 0 0;
            background: rgba(255,255,255,0.1);
            font-weight: bold;
            user-select: none;
        }
        #bingLogToggle {
            cursor: pointer;
            padding: 0 6px;
        }
        #bingLogContent {
            padding: 8px 12px;
            max-height: 300px;
            overflow-y: auto;
            display: block;
            border-radius: 0 0 10px 10px;
        }
        .bingLogEntry {
            padding: 2px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            word-break: break-all;
            line-height: 1.4;
        }
        .bingLogEntry:last-child {
            border-bottom: none;
        }
        .bingLogEntry.error {
            color: #ff6b6b;
        }
        .bingLogTime {
            color: rgba(255,255,255,0.4);
            margin-right: 6px;
        }
        #bingLogClear {
            cursor: pointer;
            margin-left: 8px;
            color: rgba(255,255,255,0.5);
            font-size: 14px;
        }
        #bingLogClear:hover {
            color: #ff6b6b;
        }
    `);

    function updateProgress() {
        const currentSearchCount = GM_getValue('Cnt', 0);
        const progressText = document.getElementById('bingProgressText');
        if (!progressText) return;
        progressText.textContent = `[${currentSearchCount} / ${max_rewards}]`;
        const colors = {
            idle: '#fff',
            running: '#4caf50',
            paused: '#ffeb3b',
            error: '#f44336'
        };
        progressText.style.color = colors[scriptState] || '#fff';
    }

    function updateCountdown() {
        const el = document.getElementById('bingCountdown');
        if (!el) return;
        if (!countdownTarget || scriptState !== 'running') {
            el.textContent = '';
            el.className = 'bingCountdown';
            return;
        }
        const remaining = Math.max(0, countdownTarget - Date.now());
        if (remaining <= 0) {
            el.textContent = '...';
            el.className = 'bingCountdown info';
            return;
        }
        const sec = Math.ceil(remaining / 1000);
        if (sec > 60) {
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            el.textContent = m + 'm' + s + 's';
        } else {
            el.textContent = sec + 's';
        }
        el.className = 'bingCountdown ' + (sec > 60 ? 'info' : 'warning');
    }

    setInterval(function() {
        updateProgress();
        updateButtonLabels();
        updateCountdown();
    }, 1000);
    window.updateBingSearchProgress = updateProgress;

    // 按钮事件
    document.getElementById('bingBtnToggle').addEventListener('click', function() {
        if (scriptState === 'running') doPause();
        else doStart();
    });

    document.getElementById('bingBtnStop').addEventListener('click', function() {
        doStop();
    });

    function restoreLogs() {
        var content = document.getElementById('bingLogContent');
        var title = document.getElementById('bingLogTitle');
        if (!content) return;
        var entries = GM_getValue('logEntries', []);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var entry = document.createElement('div');
            entry.className = 'bingLogEntry' + (e.isError ? ' error' : '');
            entry.innerHTML = '<span class="bingLogTime">[' + e.time + ']</span> ' + e.text;
            content.appendChild(entry);
        }
        if (title) title.textContent = '日志 (' + content.children.length + ')';
    }
    restoreLogs();

    document.getElementById('bingLogToggle').addEventListener('click', function(e) {
        var content = document.getElementById('bingLogContent');
        var toggle = document.getElementById('bingLogToggle');
        var hidden = content.style.display === 'none';
        content.style.display = hidden ? 'block' : 'none';
        toggle.textContent = hidden ? '▼' : '▶';
    });

    document.getElementById('bingLogClear').addEventListener('click', function(e) {
        e.stopPropagation();
        var content = document.getElementById('bingLogContent');
        var title = document.getElementById('bingLogTitle');
        if (content) content.innerHTML = '';
        if (title) title.textContent = '日志 (0)';
        GM_setValue('logEntries', []);
    });

    (function initDrag() {
        var panel = document.getElementById('bingLogPanel');
        var header = document.getElementById('bingLogHeader');
        var startX, startY, origLeft, origTop;
        function onStart(e) {
            if (e.target && (e.target.id === 'bingLogToggle' || e.target.id === 'bingLogClear')) return;
            var touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            var rect = panel.getBoundingClientRect();
            origLeft = rect.left;
            origTop = rect.top;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.left = origLeft + 'px';
            panel.style.top = origTop + 'px';
            e.preventDefault();
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        }
        function onMove(e) {
            var touch = e.touches ? e.touches[0] : e;
            var dx = touch.clientX - startX;
            var dy = touch.clientY - startY;
            panel.style.left = (origLeft + dx) + 'px';
            panel.style.top = (origTop + dy) + 'px';
            if (e.cancelable) e.preventDefault();
        }
        function onEnd() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        }
        header.addEventListener('mousedown', onStart);
        header.addEventListener('touchstart', onStart, { passive: false });
    })();
})();

// ================== 控制 ==================
function setScriptState(state) {
    scriptState = state;
    if (window.updateBingSearchProgress) window.updateBingSearchProgress();
    updateButtonLabels();
}

function updateButtonLabels() {
    const toggleBtn = document.getElementById('bingBtnToggle');
    if (!toggleBtn) return;
    const running = scriptState === 'running';
    toggleBtn.textContent = running ? '⏸ 暂停' : '▶ 开始';
    toggleBtn.classList.toggle('running', running);
}

function doStart() {
    GM_setValue('stopped', false);
    if (GM_getValue('Cnt', 0) >= max_rewards) {
        log('今日搜索已完成，点击 停止 重置后可重新开始');
        setScriptState('idle');
        return;
    }
    setScriptState('running');
    log('▶ 已开始');
    exec();
}

function doPause() {
    runToken++;
    GM_setValue('stopped', true);
    setScriptState('paused');
    log('⏸ 已暂停');
}

function doStop() {
    runToken++;
    GM_setValue('stopped', true);
    GM_setValue('Cnt', 0);
    setScriptState('idle');
    log('⏹ 已停止并重置计数');
}

var maxLogEntries = 50;

function pad(n) {
    return n < 10 ? '0' + n : n;
}

function log(message) {
    console.log(message);
    var content = document.getElementById('bingLogContent');
    var title = document.getElementById('bingLogTitle');
    if (!content) return;
    var text = typeof message === 'string' ? message : String(message);
    var lastEntry = content.lastChild;
    if (lastEntry) {
        var lastText = lastEntry.textContent.replace(/^\[[\d:]+\]\s*/, '');
        if (lastText === text) return;
    }
    var entry = document.createElement('div');
    entry.className = 'bingLogEntry';
    var now = new Date();
    var time = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    entry.innerHTML = '<span class="bingLogTime">[' + time + ']</span> ' + text;
    content.appendChild(entry);
    content.scrollTop = content.scrollHeight;
    if (title) title.textContent = '日志 (' + content.children.length + ')';
    while (content.children.length > maxLogEntries) content.removeChild(content.firstChild);
    var entries = [];
    for (var i = 0; i < content.children.length; i++) {
        var child = content.children[i];
        entries.push({
            time: child.querySelector('.bingLogTime') ? child.querySelector('.bingLogTime').textContent.replace(/[\[\]]/g, '') : '',
            text: child.textContent.replace(/^\[[\d:]+\]\s*/, ''),
            isError: child.classList.contains('error')
        });
    }
    GM_setValue('logEntries', entries);
}

function onError() {
    var msg = '';
    for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (typeof arg === 'string') {
            msg += arg;
        } else if (arg instanceof Error) {
            msg += (arg.stack || arg.toString());
        } else if (arg && typeof arg === 'object' && arg.message) {
            msg += arg.message;
        } else {
            msg += String(arg);
        }
        if (i < arguments.length - 1) msg += ' ';
    }
    log(msg);
    var content = document.getElementById('bingLogContent');
    if (content && content.lastChild) content.lastChild.classList.add('error');
    console.error.apply(console, arguments);
    setScriptState('error');
}

// ================== 主执行 ==================
async function exec() {
    try {
        if (GM_getValue('stopped', false)) {
            log("检测到停止标志，脚本终止。");
            setScriptState('paused');
            return;
        }
        if (GM_getValue('Cnt') == null) GM_setValue('Cnt', 0);
        let currentSearchCount = GM_getValue('Cnt');

        if (currentSearchCount < max_rewards) {
            setScriptState('running');

            // 从缓存池取关键字（池空时自动补货），失败则不计数、直接报错
            let nowtxt;
            try {
                nowtxt = await getNextKeyword();
            } catch (err) {
                onError('获取搜索词失败:', err);
                setScriptState('error');
                return;
            }

            currentSearchCount++;
            GM_setValue('Cnt', currentSearchCount);

            let randomDelay = Math.floor(Math.random() * 20000) + 10000;
            let randomString = generateRandomString(4);
            let randomCvid = generateRandomString(32);
            const token = runToken; // 捕获当前令牌，暂停/停止后旧定时器失效

            // 计算倒计时目标时间
            const isPauseSearch = currentSearchCount % 5 === 0;
            const totalDelay = randomDelay + (isPauseSearch ? pause_time : 0);
            countdownTarget = Date.now() + totalDelay;

            let tt = document.getElementsByTagName("title")[0];
            tt.innerHTML = "[" + currentSearchCount + " / " + max_rewards + "] " + tt.innerHTML;
            smoothScrollToBottom();

            setTimeout(function () {
                if (runToken !== token) return;
                if (GM_getValue('stopped', false)) return;
                log(`keys[${currentSearchCount - 1}]: ${nowtxt}`);
                let searchUrl = currentSearchCount < max_rewards / 2
                    ? `https://www.bing.com/search?q=${encodeURI(nowtxt)}&form=${randomString}&cvid=${randomCvid}`
                    : `https://cn.bing.com/search?q=${encodeURI(nowtxt)}&form=${randomString}&cvid=${randomCvid}`;
                if (currentSearchCount % 5 === 0) {
                    log(`pause_time: ${pause_time}`);
                    setTimeout(function () {
                        if (runToken !== token) return;
                        if (!GM_getValue('stopped', false)) location.href = searchUrl;
                    }, pause_time);
                } else {
                    location.href = searchUrl;
                }
            }, randomDelay);
        } else {
            setScriptState('idle');
        }

        // 次日零点自动重置
        const now = new Date();
        const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
        setTimeout(function () {
            if (checkAndResetDaily()) {
                log('新的一天，重新开始');
                exec();
            }
        }, msUntilMidnight);
    } catch (err) {
        onError('执行出错:', err);
    }
}

function smoothScrollToBottom() {
    document.documentElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// ================== 初始化 ==================
(function init() {
    checkAndResetDaily();
    exec();
})();
