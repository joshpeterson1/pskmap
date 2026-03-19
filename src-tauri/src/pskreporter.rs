use crate::models::{grid_to_latlon, haversine_km, Spot, SpotQuery};
use quick_xml::events::Event;
use quick_xml::Reader;

/// Band name to frequency range in Hz.
pub fn band_to_frange(band: &str) -> Option<(u64, u64)> {
    match band {
        "160m" => Some((1_800_000, 2_000_000)),
        "80m" => Some((3_500_000, 4_000_000)),
        "60m" => Some((5_250_000, 5_450_000)),
        "40m" => Some((7_000_000, 7_300_000)),
        "30m" => Some((10_100_000, 10_150_000)),
        "20m" => Some((14_000_000, 14_350_000)),
        "17m" => Some((18_068_000, 18_168_000)),
        "15m" => Some((21_000_000, 21_450_000)),
        "12m" => Some((24_890_000, 24_990_000)),
        "10m" => Some((28_000_000, 29_700_000)),
        "6m" => Some((50_000_000, 54_000_000)),
        "2m" => Some((144_000_000, 148_000_000)),
        _ => None,
    }
}

pub async fn fetch_spots(query: &SpotQuery) -> Result<Vec<Spot>, String> {
    let mut url = format!(
        "https://retrieve.pskreporter.info/query?senderCallsign={}&rronly=1&noactive=1&appcontact=josh%40somber.dev",
        urlencoding::encode(&query.callsign)
    );

    if let Some(ref band) = query.band {
        if band != "All" {
            if let Some((lo, hi)) = band_to_frange(band) {
                url.push_str(&format!("&frange={}-{}", lo, hi));
            }
        }
    }

    if let Some(ref mode) = query.mode {
        if mode != "All" {
            url.push_str(&format!("&mode={}", urlencoding::encode(mode)));
        }
    }

    let seconds = query.time_range_seconds.abs();
    url.push_str(&format!("&flowStartSeconds=-{}", seconds));

    println!("[PSKmap] Requesting: {}", url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let resp = client
        .get(&url)
        .header("User-Agent", "PSKmap/0.1.0")
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = resp.status();
    println!("[PSKmap] Response status: {}", status);
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        println!("[PSKmap] Error body: {}", &body[..body.len().min(500)]);
        return Err(format!("PSKreporter returned status {}", status));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    println!("[PSKmap] Response length: {} bytes", body.len());
    if body.len() < 1000 {
        println!("[PSKmap] Body: {}", body);
    } else {
        println!("[PSKmap] Body (first 500): {}", &body[..500]);
    }

    parse_pskreporter_xml(&body)
}

fn parse_pskreporter_xml(xml: &str) -> Result<Vec<Spot>, String> {
    let mut reader = Reader::from_str(xml);
    let mut spots = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                if e.name().as_ref() == b"receptionReport" {
                    if let Some(spot) = parse_reception_report(e) {
                        spots.push(spot);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
    }

    Ok(spots)
}

fn parse_reception_report(e: &quick_xml::events::BytesStart) -> Option<Spot> {
    let mut sender_callsign = String::new();
    let mut receiver_callsign = String::new();
    let mut sender_locator: Option<String> = None;
    let mut receiver_locator: Option<String> = None;
    let mut frequency: u64 = 0;
    let mut mode = String::new();
    let mut snr: Option<i32> = None;
    let mut timestamp: i64 = 0;

    for attr in e.attributes().flatten() {
        let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
        let val = attr.unescape_value().unwrap_or_default();
        match key {
            "senderCallsign" => sender_callsign = val.to_string(),
            "receiverCallsign" => receiver_callsign = val.to_string(),
            "senderLocator" => {
                let v = val.to_string();
                if !v.is_empty() {
                    sender_locator = Some(v);
                }
            }
            "receiverLocator" => {
                let v = val.to_string();
                if !v.is_empty() {
                    receiver_locator = Some(v);
                }
            }
            "frequency" => frequency = val.parse().unwrap_or(0),
            "mode" => mode = val.to_string(),
            "sNR" => snr = val.parse().ok(),
            "flowStartSeconds" => timestamp = val.parse().unwrap_or(0),
            _ => {}
        }
    }

    if sender_callsign.is_empty() || receiver_callsign.is_empty() {
        return None;
    }

    let sender_pos = sender_locator.as_deref().and_then(grid_to_latlon);
    let receiver_pos = receiver_locator.as_deref().and_then(grid_to_latlon);

    let distance_km = match (sender_pos, receiver_pos) {
        (Some((lat1, lon1)), Some((lat2, lon2))) => Some(haversine_km(lat1, lon1, lat2, lon2)),
        _ => None,
    };

    Some(Spot {
        sender_callsign,
        receiver_callsign,
        sender_locator,
        receiver_locator,
        frequency,
        mode,
        snr,
        timestamp,
        sender_lat: sender_pos.map(|(lat, _)| lat),
        sender_lon: sender_pos.map(|(_, lon)| lon),
        receiver_lat: receiver_pos.map(|(lat, _)| lat),
        receiver_lon: receiver_pos.map(|(_, lon)| lon),
        distance_km,
    })
}
