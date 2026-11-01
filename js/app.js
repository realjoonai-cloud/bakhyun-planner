/**
 * 백현중학교 1학년 3반 수행평가 플래너 & 예상 성적표 컨트롤러 v2 (app.js)
 * - 일반 학생: 공통 수행평가 조회, 데일리 점검 체크, 개인화 예상 성적표 점수 입력 및 등급 계산
 * - 서버 관리자(Admin): 수행평가 추가·수정·삭제, 교과별 평가계획(배점/영역) 수정, 시간표 동기화/편집 (SQLite DB 연동)
 * - 교사 성함 표시 전면 제거
 */
(function () {
  'use strict';

  const { Store, getTodayStr, addDaysStr, getWeekdayIndex } = window.SuhaengStore;
  const store = new Store();

  const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
  const CAL_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

  let activeCellModalContext = null;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3200);
  }

  function formatKoreanDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const wIdx = getWeekdayIndex(dateStr);
    return `${y}년 ${m}월 ${d}일 (${WEEKDAY_LABELS[wIdx]}요일)`;
  }

  function getNextDateForWeekday(baseDateStr, targetWeekdayIdx) {
    for (let i = 0; i <= 7; i++) {
      const cand = addDaysStr(baseDateStr, i);
      if (getWeekdayIndex(cand) === targetWeekdayIdx) {
        return cand;
      }
    }
    return baseDateStr;
  }

  // ==========================================================================
  // 1. 상단 헤더, 관리자 배너 & 오늘의 수업 브리핑 렌더링 (교사 성함 없음)
  // ==========================================================================
  function renderHeaderAndBriefing(state) {
    const { schoolInfo, assessments, ui } = state;
    const todayStr = getTodayStr();
    const isAdmin = !!ui.isAdmin;

    document.body.classList.toggle('dark-mode', !!ui.darkMode);
    const btnDark = document.getElementById('btnDarkMode');
    if (btnDark) {
      btnDark.textContent = ui.darkMode ? '☀️ 라이트모드' : '🌙 다크모드';
    }

    // 관리자 상태에 따른 UI 토글
    const adminBanner = document.getElementById('adminBanner');
    const btnAdminToggle = document.getElementById('btnAdminToggle');
    const btnAddAssessment = document.getElementById('btnAddAssessment');
    const btnAddOnSelectedDate = document.getElementById('btnAddOnSelectedDate');

    if (adminBanner) adminBanner.style.display = isAdmin ? 'flex' : 'none';
    if (btnAdminToggle) {
      btnAdminToggle.textContent = isAdmin ? '🛠️ 관리자 활성중' : '🔒 관리자 모드';
    }
    if (btnAddAssessment) {
      btnAddAssessment.style.display = isAdmin ? 'inline-flex' : 'none';
    }
    if (btnAddOnSelectedDate) {
      btnAddOnSelectedDate.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    const badge = document.getElementById('schoolBadge');
    if (badge) {
      badge.textContent = `🏫 성남 ${schoolInfo.schoolName} ${schoolInfo.grade}-${schoolInfo.classNum}반`;
    }
    const syncMeta = document.getElementById('syncMetaText');
    if (syncMeta) {
      syncMeta.innerHTML = `<span>🗄️ 서버 SQLite DB 연동 · 최근 시간표 동기화: ${escapeHtml(schoolInfo.lastSyncAt || '-')}</span>`;
    }

    const todayWIdx = getWeekdayIndex(todayStr);
    const briefingTargetDate = todayWIdx > 4 ? getNextDateForWeekday(todayStr, 0) : todayStr;
    const isWeekendPreview = todayWIdx > 4;

    const alerts = store.getDateTimetableAlerts(briefingTargetDate);
    const incompleteAll = assessments.filter((a) => a.status !== 'done');
    const urgentTasks = incompleteAll.filter((a) => {
      const d = store.getDDay(a.dueDate, todayStr);
      return d >= 0 && d <= 3;
    });
    const checkedTodayCount = incompleteAll.filter(
      (a) => Array.isArray(a.dailyChecks) && a.dailyChecks.includes(todayStr)
    ).length;

    const banner = document.getElementById('briefingBanner');
    if (!banner) return;

    const dayTitlePrefix = isWeekendPreview
      ? `💡 오늘(${formatKoreanDate(todayStr)})은 주말입니다! 다가오는 월요일(${briefingTargetDate.slice(5)}) 백현중 1-3반 시간표 브리핑:`
      : `🔔 오늘(${formatKoreanDate(todayStr)}) 백현중 1-3반 수업 & 수행평가 브리핑`;

    // 교사 성함 없이 과목명과 교시만 깔끔하게 표시
    const periodPillsHtml = alerts.schedule
      .map((slot) => {
        const linkedCount = incompleteAll.filter((a) => {
          const s = store.getSubjectById(a.subjectId);
          return s && s.name === slot.subjectName;
        }).length;
        const hasTaskCls = linkedCount > 0 ? 'has-task' : '';
        const countBadge = linkedCount > 0 ? ` <strong>(수행 ${linkedCount})</strong>` : '';
        return `
          <span class="period-pill ${hasTaskCls}" data-jump-subject="${escapeHtml(slot.subjectId || '')}" data-jump-period="${slot.period}" data-jump-date="${briefingTargetDate}">
            <span class="dot" style="background:${slot.color}"></span>
            ${slot.period}교시 ${escapeHtml(slot.subjectName)}
            ${countBadge}
          </span>
        `;
      })
      .join('');

    banner.innerHTML = `
      <div class="briefing-left">
        <div class="briefing-title">${dayTitlePrefix}</div>
        <div class="briefing-classes">
          ${periodPillsHtml || '<span style="font-size:0.84rem;color:var(--text-sub);">등록된 수업이 없습니다.</span>'}
        </div>
      </div>
      <div class="briefing-stats">
        <div class="stat-chip">
          <span class="num">${incompleteAll.length}건</span>
          <span class="lbl">남은 수행평가</span>
        </div>
        <div class="stat-chip">
          <span class="num" style="color:#EF4444">${urgentTasks.length}건</span>
          <span class="lbl">마감 임박(D-3)</span>
        </div>
        <div class="stat-chip">
          <span class="num" style="color:#10B981">${checkedTodayCount}/${incompleteAll.length}</span>
          <span class="lbl">오늘 점검 체크</span>
        </div>
      </div>
    `;

    banner.querySelectorAll('.period-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const subId = pill.getAttribute('data-jump-subject');
        const period = Number(pill.getAttribute('data-jump-period'));
        const dateStr = pill.getAttribute('data-jump-date');
        if (store.state.ui.isAdmin) {
          openAssessmentModal({ subjectId: subId, dueDate: dateStr, period });
        } else {
          store.setUI({ activeTab: 'analytics', filterSubjectId: subId || 'all' });
        }
      });
    });
  }

  // ==========================================================================
  // 2. 수행평가 카드 생성 (교사 성함 제거 + 관리자만 수정/삭제 버튼 노출)
  // ==========================================================================
  function createTaskCardHtml(task) {
    const todayStr = getTodayStr();
    const isAdmin = !!store.state.ui.isAdmin;
    const subj = store.getSubjectById(task.subjectId) || {
      name: '기타',
      color: '#64748B'
    };
    const ddayBadge = store.formatDDayBadge(task.dueDate, task.status);
    const isCheckedToday =
      Array.isArray(task.dailyChecks) && task.dailyChecks.includes(todayStr);

    const wIdx = getWeekdayIndex(task.dueDate);
    const periodText = task.period
      ? `${WEEKDAY_LABELS[wIdx]}요일 ${task.period}교시`
      : `${WEEKDAY_LABELS[wIdx]}요일`;

    const subtasksHtml =
      Array.isArray(task.subtasks) && task.subtasks.length > 0
        ? `<div class="subtask-list">
            ${task.subtasks
              .map(
                (st) => `
              <label class="subtask-item ${st.done ? 'done' : ''}" data-task-id="${escapeHtml(task.id)}" data-subtask-id="${escapeHtml(st.id)}">
                <input type="checkbox" ${st.done ? 'checked' : ''} />
                <span>${escapeHtml(st.text)}</span>
              </label>
            `
              )
              .join('')}
          </div>`
        : '';

    const adminButtonsHtml = isAdmin
      ? `
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${escapeHtml(task.id)}">수정(DB)</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="delete" data-id="${escapeHtml(task.id)}" style="color:#EF4444;">삭제(DB)</button>
      `
      : '';

    return `
      <article class="task-card status-${escapeHtml(task.status)}" data-card-id="${escapeHtml(task.id)}">
        <div class="task-card-top">
          <div class="task-badges">
            <span class="subject-tag" style="background:${subj.color}">
              ${escapeHtml(subj.name)}
            </span>
            <span class="type-tag">${escapeHtml(task.type)}</span>
            ${task.weight ? `<span class="weight-tag">영역배점 ${Number(task.weight)}%</span>` : ''}
          </div>
          <span class="${ddayBadge.cls}">${escapeHtml(ddayBadge.text)}</span>
        </div>

        <h4 class="task-title">${escapeHtml(task.title)}</h4>
        <div class="task-meta">
          <span>📅 마감/실시: <strong>${escapeHtml(task.dueDate)} (${periodText})</strong></span>
        </div>

        ${task.memo ? `<div class="task-memo">💡 ${escapeHtml(task.memo)}</div>` : ''}
        ${subtasksHtml}

        <div class="task-card-footer">
          <button type="button" class="daily-check-btn ${isCheckedToday ? 'checked' : ''}" data-action="daily-check" data-id="${escapeHtml(task.id)}">
            ${isCheckedToday ? '✅ 오늘 점검 완료됨!' : '🔥 오늘 진행/점검 체크하기'}
          </button>

          <div class="task-actions-right">
            <select class="status-select" data-action="status-change" data-id="${escapeHtml(task.id)}" aria-label="내 진행 상태 변경">
              <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>⏳ 미시작</option>
              <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>🔥 준비중</option>
              <option value="done" ${task.status === 'done' ? 'selected' : ''}>✅ 제출완료</option>
            </select>
            ${adminButtonsHtml}
          </div>
        </div>
      </article>
    `;
  }

  function bindTaskCardEvents(container) {
    if (!container) return;

    container.querySelectorAll('[data-action="daily-check"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const checked = store.toggleDailyCheck(id, getTodayStr());
        showToast(
          checked
            ? '🔥 오늘의 수행평가 점검을 완료했습니다!'
            : '오늘 점검 체크를 해제했습니다.'
        );
      });
    });

    container.querySelectorAll('[data-action="status-change"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const id = sel.getAttribute('data-id');
        store.setAssessmentStatus(id, sel.value);
        if (sel.value === 'done') {
          showToast('🎉 내 수행평가 상태가 제출완료로 변경되었습니다!');
        }
      });
    });

    container.querySelectorAll('.subtask-item input[type="checkbox"]').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const label = e.target.closest('.subtask-item');
        if (!label) return;
        const taskId = label.getAttribute('data-task-id');
        const subtaskId = label.getAttribute('data-subtask-id');
        store.toggleSubtask(taskId, subtaskId);
      });
    });

    container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const task = store.state.rawAssessments.find((a) => a.id === id);
        if (task) openAssessmentModal(task);
      });
    });

    container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const task = store.state.rawAssessments.find((a) => a.id === id);
        if (!task) return;
        if (window.confirm(`서버 DB에서 '${task.title}' 수행평가를 삭제하시겠습니까?`)) {
          try {
            await store.adminDeleteAssessment(id);
            showToast('서버 DB에서 수행평가가 삭제되었습니다.');
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });
  }

  // ==========================================================================
  // 3. 탭 1: 캘린더 (월간 / 주간) & 우측 일일 체크 패널 렌더링
  // ==========================================================================
  function renderCalendarAndSidePanel(state) {
    const { ui, assessments } = state;
    const todayStr = getTodayStr();
    const selectedDate = ui.selectedDate || todayStr;
    const baseDate = ui.currentMonthDate || selectedDate;

    const btnMonth = document.getElementById('btnModeMonth');
    const btnWeek = document.getElementById('btnModeWeek');
    if (btnMonth && btnWeek) {
      btnMonth.classList.toggle('active', ui.calendarMode === 'month');
      btnWeek.classList.toggle('active', ui.calendarMode === 'week');
    }

    const calBody = document.getElementById('calendarBody');
    const titleLabel = document.getElementById('calendarTitleLabel');
    if (!calBody || !titleLabel) return;

    const [by, bm] = baseDate.split('-').map(Number);

    if (ui.calendarMode === 'month') {
      titleLabel.textContent = `📅 ${by}년 ${bm}월 수행평가 캘린더`;
      const firstDay = new Date(by, bm - 1, 1);
      const startDow = firstDay.getDay();
      const firstCellDate = new Date(by, bm - 1, 1 - startDow);

      let cellsHtml = '';
      for (let i = 0; i < 42; i++) {
        const cellDt = new Date(
          firstCellDate.getFullYear(),
          firstCellDate.getMonth(),
          firstCellDate.getDate() + i
        );
        const cy = cellDt.getFullYear();
        const cm = String(cellDt.getMonth() + 1).padStart(2, '0');
        const cd = String(cellDt.getDate()).padStart(2, '0');
        const dateStr = `${cy}-${cm}-${cd}`;
        const isCurrentMonth = cellDt.getMonth() === bm - 1;
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedDate;

        const dayTasks = assessments.filter((a) => a.dueDate === dateStr);
        const pillsHtml = dayTasks
          .slice(0, 3)
          .map((t) => {
            const subj = store.getSubjectById(t.subjectId) || { name: '기타', color: '#64748B' };
            return `
              <div class="cal-task-pill ${t.status === 'done' ? 'is-done' : ''}" style="background:${subj.color}" title="${escapeHtml(subj.name)}: ${escapeHtml(t.title)}">
                ${t.period ? `${t.period}교시 ` : ''}${escapeHtml(subj.name)} · ${escapeHtml(t.title)}
              </div>
            `;
          })
          .join('');
        const moreHtml =
          dayTasks.length > 3
            ? `<div style="font-size:0.68rem;color:var(--text-sub);font-weight:700;">+${dayTasks.length - 3}건 더보기</div>`
            : '';

        cellsHtml += `
          <div class="cal-cell ${isCurrentMonth ? '' : 'other-month'} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-date="${dateStr}">
            <div class="cal-date-row">
              <span>${cellDt.getDate()}</span>
              ${isToday ? '<span class="today-tag">오늘</span>' : ''}
            </div>
            <div class="cal-task-list">
              ${pillsHtml}
              ${moreHtml}
            </div>
          </div>
        `;
      }

      calBody.innerHTML = `
        <div class="cal-weekdays">
          ${CAL_HEADERS.map((h) => `<span>${h}</span>`).join('')}
        </div>
        <div class="cal-grid-month">
          ${cellsHtml}
        </div>
      `;
    } else {
      const wIdx = getWeekdayIndex(baseDate);
      const mondayStr = addDaysStr(baseDate, -wIdx);
      const sundayStr = addDaysStr(mondayStr, 6);
      titleLabel.textContent = `📅 주간 플래너 (${mondayStr.slice(5)} ~ ${sundayStr.slice(5)})`;

      let rowsHtml = '';
      for (let i = 0; i < 7; i++) {
        const dStr = addDaysStr(mondayStr, i);
        const isToday = dStr === todayStr;
        const isSelected = dStr === selectedDate;
        const daySchedule = store.getDaySchedule(dStr);
        const dayTasks = assessments.filter((a) => a.dueDate === dStr);

        const miniScheduleHtml = daySchedule
          .map(
            (s) =>
              `<span class="mini-period" style="border-left: 3px solid ${s.color}">${s.period}교시 ${escapeHtml(s.subjectName)}</span>`
          )
          .join('');

        const tasksHtml =
          dayTasks.length > 0
            ? dayTasks
                .map((t) => {
                  const subj = store.getSubjectById(t.subjectId) || { name: '기타', color: '#64748B' };
                  const dday = store.formatDDayBadge(t.dueDate, t.status);
                  return `
                    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-card);padding:6px 10px;border-radius:6px;border:1px solid var(--border-color);margin-top:6px;">
                      <div style="display:flex;align-items:center;gap:6px;">
                        <span class="subject-tag" style="background:${subj.color}">${escapeHtml(subj.name)}</span>
                        <strong style="font-size:0.84rem;${t.status === 'done' ? 'text-decoration:line-through;opacity:0.6;' : ''}">${escapeHtml(t.title)}</strong>
                        ${t.period ? `<span class="type-tag">${t.period}교시</span>` : ''}
                      </div>
                      <span class="${dday.cls}">${dday.text}</span>
                    </div>
                  `;
                })
                .join('')
            : '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">마감/실시 예정인 수행평가가 없습니다.</div>';

        rowsHtml += `
          <div class="week-day-row ${isSelected ? 'is-selected' : ''}" data-date="${dStr}">
            <div class="week-day-header">
              <div class="week-day-title">
                <span>${formatKoreanDate(dStr)}</span>
                ${isToday ? '<span class="today-tag">오늘</span>' : ''}
              </div>
              <div class="week-schedule-mini">${miniScheduleHtml}</div>
            </div>
            ${tasksHtml}
          </div>
        `;
      }

      calBody.innerHTML = `<div class="cal-grid-week">${rowsHtml}</div>`;
    }

    calBody.querySelectorAll('[data-date]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const d = cell.getAttribute('data-date');
        store.setUI({ selectedDate: d, currentMonthDate: d });
      });
    });

    renderSelectedDateSidePanel(selectedDate);
  }

  function renderSelectedDateSidePanel(selectedDate) {
    const panelTitle = document.getElementById('selectedDatePanelTitle');
    const scheduleBox = document.getElementById('selectedDateScheduleBox');
    const tasksBox = document.getElementById('selectedDateTasksBox');
    if (!panelTitle || !scheduleBox || !tasksBox) return;

    panelTitle.textContent = `📌 ${formatKoreanDate(selectedDate)}`;

    const alerts = store.getDateTimetableAlerts(selectedDate);
    const wIdx = getWeekdayIndex(selectedDate);
    const isAdmin = !!store.state.ui.isAdmin;

    if (wIdx > 4) {
      scheduleBox.innerHTML = `
        <div class="schedule-strip-title">
          <span>🏖️ 주말 (${WEEKDAY_LABELS[wIdx]}요일) - 정규 수업 없음</span>
        </div>
        <div style="font-size:0.8rem;color:var(--text-sub);">
          다가오는 주간 백현중 1-3반 수행평가 준비 상태를 미리 체크해보세요!
        </div>
      `;
    } else {
      const cellsHtml = alerts.schedule
        .map(
          (slot) => `
          <div class="strip-cell" data-strip-subject="${escapeHtml(slot.subjectId || '')}" data-strip-period="${slot.period}">
            <span class="p-num">${slot.period}교시</span>
            <span class="p-sub" style="color:${slot.color}">${escapeHtml(slot.subjectName)}</span>
          </div>
        `
        )
        .join('');

      scheduleBox.innerHTML = `
        <div class="schedule-strip-title">
          <span>🕒 백현중 1-3반 ${WEEKDAY_LABELS[wIdx]}요일 시간표</span>
          ${isAdmin ? '<small style="color:var(--primary);">과목 클릭 시 수행평가 등록</small>' : ''}
        </div>
        <div class="schedule-strip-grid">
          ${cellsHtml}
        </div>
      `;

      scheduleBox.querySelectorAll('.strip-cell').forEach((cell) => {
        cell.addEventListener('click', () => {
          const subjectId = cell.getAttribute('data-strip-subject');
          const period = Number(cell.getAttribute('data-strip-period'));
          if (store.state.ui.isAdmin) {
            openAssessmentModal({ subjectId, dueDate: selectedDate, period });
          } else {
            store.setUI({ activeTab: 'analytics', filterSubjectId: subjectId || 'all' });
          }
        });
      });
    }

    const dueIds = new Set(alerts.dueOnDate.map((a) => a.id));
    const relatedTasks = alerts.linkedToTodayClasses.filter((a) => !dueIds.has(a.id));

    let html = `<div style="margin-bottom: 16px;">
      <h4 style="font-size:0.88rem;font-weight:800;margin-bottom:8px;color:var(--text-main);">
        🎯 이 날짜에 마감/실시되는 수행평가 (${alerts.dueOnDate.length}건)
      </h4>`;
    if (alerts.dueOnDate.length > 0) {
      html += `<div class="task-card-list">${alerts.dueOnDate.map((t) => createTaskCardHtml(t)).join('')}</div>`;
    } else {
      html += `<div class="empty-state" style="padding:14px;background:var(--bg-muted);border-radius:8px;">해당 날짜에 마감/실시되는 수행평가가 없습니다.</div>`;
    }
    html += `</div>`;

    html += `<div>
      <h4 style="font-size:0.88rem;font-weight:800;margin-bottom:8px;color:var(--primary);">
        📚 ${wIdx <= 4 ? `${WEEKDAY_LABELS[wIdx]}요일 수업 과목과 연결된 준비중 수행평가` : '진행 중인 수행평가 데일리 체크'} (${relatedTasks.length}건)
      </h4>`;
    if (relatedTasks.length > 0) {
      html += `<div class="task-card-list">${relatedTasks.map((t) => createTaskCardHtml(t)).join('')}</div>`;
    } else {
      const fallbackUpcoming = store.state.assessments
        .filter((a) => a.status !== 'done' && !dueIds.has(a.id))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 3);
      if (fallbackUpcoming.length > 0) {
        html += `<p style="font-size:0.78rem;color:var(--text-sub);margin-bottom:8px;">다가오는 주요 수행평가를 그날그날 미리 점검해보세요:</p>
        <div class="task-card-list">${fallbackUpcoming.map((t) => createTaskCardHtml(t)).join('')}</div>`;
      } else {
        html += `<div class="empty-state" style="padding:14px;background:var(--bg-muted);border-radius:8px;">현재 대기 중인 수행평가가 없습니다.</div>`;
      }
    }
    html += `</div>`;

    tasksBox.innerHTML = html;
    bindTaskCardEvents(tasksBox);
  }

  // ==========================================================================
  // 4. 탭 2: 개인 맞춤형 예상 성적표 & 성취도 등급 계산기 렌더링
  // ==========================================================================
  function renderGradeReportTab(state) {
    const kpiGrid = document.getElementById('gradeKpiGrid');
    const tableWrap = document.getElementById('gradeSummaryTableWrap');
    const cardsContainer = document.getElementById('subjectScoreCardsContainer');
    if (!kpiGrid || !tableWrap || !cardsContainer) return;

    const isAdmin = !!state.ui.isAdmin;
    const report = store.calculateGradeReport();
    const { rows, summary } = report;

    kpiGrid.innerHTML = `
      <div class="grade-kpi-card">
        <span class="kpi-label">점수 입력 과목</span>
        <span class="kpi-value">${summary.enteredSubjectsCount} / ${summary.totalSubjectsCount}과목</span>
      </div>
      <div class="grade-kpi-card">
        <span class="kpi-label">내 예상 평균 점수 (100점 만점)</span>
        <span class="kpi-value">${summary.enteredSubjectsCount > 0 ? `${summary.avgScore}점` : '-'}</span>
      </div>
      <div class="grade-kpi-card">
        <span class="kpi-label">이수단위(29단위) 가중 평균</span>
        <span class="kpi-value">${summary.enteredSubjectsCount > 0 ? `${summary.weightedAvgScore}점` : '-'}</span>
      </div>
      <div class="grade-kpi-card">
        <span class="kpi-label">성취도 A등급 예상 과목</span>
        <span class="kpi-value" style="color:#10B981;">${summary.countA}과목</span>
      </div>
    `;

    // 성적표 요약 테이블
    const tableRowsHtml = rows
      .map((r) => {
        const { plan, exam1Weighted, exam2Weighted, perfEarned, perfEnteredMax, earnedTotal, enteredMaxTotal, projectedScore, gradeInfo } = r;
        const exam1Cell =
          plan.exam1Ratio > 0
            ? exam1Weighted !== null
              ? `<strong>${exam1Weighted}</strong> / ${plan.exam1Ratio}`
              : `<span style="color:var(--text-muted)">미입력 (${plan.exam1Ratio}%)</span>`
            : `<span style="color:var(--text-muted)">-</span>`;

        const exam2Cell =
          plan.exam2Ratio > 0
            ? exam2Weighted !== null
              ? `<strong>${exam2Weighted}</strong> / ${plan.exam2Ratio}`
              : `<span style="color:var(--text-muted)">미입력 (${plan.exam2Ratio}%)</span>`
            : `<span style="color:var(--text-muted)">-</span>`;

        const perfCell =
          perfEnteredMax > 0
            ? `<strong>${perfEarned}</strong> / ${perfEnteredMax}% <small>(총 ${plan.perfRatio}%)</small>`
            : `<span style="color:var(--text-muted)">미입력 (${plan.perfRatio}%)</span>`;

        const totalCell =
          enteredMaxTotal > 0
            ? `<strong>${earnedTotal}점</strong> <small style="color:var(--text-sub)">(${enteredMaxTotal}% 입력됨)</small>`
            : `<span style="color:var(--text-muted)">-</span>`;

        const projCell =
          projectedScore !== null
            ? `<strong style="color:var(--primary)">${enteredMaxTotal === 100 ? earnedTotal : projectedScore}점</strong>`
            : `-`;

        return `
          <tr>
            <td>
              <span class="subject-tag" style="background:${plan.color}">${escapeHtml(plan.name)}</span>
            </td>
            <td>${plan.credits}단위</td>
            <td>${exam1Cell}</td>
            <td>${exam2Cell}</td>
            <td>${perfCell}</td>
            <td>${totalCell}</td>
            <td>${projCell}</td>
            <td><span class="grade-pill ${gradeInfo.cls}">${gradeInfo.grade}</span></td>
          </tr>
        `;
      })
      .join('');

    tableWrap.innerHTML = `
      <table class="report-table">
        <thead>
          <tr>
            <th>교과목</th>
            <th>단위</th>
            <th>1차 정기시험 (환산)</th>
            <th>2차 정기시험 (환산)</th>
            <th>수행평가 (획득/입력배점)</th>
            <th>현재 확보 점수</th>
            <th>100점 환산 예상</th>
            <th>예상 성취도</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    `;

    // 과목별 상세 점수 입력 카드
    cardsContainer.innerHTML = rows
      .map((r) => {
        const { plan, userScore, areaDetails, earnedTotal, enteredMaxTotal, projectedScore, gradeInfo, guideMessage } = r;
        const scaleDesc =
          plan.gradeScale === '3tier' ? '3단계(A:80↑ B:60↑ C)' : '5단계(A:90↑ B:80↑ C:70↑ D:60↑ E)';

        let inputsHtml = '';

        // 1차 지필 입력칸
        if (plan.exam1Ratio > 0) {
          inputsHtml += `
            <div class="score-input-row">
              <div class="row-title">
                ✏️ <strong>1차 정기시험 (지필 ${plan.exam1Ratio}%)</strong>
                <div style="font-size:0.72rem;color:var(--text-sub);">100점 만점 원점수 입력 → ${plan.exam1Ratio}% 자동 환산</div>
              </div>
              <div class="score-input-box">
                <input type="number" class="score-num-input" min="0" max="100" step="0.5"
                  placeholder="0~100" value="${userScore.exam1 !== '' && userScore.exam1 !== undefined ? userScore.exam1 : ''}"
                  data-score-plan="${escapeHtml(plan.id)}" data-score-field="exam1" />
                <span>/ 100점</span>
              </div>
            </div>
          `;
        }

        // 2차 지필 입력칸
        if (plan.exam2Ratio > 0) {
          inputsHtml += `
            <div class="score-input-row">
              <div class="row-title">
                ✏️ <strong>2차 정기시험 (지필 ${plan.exam2Ratio}%)</strong>
                <div style="font-size:0.72rem;color:var(--text-sub);">100점 만점 원점수 입력 → ${plan.exam2Ratio}% 자동 환산</div>
              </div>
              <div class="score-input-box">
                <input type="number" class="score-num-input" min="0" max="100" step="0.5"
                  placeholder="0~100" value="${userScore.exam2 !== '' && userScore.exam2 !== undefined ? userScore.exam2 : ''}"
                  data-score-plan="${escapeHtml(plan.id)}" data-score-field="exam2" />
                <span>/ 100점</span>
              </div>
            </div>
          `;
        }

        // 수행평가 세부 영역별 입력칸
        areaDetails.forEach((area) => {
          inputsHtml += `
            <div class="score-input-row">
              <div class="row-title">
                📋 ${escapeHtml(area.name)}
                <span style="font-size:0.73rem;color:var(--primary);font-weight:700;">(배점 ${area.weight}%)</span>
              </div>
              <div class="score-input-box">
                <input type="number" class="score-num-input" min="0" max="${area.weight}" step="0.5"
                  placeholder="0~${area.weight}" value="${area.isEntered ? area.earned : ''}"
                  data-score-plan="${escapeHtml(plan.id)}" data-score-field="area" data-area-id="${escapeHtml(area.id)}" />
                <span>/ ${area.weight}점</span>
                <button type="button" class="btn btn-secondary btn-sm" data-fill-max-plan="${escapeHtml(plan.id)}" data-fill-max-area="${escapeHtml(area.id)}" data-fill-max-val="${area.weight}" title="만점 입력">만점</button>
              </div>
            </div>
          `;
        });

        const adminEditPlanBtn = isAdmin
          ? `<button type="button" class="btn btn-secondary btn-sm" data-edit-plan="${escapeHtml(plan.id)}">⚙️ 평가계획 수정</button>`
          : '';

        return `
          <div class="subject-score-card">
            <div class="score-card-header">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span class="subject-tag" style="background:${plan.color};font-size:0.86rem;">
                  ${escapeHtml(plan.name)} (${plan.credits}단위)
                </span>
                <small style="font-size:0.74rem;color:var(--text-sub);">${scaleDesc}</small>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="grade-pill ${gradeInfo.cls}">
                  ${gradeInfo.grade === '-' ? '미입력' : `${gradeInfo.grade}등급`}
                </span>
                ${adminEditPlanBtn}
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-sub);">
              <span>비율: 1차(${plan.exam1Ratio}%) · 2차(${plan.exam2Ratio}%) · 수행(${plan.perfRatio}%)</span>
              <strong>현재 ${earnedTotal}점 ${projectedScore !== null && enteredMaxTotal < 100 ? `(환산 예상 ${projectedScore}점)` : ''}</strong>
            </div>

            <div style="display:flex;flex-direction:column;gap:6px;">
              ${inputsHtml}
            </div>

            <div class="guide-callout">
              ${escapeHtml(guideMessage)}
            </div>
          </div>
        `;
      })
      .join('');

    // 점수 입력 이벤트 바인딩
    cardsContainer.querySelectorAll('.score-num-input').forEach((inp) => {
      inp.addEventListener('change', () => {
        const planId = inp.getAttribute('data-score-plan');
        const field = inp.getAttribute('data-score-field');
        const areaId = inp.getAttribute('data-area-id');
        store.updatePersonalScore(planId, field, inp.value, areaId);
      });
    });

    cardsContainer.querySelectorAll('[data-fill-max-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const planId = btn.getAttribute('data-fill-max-plan');
        const areaId = btn.getAttribute('data-fill-max-area');
        const maxVal = Number(btn.getAttribute('data-fill-max-val'));
        store.updatePersonalScore(planId, 'area', maxVal, areaId);
      });
    });

    cardsContainer.querySelectorAll('[data-edit-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const planId = btn.getAttribute('data-edit-plan');
        openSubjectPlanModal(planId);
      });
    });
  }

  // ==========================================================================
  // 5. 탭 3: 백현중 1-3반 주간 시간표 (교사 성함 제거)
  // ==========================================================================
  function renderFullTimetable(state) {
    const container = document.getElementById('fullTimetableContainer');
    const descEl = document.getElementById('timetableSubDesc');
    if (!container) return;

    const isAdmin = !!state.ui.isAdmin;
    if (descEl) {
      descEl.textContent = isAdmin
        ? '🛠️ 관리자 모드: 교시 칸을 클릭하면 해당 교시로 수행평가를 등록하거나 과목명을 수정할 수 있습니다.'
        : '각 교시 과목에 연결된 진행 중인 수행평가 배지가 함께 표시됩니다. (교시 클릭 시 해당 과목 수행평가 모아보기로 이동)';
    }

    const todayStr = getTodayStr();
    const todayWIdx = getWeekdayIndex(todayStr);
    const periodTimes = state.schoolInfo.periodTimes || [
      '1(09:00)', '2(09:55)', '3(10:50)', '4(11:45)',
      '5(13:20)', '6(14:15)', '7(15:10)'
    ];

    let rowsHtml = '';
    for (let p = 1; p <= 7; p++) {
      const pTimeLabel = periodTimes[p - 1] || `${p}교시`;
      let colsHtml = '';

      for (let w = 0; w <= 4; w++) {
        const key = `${w}-${p}`;
        const cell = state.timetable[key];
        const isTodayCol = w === todayWIdx;

        if (cell && cell.subject) {
          const subjObj = store.getSubjectByName(cell.subject) || {
            id: '',
            name: cell.subject,
            color: '#64748B'
          };
          const activeTasks = state.assessments.filter((a) => {
            if (a.status === 'done') return false;
            const s = store.getSubjectById(a.subjectId);
            return s && s.name === cell.subject;
          });

          let taskBadgeHtml = '';
          if (activeTasks.length > 0) {
            const nearest = activeTasks
              .slice()
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
            const dday = store.formatDDayBadge(nearest.dueDate, nearest.status);
            taskBadgeHtml = `
              <div class="tt-task-indicator">
                📌 수행 ${activeTasks.length}건 (${escapeHtml(dday.text)})
              </div>
            `;
          }

          colsHtml += `
            <td class="tt-cell ${isTodayCol ? 'today-col' : ''}" data-w="${w}" data-p="${p}" data-sub-id="${escapeHtml(subjObj.id)}">
              <span class="tt-subj-badge" style="background:${subjObj.color}">
                ${escapeHtml(cell.subject)}
              </span>
              ${cell.changed ? '<div style="font-size:0.68rem;color:#F59E0B;font-weight:700;">(변경됨)</div>' : ''}
              ${taskBadgeHtml}
            </td>
          `;
        } else {
          colsHtml += `
            <td class="tt-cell ${isTodayCol ? 'today-col' : ''}" data-w="${w}" data-p="${p}" data-sub-id="">
              <span style="color:var(--text-muted);font-size:0.78rem;">-</span>
            </td>
          `;
        }
      }

      rowsHtml += `
        <tr>
          <td class="period-col-cell">${escapeHtml(pTimeLabel)}</td>
          ${colsHtml}
        </tr>
      `;
    }

    container.innerHTML = `
      <table class="comcigan-table">
        <thead>
          <tr>
            <th>교시 (시간)</th>
            ${[0, 1, 2, 3, 4]
              .map(
                (w) =>
                  `<th class="${w === todayWIdx ? 'today-col' : ''}">${WEEKDAY_LABELS[w]}요일 ${w === todayWIdx ? '(오늘)' : ''}</th>`
              )
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    container.querySelectorAll('.tt-cell').forEach((td) => {
      td.addEventListener('click', () => {
        const w = Number(td.getAttribute('data-w'));
        const p = Number(td.getAttribute('data-p'));
        const subId = td.getAttribute('data-sub-id');
        if (store.state.ui.isAdmin) {
          openTimetableCellModal(w, p);
        } else if (subId) {
          store.setUI({ activeTab: 'analytics', filterSubjectId: subId });
        }
      });
    });
  }

  // ==========================================================================
  // 6. 탭 4: 전체 수행평가 필터 & 모아보기 렌더링 (교사 성함 없음)
  // ==========================================================================
  function renderFilteredListTab(state) {
    const selSubject = document.getElementById('selFilterSubject');
    const listContainer = document.getElementById('filteredTaskListContainer');
    const countLabel = document.getElementById('filteredCountLabel');
    if (!selSubject || !listContainer) return;

    const groups = ['국어', '수학', '영어', '과학', '사회', '기술·가정', '정보', '도덕', '체육', '음악', '미술'];
    let optionsHtml = `<option value="all">전체 과목</option>`;
    optionsHtml += `<optgroup label="교과군으로 모아보기">`;
    groups.forEach((g) => {
      optionsHtml += `<option value="group:${g}" ${state.ui.filterSubjectId === 'group:' + g ? 'selected' : ''}>[${g}] 교과 전체</option>`;
    });
    optionsHtml += `</optgroup><optgroup label="백현중 1-3반 세부 수업 과목">`;
    state.subjects.forEach((s) => {
      optionsHtml += `<option value="${escapeHtml(s.id)}" ${state.ui.filterSubjectId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`;
    });
    optionsHtml += `</optgroup>`;
    selSubject.innerHTML = optionsHtml;

    const filtered = store.getFilteredAssessments();
    const totalFilteredWeight = filtered.reduce((acc, t) => acc + (Number(t.weight) || 0), 0);
    if (countLabel) {
      countLabel.textContent = `조회된 수행평가 ${filtered.length}건 (합산 배점 ${totalFilteredWeight}%)`;
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `<div class="empty-state">조건에 맞는 수행평가가 없습니다.</div>`;
    } else {
      listContainer.innerHTML = filtered.map((t) => createTaskCardHtml(t)).join('');
      bindTaskCardEvents(listContainer);
    }
  }

  // ==========================================================================
  // 7. 관리자 전용 모달 제어 (수행평가 등록/수정, 평가계획 편집, 시간표 셀 편집)
  // ==========================================================================
  function populateSubjectSelect(selectedId) {
    const sel = document.getElementById('inputSubject');
    if (!sel) return;
    sel.innerHTML = store.state.subjects
      .map(
        (s) =>
          `<option value="${escapeHtml(s.id)}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
      )
      .join('');
  }

  function updateTimetableHintInModal() {
    const selSub = document.getElementById('inputSubject');
    const inpDate = document.getElementById('inputDueDate');
    const selPeriod = document.getElementById('inputPeriod');
    const hintBox = document.getElementById('timetableHintBox');
    if (!selSub || !inpDate || !selPeriod || !hintBox) return;

    const subjectId = selSub.value;
    const dateStr = inpDate.value;
    const subj = store.getSubjectById(subjectId);
    if (!subj) return;

    const weeklySlots = store.getSubjectWeeklySlots(subjectId);
    const matchingPeriods = store.getMatchingPeriodsForDate(subjectId, dateStr);

    const slotDesc =
      weeklySlots.length > 0
        ? weeklySlots.map((s) => `${s.weekdayName} ${s.period}교시`).join(', ')
        : '주간 시간표 배정 없음';

    if (matchingPeriods.length > 0) {
      const p = matchingPeriods[0];
      if (!selPeriod.value) {
        selPeriod.value = String(p);
      }
      hintBox.innerHTML = `✨ <strong>백현중 1-3반 시간표 자동 매칭!</strong> 선택한 날짜(${formatKoreanDate(dateStr)})에는 <strong>${escapeHtml(subj.name)} 수업이 ${matchingPeriods.join(', ')}교시</strong>에 있습니다.`;
    } else {
      hintBox.innerHTML = `ℹ️ <strong>${escapeHtml(subj.name)}</strong> 주간 수업 교시: <strong>[${escapeHtml(slotDesc)}]</strong>`;
    }
  }

  function openAssessmentModal(prefill = {}) {
    if (!store.state.ui.isAdmin) {
      document.getElementById('modalAdminLogin').classList.add('open');
      return;
    }
    const modal = document.getElementById('modalAssessment');
    const titleEl = document.getElementById('modalAssessmentTitle');
    if (!modal) return;

    const isEdit = !!prefill.id && store.state.rawAssessments.some((a) => a.id === prefill.id);
    if (titleEl) {
      titleEl.textContent = isEdit ? '✏️ 수행평가 수정 (서버 DB)' : '＋ 새 수행평가 등록 (서버 DB)';
    }

    const defaultSubId =
      prefill.subjectId || (store.state.subjects[0] ? store.state.subjects[0].id : '');
    populateSubjectSelect(defaultSubId);

    document.getElementById('inputTaskId').value = isEdit ? prefill.id : '';
    document.getElementById('inputTitle').value = prefill.title || '';
    document.getElementById('inputType').value = prefill.type || '보고서';
    document.getElementById('inputDueDate').value =
      prefill.dueDate || store.state.ui.selectedDate || getTodayStr();
    document.getElementById('inputPeriod').value = prefill.period ? String(prefill.period) : '';
    document.getElementById('inputWeight').value =
      prefill.weight !== undefined ? prefill.weight : 20;
    document.getElementById('inputMemo').value = prefill.memo || '';

    const subtasksText = Array.isArray(prefill.subtasks)
      ? prefill.subtasks.map((s) => s.text).join('\n')
      : '';
    document.getElementById('inputSubtasks').value = subtasksText;

    updateTimetableHintInModal();
    modal.classList.add('open');
  }

  function closeAssessmentModal() {
    const modal = document.getElementById('modalAssessment');
    if (modal) modal.classList.remove('open');
  }

  function openSubjectPlanModal(planId) {
    if (!store.state.ui.isAdmin) return;
    const plan = store.getPlanById(planId);
    if (!plan) return;
    const modal = document.getElementById('modalSubjectPlan');
    if (!modal) return;

    document.getElementById('inputPlanId').value = plan.id;
    document.getElementById('inputPlanName').value = plan.name;
    document.getElementById('inputPlanCredits').value = plan.credits;
    document.getElementById('inputPlanExam1').value = plan.exam1Ratio;
    document.getElementById('inputPlanExam2').value = plan.exam2Ratio;
    document.getElementById('inputPlanPerf').value = plan.perfRatio;
    document.getElementById('inputPlanScale').value = plan.gradeScale || '5tier';

    const areasLines = (plan.areas || [])
      .map((a) => `${a.name} : ${a.weight}`)
      .join('\n');
    document.getElementById('inputPlanAreasText').value = areasLines;

    modal.classList.add('open');
  }

  function openTimetableCellModal(weekdayIdx, period) {
    if (!store.state.ui.isAdmin) return;
    const modal = document.getElementById('modalTimetableCell');
    if (!modal) return;
    const key = `${weekdayIdx}-${period}`;
    const cell = store.state.timetable[key] || { subject: '' };
    const nextDateStr = getNextDateForWeekday(getTodayStr(), weekdayIdx);

    activeCellModalContext = {
      weekdayIdx,
      period,
      dateStr: nextDateStr,
      subjectName: cell.subject
    };

    document.getElementById('modalTtCellTitle').textContent =
      `🕒 ${WEEKDAY_LABELS[weekdayIdx]}요일 ${period}교시 (${cell.subject || '빈 교시'})`;

    const summaryBox = document.getElementById('ttCellSummaryBox');
    if (cell.subject) {
      summaryBox.innerHTML = `수업 과목: <strong>${escapeHtml(cell.subject)}</strong><br/>다가오는 수업일: <strong>${formatKoreanDate(nextDateStr)} ${period}교시</strong>`;
    } else {
      summaryBox.innerHTML = `현재 비어 있는 교시입니다. 과목명을 입력해 시간표에 추가할 수 있습니다.`;
    }

    document.getElementById('inputCellSubject').value = cell.subject || '';
    modal.classList.add('open');
  }

  // ==========================================================================
  // 8. 전체 리렌더링 & 이벤트 초기화
  // ==========================================================================
  function renderAll(state) {
    renderHeaderAndBriefing(state);

    const activeTab = state.ui.activeTab || 'calendar';
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === activeTab);
    });

    document.getElementById('viewCalendar').style.display =
      activeTab === 'calendar' ? 'block' : 'none';
    document.getElementById('viewGrades').style.display =
      activeTab === 'grades' ? 'block' : 'none';
    document.getElementById('viewTimetable').style.display =
      activeTab === 'timetable' ? 'block' : 'none';
    document.getElementById('viewAnalytics').style.display =
      activeTab === 'analytics' ? 'block' : 'none';

    if (activeTab === 'calendar') {
      renderCalendarAndSidePanel(state);
    } else if (activeTab === 'grades') {
      renderGradeReportTab(state);
    } else if (activeTab === 'timetable') {
      renderFullTimetable(state);
    } else if (activeTab === 'analytics') {
      renderFilteredListTab(state);
    }
  }

  function initEvents() {
    // 탭 전환
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setUI({ activeTab: btn.getAttribute('data-tab') });
      });
    });

    // 다크모드
    document.getElementById('btnDarkMode').addEventListener('click', () => {
      store.setUI({ darkMode: !store.state.ui.darkMode });
    });

    // 관리자 로그인 모달 열기 / 로그아웃
    document.getElementById('btnAdminToggle').addEventListener('click', () => {
      if (store.state.ui.isAdmin) {
        if (window.confirm('관리자 모드를 종료하시겠습니까?')) {
          store.logoutAdmin();
          showToast('일반 학생 보기 모드로 전환되었습니다.');
        }
      } else {
        document.getElementById('inputAdminPassword').value = '';
        document.getElementById('modalAdminLogin').classList.add('open');
      }
    });

    document.getElementById('btnCloseAdminLogin').addEventListener('click', () => {
      document.getElementById('modalAdminLogin').classList.remove('open');
    });

    document.getElementById('formAdminLogin').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('inputAdminPassword').value;
      try {
        await store.loginAdmin(pw);
        document.getElementById('modalAdminLogin').classList.remove('open');
        showToast('🛠️ 서버 관리자 모드가 활성화되었습니다!');
      } catch (err) {
        alert(err.message);
      }
    });

    document.getElementById('btnAdminLogout').addEventListener('click', () => {
      store.logoutAdmin();
      showToast('관리자 모드에서 로그아웃되었습니다.');
    });

    document.getElementById('btnAdminAddTask').addEventListener('click', () => {
      openAssessmentModal({ dueDate: store.state.ui.selectedDate });
    });

    document.getElementById('btnAdminSyncNeis').addEventListener('click', async () => {
      try {
        showToast('⏳ 시간표를 외부 공공데이터/컴시간에서 조회하여 서버 DB에 동기화합니다...');
        const res = await store.adminSyncTimetable('auto');
        showToast(`✅ ${res && res.message ? res.message : '시간표 DB 동기화 완료!'}`);
      } catch (err) {
        alert('시간표 동기화 오류: ' + err.message);
      }
    });

    // 수행평가 추가 버튼 (관리자용)
    document.getElementById('btnAddAssessment').addEventListener('click', () => {
      openAssessmentModal({ dueDate: store.state.ui.selectedDate });
    });
    document.getElementById('btnAddOnSelectedDate').addEventListener('click', () => {
      openAssessmentModal({ dueDate: store.state.ui.selectedDate });
    });

    // 캘린더 컨트롤
    document.getElementById('btnModeMonth').addEventListener('click', () => {
      store.setUI({ calendarMode: 'month' });
    });
    document.getElementById('btnModeWeek').addEventListener('click', () => {
      store.setUI({ calendarMode: 'week' });
    });
    document.getElementById('btnCalToday').addEventListener('click', () => {
      const t = getTodayStr();
      store.setUI({ selectedDate: t, currentMonthDate: t });
    });
    document.getElementById('btnCalPrev').addEventListener('click', () => {
      const cur = store.state.ui.currentMonthDate || getTodayStr();
      if (store.state.ui.calendarMode === 'week') {
        const prevWeek = addDaysStr(cur, -7);
        store.setUI({ currentMonthDate: prevWeek, selectedDate: prevWeek });
      } else {
        const [y, m] = cur.split('-').map(Number);
        const dt = new Date(y, m - 2, 1);
        const nextStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`;
        store.setUI({ currentMonthDate: nextStr });
      }
    });
    document.getElementById('btnCalNext').addEventListener('click', () => {
      const cur = store.state.ui.currentMonthDate || getTodayStr();
      if (store.state.ui.calendarMode === 'week') {
        const nextWeek = addDaysStr(cur, 7);
        store.setUI({ currentMonthDate: nextWeek, selectedDate: nextWeek });
      } else {
        const [y, m] = cur.split('-').map(Number);
        const dt = new Date(y, m, 1);
        const nextStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`;
        store.setUI({ currentMonthDate: nextStr });
      }
    });

    // 예상 성적표 탭 버튼
    document.getElementById('btnFillSampleScores').addEventListener('click', () => {
      store.fillSamplePersonalScores();
      showToast('✨ 예시 점수가 입력되었습니다. 각 칸의 숫자를 내 점수로 자유롭게 바꿔보세요!');
    });
    document.getElementById('btnClearScores').addEventListener('click', () => {
      if (window.confirm('입력한 내 예상 성적표 점수를 모두 지우시겠습니까?')) {
        store.clearPersonalScores();
        showToast('점수 입력값이 초기화되었습니다.');
      }
    });

    // 수행평가 등록/수정 모달 폼 제출
    document.getElementById('btnCloseAssessmentModal').addEventListener('click', closeAssessmentModal);
    document.getElementById('btnCancelAssessment').addEventListener('click', closeAssessmentModal);
    document.getElementById('inputSubject').addEventListener('change', () => {
      document.getElementById('inputPeriod').value = '';
      updateTimetableHintInModal();
    });
    document.getElementById('inputDueDate').addEventListener('change', () => {
      document.getElementById('inputPeriod').value = '';
      updateTimetableHintInModal();
    });

    document.getElementById('formAssessment').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('inputTaskId').value;
      const title = document.getElementById('inputTitle').value.trim();
      const subjectId = document.getElementById('inputSubject').value;
      const type = document.getElementById('inputType').value;
      const dueDate = document.getElementById('inputDueDate').value;
      const periodVal = document.getElementById('inputPeriod').value;
      const weight = Number(document.getElementById('inputWeight').value) || 0;
      const memo = document.getElementById('inputMemo').value.trim();
      const rawSubtasks = document.getElementById('inputSubtasks').value;

      const subtasks = rawSubtasks
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text, idx) => ({
          id: 'st-' + Date.now() + '-' + idx,
          text
        }));

      try {
        await store.adminSaveAssessment({
          id: id || undefined,
          title,
          subjectId,
          type,
          dueDate,
          period: periodVal ? Number(periodVal) : null,
          weight,
          memo,
          subtasks
        });
        closeAssessmentModal();
        showToast('✅ 서버 SQLite DB에 수행평가가 저장되었습니다!');
      } catch (err) {
        alert(err.message);
      }
    });

    // 교과별 평가계획 수정 모달 (관리자용)
    document.getElementById('btnCloseSubjectPlanModal').addEventListener('click', () => {
      document.getElementById('modalSubjectPlan').classList.remove('open');
    });
    document.getElementById('formSubjectPlan').addEventListener('submit', async (e) => {
      e.preventDefault();
      const planId = document.getElementById('inputPlanId').value;
      const existingPlan = store.getPlanById(planId) || {};
      const name = document.getElementById('inputPlanName').value.trim();
      const credits = Number(document.getElementById('inputPlanCredits').value) || 3;
      const exam1Ratio = Number(document.getElementById('inputPlanExam1').value) || 0;
      const exam2Ratio = Number(document.getElementById('inputPlanExam2').value) || 0;
      const perfRatio = Number(document.getElementById('inputPlanPerf').value) || 0;
      const gradeScale = document.getElementById('inputPlanScale').value;
      const rawAreas = document.getElementById('inputPlanAreasText').value;

      const areas = rawAreas
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, idx) => {
          const parts = line.split(':');
          const areaWeight = parts.length > 1 ? Number(parts[parts.length - 1].trim()) || 0 : 20;
          const areaName =
            parts.length > 1 ? parts.slice(0, -1).join(':').trim() : line;
          const prevArea = (existingPlan.areas || [])[idx];
          return {
            id: prevArea ? prevArea.id : `${planId}-area-${idx + 1}`,
            name: areaName,
            weight: areaWeight
          };
        });

      try {
        await store.adminSaveSubjectPlan({
          id: planId,
          name,
          color: existingPlan.color || '#4F46E5',
          credits,
          exam1Ratio,
          exam2Ratio,
          perfRatio,
          gradeScale,
          areas
        });
        document.getElementById('modalSubjectPlan').classList.remove('open');
        showToast(`✅ [${name}] 평가계획이 서버 DB에 업데이트되었습니다!`);
      } catch (err) {
        alert(err.message);
      }
    });

    // 시간표 셀 모달 (관리자용)
    document.getElementById('btnCloseTtCellModal').addEventListener('click', () => {
      document.getElementById('modalTimetableCell').classList.remove('open');
    });
    document.getElementById('btnQuickAddFromCell').addEventListener('click', () => {
      document.getElementById('modalTimetableCell').classList.remove('open');
      if (!activeCellModalContext) return;
      const { subjectName, dateStr, period } = activeCellModalContext;
      const subObj = store.getSubjectByName(subjectName);
      openAssessmentModal({
        subjectId: subObj ? subObj.id : undefined,
        dueDate: dateStr,
        period
      });
    });
    document.getElementById('btnSaveCellEdit').addEventListener('click', async () => {
      if (!activeCellModalContext) return;
      const newSub = document.getElementById('inputCellSubject').value.trim();
      try {
        await store.adminUpdateTimetableCell(
          activeCellModalContext.weekdayIdx,
          activeCellModalContext.period,
          newSub
        );
        document.getElementById('modalTimetableCell').classList.remove('open');
        showToast('✅ 시간표 칸이 서버 DB에 업데이트되었습니다.');
      } catch (err) {
        alert(err.message);
      }
    });

    // 필터 이벤트
    document.getElementById('selFilterSubject').addEventListener('change', (e) => {
      store.setUI({ filterSubjectId: e.target.value });
    });
    document.getElementById('selFilterType').addEventListener('change', (e) => {
      store.setUI({ filterType: e.target.value });
    });
    document.getElementById('selFilterStatus').addEventListener('change', (e) => {
      store.setUI({ filterStatus: e.target.value });
    });
    document.getElementById('selSortBy').addEventListener('change', (e) => {
      store.setUI({ sortBy: e.target.value });
    });

    // 개인 기록 백업 모달
    const modalBackup = document.getElementById('modalBackup');
    document.getElementById('btnOpenBackup').addEventListener('click', () => {
      modalBackup.classList.add('open');
    });
    document.getElementById('btnCloseBackupModal').addEventListener('click', () => {
      modalBackup.classList.remove('open');
    });
    document.getElementById('btnExportJSON').addEventListener('click', () => {
      const jsonStr = store.exportPersonalJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `백현중_내성적표_체크기록_${getTodayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('📥 내 개인 점수 및 체크 기록이 다운로드되었습니다.');
    });
    document.getElementById('inputImportJSON').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          store.importPersonalJSON(String(reader.result));
          modalBackup.classList.remove('open');
          showToast('📤 내 기록을 성공적으로 불러왔습니다!');
        } catch (err) {
          alert('불러오기 실패: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  store.subscribe(renderAll);
  initEvents();
  renderAll(store.state);

  // 서버(server.py)를 통해 접속한 경우 SQLite DB의 최신 공통 데이터를 자동으로 로드
  if (window.location.protocol.startsWith('http')) {
    store.fetchBootstrapFromServer().catch(() => {});
  }
})();
