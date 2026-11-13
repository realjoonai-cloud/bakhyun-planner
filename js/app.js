/**
 * 백현중 1-3 수행평가 플래너 v3 컨트롤러 (app.js)
 * - 심플 3탭 카드형 (수행평가 일정 / 시간표 / 예상 성적표)
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
  let activePlanTaskId = null;

  function getAcadCategoryClass(cat) {
    if (cat === 'holiday') return 'acad-holiday';
    if (cat === 'exam') return 'acad-exam';
    if (cat === 'club') return 'acad-club';
    return 'acad-event';
  }

  function getAcadCategoryIcon(cat) {
    if (cat === 'holiday') return '🔴';
    if (cat === 'exam') return '✏️';
    if (cat === 'club') return '🎯';
    return '📅';
  }

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
    const btnUserAuthToggle = document.getElementById('btnUserAuthToggle');

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
    if (btnUserAuthToggle) {
      if (state.user && state.user.isLoggedIn) {
        btnUserAuthToggle.textContent = `👤 ${state.user.username}님 (로그아웃)`;
      } else {
        btnUserAuthToggle.textContent = '👤 로그인/가입';
      }
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

    const myPlan = task.myPlan || { targetDate: '', planMemo: '' };
    let targetDdayHtml = '';
    if (myPlan.targetDate) {
      const tDiff = store.getDDay(myPlan.targetDate, todayStr);
      const tLabel = tDiff === 0 ? '오늘 목표일!' : tDiff > 0 ? `목표 D-${tDiff}` : `목표 D+${Math.abs(tDiff)}`;
      targetDdayHtml = `<span class="target-dday-badge">🎯 내 목표일: ${escapeHtml(myPlan.targetDate.slice(5))} (${tLabel})</span>`;
    } else {
      targetDdayHtml = `<span style="font-size:0.72rem;color:var(--text-muted);">미설정 (자동 추천 가능)</span>`;
    }

    const myPlanBoxHtml = `
      <div class="my-plan-box">
        <div class="my-plan-header">
          <div class="my-plan-title">
            <span>🗓️ 내 완료 계획</span>
            ${targetDdayHtml}
          </div>
          <div style="display:flex;gap:4px;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="auto-plan" data-id="${escapeHtml(task.id)}" style="font-size:0.72rem;padding:4px 8px;">
              ✨ 자동 계획 추천
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="open-plan" data-id="${escapeHtml(task.id)}" style="font-size:0.72rem;padding:4px 8px;">
              ✏️ 계획 수정
            </button>
          </div>
        </div>
        ${
          myPlan.planMemo
            ? `<div class="my-plan-memo-view">${escapeHtml(myPlan.planMemo)}</div>`
            : ''
        }
      </div>
    `;

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
          📅 마감/실시: ${escapeHtml(task.dueDate)} (${periodText})
        </div>

        ${task.memo ? `<div class="task-memo">${escapeHtml(task.memo)}</div>` : ''}
        ${myPlanBoxHtml}
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

    container.querySelectorAll('[data-action="auto-plan"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const generated = store.generateRecommendedPlan(id);
        if (generated) {
          showToast('✨ 마감일 기준 3단계 맞춤 공부 계획이 생성되었습니다!');
        }
      });
    });

    container.querySelectorAll('[data-action="open-plan"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openMyTaskPlanModal(id);
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

  function getAcadPillClass(category) {
    if (category === 'holiday') return 'acad-holiday';
    if (category === 'exam') return 'acad-exam';
    if (category === 'club') return 'acad-club';
    return 'acad-event';
  }

  function getAcadIcon(category) {
    if (category === 'holiday') return '🔴';
    if (category === 'exam') return '✏️';
    if (category === 'club') return '🎯';
    return '🏫';
  }

  // ==========================================================================
  // 3. 탭 1: 수행평가 & 학사일정 (캘린더 + 우측 체크리스트)
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

        const acadEvents = store.getAcademicEventsOnDate(dateStr);
        const isHoliday = acadEvents.some((ev) => ev.category === 'holiday');

        const acadPillsHtml = acadEvents
          .slice(0, 2)
          .map((ev) => {
            const cls = getAcadPillClass(ev.category);
            const icon = getAcadIcon(ev.category);
            return `
              <div class="cal-acad-pill ${cls}" title="${escapeHtml(ev.title)}">
                ${icon} ${escapeHtml(ev.title)}
              </div>
            `;
          })
          .join('');

        const dayTasks = assessments.filter((a) => a.dueDate === dateStr);
        const maxTaskPills = Math.max(1, 3 - acadEvents.slice(0, 2).length);
        const pillsHtml = dayTasks
          .slice(0, maxTaskPills)
          .map((t) => {
            const subj = store.getSubjectById(t.subjectId) || { name: '기타', color: '#64748B' };
            return `
              <div class="cal-task-pill ${t.status === 'done' ? 'is-done' : ''}" style="background:${subj.color}">
                ${escapeHtml(subj.name)} · ${escapeHtml(t.title)}
              </div>
            `;
          })
          .join('');
        const hiddenCount = dayTasks.length - maxTaskPills + Math.max(0, acadEvents.length - 2);
        const moreHtml =
          hiddenCount > 0
            ? `<div style="font-size:0.65rem;color:var(--text-sub);font-weight:700;">+${hiddenCount}건</div>`
            : '';

        cellsHtml += `
          <div class="cal-cell ${isCurrentMonth ? '' : 'other-month'} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-date="${dateStr}">
            <div class="cal-date-row">
              <span style="${isHoliday ? 'color:var(--accent-red);font-weight:900;' : ''}">${cellDt.getDate()}</span>
              ${isToday ? '<span class="today-tag">오늘</span>' : ''}
            </div>
            <div class="cal-task-list">
              ${acadPillsHtml}
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
        const acadEvents = store.getAcademicEventsOnDate(dStr);
        const dayTasks = assessments.filter((a) => a.dueDate === dStr);

        const acadHtml = acadEvents
          .map((ev) => {
            const cls = getAcadPillClass(ev.category);
            const icon = getAcadIcon(ev.category);
            return `<span class="cal-acad-pill ${cls}" style="display:inline-block;margin-right:4px;margin-top:4px;">${icon} ${escapeHtml(ev.title)}</span>`;
          })
          .join('');

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
            : acadEvents.length === 0
              ? '<div style="font-size:0.76rem;color:var(--text-muted);">예정된 일정 없음</div>'
              : '';

        rowsHtml += `
          <div class="week-day-row ${isSelected ? 'is-selected' : ''}" data-date="${dStr}">
            <div class="week-day-header">
              <div class="week-day-title">
                <span>${formatKoreanDate(dStr)}</span>
                ${isToday ? '<span class="today-tag">오늘</span>' : ''}
              </div>
            </div>
            ${acadHtml ? `<div style="margin-bottom:4px;">${acadHtml}</div>` : ''}
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

    const acadEvents = store.getAcademicEventsOnDate(selectedDate);

    let dayInfoHtml = '';
    if (acadEvents.length > 0) {
      dayInfoHtml += `<div class="day-info-stack">`;
      acadEvents.forEach((ev) => {
        const icon = getAcadIcon(ev.category);
        const delBtn = state.ui.isAdmin
          ? `<button type="button" class="btn btn-danger btn-sm" style="padding:2px 6px;font-size:0.68rem;" data-del-acad="${escapeHtml(ev.id)}">삭제</button>`
          : '';
        dayInfoHtml += `
          <div class="acad-day-banner">
            <div>
              <div class="acad-title">${icon} [학사일정] ${escapeHtml(ev.title)}</div>
              ${ev.memo ? `<div style="font-size:0.74rem;color:var(--text-sub);margin-top:2px;">${escapeHtml(ev.memo)}</div>` : ''}
            </div>
            ${delBtn}
          </div>
        `;
      });
      dayInfoHtml += `</div>`;
    }

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

    let html = dayInfoHtml;

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

    tasksBox.querySelectorAll('[data-del-acad]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-acad');
        if (window.confirm('이 학사일정을 삭제하시겠습니까?')) {
          try {
            await store.adminDeleteAcademicEvent(id);
            showToast('학사일정이 삭제되었습니다.');
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });
  }

  // ==========================================================================
  // 4. 탭 2: 시간표 렌더링 (주간 날짜 연동 + 학사일정 자동 오버레이)
  // ==========================================================================
  function renderFullTimetable(state) {
    const container = document.getElementById('fullTimetableContainer');
    const descEl = document.getElementById('timetableSubDesc');
    const weekLabelEl = document.getElementById('timetableWeekLabel');
    if (!container) return;

    const isAdmin = !!state.ui.isAdmin;
    if (descEl) {
      descEl.textContent = isAdmin
        ? '관리자 모드: 교시 칸을 클릭하면 수행평가를 추가하거나 임시 시간표 변경(🔄 변경됨)을 표시할 수 있습니다.'
        : '주간 학사일정(재량휴업일·동아리·정기고사)과 진행 중인 수행평가가 시간표에 함께 표시됩니다.';
    }

    const todayStr = getTodayStr();
    const todayWIdx = getWeekdayIndex(todayStr);
    const weekOffset = Number(state.ui.timetableWeekOffset || 0);
    const baseMondayStr = addDaysStr(todayStr, -todayWIdx + weekOffset * 7);
    const baseFridayStr = addDaysStr(baseMondayStr, 4);

    if (weekLabelEl) {
      weekLabelEl.textContent = `${baseMondayStr.slice(5).replace('-', '/')} (월) ~ ${baseFridayStr.slice(5).replace('-', '/')} (금)`;
    }

    const weekDates = [0, 1, 2, 3, 4].map((w) => addDaysStr(baseMondayStr, w));

    const periodTimes = state.schoolInfo.periodTimes || [
      '1(09:00)', '2(09:55)', '3(10:50)', '4(11:45)',
      '5(13:20)', '6(14:15)', '7(15:10)'
    ];

    let rowsHtml = '';
    for (let p = 1; p <= 7; p++) {
      const pTimeLabel = periodTimes[p - 1] || `${p}교시`;
      let colsHtml = '';

      for (let w = 0; w <= 4; w++) {
        const colDateStr = weekDates[w];
        const isTodayCol = colDateStr === todayStr;
        const key = `${w}-${p}`;
        const cell = state.timetable[key];
        const dayAcad = store.getAcademicEventsOnDate(colDateStr);
        const holidayEv = dayAcad.find((e) => e.category === 'holiday');
        const clubEv = dayAcad.find((e) => e.category === 'club' && p >= 5);
        const examEv = dayAcad.find((e) => e.category === 'exam');

        if (holidayEv) {
          colsHtml += `
            <td class="tt-cell ${isTodayCol ? 'today-col' : ''}" data-w="${w}" data-p="${p}" data-date="${colDateStr}" style="background:#FEF2F2;">
              <span class="tt-special-event" style="background:#FEE2E2;color:#DC2626;border-color:#FECACA;">
                🔴 ${escapeHtml(holidayEv.title)}
              </span>
            </td>
          `;
          continue;
        }

        if (clubEv) {
          colsHtml += `
            <td class="tt-cell ${isTodayCol ? 'today-col' : ''}" data-w="${w}" data-p="${p}" data-date="${colDateStr}" style="background:#F0FDFA;">
              <span class="tt-special-event" style="background:#CCFBF1;color:#0F766E;border-color:#99F6E4;">
                🎯 ${escapeHtml(clubEv.title)}
              </span>
            </td>
          `;
          continue;
        }

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

          const changedBadgeHtml = cell.changed
            ? `<div><span class="tt-changed-badge">🔄 변경됨</span></div>`
            : '';

          const examOverlayHtml = examEv
            ? `<div><span class="tt-special-event">✏️ ${escapeHtml(examEv.title)}</span></div>`
            : '';

          colsHtml += `
            <td class="tt-cell ${isTodayCol ? 'today-col' : ''}" data-w="${w}" data-p="${p}" data-date="${colDateStr}" data-group="${escapeHtml(subjObj.group || '')}">
              <span class="tt-subj-badge" style="background:${subjObj.color}">
                ${escapeHtml(cell.subject)}
              </span>
              ${changedBadgeHtml}
              ${examOverlayHtml}
              ${taskBadgeHtml}
            </td>
          `;
        } else {
          colsHtml += `
            <td class="tt-cell ${isTodayCol ? 'today-col' : ''}" data-w="${w}" data-p="${p}" data-date="${colDateStr}" data-group="">
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
      <table class="timetable-grid">
        <thead>
          <tr>
            <th>교시</th>
            ${[0, 1, 2, 3, 4]
              .map((w) => {
                const dStr = weekDates[w];
                const isTodayCol = dStr === todayStr;
                return `<th class="${isTodayCol ? 'today-col' : ''}">${WEEKDAY_LABELS[w]}요일 <span style="font-weight:600;font-size:0.74rem;color:var(--text-sub);">(${dStr.slice(5).replace('-', '/')})</span></th>`;
              })
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
        const dStr = td.getAttribute('data-date');
        if (store.state.ui.isAdmin) {
          openTimetableCellModal(w, p, dStr);
        } else if (grp) {
          store.setUI({ activeTab: 'calendar', filterSubjectId: 'group:' + grp });
        }
      });
    });
  }

  // ==========================================================================
  // 4-B. 탭 4: 커뮤니티 Beta 렌더링 (학급 소통 & 제작자 피드백)
  // ==========================================================================
  function renderCommunityTab(state) {
    const listContainer = document.getElementById('communityPostList');
    if (!listContainer) return;

    const currentCat = state.ui.communityCategory || 'all';
    document.querySelectorAll('[data-comm-cat]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-comm-cat') === currentCat);
    });

    const isAdmin = !!state.ui.isAdmin;
    const currentNick =
      (state.user && state.user.username) ||
      (state.currentUser && state.currentUser.nickname) ||
      '';

    const catAliases = {
      qna: ['qna', '질문/수행공유'],
      feedback: ['feedback', '제작자 피드백'],
      free: ['free', '자유소통'],
      notice: ['notice', '공지']
    };

    let posts = (state.communityPosts || []).slice();
    if (currentCat !== 'all') {
      const allowed = catAliases[currentCat] || [currentCat];
      posts = posts.filter((p) => allowed.includes(p.category));
    }

    if (posts.length === 0) {
      listContainer.innerHTML = `<div class="empty-state">아직 작성된 게시글이 없습니다. 첫 글을 남겨보세요!</div>`;
      return;
    }

    const catMeta = {
      notice: { label: '📢 공지', cls: 'post-cat-notice' },
      공지: { label: '📢 공지', cls: 'post-cat-notice' },
      qna: { label: '🙋 질문/수행공유', cls: 'post-cat-qna' },
      '질문/수행공유': { label: '🙋 질문/수행공유', cls: 'post-cat-qna' },
      feedback: { label: '💌 제작자 피드백', cls: 'post-cat-feedback' },
      '제작자 피드백': { label: '💌 제작자 피드백', cls: 'post-cat-feedback' },
      free: { label: '💬 자유소통', cls: 'post-cat-free' },
      자유소통: { label: '💬 자유소통', cls: 'post-cat-free' }
    };

    const statusMeta = {
      reviewing: { label: '🔍 검토중', cls: 'status-reviewing', code: 'reviewing' },
      검토중: { label: '🔍 검토중', cls: 'status-reviewing', code: 'reviewing' },
      answered: { label: '💬 답변완료', cls: 'status-answered', code: 'answered' },
      답변완료: { label: '💬 답변완료', cls: 'status-answered', code: 'answered' },
      applied: { label: '✅ 반영완료', cls: 'status-applied', code: 'applied' },
      반영완료: { label: '✅ 반영완료', cls: 'status-applied', code: 'applied' }
    };

    listContainer.innerHTML = posts
      .map((post) => {
        const postAuthor = post.author || post.nickname || '익명';
        const isPinned = !!(post.isPinned || post.pinned);
        const rawStatus = post.feedbackStatus || post.status || '';
        const cm = catMeta[post.category] || catMeta.free;
        const sm = rawStatus && statusMeta[rawStatus] ? statusMeta[rawStatus] : null;
        const canDelete = isAdmin || (currentNick && postAuthor === currentNick);

        const adminControlsHtml = isAdmin
          ? `
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              <button type="button" class="btn btn-secondary btn-sm" data-pin-post="${escapeHtml(post.id)}" data-pinned="${isPinned ? '1' : '0'}">
                ${isPinned ? '📌 고정해제' : '📌 공지고정'}
              </button>
              <select class="select-input" style="font-size:0.72rem;padding:2px 6px;" data-status-post="${escapeHtml(post.id)}">
                <option value="" ${!sm ? 'selected' : ''}>상태 없음</option>
                <option value="검토중" ${sm && sm.code === 'reviewing' ? 'selected' : ''}>검토중</option>
                <option value="답변완료" ${sm && sm.code === 'answered' ? 'selected' : ''}>답변완료</option>
                <option value="반영완료" ${sm && sm.code === 'applied' ? 'selected' : ''}>반영완료</option>
              </select>
            </div>
          `
          : '';

        const comments = Array.isArray(post.comments) ? post.comments : [];
        const commentsHtml = comments
          .map(
            (c) => `
              <div class="comment-item">
                <div>
                  <span class="comment-author">${escapeHtml(c.author || c.nickname || '익명')}</span>
                  <span class="comment-text">${escapeHtml(c.text || c.content || '')}</span>
                </div>
                <span class="comment-time">${escapeHtml((c.createdAt || '').slice(0, 16))}</span>
              </div>
            `
          )
          .join('');

        return `
          <article class="post-card ${isPinned ? 'is-pinned' : ''}">
            <div class="post-header">
              <div class="post-meta-left">
                ${isPinned ? `<span class="post-cat-badge post-cat-notice">📌 고정</span>` : ''}
                <span class="post-cat-badge ${cm.cls}">${cm.label}</span>
                ${sm ? `<span class="feedback-status-badge ${sm.cls}">${sm.label}</span>` : ''}
                <span class="post-author">${escapeHtml(postAuthor)}</span>
                <span class="post-date">${escapeHtml((post.createdAt || '').slice(0, 16))}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                ${adminControlsHtml}
                ${
                  canDelete
                    ? `<button type="button" class="btn btn-danger btn-sm" data-del-post="${escapeHtml(post.id)}">삭제</button>`
                    : ''
                }
              </div>
            </div>
            <div class="post-title">${escapeHtml(post.title)}</div>
            <div class="post-content">${escapeHtml(post.content)}</div>
            <div class="post-footer">
              <button type="button" class="btn-like" data-like-post="${escapeHtml(post.id)}">
                👍 공감 <strong>${Number(post.likes || 0)}</strong>
              </button>
              <span style="font-size:0.75rem;color:var(--text-sub);font-weight:700;">
                💬 댓글 ${comments.length}개
              </span>
            </div>
            <div class="comments-section">
              ${commentsHtml}
              <form class="comment-form" data-comment-form="${escapeHtml(post.id)}">
                <input type="text" class="form-input" style="padding:6px 10px;font-size:0.8rem;" placeholder="${
                  currentNick
                    ? `${escapeHtml(currentNick)} 이름으로 댓글 남기기...`
                    : '댓글을 작성하려면 먼저 로그인해 주세요...'
                }" maxlength="300" required />
                <button type="submit" class="btn btn-primary btn-sm">등록</button>
              </form>
            </div>
          </article>
        `;
      })
      .join('');

    listContainer.querySelectorAll('[data-like-post]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = btn.getAttribute('data-like-post');
        try {
          await store.likeCommunityPost(postId);
        } catch (err) {
          alert(err.message);
        }
      });
    });

    listContainer.querySelectorAll('[data-del-post]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = btn.getAttribute('data-del-post');
        if (window.confirm('이 게시글을 삭제하시겠습니까?')) {
          try {
            await store.deleteCommunityPost(postId);
            showToast('게시글이 삭제되었습니다.');
          } catch (err) {
            alert(err.message);
          }
        }
      });
    });

    listContainer.querySelectorAll('[data-pin-post]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = btn.getAttribute('data-pin-post');
        const currentlyPinned = btn.getAttribute('data-pinned') === '1';
        try {
          await store.adminUpdateCommunityPostStatus(postId, { pinned: !currentlyPinned });
          showToast(!currentlyPinned ? '📌 상단에 고정되었습니다.' : '고정이 해제되었습니다.');
        } catch (err) {
          alert(err.message);
        }
      });
    });

    listContainer.querySelectorAll('[data-status-post]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const postId = sel.getAttribute('data-status-post');
        try {
          await store.adminUpdateCommunityPostStatus(postId, { status: sel.value });
          showToast('피드백 상태가 변경되었습니다.');
        } catch (err) {
          alert(err.message);
        }
      });
    });

    listContainer.querySelectorAll('[data-comment-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const postId = form.getAttribute('data-comment-form');
        const inp = form.querySelector('input');
        const content = inp ? inp.value.trim() : '';
        if (!content) return;
        try {
          await store.addCommunityComment(postId, { content });
          if (inp) inp.value = '';
          showToast('💬 댓글이 등록되었습니다.');
        } catch (err) {
          alert(err.message);
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

  function openTimetableCellModal(weekdayIdx, period, dateOverride) {
    if (!store.state.ui.isAdmin) return;
    const modal = document.getElementById('modalTimetableCell');
    if (!modal) return;
    const key = `${weekdayIdx}-${period}`;
    const cell = store.state.timetable[key] || { subject: '', changed: false };
    const nextDateStr = dateOverride || getNextDateForWeekday(getTodayStr(), weekdayIdx);

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
    const chkChanged = document.getElementById('chkCellChanged');
    if (chkChanged) chkChanged.checked = !!cell.changed;
    modal.classList.add('open');
  }

  function openMyTaskPlanModal(taskId) {
    const task = store.state.rawAssessments.find((a) => a.id === taskId);
    if (!task) return;
    const modal = document.getElementById('modalMyTaskPlan');
    if (!modal) return;

    const myPlan = store.getTaskPlan(taskId);
    const subj = store.getSubjectById(task.subjectId) || { name: '과목' };

    document.getElementById('inputMyPlanTaskId').value = task.id;
    document.getElementById('myPlanTaskTitleLabel').textContent = `[${subj.name}] ${task.title} (마감: ${task.dueDate})`;
    document.getElementById('inputMyPlanTargetDate').value =
      myPlan.targetDate || addDaysStr(task.dueDate, -1);
    document.getElementById('inputMyPlanSteps').value = Array.isArray(myPlan.steps)
      ? myPlan.steps.join('\n')
      : '';
    document.getElementById('inputMyPlanMemo').value = myPlan.memo || '';

    modal.classList.add('open');
  }

  function openUserAuthModal(mode = 'login') {
    const modal = document.getElementById('modalUserAuth');
    if (!modal) return;
    modal.setAttribute('data-auth-mode', mode);
    const titleEl = document.getElementById('modalUserAuthTitle');
    const submitBtn = document.getElementById('btnSubmitUserAuth');
    const switchBtn = document.getElementById('btnSwitchAuthMode');
    if (titleEl) {
      titleEl.textContent =
        mode === 'register'
          ? '🔐 학생 간편 회원가입 (맞춤 계획 저장)'
          : '🔐 학생 로그인 (내 계획 불러오기)';
    }
    if (submitBtn) {
      submitBtn.textContent = mode === 'register' ? '가입하고 시작하기' : '로그인';
    }
    if (switchBtn) {
      switchBtn.textContent =
        mode === 'register'
          ? '이미 아이디가 있나요? 로그인하기'
          : '처음 오셨나요? 10초 간편 회원가입';
    }
    document.getElementById('inputUserNickname').value = '';
    document.getElementById('inputUserPassword').value = '';
    modal.classList.add('open');
  }

  function openAcademicEventModal(prefillDate) {
    if (!store.state.ui.isAdmin) return;
    const modal = document.getElementById('modalAcademicEvent');
    if (!modal) return;
    document.getElementById('inputAcadTitle').value = '';
    document.getElementById('inputAcadCategory').value = 'event';
    document.getElementById('inputAcadStartDate').value =
      prefillDate || store.state.ui.selectedDate || getTodayStr();
    document.getElementById('inputAcadEndDate').value =
      prefillDate || store.state.ui.selectedDate || getTodayStr();
    document.getElementById('inputAcadMemo').value = '';
    modal.classList.add('open');
  }

  function openCommunityWriteModal() {
    const modal = document.getElementById('modalCommunityWrite');
    if (!modal) return;
    document.getElementById('inputCommCategory').value = 'qna';
    document.getElementById('inputCommTitle').value = '';
    document.getElementById('inputCommContent').value = '';
    const nickInput = document.getElementById('inputCommNickname');
    if (nickInput) {
      nickInput.value = store.state.currentUser ? store.state.currentUser.nickname : '';
    }
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
    const viewComm = document.getElementById('viewCommunity');
    if (viewComm) {
      viewComm.style.display = activeTab === 'community' ? 'block' : 'none';
    }

    if (activeTab === 'calendar') {
      renderCalendarTab(state);
    } else if (activeTab === 'timetable') {
      renderFullTimetable(state);
    } else if (activeTab === 'grades') {
      renderGradeReportTab(state);
    } else if (activeTab === 'community') {
      renderCommunityTab(state);
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

    // 학생 로그인/회원가입 모달
    const btnUserAuthToggle = document.getElementById('btnUserAuthToggle');
    if (btnUserAuthToggle) {
      btnUserAuthToggle.addEventListener('click', () => {
        if (store.state.currentUser) {
          if (
            window.confirm(
              `'${store.state.currentUser.nickname}' 계정에서 로그아웃하시겠습니까?\n(저장된 맞춤 계획과 체크 내역은 계정에 안전하게 보관됩니다.)`
            )
          ) {
            store.logoutUser();
            showToast('로그아웃되었습니다.');
          }
        } else {
          openUserAuthModal('login');
        }
      });
    }

    const btnCloseUserAuth = document.getElementById('btnCloseUserAuth');
    if (btnCloseUserAuth) {
      btnCloseUserAuth.addEventListener('click', () => {
        document.getElementById('modalUserAuth').classList.remove('open');
      });
    }

    const btnSwitchAuthMode = document.getElementById('btnSwitchAuthMode');
    if (btnSwitchAuthMode) {
      btnSwitchAuthMode.addEventListener('click', () => {
        const modal = document.getElementById('modalUserAuth');
        const curMode = modal.getAttribute('data-auth-mode') || 'login';
        openUserAuthModal(curMode === 'login' ? 'register' : 'login');
      });
    }

    const formUserAuth = document.getElementById('formUserAuth');
    if (formUserAuth) {
      formUserAuth.addEventListener('submit', async (e) => {
        e.preventDefault();
        const modal = document.getElementById('modalUserAuth');
        const mode = modal.getAttribute('data-auth-mode') || 'login';
        const nick = document.getElementById('inputUserNickname').value.trim();
        const pw = document.getElementById('inputUserPassword').value.trim();
        try {
          if (mode === 'register') {
            await store.registerUser(nick, pw);
            showToast(`🎉 환영합니다, ${nick}님! 이제 맞춤 수행평가 계획이 자동 동기화됩니다.`);
          } else {
            await store.loginUser(nick, pw);
            showToast(`👋 반갑습니다, ${nick}님! 저장된 맞춤 계획을 불러왔습니다.`);
          }
          modal.classList.remove('open');
        } catch (err) {
          alert(err.message);
        }
      });
    }

    // 내 맞춤 완료 계획 모달
    const btnCloseMyTaskPlan = document.getElementById('btnCloseMyTaskPlan');
    if (btnCloseMyTaskPlan) {
      btnCloseMyTaskPlan.addEventListener('click', () => {
        document.getElementById('modalMyTaskPlan').classList.remove('open');
      });
    }

    const btnAutoRecommendInModal = document.getElementById('btnAutoRecommendInModal');
    if (btnAutoRecommendInModal) {
      btnAutoRecommendInModal.addEventListener('click', () => {
        const taskId = document.getElementById('inputMyPlanTaskId').value;
        const plan = store.generateRecommendedPlan(taskId);
        if (plan) {
          document.getElementById('inputMyPlanTargetDate').value = plan.targetDate;
          document.getElementById('inputMyPlanSteps').value = (plan.steps || []).join('\n');
          document.getElementById('inputMyPlanMemo').value = plan.memo || '';
          showToast('✨ 마감일 기준 3단계 추천 계획이 채워졌습니다!');
        }
      });
    }

    const formMyTaskPlan = document.getElementById('formMyTaskPlan');
    if (formMyTaskPlan) {
      formMyTaskPlan.addEventListener('submit', (e) => {
        e.preventDefault();
        const taskId = document.getElementById('inputMyPlanTaskId').value;
        const targetDate = document.getElementById('inputMyPlanTargetDate').value;
        const stepsRaw = document.getElementById('inputMyPlanSteps').value;
        const memo = document.getElementById('inputMyPlanMemo').value.trim();
        const steps = stepsRaw
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        store.saveTaskPlan(taskId, { targetDate, steps, memo });
        document.getElementById('modalMyTaskPlan').classList.remove('open');
        showToast(
          store.state.currentUser
            ? '🎯 내 맞춤 수행평가 계획이 계정에 저장되었습니다!'
            : '🎯 내 맞춤 계획이 저장되었습니다! (로그인하면 다른 기기에서도 유지됩니다)'
        );
      });
    }

    // 학사일정 추가 모달 (관리자)
    const btnAdminAddAcadEvent = document.getElementById('btnAdminAddAcadEvent');
    if (btnAdminAddAcadEvent) {
      btnAdminAddAcadEvent.addEventListener('click', () => {
        openAcademicEventModal(store.state.ui.selectedDate);
      });
    }

    const btnCloseAcadModal = document.getElementById('btnCloseAcadModal');
    if (btnCloseAcadModal) {
      btnCloseAcadModal.addEventListener('click', () => {
        document.getElementById('modalAcademicEvent').classList.remove('open');
      });
    }

    const formAcademicEvent = document.getElementById('formAcademicEvent');
    if (formAcademicEvent) {
      formAcademicEvent.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('inputAcadTitle').value.trim();
        const category = document.getElementById('inputAcadCategory').value;
        const startDate = document.getElementById('inputAcadStartDate').value;
        const endDate = document.getElementById('inputAcadEndDate').value || startDate;
        const memo = document.getElementById('inputAcadMemo').value.trim();
        try {
          await store.adminSaveAcademicEvent({ title, category, startDate, endDate, memo });
          document.getElementById('modalAcademicEvent').classList.remove('open');
          showToast('📅 학사일정이 등록되었습니다.');
        } catch (err) {
          alert(err.message);
        }
      });
    }

    // 시간표 주간 이동 버튼
    const btnTtPrevWeek = document.getElementById('btnTtPrevWeek');
    const btnTtThisWeek = document.getElementById('btnTtThisWeek');
    const btnTtNextWeek = document.getElementById('btnTtNextWeek');
    if (btnTtPrevWeek) {
      btnTtPrevWeek.addEventListener('click', () => {
        store.setUI({ timetableWeekOffset: (store.state.ui.timetableWeekOffset || 0) - 1 });
      });
    }
    if (btnTtThisWeek) {
      btnTtThisWeek.addEventListener('click', () => {
        store.setUI({ timetableWeekOffset: 0 });
      });
    }
    if (btnTtNextWeek) {
      btnTtNextWeek.addEventListener('click', () => {
        store.setUI({ timetableWeekOffset: (store.state.ui.timetableWeekOffset || 0) + 1 });
      });
    }

    // 커뮤니티 Beta 이벤트
    document.querySelectorAll('[data-comm-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setUI({ communityCategory: btn.getAttribute('data-comm-cat') });
      });
    });

    const btnOpenCommWrite = document.getElementById('btnOpenCommWrite');
    if (btnOpenCommWrite) {
      btnOpenCommWrite.addEventListener('click', openCommunityWriteModal);
    }

    const btnCloseCommWrite = document.getElementById('btnCloseCommWrite');
    if (btnCloseCommWrite) {
      btnCloseCommWrite.addEventListener('click', () => {
        document.getElementById('modalCommunityWrite').classList.remove('open');
      });
    }

    const formCommunityWrite = document.getElementById('formCommunityWrite');
    if (formCommunityWrite) {
      formCommunityWrite.addEventListener('submit', async (e) => {
        e.preventDefault();
        const category = document.getElementById('inputCommCategory').value;
        const title = document.getElementById('inputCommTitle').value.trim();
        const content = document.getElementById('inputCommContent').value.trim();
        const nickname = document.getElementById('inputCommNickname').value.trim();
        try {
          await store.createCommunityPost({ category, title, content, nickname });
          document.getElementById('modalCommunityWrite').classList.remove('open');
          showToast('💬 게시글이 등록되었습니다!');
        } catch (err) {
          alert(err.message);
        }
      });
    }

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
      const chkChanged = document.getElementById('chkCellChanged');
      const changed = chkChanged ? chkChanged.checked : false;
      try {
        await store.adminUpdateTimetableCell(
          activeCellModalContext.weekdayIdx,
          activeCellModalContext.period,
          newSub,
          changed
        );
        document.getElementById('modalTimetableCell').classList.remove('open');
        showToast('시간표가 수정되었습니다.');
      } catch (err) {
        alert(err.message);
      }
    });

    // 설문조사 유도 모달 (3분마다 표시, 설문 링크 클릭 시 영구 종료)
    const modalSurvey = document.getElementById('modalSurveyPrompt');
    const btnCloseSurvey = document.getElementById('btnCloseSurveyModal');
    const btnGoSurvey = document.getElementById('btnGoSurveyModal');
    const btnHeaderSurvey = document.getElementById('btnHeaderSurvey');
    let surveyTimerId = null;

    function completeSurveyAndStopTimer() {
      store.markSurveyCompleted();
      if (surveyTimerId) {
        clearInterval(surveyTimerId);
        surveyTimerId = null;
      }
      if (modalSurvey) {
        modalSurvey.classList.remove('open');
      }
      showToast('🙏 설문에 참여해 주셔서 감사합니다! 더 이상 설문 알림이 뜨지 않습니다.');
    }

    if (btnCloseSurvey && modalSurvey) {
      btnCloseSurvey.addEventListener('click', () => {
        modalSurvey.classList.remove('open');
      });
    }
    if (btnGoSurvey) {
      btnGoSurvey.addEventListener('click', completeSurveyAndStopTimer);
    }
    if (btnHeaderSurvey) {
      btnHeaderSurvey.addEventListener('click', completeSurveyAndStopTimer);
    }

    if (!store.hasCompletedSurvey()) {
      surveyTimerId = setInterval(() => {
        if (store.hasCompletedSurvey()) {
          clearInterval(surveyTimerId);
          surveyTimerId = null;
          return;
        }
        const termsModal = document.getElementById('modalTermsConsent');
        if (termsModal && termsModal.classList.contains('open')) return;
        if (modalSurvey && !modalSurvey.classList.contains('open')) {
          modalSurvey.classList.add('open');
        }
      }, 180000);
    }

    // 서버 절전 방지 및 DB 자동 복구 동기화 (4분 주기)
    if (window.location.protocol.startsWith('http')) {
      setInterval(() => {
        store.fetchBootstrapFromServer().catch(() => {});
      }, 240000);
    }
  }

  store.subscribe(renderAll);
  initEvents();
  renderAll(store.state);

  if (window.location.protocol.startsWith('http')) {
    store.fetchBootstrapFromServer().catch(() => {});
  }
})();
