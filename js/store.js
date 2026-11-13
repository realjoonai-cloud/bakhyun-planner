/**
 * 백현중학교 1학년 3반 수행평가 플래너 & 예상 성적표 스토어 v3 (store.js)
 * - 학급 공통 데이터(시간표, 평가계획, 수행평가 일정): 서버 SQLite DB (/api/bootstrap)에서 로드
 * - 학생 개인 데이터(데일리 체크, 체크리스트, 내 수행/정기시험 점수): 각자 브라우저 LocalStorage에 저장
 * - 법적 고지 및 사이트 이용 동의 상태 관리
 */
(function (global) {
  'use strict';

  const PERSONAL_STORAGE_KEY = 'suhaeng_baekhyun_1_3_personal_v3';
  const CACHE_STORAGE_KEY = 'suhaeng_baekhyun_1_3_db_cache_v4';
  const ADMIN_SESSION_KEY = 'suhaeng_baekhyun_admin_pw';
  const TERMS_CONSENT_KEY = 'suhaeng_baekhyun_terms_consent_v2';
  const SURVEY_DONE_KEY = 'suhaeng_baekhyun_survey_done_v1';
  const USER_AUTH_STORAGE_KEY = 'suhaeng_baekhyun_user_auth_v4';

  function getTodayStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDaysStr(baseStr, offsetDays) {
    const [y, m, d] = baseStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + offsetDays);
    const ny = dt.getFullYear();
    const nm = String(dt.getMonth() + 1).padStart(2, '0');
    const nd = String(dt.getDate()).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
  }

  function getWeekdayIndex(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const jsDay = new Date(y, m - 1, d).getDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }

  function getNextWeekdayDate(baseStr, targetWeekdayIdx) {
    for (let i = 0; i <= 14; i++) {
      const candidate = addDaysStr(baseStr, i);
      if (getWeekdayIndex(candidate) === targetWeekdayIdx) {
        return candidate;
      }
    }
    return baseStr;
  }

  const FALLBACK_TIMETABLE = {
    '0-1': { subject: '스포', changed: false },
    '0-2': { subject: '체육', changed: false },
    '0-3': { subject: '기가', changed: false },
    '0-4': { subject: '국어B', changed: false },
    '0-5': { subject: '과학C', changed: false },
    '0-6': { subject: '사회A', changed: false },
    '1-1': { subject: '미술', changed: false },
    '1-2': { subject: '진탐', changed: false },
    '1-3': { subject: '수학A', changed: false },
    '1-4': { subject: '영어A', changed: false },
    '1-5': { subject: '과학C', changed: false },
    '1-6': { subject: '도덕', changed: false },
    '1-7': { subject: '체육', changed: false },
    '2-1': { subject: '영어B', changed: false },
    '2-2': { subject: '음악', changed: false },
    '2-3': { subject: '수학A', changed: false },
    '2-4': { subject: '사회A', changed: false },
    '2-5': { subject: '미술', changed: false },
    '2-6': { subject: '국어A', changed: false },
    '3-1': { subject: '국어A', changed: false },
    '3-2': { subject: '과학A', changed: false },
    '3-3': { subject: '수학B', changed: false },
    '3-4': { subject: '음악', changed: false },
    '3-5': { subject: '기가', changed: false },
    '3-6': { subject: '정보', changed: false },
    '4-1': { subject: '영어A', changed: false },
    '4-2': { subject: '체육', changed: false },
    '4-3': { subject: '도덕', changed: false },
    '4-4': { subject: '사회B', changed: false },
    '4-5': { subject: '국어B', changed: false },
    '4-6': { subject: '정보', changed: false }
  };

  const FALLBACK_SUBJECTS = [
    { id: 'sub-korA', name: '국어A', group: '국어', planId: 'plan-kor', color: '#EF4444' },
    { id: 'sub-korB', name: '국어B', group: '국어', planId: 'plan-kor', color: '#F87171' },
    { id: 'sub-mathA', name: '수학A', group: '수학', planId: 'plan-math', color: '#3B82F6' },
    { id: 'sub-mathB', name: '수학B', group: '수학', planId: 'plan-math', color: '#60A5FA' },
    { id: 'sub-engA', name: '영어A', group: '영어', planId: 'plan-eng', color: '#F59E0B' },
    { id: 'sub-engB', name: '영어B', group: '영어', planId: 'plan-eng', color: '#FBBF24' },
    { id: 'sub-sciA', name: '과학A', group: '과학', planId: 'plan-sci', color: '#8B5CF6' },
    { id: 'sub-sciC', name: '과학C', group: '과학', planId: 'plan-sci', color: '#A78BFA' },
    { id: 'sub-socA', name: '사회A', group: '사회', planId: 'plan-soc', color: '#10B981' },
    { id: 'sub-socB', name: '사회B', group: '사회', planId: 'plan-soc', color: '#34D399' },
    { id: 'sub-eth', name: '도덕', group: '도덕', planId: 'plan-eth', color: '#14B8A6' },
    { id: 'sub-tech', name: '기가', group: '기술·가정', planId: 'plan-tech', color: '#EC4899' },
    { id: 'sub-info', name: '정보', group: '정보', planId: 'plan-info', color: '#06B6D4' },
    { id: 'sub-pe', name: '체육', group: '체육', planId: 'plan-pe', color: '#F97316' },
    { id: 'sub-mus', name: '음악', group: '음악', planId: 'plan-mus', color: '#6366F1' },
    { id: 'sub-art', name: '미술', group: '미술', planId: 'plan-art', color: '#D946EF' },
    { id: 'sub-car', name: '진탐', group: '기타', planId: '', color: '#84CC16' },
    { id: 'sub-spo', name: '스포', group: '체육', planId: '', color: '#FB923C' }
  ];

  const FALLBACK_SUBJECT_PLANS = [
    {
      id: 'plan-kor', name: '국어', color: '#EF4444', credits: 4,
      exam1Ratio: 50, exam2Ratio: 0, perfRatio: 50, gradeScale: '5tier', sortOrder: 1,
      areas: [
        { id: 'kor-1', name: '영역① 단어의 짜임 분석하기', weight: 20 },
        { id: 'kor-2', name: '영역② 존중하는 언어 생활 프로젝트', weight: 20 },
        { id: 'kor-3', name: '영역③ 책읽기 프로젝트', weight: 10 }
      ]
    },
    {
      id: 'plan-soc', name: '사회', color: '#10B981', credits: 3,
      exam1Ratio: 0, exam2Ratio: 0, perfRatio: 100, gradeScale: '5tier', sortOrder: 2,
      areas: [
        { id: 'soc-1', name: '영역① 민주주의 발전 과정 탐구', weight: 30 },
        { id: 'soc-2', name: '영역② 역할 갈등 사례 분석(논술형)', weight: 20 },
        { id: 'soc-3', name: '영역③ 정치 주체 / 변동 평가영역', weight: 20 },
        { id: 'soc-4', name: '영역④ 생활 속의 법 탐구하기', weight: 30 }
      ]
    },
    {
      id: 'plan-eth', name: '도덕', color: '#14B8A6', credits: 2,
      exam1Ratio: 0, exam2Ratio: 0, perfRatio: 100, gradeScale: '5tier', sortOrder: 3,
      areas: [
        { id: 'eth-1', name: '영역① 도덕 탐구 / 토론·논술 평가', weight: 40 },
        { id: 'eth-2', name: '영역② 인권·평화 연구활동 평가', weight: 40 },
        { id: 'eth-3', name: '영역③ 생명존중 방안탐구', weight: 20 }
      ]
    },
    {
      id: 'plan-math', name: '수학', color: '#3B82F6', credits: 3,
      exam1Ratio: 0, exam2Ratio: 50, perfRatio: 50, gradeScale: '5tier', sortOrder: 4,
      areas: [
        { id: 'math-1', name: '영역① 실생활 속 통계 활용(논술형)', weight: 20 },
        { id: 'math-2', name: '영역② 도형/교과 탐구 평가(변동 가능)', weight: 20 },
        { id: 'math-3', name: '영역③ 학습활동 과정평가', weight: 10 }
      ]
    },
    {
      id: 'plan-sci', name: '과학', color: '#8B5CF6', credits: 3,
      exam1Ratio: 0, exam2Ratio: 50, perfRatio: 50, gradeScale: '5tier', sortOrder: 5,
      areas: [
        { id: 'sci-1', name: '영역① 기체의 성질 스토리보드(논술형)', weight: 10 },
        { id: 'sci-2', name: '영역② 부력 탐구하기(탐구·논술형)', weight: 15 },
        { id: 'sci-3', name: '영역③ 태양계 홍보프로젝트(탐구·논술형)', weight: 25 }
      ]
    },
    {
      id: 'plan-tech', name: '기술·가정', color: '#EC4899', credits: 2,
      exam1Ratio: 0, exam2Ratio: 0, perfRatio: 100, gradeScale: '5tier', sortOrder: 6,
      areas: [
        { id: 'tech-1', name: '영역① 영양소 표현·연구(실습/연구)', weight: 40 },
        { id: 'tech-2', name: '영역② 합리적인 소비 생활(논술형)', weight: 30 },
        { id: 'tech-3', name: '영역③ 기술 제작/실습 평가(변동 가능)', weight: 30 }
      ]
    },
    {
      id: 'plan-pe', name: '체육', color: '#F97316', credits: 3,
      exam1Ratio: 0, exam2Ratio: 0, perfRatio: 100, gradeScale: '3tier', sortOrder: 7,
      areas: [
        { id: 'pe-1', name: '영역① 체력/기초 실기 평가', weight: 25 },
        { id: 'pe-2', name: '영역② 구기/스포츠 실기 평가', weight: 25 },
        { id: 'pe-3', name: '영역③ 축구 리프팅', weight: 25 },
        { id: 'pe-4', name: '영역④ 영역형 경쟁스포츠 논술', weight: 25 }
      ]
    },
    {
      id: 'plan-mus', name: '음악', color: '#6366F1', credits: 2,
      exam1Ratio: 0, exam2Ratio: 0, perfRatio: 100, gradeScale: '3tier', sortOrder: 8,
      areas: [
        { id: 'mus-1', name: '영역① 난타 연주하기', weight: 30 },
        { id: 'mus-2', name: '영역② 리코더 연주하기', weight: 30 },
        { id: 'mus-3', name: '영역③ 음악 감상하기', weight: 20 },
        { id: 'mus-4', name: '영역④ 음악이 갖는 의미와 역할 설명', weight: 20 }
      ]
    },
    {
      id: 'plan-art', name: '미술', color: '#D946EF', credits: 2,
      exam1Ratio: 0, exam2Ratio: 0, perfRatio: 100, gradeScale: '3tier', sortOrder: 9,
      areas: [
        { id: 'art-1', name: '영역① 표현 활동 평가 1', weight: 25 },
        { id: 'art-2', name: '영역② 표현 활동 평가 2', weight: 25 },
        { id: 'art-3', name: '영역③ 디자인 표현 평가', weight: 25 },
        { id: 'art-4', name: '영역④ 미술 작품 감상(논술형)', weight: 25 }
      ]
    },
    {
      id: 'plan-eng', name: '영어', color: '#F59E0B', credits: 3,
      exam1Ratio: 50, exam2Ratio: 0, perfRatio: 50, gradeScale: '5tier', sortOrder: 10,
      areas: [
        { id: 'eng-1', name: '영역① 리딩 로그 작성하기(논술형)', weight: 20 },
        { id: 'eng-2', name: '영역② 영어 글쓰기/작문 평가(변동 가능)', weight: 20 },
        { id: 'eng-3', name: '영역③ 희망 직업 소개하기(말하기)', weight: 10 }
      ]
    },
    {
      id: 'plan-info', name: '정보', color: '#06B6D4', credits: 2,
      exam1Ratio: 0, exam2Ratio: 0, perfRatio: 100, gradeScale: '5tier', sortOrder: 11,
      areas: [
        { id: 'info-1', name: '영역① 정보/데이터 영역 평가', weight: 25 },
        { id: 'info-2', name: '영역② 알고리즘 영역 평가', weight: 25 },
        { id: 'info-3', name: '영역③ 프로그래밍 실습', weight: 25 },
        { id: 'info-4', name: '영역④ 인공지능윤리문제(논술형)', weight: 25 }
      ]
    }
  ];

  function buildFallbackAssessments(todayStr) {
    const mon = getNextWeekdayDate(todayStr, 0);
    const tue = getNextWeekdayDate(todayStr, 1);
    const wed = getNextWeekdayDate(todayStr, 2);
    const thu = getNextWeekdayDate(todayStr, 3);
    const fri = getNextWeekdayDate(todayStr, 4);

    return [
      {
        id: 'task-init-1',
        title: '존중하는 언어 생활 프로젝트',
        subjectId: 'sub-korB',
        planId: 'plan-kor',
        areaId: 'kor-2',
        type: '보고서',
        dueDate: mon,
        period: 4,
        weight: 20,
        memo: '월요일 4교시 국어B 수업 시간 내 작성 및 제출',
        subtasks: [
          { id: 'st-1', text: '주제 선정 및 사례 조사' },
          { id: 'st-2', text: '활동지 초안 작성 완료' },
          { id: 'st-3', text: '수업 시간 내 최종 제출' }
        ]
      },
      {
        id: 'task-init-2',
        title: '실생활 속 통계 활용(논술형)',
        subjectId: 'sub-mathA',
        planId: 'plan-math',
        areaId: 'math-1',
        type: '보고서',
        dueDate: tue,
        period: 3,
        weight: 20,
        memo: '화요일 3교시 수학A 시간 실시, 통계 그래프 해석 연습',
        subtasks: [
          { id: 'st-4', text: '교과서 통계 단원 개념 복습' },
          { id: 'st-5', text: '서술형 연습 프린트 풀이' }
        ]
      },
      {
        id: 'task-init-3',
        title: '희망 직업 소개하기(말하기)',
        subjectId: 'sub-engB',
        planId: 'plan-eng',
        areaId: 'eng-3',
        type: '발표',
        dueDate: wed,
        period: 1,
        weight: 10,
        memo: '수요일 1교시 영어B 수업 중 발표 진행',
        subtasks: [
          { id: 'st-6', text: '영어 발표 대본 작성 및 점검' },
          { id: 'st-7', text: '발음 및 1분 스피치 리허설' }
        ]
      },
      {
        id: 'task-init-4',
        title: '인공지능윤리문제(논술형)',
        subjectId: 'sub-info',
        planId: 'plan-info',
        areaId: 'info-4',
        type: '보고서',
        dueDate: thu,
        period: 6,
        weight: 25,
        memo: '목요일 6교시 정보 시간 실시, AI 윤리 딜레마 사례 정리',
        subtasks: [
          { id: 'st-8', text: '인공지능 윤리 가이드라인 핵심 정리' },
          { id: 'st-9', text: '논술형 답안 구조 연습' }
        ]
      },
      {
        id: 'task-init-5',
        title: '생활 속의 법 탐구하기',
        subjectId: 'sub-socB',
        planId: 'plan-soc',
        areaId: 'soc-4',
        type: '보고서',
        dueDate: fri,
        period: 4,
        weight: 30,
        memo: '금요일 4교시 사회B 수업 시간 제출',
        subtasks: [
          { id: 'st-10', text: '생활 속 법률 사례 2가지 조사' },
          { id: 'st-11', text: '탐구 보고서 양식 작성' }
        ]
      }
    ];
  }

  function computeAchievementGrade(score, gradeScale) {
    if (score === null || score === undefined || Number.isNaN(score)) {
      return { grade: '-', cls: 'grade-none', targetA: gradeScale === '3tier' ? 80 : 90 };
    }
    const val = Number(score);
    if (gradeScale === '3tier') {
      if (val >= 80) return { grade: 'A', cls: 'grade-a', targetA: 80 };
      if (val >= 60) return { grade: 'B', cls: 'grade-b', targetA: 80 };
      return { grade: 'C', cls: 'grade-c', targetA: 80 };
    }
    if (val >= 90) return { grade: 'A', cls: 'grade-a', targetA: 90 };
    if (val >= 80) return { grade: 'B', cls: 'grade-b', targetA: 90 };
    if (val >= 70) return { grade: 'C', cls: 'grade-c', targetA: 90 };
    if (val >= 60) return { grade: 'D', cls: 'grade-d', targetA: 90 };
    return { grade: 'E', cls: 'grade-e', targetA: 90 };
  }

  const FALLBACK_ACADEMIC_EVENTS = [
    { id: 'acad-1001', title: '전문직업인특강(1학년)', startDate: '2026-10-01', endDate: '2026-10-01', category: 'event', memo: '1학년 진로 특강' },
    { id: 'acad-1003', title: '개천절', startDate: '2026-10-03', endDate: '2026-10-03', category: 'holiday', memo: '공휴일' },
    { id: 'acad-1005', title: '대체공휴일', startDate: '2026-10-05', endDate: '2026-10-05', category: 'holiday', memo: '공휴일 (수업 없음)' },
    { id: 'acad-1008', title: '정보통신윤리교육', startDate: '2026-10-08', endDate: '2026-10-08', category: 'event', memo: '' },
    { id: 'acad-1009', title: '한글날', startDate: '2026-10-09', endDate: '2026-10-09', category: 'holiday', memo: '공휴일 (수업 없음)' },
    { id: 'acad-1013', title: '인적성검사', startDate: '2026-10-13', endDate: '2026-10-13', category: 'event', memo: '' },
    { id: 'acad-1015', title: '백현제(동아리)', startDate: '2026-10-15', endDate: '2026-10-15', category: 'club', memo: '학교 축제 및 동아리 발표' },
    { id: 'acad-1022', title: '정보통신윤리교육 · 독도의날 행사', startDate: '2026-10-22', endDate: '2026-10-22', category: 'event', memo: '' },
    { id: 'acad-1029', title: '학생자치회 정부회장선거', startDate: '2026-10-29', endDate: '2026-10-29', category: 'event', memo: '' },
    { id: 'acad-1102', title: '학부모상담주간', startDate: '2026-11-02', endDate: '2026-11-06', category: 'event', memo: '11/2(월) ~ 11/6(금) 학부모 상담 주간' },
    { id: 'acad-1109', title: '3학년 정기고사', startDate: '2026-11-09', endDate: '2026-11-11', category: 'exam', memo: '11/9(월) ~ 11/11(수) 3학년 지필고사' },
    { id: 'acad-1112', title: '장애인식개선교육(장애이해교육)', startDate: '2026-11-12', endDate: '2026-11-12', category: 'event', memo: '' },
    { id: 'acad-1116', title: '진로진학멘토링(3학년)', startDate: '2026-11-16', endDate: '2026-11-16', category: 'event', memo: '' },
    { id: 'acad-1119', title: '대학수학능력시험 · 재량휴업일', startDate: '2026-11-19', endDate: '2026-11-19', category: 'holiday', memo: '🔴 재량휴업일 (등교하지 않음)' },
    { id: 'acad-1125', title: '교육공동체 대토론회(전학공)', startDate: '2026-11-25', endDate: '2026-11-25', category: 'event', memo: '' },
    { id: 'acad-1126', title: '동아리(5,6,7교시)', startDate: '2026-11-26', endDate: '2026-11-26', category: 'club', memo: '목요일 5·6·7교시 동아리 활동' },
    { id: 'acad-1203', title: '학급운영협의회', startDate: '2026-12-03', endDate: '2026-12-03', category: 'event', memo: '' },
    { id: 'acad-1208', title: '1, 2학년 2차 정기고사 (1일차)', startDate: '2026-12-08', endDate: '2026-12-08', category: 'exam', memo: '✏️ 1·2학년 2차 지필평가 1일차' },
    { id: 'acad-1209', title: '1, 2학년 2차 정기고사 (2일차)', startDate: '2026-12-09', endDate: '2026-12-09', category: 'exam', memo: '✏️ 1·2학년 2차 지필평가 2일차' },
    { id: 'acad-1210', title: '성매매예방교육', startDate: '2026-12-10', endDate: '2026-12-10', category: 'event', memo: '' },
    { id: 'acad-1214', title: '진로진학멘토링(2학년)', startDate: '2026-12-14', endDate: '2026-12-14', category: 'event', memo: '' },
    { id: 'acad-1217', title: '학생자치회 정부회장선거', startDate: '2026-12-17', endDate: '2026-12-17', category: 'event', memo: '' },
    { id: 'acad-1225', title: '성탄절', startDate: '2026-12-25', endDate: '2026-12-25', category: 'holiday', memo: '공휴일 (수업 없음)' },
    { id: 'acad-1231', title: '졸업식 · 종업식', startDate: '2026-12-31', endDate: '2026-12-31', category: 'event', memo: '🏫 2학기 종업식 및 졸업식 (겨울방학 59일)' },
    { id: 'acad-0101', title: '신정', startDate: '2027-01-01', endDate: '2027-01-01', category: 'holiday', memo: '공휴일' },
    { id: 'acad-0206', title: '설날 연휴', startDate: '2027-02-06', endDate: '2027-02-08', category: 'holiday', memo: '설날 명절 연휴' },
    { id: 'acad-0209', title: '설날 대체공휴일', startDate: '2027-02-09', endDate: '2027-02-09', category: 'holiday', memo: '대체공휴일' }
  ];

  const FALLBACK_COMMUNITY_POSTS = [
    {
      id: 'post-welcome-1',
      author: '제작자(관리자)',
      isAdminPost: true,
      category: '제작자 피드백',
      title: '📢 백현중 1-3 수행평가 플래너 v4 업데이트 & 커뮤니티 안내',
      content: '1학년 3반 친구들 안녕! 수행평가 플래너가 v4로 업그레이드되었어.\n1) 상단 [로그인/가입]으로 내 아이디를 만들면 어디서든 내 목표 완료일과 수행평가 계획이 저장돼. (1인 1계정 원칙으로 동일 IP 중복 가입은 제한돼)\n2) 2학기 학사일정(11/19 재량휴업일, 11/26 동아리, 12/8~9 2차 정기고사 등)과 주간 날짜별 시간표 연동이 추가되었어.\n3) 사이트를 쓰면서 추가되었으면 하는 기능이나 수행평가 질문이 있으면 여기에 자유롭게 남겨줘!',
      isPinned: true,
      feedbackStatus: '반영완료',
      likes: 3,
      likedUsers: [],
      comments: [],
      createdAt: '2026-11-13 18:00'
    }
  ];

  class Store {
    constructor() {
      this.listeners = [];
      this.adminPassword = '';
      this.userAuth = { username: '', password: '' };
      try {
        if (typeof sessionStorage !== 'undefined') {
          this.adminPassword = sessionStorage.getItem(ADMIN_SESSION_KEY) || '';
        }
        if (!this.adminPassword && typeof localStorage !== 'undefined') {
          this.adminPassword = localStorage.getItem(ADMIN_SESSION_KEY) || '';
        }
        if (typeof localStorage !== 'undefined') {
          const rawAuth = localStorage.getItem(USER_AUTH_STORAGE_KEY);
          if (rawAuth) {
            const parsed = JSON.parse(rawAuth);
            if (parsed && parsed.username && parsed.password) {
              this.userAuth = { username: parsed.username, password: parsed.password };
            }
          }
        }
      } catch (e) {}

      this.state = this.loadInitialState();
    }

    hasAgreedTerms() {
      try {
        return localStorage.getItem(TERMS_CONSENT_KEY) === 'agreed';
      } catch (e) {
        return false;
      }
    }

    acceptTerms() {
      try {
        localStorage.setItem(TERMS_CONSENT_KEY, 'agreed');
      } catch (e) {}
    }

    hasCompletedSurvey() {
      try {
        return localStorage.getItem(SURVEY_DONE_KEY) === 'done';
      } catch (e) {
        return false;
      }
    }

    markSurveyCompleted() {
      try {
        localStorage.setItem(SURVEY_DONE_KEY, 'done');
      } catch (e) {}
    }

    loadInitialState() {
      const todayStr = getTodayStr();
      let cachedShared = null;
      let personal = null;

      try {
        const rawCache = localStorage.getItem(CACHE_STORAGE_KEY);
        if (rawCache) cachedShared = JSON.parse(rawCache);
      } catch (e) {}

      try {
        const rawPersonal = localStorage.getItem(PERSONAL_STORAGE_KEY);
        if (rawPersonal) personal = JSON.parse(rawPersonal);
      } catch (e) {}

      const schoolInfo = (cachedShared && cachedShared.schoolInfo) || {
        schoolName: '백현중학교',
        neisOfficeCode: 'J10',
        neisSchoolCode: '7531032',
        region: '경기(성남)',
        grade: 1,
        classNum: 3,
        lastSyncAt: todayStr,
        syncSource: 'db_cached',
        periodTimes: [
          '1(09:00)', '2(09:55)', '3(10:50)', '4(11:45)',
          '5(13:20)', '6(14:15)', '7(15:10)'
        ]
      };

      const subjects =
        cachedShared && Array.isArray(cachedShared.subjects) && cachedShared.subjects.length
          ? cachedShared.subjects
          : JSON.parse(JSON.stringify(FALLBACK_SUBJECTS));

      const timetable =
        cachedShared && cachedShared.timetable && Object.keys(cachedShared.timetable).length
          ? cachedShared.timetable
          : JSON.parse(JSON.stringify(FALLBACK_TIMETABLE));

      const subjectPlans =
        cachedShared && Array.isArray(cachedShared.subjectPlans) && cachedShared.subjectPlans.length
          ? cachedShared.subjectPlans
          : JSON.parse(JSON.stringify(FALLBACK_SUBJECT_PLANS));

      const rawAssessments =
        cachedShared && Array.isArray(cachedShared.assessments)
          ? cachedShared.assessments
          : buildFallbackAssessments(todayStr);

      const academicEvents =
        cachedShared && Array.isArray(cachedShared.academicEvents) && cachedShared.academicEvents.length
          ? cachedShared.academicEvents
          : JSON.parse(JSON.stringify(FALLBACK_ACADEMIC_EVENTS));

      const communityPosts =
        cachedShared && Array.isArray(cachedShared.communityPosts)
          ? cachedShared.communityPosts
          : JSON.parse(JSON.stringify(FALLBACK_COMMUNITY_POSTS));

      const myProgress = (personal && personal.myProgress) || {};
      const myScores = (personal && personal.myScores) || {};
      const myPlans = (personal && personal.myPlans) || {};
      const ui = Object.assign(
        {
          activeTab: 'calendar', // 'calendar' | 'timetable' | 'grades' | 'community'
          calendarMode: 'month',
          selectedDate: todayStr,
          currentMonthDate: todayStr,
          filterSubjectId: 'all',
          timetableWeekOffset: 0,
          communityCategory: 'all'
        },
        (personal && personal.ui) || {},
        {
          selectedDate: todayStr,
          isAdmin: !!this.adminPassword
        }
      );

      const user = {
        isLoggedIn: !!(this.userAuth && this.userAuth.username),
        username: (this.userAuth && this.userAuth.username) || '',
        nickname: (this.userAuth && this.userAuth.username) || ''
      };

      const mergedAssessments = this.mergeAssessmentsWithPersonal(rawAssessments, myProgress, myPlans);

      return {
        schoolInfo,
        subjects,
        timetable,
        subjectPlans,
        rawAssessments,
        assessments: mergedAssessments,
        academicEvents,
        communityPosts,
        myProgress,
        myScores,
        myPlans,
        user,
        currentUser: user.isLoggedIn ? user : null,
        ui
      };
    }

    mergeAssessmentsWithPersonal(rawList, myProgress, myPlans = {}) {
      return (rawList || []).map((item) => {
        const prog = myProgress[item.id] || {};
        const plan = myPlans[item.id] || {};
        const doneSubtaskIds = Array.isArray(prog.doneSubtaskIds) ? prog.doneSubtaskIds : [];
        const subtasks = (item.subtasks || []).map((st, idx) => {
          const stId = st.id || `st-${idx}`;
          return {
            id: stId,
            text: st.text,
            done: doneSubtaskIds.includes(stId) || prog.status === 'done'
          };
        });
        return Object.assign({}, item, {
          status: prog.status || 'todo',
          dailyChecks: Array.isArray(prog.dailyChecks) ? prog.dailyChecks.slice() : [],
          subtasks,
          myPlan: {
            targetDate: plan.targetDate || '',
            planMemo: plan.planMemo || ''
          }
        });
      });
    }

    savePersonalToStorage() {
      try {
        const payload = {
          myProgress: this.state.myProgress,
          myScores: this.state.myScores,
          myPlans: this.state.myPlans,
          ui: {
            activeTab: this.state.ui.activeTab,
            calendarMode: this.state.ui.calendarMode
          }
        };
        localStorage.setItem(PERSONAL_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {}
    }

    saveSharedCacheToStorage() {
      try {
        const payload = {
          schoolInfo: this.state.schoolInfo,
          subjects: this.state.subjects,
          timetable: this.state.timetable,
          subjectPlans: this.state.subjectPlans,
          assessments: this.state.rawAssessments,
          academicEvents: this.state.academicEvents,
          communityPosts: this.state.communityPosts
        };
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {}
    }

    subscribe(fn) {
      this.listeners.push(fn);
      return () => {
        this.listeners = this.listeners.filter((l) => l !== fn);
      };
    }

    notify(syncUser = false) {
      this.state.assessments = this.mergeAssessmentsWithPersonal(
        this.state.rawAssessments,
        this.state.myProgress,
        this.state.myPlans
      );
      this.savePersonalToStorage();
      this.saveSharedCacheToStorage();
      if (syncUser && this.state.user && this.state.user.isLoggedIn) {
        this.syncUserDataToServer().catch(() => {});
      }
      this.listeners.forEach((fn) => fn(this.state));
    }

    setUI(patch) {
      this.state.ui = Object.assign({}, this.state.ui, patch);
      this.notify();
    }

    async fetchBootstrapFromServer() {
      const resp = await fetch('/api/bootstrap', { cache: 'no-store' });
      if (!resp.ok) {
        throw new Error(`서버 응답 오류 (${resp.status})`);
      }
      const data = await resp.json();
      if (!data || !data.ok) {
        throw new Error('유효하지 않은 부트스트랩 응답');
      }

      const serverTs = Number((data.schoolInfo && data.schoolInfo.dbUpdatedAt) || 0);
      const localTs = Number((this.state.schoolInfo && this.state.schoolInfo.dbUpdatedAt) || 0);

      // 서버 컨테이너가 재시작되어 초기(dbUpdatedAt == 0)로 돌아갔는데 내 브라우저에 더 최신 일정이 있는 경우 자동 복구
      if (localTs > serverTs) {
        try {
          const restoreResp = await fetch('/api/bootstrap/restore', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Password': this.adminPassword || ''
            },
            body: JSON.stringify({
              dbUpdatedAt: localTs,
              assessments: this.state.rawAssessments,
              timetable: this.state.timetable,
              academicEvents: this.state.academicEvents,
              communityPosts: this.state.communityPosts
            })
          });
          if (restoreResp.ok) {
            const restoredData = await restoreResp.json();
            if (restoredData && restoredData.ok) {
              this.applyServerBootstrapData(restoredData);
              return restoredData;
            }
          }
        } catch (e) {}
        return this.state;
      }

      this.applyServerBootstrapData(data);
      return data;
    }

    applyServerBootstrapData(data) {
      if (data.schoolInfo) this.state.schoolInfo = data.schoolInfo;
      if (Array.isArray(data.subjects)) this.state.subjects = data.subjects;
      if (data.timetable) this.state.timetable = data.timetable;
      if (Array.isArray(data.subjectPlans)) this.state.subjectPlans = data.subjectPlans;
      if (Array.isArray(data.assessments)) this.state.rawAssessments = data.assessments;
      if (Array.isArray(data.academicEvents)) this.state.academicEvents = data.academicEvents;
      if (Array.isArray(data.communityPosts)) this.state.communityPosts = data.communityPosts;
      this.notify();
    }

    // =========================================================================
    // 학생 회원가입 / 로그인 / 내 계획 & 점수 서버 동기화
    // =========================================================================
    async registerUser(username, password) {
      const u = (username || '').trim();
      const p = (password || '').trim();
      if (u.length < 2 || u.length > 20) {
        throw new Error('아이디(닉네임)는 2~20자 이내로 입력해 주세요.');
      }
      if (p.length < 4) {
        throw new Error('비밀번호는 4자 이상 입력해 주세요.');
      }

      const initialPayload = {
        myProgress: this.state.myProgress,
        myScores: this.state.myScores,
        myPlans: this.state.myPlans
      };

      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p, userData: initialPayload })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '회원가입에 실패했습니다.');
      }

      this.userAuth = { username: u, password: p };
      try {
        localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(this.userAuth));
      } catch (e) {}
      this.state.user = { isLoggedIn: true, username: u, nickname: u };
      this.state.currentUser = this.state.user;
      this.notify();
      return data;
    }

    async loginUser(username, password) {
      const u = (username || '').trim();
      const p = (password || '').trim();
      if (!u || !p) {
        throw new Error('아이디와 비밀번호를 모두 입력해 주세요.');
      }

      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      this.userAuth = { username: u, password: p };
      try {
        localStorage.setItem(USER_AUTH_STORAGE_KEY, JSON.stringify(this.userAuth));
      } catch (e) {}
      this.state.user = { isLoggedIn: true, username: u, nickname: u };
      this.state.currentUser = this.state.user;

      const serverUserData = data.userData || {};
      if (serverUserData.myProgress) {
        this.state.myProgress = Object.assign({}, this.state.myProgress, serverUserData.myProgress);
      }
      if (serverUserData.myScores) {
        this.state.myScores = Object.assign({}, this.state.myScores, serverUserData.myScores);
      }
      if (serverUserData.myPlans) {
        this.state.myPlans = Object.assign({}, this.state.myPlans, serverUserData.myPlans);
      }
      this.notify(true);
      return data;
    }

    logoutUser() {
      this.userAuth = { username: '', password: '' };
      try {
        localStorage.removeItem(USER_AUTH_STORAGE_KEY);
      } catch (e) {}
      this.state.user = { isLoggedIn: false, username: '', nickname: '' };
      this.state.currentUser = null;
      this.notify();
    }

    async syncUserDataToServer() {
      if (!this.userAuth || !this.userAuth.username || !this.userAuth.password) return;
      if (!window.location.protocol.startsWith('http')) return;
      await fetch('/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.userAuth.username,
          password: this.userAuth.password,
          userData: {
            myProgress: this.state.myProgress,
            myScores: this.state.myScores,
            myPlans: this.state.myPlans
          }
        })
      });
    }

    // =========================================================================
    // 수행평가별 맞춤 완료 계획 (내 목표 완료일 & 자동 공부 계획 추천)
    // =========================================================================
    getTaskPlan(taskId) {
      const p = this.state.myPlans[taskId] || {
        targetDate: '',
        planMemo: '',
        steps: [],
        memo: ''
      };
      return {
        targetDate: p.targetDate || '',
        planMemo: p.planMemo || '',
        steps: Array.isArray(p.steps) && p.steps.length ? p.steps : (p.planMemo ? p.planMemo.split('\n') : []),
        memo: p.memo || ''
      };
    }

    saveTaskPlan(taskId, { targetDate, planMemo, steps, memo }) {
      const combinedMemo =
        planMemo !== undefined
          ? planMemo
          : [Array.isArray(steps) ? steps.join('\n') : '', memo || '']
              .filter(Boolean)
              .join('\n');
      this.state.myPlans[taskId] = {
        targetDate: (targetDate || '').trim(),
        planMemo: (combinedMemo || '').trim(),
        steps: Array.isArray(steps) ? steps : [],
        memo: (memo || '').trim()
      };
      this.notify(true);
    }

    generateRecommendedPlan(taskId) {
      const task = this.state.rawAssessments.find((a) => a.id === taskId);
      if (!task) return null;
      const todayStr = getTodayStr();
      const diff = this.getDDay(task.dueDate, todayStr);
      const targetOffset = diff >= 3 ? -2 : diff >= 1 ? -1 : 0;
      const targetDate = addDaysStr(task.dueDate, targetOffset);

      const step1Date = diff >= 5 ? addDaysStr(task.dueDate, -4) : todayStr;
      const step2Date = targetDate;
      const step3Date = diff >= 1 ? addDaysStr(task.dueDate, -1) : task.dueDate;

      let stepsArr = [];
      if (task.type === '발표') {
        stepsArr = [
          `[1단계 · ${step1Date.slice(5)}] 발표 주제 및 대본 구성 완료`,
          `[2단계 · ${step2Date.slice(5)} 목표 완료일] 발표 자료 완성 및 1분 리허설`,
          `[3단계 · ${step3Date.slice(5)}] 최종 암기 및 질의응답 대비`
        ];
      } else if (task.type === '실기') {
        stepsArr = [
          `[1단계 · ${step1Date.slice(5)}] 실기 평가 기준 및 핵심 동작/재료 숙지`,
          `[2단계 · ${step2Date.slice(5)} 목표 완료일] 실전 연습 및 부족한 부분 보완`,
          `[3단계 · ${step3Date.slice(5)}] 컨디션 조절 및 준비물 챙기기`
        ];
      } else {
        stepsArr = [
          `[1단계 · ${step1Date.slice(5)}] 평가 루브릭 확인 및 핵심 자료 조사`,
          `[2단계 · ${step2Date.slice(5)} 목표 완료일] 보고서/논술 초안 작성 완료`,
          `[3단계 · ${step3Date.slice(5)}] 맞춤법·분량 최종 검토 및 제출 준비`
        ];
      }

      this.state.myPlans[taskId] = {
        targetDate,
        planMemo: stepsArr.join('\n'),
        steps: stepsArr,
        memo: '마감 하루 전 완벽 준비 완료!'
      };
      this.notify(true);
      return this.state.myPlans[taskId];
    }

    async loginAdmin(password) {
      const trimmed = (password || '').trim();
      if (!trimmed) throw new Error('비밀번호를 입력해 주세요.');

      const resp = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: trimmed })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '비밀번호가 일치하지 않습니다.');
      }

      this.adminPassword = trimmed;
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(ADMIN_SESSION_KEY, trimmed);
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(ADMIN_SESSION_KEY, trimmed);
        }
      } catch (e) {}
      this.state.ui.isAdmin = true;
      this.notify();
      return true;
    }

    logoutAdmin() {
      this.adminPassword = '';
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(ADMIN_SESSION_KEY);
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(ADMIN_SESSION_KEY);
        }
      } catch (e) {}
      this.state.ui.isAdmin = false;
      this.notify();
    }

    async adminSaveAssessment(payload) {
      if (!this.state.ui.isAdmin) {
        throw new Error('관리자 모드에서만 수행평가를 추가·수정할 수 있습니다.');
      }
      if (window.location.protocol.startsWith('http')) {
        const resp = await fetch('/api/admin/assessment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': this.adminPassword
          },
          body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || '수행평가 저장 실패');
        }
        this.applyServerBootstrapData(data);
        return data;
      }

      const taskId = payload.id || 'task-' + Date.now();
      const idx = this.state.rawAssessments.findIndex((a) => a.id === taskId);
      const record = {
        id: taskId,
        title: payload.title,
        subjectId: payload.subjectId,
        planId: payload.planId || '',
        areaId: payload.areaId || '',
        type: payload.type || '보고서',
        dueDate: payload.dueDate || getTodayStr(),
        period: payload.period ? Number(payload.period) : null,
        weight: Number(payload.weight) || 0,
        memo: payload.memo || '',
        subtasks: Array.isArray(payload.subtasks) ? payload.subtasks : []
      };
      if (idx !== -1) {
        this.state.rawAssessments[idx] = record;
      } else {
        this.state.rawAssessments.push(record);
      }
      this.notify();
      return record;
    }

    async adminDeleteAssessment(id) {
      if (!this.state.ui.isAdmin) {
        throw new Error('관리자 권한이 필요합니다.');
      }
      if (window.location.protocol.startsWith('http')) {
        const resp = await fetch('/api/admin/assessment/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': this.adminPassword
          },
          body: JSON.stringify({ id })
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || '삭제 실패');
        }
        this.applyServerBootstrapData(data);
        return;
      }
      this.state.rawAssessments = this.state.rawAssessments.filter((a) => a.id !== id);
      this.notify();
    }

    async adminSaveSubjectPlan(planPayload) {
      if (!this.state.ui.isAdmin) {
        throw new Error('관리자 권한이 필요합니다.');
      }
      if (window.location.protocol.startsWith('http')) {
        const resp = await fetch('/api/admin/subject-plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': this.adminPassword
          },
          body: JSON.stringify(planPayload)
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || '평가계획 저장 실패');
        }
        this.applyServerBootstrapData(data);
        return;
      }
      const idx = this.state.subjectPlans.findIndex((p) => p.id === planPayload.id);
      if (idx !== -1) {
        this.state.subjectPlans[idx] = Object.assign({}, this.state.subjectPlans[idx], planPayload);
      } else {
        this.state.subjectPlans.push(planPayload);
      }
      this.notify();
    }

    async adminUpdateTimetableCell(weekdayIdx, period, subjectName, changed = false) {
      if (!this.state.ui.isAdmin) {
        throw new Error('관리자 권한이 필요합니다.');
      }
      const slotKey = `${weekdayIdx}-${period}`;
      if (window.location.protocol.startsWith('http')) {
        const resp = await fetch('/api/admin/timetable/cell', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': this.adminPassword
          },
          body: JSON.stringify({ slotKey, subject: subjectName, changed: !!changed })
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || '시간표 수정 실패');
        }
        this.applyServerBootstrapData(data);
        return;
      }
      if (!subjectName || !subjectName.trim()) {
        delete this.state.timetable[slotKey];
      } else {
        this.state.timetable[slotKey] = { subject: subjectName.trim(), changed: !!changed };
      }
      this.notify();
    }

    async adminSaveAcademicEvent(payload) {
      if (!this.state.ui.isAdmin) {
        throw new Error('관리자 권한이 필요합니다.');
      }
      const resp = await fetch('/api/admin/academic-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': this.adminPassword
        },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '학사일정 저장 실패');
      }
      this.applyServerBootstrapData(data);
      return data;
    }

    async adminDeleteAcademicEvent(id) {
      if (!this.state.ui.isAdmin) {
        throw new Error('관리자 권한이 필요합니다.');
      }
      const resp = await fetch('/api/admin/academic-event/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': this.adminPassword
        },
        body: JSON.stringify({ id })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '학사일정 삭제 실패');
      }
      this.applyServerBootstrapData(data);
    }

    // =========================================================================
    // 학사일정 & 커뮤니티 [Beta] 메서드
    // =========================================================================
    getAcademicEventsOnDate(dateStr) {
      if (!dateStr) return [];
      return (this.state.academicEvents || []).filter(
        (ev) => ev.startDate <= dateStr && dateStr <= (ev.endDate || ev.startDate)
      );
    }

    async createCommunityPost({ category, title, content, nickname, isPinned }) {
      const author = this.state.ui.isAdmin
        ? '제작자(관리자)'
        : (this.state.user && this.state.user.isLoggedIn && this.state.user.username) ||
          (nickname || '').trim() ||
          '';
      if (!author) {
        throw new Error('커뮤니티에 글을 작성하려면 먼저 상단 [로그인/가입]을 해주세요!');
      }
      const resp = await fetch('/api/community/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': this.adminPassword || ''
        },
        body: JSON.stringify({ author, category, title, content, isPinned: !!isPinned })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '게시글 등록 실패');
      }
      this.applyServerBootstrapData(data);
      return data;
    }

    async addCommunityComment(postId, payloadOrText) {
      const text =
        typeof payloadOrText === 'string'
          ? payloadOrText
          : (payloadOrText && (payloadOrText.text || payloadOrText.content)) || '';
      const author = this.state.ui.isAdmin
        ? '제작자(관리자)'
        : this.state.user && this.state.user.isLoggedIn
        ? this.state.user.username
        : '';
      if (!author) {
        throw new Error('댓글을 작성하려면 먼저 상단 [로그인/가입]을 해주세요!');
      }
      const resp = await fetch('/api/community/comment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': this.adminPassword || ''
        },
        body: JSON.stringify({ postId, author, text })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '댓글 등록 실패');
      }
      this.applyServerBootstrapData(data);
    }

    async toggleCommunityLike(postId) {
      const username =
        (this.state.user && this.state.user.username) ||
        (this.state.ui.isAdmin ? 'admin' : 'guest');
      const resp = await fetch('/api/community/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, username })
      });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        this.applyServerBootstrapData(data);
      }
    }

    async likeCommunityPost(postId) {
      return this.toggleCommunityLike(postId);
    }

    async deleteCommunityPost(postId) {
      const username = (this.state.user && this.state.user.username) || '';
      const resp = await fetch('/api/community/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': this.adminPassword || ''
        },
        body: JSON.stringify({ postId, username })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '게시글 삭제 실패');
      }
      this.applyServerBootstrapData(data);
    }

    async adminUpdateCommunityStatus(postId, { isPinned, pinned, feedbackStatus, status }) {
      const existing = (this.state.communityPosts || []).find((p) => p.id === postId) || {};
      const nextPinned =
        isPinned !== undefined
          ? !!isPinned
          : pinned !== undefined
          ? !!pinned
          : !!existing.isPinned;
      const nextStatus =
        feedbackStatus !== undefined
          ? feedbackStatus
          : status !== undefined
          ? status
          : existing.feedbackStatus || '';
      const resp = await fetch('/api/admin/community/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': this.adminPassword || ''
        },
        body: JSON.stringify({ postId, isPinned: nextPinned, feedbackStatus: nextStatus })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '상태 변경 실패');
      }
      this.applyServerBootstrapData(data);
    }

    async adminUpdateCommunityPostStatus(postId, opts) {
      return this.adminUpdateCommunityStatus(postId, opts);
    }

    async adminSyncTimetable(neisApiKey = '') {
      if (!this.state.ui.isAdmin) {
        throw new Error('관리자 권한이 필요합니다.');
      }
      const resp = await fetch('/api/admin/timetable/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Password': this.adminPassword
        },
        body: JSON.stringify({ neisApiKey })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || '시간표 동기화 실패');
      }
      this.applyServerBootstrapData(data);
      return data.syncResult;
    }

    getSubjectById(subjectId) {
      return this.state.subjects.find((s) => s.id === subjectId) || null;
    }

    getSubjectByName(name) {
      if (!name) return null;
      const trimmed = name.trim();
      return this.state.subjects.find((s) => s.name === trimmed) || null;
    }

    getPlanById(planId) {
      return this.state.subjectPlans.find((p) => p.id === planId) || null;
    }

    getDDay(dueDateStr, baseDateStr = getTodayStr()) {
      const [y1, m1, d1] = baseDateStr.split('-').map(Number);
      const [y2, m2, d2] = dueDateStr.split('-').map(Number);
      const dt1 = new Date(y1, m1 - 1, d1);
      const dt2 = new Date(y2, m2 - 1, d2);
      return Math.round((dt2 - dt1) / (1000 * 60 * 60 * 24));
    }

    formatDDayBadge(dueDateStr, status) {
      if (status === 'done') return { text: '완료됨', cls: 'badge-done' };
      const diff = this.getDDay(dueDateStr);
      if (diff === 0) return { text: 'D-Day', cls: 'badge-dday-today' };
      if (diff > 0 && diff <= 3) return { text: `D-${diff}`, cls: 'badge-dday-urgent' };
      if (diff > 3) return { text: `D-${diff}`, cls: 'badge-dday-normal' };
      return { text: `D+${Math.abs(diff)}`, cls: 'badge-dday-overdue' };
    }

    getDaySchedule(dateStr) {
      const weekdayIdx = getWeekdayIndex(dateStr);
      if (weekdayIdx > 4) return [];
      const periods = [];
      for (let p = 1; p <= 7; p++) {
        const key = `${weekdayIdx}-${p}`;
        const cell = this.state.timetable[key];
        if (cell && cell.subject) {
          const subjObj = this.getSubjectByName(cell.subject);
          periods.push({
            period: p,
            weekdayIdx,
            subjectName: cell.subject,
            changed: !!cell.changed,
            subjectId: subjObj ? subjObj.id : null,
            color: subjObj ? subjObj.color : '#64748B'
          });
        }
      }
      return periods;
    }

    getMatchingPeriodsForDate(subjectId, dateStr) {
      const subj = this.getSubjectById(subjectId);
      if (!subj || !dateStr) return [];
      const daySchedule = this.getDaySchedule(dateStr);
      return daySchedule
        .filter((item) => item.subjectName === subj.name)
        .map((item) => item.period);
    }

    getSubjectWeeklySlots(subjectId) {
      const subj = this.getSubjectById(subjectId);
      if (!subj) return [];
      const dayNames = ['월', '화', '수', '목', '금'];
      const slots = [];
      for (let w = 0; w <= 4; w++) {
        for (let p = 1; p <= 7; p++) {
          const cell = this.state.timetable[`${w}-${p}`];
          if (cell && cell.subject === subj.name) {
            slots.push({
              weekdayIdx: w,
              weekdayName: dayNames[w],
              period: p
            });
          }
        }
      }
      return slots;
    }

    _ensureTaskProgress(id) {
      if (!this.state.myProgress[id]) {
        this.state.myProgress[id] = {
          status: 'todo',
          dailyChecks: [],
          doneSubtaskIds: []
        };
      }
      return this.state.myProgress[id];
    }

    setAssessmentStatus(id, status) {
      const prog = this._ensureTaskProgress(id);
      prog.status = status;
      const raw = this.state.rawAssessments.find((a) => a.id === id);
      if (status === 'done' && raw && Array.isArray(raw.subtasks)) {
        prog.doneSubtaskIds = raw.subtasks.map((st, idx) => st.id || `st-${idx}`);
      }
      this.notify(true);
    }

    toggleDailyCheck(id, dateStr = getTodayStr()) {
      const prog = this._ensureTaskProgress(id);
      const idx = prog.dailyChecks.indexOf(dateStr);
      let checked = false;
      if (idx === -1) {
        prog.dailyChecks.push(dateStr);
        if (prog.status === 'todo') prog.status = 'in_progress';
        checked = true;
      } else {
        prog.dailyChecks.splice(idx, 1);
        checked = false;
      }
      this.notify(true);
      return checked;
    }

    toggleSubtask(taskId, subtaskId) {
      const prog = this._ensureTaskProgress(taskId);
      const raw = this.state.rawAssessments.find((a) => a.id === taskId);
      if (!raw || !Array.isArray(raw.subtasks)) return;

      const idx = prog.doneSubtaskIds.indexOf(subtaskId);
      if (idx === -1) {
        prog.doneSubtaskIds.push(subtaskId);
      } else {
        prog.doneSubtaskIds.splice(idx, 1);
      }

      const totalCount = raw.subtasks.length;
      const doneCount = prog.doneSubtaskIds.length;
      if (totalCount > 0 && doneCount >= totalCount) {
        prog.status = 'done';
      } else if (doneCount > 0 && prog.status === 'todo') {
        prog.status = 'in_progress';
      } else if (doneCount < totalCount && prog.status === 'done') {
        prog.status = 'in_progress';
      }
      this.notify(true);
    }

    getPersonalSubjectScore(planId) {
      return (
        this.state.myScores[planId] || {
          exam1: '',
          exam2: '',
          areaScores: {}
        }
      );
    }

    updatePersonalScore(planId, field, value, areaId = null) {
      if (!this.state.myScores[planId]) {
        this.state.myScores[planId] = { exam1: '', exam2: '', areaScores: {} };
      }
      const entry = this.state.myScores[planId];
      if (field === 'area' && areaId) {
        if (value === '' || value === null || value === undefined) {
          delete entry.areaScores[areaId];
        } else {
          entry.areaScores[areaId] = Math.max(0, Number(value));
        }
      } else if (field === 'exam1' || field === 'exam2') {
        if (value === '' || value === null || value === undefined) {
          entry[field] = '';
        } else {
          entry[field] = Math.min(100, Math.max(0, Number(value)));
        }
      }
      this.notify(true);
    }

    fillSamplePersonalScores() {
      this.state.subjectPlans.forEach((plan) => {
        const entry = { exam1: '', exam2: '', areaScores: {} };
        if (plan.exam1Ratio > 0) entry.exam1 = 92;
        if (plan.exam2Ratio > 0) entry.exam2 = 90;
        (plan.areas || []).forEach((area) => {
          entry.areaScores[area.id] = area.weight;
        });
        this.state.myScores[plan.id] = entry;
      });
      this.notify(true);
    }

    clearPersonalScores() {
      this.state.myScores = {};
      this.notify(true);
    }

    calculateGradeReport() {
      const rows = this.state.subjectPlans.map((plan) => {
        const userScore = this.getPersonalSubjectScore(plan.id);
        let earnedTotal = 0;
        let enteredMaxTotal = 0;

        let exam1Weighted = null;
        if (plan.exam1Ratio > 0) {
          if (userScore.exam1 !== '' && userScore.exam1 !== null && userScore.exam1 !== undefined) {
            const raw1 = Math.min(100, Math.max(0, Number(userScore.exam1)));
            exam1Weighted = Number(((raw1 * plan.exam1Ratio) / 100).toFixed(2));
            earnedTotal += exam1Weighted;
            enteredMaxTotal += plan.exam1Ratio;
          }
        }

        let exam2Weighted = null;
        if (plan.exam2Ratio > 0) {
          if (userScore.exam2 !== '' && userScore.exam2 !== null && userScore.exam2 !== undefined) {
            const raw2 = Math.min(100, Math.max(0, Number(userScore.exam2)));
            exam2Weighted = Number(((raw2 * plan.exam2Ratio) / 100).toFixed(2));
            earnedTotal += exam2Weighted;
            enteredMaxTotal += plan.exam2Ratio;
          }
        }

        let perfEarned = 0;
        let perfEnteredMax = 0;
        const areaDetails = (plan.areas || []).map((area) => {
          const val = userScore.areaScores ? userScore.areaScores[area.id] : undefined;
          const isEntered = val !== '' && val !== null && val !== undefined;
          const clamped = isEntered ? Math.min(area.weight, Math.max(0, Number(val))) : null;
          if (isEntered) {
            perfEarned += clamped;
            perfEnteredMax += Number(area.weight) || 0;
            earnedTotal += clamped;
            enteredMaxTotal += Number(area.weight) || 0;
          }
          return {
            id: area.id,
            name: area.name,
            weight: Number(area.weight) || 0,
            earned: clamped,
            isEntered
          };
        });

        earnedTotal = Number(earnedTotal.toFixed(2));
        const remainingMax = Math.max(0, 100 - enteredMaxTotal);
        const maxPossibleScore = Number((earnedTotal + remainingMax).toFixed(2));
        const projectedScore =
          enteredMaxTotal > 0
            ? Number(((earnedTotal / enteredMaxTotal) * 100).toFixed(1))
            : null;

        const gradeTargetScore = enteredMaxTotal === 100 ? earnedTotal : projectedScore;
        const gradeInfo = computeAchievementGrade(gradeTargetScore, plan.gradeScale);

        const cutoffA = plan.gradeScale === '3tier' ? 80 : 90;
        const neededPointsForA = Number(Math.max(0, cutoffA - earnedTotal).toFixed(1));
        let guideMessage = '';
        if (enteredMaxTotal === 0) {
          guideMessage = `점수를 입력하면 예상 등급과 A등급(${cutoffA}점) 달성 조건을 계산합니다.`;
        } else if (earnedTotal >= cutoffA) {
          guideMessage = `🎉 현재 확보 점수(${earnedTotal}점)만으로 A등급(${cutoffA}점 이상) 확정입니다!`;
        } else if (neededPointsForA > remainingMax) {
          guideMessage = `현재 최고 도달 가능 점수는 ${maxPossibleScore}점입니다.`;
        } else if (remainingMax > 0) {
          const onlyExam1Left =
            plan.exam1Ratio > 0 && exam1Weighted === null && remainingMax === plan.exam1Ratio;
          const onlyExam2Left =
            plan.exam2Ratio > 0 && exam2Weighted === null && remainingMax === plan.exam2Ratio;
          if (onlyExam1Left || onlyExam2Left) {
            const examLabel = onlyExam1Left ? '1차 정기시험' : '2차 정기시험';
            const neededRawExam = Math.ceil((neededPointsForA / remainingMax) * 100);
            guideMessage = `💡 A등급(${cutoffA}점)을 받으려면 ${examLabel}에서 원점수 ${neededRawExam}점 이상(환산 ${neededPointsForA}점)이 필요합니다!`;
          } else {
            guideMessage = `💡 A등급(${cutoffA}점)까지 남은 배점(${remainingMax}점) 중 ${neededPointsForA}점 이상 획득하면 달성됩니다!`;
          }
        } else {
          guideMessage = `모든 평가 입력 완료 · 최종 총점 ${earnedTotal}점 (${gradeInfo.grade}등급)`;
        }

        return {
          plan,
          userScore,
          exam1Weighted,
          exam2Weighted,
          perfEarned: Number(perfEarned.toFixed(2)),
          perfEnteredMax,
          areaDetails,
          earnedTotal,
          enteredMaxTotal,
          remainingMax,
          maxPossibleScore,
          projectedScore,
          gradeInfo,
          cutoffA,
          neededPointsForA,
          guideMessage
        };
      });

      const activeRows = rows.filter((r) => r.enteredMaxTotal > 0);
      let avgProjected = 0;
      let weightedSum = 0;
      let totalCredits = 0;
      let countA = 0;

      activeRows.forEach((r) => {
        const s = r.enteredMaxTotal === 100 ? r.earnedTotal : r.projectedScore || 0;
        avgProjected += s;
        weightedSum += s * r.plan.credits;
        totalCredits += r.plan.credits;
        if (r.gradeInfo.grade === 'A') countA++;
      });

      return {
        rows,
        summary: {
          enteredSubjectsCount: activeRows.length,
          totalSubjectsCount: rows.length,
          avgScore: activeRows.length > 0 ? Number((avgProjected / activeRows.length).toFixed(1)) : 0,
          weightedAvgScore: totalCredits > 0 ? Number((weightedSum / totalCredits).toFixed(1)) : 0,
          countA
        }
      };
    }
  }

  global.SuhaengStore = {
    Store,
    getTodayStr,
    addDaysStr,
    getWeekdayIndex,
    computeAchievementGrade
  };
})(window);
