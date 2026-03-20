use crate::models::Spot;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct DbState(pub Arc<Mutex<Connection>>);

pub fn init_db(app_data_dir: PathBuf) -> Arc<Mutex<Connection>> {
    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
    let db_path = app_data_dir.join("pskmap.db");
    println!("[PSKmap] Database: {}", db_path.display());

    let conn = Connection::open(&db_path).expect("Failed to open SQLite database");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS spots (
            sender_callsign TEXT NOT NULL,
            receiver_callsign TEXT NOT NULL,
            sender_locator TEXT,
            receiver_locator TEXT,
            frequency INTEGER NOT NULL,
            mode TEXT NOT NULL,
            snr INTEGER,
            timestamp INTEGER,
            sender_lat REAL,
            sender_lon REAL,
            receiver_lat REAL,
            receiver_lon REAL,
            distance_km REAL,
            receiver_dxcc TEXT,
            receiver_dxcc_code TEXT,
            sender_lotw_upload TEXT,
            UNIQUE(sender_callsign, receiver_callsign, frequency, timestamp)
        );

        CREATE INDEX IF NOT EXISTS idx_spots_sender ON spots(sender_callsign, timestamp);

        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )
    .expect("Failed to create tables");

    Arc::new(Mutex::new(conn))
}

pub fn insert_spots(conn: &Connection, spots: &[Spot]) {
    let mut count = 0u32;
    for spot in spots {
        let result = conn.execute(
            "INSERT OR IGNORE INTO spots (
                sender_callsign, receiver_callsign, sender_locator, receiver_locator,
                frequency, mode, snr, timestamp,
                sender_lat, sender_lon, receiver_lat, receiver_lon,
                distance_km, receiver_dxcc, receiver_dxcc_code, sender_lotw_upload
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                spot.sender_callsign,
                spot.receiver_callsign,
                spot.sender_locator,
                spot.receiver_locator,
                spot.frequency as i64,
                spot.mode,
                spot.snr,
                spot.timestamp,
                spot.sender_lat,
                spot.sender_lon,
                spot.receiver_lat,
                spot.receiver_lon,
                spot.distance_km,
                spot.receiver_dxcc,
                spot.receiver_dxcc_code,
                spot.sender_lotw_upload,
            ],
        );
        if let Ok(rows) = result {
            if rows > 0 {
                count += 1;
            }
        }
    }
    if count > 0 {
        println!("[PSKmap] DB: inserted {} new spots", count);
    }
}

pub fn insert_spot(conn: &Connection, spot: &Spot) {
    let _ = conn.execute(
        "INSERT OR IGNORE INTO spots (
            sender_callsign, receiver_callsign, sender_locator, receiver_locator,
            frequency, mode, snr, timestamp,
            sender_lat, sender_lon, receiver_lat, receiver_lon,
            distance_km, receiver_dxcc, receiver_dxcc_code, sender_lotw_upload
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            spot.sender_callsign,
            spot.receiver_callsign,
            spot.sender_locator,
            spot.receiver_locator,
            spot.frequency as i64,
            spot.mode,
            spot.snr,
            spot.timestamp,
            spot.sender_lat,
            spot.sender_lon,
            spot.receiver_lat,
            spot.receiver_lon,
            spot.distance_km,
            spot.receiver_dxcc,
            spot.receiver_dxcc_code,
            spot.sender_lotw_upload,
        ],
    );
}

pub fn get_spots_for_callsign(conn: &Connection, callsign: &str) -> Vec<Spot> {
    let mut stmt = conn
        .prepare(
            "SELECT sender_callsign, receiver_callsign, sender_locator, receiver_locator,
                    frequency, mode, snr, timestamp,
                    sender_lat, sender_lon, receiver_lat, receiver_lon,
                    distance_km, receiver_dxcc, receiver_dxcc_code, sender_lotw_upload
             FROM spots
             WHERE sender_callsign = ?1
             ORDER BY timestamp DESC",
        )
        .unwrap();

    let rows = stmt
        .query_map(params![callsign], |row| {
            Ok(Spot {
                sender_callsign: row.get(0)?,
                receiver_callsign: row.get(1)?,
                sender_locator: row.get(2)?,
                receiver_locator: row.get(3)?,
                frequency: row.get::<_, i64>(4)? as u64,
                mode: row.get(5)?,
                snr: row.get(6)?,
                timestamp: row.get(7)?,
                sender_lat: row.get(8)?,
                sender_lon: row.get(9)?,
                receiver_lat: row.get(10)?,
                receiver_lon: row.get(11)?,
                distance_km: row.get(12)?,
                receiver_dxcc: row.get(13)?,
                receiver_dxcc_code: row.get(14)?,
                sender_lotw_upload: row.get(15)?,
                decoder_software: None,
                antenna_information: None,
                rig_information: None,
                region: None,
            })
        })
        .unwrap();

    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_metadata(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM metadata WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_metadata(conn: &Connection, key: &str, value: &str) {
    conn.execute(
        "INSERT INTO metadata (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .unwrap();
}

pub fn prune_old_spots(conn: &Connection, max_age_days: i64) {
    let cutoff = chrono::Utc::now().timestamp() - (max_age_days * 86400);
    let deleted = conn
        .execute(
            "DELETE FROM spots WHERE timestamp IS NOT NULL AND timestamp < ?1",
            params![cutoff],
        )
        .unwrap_or(0);
    if deleted > 0 {
        println!("[PSKmap] DB: pruned {} spots older than {} days", deleted, max_age_days);
    }
}
