
    // ===== ⚖️ 全球法規網 (https://law.moj.gov.tw/Index.aspx) 超連結輔助涵式 =====
    function formatLegalLinks(str) {
      if (!str) return '';
      return str.replace(/(土地法|土地稅法|民法|不動產經紀業管理條例|契稅條例|房屋稅條例|平均地權條例|區域計畫法|都市計畫法|不動產估價技術規則)\s*(?:§|第)?\s*([0-9]+(?:-[0-9]+)?)\s*(條)?/g, (match) => {
        return `<a href="https://law.moj.gov.tw/Index.aspx" target="_blank" rel="noopener" style="color:var(--accent-sage); font-weight:700; text-decoration:underline;" title="點擊至全國法規資料庫檢視：${match}">${match} ↗</a>`;
      });
    }

    // ===== 🛡️ IndexedDB 本地資料庫與 Append-Only 追加式日誌 =====
    let db = null;
    let appendLogs = JSON.parse(localStorage.getItem('broker_append_only_log') || '[]');

    function initIndexedDB() {
      const request = indexedDB.open('BrokerAppDB', 1);
      request.onupgradeneeded = function(e) {
        db = e.target.result;
        if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('mistakes')) db.createObjectStore('mistakes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('exams')) db.createObjectStore('exams', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'key' });
      };
      request.onsuccess = function(e) {
        db = e.target.result;
        syncIndexedDBLogs();
      };
    }

    function appendStudyLog(actionType, detail, snapshotData) {
      const entry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toISOString(),
        user: currentUser,
        actionType: actionType,
        detail: detail,
        snapshot: snapshotData || null
      };

      appendLogs.unshift(entry);
      localStorage.setItem('broker_append_only_log', JSON.stringify(appendLogs.slice(0, 500)));

      if (db) {
        try {
          const tx = db.transaction(['logs'], 'readwrite');
          tx.objectStore('logs').put(entry);
        } catch (e) {}
      }
      renderTimelineLogs();
    }

    function syncIndexedDBLogs() {
      if (!db) return;
      try {
        const tx = db.transaction(['logs'], 'readonly');
        const store = tx.objectStore('logs');
        const req = store.getAll();
        req.onsuccess = function() {
          if (req.result && req.result.length > 0) {
            appendLogs = req.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            renderTimelineLogs();
          }
        };
      } catch (e) {}
    }

    function renderTimelineLogs() {
      const container = document.getElementById('timeline-log-container');
      const countElem = document.getElementById('append-log-count');
      if (countElem) countElem.innerText = `${appendLogs.length} 條追加式日誌`;
      if (!container) return;

      if (appendLogs.length === 0) {
        container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-sub);">尚未建立學習歷史日誌...</div>';
        return;
      }

      container.innerHTML = appendLogs.slice(0, 30).map(log => `
        <div class="timeline-item">
          <div class="timeline-date">${new Date(log.timestamp).toLocaleString('zh-TW')} [${log.user}]</div>
          <div class="timeline-desc">${log.detail}</div>
        </div>
      `).join('');
    }

    // ===== ✍️ Debounce 防手震自動存檔 =====
    let debounceTimer = null;
    function debounceSaveDraft(key, value) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const drafts = JSON.parse(localStorage.getItem('broker_user_drafts') || '{}');
        drafts[key] = value;
        localStorage.setItem('broker_user_drafts', JSON.stringify(drafts));
        appendStudyLog('NOTE_AUTOSAVE', `自動存檔草稿 [${key}] (${value.length} 字)`);
      }, 500);
    }

    // ===== 🔔 Capacitor 本地提醒與 Local Notifications =====
    let scheduledReminders = JSON.parse(localStorage.getItem('broker_scheduled_reminders') || '[]');
    let currentReminderTarget = { title: '', type: '', id: '' };

    function showReminderPickerModal(title, type, id) {
      currentReminderTarget = { title, type, id };
      document.getElementById('reminder-target-title').innerText = title;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      const isoStr = new Date(tomorrow.getTime() - (tomorrow.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      document.getElementById('reminder-datetime-input').value = isoStr;

      document.getElementById('reminder-picker-modal').classList.add('active');
    }

    function confirmScheduleReminder() {
      const dtVal = document.getElementById('reminder-datetime-input').value;
      if (!dtVal) {
        alert("請選擇提醒時間！");
        return;
      }
      const notifyTime = new Date(dtVal);
      if (notifyTime.getTime() <= Date.now()) {
        alert("提醒時間必須為未來時間！");
        return;
      }

      const reminderItem = {
        id: 'rem_' + Date.now(),
        title: currentReminderTarget.title,
        type: currentReminderTarget.type,
        itemId: currentReminderTarget.id,
        scheduledTime: notifyTime.toISOString(),
        formattedTime: notifyTime.toLocaleString('zh-TW')
      };

      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        const ln = window.Capacitor.Plugins.LocalNotifications;
        ln.requestPermissions().then(result => {
          ln.schedule({
            notifications: [{
              title: "國考勝率 App 複習提醒 🔔",
              body: `準備複習：${reminderItem.title}`,
              id: Math.floor(Math.random() * 100000),
              schedule: { at: notifyTime }
            }]
          });
        });
      } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }

      scheduledReminders.push(reminderItem);
      localStorage.setItem('broker_scheduled_reminders', JSON.stringify(scheduledReminders));
      updateReminderBadge();
      appendStudyLog('REMINDER_SET', `設定本地提醒：${reminderItem.title} 於 ${reminderItem.formattedTime}`);

      closeModal('reminder-picker-modal');
      alert(`✅ 成功排定本地定時提醒！\n時間：${reminderItem.formattedTime}\n項目：${reminderItem.title}`);
    }

    function cancelScheduledReminder(remId) {
      scheduledReminders = scheduledReminders.filter(r => r.id !== remId);
      localStorage.setItem('broker_scheduled_reminders', JSON.stringify(scheduledReminders));
      updateReminderBadge();
      renderScheduledRemindersList();
    }

    function showScheduledRemindersModal() {
      renderScheduledRemindersList();
      document.getElementById('reminder-manager-modal').classList.add('active');
    }

    function renderScheduledRemindersList() {
      const container = document.getElementById('scheduled-reminders-list');
      if (!container) return;

      if (scheduledReminders.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 1.5rem;">尚未排定任何本地提醒</div>';
        return;
      }

      container.innerHTML = scheduledReminders.map(r => `
        <div style="background: var(--bg-primary); padding: 0.8rem; border-radius: 12px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; font-size: 0.9rem;">${r.title}</div>
            <div style="font-size: 0.78rem; color: var(--text-sub);">⏰ ${r.formattedTime}</div>
          </div>
          <button class="filter-btn" style="background: #ffebee; color: #c62828; padding: 0.2rem 0.5rem;" onclick="cancelScheduledReminder('${r.id}')">✕ 取消</button>
        </div>
      `).join('');
    }

    function updateReminderBadge() {
      const countElem = document.getElementById('reminder-badge-count');
      if (countElem) countElem.innerText = scheduledReminders.length.toString();
    }

    function closeModal(modalId) {
      document.getElementById(modalId)?.classList.remove('active');
    }

    // ===== 全局系統與通用介面控制 =====
    let currentFlashcardIndex = 0;
    let filteredCards = typeof FLASHCARDS_DATA !== 'undefined' ? [...FLASHCARDS_DATA] : [];
    let mistakeBank = JSON.parse(localStorage.getItem('broker_mistake_bank') || '[]');
    let examHistory = JSON.parse(localStorage.getItem('broker_exam_history') || '[]');
    let isAudioOn = true;
    let currentUser = localStorage.getItem('broker_current_user') || 'Default Student';
    let checkInDays = parseInt(localStorage.getItem('broker_checkin_days') || '0');

    function updateCurrentUserUI() {
      document.getElementById('settings-user-name').innerText = currentUser;
    }

    function showAccountModal() {
      const name = prompt("👤 請輸入學員姓名或登入帳號名稱：", currentUser);
      if (name && name.trim().length > 0) {
        currentUser = name.trim();
        localStorage.setItem('broker_current_user', currentUser);
        updateCurrentUserUI();
        appendStudyLog('ACCOUNT_SWITCH', `切換學員帳號為：${currentUser}`);
        alert(`✅ 學員帳號已切換為：【${currentUser}】！`);
      }
    }

    function exportStudyDataJSON() {
      const backupData = {
        app: "不動產經紀人國考勝率戰略系統 App",
        version: "3.0-AppNative",
        exportTime: new Date().toISOString(),
        currentUser: currentUser,
        checkInDays: checkInDays,
        petData: petData,
        customTargets: customTargets,
        bestScores: bestScores,
        taskProgress: taskProgress,
        mistakeBank: mistakeBank,
        examHistory: examHistory,
        appendLogs: appendLogs,
        scheduledReminders: scheduledReminders
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `broker_study_backup_${currentUser}_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      appendStudyLog('EXPORT_JSON', '匯出完整 JSON 備份檔案');
      alert("📥 完整學習備份 JSON 檔案已成功下載！");
    }

    function exportHistoryCSV() {
      if (appendLogs.length === 0) {
        alert("尚無歷史日誌可匯出 CSV！");
        return;
      }
      let csvContent = "data:text/csv;charset=utf-8,\uFEFFTimestamp,User,ActionType,Detail\n";
      appendLogs.forEach(l => {
        csvContent += `"${l.timestamp}","${l.user}","${l.actionType}","${(l.detail || '').replace(/"/g, '""')}"\n`;
      });
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `broker_study_history_${currentUser}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function importStudyDataJSON(evt) {
      const file = evt.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = JSON.parse(e.target.result);
          if (data.currentUser) currentUser = data.currentUser;
          if (data.checkInDays !== undefined) checkInDays = data.checkInDays;
          if (data.petData) petData = data.petData;
          if (data.customTargets) customTargets = data.customTargets;
          if (data.bestScores) bestScores = data.bestScores;
          if (data.taskProgress) taskProgress = data.taskProgress;
          if (data.mistakeBank) mistakeBank = data.mistakeBank;
          if (data.examHistory) examHistory = data.examHistory;
          if (data.appendLogs) appendLogs = data.appendLogs;

          localStorage.setItem('broker_current_user', currentUser);
          localStorage.setItem('broker_checkin_days', checkInDays.toString());
          localStorage.setItem('broker_pet_data', JSON.stringify(petData));
          localStorage.setItem('broker_custom_targets', JSON.stringify(customTargets));
          localStorage.setItem('broker_best_scores', JSON.stringify(bestScores));
          localStorage.setItem('broker_today_tasks', JSON.stringify(taskProgress));
          localStorage.setItem('broker_mistake_bank', JSON.stringify(mistakeBank));
          localStorage.setItem('broker_exam_history', JSON.stringify(examHistory));

          updateCurrentUserUI();
          updatePetUI();
          initTasksUI();
          updateCheckInBtnUI();
          updateSubjectProgressBars();
          renderExamHistoryTable();
          renderQuestionsList();
          renderMistakeCardDisplay();
          updateDashboardStats();
          appendStudyLog('IMPORT_JSON', '匯入 JSON 備份數據');

          alert("🎉 學習紀錄 100% 成功復原！");
        } catch (err) {
          alert("❌ 匯入失敗：JSON 格式不符！");
        }
      };
      reader.readAsText(file);
    }

    function toggleDarkMode() {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      localStorage.setItem('broker_theme', isDark ? 'dark' : 'light');
      document.getElementById('theme-toggle-icon').innerText = isDark ? "☀️" : "🌙";
    }

    function initTheme() {
      if (localStorage.getItem('broker_theme') === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('theme-toggle-icon').innerText = "☀️";
      }
    }

    function switchTab(tabId, evt) {
      document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));

      const targetPane = document.getElementById(`tab-${tabId}`);
      if (targetPane) targetPane.classList.add('active');

      if (evt) evt.currentTarget.classList.add('active');
      else {
        document.querySelectorAll('.tab-item').forEach(b => {
          if (b.getAttribute('onclick')?.includes(`'${tabId}'`)) b.classList.add('active');
        });
      }

      if (tabId === 'questions') renderQuestionsList();
      else if (tabId === 'essay') renderEssayDeconstruction();
      else if (tabId === 'mockexam') {
        if (currentMockExamQuestions.length === 0) startRandomMockExam();
      } else if (tabId === 'settings') {
        renderExamHistoryTable();
      }
    }

    function initCountdown() {
      const examDate = new Date('2026-11-14T08:30:00+08:00').getTime();
      function updateTimer() {
        const diff = examDate - new Date().getTime();
        if (diff <= 0) return;
        document.getElementById('timer-days').innerText = String(Math.floor(diff / (1000 * 60 * 60 * 24))).padStart(2, '0');
        document.getElementById('timer-hours').innerText = String(Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0');
        document.getElementById('timer-mins').innerText = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
      }
      updateTimer();
      setInterval(updateTimer, 1000);
    }

    // ===== 🎯 每日打卡限制：一天僅能打卡一次 =====
    function doDailyCheckIn() {
      const todayStr = new Date().toISOString().slice(0, 10);
      const lastCheckIn = localStorage.getItem('broker_last_checkin_date');

      if (lastCheckIn === todayStr) {
        alert("⚠️ 今日已經完成打卡囉！明天記得再來繼續加油！");
        return;
      }

      localStorage.setItem('broker_last_checkin_date', todayStr);
      checkInDays++;
      localStorage.setItem('broker_checkin_days', checkInDays.toString());
      earnSaplings(1, "每日打卡");
      playSound('correct');
      appendStudyLog('CHECK_IN', `完成第 ${checkInDays} 天每日打卡 (${todayStr})`);
      updateCheckInBtnUI();
      alert(`🎯 今日打卡成功！打卡天數已記錄為第 ${checkInDays} 天！(+1🌱 樹苗)`);
    }

    function updateCheckInBtnUI() {
      const todayStr = new Date().toISOString().slice(0, 10);
      const lastCheckIn = localStorage.getItem('broker_last_checkin_date');
      const btn = document.getElementById('daily-checkin-btn');
      if (btn) {
        if (lastCheckIn === todayStr) {
          btn.innerText = `✅ 今日已打卡 (第 ${checkInDays} 天)`;
          btn.style.background = '#e8f5e9';
          btn.style.color = '#2e7d32';
        } else {
          btn.innerText = `🎯 每日打卡 (+1🌱)`;
          btn.style.background = 'var(--accent-sage)';
          btn.style.color = '#ffffff';
        }
      }
    }

    // ===== 🦖 考霸小怪獸 8 大等級進化梯次曲線（漸進難度） =====
    const PET_STAGES = [
      { level: 0, avatar: '🥚', name: '龍龍蛋', maxExp: 100 },
      { level: 1, avatar: '👾', name: '毛毛怪', maxExp: 200 },
      { level: 2, avatar: '🐣', name: '破殼怪', maxExp: 350 },
      { level: 3, avatar: '🍃', name: '芽芽怪', maxExp: 550 },
      { level: 4, avatar: '🦖', name: '估價霸王龍', maxExp: 800 },
      { level: 5, avatar: '🦕', name: '土地雷龍', maxExp: 1100 },
      { level: 6, avatar: '🐉', name: '經紀火龍', maxExp: 1500 },
      { level: 7, avatar: '👑', name: '神龍王', maxExp: 9999 }
    ];

    let petData = JSON.parse(localStorage.getItem('broker_pet_data') || JSON.stringify({ level: 0, exp: 0, saplings: 5 }));

    function updatePetUI() {
      const stage = PET_STAGES.find(s => s.level === petData.level) || PET_STAGES[0];
      document.getElementById('pet-avatar-icon').innerText = stage.avatar;
      document.getElementById('pet-name-badge').innerText = `Lv.${petData.level} ${stage.name}`;
      document.getElementById('sapling-count-display').innerText = `🌱 ${petData.saplings}`;
      localStorage.setItem('broker_pet_data', JSON.stringify(petData));
    }

    function earnSaplings(count, reason) {
      petData.saplings += count;
      updatePetUI();
    }

    function feedMonster() {
      if (petData.level >= 7) { alert("👑 小怪獸已進化至滿級最高型態！"); return; }
      if (petData.saplings <= 0) { alert("🌱 樹苗不足，請完成打卡或全真模考獲取樹苗！"); return; }

      const stage = PET_STAGES.find(s => s.level === petData.level) || PET_STAGES[0];
      petData.saplings--;
      petData.exp += 25;
      playSound('correct');

      if (petData.exp >= stage.maxExp) {
        petData.exp -= stage.maxExp;
        petData.level++;
        appendStudyLog('PET_LEVEL_UP', `小怪獸升級至 Lv.${petData.level}`);
        alert(`🎉 升級大成功！小怪獸進化為 Lv.${petData.level} (${stage.name})！`);
      }
      updatePetUI();
    }

    function showPetRulesModal() {
      alert(`🦖【考霸小怪獸 8 大等級漸進經驗值曲線】\nLv.0 龍龍蛋 (100) ➜ Lv.1 毛毛怪 (200) ➜ Lv.2 破殼怪 (350) ➜ Lv.3 芽芽怪 (550) ➜ Lv.4 估價霸王龍 (800) ➜ Lv.5 土地雷龍 (1100) ➜ Lv.6 經紀火龍 (1500) ➜ Lv.7 神龍王 (MAX)`);
    }

    // ===== 📚 題庫資料安全存取 =====
    function getQuestionsDataSafe() {
      try {
        if (typeof QUESTIONS_DATA !== 'undefined' && Array.isArray(QUESTIONS_DATA)) return QUESTIONS_DATA;
      } catch (e) {}
      if (Array.isArray(window.QUESTIONS_DATA)) return window.QUESTIONS_DATA;
      return [];
    }

    function getQuestionStats() {
      const data = getQuestionsDataSafe();
      return {
        total: data.length,
        mc: data.filter(q => q.type === 'mc').length,
        essay: data.filter(q => q.type === 'essay').length
      };
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function retryLoadQuestionsData() {
      const paths = ['./data/questions.js', 'data/questions.js'];
      let tried = 0;
      paths.forEach(p => {
        const s = document.createElement('script');
        s.src = p + '?t=' + Date.now();
        s.onload = () => {
          tried++;
          if (getQuestionsDataSafe().length > 0) {
            renderQuestionsList(1);
            renderEssayDeconstruction(1);
          }
        };
        s.onerror = () => { tried++; };
        document.head.appendChild(s);
      });
    }

    let questionsCurrentPage = 1;
    const QUESTIONS_PAGE_SIZE = 30;

    function renderQuestionsList(page = 1) {
      const container = document.getElementById('questions-list-container');
      if (!container) return;

      const yearFilter = document.getElementById('q-filter-year')?.value || 'all';
      const subjectFilter = document.getElementById('q-filter-subject')?.value || 'all';
      const typeFilter = document.getElementById('q-filter-type')?.value || 'all';
      const keyword = (document.getElementById('q-filter-keyword')?.value || '').trim().toLowerCase();
      const allData = getQuestionsDataSafe();

      if (!allData.length) {
        container.innerHTML = `
          <div style="text-align:center; padding:2rem; background:var(--bg-card-sub); border-radius:16px; margin:1rem 0;">
            <div style="font-size:1.15rem; font-weight:700; color:var(--accent-terracotta); margin-bottom:.5rem;">⚠️ 題庫尚未載入</div>
            <p style="color:var(--text-sub); margin-bottom:1rem;">請確認 GitHub 儲存庫內有 <code>data/questions.js</code>，且檔案名稱與資料夾位置完全一致。</p>
            <button class="filter-btn" onclick="retryLoadQuestionsData()">🔄 重新載入題庫</button>
          </div>`;
        return;
      }

      let list = [...allData];
      if (yearFilter !== 'all') list = list.filter(q => String(q.year) === yearFilter);
      if (subjectFilter !== 'all') list = list.filter(q => q.subject === subjectFilter);
      if (typeFilter !== 'all') list = list.filter(q => q.type === typeFilter);
      if (keyword) list = list.filter(q => {
        const haystack = [q.question, q.title, q.explanation, q.deconstruction?.applicableLaws, q.deconstruction?.sampleAnswer]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(keyword);
      });

      if (!list.length) {
        container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-sub);">查無符合條件的歷屆考古題</div>';
        return;
      }

      const totalPages = Math.max(1, Math.ceil(list.length / QUESTIONS_PAGE_SIZE));
      questionsCurrentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
      const start = (questionsCurrentPage - 1) * QUESTIONS_PAGE_SIZE;
      const pageItems = list.slice(start, start + QUESTIONS_PAGE_SIZE);
      const stats = getQuestionStats();

      const cards = pageItems.map(q => {
        const answerText = q.type === 'mc' ? `<div style="font-weight:700;color:var(--accent-terracotta);">正解：(${escapeHtml(q.answer)})</div>` : '';
        const explanation = q.explanation || q.deconstruction?.sampleAnswer || '';
        const laws = q.deconstruction?.applicableLaws || '';
        const keywords = q.deconstruction?.mustKeywords || [];
        return `
          <div class="question-item">
            <div class="q-header">
              <span class="badge">${escapeHtml(q.year)} 年 / ${escapeHtml(q.subject)} ${q.type === 'essay' ? '申論' : '選擇'}第 ${escapeHtml(q.number)} 題</span>
              <div style="display:flex;gap:.4rem;flex-wrap:wrap;">
                <button class="filter-btn" style="padding:.2rem .5rem;font-size:.75rem;" onclick="addToMistakeBank('${escapeHtml(q.id)}')">📌 納入錯題庫</button>
                <button class="filter-btn" style="padding:.2rem .5rem;font-size:.75rem;" onclick="showReminderPickerModal('${escapeHtml((q.title || q.question || '').slice(0,15))}','QUESTION','${escapeHtml(q.id)}')">🔔 提醒</button>
              </div>
            </div>
            ${q.title ? `<div style="font-weight:700;color:var(--accent-purple);margin:.4rem 0;">${escapeHtml(q.title)}</div>` : ''}
            <div class="q-title" style="white-space:pre-wrap;">${escapeHtml(q.question || '')}</div>
            ${q.options ? `<div class="options-grid">${q.options.map(opt => `<div style="padding:.6rem .8rem;background:var(--bg-primary);border-radius:8px;font-size:.9rem;">${escapeHtml(opt)}</div>`).join('')}</div>` : ''}
            <button class="filter-btn" style="margin-top:.6rem;" onclick="toggleQuestionAnswer('q-ans-${escapeHtml(q.id)}')">💡 顯示/隱藏正解與解析</button>
            <div id="q-ans-${escapeHtml(q.id)}" class="explanation-box" style="display:none;margin-top:.6rem;">
              ${answerText}
              ${laws ? `<div style="margin:.4rem 0;"><strong>⚖️ 適用法條：</strong>${formatLegalLinks(escapeHtml(laws))}</div>` : ''}
              ${keywords.length ? `<div style="margin:.4rem 0;"><strong>🔑 關鍵詞：</strong>${keywords.map(k => escapeHtml(k)).join('、')}</div>` : ''}
              <div style="white-space:pre-wrap;">${formatLegalLinks(escapeHtml(explanation))}</div>
            </div>
          </div>`;
      }).join('');

      const pager = renderPager('questions', questionsCurrentPage, totalPages, list.length, start + 1, Math.min(start + QUESTIONS_PAGE_SIZE, list.length));
      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:.6rem;align-items:center;flex-wrap:wrap;margin-bottom:.8rem;">
          <div style="font-weight:700;">目前篩選：${list.length} 題</div>
          <div style="font-size:.82rem;color:var(--text-sub);">完整題庫 ${stats.total} 題（選擇 ${stats.mc}／申論 ${stats.essay}）</div>
        </div>
        ${cards}
        ${pager}`;
    }

    function renderPager(kind, page, totalPages, totalItems, from, to) {
      if (totalPages <= 1) return `<div style="text-align:center;color:var(--text-sub);font-size:.82rem;margin:1rem 0;">顯示 ${from}～${to} / ${totalItems} 題</div>`;
      const fn = kind === 'questions' ? 'renderQuestionsList' : 'renderEssayDeconstruction';
      const buttons = [];
      const start = Math.max(1, page - 2);
      const end = Math.min(totalPages, start + 4);
      buttons.push(`<button class="filter-btn" ${page === 1 ? 'disabled' : ''} onclick="${fn}(${page - 1})">‹ 上一頁</button>`);
      for (let i = start; i <= end; i++) buttons.push(`<button class="filter-btn" style="font-weight:${i === page ? '800' : '500'};" onclick="${fn}(${i})">${i}</button>`);
      buttons.push(`<button class="filter-btn" ${page === totalPages ? 'disabled' : ''} onclick="${fn}(${page + 1})">下一頁 ›</button>`);
      return `<div style="display:flex;justify-content:center;align-items:center;gap:.35rem;flex-wrap:wrap;margin:1rem 0;">${buttons.join('')}<span style="font-size:.8rem;color:var(--text-sub);margin-left:.4rem;">${from}～${to} / ${totalItems} 題</span></div>`;
    }

    function toggleQuestionAnswer(ansId) {
      const elem = document.getElementById(ansId);
      if (elem) elem.style.display = elem.style.display === 'none' ? 'block' : 'none';
    }

    function addToMistakeBank(qId) {
      const q = getQuestionsDataSafe().find(q => q.id === qId);
      if (q && !mistakeBank.some(m => m.id === qId)) {
        mistakeBank.push(q);
        localStorage.setItem('broker_mistake_bank', JSON.stringify(mistakeBank));
        updateDashboardStats();
        playSound('correct');
        alert(`✅ 成功將 ${q.year} 年 ${q.subject} 試題加入錯題庫！`);
      } else {
        alert("這題已經在您的錯題庫中了！");
      }
    }

    let customTargets = JSON.parse(localStorage.getItem('broker_custom_targets') || JSON.stringify({ eval: 70, land: 60, civil: 60, broker: 70, chinese: 60 }));
    let bestScores = JSON.parse(localStorage.getItem('broker_best_scores') || JSON.stringify({ eval: 0, land: 0, civil: 0, broker: 0, chinese: 0 }));

    // ===== 📈 5 大科目最高成績進度條更新涵式 =====
    function updateSubjectProgressBars() {
      const targetEval = parseFloat(document.getElementById('calc-eval')?.value) || 70;
      const targetLand = parseFloat(document.getElementById('calc-land')?.value) || 60;
      const targetCivil = parseFloat(document.getElementById('calc-civil')?.value) || 60;
      const targetBroker = parseFloat(document.getElementById('calc-broker')?.value) || 70;
      const targetChinese = parseFloat(document.getElementById('calc-chinese')?.value) || 60;

      customTargets = { eval: targetEval, land: targetLand, civil: targetCivil, broker: targetBroker, chinese: targetChinese };
      localStorage.setItem('broker_custom_targets', JSON.stringify(customTargets));

      const pctEval = Math.min(100, Math.round((bestScores.eval / targetEval) * 100));
      const pctLand = Math.min(100, Math.round((bestScores.land / targetLand) * 100));
      const pctCivil = Math.min(100, Math.round((bestScores.civil / targetCivil) * 100));
      const pctBroker = Math.min(100, Math.round((bestScores.broker / targetBroker) * 100));
      const pctChinese = Math.min(100, Math.round((bestScores.chinese / targetChinese) * 100));

      document.getElementById('pb-eval-text').innerText = `最高分: ${bestScores.eval}分 / 目標: ${targetEval}分 (${pctEval}%)`;
      document.getElementById('pb-eval-bar').style.width = `${pctEval}%`;

      document.getElementById('pb-land-text').innerText = `最高分: ${bestScores.land}分 / 目標: ${targetLand}分 (${pctLand}%)`;
      document.getElementById('pb-land-bar').style.width = `${pctLand}%`;

      document.getElementById('pb-civil-text').innerText = `最高分: ${bestScores.civil}分 / 目標: ${targetCivil}分 (${pctCivil}%)`;
      document.getElementById('pb-civil-bar').style.width = `${pctCivil}%`;

      document.getElementById('pb-broker-text').innerText = `最高分: ${bestScores.broker}分 / 目標: ${targetBroker}分 (${pctBroker}%)`;
      document.getElementById('pb-broker-bar').style.width = `${pctBroker}%`;

      document.getElementById('pb-chinese-text').innerText = `最高分: ${bestScores.chinese}分 / 目標: ${targetChinese}分 (${pctChinese}%)`;
      document.getElementById('pb-chinese-bar').style.width = `${pctChinese}%`;
    }

    function renderCrash35Grid() {
      const container = document.getElementById('day-grid-container');
      const dataSrc = typeof CRASH_35_DATA !== 'undefined' ? CRASH_35_DATA : [];
      container.innerHTML = dataSrc.map(d => `
        <div class="day-card ${d.day === 1 ? 'active' : ''}" id="day-btn-${d.day}" onclick="selectCrashDay(${d.day})">
          <div class="day-num">Day ${d.day}</div>
          <div class="day-topic">${d.subject}</div>
        </div>
      `).join('');
    }

    function selectCrashDay(dayNum) {
      document.querySelectorAll('.day-card').forEach(c => c.classList.remove('active'));
      document.getElementById(`day-btn-${dayNum}`)?.classList.add('active');

      const data = (typeof CRASH_35_DATA !== 'undefined' ? CRASH_35_DATA : []).find(d => d.day === dayNum);
      if (!data) return;

      document.getElementById('day-title').innerText = data.title;
      document.getElementById('day-desc').innerText = data.desc;
      document.getElementById('day-example').innerText = data.example;
      document.getElementById('day-article').innerHTML = formatLegalLinks(data.article);
    }

    let selectedSubject = 'all';

    function initChapterDropdown() {
      const selectElem = document.getElementById('fc-filter-chapter');
      if (!selectElem) return;
      let cards = typeof FLASHCARDS_DATA !== 'undefined' ? FLASHCARDS_DATA : [];
      if (selectedSubject !== 'all') cards = cards.filter(c => c.subject === selectedSubject);
      const chapters = Array.from(new Set(cards.map(c => c.chapter).filter(Boolean)));
      selectElem.innerHTML = `<option value="all">所有章節 (${chapters.length})</option>` + chapters.map(ch => `<option value="${ch}">${ch}</option>`).join('');
    }

    function filterCards(subject, evt) {
      selectedSubject = subject;
      document.querySelectorAll('.card-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
      if (evt) evt.currentTarget.classList.add('active');
      initChapterDropdown();
      filterCardsByChapter();
    }

    function filterCardsByChapter() {
      const chapterVal = document.getElementById('fc-filter-chapter')?.value || 'all';
      let cards = typeof FLASHCARDS_DATA !== 'undefined' ? [...FLASHCARDS_DATA] : [];
      if (selectedSubject !== 'all') cards = cards.filter(c => c.subject === selectedSubject);
      if (chapterVal !== 'all') cards = cards.filter(c => c.chapter === chapterVal);
      filteredCards = cards;
      currentFlashcardIndex = 0;
      displayCurrentCard();
    }

    function displayCurrentCard() {
      const card = filteredCards[currentFlashcardIndex];
      document.getElementById('active-flashcard')?.classList.remove('flipped');
      if (!card) return;

      document.getElementById('fc-badge').innerText = `${card.subject} / ${card.chapter}`;
      document.getElementById('fc-back-badge').innerText = `${card.subject} / ${card.chapter}`;
      document.getElementById('fc-title').innerText = card.title;
      document.getElementById('fc-question').innerText = card.question;
      document.getElementById('fc-lecture').innerHTML = formatLegalLinks(card.lectureNote || card.concept);
      document.getElementById('fc-example').innerText = card.example;
      document.getElementById('fc-progress').innerText = `${currentFlashcardIndex + 1} / ${filteredCards.length}`;
    }

    function flipCard() { document.getElementById('active-flashcard')?.classList.toggle('flipped'); }
    function nextCard() { if (currentFlashcardIndex < filteredCards.length - 1) { currentFlashcardIndex++; displayCurrentCard(); } }
    function prevCard() { if (currentFlashcardIndex > 0) { currentFlashcardIndex--; displayCurrentCard(); } }

    function rateCard(rating) {
      const card = filteredCards[currentFlashcardIndex];
      if (card) {
        appendStudyLog('CARD_RATED', `評分卡片 [${card.title}] 熟練度：${rating}`);
        playSound('correct');
        nextCard();
      }
    }

    let essayCurrentPage = 1;
    const ESSAY_PAGE_SIZE = 15;

    function renderEssayDeconstruction(page = 1) {
      const container = document.getElementById('essay-deconstruct-container');
      if (!container) return;
      const searchKey = (document.getElementById('essay-search-input')?.value || '').trim().toLowerCase();
      const subjectFilter = document.getElementById('essay-filter-subject')?.value || 'all';

      let list = getQuestionsDataSafe().filter(q => q.type === 'essay');
      if (subjectFilter !== 'all') list = list.filter(q => q.subject === subjectFilter);
      if (searchKey) list = list.filter(q => [q.question, q.title, q.deconstruction?.sampleAnswer, q.deconstruction?.applicableLaws].filter(Boolean).join(' ').toLowerCase().includes(searchKey));

      if (!list.length) {
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-sub);">目前題庫沒有符合條件的申論題。</div>';
        return;
      }

      const totalPages = Math.max(1, Math.ceil(list.length / ESSAY_PAGE_SIZE));
      essayCurrentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
      const start = (essayCurrentPage - 1) * ESSAY_PAGE_SIZE;
      const pageItems = list.slice(start, start + ESSAY_PAGE_SIZE);
      const drafts = JSON.parse(localStorage.getItem('broker_user_drafts') || '{}');

      const cards = pageItems.map(q => {
        const dec = q.deconstruction || {};
        const draftVal = drafts[`user_essay_${q.id}`] || '';
        const structure = dec.structure ? Object.values(dec.structure).map(v => `<div style="margin:.25rem 0;">${escapeHtml(v)}</div>`).join('') : '';
        const mustKeywords = Array.isArray(dec.mustKeywords) ? dec.mustKeywords.map(k => escapeHtml(k)).join('、') : '';
        return `
          <div class="healing-card" style="margin-bottom:1.2rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.4rem;">
              <span class="badge">${escapeHtml(q.year)}年 / ${escapeHtml(q.subject)} 申論題第 ${escapeHtml(q.number)} 題</span>
              <button class="filter-btn" style="font-size:.75rem;padding:.2rem .5rem;" onclick="showReminderPickerModal('${escapeHtml((q.title || '').slice(0,20))}','ESSAY','${escapeHtml(q.id)}')">🔔 提醒</button>
            </div>
            <h4 style="margin:.6rem 0;font-size:1.05rem;color:var(--text-main);">${escapeHtml(q.title || '')}</h4>
            <p style="font-size:.92rem;color:var(--text-main);font-weight:600;white-space:pre-wrap;">${escapeHtml(q.question || '')}</p>
            <div class="essay-deconstruct-box">
              ${dec.applicableLaws ? `<div class="deconstruct-tag">⚖️ 適用法條：${formatLegalLinks(escapeHtml(dec.applicableLaws))}</div>` : ''}
              ${dec.intent ? `<div style="margin:.6rem 0;"><strong>🎯 考題意旨：</strong>${escapeHtml(dec.intent)}</div>` : ''}
              ${structure ? `<div style="margin:.6rem 0;"><strong>🧩 答題架構：</strong>${structure}</div>` : ''}
              ${mustKeywords ? `<div style="margin:.6rem 0;"><strong>🔑 必背關鍵詞：</strong>${mustKeywords}</div>` : ''}
              ${dec.everydayExample ? `<div style="margin:.6rem 0;"><strong>🏠 日常實例：</strong>${escapeHtml(dec.everydayExample)}</div>` : ''}
              <textarea class="essay-textarea" placeholder="輸入申論擬答（自動存檔）..." oninput="debounceSaveDraft('user_essay_${escapeHtml(q.id)}', this.value)">${escapeHtml(draftVal)}</textarea>
              <div style="background:var(--bg-card);padding:.85rem;border-radius:10px;font-size:.88rem;line-height:1.6;white-space:pre-wrap;border:1px solid var(--border-color);margin-top:.7rem;">
                <strong style="color:var(--accent-purple);">【高分範本解答】</strong>\n${formatLegalLinks(escapeHtml(dec.sampleAnswer || q.explanation || ''))}
              </div>
            </div>
          </div>`;
      }).join('');

      const pager = renderPager('essay', essayCurrentPage, totalPages, list.length, start + 1, Math.min(start + ESSAY_PAGE_SIZE, list.length));
      container.innerHTML = `<div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.8rem;"><strong>目前 ${list.length} 題</strong><span style="font-size:.82rem;color:var(--text-sub);">題庫實際收錄 ${getQuestionStats().essay} 題申論</span></div>${cards}${pager}`;
    }

    let currentMistakeIndex = 0;

    function renderMistakeCardDisplay() {
      const list = mistakeBank.length > 0 ? mistakeBank : [];
      const q = list[currentMistakeIndex];
      if (!q) {
        document.getElementById('mc-question').innerText = "錯題庫已全數清空！太棒了！";
        return;
      }
      document.getElementById('mc-badge').innerText = `錯題卡 #${currentMistakeIndex + 1}`;
      document.getElementById('mc-subject').innerText = `${q.year}年 / ${q.subject}`;
      document.getElementById('mc-question').innerText = q.question;
      document.getElementById('mc-explanation').innerHTML = formatLegalLinks(q.explanation || q.deconstruction?.sampleAnswer || '');
    }

    function flipMistakeCard() { document.getElementById('active-mistake-card')?.classList.toggle('flipped'); }
    function nextMistakeCard() { if (currentMistakeIndex < mistakeBank.length - 1) { currentMistakeIndex++; renderMistakeCardDisplay(); } }
    function prevMistakeCard() { if (currentMistakeIndex > 0) { currentMistakeIndex--; renderMistakeCardDisplay(); } }

    function removeCurrentMistakeCard() {
      const q = mistakeBank[currentMistakeIndex];
      if (q) {
        mistakeBank = mistakeBank.filter(m => m.id !== q.id);
        localStorage.setItem('broker_mistake_bank', JSON.stringify(mistakeBank));
        earnSaplings(1, "清空錯題卡");
        appendStudyLog('MISTAKE_CLEARED', `移出錯題卡 [${q.question.slice(0, 15)}]`);
        playSound('correct');
        renderMistakeCardDisplay();
        updateDashboardStats();
      }
    }

    // ===== 🎲 隨機全真模考 (無限測驗次數，每次隨機組考不重複) =====
    let currentMockExamQuestions = [];
    let mockUserAnswers = {};
    let mockUserEssayDrafts = {};
    let mockExamSubmitted = false;

    function startRandomMockExam() {
      const subjectFilter = document.getElementById('mock-subject-select').value;
      let poolMc = getQuestionsDataSafe().filter(q => q.type === 'mc');
      let poolEssay = getQuestionsDataSafe().filter(q => q.type === 'essay');

      if (subjectFilter !== 'all') {
        poolMc = poolMc.filter(q => q.subject === subjectFilter);
        poolEssay = poolEssay.filter(q => q.subject === subjectFilter);
      }

      const selectedEssay = [...poolEssay].sort(() => 0.5 - Math.random()).slice(0, 2);
      const selectedMc = [...poolMc].sort(() => 0.5 - Math.random()).slice(0, 25);

      currentMockExamQuestions = [...selectedEssay, ...selectedMc];

      mockUserAnswers = {};
      mockUserEssayDrafts = {};
      mockExamSubmitted = false;

      document.getElementById('mock-result-container').style.display = 'none';
      document.getElementById('mock-submit-bar').style.display = 'block';
      document.getElementById('mock-answered-count').innerText = `已回答 0 / ${currentMockExamQuestions.length} 題`;

      renderMockExamQuestions();
    }

    function renderMockExamQuestions() {
      const container = document.getElementById('mock-exam-questions-container');
      if (currentMockExamQuestions.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-sub); padding: 2rem;">查無對應模擬試題</div>';
        return;
      }

      let essayIndex = 0;
      let mcIndex = 0;

      container.innerHTML = currentMockExamQuestions.map((q, idx) => {
        if (q.type === 'essay') {
          essayIndex++;
          const userDraft = mockUserEssayDrafts[q.id] || '';
          return `
            <div class="question-item" id="mock-q-box-${q.id}" style="border-left: 4px solid var(--accent-purple);">
              <div class="q-header">
                <span class="badge" style="background: #f0ecf7; color: var(--accent-purple);">✍️ 申論題第 ${essayIndex} 題（25 分）</span>
                <span style="font-weight: 600; color: var(--text-sub); font-size: 0.82rem;">📌 來自：${q.year} 年 ${q.subject} 申論考古題</span>
              </div>
              <div class="q-title">${q.title}</div>
              <div style="margin-top: 0.4rem; font-size: 0.95rem; color: var(--text-main); font-weight: 600;">${q.question}</div>

              <textarea class="essay-textarea" id="mock-user-essay-${q.id}" placeholder="請在此輸入您的申論試卷擬答..." ${mockExamSubmitted ? 'disabled' : ''} oninput="updateMockEssayDraft('${q.id}', this.value)">${userDraft}</textarea>

              <div id="mock-exp-${q.id}" class="explanation-box" style="display: ${mockExamSubmitted ? 'block' : 'none'}; border-color: var(--accent-purple);">
                <div style="font-weight: 700; color: var(--accent-purple); margin-bottom: 0.4rem;">✍️ 官方高分解答與適用法條（來自 ${q.year} 年考題）</div>
                <div style="color: #2b6cb0; font-weight: 700; margin-bottom: 0.4rem;">${formatLegalLinks(q.deconstruction?.applicableLaws || '')}</div>
                <div style="white-space: pre-wrap;">${formatLegalLinks(q.deconstruction?.sampleAnswer || '')}</div>
              </div>
            </div>
          `;
        } else {
          mcIndex++;
          const userSel = mockUserAnswers[q.id];
          return `
            <div class="question-item" id="mock-q-box-${q.id}">
              <div class="q-header">
                <span class="badge">📝 選擇題第 ${mcIndex} 題（2 分）</span>
                <span style="font-weight: 600; color: var(--text-sub); font-size: 0.82rem;">📌 來自：${q.year} 年 ${q.subject} 選擇題第 ${q.number} 題</span>
              </div>
              <div class="q-title">${q.question}</div>

              <div class="options-grid">
                ${q.options.map((opt, optIdx) => {
                  const optCode = String.fromCharCode(65 + optIdx);
                  const isSelected = userSel === optCode;
                  let btnStyle = "";
                  if (mockExamSubmitted) {
                    if (optCode === q.answer) btnStyle = "background: #e8f5e9 !important; border-color: #81c784 !important; color: #2e7d32 !important; font-weight: 700;";
                    else if (isSelected && optCode !== q.answer) btnStyle = "background: #ffebee !important; border-color: #e57373 !important; color: #c62828 !important;";
                  } else if (isSelected) {
                    btnStyle = "background: var(--accent-sage-light); border-color: var(--accent-sage); font-weight: 700;";
                  }
                  return `
                    <button class="option-btn" style="${btnStyle}" ${mockExamSubmitted ? 'disabled' : ''} onclick="selectMockAnswer('${q.id}', '${optCode}')">
                      ${opt}
                    </button>
                  `;
                }).join('')}
              </div>

              <div id="mock-exp-${q.id}" class="explanation-box" style="display: ${mockExamSubmitted ? 'block' : 'none'};">
                <div style="font-weight: 700; color: var(--accent-terracotta); margin-bottom: 0.4rem;">正解：(${q.answer}) ${userSel === q.answer ? '✅ 回答正確' : '❌ 回答錯誤'}（來自 ${q.year} 年考題）</div>
                <div>${formatLegalLinks(q.explanation)}</div>
              </div>
            </div>
          `;
        }
      }).join('');
    }

    function selectMockAnswer(qId, optCode) {
      if (mockExamSubmitted) return;
      mockUserAnswers[qId] = optCode;
      updateMockAnsweredCount();
      renderMockExamQuestions();
    }

    function updateMockEssayDraft(qId, val) {
      mockUserEssayDrafts[qId] = val;
      updateMockAnsweredCount();
    }

    function updateMockAnsweredCount() {
      const mcAnswered = Object.keys(mockUserAnswers).length;
      const essayAnswered = Object.values(mockUserEssayDrafts).filter(v => v.trim().length > 0).length;
      const totalAnswered = mcAnswered + essayAnswered;
      document.getElementById('mock-answered-count').innerText = `已回答 ${totalAnswered} / ${currentMockExamQuestions.length} 題`;
    }

    function submitMockExam() {
      if (currentMockExamQuestions.length === 0) return;
      mockExamSubmitted = true;

      let correctCount = 0;
      let mcTotal = 0;
      let mistakesAdded = 0;

      currentMockExamQuestions.forEach(q => {
        if (q.type === 'mc') {
          mcTotal++;
          const userSel = mockUserAnswers[q.id];
          if (userSel === q.answer) {
            correctCount++;
          } else {
            if (!mistakeBank.some(m => m.id === q.id)) {
              mistakeBank.push(q);
              mistakesAdded++;
            }
          }
        } else {
          if (!mistakeBank.some(m => m.id === q.id)) {
            mistakeBank.push(q);
            mistakesAdded++;
          }
        }
      });

      localStorage.setItem('broker_mistake_bank', JSON.stringify(mistakeBank));

      const mcScore = correctCount * 2;
      const wrongCount = mcTotal - correctCount;
      const totalScore = mcScore + 40; // 預估總分 (滿分100)

      const subjectName = document.getElementById('mock-subject-select').value;
      const keyMap = { '估價': 'eval', '土地': 'land', '民法': 'civil', '經紀': 'broker', '國文': 'chinese' };
      const subKey = keyMap[subjectName] || 'eval';

      if (totalScore > (bestScores[subKey] || 0)) {
        bestScores[subKey] = totalScore;
        localStorage.setItem('broker_best_scores', JSON.stringify(bestScores));
        updateSubjectProgressBars();
      }

      // 紀錄測驗成績至歷史表
      const examRecord = {
        id: 'exam_' + Date.now(),
        timestamp: new Date().toLocaleString('zh-TW'),
        subject: subjectName,
        mcScore: mcScore,
        totalScore: totalScore,
        passed: totalScore >= 60
      };
      examHistory.unshift(examRecord);
      localStorage.setItem('broker_exam_history', JSON.stringify(examHistory));

      earnSaplings(3, "完成全真模擬考");
      renderMockExamQuestions();

      const resContainer = document.getElementById('mock-result-container');
      const scoreElem = document.getElementById('mock-result-score');
      const msgElem = document.getElementById('mock-result-msg');

      resContainer.style.display = 'block';
      scoreElem.innerText = `🎯 模擬試卷交卷報告（單科滿分 100 分）`;

      msgElem.innerHTML = `
        <div style="background: var(--bg-card); padding: 1rem; border-radius: 12px; border: 1px solid var(--border-color);">
          <div style="color: var(--accent-sage); font-size: 1.1rem; font-weight: 700;">• 📝 選擇題得分：${mcScore} 分 / 50 分（答對 ${correctCount} 題，錯題數：${wrongCount} 題，每題 2 分）</div>
          <div style="color: var(--accent-purple); font-size: 1rem; font-weight: 700; margin-top: 0.4rem;">• ✍️ 申論題對照：2 題申論題（每題 25 分，共 50 分）已公布官方高分範本解答與權威法條</div>
          <div style="color: ${totalScore >= 60 ? '#2e7d32' : '#c62828'}; font-weight: 700; margin-top: 0.6rem; font-size: 1.05rem;">
            預估加權總分：${totalScore} 分 ➜ ${totalScore >= 60 ? '🟢 恭喜已超越紅線及格標準！' : '🔴 未達 60 分紅線，請繼續加強！'}
          </div>
        </div>
      `;

      if (totalScore >= 60) playSound('correct');
      else playSound('wrong');

      appendStudyLog('MOCK_EXAM_SUBMIT', `提交全真試卷 [${subjectName}]：選擇題得分 ${mcScore}/50分，總得分 ${totalScore}/100分`);
      renderMistakeCardDisplay();
      updateDashboardStats();
      renderExamHistoryTable();
    }

    // ===== 📊 歷次測驗成績紀錄表 (≥60分呈現綠色 🟢 / 未達呈紅色 🔴) =====
    function renderExamHistoryTable() {
      const tbody = document.getElementById('exam-history-tbody');
      const countElem = document.getElementById('exam-history-count');
      if (countElem) countElem.innerText = `${examHistory.length} 筆測驗紀錄`;
      if (!tbody) return;

      if (examHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-sub); padding:1rem;">尚未進行模擬測驗...</td></tr>';
        return;
      }

      tbody.innerHTML = examHistory.map(rec => {
        const isPass = rec.totalScore >= 60;
        const colorStyle = isPass ? 'color: #2e7d32; font-weight: 700;' : 'color: #c62828; font-weight: 700;';
        return `
          <tr>
            <td style="font-size:0.8rem; color:var(--text-sub);">${rec.timestamp}</td>
            <td style="font-weight:600;">${rec.subject}</td>
            <td>${rec.mcScore} 分 / 50 分</td>
            <td style="${colorStyle}">${rec.totalScore} 分</td>
            <td style="${colorStyle}">${isPass ? '🟢 及格' : '🔴 未達紅線'}</td>
          </tr>
        `;
      }).join('');
    }

    function calculateExamScore() {
      const e = parseFloat(document.getElementById('calc-eval').value) || 0;
      const l = parseFloat(document.getElementById('calc-land').value) || 0;
      const c = parseFloat(document.getElementById('calc-civil').value) || 0;
      const b = parseFloat(document.getElementById('calc-broker').value) || 0;
      const ch = parseFloat(document.getElementById('calc-chinese').value) || 0;

      const weighted = ((e + l + c + b) / 4 * 0.9) + (ch * 0.1);

      document.getElementById('calc-result-box').style.display = 'block';
      document.getElementById('calc-score-val').innerText = `國考加權總分：${weighted.toFixed(2)} 分`;

      const passElem = document.getElementById('calc-pass-status');
      if (weighted >= 60) {
        passElem.innerText = "🎉 恭喜跨越 60 分國考及格門檻！正式取得不動產經紀人執照！";
        passElem.style.color = "var(--accent-sage)";
        playSound('correct');
      } else {
        const diff = (60 - weighted).toFixed(2);
        passElem.innerText = `⚠️ 距離及格紅線還差 ${diff} 分，請針對弱項科目加強衝刺！`;
        passElem.style.color = "var(--accent-terracotta)";
        playSound('wrong');
      }
    }

    function updateDashboardStats() {
      document.getElementById('stat-mistake-q').innerText = `${mistakeBank.length} 題`;
    }

    function toggleAudio() {
      isAudioOn = !isAudioOn;
      document.getElementById('audio-toggle-icon').innerText = isAudioOn ? "🔊" : "🔇";
    }

    function playSound(type) {
      if (!isAudioOn) return;
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(type === 'correct' ? 523 : 220, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
      } catch (e) {}
    }

    // ===== 🎯 今日衝刺任務單日限完成一次 =====
    let taskProgress = JSON.parse(localStorage.getItem('broker_today_tasks') || JSON.stringify({ t1: false, t2: false, t3: false, t4: false }));
    let lastTaskDate = localStorage.getItem('broker_task_date') || '';

    function initTasksUI() {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (lastTaskDate !== todayStr) {
        taskProgress = { t1: false, t2: false, t3: false, t4: false };
        localStorage.setItem('broker_today_tasks', JSON.stringify(taskProgress));
        localStorage.setItem('broker_task_date', todayStr);
        lastTaskDate = todayStr;
      }

      let count = 0;
      for (let k in taskProgress) {
        const chk = document.getElementById(`task-chk-${k.replace('t', '')}`);
        if (chk) chk.checked = taskProgress[k];
        if (taskProgress[k]) count++;
      }
      document.getElementById('today-task-progress').innerText = `${count} / 4`;
    }

    function toggleTaskCheck(chkId) {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (lastTaskDate !== todayStr) {
        lastTaskDate = todayStr;
        localStorage.setItem('broker_task_date', todayStr);
      }

      const chk = document.getElementById(chkId);
      if (!chk) return;
      const key = 't' + chkId.replace('task-chk-', '');

      if (taskProgress[key] && chk.checked) {
        alert("⚠️ 今日該任務已經領取獎勵囉！明天再繼續加油！");
        return;
      }

      taskProgress[key] = chk.checked;
      localStorage.setItem('broker_today_tasks', JSON.stringify(taskProgress));

      if (chk.checked) {
        playSound('correct');
        appendStudyLog('TASK_DONE', `完成每日學習任務 [${key}]`);
        if (key === 't1') earnSaplings(1, "完成速成");
        else if (key === 't3') earnSaplings(3, "完成模考");
        else if (key === 't4') doDailyCheckIn();
      }
      initTasksUI();
    }

    function speakText(text) {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW';
      window.speechSynthesis.speak(u);
    }

    function speakCurrentFlashcard() {
      const card = filteredCards[currentFlashcardIndex];
      if (card) speakText(`${card.title}。${card.question}`);
    }

    function speakCurrentDayCourse() {
      const title = document.getElementById('day-title')?.innerText || '';
      const desc = document.getElementById('day-desc')?.innerText || '';
      speakText(`${title}。${desc}`);
    }

    document.addEventListener('DOMContentLoaded', () => {
      initIndexedDB();
      updateCurrentUserUI();
      initTheme();
      initCountdown();
      renderCrash35Grid();
      selectCrashDay(1);
      initChapterDropdown();
      displayCurrentCard();
      renderQuestionsList();
      renderEssayDeconstruction();
      renderMistakeCardDisplay();
      updatePetUI();
      initTasksUI();
      updateCheckInBtnUI();
      updateSubjectProgressBars();
      updateDashboardStats();
      updateReminderBadge();
      renderExamHistoryTable();
      startRandomMockExam();

      // 清除舊版 Service Worker，避免 GitHub Pages 繼續顯示舊快取版本。
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister())).catch(() => {});
      }
    });
  