-- Cloudflare D1(SQLite)용 초기 데이터 모델.
-- 실제 D1을 만들기 전에도 스키마와 연결키를 먼저 합의할 수 있도록 둡니다.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS data_source (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  source_table_id TEXT,
  refresh_cycle TEXT,
  license TEXT,
  owner_team TEXT,
  public_scope TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingest_run (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES data_source(source_id),
  target_period TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','success','failed','rejected')),
  raw_object_key TEXT,
  raw_sha256 TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS school (
  school_code TEXT PRIMARY KEY,
  school_name TEXT NOT NULL,
  school_level TEXT NOT NULL,
  establishment_type TEXT,
  address TEXT,
  sido_code TEXT NOT NULL,
  sigungu_code TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  valid_from TEXT,
  valid_to TEXT,
  source_run_id INTEGER REFERENCES ingest_run(run_id)
);

CREATE INDEX IF NOT EXISTS idx_school_region_level
  ON school(sigungu_code, school_level);

CREATE TABLE IF NOT EXISTS school_stat_year (
  school_code TEXT NOT NULL REFERENCES school(school_code),
  reference_year INTEGER NOT NULL,
  disclosure_term TEXT,
  student_count INTEGER,
  class_count INTEGER,
  teacher_count INTEGER,
  special_student_count INTEGER,
  source_run_id INTEGER REFERENCES ingest_run(run_id),
  PRIMARY KEY (school_code, reference_year, disclosure_term)
);

CREATE TABLE IF NOT EXISTS population_projection (
  region_code TEXT NOT NULL,
  reference_year INTEGER NOT NULL,
  age INTEGER NOT NULL,
  population INTEGER NOT NULL,
  source_version TEXT NOT NULL,
  source_run_id INTEGER REFERENCES ingest_run(run_id),
  PRIMARY KEY (region_code, reference_year, age, source_version)
);

CREATE TABLE IF NOT EXISTS data_quality_issue (
  issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ingest_run(run_id),
  dataset_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','error')),
  record_key TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','fixed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dataset_version (
  dataset_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  reference_date TEXT,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  run_id INTEGER REFERENCES ingest_run(run_id),
  record_count INTEGER NOT NULL DEFAULT 0,
  content_sha256 TEXT NOT NULL
);
