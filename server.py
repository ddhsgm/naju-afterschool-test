from __future__ import annotations

import csv
import json
import os
import secrets
import sqlite3
from collections import defaultdict
from datetime import datetime
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import build_data


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "afterschool.db"
SESSION_COOKIE = "afterschool_session"
ADMIN_PASSWORD = os.environ.get("AFTERSCHOOL_ADMIN_PASSWORD", "naju-admin-2026")
SESSIONS: dict[str, dict[str, str]] = {}

BOOTSTRAP_DATA: dict[str, object] = {}
MISSING_CONTACTS: list[str] = []


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def ensure_schema() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS students (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                grade INTEGER NOT NULL,
                grade_label TEXT NOT NULL,
                class_room INTEGER NOT NULL,
                class_label TEXT NOT NULL,
                number_label TEXT,
                phone TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS courses (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                days_json TEXT NOT NULL,
                room TEXT,
                location TEXT,
                teacher TEXT,
                teacher_phone TEXT,
                capacity INTEGER,
                fee_type TEXT,
                fee TEXT,
                note TEXT
            );

            CREATE TABLE IF NOT EXISTS course_slots (
                id TEXT PRIMARY KEY,
                course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                period TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                grade_min INTEGER NOT NULL,
                grade_max INTEGER NOT NULL,
                days_json TEXT NOT NULL,
                room TEXT,
                location TEXT,
                capacity INTEGER
            );

            CREATE TABLE IF NOT EXISTS applications (
                student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                slot_id TEXT NOT NULL REFERENCES course_slots(id) ON DELETE CASCADE,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (student_id, slot_id)
            );
            """
        )


def make_public_bootstrap(courses: list[dict[str, object]], student_count: int) -> dict[str, object]:
    max_grade = max((slot["gradeMax"] for course in courses for slot in course["slots"]), default=6)
    max_class = 6
    return {
        "meta": {
            "schoolName": "나주중앙초등학교",
            "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "studentCount": student_count,
            "days": ["월", "화", "수", "목", "금"],
            "periods": build_data.PERIODS,
            "maxGrade": max_grade,
            "maxClass": max_class,
        },
        "courses": courses,
    }


def sync_source_data() -> dict[str, int]:
    global BOOTSTRAP_DATA, MISSING_CONTACTS

    room_index = build_data.build_room_index()
    students, missing_contacts = build_data.build_students()
    courses = build_data.build_courses(room_index)

    ensure_schema()

    student_ids = {student["id"] for student in students}
    course_ids = {course["id"] for course in courses}
    slot_ids = {slot["id"] for course in courses for slot in course["slots"]}

    with get_connection() as connection:
      connection.execute("UPDATE students SET active = 0")
      for student in students:
          connection.execute(
              """
              INSERT INTO students (id, name, grade, grade_label, class_room, class_label, number_label, phone, active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
              ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  grade = excluded.grade,
                  grade_label = excluded.grade_label,
                  class_room = excluded.class_room,
                  class_label = excluded.class_label,
                  number_label = excluded.number_label,
                  phone = excluded.phone,
                  active = 1
              """,
              (
                  student["id"],
                  student["name"],
                  student["grade"],
                  student["gradeLabel"],
                  student["classRoom"],
                  student["classLabel"],
                  student["numberLabel"],
                  student["phone"],
              ),
          )

      existing_course_ids = {row["id"] for row in connection.execute("SELECT id FROM courses")}
      existing_slot_ids = {row["id"] for row in connection.execute("SELECT id FROM course_slots")}

      for course in courses:
          connection.execute(
              """
              INSERT INTO courses (id, name, days_json, room, location, teacher, teacher_phone, capacity, fee_type, fee, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  days_json = excluded.days_json,
                  room = excluded.room,
                  location = excluded.location,
                  teacher = excluded.teacher,
                  teacher_phone = excluded.teacher_phone,
                  capacity = excluded.capacity,
                  fee_type = excluded.fee_type,
                  fee = excluded.fee,
                  note = excluded.note
              """,
              (
                  course["id"],
                  course["name"],
                  json.dumps(course["days"], ensure_ascii=False),
                  course["room"],
                  course["location"],
                  course["teacher"],
                  course["teacherPhone"],
                  course["capacity"],
                  course["feeType"],
                  course["fee"],
                  course["note"],
              ),
          )
          for slot in course["slots"]:
              connection.execute(
                  """
                  INSERT INTO course_slots (id, course_id, period, start_time, end_time, grade_min, grade_max, days_json, room, location, capacity)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET
                      course_id = excluded.course_id,
                      period = excluded.period,
                      start_time = excluded.start_time,
                      end_time = excluded.end_time,
                      grade_min = excluded.grade_min,
                      grade_max = excluded.grade_max,
                      days_json = excluded.days_json,
                      room = excluded.room,
                      location = excluded.location,
                      capacity = excluded.capacity
                  """,
                  (
                      slot["id"],
                      course["id"],
                      slot["period"],
                      slot["start"],
                      slot["end"],
                      slot["gradeMin"],
                      slot["gradeMax"],
                      json.dumps(slot["days"], ensure_ascii=False),
                      slot["room"],
                      slot["location"],
                      slot["capacity"],
                  ),
              )

      for stale_slot_id in existing_slot_ids - slot_ids:
          connection.execute("DELETE FROM course_slots WHERE id = ?", (stale_slot_id,))
      for stale_course_id in existing_course_ids - course_ids:
          connection.execute("DELETE FROM courses WHERE id = ?", (stale_course_id,))

      if student_ids:
          placeholders = ",".join("?" for _ in student_ids)
          connection.execute(
              f"UPDATE students SET active = 0 WHERE id NOT IN ({placeholders})",
              tuple(student_ids),
          )

    BOOTSTRAP_DATA = make_public_bootstrap(courses, len(students))
    MISSING_CONTACTS = missing_contacts
    return {
        "students": len(students),
        "missing_contacts": len(missing_contacts),
        "courses": len(courses),
        "slots": len(slot_ids),
    }


def mask_phone(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) == 11:
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    return phone


def format_dt(value: str | None) -> str:
    if not value:
        return ""
    try:
        dt = datetime.fromisoformat(value)
        return dt.strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return value


def get_session(cookie_header: str | None) -> dict[str, str] | None:
    if not cookie_header:
        return None
    jar = cookies.SimpleCookie()
    jar.load(cookie_header)
    morsel = jar.get(SESSION_COOKIE)
    if not morsel:
        return None
    return SESSIONS.get(morsel.value)


def create_session(session_type: str, identifier: str) -> str:
    token = secrets.token_urlsafe(24)
    SESSIONS[token] = {"type": session_type, "id": identifier}
    return token


def clear_session(cookie_header: str | None) -> str | None:
    if not cookie_header:
        return None
    jar = cookies.SimpleCookie()
    jar.load(cookie_header)
    morsel = jar.get(SESSION_COOKIE)
    if not morsel:
        return None
    return SESSIONS.pop(morsel.value, None) and morsel.value


def get_student_payload(student_id: str) -> tuple[dict[str, object] | None, list[str], str | None]:
    with get_connection() as connection:
        student = connection.execute(
            """
            SELECT id, name, grade, grade_label, class_room, class_label, phone
            FROM students
            WHERE id = ? AND active = 1
            """,
            (student_id,),
        ).fetchone()
        if not student:
            return None, [], None

        rows = connection.execute(
            """
            SELECT a.slot_id, MAX(a.updated_at) AS updated_at
            FROM applications a
            WHERE a.student_id = ?
            GROUP BY a.slot_id
            ORDER BY a.slot_id
            """,
            (student_id,),
        ).fetchall()
        selections = [row["slot_id"] for row in rows]
        updated_at = max((row["updated_at"] for row in rows), default=None)

    return (
        {
            "id": student["id"],
            "name": student["name"],
            "grade": student["grade"],
            "gradeLabel": student["grade_label"],
            "classRoom": student["class_room"],
            "classLabel": student["class_label"],
            "phoneMasked": mask_phone(student["phone"]),
            "updatedAtLabel": format_dt(updated_at),
        },
        selections,
        updated_at,
    )


def get_slot_catalog() -> dict[str, dict[str, object]]:
    catalog: dict[str, dict[str, object]] = {}
    for course in BOOTSTRAP_DATA["courses"]:
        for slot in course["slots"]:
            catalog[slot["id"]] = {"course": course, "slot": slot}
    return catalog


def validate_selections(student: dict[str, object], selections: list[str]) -> list[str]:
    catalog = get_slot_catalog()
    picked: list[dict[str, object]] = []
    course_ids: set[str] = set()
    unique_selections: list[str] = []

    for slot_id in selections:
        if slot_id not in catalog:
            raise ValueError("존재하지 않는 강좌 시간을 선택했습니다.")
        if slot_id in unique_selections:
            continue
        unique_selections.append(slot_id)
        record = catalog[slot_id]
        course = record["course"]
        slot = record["slot"]
        if student["grade"] < slot["gradeMin"] or student["grade"] > slot["gradeMax"]:
            raise ValueError(f"{course['name']} {slot['period']}은(는) 신청 대상 학년이 아닙니다.")
        if course["id"] in course_ids:
            raise ValueError(f"{course['name']}은(는) 한 시간대만 선택할 수 있습니다.")
        for existing in picked:
            if existing["slot"]["period"] == slot["period"] and set(existing["slot"]["days"]) & set(slot["days"]):
                raise ValueError(
                    f"{course['name']} {slot['period']}은(는) {existing['course']['name']} {existing['slot']['period']}과 시간이 겹칩니다."
                )
        picked.append(record)
        course_ids.add(course["id"])

    return unique_selections


def build_admin_summary() -> dict[str, object]:
    with get_connection() as connection:
        students = connection.execute(
            """
            SELECT id, name, grade, grade_label, class_room, class_label, phone
            FROM students
            WHERE active = 1
            ORDER BY grade, class_room, name
            """
        ).fetchall()
        applications = connection.execute(
            """
            SELECT
                a.student_id,
                a.updated_at,
                c.name AS course_name,
                cs.period,
                cs.start_time,
                cs.end_time,
                cs.days_json
            FROM applications a
            JOIN course_slots cs ON cs.id = a.slot_id
            JOIN courses c ON c.id = cs.course_id
            ORDER BY a.student_id, c.name, cs.period
            """
        ).fetchall()

    grouped: dict[str, list[sqlite3.Row]] = defaultdict(list)
    for row in applications:
        grouped[row["student_id"]].append(row)

    student_entries: list[dict[str, object]] = []
    applied_student_count = 0
    selection_count = 0

    for student in students:
        rows = grouped.get(student["id"], [])
        if rows:
            applied_student_count += 1
            selection_count += len(rows)

        student_entries.append(
            {
                "id": student["id"],
                "name": student["name"],
                "gradeLabel": student["grade_label"],
                "classLabel": student["class_label"],
                "phoneMasked": mask_phone(student["phone"]),
                "updatedAtLabel": format_dt(max((row["updated_at"] for row in rows), default=None)),
                "selections": [
                    {
                        "courseName": row["course_name"],
                        "period": row["period"],
                        "start": row["start_time"],
                        "end": row["end_time"],
                        "days": json.loads(row["days_json"]),
                    }
                    for row in rows
                ],
            }
        )

    return {
        "studentCount": len(students),
        "appliedStudentCount": applied_student_count,
        "selectionCount": selection_count,
        "students": student_entries,
        "missingContacts": MISSING_CONTACTS,
        "exportUrl": "/api/admin/export.csv",
    }


class AfterSchoolHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status: int, payload: dict[str, object], extra_headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_csv(self, filename: str, rows: list[list[str]]) -> None:
        text_lines: list[str] = []
        for row in rows:
            output = []
            for value in row:
                escaped = str(value).replace('"', '""')
                output.append(f'"{escaped}"')
            text_lines.append(",".join(output))
        body = "\n".join(text_lines).encode("utf-8-sig")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def parse_json_body(self) -> dict[str, object]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def get_current_session(self) -> dict[str, str] | None:
        return get_session(self.headers.get("Cookie"))

    def require_student(self) -> dict[str, str]:
        session = self.get_current_session()
        if not session or session.get("type") != "student":
            raise PermissionError("학부모 로그인이 필요합니다.")
        return session

    def require_admin(self) -> dict[str, str]:
        session = self.get_current_session()
        if not session or session.get("type") != "admin":
            raise PermissionError("관리자 로그인이 필요합니다.")
        return session

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.path = "/index.html"
            return super().do_GET()
        if parsed.path == "/admin":
            self.path = "/admin.html"
            return super().do_GET()

        if parsed.path == "/api/bootstrap":
            self.send_json(200, BOOTSTRAP_DATA)
            return

        if parsed.path == "/api/me":
            try:
                session = self.require_student()
                student, selections, _ = get_student_payload(session["id"])
                if not student:
                    raise PermissionError("학생 정보를 찾지 못했습니다.")
                self.send_json(200, {"student": student, "selections": selections})
            except PermissionError as error:
                self.send_json(401, {"error": str(error)})
            return

        if parsed.path == "/api/admin/summary":
            try:
                self.require_admin()
                self.send_json(200, build_admin_summary())
            except PermissionError as error:
                self.send_json(401, {"error": str(error)})
            return

        if parsed.path == "/api/admin/export.csv":
            try:
                self.require_admin()
                summary = build_admin_summary()
                rows = [
                    ["학년", "반", "이름", "연락처", "신청수", "신청내역", "저장시각"]
                ]
                for student in summary["students"]:
                    selections = " / ".join(
                        f"{selection['courseName']} {selection['period']} ({', '.join(selection['days'])} {selection['start']}~{selection['end']})"
                        for selection in student["selections"]
                    )
                    rows.append(
                        [
                            student["gradeLabel"],
                            student["classLabel"],
                            student["name"],
                            student["phoneMasked"],
                            str(len(student["selections"])),
                            selections,
                            student["updatedAtLabel"],
                        ]
                    )
                self.send_csv("afterschool-applications.csv", rows)
            except PermissionError as error:
                self.send_json(401, {"error": str(error)})
            return

        return super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/login":
            payload = self.parse_json_body()
            grade = int(payload.get("grade") or 0)
            class_room = int(payload.get("classRoom") or 0)
            name = str(payload.get("name") or "").strip()
            phone = "".join(ch for ch in str(payload.get("phone") or "") if ch.isdigit())

            with get_connection() as connection:
                student = connection.execute(
                    """
                    SELECT id
                    FROM students
                    WHERE active = 1 AND grade = ? AND class_room = ? AND name = ? AND phone = ?
                    """,
                    (grade, class_room, name, phone),
                ).fetchone()

            if not student:
                self.send_json(401, {"error": "일치하는 학생 정보를 찾지 못했습니다. 입력값을 다시 확인해 주세요."})
                return

            token = create_session("student", student["id"])
            student_payload, selections, _ = get_student_payload(student["id"])
            self.send_json(
                200,
                {"student": student_payload, "selections": selections},
                extra_headers={"Set-Cookie": f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax"},
            )
            return

        if parsed.path == "/api/logout":
            cookie_token = clear_session(self.headers.get("Cookie"))
            header = "Set-Cookie"
            value = f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
            self.send_json(200, {"ok": True}, extra_headers={header: value} if cookie_token is not None else None)
            return

        if parsed.path == "/api/applications":
            try:
                session = self.require_student()
                payload = self.parse_json_body()
                student, _, _ = get_student_payload(session["id"])
                if not student:
                    raise PermissionError("학생 정보를 찾지 못했습니다.")
                selections = validate_selections(student, list(payload.get("selections") or []))
                now = datetime.now().isoformat(timespec="seconds")
                with get_connection() as connection:
                    connection.execute("DELETE FROM applications WHERE student_id = ?", (student["id"],))
                    for slot_id in selections:
                        connection.execute(
                            "INSERT INTO applications (student_id, slot_id, updated_at) VALUES (?, ?, ?)",
                            (student["id"], slot_id, now),
                        )
                self.send_json(200, {"ok": True, "selections": selections, "updatedAt": now, "updatedAtLabel": format_dt(now)})
            except PermissionError as error:
                self.send_json(401, {"error": str(error)})
            except ValueError as error:
                self.send_json(400, {"error": str(error)})
            return

        if parsed.path == "/api/applications/cancel":
            try:
                session = self.require_student()
                with get_connection() as connection:
                    connection.execute("DELETE FROM applications WHERE student_id = ?", (session["id"],))
                self.send_json(200, {"ok": True, "selections": [], "updatedAtLabel": ""})
            except PermissionError as error:
                self.send_json(401, {"error": str(error)})
            return

        if parsed.path == "/api/admin/login":
            payload = self.parse_json_body()
            password = str(payload.get("password") or "")
            if password != ADMIN_PASSWORD:
                self.send_json(401, {"error": "관리자 비밀번호가 올바르지 않습니다."})
                return
            token = create_session("admin", "admin")
            self.send_json(
                200,
                {"ok": True},
                extra_headers={"Set-Cookie": f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax"},
            )
            return

        if parsed.path == "/api/admin/reload":
            try:
                self.require_admin()
                result = sync_source_data()
                self.send_json(200, {"ok": True, "message": f"원본자료를 다시 반영했습니다. 학생 {result['students']}명, 강좌 {result['courses']}개"})
            except PermissionError as error:
                self.send_json(401, {"error": str(error)})
            return

        self.send_json(404, {"error": "존재하지 않는 API입니다."})


def run() -> None:
    result = sync_source_data()
    port = int(os.environ.get("AFTERSCHOOL_PORT", "8016"))
    print(f"Loaded students={result['students']}, courses={result['courses']}, missing_contacts={result['missing_contacts']}")
    print(f"Admin password: {ADMIN_PASSWORD}")
    print(f"Open http://127.0.0.1:{port}/")
    print(f"Admin http://127.0.0.1:{port}/admin.html")

    server = ThreadingHTTPServer(("0.0.0.0", port), AfterSchoolHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
