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

var cached_words = GM_getValue('search_words_cache', null);
var cached_max = GM_getValue('max_rewards_cache', 0);
var max_rewards = cached_max || Math.floor(Math.random() * (33 - 28 + 1)) + 28; // 随机每次搜索总次数
var pause_time = Math.floor(Math.random() * (900000 - 360000 + 1)) + 360000; // 随机暂停时间（6到15分钟）
var search_words = cached_words || []; // 搜索词（跨页面持久化）
var Hot_words_apis = "https://keywords.luqion.cn/api/keywords?count=";
var scriptState = 'idle'; // 'idle' | 'running' | 'paused' | 'error'

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
        GM_setValue('search_words_cache', null); // 清空缓存，触发重新获取
        search_words = [];
        return true;
    }
    return false;
}

// ================== 获取热门搜索词 ==================
async function douyinhot_dic() {
    let url = Hot_words_apis + max_rewards;
    try {
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
            var words = data.data.map(item => item.title);
            GM_setValue('search_words_cache', words);
            GM_setValue('max_rewards_cache', max_rewards);
            log(words);
            return words;
        }
        onError('搜索词API返回数据为空');
        throw new Error('搜索词API返回数据为空');
    } catch (error) {
        onError('搜索词来源请求失败:', error);
        throw error;
    }
}

// ================== 菜单 ==================
GM_registerMenuCommand('开始', function () {
    GM_setValue('stopped', false);
    // ✅ 不再强制清零，保持计数器延续
    checkAndResetDaily();
    location.href = "https://www.bing.com/?br_msg=Please-Wait";
}, 'o');

GM_registerMenuCommand('停止', function () {
    GM_setValue('stopped', true);
    if (window.setScriptState) window.setScriptState('paused');
    log("已停止运行");
}, 'o');

GM_registerMenuCommand('重置', function () {
    GM_setValue('Cnt', 0);
}, 'o');

// ================== 工具函数 ==================
function AutoStrTrans(st) {
    let yStr = st, rStr = "", zStr = "", prePo = 0;
    for (let i = 0; i < yStr.length;) {
        let step = parseInt(Math.random() * 5) + 1;
        if (i > 0) {
            zStr = zStr + yStr.substr(prePo, i - prePo) + rStr;
            prePo = i;
        }
        i = i + step;
    }
    if (prePo < yStr.length) zStr = zStr + yStr.substr(prePo, yStr.length - prePo);
    return zStr;
}

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
    floatDiv.innerText = '[0 / ' + max_rewards + ']';
    document.body.appendChild(floatDiv);

    // 控制面板
    const controlPanel = document.createElement('div');
    controlPanel.id = 'bingControlPanel';
    controlPanel.innerHTML = `
        <div id="bingButtons">
            <button id="bingBtnPrev" title="上一个">◀</button>
            <button id="bingBtnPause" title="暂停">⏸</button>
            <button id="bingBtnStart" title="开始">▶</button>
            <button id="bingBtnNext" title="下一个">▶▶</button>
            <button id="bingBtnReset" title="重置">↺</button>
        </div>
        <div id="bingKeywords">
            <div id="bingKeywordPrev" class="bingKeyword"></div>
            <div id="bingKeywordCurr" class="bingKeyword bingKeywordCurrent"></div>
            <div id="bingKeywordNext" class="bingKeyword"></div>
        </div>
    `;
    document.body.appendChild(controlPanel);

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
            pointer-events: none;
        }
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
        #bingControlPanel {
            position: fixed;
            top: 128px;
            right: 20px;
            z-index: 9999;
            background: rgba(0,0,0,0.6);
            color: #fff;
            border-radius: 10px;
            padding: 10px 12px;
            box-shadow: 0 0 12px rgba(0,0,0,0.5);
            min-width: 180px;
        }
        #bingButtons {
            display: flex;
            gap: 4px;
            margin-bottom: 6px;
            justify-content: center;
        }
        #bingButtons button {
            width: 30px;
            height: 26px;
            font-size: 13px;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,0.25);
            background: rgba(255,255,255,0.1);
            color: #fff;
            border-radius: 4px;
            line-height: 1;
            padding: 0;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #bingButtons button:hover {
            background: rgba(255,255,255,0.3);
        }
        .bingKeyword {
            padding: 2px 0;
            font-size: 12px;
            word-break: break-all;
            line-height: 1.5;
        }
        #bingKeywordPrev { color: #999; }
        .bingKeywordCurrent { color: #fff; font-weight: bold; }
        #bingKeywordNext { color: #4caf50; }
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
        const floatDiv = document.getElementById('bingSearchProgress');
        if (!floatDiv) return;
        floatDiv.innerText = `[${currentSearchCount} / ${max_rewards}]`;
        const colors = {
            idle: '#fff',
            running: '#4caf50',
            paused: '#ffeb3b',
            error: '#f44336'
        };
        floatDiv.style.color = colors[scriptState] || '#fff';
    }

    function updateKeywordDisplay() {
        const cnt = GM_getValue('Cnt', 0);
        const prevEl = document.getElementById('bingKeywordPrev');
        const currEl = document.getElementById('bingKeywordCurr');
        const nextEl = document.getElementById('bingKeywordNext');
        if (prevEl) prevEl.textContent = cnt > 1 ? '上一条: ' + (search_words[cnt - 2] || '(无)') : '';
        if (currEl) currEl.textContent = cnt > 0 ? '当前: ' + (search_words[cnt - 1] || '(无)') : '';
        if (nextEl) nextEl.textContent = cnt < max_rewards ? '下一条: ' + (search_words[cnt] || '(无)') : '';
    }

    function setScriptState(state) {
        scriptState = state;
        updateProgress();
    }

    setInterval(function() {
        updateProgress();
        updateKeywordDisplay();
    }, 1000);
    window.updateBingSearchProgress = updateProgress;
    window.updateKeywordDisplay = updateKeywordDisplay;
    window.setScriptState = setScriptState;

    // 按钮事件
    document.getElementById('bingBtnPause').addEventListener('click', function() {
        GM_setValue('stopped', true);
        setScriptState('paused');
        log('⏸ 已暂停');
    });

    document.getElementById('bingBtnStart').addEventListener('click', function() {
        GM_setValue('stopped', false);
        setScriptState(GM_getValue('Cnt', 0) < max_rewards ? 'running' : 'idle');
        log('▶ 已开始');
        exec();
    });

    document.getElementById('bingBtnPrev').addEventListener('click', function() {
        const cnt = GM_getValue('Cnt', 0);
        if (cnt > 1) {
            GM_setValue('Cnt', cnt - 2);
            updateProgress();
            updateKeywordDisplay();
            log('◀ 回到上一条');
            location.href = 'https://www.bing.com/?br_msg=Please-Wait';
        }
    });

    document.getElementById('bingBtnNext').addEventListener('click', function() {
        const cnt = GM_getValue('Cnt', 0);
        if (cnt < max_rewards) {
            const nowtxt = search_words[cnt];
            log('▶▶ 跳到下一条: ' + nowtxt);
            const rs = generateRandomString(4);
            const rc = generateRandomString(32);
            const searchUrl = cnt < max_rewards / 2
                ? `https://www.bing.com/search?q=${encodeURI(nowtxt)}&form=${rs}&cvid=${rc}`
                : `https://cn.bing.com/search?q=${encodeURI(nowtxt)}&form=${rs}&cvid=${rc}`;
            location.href = searchUrl;
        }
    });

    document.getElementById('bingBtnReset').addEventListener('click', function() {
        GM_setValue('Cnt', 0);
        setScriptState('idle');
        updateKeywordDisplay();
        log('↺ 已重置');
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

// ================== 主执行 ==================
function exec() {
    if (GM_getValue('stopped', false)) {
        log("检测到停止标志，脚本终止。");
        setScriptState('paused');
        return;
    }

    if (GM_getValue('Cnt') == null) GM_setValue('Cnt', 0);
    let currentSearchCount = GM_getValue('Cnt');

    // 检测用户自行搜索：当前是搜索结果页但查询词不匹配
    if (currentSearchCount > 0 && search_words.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const queryParam = urlParams.get('q');
        if (queryParam) {
            const decodedQuery = decodeURIComponent(queryParam);
            const expectedKeyword = search_words[currentSearchCount - 1];
            if (decodedQuery !== expectedKeyword && decodedQuery !== AutoStrTrans(expectedKeyword)) {
                log('检测到用户自行搜索: "' + decodedQuery + '"，暂停脚本');
                GM_setValue('stopped', true);
                setScriptState('paused');
                return;
            }
        }
    }

    let randomDelay = Math.floor(Math.random() * 20000) + 10000;
    let randomString = generateRandomString(4);
    let randomCvid = generateRandomString(32);

    if (currentSearchCount < max_rewards) {
        setScriptState('running');
        // ✅ 修复计数器不同步：先递增
        currentSearchCount++;
        GM_setValue('Cnt', currentSearchCount);

        let tt = document.getElementsByTagName("title")[0];
        tt.innerHTML = "[" + currentSearchCount + " / " + max_rewards + "] " + tt.innerHTML;
        smoothScrollToBottom();

        setTimeout(function () {
            if (GM_getValue('stopped', false)) return;
            let nowtxt = search_words[currentSearchCount - 1];
            nowtxt = AutoStrTrans(nowtxt);
            log(`keys[${currentSearchCount - 1}]: ${nowtxt}`);
            let searchUrl = currentSearchCount < max_rewards / 2
                ? `https://www.bing.com/search?q=${encodeURI(nowtxt)}&form=${randomString}&cvid=${randomCvid}`
                : `https://cn.bing.com/search?q=${encodeURI(nowtxt)}&form=${randomString}&cvid=${randomCvid}`;
            if (currentSearchCount % 5 === 0) {
                log(`pause_time: ${pause_time}`);
                setTimeout(function () { if (!GM_getValue('stopped', false)) location.href = searchUrl; }, pause_time);
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
            douyinhot_dic().then(names => {
                search_words = names;
                exec();
            }).catch(onError);
        }
    }, msUntilMidnight);

    function smoothScrollToBottom() {
        document.documentElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
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
    if (window.setScriptState) window.setScriptState('error');
}

// ================== 初始化 ==================
(function init() {
    const needReset = checkAndResetDaily();
    if (search_words.length > 0 && !needReset) {
        // 已有缓存关键词且当天已初始化过，直接执行
        exec();
    } else {
        // 需要重新获取关键词
        douyinhot_dic().then(names => {
            search_words = names;
            exec();
        }).catch(onError);
    }
})();
