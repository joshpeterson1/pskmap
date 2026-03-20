use crate::external_spots::ExternalSpot;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

const SUMMITS_CSV_URL: &str = "https://storage.sota.org.uk/summitslist.csv";
const SPOTS_URL: &str = "https://api2.sota.org.uk/api/spots/60/all";
const SUMMITS_MAX_AGE_DAYS: u64 = 90;

/// Cached summit lookup: SummitCode → (lat, lon, name, alt_m, points)
static SUMMITS_CACHE: std::sync::OnceLock<Mutex<HashMap<String, SummitInfo>>> =
    std::sync::OnceLock::new();

#[derive(Clone)]
struct SummitInfo {
    lat: f64,
    lon: f64,
    name: String,
    alt_m: u32,
    points: u8,
    region: String,
}

#[derive(Debug, Deserialize)]
struct SotaSpotRaw {
    #[serde(rename = "activatorCallsign")]
    activator_callsign: Option<String>,
    frequency: Option<String>,
    mode: Option<String>,
    #[serde(rename = "associationCode")]
    association_code: Option<String>,
    #[serde(rename = "summitCode")]
    summit_code: Option<String>,
    #[serde(rename = "summitDetails")]
    summit_details: Option<String>,
    #[serde(rename = "timeStamp")]
    timestamp: Option<String>,
    callsign: Option<String>,
    comments: Option<String>,
}

fn summits_csv_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("sota_summits.csv")
}

/// Check if the cached CSV needs updating (>90 days old or missing).
pub fn needs_summit_update(app_data_dir: &PathBuf) -> bool {
    let path = summits_csv_path(app_data_dir);
    match std::fs::metadata(&path) {
        Ok(meta) => {
            if let Ok(modified) = meta.modified() {
                if let Ok(age) = modified.elapsed() {
                    return age > Duration::from_secs(SUMMITS_MAX_AGE_DAYS * 86400);
                }
            }
            false
        }
        Err(_) => true,
    }
}

/// Download the summits CSV and save to disk.
pub async fn download_summits_csv(app_data_dir: &PathBuf) -> Result<(), String> {
    let path = summits_csv_path(app_data_dir);
    println!("[PSKmap] SOTA: downloading summits CSV...");

    let client = reqwest::Client::new();
    let resp = client
        .get(SUMMITS_CSV_URL)
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("SOTA CSV download failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("SOTA CSV returned status {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("SOTA CSV read failed: {}", e))?;

    std::fs::write(&path, &bytes)
        .map_err(|e| format!("SOTA CSV write failed: {}", e))?;

    println!(
        "[PSKmap] SOTA: summits CSV saved ({:.1} MB)",
        bytes.len() as f64 / 1_048_576.0
    );

    // Clear in-memory cache so it reloads from new file
    if let Some(cache) = SUMMITS_CACHE.get() {
        cache.lock().unwrap().clear();
    }

    Ok(())
}

/// Load summits from CSV into memory cache.
fn load_summits(app_data_dir: &PathBuf) -> HashMap<String, SummitInfo> {
    let cache = SUMMITS_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    {
        let lock = cache.lock().unwrap();
        if !lock.is_empty() {
            return lock.clone();
        }
    }

    let path = summits_csv_path(app_data_dir);
    let mut map = HashMap::new();

    if let Ok(contents) = std::fs::read_to_string(&path) {
        // Skip first line (header comment), second line is actual CSV header
        let mut lines = contents.lines();
        lines.next(); // "SOTA Summits List (Date=...)"
        lines.next(); // CSV header

        for line in lines {
            let fields: Vec<&str> = parse_csv_line(line);
            if fields.len() < 12 {
                continue;
            }

            let code = fields[0].to_string();
            let name = fields[3].to_string();
            let region = fields[2].to_string();
            let alt_m = fields[4].parse::<u32>().unwrap_or(0);
            let lon = fields[8].parse::<f64>().unwrap_or(0.0);
            let lat = fields[9].parse::<f64>().unwrap_or(0.0);
            let points = fields[10].parse::<u8>().unwrap_or(0);

            if lat != 0.0 && lon != 0.0 {
                map.insert(
                    code,
                    SummitInfo {
                        lat,
                        lon,
                        name,
                        alt_m,
                        points,
                        region,
                    },
                );
            }
        }

        println!("[PSKmap] SOTA: loaded {} summits from CSV", map.len());
    } else {
        println!("[PSKmap] SOTA: no summits CSV found");
    }

    {
        let mut lock = cache.lock().unwrap();
        *lock = map.clone();
    }

    map
}

/// Simple CSV line parser that handles quoted fields.
fn parse_csv_line(line: &str) -> Vec<&str> {
    let mut fields = Vec::new();
    let mut start = 0;
    let mut in_quotes = false;
    let bytes = line.as_bytes();

    for i in 0..bytes.len() {
        if bytes[i] == b'"' {
            in_quotes = !in_quotes;
        } else if bytes[i] == b',' && !in_quotes {
            let field = &line[start..i];
            fields.push(field.trim_matches('"'));
            start = i + 1;
        }
    }
    fields.push(line[start..].trim_matches('"'));
    fields
}

pub async fn fetch_sota_spots(app_data_dir: &PathBuf) -> Result<Vec<ExternalSpot>, String> {
    let summits = load_summits(app_data_dir);
    if summits.is_empty() {
        return Err("SOTA summits not downloaded yet".to_string());
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(SPOTS_URL)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("SOTA spots fetch failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("SOTA returned status {}", resp.status()));
    }

    let raw: Vec<SotaSpotRaw> = resp
        .json()
        .await
        .map_err(|e| format!("SOTA JSON parse error: {}", e))?;

    let spots = raw
        .into_iter()
        .filter_map(|s| {
            let callsign = s.activator_callsign.filter(|v| !v.is_empty())?;
            let assoc = s.association_code?;
            let code = s.summit_code?;
            let full_code = format!("{}/{}", assoc, code);

            let summit = summits.get(&full_code)?;

            let freq = s.frequency.and_then(|f| {
                let f = f.replace(',', ".");
                f.parse::<f64>().ok().map(|v| {
                    // SOTA frequencies can be in MHz (< 1000) or kHz
                    if v < 1000.0 { v * 1000.0 } else { v }
                })
            });

            let timestamp = s.timestamp.as_deref().and_then(|t| {
                chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%dT%H:%M:%S")
                    .ok()
                    .map(|dt| dt.and_utc().timestamp())
            });

            let ref_name = format!(
                "{} — {}m, {} pts ({})",
                summit.name, summit.alt_m, summit.points, summit.region
            );

            Some(ExternalSpot {
                source: "sota".to_string(),
                callsign,
                frequency: freq,
                mode: s.mode,
                reference: Some(full_code),
                reference_name: Some(ref_name),
                lat: Some(summit.lat),
                lon: Some(summit.lon),
                grid: None,
                timestamp,
                spotter: s.callsign,
                comments: s.comments,
            })
        })
        .collect::<Vec<_>>();

    println!("[PSKmap] SOTA: {} spots fetched", spots.len());
    Ok(spots)
}
