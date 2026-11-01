/**
 * 백현중 1-3 수행평가 플래너 v3 컨트롤러 (app.js)
 * - 노션/토스 스타일 심플 3탭 (수행평가 일정 / 시간표 / 예상 성적표)
 * - 사이트 진입 시 법적 고지 및 이용 동의 모달
 * - 다크모드, 백업, 상단 브리핑 배너 등 불필요한 부가 요소 전면 제거
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
    }, 2800);
  }

  function formatKoreanDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const wIdx = getWeekdayIndex(dateStr);
    return `${y}년 ${m}월 ${d}일 (${WEEKDAY_LABELS[wIdx]})`;
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
  // 1. 상단 네비게이션 및 관리자 배너 상태 업데이트
  // ==========================================================================
  function renderTopNav(state) {
    const isAdmin = !!state.ui.isAdmin;
    const adminBanner = document.getElementById('adminBanner');
    const btnAdminToggle = document.getElementById('btnAdminToggle');
    const btnAddAssessment = document.getElementById('btnAddAssessment');
    const btnAddOnSelectedDate = document.getElementById('btnAddOnSelectedDate');

    if (adminBanner) adminBanner.style.display = isAdmin ? 'flex' : 'none';
    if (btnAdminToggle) {
      btnAdminToggle.textContent = isAdmin ? '🛠️ 관리자 활성' : '🔒 관리자';
    }
    if (btnAddAssessment) {
      btnAddAssessment.style.display = isAdmin ? 'inline-flex' : 'none';
    }
    if (btnAddOnSelectedDate) {
      btnAddOnSelectedDate.style.display = isAdmin ? 'inline-flex' : 'none';
    }
  }

  // ==========================================================================
  // 2. 수행평가 카드 생성
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
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${escapeHtml(task.id)}">수정</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="delete" data-id="${escapeHtml(task.id)}" style="color:var(--accent-red);">삭제</button>
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
            ${task.weight ? `<span class="weight-tag">${Number(task.weight)}%</span>` : ''}
          </div>
          <span class="${ddayBadge.cls}">${escapeHtml(ddayBadge.text)}</span>
        </div>

        <h4 class="task-title">${escapeHtml(task.title)}</h4>
        <div class="task-meta">
          📅 ${escapeHtml(task.dueDate)} (${periodText})
        </div>

        ${task.memo ? `<div class="task-memo">${escapeHtml(task.memo)}</div>` : ''}
        ${subtasksHtml}

        <div class="task-card-footer">
          <button type="button" class="daily-check-btn ${isCheckedToday ? 'checked' : ''}" data-action="daily-check" data-id="${escapeHtml(task.id)}">
            ${isCheckedToday ? '✅ 오늘 확인 완료' : '🔥 오늘 확인 체크'}
          </button>

          <div style="display:flex;align-items:center;gap:6px;">
            <select class="status-select" data-action="status-change" data-id="${escapeHtml(task.id)}" aria-label="진행 상태">
              <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>미시작</option>
              <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>준비중</option>
              <option value="done" ${task.status === 'done' ? 'selected' : ''}>완료됨</option>
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
        showToast(checked ? '🔥 오늘의 수행평가 점검 완료!' : '오늘 점검 체크를 해제했습니다.');
      });
    });

    container.querySelectorAll('[data-action="status-change"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const id = sel.getAttribute('data-id');
        store.setAssessmentStatus(id, sel.value);
      });
    });

    container.querySelectorAll('.subtask-item input[type="checkbox"]').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const label = e.target.closest('.subtask-item');
        if (!label) return;
        store.toggleSubtask(
          label.getAttribute('data-task-id'),
          label.getAttribute('data-subtask-id')
        );
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
        if (window.confirm(`'${task.title}' 일정을 삭제하시겠습니까?`)) {
          try {
            await store.adminDeleteAssessment(id);
            showToast('일정이 삭제되었습니다.');
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });
  }

  // ==========================================================================
  // 3. 탭 1: 수행평가 일정 (캘린더 + 우측 체크리스트)
  // ==========================================================================
  function renderCalendarTab(state) {
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
      titleLabel.textContent = `${by}년 ${bm}월`;
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
              <div class="cal-task-pill ${t.status === 'done' ? 'is-done' : ''}" style="background:${subj.color}">
                ${escapeHtml(subj.name)} · ${escapeHtml(t.title)}
              </div>
            `;
          })
          .join('');
        const moreHtml =
          dayTasks.length > 3
            ? `<div style="font-size:0.66rem;color:var(--text-sub);font-weight:700;">+${dayTasks.length - 3}건</div>`
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
      titleLabel.textContent = `${mondayStr.slice(5)} ~ ${sundayStr.slice(5)}`;

      let rowsHtml = '';
      for (let i = 0; i < 7; i++) {
        const dStr = addDaysStr(mondayStr, i);
        const isToday = dStr === todayStr;
        const isSelected = dStr === selectedDate;
        const dayTasks = assessments.filter((a) => a.dueDate === dStr);

        const tasksHtml =
          dayTasks.length > 0
            ? dayTasks
                .map((t) => {
                  const subj = store.getSubjectById(t.subjectId) || { name: '기타', color: '#64748B' };
                  const dday = store.formatDDayBadge(t.dueDate, t.status);
                  return `
                    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-card);padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);margin-top:4px;">
                      <div style="display:flex;align-items:center;gap:6px;">
                        <span class="subject-tag" style="background:${subj.color}">${escapeHtml(subj.name)}</span>
                        <strong style="font-size:0.84rem;">${escapeHtml(t.title)}</strong>
                      </div>
                      <span class="${dday.cls}">${dday.text}</span>
                    </div>
                  `;
                })
                .join('')
            : '<div style="font-size:0.76rem;color:var(--text-muted);">예정된 수행평가 없음</div>';

        rowsHtml += `
          <div class="week-day-row ${isSelected ? 'is-selected' : ''}" data-date="${dStr}">
            <div class="week-day-header">
              <div class="week-day-title">
                <span>${formatKoreanDate(dStr)}</span>
                ${isToday ? '<span class="today-tag">오늘</span>' : ''}
              </div>
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

    renderTaskSidePanel(state, selectedDate);
  }

  function renderTaskSidePanel(state, selectedDate) {
    const panelTitle = document.getElementById('selectedDatePanelTitle');
    const tasksBox = document.getElementById('selectedDateTasksBox');
    const selFilter = document.getElementById('selQuickSubjectFilter');
    if (!panelTitle || !tasksBox || !selFilter) return;

    panelTitle.textContent = `📌 ${formatKoreanDate(selectedDate)}`;

    // 과목 필터 옵션 렌더링
    const groups = ['국어', '수학', '영어', '과학', '사회', '기술·가정', '정보', '도덕', '체육', '음악', '미술'];
    let optHtml = `<option value="all">전체 과목</option>`;
    groups.forEach((g) => {
      optHtml += `<option value="group:${g}" ${state.ui.filterSubjectId === 'group:' + g ? 'selected' : ''}>${g}</option>`;
    });
    selFilter.innerHTML = optHtml;

    let list = state.assessments.slice();
    if (state.ui.filterSubjectId && state.ui.filterSubjectId !== 'all') {
      const gName = state.ui.filterSubjectId.replace('group:', '');
      list = list.filter((a) => {
        const s = store.getSubjectById(a.subjectId);
        return s && s.group === gName;
      });
    }

    const dueOnSelected = list.filter((a) => a.dueDate === selectedDate);
    const dueIds = new Set(dueOnSelected.map((a) => a.id));
    const otherOngoing = list
      .filter((a) => !dueIds.has(a.id))
      .sort((a, b) => {
        if ((a.status === 'done') !== (b.status === 'done')) {
          return a.status === 'done' ? 1 : -1;
        }
        return a.dueDate.localeCompare(b.dueDate);
      });

    let html = '';

    if (dueOnSelected.length > 0) {
      html += `
        <div style="margin-bottom:16px;">
          <div style="font-size:0.82rem;font-weight:800;color:var(--primary);margin-bottom:8px;">
            🎯 선택한 날짜(${selectedDate.slice(5)}) 수행평가 (${dueOnSelected.length}건)
          </div>
          <div class="task-card-list">
            ${dueOnSelected.map((t) => createTaskCardHtml(t)).join('')}
          </div>
        </div>
      `;
    }

    html += `
      <div>
        <div style="font-size:0.82rem;font-weight:800;color:var(--text-sub);margin-bottom:8px;">
          📋 전체 수행평가 목록 (${otherOngoing.length}건)
        </div>
        ${
          otherOngoing.length > 0
            ? `<div class="task-card-list">${otherOngoing.map((t) => createTaskCardHtml(t)).join('')}</div>`
            : `<div class="empty-state">등록된 수행평가가 없습니다.</div>`
        }
      </div>
    `;

    tasksBox.innerHTML = html;
    bindTaskCardEvents(tasksBox);
  }

  // ==========================================================================
  // 4. 탭 2: 시간표 렌더링
  // ==========================================================================
  function renderFullTimetable(state) {
    const container = document.getElementById('fullTimetableContainer');
    const descEl = document.getElementById('timetableSubDesc');
    if (!container) return;

    const isAdmin = !!state.ui.isAdmin;
    if (descEl) {
      descEl.textContent = isAdmin
        ? '관리자 모드: 교시 칸을 클릭하면 수행평가를 바로 추가하거나 과목명을 수정할 수 있습니다.'
        : '각 교시 과목에 진행 중인 수행평가가 있으면 함께 표시됩니다.';
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
              <div>
                <span class="tt-task-indicator">수행 ${activeTasks.length} (${escapeHtml(dday.text)})</span>
              </div>
            `;
          }

          colsHtml += `
            <td class="tt-cell ${isTodayCol ? 'today-col' : ''}" data-w="${w}" data-p="${p}" data-group="${escapeHtml(subjObj.group || '')}">
              <span class="tt-subj-badge" style="background:${subjObj.color}">
                ${escapeHtml(cell.subject)}
              </span>
              ${taskBadgeHtml}
            </td>
          `;
        } else {
          colsHtml += `
            <td class="tt-cell ${isTodayCol ? 'today-col' : ''}" data-w="${w}" data-p="${p}" data-group="">
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
            <th>교시</th>
            ${[0, 1, 2, 3, 4]
              .map(
                (w) =>
                  `<th class="${w === todayWIdx ? 'today-col' : ''}">${WEEKDAY_LABELS[w]}요일</th>`
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
        const grp = td.getAttribute('data-group');
        if (store.state.ui.isAdmin) {
          openTimetableCellModal(w, p);
        } else if (grp) {
          store.setUI({ activeTab: 'calendar', filterSubjectId: 'group:' + grp });
        }
      });
    });
  }

  // ==========================================================================
  // 5. 탭 3: 예상 성적표 & 등급 계산기 렌더링
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
        <span class="kpi-label">입력 과목</span>
        <span class="kpi-value">${summary.enteredSubjectsCount} / ${summary.totalSubjectsCount}</span>
      </div>
      <div class="grade-kpi-card">
        <span class="kpi-label">예상 평균 점수</span>
        <span class="kpi-value">${summary.enteredSubjectsCount > 0 ? `${summary.avgScore}점` : '-'}</span>
      </div>
      <div class="grade-kpi-card">
        <span class="kpi-label">단위 가중 평균</span>
        <span class="kpi-value">${summary.enteredSubjectsCount > 0 ? `${summary.weightedAvgScore}점` : '-'}</span>
      </div>
      <div class="grade-kpi-card">
        <span class="kpi-label">A등급 예상</span>
        <span class="kpi-value" style="color:var(--accent-green);">${summary.countA}과목</span>
      </div>
    `;

    const tableRowsHtml = rows
      .map((r) => {
        const { plan, exam1Weighted, exam2Weighted, perfEarned, perfEnteredMax, earnedTotal, enteredMaxTotal, projectedScore, gradeInfo } = r;
        const exam1Cell =
          plan.exam1Ratio > 0
            ? exam1Weighted !== null
              ? `<strong>${exam1Weighted}</strong> / ${plan.exam1Ratio}`
              : `<span style="color:var(--text-muted)">- (${plan.exam1Ratio}%)</span>`
            : `<span style="color:var(--text-muted)">-</span>`;

        const exam2Cell =
          plan.exam2Ratio > 0
            ? exam2Weighted !== null
              ? `<strong>${exam2Weighted}</strong> / ${plan.exam2Ratio}`
              : `<span style="color:var(--text-muted)">- (${plan.exam2Ratio}%)</span>`
            : `<span style="color:var(--text-muted)">-</span>`;

        const perfCell =
          perfEnteredMax > 0
            ? `<strong>${perfEarned}</strong> / ${perfEnteredMax}%`
            : `<span style="color:var(--text-muted)">- (${plan.perfRatio}%)</span>`;

        const totalCell = enteredMaxTotal > 0 ? `<strong>${earnedTotal}점</strong>` : `-`;
        const projCell =
          projectedScore !== null
            ? `<strong style="color:var(--primary)">${enteredMaxTotal === 100 ? earnedTotal : projectedScore}점</strong>`
            : `-`;

        return `
          <tr>
            <td><span class="subject-tag" style="background:${plan.color}">${escapeHtml(plan.name)}</span></td>
            <td>${plan.credits}</td>
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
            <th>과목</th>
            <th>단위</th>
            <th>1차 지필</th>
            <th>2차 지필</th>
            <th>수행평가</th>
            <th>현재 합계</th>
            <th>100점 환산</th>
            <th>예상 등급</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    `;

    cardsContainer.innerHTML = rows
      .map((r) => {
        const { plan, userScore, areaDetails, earnedTotal, enteredMaxTotal, projectedScore, gradeInfo, guideMessage } = r;
        let inputsHtml = '';

        if (plan.exam1Ratio > 0) {
          inputsHtml += `
            <div class="score-input-row">
              <div class="row-title">
                ✏️ 1차 정기시험 (${plan.exam1Ratio}%)
              </div>
              <div class="score-input-box">
                <input type="number" class="score-num-input" min="0" max="100" step="0.5"
                  placeholder="0~100" value="${userScore.exam1 !== '' && userScore.exam1 !== undefined ? userScore.exam1 : ''}"
                  data-score-plan="${escapeHtml(plan.id)}" data-score-field="exam1" />
                <span>/ 100</span>
              </div>
            </div>
          `;
        }

        if (plan.exam2Ratio > 0) {
          inputsHtml += `
            <div class="score-input-row">
              <div class="row-title">
                ✏️ 2차 정기시험 (${plan.exam2Ratio}%)
              </div>
              <div class="score-input-box">
                <input type="number" class="score-num-input" min="0" max="100" step="0.5"
                  placeholder="0~100" value="${userScore.exam2 !== '' && userScore.exam2 !== undefined ? userScore.exam2 : ''}"
                  data-score-plan="${escapeHtml(plan.id)}" data-score-field="exam2" />
                <span>/ 100</span>
              </div>
            </div>
          `;
        }

        areaDetails.forEach((area) => {
          inputsHtml += `
            <div class="score-input-row">
              <div class="row-title">
                📋 ${escapeHtml(area.name)} <small style="color:var(--primary);font-weight:700;">(${area.weight}%)</small>
              </div>
              <div class="score-input-box">
                <input type="number" class="score-num-input" min="0" max="${area.weight}" step="0.5"
                  placeholder="0~${area.weight}" value="${area.isEntered ? area.earned : ''}"
                  data-score-plan="${escapeHtml(plan.id)}" data-score-field="area" data-area-id="${escapeHtml(area.id)}" />
                <span>/ ${area.weight}</span>
                <button type="button" class="btn btn-secondary btn-sm" data-fill-max-plan="${escapeHtml(plan.id)}" data-fill-max-area="${escapeHtml(area.id)}" data-fill-max-val="${area.weight}">만점</button>
              </div>
            </div>
          `;
        });

        const adminEditPlanBtn = isAdmin
          ? `<button type="button" class="btn btn-secondary btn-sm" data-edit-plan="${escapeHtml(plan.id)}">⚙️ 수정</button>`
          : '';

        return `
          <div class="subject-score-card">
            <div class="score-card-header">
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="subject-tag" style="background:${plan.color};font-size:0.84rem;">
                  ${escapeHtml(plan.name)}
                </span>
                <span style="font-size:0.78rem;color:var(--text-sub);font-weight:700;">
                  현재 ${earnedTotal}점 ${projectedScore !== null && enteredMaxTotal < 100 ? `(환산 ${projectedScore}점)` : ''}
                </span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="grade-pill ${gradeInfo.cls}">
                  ${gradeInfo.grade === '-' ? '-' : `${gradeInfo.grade}등급`}
                </span>
                ${adminEditPlanBtn}
              </div>
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

    cardsContainer.querySelectorAll('.score-num-input').forEach((inp) => {
      inp.addEventListener('change', () => {
        store.updatePersonalScore(
          inp.getAttribute('data-score-plan'),
          inp.getAttribute('data-score-field'),
          inp.value,
          inp.getAttribute('data-area-id')
        );
      });
    });

    cardsContainer.querySelectorAll('[data-fill-max-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.updatePersonalScore(
          btn.getAttribute('data-fill-max-plan'),
          'area',
          Number(btn.getAttribute('data-fill-max-val')),
          btn.getAttribute('data-fill-max-area')
        );
      });
    });

    cardsContainer.querySelectorAll('[data-edit-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openSubjectPlanModal(btn.getAttribute('data-edit-plan'));
      });
    });
  }

  // ==========================================================================
  // 6. 관리자 전용 모달 제어
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
        : '시간표 배정 없음';

    if (matchingPeriods.length > 0) {
      if (!selPeriod.value) {
        selPeriod.value = String(matchingPeriods[0]);
      }
      hintBox.innerHTML = `✨ 선택한 날짜에는 <strong>${escapeHtml(subj.name)} 수업이 ${matchingPeriods.join(', ')}교시</strong>에 있습니다.`;
    } else {
      hintBox.innerHTML = `ℹ️ <strong>${escapeHtml(subj.name)}</strong> 주간 수업: [${escapeHtml(slotDesc)}]`;
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
      titleEl.textContent = isEdit ? '수행평가 수정' : '새 수행평가 등록';
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
      `${WEEKDAY_LABELS[weekdayIdx]}요일 ${period}교시`;

    const summaryBox = document.getElementById('ttCellSummaryBox');
    summaryBox.innerHTML = cell.subject
      ? `현재 과목: <strong>${escapeHtml(cell.subject)}</strong> (${formatKoreanDate(nextDateStr)})`
      : `현재 비어 있는 교시입니다.`;

    document.getElementById('inputCellSubject').value = cell.subject || '';
    modal.classList.add('open');
  }

  // ==========================================================================
  // 7. 전체 리렌더링 & 초기화
  // ==========================================================================
  function renderAll(state) {
    renderTopNav(state);

    const activeTab = state.ui.activeTab || 'calendar';
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === activeTab);
    });

    document.getElementById('viewCalendar').style.display =
      activeTab === 'calendar' ? 'block' : 'none';
    document.getElementById('viewTimetable').style.display =
      activeTab === 'timetable' ? 'block' : 'none';
    document.getElementById('viewGrades').style.display =
      activeTab === 'grades' ? 'block' : 'none';

    if (activeTab === 'calendar') {
      renderCalendarTab(state);
    } else if (activeTab === 'timetable') {
      renderFullTimetable(state);
    } else if (activeTab === 'grades') {
      renderGradeReportTab(state);
    }
  }

  function initConsentModal() {
    const modal = document.getElementById('modalTermsConsent');
    const chk = document.getElementById('chkTermsAgree');
    const btnAccept = document.getElementById('btnAcceptTerms');
    const btnReopen = document.getElementById('btnReopenTerms');

    if (!store.hasAgreedTerms()) {
      modal.classList.add('open');
    }

    btnAccept.addEventListener('click', () => {
      if (!chk.checked) {
        alert('안내사항 확인 및 동의 체크박스를 선택해 주세요.');
        return;
      }
      store.acceptTerms();
      modal.classList.remove('open');
      showToast('사이트 이용 안내에 동의하셨습니다.');
    });

    btnReopen.addEventListener('click', () => {
      chk.checked = store.hasAgreedTerms();
      modal.classList.add('open');
    });
  }

  function initEvents() {
    initConsentModal();

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setUI({ activeTab: btn.getAttribute('data-tab') });
      });
    });

    document.getElementById('selQuickSubjectFilter').addEventListener('change', (e) => {
      store.setUI({ filterSubjectId: e.target.value });
    });

    // 관리자 로그인/로그아웃
    document.getElementById('btnAdminToggle').addEventListener('click', () => {
      if (store.state.ui.isAdmin) {
        if (window.confirm('관리자 모드를 종료하시겠습니까?')) {
          store.logoutAdmin();
          showToast('학생 모드로 전환되었습니다.');
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
        showToast('🛠️ 관리자 모드가 활성화되었습니다.');
      } catch (err) {
        alert(err.message);
      }
    });

    document.getElementById('btnAdminLogout').addEventListener('click', () => {
      store.logoutAdmin();
      showToast('로그아웃되었습니다.');
    });

    document.getElementById('btnAdminAddTask').addEventListener('click', () => {
      openAssessmentModal({ dueDate: store.state.ui.selectedDate });
    });

    document.getElementById('btnAdminSyncNeis').addEventListener('click', async () => {
      try {
        showToast('⏳ 교육부 나이스(NEIS) 공공데이터 시간표를 확인합니다...');
        const res = await store.adminSyncTimetable();
        showToast(res && res.message ? res.message : '동기화 완료!');
      } catch (err) {
        alert('동기화 오류: ' + err.message);
      }
    });

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

    // 예상 성적표 버튼
    document.getElementById('btnFillSampleScores').addEventListener('click', () => {
      store.fillSamplePersonalScores();
      showToast('✨ 예시 점수가 입력되었습니다.');
    });
    document.getElementById('btnClearScores').addEventListener('click', () => {
      if (window.confirm('입력한 점수를 초기화하시겠습니까?')) {
        store.clearPersonalScores();
      }
    });

    // 수행평가 모달
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
        showToast('저장되었습니다.');
      } catch (err) {
        alert(err.message);
      }
    });

    // 평가계획 모달
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
          color: existingPlan.color || '#3182F6',
          credits,
          exam1Ratio,
          exam2Ratio,
          perfRatio,
          gradeScale,
          areas
        });
        document.getElementById('modalSubjectPlan').classList.remove('open');
        showToast('평가계획이 업데이트되었습니다.');
      } catch (err) {
        alert(err.message);
      }
    });

    // 시간표 셀 모달
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
        showToast('시간표가 수정되었습니다.');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  store.subscribe(renderAll);
  initEvents();
  renderAll(store.state);

  if (window.location.protocol.startsWith('http')) {
    store.fetchBootstrapFromServer().catch(() => {});
  }
})();
