use crate::models::{grid_to_latlon, haversine_km, Spot, SpotQuery};
use quick_xml::events::Event;
use quick_xml::Reader;

/// Shared HTTP client — reused across all requests to keep connections alive.
static HTTP_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

fn get_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .gzip(true)
            .build()
            .expect("Failed to build HTTP client")
    })
}

/// Fetch historical spots via the HTTP retrieve API (used for backfill on subscribe).
pub async fn fetch_spots_http(query: &SpotQuery) -> Result<Vec<Spot>, String> {
    let callsign = query.callsign.to_uppercase();

    let url = format!(
        "https://pskreporter.info/cgi-bin/pskquery5.pl?senderCallsign={}&noactive=1&nolocator=1&flowStartSeconds=-86400&appcontact=josh%40somber.dev",
        urlencoding::encode(&callsign),
    );

    println!("[PSKmap] HTTP backfill: {}", url);

    let client = get_client();
    let resp = client
        .get(&url)
        .header("User-Agent", "PSKmap/0.1.0")
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let _body = resp.text().await.unwrap_or_default();
        return Err(format!("PSKreporter returned status {}", status));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    println!("[PSKmap] HTTP response: {} bytes", body.len());

    // pskquery5.pl returns JSON error on rate limit instead of XML
    if body.trim_start().starts_with('{') {
        return Err("PSKreporter rate limit — backfill will retry on next subscribe".to_string());
    }

    parse_pskreporter_xml(&body)
}

fn parse_pskreporter_xml(xml: &str) -> Result<Vec<Spot>, String> {
    let mut reader = Reader::from_str(xml);
    let mut spots = Vec::new();
    let mut reception_count = 0u32;
    let mut receiver_count = 0u32;
    let mut other_count = 0u32;

    loop {
        match reader.read_event() {
            Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                let name = e.name();
                if name.as_ref() == b"receptionReport" {
                    reception_count += 1;
                    if let Some(spot) = parse_reception_report(e) {
                        spots.push(spot);
                    }
                } else if name.as_ref() == b"activeReceiver" {
                    receiver_count += 1;
                } else {
                    other_count += 1;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
    }

    println!(
        "[PSKmap] XML parsed: {} receptionReport, {} activeReceiver, {} other → {} spots",
        reception_count, receiver_count, other_count, spots.len()
    );

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
    let mut timestamp: Option<i64> = None;
    let mut receiver_dxcc: Option<String> = None;
    let mut receiver_dxcc_code: Option<String> = None;
    let mut sender_lotw_upload: Option<String> = None;

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
            "flowStartSeconds" => timestamp = val.parse().ok(),
            "receiverDXCC" => receiver_dxcc = Some(val.to_string()),
            "receiverDXCCCode" => receiver_dxcc_code = Some(val.to_string()),
            "senderLotwUpload" => sender_lotw_upload = Some(val.to_string()),
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
        receiver_dxcc,
        receiver_dxcc_code,
        sender_lotw_upload,
        decoder_software: None,
        antenna_information: None,
        rig_information: None,
        region: None,
    })
}
