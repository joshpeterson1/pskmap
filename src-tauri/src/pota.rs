use crate::external_spots::ExternalSpot;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Cached POTA programs: prefix → ISO country code (e.g. "K" → "us", "JA" → "jp")
static PROGRAMS_CACHE: std::sync::OnceLock<Mutex<Option<HashMap<String, String>>>> =
    std::sync::OnceLock::new();

/// Cached spot response with timestamp
static SPOTS_CACHE: std::sync::OnceLock<Mutex<Option<(Instant, Vec<ExternalSpot>)>>> =
    std::sync::OnceLock::new();

const SPOTS_CACHE_TTL: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PotaSpotRaw {
    activator: Option<String>,
    frequency: Option<String>,
    mode: Option<String>,
    reference: Option<String>,
    name: Option<String>,
    location_desc: Option<String>,
    spot_time: Option<String>,
    spotter: Option<String>,
    comments: Option<String>,
    grid4: Option<String>,
    grid6: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PotaProgram {
    program_prefix: Option<String>,
    #[serde(rename = "isocc")]
    iso_cc: Option<String>,
}

/// Fetch and cache POTA programs (prefix → ISO country code).
async fn get_programs() -> HashMap<String, String> {
    let cache = PROGRAMS_CACHE.get_or_init(|| Mutex::new(None));
    {
        let lock = cache.lock().unwrap();
        if let Some(ref map) = *lock {
            return map.clone();
        }
    }

    let map = fetch_programs_from_api().await.unwrap_or_default();
    {
        let mut lock = cache.lock().unwrap();
        *lock = Some(map.clone());
    }
    println!("[PSKmap] POTA programs cached: {} entries", map.len());
    map
}

async fn fetch_programs_from_api() -> Result<HashMap<String, String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.pota.app/programs")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("POTA programs fetch failed: {}", e))?;

    let programs: Vec<PotaProgram> = resp
        .json()
        .await
        .map_err(|e| format!("POTA programs parse error: {}", e))?;

    let mut map = HashMap::new();
    for p in programs {
        if let (Some(prefix), Some(iso)) = (p.program_prefix, p.iso_cc) {
            if !prefix.is_empty() && !iso.is_empty() {
                map.insert(prefix, iso.to_lowercase());
            }
        }
    }
    Ok(map)
}

/// Tauri command: get program prefix → ISO country code mapping (for flags).
#[tauri::command]
pub async fn get_pota_programs() -> Result<HashMap<String, String>, String> {
    Ok(get_programs().await)
}

pub async fn fetch_pota_spots() -> Result<Vec<ExternalSpot>, String> {
    // Check spot cache
    let cache = SPOTS_CACHE.get_or_init(|| Mutex::new(None));
    {
        let lock = cache.lock().unwrap();
        if let Some((ref ts, ref spots)) = *lock {
            if ts.elapsed() < SPOTS_CACHE_TTL {
                println!(
                    "[PSKmap] POTA: returning {} cached spots ({}s old)",
                    spots.len(),
                    ts.elapsed().as_secs()
                );
                return Ok(spots.clone());
            }
        }
    }

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.pota.app/spot/activator")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("POTA fetch failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("POTA returned status {}", resp.status()));
    }

    let raw: Vec<PotaSpotRaw> = resp
        .json()
        .await
        .map_err(|e| format!("POTA JSON parse error: {}", e))?;

    let spots = raw
        .into_iter()
        .filter_map(|s| {
            let callsign = s.activator.filter(|v| !v.is_empty())?;
            let freq = s.frequency.and_then(|f| f.parse::<f64>().ok());
            let grid = s.grid6.or(s.grid4);

            let ref_name = match (&s.name, &s.location_desc) {
                (Some(n), Some(l)) => Some(format!("{} ({})", n, l)),
                (Some(n), None) => Some(n.clone()),
                (None, Some(l)) => Some(l.clone()),
                _ => None,
            };

            let timestamp = s.spot_time.as_deref().and_then(|t| {
                chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%dT%H:%M:%S")
                    .ok()
                    .map(|dt| dt.and_utc().timestamp())
            });

            Some(ExternalSpot {
                source: "pota".to_string(),
                callsign,
                frequency: freq,
                mode: s.mode,
                reference: s.reference,
                reference_name: ref_name,
                lat: s.latitude,
                lon: s.longitude,
                grid,
                timestamp,
                spotter: s.spotter,
                comments: s.comments,
            })
        })
        .collect::<Vec<_>>();

    println!("[PSKmap] POTA: {} spots fetched (fresh)", spots.len());

    // Update cache
    {
        let mut lock = cache.lock().unwrap();
        *lock = Some((Instant::now(), spots.clone()));
    }

    Ok(spots)
}
