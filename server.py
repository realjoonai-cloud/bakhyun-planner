#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
백현중학교 1-3반 수행평가 플래너 & 예상 성적표 서버 v3 (server.py)
- SQLite 데이터베이스(suhaeng.db) 기반 공통 수행평가/평가계획/시간표 영구 저장
- 서버 관리자(Admin) 인증 기반 수행평가 추가·수정·삭제 및 평가계획 비율 관리
- 교육부 나이스(NEIS) 공식 공공데이터 Open API (open.neis.go.kr) 시간표 동기화
- 외부 패키지 설치 없이 Python 3 표준 라이브러리만으로 동작
"""

import datetime
import hashlib
import hmac
import http.server
import json
import os
import re
import secrets
import socketserver
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "suhaeng.db")

NEIS_BASE_URL = "https://open.neis.go.kr/hub"
NEIS_OFFICE_CODE = "J10"       # 경기도교육청
NEIS_SCHOOL_CODE = "7531032"   # 성남 백현중학교 표준학교코드

# 환경변수 ADMIN_PASSWORD가 없으면 서버 시작 시 임시 난수 비밀번호를 생성해 콘솔에 출력
DEFAULT_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(8)
PASSWORD_SALT = os.environ.get("PASSWORD_SALT", "baekhyun_planner_salt_v3")

# ============================================================================
# 초기 시드 데이터 (교사 성함 일절 없음)
# ============================================================================

INITIAL_TIMETABLE = {
    "0-1": {"subject": "스포", "changed": False},
    "0-2": {"subject": "체육", "changed": False},
    "0-3": {"subject": "기가", "changed": False},
    "0-4": {"subject": "국어B", "changed": False},
    "0-5": {"subject": "과학C", "changed": False},
    "0-6": {"subject": "사회A", "changed": False},
    "1-1": {"subject": "미술", "changed": False},
    "1-2": {"subject": "진탐", "changed": False},
    "1-3": {"subject": "수학A", "changed": False},
    "1-4": {"subject": "영어A", "changed": False},
    "1-5": {"subject": "과학C", "changed": False},
    "1-6": {"subject": "도덕", "changed": False},
    "1-7": {"subject": "체육", "changed": False},
    "2-1": {"subject": "영어B", "changed": False},
    "2-2": {"subject": "음악", "changed": False},
    "2-3": {"subject": "수학A", "changed": False},
    "2-4": {"subject": "사회A", "changed": False},
    "2-5": {"subject": "미술", "changed": False},
    "2-6": {"subject": "국어A", "changed": False},
    "3-1": {"subject": "국어A", "changed": False},
    "3-2": {"subject": "과학A", "changed": False},
    "3-3": {"subject": "수학B", "changed": False},
    "3-4": {"subject": "음악", "changed": False},
    "3-5": {"subject": "기가", "changed": False},
    "3-6": {"subject": "정보", "changed": False},
    "4-1": {"subject": "영어A", "changed": False},
    "4-2": {"subject": "체육", "changed": False},
    "4-3": {"subject": "도덕", "changed": False},
    "4-4": {"subject": "사회B", "changed": False},
    "4-5": {"subject": "국어B", "changed": False},
    "4-6": {"subject": "정보", "changed": False},
}

INITIAL_SUBJECTS = [
    {"id": "sub-korA", "name": "국어A", "group": "국어", "planId": "plan-kor", "color": "#EF4444"},
    {"id": "sub-korB", "name": "국어B", "group": "국어", "planId": "plan-kor", "color": "#F87171"},
    {"id": "sub-mathA", "name": "수학A", "group": "수학", "planId": "plan-math", "color": "#3B82F6"},
    {"id": "sub-mathB", "name": "수학B", "group": "수학", "planId": "plan-math", "color": "#60A5FA"},
    {"id": "sub-engA", "name": "영어A", "group": "영어", "planId": "plan-eng", "color": "#F59E0B"},
    {"id": "sub-engB", "name": "영어B", "group": "영어", "planId": "plan-eng", "color": "#FBBF24"},
    {"id": "sub-sciA", "name": "과학A", "group": "과학", "planId": "plan-sci", "color": "#8B5CF6"},
    {"id": "sub-sciC", "name": "과학C", "group": "과학", "planId": "plan-sci", "color": "#A78BFA"},
    {"id": "sub-socA", "name": "사회A", "group": "사회", "planId": "plan-soc", "color": "#10B981"},
    {"id": "sub-socB", "name": "사회B", "group": "사회", "planId": "plan-soc", "color": "#34D399"},
    {"id": "sub-eth", "name": "도덕", "group": "도덕", "planId": "plan-eth", "color": "#14B8A6"},
    {"id": "sub-tech", "name": "기가", "group": "기술·가정", "planId": "plan-tech", "color": "#EC4899"},
    {"id": "sub-info", "name": "정보", "group": "정보", "planId": "plan-info", "color": "#06B6D4"},
    {"id": "sub-pe", "name": "체육", "group": "체육", "planId": "plan-pe", "color": "#F97316"},
    {"id": "sub-mus", "name": "음악", "group": "음악", "planId": "plan-mus", "color": "#6366F1"},
    {"id": "sub-art", "name": "미술", "group": "미술", "planId": "plan-art", "color": "#D946EF"},
    {"id": "sub-car", "name": "진탐", "group": "기타", "planId": "", "color": "#84CC16"},
    {"id": "sub-spo", "name": "스포", "group": "체육", "planId": "", "color": "#FB923C"},
]

INITIAL_SUBJECT_PLANS = [
    {
        "id": "plan-kor",
        "name": "국어",
        "color": "#EF4444",
        "credits": 4,
        "exam1Ratio": 50,
        "exam2Ratio": 0,
        "perfRatio": 50,
        "gradeScale": "5tier",
        "sortOrder": 1,
        "areas": [
            {"id": "kor-1", "name": "영역① 단어의 짜임 분석하기", "weight": 20},
            {"id": "kor-2", "name": "영역② 존중하는 언어 생활 프로젝트", "weight": 20},
            {"id": "kor-3", "name": "영역③ 책읽기 프로젝트", "weight": 10},
        ],
    },
    {
        "id": "plan-soc",
        "name": "사회",
        "color": "#10B981",
        "credits": 3,
        "exam1Ratio": 0,
        "exam2Ratio": 0,
        "perfRatio": 100,
        "gradeScale": "5tier",
        "sortOrder": 2,
        "areas": [
            {"id": "soc-1", "name": "영역① 민주주의 발전 과정 탐구", "weight": 30},
            {"id": "soc-2", "name": "영역② 역할 갈등 사례 분석(논술형)", "weight": 20},
            {"id": "soc-3", "name": "영역③ 정치 주체 / 변동 평가영역", "weight": 20},
            {"id": "soc-4", "name": "영역④ 생활 속의 법 탐구하기", "weight": 30},
        ],
    },
    {
        "id": "plan-eth",
        "name": "도덕",
        "color": "#14B8A6",
        "credits": 2,
        "exam1Ratio": 0,
        "exam2Ratio": 0,
        "perfRatio": 100,
        "gradeScale": "5tier",
        "sortOrder": 3,
        "areas": [
            {"id": "eth-1", "name": "영역① 도덕 탐구 / 토론·논술 평가", "weight": 40},
            {"id": "eth-2", "name": "영역② 인권·평화 연구활동 평가", "weight": 40},
            {"id": "eth-3", "name": "영역③ 생명존중 방안탐구", "weight": 20},
        ],
    },
    {
        "id": "plan-math",
        "name": "수학",
        "color": "#3B82F6",
        "credits": 3,
        "exam1Ratio": 0,
        "exam2Ratio": 50,
        "perfRatio": 50,
        "gradeScale": "5tier",
        "sortOrder": 4,
        "areas": [
            {"id": "math-1", "name": "영역① 실생활 속 통계 활용(논술형)", "weight": 20},
            {"id": "math-2", "name": "영역② 도형/교과 탐구 평가(변동 가능)", "weight": 20},
            {"id": "math-3", "name": "영역③ 학습활동 과정평가", "weight": 10},
        ],
    },
    {
        "id": "plan-sci",
        "name": "과학",
        "color": "#8B5CF6",
        "credits": 3,
        "exam1Ratio": 0,
        "exam2Ratio": 50,
        "perfRatio": 50,
        "gradeScale": "5tier",
        "sortOrder": 5,
        "areas": [
            {"id": "sci-1", "name": "영역① 기체의 성질 스토리보드(논술형)", "weight": 10},
            {"id": "sci-2", "name": "영역② 부력 탐구하기(탐구·논술형)", "weight": 15},
            {"id": "sci-3", "name": "영역③ 태양계 홍보프로젝트(탐구·논술형)", "weight": 25},
        ],
    },
    {
        "id": "plan-tech",
        "name": "기술·가정",
        "color": "#EC4899",
        "credits": 2,
        "exam1Ratio": 0,
        "exam2Ratio": 0,
        "perfRatio": 100,
        "gradeScale": "5tier",
        "sortOrder": 6,
        "areas": [
            {"id": "tech-1", "name": "영역① 영양소 표현·연구(실습/연구)", "weight": 40},
            {"id": "tech-2", "name": "영역② 합리적인 소비 생활(논술형)", "weight": 30},
            {"id": "tech-3", "name": "영역③ 기술 제작/실습 평가(변동 가능)", "weight": 30},
        ],
    },
    {
        "id": "plan-pe",
        "name": "체육",
        "color": "#F97316",
        "credits": 3,
        "exam1Ratio": 0,
        "exam2Ratio": 0,
        "perfRatio": 100,
        "gradeScale": "3tier",
        "sortOrder": 7,
        "areas": [
            {"id": "pe-1", "name": "영역① 체력/기초 실기 평가", "weight": 25},
            {"id": "pe-2", "name": "영역② 구기/스포츠 실기 평가", "weight": 25},
            {"id": "pe-3", "name": "영역③ 축구 리프팅", "weight": 25},
            {"id": "pe-4", "name": "영역④ 영역형 경쟁스포츠 논술", "weight": 25},
        ],
    },
    {
        "id": "plan-mus",
        "name": "음악",
        "color": "#6366F1",
        "credits": 2,
        "exam1Ratio": 0,
        "exam2Ratio": 0,
        "perfRatio": 100,
        "gradeScale": "3tier",
        "sortOrder": 8,
        "areas": [
            {"id": "mus-1", "name": "영역① 난타 연주하기", "weight": 30},
            {"id": "mus-2", "name": "영역② 리코더 연주하기", "weight": 30},
            {"id": "mus-3", "name": "영역③ 음악 감상하기", "weight": 20},
            {"id": "mus-4", "name": "영역④ 음악이 갖는 의미와 역할 설명", "weight": 20},
        ],
    },
    {
        "id": "plan-art",
        "name": "미술",
        "color": "#D946EF",
        "credits": 2,
        "exam1Ratio": 0,
        "exam2Ratio": 0,
        "perfRatio": 100,
        "gradeScale": "3tier",
        "sortOrder": 9,
        "areas": [
            {"id": "art-1", "name": "영역① 표현 활동 평가 1", "weight": 25},
            {"id": "art-2", "name": "영역② 표현 활동 평가 2", "weight": 25},
            {"id": "art-3", "name": "영역③ 디자인 표현 평가", "weight": 25},
            {"id": "art-4", "name": "영역④ 미술 작품 감상(논술형)", "weight": 25},
        ],
    },
    {
        "id": "plan-eng",
        "name": "영어",
        "color": "#F59E0B",
        "credits": 3,
        "exam1Ratio": 50,
        "exam2Ratio": 0,
        "perfRatio": 50,
        "gradeScale": "5tier",
        "sortOrder": 10,
        "areas": [
            {"id": "eng-1", "name": "영역① 리딩 로그 작성하기(논술형)", "weight": 20},
            {"id": "eng-2", "name": "영역② 영어 글쓰기/작문 평가(변동 가능)", "weight": 20},
            {"id": "eng-3", "name": "영역③ 희망 직업 소개하기(말하기)", "weight": 10},
        ],
    },
    {
        "id": "plan-info",
        "name": "정보",
        "color": "#06B6D4",
        "credits": 2,
        "exam1Ratio": 0,
        "exam2Ratio": 0,
        "perfRatio": 100,
        "gradeScale": "5tier",
        "sortOrder": 11,
        "areas": [
            {"id": "info-1", "name": "영역① 정보/데이터 영역 평가", "weight": 25},
            {"id": "info-2", "name": "영역② 알고리즘 영역 평가", "weight": 25},
            {"id": "info-3", "name": "영역③ 프로그래밍 실습", "weight": 25},
            {"id": "info-4", "name": "영역④ 인공지능윤리문제(논술형)", "weight": 25},
        ],
    },
]


def _next_weekday_str(base_date: datetime.date, target_weekday: int) -> str:
    for i in range(0, 14):
        cand = base_date + datetime.timedelta(days=i)
        if cand.weekday() == target_weekday:
            return cand.strftime("%Y-%m-%d")
    return base_date.strftime("%Y-%m-%d")


def _build_initial_assessments() -> list:
    today = datetime.date.today()
    mon = _next_weekday_str(today, 0)
    tue = _next_weekday_str(today, 1)
    wed = _next_weekday_str(today, 2)
    thu = _next_weekday_str(today, 3)
    fri = _next_weekday_str(today, 4)

    return [
        {
            "id": "task-init-1",
            "title": "존중하는 언어 생활 프로젝트",
            "subjectId": "sub-korB",
            "planId": "plan-kor",
            "areaId": "kor-2",
            "type": "보고서",
            "dueDate": mon,
            "period": 4,
            "weight": 20,
            "memo": "월요일 4교시 국어B 수업 시간 내 작성 및 제출",
            "subtasks": [
                {"id": "st-1", "text": "주제 선정 및 사례 조사"},
                {"id": "st-2", "text": "활동지 초안 작성 완료"},
                {"id": "st-3", "text": "수업 시간 내 최종 제출"},
            ],
        },
        {
            "id": "task-init-2",
            "title": "실생활 속 통계 활용(논술형)",
            "subjectId": "sub-mathA",
            "planId": "plan-math",
            "areaId": "math-1",
            "type": "보고서",
            "dueDate": tue,
            "period": 3,
            "weight": 20,
            "memo": "화요일 3교시 수학A 시간 실시, 통계 그래프 해석 연습",
            "subtasks": [
                {"id": "st-4", "text": "교과서 통계 단원 개념 복습"},
                {"id": "st-5", "text": "서술형 연습 프린트 풀이"},
            ],
        },
        {
            "id": "task-init-3",
            "title": "희망 직업 소개하기(말하기)",
            "subjectId": "sub-engB",
            "planId": "plan-eng",
            "areaId": "eng-3",
            "type": "발표",
            "dueDate": wed,
            "period": 1,
            "weight": 10,
            "memo": "수요일 1교시 영어B 수업 중 발표 진행",
            "subtasks": [
                {"id": "st-6", "text": "영어 발표 대본 작성 및 점검"},
                {"id": "st-7", "text": "발음 및 1분 스피치 리허설"},
            ],
        },
        {
            "id": "task-init-4",
            "title": "인공지능윤리문제(논술형)",
            "subjectId": "sub-info",
            "planId": "plan-info",
            "areaId": "info-4",
            "type": "보고서",
            "dueDate": thu,
            "period": 6,
            "weight": 25,
            "memo": "목요일 6교시 정보 시간 실시, AI 윤리 딜레마 사례 정리",
            "subtasks": [
                {"id": "st-8", "text": "인공지능 윤리 가이드라인 핵심 정리"},
                {"id": "st-9", "text": "논술형 답안 구조 연습"},
            ],
        },
        {
            "id": "task-init-5",
            "title": "생활 속의 법 탐구하기",
            "subjectId": "sub-socB",
            "planId": "plan-soc",
            "areaId": "soc-4",
            "type": "보고서",
            "dueDate": fri,
            "period": 4,
            "weight": 30,
            "memo": "금요일 4교시 사회B 수업 시간 제출",
            "subtasks": [
                {"id": "st-10", "text": "생활 속 법률 사례 2가지 조사"},
                {"id": "st-11", "text": "탐구 보고서 양식 작성"},
            ],
        },
    ]


# ============================================================================
# SQLite 데이터베이스 초기화 및 헬퍼 함수
# ============================================================================

def _hash_pw(pw: str) -> str:
    salted = f"{PASSWORD_SALT}:{pw}".encode("utf-8")
    return hashlib.sha256(salted).hexdigest()


def get_db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _bump_db_version(cur, explicit_ts: int = None) -> int:
    cur.execute("SELECT value FROM settings WHERE key = 'school_info'")
    row = cur.fetchone()
    info = json.loads(row["value"]) if row else {}
    ts = int(explicit_ts) if explicit_ts is not None else int(time.time() * 1000)
    info["dbUpdatedAt"] = ts
    cur.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('school_info', ?)",
        (json.dumps(info, ensure_ascii=False),),
    )
    return ts


def init_db():
    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS subjects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            group_name TEXT NOT NULL,
            plan_id TEXT DEFAULT '',
            color TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS timetable (
            slot_key TEXT PRIMARY KEY,
            subject TEXT NOT NULL,
            changed INTEGER DEFAULT 0
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS subject_plans (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            credits INTEGER NOT NULL,
            exam1_ratio INTEGER NOT NULL,
            exam2_ratio INTEGER NOT NULL,
            perf_ratio INTEGER NOT NULL,
            grade_scale TEXT NOT NULL,
            areas_json TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS assessments (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            subject_id TEXT NOT NULL,
            plan_id TEXT DEFAULT '',
            area_id TEXT DEFAULT '',
            type TEXT NOT NULL,
            due_date TEXT NOT NULL,
            period INTEGER,
            weight INTEGER DEFAULT 0,
            memo TEXT DEFAULT '',
            subtasks_json TEXT DEFAULT '[]',
            updated_at TEXT DEFAULT ''
        )
        """
    )

    cur.execute("SELECT value FROM settings WHERE key = 'school_info'")
    if not cur.fetchone():
        school_info = {
            "schoolName": "백현중학교",
            "neisOfficeCode": NEIS_OFFICE_CODE,
            "neisSchoolCode": NEIS_SCHOOL_CODE,
            "region": "경기(성남)",
            "grade": 1,
            "classNum": 3,
            "lastSyncAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "syncSource": "neis_and_db",
            "dbUpdatedAt": 0,
            "periodTimes": [
                "1(09:00)", "2(09:55)", "3(10:50)", "4(11:45)",
                "5(13:20)", "6(14:15)", "7(15:10)"
            ],
        }
        cur.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)",
            ("school_info", json.dumps(school_info, ensure_ascii=False)),
        )

    cur.execute("SELECT COUNT(*) AS cnt FROM subjects")
    if cur.fetchone()["cnt"] == 0:
        for idx, s in enumerate(INITIAL_SUBJECTS):
            cur.execute(
                """
                INSERT INTO subjects (id, name, group_name, plan_id, color, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (s["id"], s["name"], s["group"], s["planId"], s["color"], idx),
            )

    cur.execute("SELECT COUNT(*) AS cnt FROM timetable")
    if cur.fetchone()["cnt"] == 0:
        for slot_key, cell in INITIAL_TIMETABLE.items():
            cur.execute(
                "INSERT INTO timetable (slot_key, subject, changed) VALUES (?, ?, ?)",
                (slot_key, cell["subject"], 1 if cell.get("changed") else 0),
            )

    cur.execute("SELECT COUNT(*) AS cnt FROM subject_plans")
    if cur.fetchone()["cnt"] == 0:
        for plan in INITIAL_SUBJECT_PLANS:
            cur.execute(
                """
                INSERT INTO subject_plans
                (id, name, color, credits, exam1_ratio, exam2_ratio, perf_ratio, grade_scale, areas_json, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    plan["id"],
                    plan["name"],
                    plan["color"],
                    plan["credits"],
                    plan["exam1Ratio"],
                    plan["exam2Ratio"],
                    plan["perfRatio"],
                    plan["gradeScale"],
                    json.dumps(plan["areas"], ensure_ascii=False),
                    plan["sortOrder"],
                ),
            )

    cur.execute("SELECT COUNT(*) AS cnt FROM assessments")
    if cur.fetchone()["cnt"] == 0:
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        for a in _build_initial_assessments():
            cur.execute(
                """
                INSERT INTO assessments
                (id, title, subject_id, plan_id, area_id, type, due_date, period, weight, memo, subtasks_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    a["id"],
                    a["title"],
                    a["subjectId"],
                    a["planId"],
                    a["areaId"],
                    a["type"],
                    a["dueDate"],
                    a["period"],
                    a["weight"],
                    a["memo"],
                    json.dumps(a["subtasks"], ensure_ascii=False),
                    now_str,
                ),
            )

    conn.commit()
    conn.close()


def get_bootstrap_data() -> dict:
    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("SELECT value FROM settings WHERE key = 'school_info'")
    row = cur.fetchone()
    school_info = json.loads(row["value"]) if row else {}

    cur.execute("SELECT * FROM subjects ORDER BY sort_order ASC")
    subjects = [
        {
            "id": r["id"],
            "name": r["name"],
            "group": r["group_name"],
            "planId": r["plan_id"],
            "color": r["color"],
        }
        for r in cur.fetchall()
    ]

    cur.execute("SELECT * FROM timetable")
    timetable = {}
    for r in cur.fetchall():
        timetable[r["slot_key"]] = {
            "subject": r["subject"],
            "changed": bool(r["changed"]),
        }

    cur.execute("SELECT * FROM subject_plans ORDER BY sort_order ASC")
    subject_plans = [
        {
            "id": r["id"],
            "name": r["name"],
            "color": r["color"],
            "credits": r["credits"],
            "exam1Ratio": r["exam1_ratio"],
            "exam2Ratio": r["exam2_ratio"],
            "perfRatio": r["perf_ratio"],
            "gradeScale": r["grade_scale"],
            "areas": json.loads(r["areas_json"] or "[]"),
            "sortOrder": r["sort_order"],
        }
        for r in cur.fetchall()
    ]

    cur.execute("SELECT * FROM assessments ORDER BY due_date ASC, period ASC")
    assessments = [
        {
            "id": r["id"],
            "title": r["title"],
            "subjectId": r["subject_id"],
            "planId": r["plan_id"],
            "areaId": r["area_id"],
            "type": r["type"],
            "dueDate": r["due_date"],
            "period": r["period"],
            "weight": r["weight"],
            "memo": r["memo"],
            "subtasks": json.loads(r["subtasks_json"] or "[]"),
            "updatedAt": r["updated_at"],
        }
        for r in cur.fetchall()
    ]

    conn.close()
    return {
        "ok": True,
        "schoolInfo": school_info,
        "subjects": subjects,
        "timetable": timetable,
        "subjectPlans": subject_plans,
        "assessments": assessments,
    }


def verify_admin_password(pw: str) -> bool:
    if not pw:
        return False
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'admin_password_hash'")
    row = cur.fetchone()
    conn.close()
    target_hash = row["value"] if row else _hash_pw(DEFAULT_ADMIN_PASSWORD)
    return hmac.compare_digest(target_hash, _hash_pw(pw))


# ============================================================================
# 시간표 동기화 엔진 (교육부 나이스 NEIS 공식 공공데이터 Open API 전용)
# ============================================================================

def _http_get(url: str, encoding: str = "utf-8", timeout: float = 6.0) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "BaekhyunPlanner/3.0 (Student Educational Project; NEIS OpenAPI Client)"
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return raw.decode(encoding, errors="replace").rstrip("\x00").strip()


def fetch_neis_timetable(grade: int = 1, class_num: int = 3, api_key: str = "") -> dict:
    """
    교육부 나이스(NEIS) 교육정보 개방 포털 공식 공공데이터 Open API (misTimetable) 호출
    「공공데이터법」에 따라 합법적으로 개방된 공식 API만 사용합니다.
    """
    today = datetime.date.today()
    days_since_mon = today.weekday()
    if days_since_mon > 4:
        monday = today + datetime.timedelta(days=(7 - days_since_mon))
    else:
        monday = today - datetime.timedelta(days=days_since_mon)
    friday = monday + datetime.timedelta(days=4)

    params = {
        "Type": "json",
        "pIndex": "1",
        "pSize": "100",
        "ATPT_OFCDC_SC_CODE": NEIS_OFFICE_CODE,
        "SD_SCHUL_CODE": NEIS_SCHOOL_CODE,
        "GRADE": str(grade),
        "CLASS_NM": str(class_num),
        "TI_FROM_YMD": monday.strftime("%Y%m%d"),
        "TI_TO_YMD": friday.strftime("%Y%m%d"),
    }
    env_key = api_key or os.environ.get("NEIS_API_KEY", "")
    if env_key:
        params["KEY"] = env_key

    query_str = urllib.parse.urlencode(params)
    url = f"{NEIS_BASE_URL}/misTimetable?{query_str}"
    raw_json = _http_get(url, encoding="utf-8", timeout=6.0)
    data = json.loads(raw_json)

    if "misTimetable" not in data:
        raise ValueError("해당 주간 나이스 시간표 데이터가 아직 등록되지 않았습니다.")

    rows = []
    for block in data["misTimetable"]:
        if "row" in block:
            rows.extend(block["row"])

    if not rows:
        raise ValueError("나이스 시간표 행(row)이 비어 있습니다.")

    parsed_tt = {}
    discovered = []
    for r in rows:
        ymd = str(r.get("ALL_TI_YMD", ""))
        perio = int(r.get("PERIO", 0) or 0)
        subj = str(r.get("ITRT_CNTNT", "")).strip()
        subj = re.sub(r"^[\-\*\s]+", "", subj)
        if len(ymd) == 8 and 1 <= perio <= 8 and subj:
            dt = datetime.date(int(ymd[:4]), int(ymd[4:6]), int(ymd[6:8]))
            w_idx = dt.weekday()
            if 0 <= w_idx <= 4:
                parsed_tt[f"{w_idx}-{perio}"] = {
                    "subject": subj,
                    "changed": False,
                }
                if subj not in discovered:
                    discovered.append(subj)

    if not parsed_tt:
        raise ValueError("유효한 주간 교시 데이터가 없습니다.")

    return {
        "ok": True,
        "source": "neis_official_api",
        "updatedAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "subjects": discovered,
        "timetable": parsed_tt,
    }


def sync_timetable_to_db(api_key: str = "") -> dict:
    """
    교육부 나이스(NEIS) 공식 Open API에서 시간표를 조회하여 서버 SQLite DB에 저장합니다.
    """
    try:
        result = fetch_neis_timetable(1, 3, api_key=api_key)
    except Exception as exc:
        return {
            "ok": True,
            "source": "db_cached",
            "updatedAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "message": f"현재 서버 DB에 저장된 시간표를 유지합니다. (나이스 조회 안내: {exc})",
        }

    conn = get_db_conn()
    cur = conn.cursor()

    if result and result.get("timetable"):
        cur.execute("DELETE FROM timetable")
        for slot_key, cell in result["timetable"].items():
            cur.execute(
                "INSERT INTO timetable (slot_key, subject, changed) VALUES (?, ?, ?)",
                (slot_key, cell["subject"], 1 if cell.get("changed") else 0),
            )

        cur.execute("SELECT name FROM subjects")
        existing_names = {r["name"] for r in cur.fetchall()}
        for subj_name in result.get("subjects", []):
            if subj_name and subj_name not in existing_names:
                sub_id = "sub-" + hashlib.md5(subj_name.encode("utf-8")).hexdigest()[:6]
                cur.execute(
                    """
                    INSERT OR IGNORE INTO subjects (id, name, group_name, plan_id, color, sort_order)
                    VALUES (?, ?, ?, '', '#64748B', 99)
                    """,
                    (sub_id, subj_name, subj_name[:2]),
                )

        cur.execute("SELECT value FROM settings WHERE key = 'school_info'")
        s_row = cur.fetchone()
        s_info = json.loads(s_row["value"]) if s_row else {}
        s_info["lastSyncAt"] = result["updatedAt"]
        s_info["syncSource"] = "neis_official_api"
        cur.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('school_info', ?)",
            (json.dumps(s_info, ensure_ascii=False),),
        )
        conn.commit()
        conn.close()
        return {
            "ok": True,
            "source": "neis_official_api",
            "updatedAt": result["updatedAt"],
            "message": "교육부 나이스(NEIS) 공공데이터 시간표가 서버 DB에 동기화되었습니다.",
        }

    conn.close()
    return {
        "ok": True,
        "source": "db_cached",
        "updatedAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "message": "기존 서버 DB 시간표를 유지합니다.",
    }


# ============================================================================
# HTTP 요청 핸들러 (REST API + 정적 파일 서빙)
# ============================================================================

class SuhaengDBRequestHandler(http.server.SimpleHTTPRequestHandler):
    def _send_json(self, status_code: int, data: dict):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Password")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}

    def _check_admin(self, body: dict = None) -> bool:
        pw = self.headers.get("X-Admin-Password", "")
        if not pw and body and "adminPassword" in body:
            pw = str(body.get("adminPassword", ""))
        return verify_admin_password(pw)

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/healthz":
            self._send_json(200, {"ok": True, "status": "healthy"})
            return

        if parsed.path == "/api/bootstrap":
            self._send_json(200, get_bootstrap_data())
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        try:
            body = self._read_json_body()
        except Exception as e:
            self._send_json(400, {"ok": False, "error": f"잘못된 JSON 요청입니다: {e}"})
            return

        if parsed.path == "/api/admin/verify":
            pw = str(body.get("password", ""))
            if verify_admin_password(pw):
                self._send_json(200, {"ok": True, "message": "관리자 인증 성공"})
            else:
                self._send_json(401, {"ok": False, "error": "관리자 비밀번호가 일치하지 않습니다."})
            return

        if parsed.path == "/api/bootstrap/restore":
            incoming_ts = int(body.get("dbUpdatedAt", 0) or 0)
            if incoming_ts <= 0:
                self._send_json(400, {"ok": False, "error": "유효하지 않은 복구 타임스탬프입니다."})
                return

            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute("SELECT value FROM settings WHERE key = 'school_info'")
            s_row = cur.fetchone()
            s_info = json.loads(s_row["value"]) if s_row else {}
            current_ts = int(s_info.get("dbUpdatedAt", 0) or 0)

            # 서버가 초기화된 직후(current_ts == 0)이거나 관리자 인증이 된 경우 더 최신 스냅샷으로 자동 복구
            if incoming_ts > current_ts and (current_ts == 0 or self._check_admin(body)):
                assessments = body.get("assessments")
                if isinstance(assessments, list) and len(assessments) <= 200:
                    cur.execute("DELETE FROM assessments")
                    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
                    for a in assessments:
                        if not isinstance(a, dict):
                            continue
                        t_id = str(a.get("id") or "")[:60]
                        title = str(a.get("title") or "").strip()[:100]
                        sub_id = str(a.get("subjectId") or "").strip()[:50]
                        due_date = str(a.get("dueDate") or "").strip()[:20]
                        if not t_id or not title or not sub_id or not due_date:
                            continue
                        period = a.get("period")
                        period_int = int(period) if period not in (None, "", 0, "0") else None
                        subtasks = a.get("subtasks", [])
                        if not isinstance(subtasks, list):
                            subtasks = []
                        clean_subtasks = [
                            {
                                "id": str(st.get("id", f"st-{idx}"))[:40],
                                "text": str(st.get("text", "")).strip()[:200],
                            }
                            for idx, st in enumerate(subtasks[:20])
                            if isinstance(st, dict) and str(st.get("text", "")).strip()
                        ]
                        cur.execute(
                            """
                            INSERT OR REPLACE INTO assessments
                            (id, title, subject_id, plan_id, area_id, type, due_date, period, weight, memo, subtasks_json, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                t_id,
                                title,
                                sub_id,
                                str(a.get("planId") or "")[:50],
                                str(a.get("areaId") or "")[:50],
                                str(a.get("type") or "보고서")[:30],
                                due_date,
                                period_int,
                                int(a.get("weight", 0) or 0),
                                str(a.get("memo") or "").strip()[:500],
                                json.dumps(clean_subtasks, ensure_ascii=False),
                                str(a.get("updatedAt") or now_str)[:30],
                            ),
                        )

                timetable = body.get("timetable")
                if isinstance(timetable, dict) and len(timetable) <= 60:
                    cur.execute("DELETE FROM timetable")
                    for slot_key, cell in timetable.items():
                        if isinstance(cell, dict) and cell.get("subject"):
                            cur.execute(
                                "INSERT OR REPLACE INTO timetable (slot_key, subject, changed) VALUES (?, ?, ?)",
                                (str(slot_key)[:10], str(cell["subject"]).strip()[:30], 1 if cell.get("changed") else 0),
                            )

                _bump_db_version(cur, explicit_ts=incoming_ts)
                conn.commit()
            conn.close()
            self._send_json(200, get_bootstrap_data())
            return

        if parsed.path.startswith("/api/admin/"):
            if not self._check_admin(body):
                self._send_json(401, {"ok": False, "error": "서버 관리자 권한이 필요합니다."})
                return

        if parsed.path == "/api/admin/assessment":
            task_id = str(body.get("id") or f"task-{int(datetime.datetime.now().timestamp() * 1000)}")
            title = str(body.get("title", "")).strip()
            subject_id = str(body.get("subjectId", "")).strip()
            plan_id = str(body.get("planId", "")).strip()
            area_id = str(body.get("areaId", "")).strip()
            task_type = str(body.get("type", "보고서")).strip()
            due_date = str(body.get("dueDate", "")).strip()
            period = body.get("period")
            period_int = int(period) if period not in (None, "", 0, "0") else None
            weight = int(body.get("weight", 0) or 0)
            memo = str(body.get("memo", "")).strip()
            subtasks = body.get("subtasks", [])
            if not isinstance(subtasks, list):
                subtasks = []

            if not title or not subject_id or not due_date:
                self._send_json(400, {"ok": False, "error": "제목, 과목, 마감일은 필수입니다."})
                return

            if len(title) > 100:
                self._send_json(400, {"ok": False, "error": "제목은 100자 이내로 입력해 주세요."})
                return

            if len(memo) > 500:
                self._send_json(400, {"ok": False, "error": "안내 메모는 500자 이내로 입력해 주세요."})
                return

            subtasks = [
                {
                    "id": str(st.get("id", f"st-{idx}"))[:40],
                    "text": str(st.get("text", "")).strip()[:200],
                }
                for idx, st in enumerate(subtasks[:20])
                if isinstance(st, dict) and str(st.get("text", "")).strip()
            ]

            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT OR REPLACE INTO assessments
                (id, title, subject_id, plan_id, area_id, type, due_date, period, weight, memo, subtasks_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    title,
                    subject_id,
                    plan_id,
                    area_id,
                    task_type,
                    due_date,
                    period_int,
                    weight,
                    memo,
                    json.dumps(subtasks, ensure_ascii=False),
                    datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
                ),
            )
            _bump_db_version(cur)
            conn.commit()
            conn.close()
            self._send_json(200, get_bootstrap_data())
            return

        if parsed.path == "/api/admin/assessment/delete":
            task_id = str(body.get("id", "")).strip()
            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute("DELETE FROM assessments WHERE id = ?", (task_id,))
            _bump_db_version(cur)
            conn.commit()
            conn.close()
            self._send_json(200, get_bootstrap_data())
            return

        if parsed.path == "/api/admin/subject-plan":
            plan_id = str(body.get("id", "")).strip()
            name = str(body.get("name", "")).strip()
            color = str(body.get("color", "#4F46E5")).strip()
            credits = int(body.get("credits", 3) or 3)
            exam1_ratio = int(body.get("exam1Ratio", 0) or 0)
            exam2_ratio = int(body.get("exam2Ratio", 0) or 0)
            perf_ratio = int(body.get("perfRatio", 100) or 100)
            grade_scale = str(body.get("gradeScale", "5tier")).strip()
            areas = body.get("areas", [])
            if not isinstance(areas, list):
                areas = []

            if not plan_id or not name:
                self._send_json(400, {"ok": False, "error": "과목 평가계획 ID와 과목명은 필수입니다."})
                return

            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute("SELECT sort_order FROM subject_plans WHERE id = ?", (plan_id,))
            existing = cur.fetchone()
            sort_order = existing["sort_order"] if existing else 99

            cur.execute(
                """
                INSERT OR REPLACE INTO subject_plans
                (id, name, color, credits, exam1_ratio, exam2_ratio, perf_ratio, grade_scale, areas_json, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    plan_id,
                    name,
                    color,
                    credits,
                    exam1_ratio,
                    exam2_ratio,
                    perf_ratio,
                    grade_scale,
                    json.dumps(areas, ensure_ascii=False),
                    sort_order,
                ),
            )
            _bump_db_version(cur)
            conn.commit()
            conn.close()
            self._send_json(200, get_bootstrap_data())
            return

        if parsed.path == "/api/admin/timetable/cell":
            slot_key = str(body.get("slotKey", "")).strip()
            subject_name = str(body.get("subject", "")).strip()
            if not slot_key:
                self._send_json(400, {"ok": False, "error": "slotKey가 필요합니다."})
                return

            conn = get_db_conn()
            cur = conn.cursor()
            if not subject_name:
                cur.execute("DELETE FROM timetable WHERE slot_key = ?", (slot_key,))
            else:
                cur.execute(
                    "INSERT OR REPLACE INTO timetable (slot_key, subject, changed) VALUES (?, ?, 0)",
                    (slot_key, subject_name),
                )
                cur.execute("SELECT id FROM subjects WHERE name = ?", (subject_name,))
                if not cur.fetchone():
                    sub_id = "sub-" + hashlib.md5(subject_name.encode("utf-8")).hexdigest()[:6]
                    cur.execute(
                        "INSERT INTO subjects (id, name, group_name, plan_id, color, sort_order) VALUES (?, ?, ?, '', '#64748B', 99)",
                        (sub_id, subject_name, subject_name[:2]),
                    )
            _bump_db_version(cur)
            conn.commit()
            conn.close()
            self._send_json(200, get_bootstrap_data())
            return

        if parsed.path == "/api/admin/timetable/sync":
            api_key = str(body.get("neisApiKey", ""))
            sync_res = sync_timetable_to_db(api_key=api_key)
            boot = get_bootstrap_data()
            boot["syncResult"] = sync_res
            self._send_json(200, boot)
            return

        if parsed.path == "/api/admin/password":
            new_pw = str(body.get("newPassword", "")).strip()
            if len(new_pw) < 4:
                self._send_json(400, {"ok": False, "error": "새 비밀번호는 4자 이상이어야 합니다."})
                return
            conn = get_db_conn()
            cur = conn.cursor()
            cur.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password_hash', ?)",
                (_hash_pw(new_pw),),
            )
            conn.commit()
            conn.close()
            self._send_json(200, {"ok": True, "message": "관리자 비밀번호가 변경되었습니다."})
            return

        self._send_json(404, {"ok": False, "error": "존재하지 않는 API 경로입니다."})

    def log_message(self, fmt, *args):
        sys.stderr.write("[Server] %s - %s\n" % (self.address_string(), fmt % args))


def _start_keepalive_thread():
    """Render 무료 인스턴스 15분 절전(Spin-down) 및 DB 초기화 방지를 위한 8분 주기 Keep-Alive 핑"""
    external_url = os.environ.get("RENDER_EXTERNAL_URL", "https://bakhyun-planner.onrender.com").rstrip("/")
    health_url = f"{external_url}/healthz"

    def _ping_loop():
        while True:
            time.sleep(480)
            try:
                _http_get(health_url, timeout=10.0)
            except Exception:
                pass

    t = threading.Thread(target=_ping_loop, daemon=True)
    t.start()


def run_server(port: int = 8080):
    init_db()
    os.chdir(BASE_DIR)
    _start_keepalive_thread()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), SuhaengDBRequestHandler) as httpd:
        print("============================================================")
        print(" 🏫 백현중학교 1-3반 수행평가 & 성적표 DB 서버 v3")
        print(f" 🗄️ SQLite DB 파일: {DB_PATH}")
        if not os.environ.get("ADMIN_PASSWORD"):
            print(f" 🔑 [임시 관리자 비밀번호]: {DEFAULT_ADMIN_PASSWORD} (환경변수 ADMIN_PASSWORD 미설정)")
        print(f" 👉 브라우저 접속 주소: http://localhost:{port}")
        print("============================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n서버를 종료합니다.")


if __name__ == "__main__":
    init_db()
    if "--test" in sys.argv:
        data = get_bootstrap_data()
        print("DB Initialized OK!")
        print("Subjects count:", len(data["subjects"]))
        print("Timetable slots count:", len(data["timetable"]))
        print("Subject Plans count:", len(data["subjectPlans"]))
        print("Assessments count:", len(data["assessments"]))
    else:
        port_arg = int(os.environ.get("PORT", "8080"))
        for arg in sys.argv[1:]:
            if arg.isdigit():
                port_arg = int(arg)
        run_server(port_arg)
